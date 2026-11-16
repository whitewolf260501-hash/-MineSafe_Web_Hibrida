#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <DHTesp.h>
#include <TFT_eSPI.h>
#include "driver/i2s.h"
#include <Firebase_ESP_Client.h>
#include <addons/TokenHelper.h>
#include <addons/RTDBHelper.h>

// =======================================
// IDENTIFICADOR Y RED (FIREBASE & WIFI)
// =======================================
const char NODE_ID[24] = "device_38A839E81F84"; 
#define DISPOSITIVO_PATH "/dispositivos/device_38A839E81F84"

#define WIFI_SSID       "manuel"
#define WIFI_PASSWORD   "12345678"
#define FIREBASE_HOST   "https://minefase-fc5f5-default-rtdb.firebaseio.com"
#define FIREBASE_AUTH   "iLLXEkcrKt6bLyXf6uQCKlbYvLAd04gl4HnWPFGM"

FirebaseData fbdo;
FirebaseData fbdoControl; // Canal independiente para comandos remotos del Super Admin
FirebaseAuth auth;
FirebaseConfig fbConfig;

// =======================================
// ASIGNACIÓN DE PINES (ESP32 Estándar)
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
// UMBRALES Y CALIBRACIÓN
// =======================================
#define UMBRAL_MQ2_PRECAUCION  350
#define UMBRAL_MQ2_CRITICO     500

const float PM25_VOLTAJE_BASE = 0.66;
#define UMBRAL_PM25_PRECAUCION 55.0
#define UMBRAL_PM25_CRITICO    150.0

#define INTERVALO_HISTORIAL_MS  30000UL

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

// Variables globales de control y estado
volatile bool sistemaArmado = false;
volatile bool panicoManual = false;
volatile bool estadoSirenaActiva = false;
bool estadoSirenaPrevio = false;

volatile int ultimoMQ2Medido = 0;
volatile float ultimoPM25Medido = 0.0;
volatile float ultimaTemp = 0.0;
volatile int ultimaHum = 0;

int ventanaActual = 0;
String origenAlarmaActual = "NINGUNO";

// Variables de control Super Admin (Web Override)
bool silencioRemotoSuperAdmin = false;
bool alarmaRemotaWeb = false;
unsigned long ultimoCheckControl = 0;

// Variables de control y caché para el DHT11 (D22)
unsigned long ultimoRefresco = 0;
unsigned long ultimoHistorial30s = 0;
unsigned long ultimoMuestreoDHT = 0;
const unsigned long INTERVALO_DHT_MS = 2500UL; // > 2000 ms obligatorios para el DHT11
float ultimaTempCache = 0.0f;
int ultimaHumCache = 0;
bool tieneCacheValidoDHT = false;
uint8_t fallosConsecutivosDHT = 0;

// =======================================
// MUESTREO SHARP GP2Y10
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

// =======================================
// LECTURA NO BLOQUEANTE DHT11 CON CACHÉ
// =======================================
void leerDHT11NoBloqueante() {
  unsigned long ahora = millis();
  unsigned long periodoMinimo = (unsigned long)dht.getMinimumSamplingPeriod() + 500UL;
  unsigned long intervaloEfectivo = (INTERVALO_DHT_MS > periodoMinimo) ? INTERVALO_DHT_MS : periodoMinimo;

  if ((unsigned long)(ahora - ultimoMuestreoDHT) < intervaloEfectivo) {
    return;
  }
  ultimoMuestreoDHT = ahora;

  TempAndHumidity lectura = dht.getTempAndHumidity();
  DHTesp::DHT_ERROR_t estado = dht.getStatus();

  bool sinErrorProtocolo = (estado == DHTesp::ERROR_NONE);
  bool valoresNumericosValidos = !isnan(lectura.temperature) &&
                                 !isnan(lectura.humidity) &&
                                 (lectura.temperature >= -10.0f && lectura.temperature <= 60.0f) &&
                                 (lectura.humidity >= 5.0f && lectura.humidity <= 100.0f);

  if (sinErrorProtocolo && valoresNumericosValidos) {
    ultimaTempCache = lectura.temperature;
    ultimaHumCache = (int)round(lectura.humidity);
    tieneCacheValidoDHT = true;
    fallosConsecutivosDHT = 0;

    ultimaTemp = ultimaTempCache;
    ultimaHum = ultimaHumCache;
  } else {
    fallosConsecutivosDHT++;

    if (tieneCacheValidoDHT) {
      ultimaTemp = ultimaTempCache;
      ultimaHum = ultimaHumCache;
    }

    if (fallosConsecutivosDHT >= 5) {
      pinMode(DHT_PIN, INPUT_PULLUP);
      fallosConsecutivosDHT = 0;
    }
  }
}

