#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <time.h>
#include <DHTesp.h>
#include <TFT_eSPI.h>
#include "driver/i2s.h"
#include <Firebase_ESP_Client.h>
#include <addons/TokenHelper.h>
#include <addons/RTDBHelper.h>
#include <MD_MAX72XX.h>
#include <SPI.h>

// =======================================
// IDENTIFICADOR Y RED (FIREBASE & WIFI)
// =======================================
const char NODE_ID[24] = "device_38A839E81F84";
#define DISPOSITIVO_PATH "/dispositivos/device_38A839E81F84"

#define WIFI_SSID       "[REDACTED_WIFI_SSID]"
#define WIFI_PASSWORD   "[REDACTED_WIFI_PASSWORD]"
#define FIREBASE_HOST   "[REDACTED_FIREBASE_HOST]"
#define FIREBASE_AUTH   "[REDACTED_FIREBASE_AUTH]"

#define ESPNOW_DEFAULT_CHANNEL 11

const char* NTP_SERVER = "pool.ntp.org";
const char* TZ_CHILE   = "CLT3CLST,M9.1.0/0,M4.1.0/0";

FirebaseData fbdoNode; 
FirebaseData fbdoControl; 
FirebaseAuth auth;
FirebaseConfig fbConfig;

// =======================================
// ASIGNACION DE PINES (ESP32 Estandar)
// =======================================
#define MQ2_PIN        34   // AO del MQ-2 (ADC1)
#define PM25_VO_PIN    35   // Vo del Sharp GP2Y10 (ADC1)
#define PM25_LED_PIN   33   // Pulso LED Sharp GP2Y10

#define DHT_PIN        22   // Pin digital D22 (GPIO 22) -> Pin 'S' del DHT11
#define BALIZA_PIN     26   // Señal MOSFET baliza 12V
#define BOTON_MANUAL   0    // Botón BOOT integrado
#define BOTON_VENTANAS 4    // Botón adicional para cambiar ventanas (GPIO 4)

#define I2S_BCLK       25
#define I2S_LRC        12
#define I2S_DIN        27
#define SAMPLE_RATE    16000

// =======================================
// CONFIGURACIÓN DE LA MATRIZ LED MAX7219
// =======================================
#define HARDWARE_TYPE MD_MAX72XX::FC16_HW
#define MAX_DEVICES     4   // 4 módulos en cascada (8x32)
#define CLK_PIN        19   // CLK en GPIO 19
#define DATA_PIN       21   // DIN en GPIO 21
#define CS_PIN         17   // CS en GPIO 17

MD_MAX72XX mx = MD_MAX72XX(HARDWARE_TYPE, DATA_PIN, CLK_PIN, CS_PIN, MAX_DEVICES);

// =======================================
// UMBRALES Y CALIBRACION
// =======================================
#define UMBRAL_MQ2_PRECAUCION  350
#define UMBRAL_MQ2_CRITICO     500

const float PM25_VOLTAJE_BASE = 0.66;
#define UMBRAL_PM25_PRECAUCION 55.0
#define UMBRAL_PM25_CRITICO    150.0

#define INTERVALO_HISTORIAL_MS       60000UL 
#define INTERVALO_REINTENTO_WIFI_MS  60000UL 

// Colores UI estilo Dashboard (RGB565)
#define COLOR_BG          0x0862
#define COLOR_CARD        0x10C4
#define COLOR_BORDER      0x2187
#define COLOR_ACCENT_GRN  0x076B
#define COLOR_ACCENT_RED  0xF8A2
#define COLOR_ACCENT_BLU  0x041F
#define COLOR_TEXT_MUTED  0x94B2

DHTesp dht;
TFT_eSPI tft = TFT_eSPI();

// =======================================
// ESTRUCTURA UNIFICADA ESP-NOW (96 BYTES)
// =======================================
typedef struct __attribute__((packed)) struct_mesh_packet {
  uint8_t version;
  uint8_t tipo;
  uint8_t ttl;
  uint8_t saltos;
  uint32_t msgId;
  char nodeId[24];
  int32_t co;
  float pm25;
  float temperatura;
  int32_t humedad;
  uint8_t alarma_activa;
  uint8_t guardar_historial;
  uint8_t reservado[2];
  char origen_alarma[28];
  char comando_web[16];
} struct_mesh_packet;

