#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <esp_now.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7735.h>
#include <SPI.h>
#include <ArduinoJson.h>

// ============================================================================
// MINESAFE - DISPOSITIVO GATEWAY (ESP32-C3 SuperMini)
// Hardware: ESP32-C3 SuperMini + Batería LiPo 5000mAh (105568) +
//           Placa Expansión Pines + Pantalla LCD TFT 1.8" (128x160 SPI)
// Funciones: Recepción ESP-NOW -> Subida Firebase RTDB -> Sincronización
//            de comando_web / silencioRemotoSuperAdmin y umbrales hacia Nodos
// ============================================================================

// --- CREDENCIALES WI-FI Y FIREBASE REALTIME DATABASE ---
const char* WIFI_SSID     = "TU_WIFI_SSID";
const char* WIFI_PASSWORD = "TU_WIFI_PASSWORD";

// URL de tu Firebase Realtime Database (sin barra al final) y Legacy Token
const char* FIREBASE_HOST = "https://minesafe-iot-default-rtdb.firebaseio.com";
const char* FIREBASE_AUTH = "TU_FIREBASE_LEGACY_TOKEN";

// --- MAPA DE PINES SPI PARA PANTALLA TFT 1.8" EN ESP32-C3 SUPERMINI ---
#define TFT_CS    7
#define TFT_RST   3
#define TFT_DC    1
#define TFT_SCLK  4
#define TFT_MOSI  6

// Pin opcional para lectura de voltaje de batería LiPo 5000mAh (divisor resistivo)
#define BAT_ADC_PIN 0

Adafruit_ST7735 tft = Adafruit_ST7735(TFT_CS, TFT_DC, TFT_MOSI, TFT_SCLK, TFT_RST);

// --- ESTRUCTURAS DE DATOS ESP-NOW (Idénticas al Nodo Sensor) ---
typedef struct struct_telemetry {
  uint8_t nodeId;
  uint32_t msgId;
  float temperatura;
  float humedad;
  int gases_adc;
  int gases_ppm;
  int pm25_adc;
  float pm25_ugm3;
  bool estadoAlarma;
  bool silencioAplicado;
} struct_telemetry;

typedef struct struct_command {
  bool silencioRemotoSuperAdmin;
  int umbralGasPPM;
  float umbralTempC;
  float umbralPM25;
} struct_command;

struct_telemetry lastPacket;
struct_command outboundCmd = {false, 400, 35.0, 150.0};

uint8_t broadcastNodeAddr[] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
esp_now_peer_info_t peerInfo;

volatile bool nuevoPaqueteDisponible = false;
unsigned long ultimoPaqueteMillis = 0;
unsigned long ultimaSincronizacionFirebase = 0;
const unsigned long intervaloFirebase = 3000; // Sincronizar con Firebase cada 3 s

uint32_t paquetesRecibidos = 0;

// --- CALLBACK DE RECEPCIÓN ESP-NOW ---
#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 0, 0)
void OnDataRecv(const esp_now_recv_info *info, const uint8_t *incomingData, int len) {
#else
void OnDataRecv(const uint8_t *mac, const uint8_t *incomingData, int len) {
#endif
  if (len == sizeof(lastPacket)) {
    memcpy((void*)&lastPacket, incomingData, sizeof(lastPacket));
    paquetesRecibidos++;
    ultimoPaqueteMillis = millis();
    nuevoPaqueteDisponible = true;
  }
}

int estimarPorcentajeBateria() {
  // Retorno estimado o lectura del divisor en GPIO 0 para la LiPo 105568 (5000mAh)
  return 98;
}

void actualizarPantallaGateway() {
  tft.fillScreen(ST77XX_BLACK);

  // Cabecera
  tft.fillRect(0, 0, 128, 18, ST77XX_BLUE);
  tft.setCursor(4, 5);
  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(1);
  tft.print("GATEWAY ESP32-C3");

  // Estado de red y batería 5000mAh
  tft.setCursor(4, 24);
  tft.setTextColor(WiFi.status() == WL_CONNECTED ? ST77XX_GREEN : ST77XX_YELLOW);
  tft.printf("WiFi: %s | Bat:%d%%", WiFi.status() == WL_CONNECTED ? "OK" : "LOCAL", estimarPorcentajeBateria());

  tft.setCursor(4, 38);
  tft.setTextColor(ST77XX_CYAN);
  tft.printf("Pkts RX: %lu (Nodo %d)", paquetesRecibidos, lastPacket.nodeId);

  // Datos del último paquete
  tft.setTextColor(ST77XX_WHITE);
  tft.setCursor(4, 54);
  tft.printf("Temp:  %.1f C", lastPacket.temperatura);
  tft.setCursor(4, 68);
  tft.printf("Hum:   %.1f %%", lastPacket.humedad);
  tft.setCursor(4, 82);
  tft.printf("Gas:   %d ppm", lastPacket.gases_ppm);
  tft.setCursor(4, 96);
  tft.printf("PM2.5: %.0f ug/m3", lastPacket.pm25_ugm3);

  tft.setCursor(4, 112);
  tft.setTextColor(ST77XX_YELLOW);
  tft.printf("Silencio Web: %s", outboundCmd.silencioRemotoSuperAdmin ? "ACTIVO" : "OFF");

  // Pie de estado
  if (lastPacket.estadoAlarma) {
    tft.fillRect(0, 132, 128, 28, ST77XX_RED);
    tft.setCursor(10, 142);
    tft.setTextColor(ST77XX_WHITE);
    tft.print("ALERTA EN NODO MINA");
  } else {
    tft.fillRect(0, 132, 128, 28, ST77XX_GREEN);
    tft.setCursor(14, 142);
    tft.setTextColor(ST77XX_BLACK);
    tft.print("ENLACE ACTIVO OK");
  }
}

void enviarTelemetriaFirebase() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;

  String url = String(FIREBASE_HOST) + "/nodos/nodo_" + String(lastPacket.nodeId) + ".json?auth=" + String(FIREBASE_AUTH);
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");

  JsonDocument doc;
  doc["nodeId"] = lastPacket.nodeId;
  doc["msgId"] = lastPacket.msgId;
  doc["temperatura"] = lastPacket.temperatura;
  doc["humedad"] = lastPacket.humedad;
  doc["gases_ppm"] = lastPacket.gases_ppm;
  doc["gases_adc"] = lastPacket.gases_adc;
  doc["pm25_ugm3"] = lastPacket.pm25_ugm3;
  doc["estadoAlarma"] = lastPacket.estadoAlarma;
  doc["silencioAplicado"] = lastPacket.silencioAplicado;
  doc["bateriaGateway"] = estimarPorcentajeBateria();
  doc["timestamp_ms"] = millis();

  String payload;
  serializeJson(doc, payload);

  int httpResponseCode = http.PUT(payload);
  if (httpResponseCode > 0) {
    Serial.printf("[FIREBASE PUT] Código HTTP: %d\n", httpResponseCode);
  } else {
    Serial.printf("[FIREBASE ERROR] %s\n", http.errorToString(httpResponseCode).c_str());
  }
  http.end();
}