// =======================================
// SINCRONIZACIÓN DE ÓRDENES WEB (SUPER ADMIN)
// =======================================
void sincronizarOrdenDesdeWeb() {
  if (WiFi.status() != WL_CONNECTED || !Firebase.ready()) return;
  if (millis() - ultimoCheckControl < 2000) return;
  ultimoCheckControl = millis();

  String pathCmd = String(DISPOSITIVO_PATH) + "/comando_web";
  if (Firebase.RTDB.getString(&fbdoControl, pathCmd)) {
    String cmd = fbdoControl.stringData();

    if (cmd == "APAGAR") {
      silencioRemotoSuperAdmin = true;
      alarmaRemotaWeb = false;
      panicoManual = false;
      estadoSirenaActiva = false;
      digitalWrite(BALIZA_PIN, LOW);
      origenAlarmaActual = "NINGUNO";

      Firebase.RTDB.setString(&fbdoControl, pathCmd, "PROCESADO_OFF");
      Serial.println("🔒 [WEB OVERLORD] Orden recibida: APAGAR completo por Super Admin.");
    } else if (cmd == "ENCENDER") {
      silencioRemotoSuperAdmin = false;
      alarmaRemotaWeb = true;
      estadoSirenaActiva = true;
      origenAlarmaActual = "ACTIVACION_MANUAL_WEB";

      Firebase.RTDB.setString(&fbdoControl, pathCmd, "PROCESADO_ON");
      Serial.println("🚨 [WEB OVERLORD] Orden recibida: ENCENDER forzado por Web.");
    }
  }
}

// =======================================
// AUDIO DIGITAL I2S
// =======================================
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
// RENDERIZADO DE INTERFAZ (ST7789)
// =======================================
void renderizarVentana(int ventana, int co, float pm25, float t, int h, bool sirena) {
  tft.fillScreen(COLOR_BG);

  // Barra Superior
  bool wifiOk = (WiFi.status() == WL_CONNECTED);
  tft.fillCircle(15, 12, 4, wifiOk ? COLOR_ACCENT_GRN : TFT_ORANGE); 
  tft.setTextDatum(ML_DATUM);
  tft.setTextColor(TFT_WHITE, COLOR_BG);
  tft.drawString(wifiOk ? "Cloud OK" : "Reconectando", 26, 12, 2);

  tft.setTextDatum(MC_DATUM);
  tft.setTextColor(COLOR_TEXT_MUTED, COLOR_BG);
  tft.drawString("NODO MINERO", 160, 12, 2);

  tft.setTextDatum(MR_DATUM);
  tft.setTextColor(sistemaArmado ? COLOR_ACCENT_GRN : COLOR_TEXT_MUTED, COLOR_BG);
  tft.drawString(sistemaArmado ? "ARMADO" : "DESARMADO", 310, 12, 2);

  // Tarjetas de Visualización
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

  // Gas y Actuadores (Fila 2)
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
  tft.drawString("Monitoreo Minero IoT", 200, 231, 1);
}