static_assert(sizeof(struct_mesh_packet) == 96, "Tamano de struct_mesh_packet debe ser 96 bytes exactos");

uint8_t broadcastAddress[] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
esp_now_peer_info_t peerInfo;

#define CACHE_MSG_SIZE 24
uint32_t historialMsgIds[CACHE_MSG_SIZE] = {0};
uint8_t indiceCacheMsg = 0;

volatile bool paqueteVecinoPendiente = false;
struct_mesh_packet paqueteVecinoBuffer;
uint32_t paquetesEspNowTx = 0;
uint32_t secuenciaMsgLocal = 0;
unsigned long ultimoIntentoWiFi = 0;

volatile bool sistemaArmado = true; 
volatile bool panicoManual = false;
volatile bool estadoSirenaActiva = false;
bool estadoSirenaPrevio = false;

volatile int ultimoMQ2Medido = 0;
volatile float ultimoPM25Medido = 0.0;
volatile float ultimaTemp = 0.0;
volatile int ultimaHum = 0;

int ventanaActual = 0;
String origenAlarmaActual = "NINGUNO";

bool silencioRemotoSuperAdmin = false;
bool alarmaRemotaWeb = false;
unsigned long ultimoCheckControl = 0;

unsigned long ultimoRefresco = 0;
unsigned long ultimoHistorial1m = 0;
unsigned long ultimoMuestreoDHT = 0;
const unsigned long INTERVALO_DHT_MS = 2500UL;
float ultimaTempCache = 0.0f;
int ultimaHumCache = 0;
bool tieneCacheValidoDHT = false;
uint8_t fallosConsecutivosDHT = 0;

// =======================================
// HORA NTP
// =======================================
void iniciarHoraNTP() {
  configTzTime(TZ_CHILE, NTP_SERVER);
}

bool obtenerFechaHoraActual(char* buf, size_t len) {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo, 200)) {
    return false;
  }
  strftime(buf, len, "%Y-%m-%d %H:%M:%S", &timeinfo);
  return true;
}

// =======================================
// FUNCIONES ESP-NOW
// =======================================
bool paqueteYaVisto(uint32_t id) {
  for (int i = 0; i < CACHE_MSG_SIZE; i++) {
    if (historialMsgIds[i] == id) return true;
  }
  return false;
}

void registrarPaqueteVisto(uint32_t id) {
  historialMsgIds[indiceCacheMsg] = id;
  indiceCacheMsg = (indiceCacheMsg + 1) % CACHE_MSG_SIZE;
}

void fijarCanalEspNow(uint8_t canal) {
  esp_wifi_set_promiscuous(true);
  esp_wifi_set_channel(canal, WIFI_SECOND_CHAN_NONE);
  esp_wifi_set_promiscuous(false);
}

void aplicarOrdenRemotaLocal(const String &cmd) {
  if (cmd == "APAGAR") {
    silencioRemotoSuperAdmin = true;
    alarmaRemotaWeb = false;
    panicoManual = false;
    estadoSirenaActiva = false;
    digitalWrite(BALIZA_PIN, LOW);
    origenAlarmaActual = "NINGUNO";
    Serial.println("[SUPER ADMIN] Orden aplicada: APAGAR completo.");
  } else if (cmd == "ENCENDER") {
    silencioRemotoSuperAdmin = false;
    alarmaRemotaWeb = true;
    estadoSirenaActiva = true;
    origenAlarmaActual = "ACTIVACION_MANUAL_WEB";
    Serial.println("[SUPER ADMIN] Orden aplicada: ENCENDER forzado.");
  }
}

void difundirComandoPorEspNow(const char* cmdStr, const char* targetNode = "ALL") {
  struct_mesh_packet pkt = {};
  pkt.version = 1;
  pkt.tipo = 2; 
  pkt.ttl = 5;
  pkt.saltos = 0;
  pkt.msgId = ++secuenciaMsgLocal;
  strncpy(pkt.nodeId, targetNode, sizeof(pkt.nodeId) - 1);
  strncpy(pkt.comando_web, cmdStr, sizeof(pkt.comando_web) - 1);

  registrarPaqueteVisto(pkt.msgId);
  esp_now_send(broadcastAddress, (const uint8_t *)&pkt, sizeof(pkt));
}