void leerComandosWebFirebase() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;

  String url = String(FIREBASE_HOST) + "/comando_web.json?auth=" + String(FIREBASE_AUTH);
  http.begin(client, url);

  int httpCode = http.GET();
  if (httpCode == HTTP_CODE_OK) {
    String respuesta = http.getString();
    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, respuesta);
    if (!error) {
      bool nuevoSilencio = doc["silencioRemotoSuperAdmin"] | false;
      int nuevoUmbralGas = doc["umbralGasPPM"] | 400;
      float nuevoUmbralTemp = doc["umbralTempC"] | 35.0;
      float nuevoUmbralPM25 = doc["umbralPM25"] | 150.0;

      outboundCmd.silencioRemotoSuperAdmin = nuevoSilencio;
      outboundCmd.umbralGasPPM = nuevoUmbralGas;
      outboundCmd.umbralTempC = nuevoUmbralTemp;
      outboundCmd.umbralPM25 = nuevoUmbralPM25;

      // Retransmitir comando/umbrales hacia los nodos por ESP-NOW
      esp_now_send(broadcastNodeAddr, (uint8_t*)&outboundCmd, sizeof(outboundCmd));
    }
  }
  http.end();
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== INICIANDO GATEWAY MINESAFE (ESP32-C3 SUPERMINI) ===");

  tft.initR(INITR_BLACKTAB);
  tft.setRotation(0);
  tft.fillScreen(ST77XX_BLACK);
  tft.setCursor(6, 20);
  tft.setTextColor(ST77XX_YELLOW);
  tft.println("Iniciando Gateway...");

  // Iniciar WiFi en modo Station + AP para compatibilidad simultánea con ESP-NOW
  WiFi.mode(WIFI_AP_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("MAC del Gateway ESP32-C3: ");
  Serial.println(WiFi.macAddress());

  int intentos = 0;
  while (WiFi.status() != WL_CONNECTED && intentos < 15) {
    delay(400);
    Serial.print(".");
    intentos++;
  }
  Serial.println();

  if (esp_now_init() != ESP_OK) {
    Serial.println("Error inicializando ESP-NOW en Gateway");
    return;
  }

  esp_now_register_recv_cb(OnDataRecv);

  memcpy(peerInfo.peer_addr, broadcastNodeAddr, 6);
  peerInfo.channel = 0;
  peerInfo.encrypt = false;
  esp_now_add_peer(&peerInfo);

  actualizarPantallaGateway();
}

void loop() {
  unsigned long ahora = millis();

  if (nuevoPaqueteDisponible) {
    nuevoPaqueteDisponible = false;
    Serial.printf("[ESP-NOW RX] Nodo #%d | Msg #%lu | Temp: %.1fC | Gas: %d ppm | Alarma: %d\n",
                  lastPacket.nodeId, lastPacket.msgId, lastPacket.temperatura,
                  lastPacket.gases_ppm, lastPacket.estadoAlarma);
    actualizarPantallaGateway();
    enviarTelemetriaFirebase();
  }

  if (ahora - ultimaSincronizacionFirebase >= intervaloFirebase) {
    ultimaSincronizacionFirebase = ahora;
    leerComandosWebFirebase();
  }
}