// =======================================
// TRANSMISIÓN A FIREBASE
// =======================================
void registrarYTransmitir(int co, float pm25, float t, int h, bool sirena, bool flancoAlarma, bool guardarHistorial) {
  if (WiFi.status() == WL_CONNECTED && Firebase.ready()) {
    FirebaseJson jsonRaiz;
    jsonRaiz.set("CO", co);
    jsonRaiz.set("PM2_5", (int)pm25);
    jsonRaiz.set("temperatura", t);
    jsonRaiz.set("humedad", h);
    jsonRaiz.set("alarma_activa", sirena);
    jsonRaiz.set("origen_alarma", origenAlarmaActual);
    jsonRaiz.set("last_update_server", (int)millis());

    if (Firebase.RTDB.updateNode(&fbdo, DISPOSITIVO_PATH, &jsonRaiz)) {
      Serial.println("☁️ [FIREBASE] Datos actualizados correctamente");
    } else {
      Serial.printf("❌ [FIREBASE ERROR] %s\n", fbdo.errorReason().c_str());
    }

    if (guardarHistorial) {
      String pathHistorial = String(DISPOSITIVO_PATH) + "/historial";
      FirebaseJson jsonHist;
      jsonHist.set("co", co);
      jsonHist.set("pm25", (int)pm25);
      jsonHist.set("temperatura", t);
      jsonHist.set("humedad", h);
      Firebase.RTDB.push(&fbdo, pathHistorial.c_str(), &jsonHist);
    }
  } else {
    if (WiFi.status() != WL_CONNECTED) {
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
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

  iniciarI2S();

  pinMode(DHT_PIN, INPUT_PULLUP);
  dht.setup(DHT_PIN, DHTesp::DHT11);
  ultimoMuestreoDHT = millis() - INTERVALO_DHT_MS;

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("Conectando al Hotspot '%s'", WIFI_SSID);

  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 12000) {
    delay(300);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ Conectado a Internet exitosamente!");
  } else {
    Serial.println("\n⚠️ No se pudo conectar al Hotspot. Revise que esté encendido.");
  }

  fbConfig.database_url = FIREBASE_HOST;
  fbConfig.signer.tokens.legacy_token = FIREBASE_AUTH;
  
  Firebase.begin(&fbConfig, &auth);
  Firebase.reconnectWiFi(true);

  Serial.println("✅ Sistema e interfaz iniciados correctamente (DHT11 en D22 + Super Admin Sync)");
}

// =======================================
// LOOP PRINCIPAL
// =======================================
void loop() {
  // 0. Lectura no bloqueante del DHT11
  leerDHT11NoBloqueante();

  // 0.1. Sincronizar órdenes remotas desde la web del Super Admin
  sincronizarOrdenDesdeWeb();

  // 1. Botón físico BOOT: Silencia alarma o alterna Armado/Desarmado
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

  // 2. Botón GPIO 4: Cambiar ventana de la pantalla ST7789
  if (digitalRead(BOTON_VENTANAS) == LOW) {
    delay(50);
    if (digitalRead(BOTON_VENTANAS) == LOW) {
      ventanaActual = (ventanaActual + 1) % 3;
      renderizarVentana(ventanaActual, ultimoMQ2Medido, ultimoPM25Medido, ultimaTemp, ultimaHum, estadoSirenaActiva);
      while (digitalRead(BOTON_VENTANAS) == LOW) delay(10);
    }
  }

  // 3. Evaluación de sensores y envío a Firebase cada 2 segundos
  if (millis() - ultimoRefresco >= 2000) {
    ultimoRefresco = millis();

    ultimoMQ2Medido = analogRead(MQ2_PIN);
    ultimoPM25Medido = calcularDensidadPM25();

    bool gasCritico = (ultimoMQ2Medido >= UMBRAL_MQ2_CRITICO);
    bool pmCritico  = (ultimoPM25Medido >= UMBRAL_PM25_CRITICO);

    // Lógica de alarma con prioridad estricta para el Super Admin
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

    bool guardarHistorial30s = false;
    if (millis() - ultimoHistorial30s >= INTERVALO_HISTORIAL_MS) {
      ultimoHistorial30s = millis();
      guardarHistorial30s = true;
    }

    registrarYTransmitir(ultimoMQ2Medido, ultimoPM25Medido, ultimaTemp, ultimaHum, estadoSirenaActiva, flancoSubidaAlarma, guardarHistorial30s);
    renderizarVentana(ventanaActual, ultimoMQ2Medido, ultimoPM25Medido, ultimaTemp, ultimaHum, estadoSirenaActiva);
  }

  if (estadoSirenaActiva) {
    ejecutarPatronSirena();
  }

  delay(10);
}