void OnDataSent(const uint8_t *mac_addr, esp_now_send_status_t status) {
  if (status == ESP_NOW_SEND_SUCCESS) {
    paquetesEspNowTx++;
  }
}

#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 0, 0)
void OnDataRecv(const esp_now_recv_info *info, const uint8_t *incomingData, int len) {
#else
void OnDataRecv(const uint8_t *mac, const uint8_t *incomingData, int len) {
#endif
  if (len != sizeof(struct_mesh_packet)) return;

  struct_mesh_packet pkt;
  memcpy(&pkt, incomingData, sizeof(pkt));

  if (pkt.version != 1) return;
  if (paqueteYaVisto(pkt.msgId)) return;
  if (pkt.tipo == 1 && strncmp(pkt.nodeId, NODE_ID, sizeof(NODE_ID)) == 0) return;

  registrarPaqueteVisto(pkt.msgId);
  memcpy((void*)&paqueteVecinoBuffer, &pkt, sizeof(pkt));
  paqueteVecinoPendiente = true;
}

void inicializarEspNowMesh() {
  if (esp_now_init() != ESP_OK) {
    Serial.println("[ESP-NOW] Error al inicializar.");
    return;
  }
  esp_now_register_send_cb(OnDataSent);
  esp_now_register_recv_cb(OnDataRecv);

  memset(&peerInfo, 0, sizeof(peerInfo));
  memcpy(peerInfo.peer_addr, broadcastAddress, 6);
  peerInfo.channel = 0; 
  peerInfo.ifidx = WIFI_IF_STA;
  peerInfo.encrypt = false;

  if (!esp_now_is_peer_exist(broadcastAddress)) {
    esp_now_add_peer(&peerInfo);
  }
}

// =======================================
// SENSORES Y AUDIO
// =======================================
float leerVoltajePM25() {
  digitalWrite(PM25_LED_PIN, LOW);
  delayMicroseconds(280);
  int rawADC = analogRead(PM25_VO_PIN);
  delayMicroseconds(40);
  digitalWrite(PM25_LED_PIN, HIGH);
  delayMicroseconds(9680);
  return (rawADC / 4095.0) * 3.3;
}

float calcularDensidadPM25() {
  float suma = 0.0;
  for (int i = 0; i < 5; i++) {
    suma += leerVoltajePM25();
    delay(2);
  }
  float vProm = suma / 5.0;
  return (vProm > PM25_VOLTAJE_BASE) ? (vProm - PM25_VOLTAJE_BASE) * 588.2 : 0.0;
}

void leerDHT11NoBloqueante() {
  unsigned long ahora = millis();
  unsigned long periodoMinimo = (unsigned long)dht.getMinimumSamplingPeriod() + 500UL;
  unsigned long intervaloEfectivo = (INTERVALO_DHT_MS > periodoMinimo) ? INTERVALO_DHT_MS : periodoMinimo;

  if ((unsigned long)(ahora - ultimoMuestreoDHT) < intervaloEfectivo) return;
  ultimoMuestreoDHT = ahora;

  TempAndHumidity lectura = dht.getTempAndHumidity();
  if (!isnan(lectura.temperature) && !isnan(lectura.humidity)) {
    ultimaTemp = lectura.temperature;
    ultimaHum = (int)round(lectura.humidity);
  }
}

void sincronizarOrdenDesdeWeb() {
  if (WiFi.status() != WL_CONNECTED || !Firebase.ready()) return;
  if (millis() - ultimoCheckControl < 2000) return;
  ultimoCheckControl = millis();

  String pathCmd = String(DISPOSITIVO_PATH) + "/comando_web";
  if (Firebase.RTDB.getString(&fbdoControl, pathCmd)) {
    String cmd = fbdoControl.stringData();
    if (cmd == "APAGAR" || cmd == "ENCENDER") {
      aplicarOrdenRemotaLocal(cmd);
      String ack = (cmd == "APAGAR") ? "PROCESADO_OFF" : "PROCESADO_ON";
      Firebase.RTDB.setString(&fbdoControl, pathCmd, ack);
      difundirComandoPorEspNow(cmd.c_str(), "ALL");
    }
  }
}

void iniciarI2S() {
  i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX),
    .sample_rate = SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
    .channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT,
    .communication_format = I2S_COMM_FORMAT_STAND_I2S,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 6,
    .dma_buf_len = 64,
    .use_apll = false,
    .tx_desc_auto_clear = true
  };
  i2s_pin_config_t pin_config = {
    .bck_io_num = I2S_BCLK,
    .ws_io_num = I2S_LRC,
    .data_out_num = I2S_DIN,
    .data_in_num = I2S_PIN_NO_CHANGE
  };
  i2s_driver_install(I2S_NUM_0, &i2s_config, 0, NULL);
  i2s_set_pin(I2S_NUM_0, &pin_config);
}

void sonarSirena(int frecuencia, int duracionMs) {
  int numMuestras = (SAMPLE_RATE * duracionMs) / 1000;
  int16_t buffer[64];
  size_t bytesEscritos;
  float paso = (2.0 * PI * frecuencia) / SAMPLE_RATE;
  float fase = 0;
  int muestrasRestantes = numMuestras;

  while (muestrasRestantes > 0) {
    int lote = (muestrasRestantes > 32) ? 32 : muestrasRestantes;
    for (int i = 0; i < lote; i++) {
      int16_t m = (int16_t)(sin(fase) * 32767.0);
      buffer[i * 2] = m;
      buffer[i * 2 + 1] = m;
      fase += paso;
      if (fase >= 2.0 * PI) fase -= 2.0 * PI;
    }
    i2s_write(I2S_NUM_0, buffer, lote * 4, &bytesEscritos, portMAX_DELAY);
    muestrasRestantes -= lote;
  }
}

void ejecutarPatronSirena() {
  for (int f = 900; f <= 1900; f += 150) sonarSirena(f, 6);
  for (int f = 1900; f >= 900; f -= 150) sonarSirena(f, 6);
}

// =======================================
// CONTROL DE LA MATRIZ LED (BARRA LUMINOSA)
// =======================================
void actualizarMatrizAlarma(bool alarmaActiva, int valorGas, float valorPm25) {
  static unsigned long ultimoParpadeo = 0;
  static bool estadoParpadeo = false;

  if (alarmaActiva || valorGas >= UMBRAL_MQ2_CRITICO || valorPm25 >= UMBRAL_PM25_CRITICO) {
    if (millis() - ultimoParpadeo >= 300) {
      ultimoParpadeo = millis();
      estadoParpadeo = !estadoParpadeo;
    }
    
    if (estadoParpadeo) {
      mx.control(MD_MAX72XX::INTENSITY, 15);
      for (uint8_t i = 0; i < MAX_DEVICES; i++) {
        for (int col = 0; col < 8; col++) {
          mx.setColumn(i, col, 0xFF);
        }
      }
    } else {
      mx.control(MD_MAX72XX::INTENSITY, 0);
      mx.clear();
    }
  }
  else if ((valorGas >= UMBRAL_MQ2_PRECAUCION && valorGas < UMBRAL_MQ2_CRITICO) || 
           (valorPm25 >= UMBRAL_PM25_PRECAUCION && valorPm25 < UMBRAL_PM25_CRITICO)) {
    mx.control(MD_MAX72XX::INTENSITY, 10);
    for (uint8_t i = 0; i < MAX_DEVICES; i++) {
      for (int col = 0; col < 8; col++) {
        mx.setColumn(i, col, 0xFF);
      }
    }
  }
  else {
    mx.control(MD_MAX72XX::INTENSITY, 0);
    mx.clear();
  }
}

void renderizarVentana(int ventana, int co, float pm25, float t, int h, bool sirena) {
  tft.fillScreen(COLOR_BG);

  bool wifiOk = (WiFi.status() == WL_CONNECTED);
  tft.fillCircle(15, 12, 4, wifiOk ? COLOR_ACCENT_GRN : TFT_ORANGE);
  tft.setTextDatum(ML_DATUM);
  tft.setTextColor(TFT_WHITE, COLOR_BG);
  tft.drawString(wifiOk ? "Cloud OK" : "ESP-NOW Activo", 26, 12, 2);

  tft.setTextDatum(MC_DATUM);
  tft.setTextColor(COLOR_TEXT_MUTED, COLOR_BG);
  tft.drawString("NODO MINERO", 160, 12, 2);

  tft.setTextDatum(MR_DATUM);
  tft.setTextColor(sistemaArmado ? COLOR_ACCENT_GRN : COLOR_TEXT_MUTED, COLOR_BG);
  tft.drawString(sistemaArmado ? "ARMADO" : "DESARMADO", 310, 12, 2);

  int cardW = 96, cardH = 68, y1 = 78;

  // PM2.5
  tft.fillRoundRect(8, y1, cardW, cardH, 6, COLOR_CARD);
  tft.drawRoundRect(8, y1, cardW, cardH, 6, COLOR_BORDER);
  tft.setTextColor(COLOR_TEXT_MUTED, COLOR_CARD);
  tft.setTextDatum(TL_DATUM);
  tft.drawString("PM2.5", 14, y1 + 6, 2);
  tft.setTextColor(TFT_WHITE, COLOR_CARD);
  tft.drawString(String((int)pm25), 14, y1 + 24, 4);
  tft.setTextColor(COLOR_TEXT_MUTED, COLOR_CARD);
  tft.drawString("ug/m3", 56, y1 + 32, 1);
  uint16_t cPM = (pm25 >= UMBRAL_PM25_CRITICO) ? COLOR_ACCENT_RED : ((pm25 >= UMBRAL_PM25_PRECAUCION) ? TFT_ORANGE : COLOR_ACCENT_GRN);
  tft.fillRoundRect(14, y1 + 48, 84, 14, 4, cPM);
  tft.setTextColor(TFT_BLACK, cPM);
  tft.setTextDatum(MC_DATUM);
  tft.drawString((pm25 >= UMBRAL_PM25_CRITICO) ? "CRITICO" : "Normal", 56, y1 + 55, 1);

  // Temp.
  int x2 = 112;
  tft.fillRoundRect(x2, y1, cardW, cardH, 6, COLOR_CARD);
  tft.drawRoundRect(x2, y1, cardW, cardH, 6, COLOR_BORDER);
  tft.setTextColor(COLOR_TEXT_MUTED, COLOR_CARD);
  tft.setTextDatum(TL_DATUM);
  tft.drawString("Temp.", x2 + 6, y1 + 6, 2);
  tft.setTextColor(TFT_WHITE, COLOR_CARD);
  tft.drawString(String(t, 1), x2 + 6, y1 + 24, 4);
  tft.setTextColor(COLOR_TEXT_MUTED, COLOR_CARD);
  tft.drawString("C", x2 + 68, y1 + 32, 1);
  tft.fillRoundRect(x2 + 6, y1 + 48, 84, 14, 4, COLOR_ACCENT_GRN);
  tft.setTextColor(TFT_BLACK, COLOR_ACCENT_GRN);
  tft.setTextDatum(MC_DATUM);
  tft.drawString("Normal", x2 + 48, y1 + 55, 1);

  // Humedad
  int x3 = 216;
  tft.fillRoundRect(x3, y1, cardW, cardH, 6, COLOR_CARD);
  tft.drawRoundRect(x3, y1, cardW, cardH, 6, COLOR_BORDER);
  tft.setTextColor(COLOR_TEXT_MUTED, COLOR_CARD);
  tft.setTextDatum(TL_DATUM);
  tft.drawString("Humedad", x3 + 6, y1 + 6, 2);
  tft.setTextColor(TFT_WHITE, COLOR_CARD);
  tft.drawString(String(h), x3 + 6, y1 + 24, 4);
  tft.setTextColor(COLOR_TEXT_MUTED, COLOR_CARD);
  tft.drawString("%", x3 + 52, y1 + 32, 1);
  tft.fillRoundRect(x3 + 6, y1 + 48, 84, 14, 4, COLOR_ACCENT_GRN);
  tft.setTextColor(TFT_BLACK, COLOR_ACCENT_GRN);
  tft.setTextDatum(MC_DATUM);
  tft.drawString("Normal", x3 + 48, y1 + 55, 1);

  // Gas y Actuadores
  int y2 = 152;
  int wGas = 146;
  tft.fillRoundRect(8, y2, wGas, cardH, 6, COLOR_CARD);
  tft.drawRoundRect(8, y2, wGas, cardH, 6, COLOR_BORDER);
  tft.setTextColor(COLOR_TEXT_MUTED, COLOR_CARD);
  tft.setTextDatum(TL_DATUM);
  tft.drawString("Gas CO (MQ-2)", 14, y2 + 6, 2);
  tft.setTextColor(TFT_WHITE, COLOR_CARD);
  tft.drawString(String(co), 14, y2 + 24, 4);
  tft.setTextColor(COLOR_TEXT_MUTED, COLOR_CARD);
  tft.drawString("ADC", 85, y2 + 32, 1);
  uint16_t cCO = (co >= UMBRAL_MQ2_CRITICO) ? COLOR_ACCENT_RED : ((co >= UMBRAL_MQ2_PRECAUCION) ? TFT_ORANGE : COLOR_ACCENT_GRN);
  tft.fillRoundRect(14, y2 + 48, 134, 14, 4, cCO);
  tft.setTextColor(TFT_BLACK, cCO);
  tft.setTextDatum(MC_DATUM);
  tft.drawString((co >= UMBRAL_MQ2_CRITICO) ? "GAS CRITICO" : "Normal", 81, y2 + 55, 1);

  int wAct = 150, xAct = 162;
  tft.fillRoundRect(xAct, y2, wAct, cardH, 6, COLOR_CARD);
  tft.drawRoundRect(xAct, y2, wAct, cardH, 6, COLOR_BORDER);
  tft.setTextColor(COLOR_TEXT_MUTED, COLOR_CARD);
  tft.setTextDatum(TL_DATUM);
  tft.drawString("Actuadores", xAct + 10, y2 + 6, 2);

  tft.fillCircle(xAct + 16, y2 + 30, 4, sirena ? COLOR_ACCENT_RED : TFT_DARKGREY);
  tft.setTextColor(TFT_WHITE, COLOR_CARD);
  tft.drawString(sirena ? "Baliza: ACTIVA" : "Baliza: Apagada", xAct + 26, y2 + 23, 2);

  tft.fillCircle(xAct + 16, y2 + 52, 4, sirena ? COLOR_ACCENT_RED : TFT_DARKGREY);
  tft.drawString(sirena ? "Sirena: SONANDO" : "Sirena: Inactiva", xAct + 26, y2 + 45, 2);

  // Barra Inferior
  tft.fillRect(0, 224, 320, 16, 0x0000);
  tft.fillRoundRect(6, 224, 70, 15, 3, COLOR_ACCENT_BLU);
  tft.setTextColor(TFT_WHITE, COLOR_ACCENT_BLU);
  tft.setTextDatum(MC_DATUM);
  tft.drawString("Estado", 41, 231, 1);

  tft.setTextColor(COLOR_TEXT_MUTED, 0x0000);
  tft.drawString(wifiOk ? "Monitoreo Cloud" : "Transmitiendo a cercano", 200, 231, 1);
}

// =======================================
// SUBIDA A FIREBASE
// =======================================
bool subirDatosAFirebase(const char* idDispositivo, uint32_t msgId, int co, float pm25, float t, int h, bool sirena, const char* origen, bool guardarHistorial, uint8_t saltos) {
  if (WiFi.status() != WL_CONNECTED || !Firebase.ready()) return false;

  String pathDisp = "/dispositivos/" + String(idDispositivo);
  FirebaseJson jsonRaiz;
  jsonRaiz.set("CO", co);
  jsonRaiz.set("PM2_5", (int)pm25);
  jsonRaiz.set("temperatura", t);
  jsonRaiz.set("humedad", h);
  jsonRaiz.set("alarma_activa", sirena);
  jsonRaiz.set("origen_alarma", String(origen));
  jsonRaiz.set("msgId", (int)msgId);
  jsonRaiz.set("saltos_espnow", (int)saltos);
  jsonRaiz.set("via_puente", String(NODE_ID));
  jsonRaiz.set("last_update_server", (int)millis());

  bool exito = Firebase.RTDB.updateNode(&fbdoNode, pathDisp.c_str(), &jsonRaiz);
  if (exito) {
    Serial.printf("[FIREBASE DIRECTO] Actualizado en tiempo real para %s (MsgID: %lu)\n", idDispositivo, (unsigned long)msgId);
  } else {
    Serial.printf("[FIREBASE ERROR] %s\n", fbdoNode.errorReason().c_str());
    return false;
  }

  if (guardarHistorial) {
    String pathHistorial = pathDisp + "/historial";
    FirebaseJson jsonHist;
    jsonHist.set("co", co);
    jsonHist.set("pm25", (int)pm25);
    jsonHist.set("temperatura", t);
    jsonHist.set("humedad", h);
    jsonHist.set("msgId", (int)msgId);

    char fechaHoraStr[24];
    if (obtenerFechaHoraActual(fechaHoraStr, sizeof(fechaHoraStr))) {
      jsonHist.set("fecha_hora", fechaHoraStr);
      time_t ahoraEpoch = time(nullptr);
      if (ahoraEpoch > 0) {
        jsonHist.set("timestamp_unix", (int)ahoraEpoch);
      }
    } else {
      jsonHist.set("fecha_hora", "SIN_SINCRONIZAR_NTP");
      jsonHist.set("uptime_ms", (int)millis());
    }

    Serial.printf("[HISTORIAL] Intentando guardar en %s (MsgID: %lu)...\n", pathHistorial.c_str(), (unsigned long)msgId);
    if (Firebase.RTDB.push(&fbdoNode, pathHistorial.c_str(), &jsonHist)) {
      Serial.printf("[HISTORIAL OK] Guardado en %s (Clave: %s)\n", pathHistorial.c_str(), fbdoNode.pushName().c_str());
    } else {
      Serial.printf("[HISTORIAL ERROR] %s\n", fbdoNode.errorReason().c_str());
    }
  }
  return true;
}

// =======================================
// TRANSMISION HIBRIDA
// =======================================
void registrarYTransmitir(int co, float pm25, float t, int h, bool sirena, bool flancoAlarma, bool guardarHistorial) {
  uint32_t idLecturaActual = ++secuenciaMsgLocal;

  if (WiFi.status() == WL_CONNECTED && Firebase.ready()) {
    if (subirDatosAFirebase(NODE_ID, idLecturaActual, co, pm25, t, h, sirena, origenAlarmaActual.c_str(), guardarHistorial, 0)) {
      return;
    }
  }

  struct_mesh_packet pkt = {};
  pkt.version = 1;
  pkt.tipo = 1; 
  pkt.ttl = 5;
  pkt.saltos = 0;
  pkt.msgId = idLecturaActual;
  strncpy(pkt.nodeId, NODE_ID, sizeof(pkt.nodeId) - 1);
  pkt.co = co;
  pkt.pm25 = pm25;
  pkt.temperatura = t;
  pkt.humedad = h;
  pkt.alarma_activa = sirena ? 1 : 0;
  pkt.guardar_historial = guardarHistorial ? 1 : 0;
  strncpy(pkt.origen_alarma, origenAlarmaActual.c_str(), sizeof(pkt.origen_alarma) - 1);

  registrarPaqueteVisto(pkt.msgId);
  esp_now_send(broadcastAddress, (const uint8_t *)&pkt, sizeof(pkt));

  if (WiFi.status() != WL_CONNECTED && (millis() - ultimoIntentoWiFi >= INTERVALO_REINTENTO_WIFI_MS)) {
    ultimoIntentoWiFi = millis();
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  }
}

void procesarPaqueteMeshVecino() {
  if (!paqueteVecinoPendiente) return;
  struct_mesh_packet pkt;
  noInterrupts();
  memcpy(&pkt, (const void*)&paqueteVecinoBuffer, sizeof(pkt));
  paqueteVecinoPendiente = false;
  interrupts();

  if (pkt.tipo == 2) {
    if (strcmp(pkt.nodeId, "ALL") == 0 || strcmp(pkt.nodeId, NODE_ID) == 0) {
      aplicarOrdenRemotaLocal(String(pkt.comando_web));
    }
  }
}

// =======================================
// SETUP
// =======================================
void setup() {
  Serial.begin(115200);
  delay(500);

  pinMode(BALIZA_PIN, OUTPUT);
  digitalWrite(BALIZA_PIN, LOW);
  pinMode(BOTON_MANUAL, INPUT_PULLUP);
  pinMode(BOTON_VENTANAS, INPUT_PULLUP);

  analogSetAttenuation(ADC_11db);
  pinMode(MQ2_PIN, INPUT);
  pinMode(PM25_VO_PIN, INPUT);
  pinMode(PM25_LED_PIN, OUTPUT);
  digitalWrite(PM25_LED_PIN, HIGH);

  tft.init();
  tft.setRotation(1);
  tft.fillScreen(COLOR_BG);

  mx.begin();
  mx.control(MD_MAX72XX::INTENSITY, 0);
  mx.clear();

  iniciarI2S();

  pinMode(DHT_PIN, INPUT_PULLUP);
  dht.setup(DHT_PIN, DHTesp::DHT11);
  ultimoMuestreoDHT = millis() - INTERVALO_DHT_MS;

  WiFi.mode(WIFI_AP_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 6000) {
    delay(300);
  }

  inicializarEspNowMesh();

  if (WiFi.status() == WL_CONNECTED) {
    iniciarHoraNTP();
    fbConfig.database_url = FIREBASE_HOST;
    fbConfig.signer.tokens.legacy_token = FIREBASE_AUTH;
    fbdoNode.setBSSLBufferSize(4096, 1024);
    Firebase.begin(&fbConfig, &auth);
    Firebase.reconnectWiFi(true);
  } else {
    fijarCanalEspNow(ESPNOW_DEFAULT_CHANNEL);
  }
}

// =======================================
// LOOP PRINCIPAL
// =======================================
void loop() {
  leerDHT11NoBloqueante();
  procesarPaqueteMeshVecino();
  sincronizarOrdenDesdeWeb();

  actualizarMatrizAlarma(estadoSirenaActiva, ultimoMQ2Medido, ultimoPM25Medido);

  if (digitalRead(BOTON_MANUAL) == LOW) {
    delay(50);
    if (digitalRead(BOTON_MANUAL) == LOW) {
      if (estadoSirenaActiva) {
        panicoManual = false;
        estadoSirenaActiva = false;
        digitalWrite(BALIZA_PIN, LOW);
      } else {
        sistemaArmado = !sistemaArmado;
      }
      while (digitalRead(BOTON_MANUAL) == LOW) delay(10);
    }
  }

  if (digitalRead(BOTON_VENTANAS) == LOW) {
    delay(50);
    if (digitalRead(BOTON_VENTANAS) == LOW) {
      ventanaActual = (ventanaActual + 1) % 3;
      renderizarVentana(ventanaActual, ultimoMQ2Medido, ultimoPM25Medido, ultimaTemp, ultimaHum, estadoSirenaActiva);
      while (digitalRead(BOTON_VENTANAS) == LOW) delay(10);
    }
  }

  if (millis() - ultimoRefresco >= 2000) {
    ultimoRefresco = millis();

    ultimoMQ2Medido = analogRead(MQ2_PIN);
    ultimoPM25Medido = calcularDensidadPM25();

    bool gasCritico = (ultimoMQ2Medido >= UMBRAL_MQ2_CRITICO);
    bool pmCritico  = (ultimoPM25Medido >= UMBRAL_PM25_CRITICO);

    if (silencioRemotoSuperAdmin && !panicoManual && !alarmaRemotaWeb) {
      estadoSirenaActiva = false;
      origenAlarmaActual = "NINGUNO";
    } else if (alarmaRemotaWeb || panicoManual) {
      estadoSirenaActiva = true;
      origenAlarmaActual = panicoManual ? "ACTIVACION_MANUAL_USUARIO" : "ACTIVACION_MANUAL_WEB";
    } else if (sistemaArmado && (gasCritico || pmCritico)) {
      estadoSirenaActiva = true;
      origenAlarmaActual = "CAUSA_NATURAL_SENSORES";
    } else {
      estadoSirenaActiva = false;
      origenAlarmaActual = "NINGUNO";
    }

    bool flancoSubidaAlarma = (estadoSirenaActiva && !estadoSirenaPrevio);
    estadoSirenaPrevio = estadoSirenaActiva;

    if (flancoSubidaAlarma) {
      ventanaActual = 0;
    }

    digitalWrite(BALIZA_PIN, estadoSirenaActiva ? HIGH : LOW);

    bool guardarHistorial1m = false;
    if (millis() - ultimoHistorial1m >= INTERVALO_HISTORIAL_MS) {
      ultimoHistorial1m = millis();
      guardarHistorial1m = true;
    }

    registrarYTransmitir(ultimoMQ2Medido, ultimoPM25Medido, ultimaTemp, ultimaHum, estadoSirenaActiva, flancoSubidaAlarma, guardarHistorial1m);
    renderizarVentana(ventanaActual, ultimoMQ2Medido, ultimoPM25Medido, ultimaTemp, ultimaHum, estadoSirenaActiva);
  }

  if (estadoSirenaActiva) {
    ejecutarPatronSirena();
  }

  delay(10);
}
