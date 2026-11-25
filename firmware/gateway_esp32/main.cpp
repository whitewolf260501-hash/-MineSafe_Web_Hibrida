#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <Firebase_ESP_Client.h>
#include <addons/TokenHelper.h>
#include <addons/RTDBHelper.h>
#include <time.h>

// =======================================
// CREDENCIALES EXTERNAS (NO EMBEBIDAS)
// =======================================
// Copia "secrets.example.h" como "secrets.h" (ignorado por .gitignore).
#if __has_include("secrets.h")
  #include "secrets.h"
#else
  #error "Falta secrets.h en firmware/gateway_esp32/. Copia secrets.example.h a secrets.h con tus credenciales locales."
#endif

// =======================================
// IDENTIFICADOR DEL GATEWAY Y RED
// =======================================
const char GATEWAY_ID[32] = "gateway_ESP32_DEVKIT_V1";

#define ESPNOW_DEFAULT_CHANNEL 11

FirebaseData fbdoGateway;
FirebaseData fbdoControl;
FirebaseAuth auth;
FirebaseConfig fbConfig;

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

static_assert(sizeof(struct_mesh_packet) == 96, "El tamaño de struct_mesh_packet debe ser de 96 bytes exactos");

uint8_t broadcastAddress[] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
esp_now_peer_info_t peerInfo;

#define CACHE_MSG_SIZE 24
uint32_t historialMsgIds[CACHE_MSG_SIZE] = {0};
uint8_t indiceCacheMsg = 0;

#define RX_QUEUE_SIZE 8
struct_mesh_packet rxQueue[RX_QUEUE_SIZE];
volatile uint8_t rxHead = 0;
volatile uint8_t rxTail = 0;
volatile uint8_t rxCount = 0;

uint32_t paquetesRecibidos = 0;
uint32_t ultimoHistMsgIdSubido = 0;
unsigned long ultimoCheckComandos = 0;
char ultimoNodoVisto[24] = "device_38A839E81F84";

void iniciarFirebaseSeguro() {
  fbConfig.database_url = FIREBASE_HOST;

#ifdef FIREBASE_USE_LEGACY_TOKEN
  // Modo de transición deprecado: deshabilitar una vez activadas cuentas IoT en Firebase Auth
  fbConfig.signer.tokens.legacy_token = FIREBASE_AUTH;
#else
  // Autenticación segura con cuenta dedicada de gateway en Firebase Auth (ID Token rotativo)
  fbConfig.api_key = FIREBASE_API_KEY;
  auth.user.email = FIREBASE_DEVICE_EMAIL;
  auth.user.password = FIREBASE_DEVICE_PASSWORD;
  fbConfig.token_status_callback = tokenStatusCallback;
#endif

  fbdoGateway.setBSSLBufferSize(4096, 1024);
  fbdoControl.setBSSLBufferSize(4096, 1024);
  Firebase.begin(&fbConfig, &auth);
  Firebase.reconnectWiFi(true);
}

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
  registrarPaqueteVisto(pkt.msgId);

  if (rxCount < RX_QUEUE_SIZE) {
    memcpy((void*)&rxQueue[rxHead], &pkt, sizeof(pkt));
    rxHead = (rxHead + 1) % RX_QUEUE_SIZE;
    rxCount++;
  }
}

void verificarYReenviarComandoWeb(const char* idNodo) {
  if (WiFi.status() != WL_CONNECTED || !Firebase.ready()) return;

  String pathCmd = "/dispositivos/" + String(idNodo) + "/comando_web";
  if (Firebase.RTDB.getString(&fbdoControl, pathCmd)) {
    String cmd = fbdoControl.stringData();
    if (cmd == "APAGAR" || cmd == "ENCENDER") {
      String ack = (cmd == "APAGAR") ? "PROCESADO_OFF" : "PROCESADO_ON";
      Firebase.RTDB.setString(&fbdoControl, pathCmd, ack);

      struct_mesh_packet reply = {};
      reply.version = 1;
      reply.tipo = 2;
      reply.ttl = 5;
      reply.saltos = 0;
      reply.msgId = esp_random();
      strncpy(reply.nodeId, idNodo, sizeof(reply.nodeId) - 1);
      strncpy(reply.comando_web, cmd.c_str(), sizeof(reply.comando_web) - 1);

      registrarPaqueteVisto(reply.msgId);
      esp_now_send(broadcastAddress, (const uint8_t *)&reply, sizeof(reply));
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.printf("\n=== INICIANDO GATEWAY MINESAFE (%s) ===\n", GATEWAY_ID);

  WiFi.mode(WIFI_AP_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 10000) {
    delay(300);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[OK] Conectado a Internet! Canal Wi-Fi: %d\n", WiFi.channel());
    configTime(-10800, 0, "pool.ntp.org", "time.nist.gov");
  } else {
    Serial.printf("[AVISO] Sin Wi-Fi directo. Fijando radio en Canal %d para ESP-NOW.\n", ESPNOW_DEFAULT_CHANNEL);
    WiFi.disconnect();
    fijarCanalEspNow(ESPNOW_DEFAULT_CHANNEL);
  }

  if (esp_now_init() == ESP_OK) {
    esp_now_register_recv_cb(OnDataRecv);
    memset(&peerInfo, 0, sizeof(peerInfo));
    memcpy(peerInfo.peer_addr, broadcastAddress, 6);
    peerInfo.channel = 0;
    peerInfo.ifidx = WIFI_IF_STA;
    peerInfo.encrypt = false;
    esp_now_add_peer(&peerInfo);
    Serial.println("[ESP-NOW] Receptor de gateway listo.");
  }

  iniciarFirebaseSeguro();
}

void loop() {
  if (rxCount > 0) {
    struct_mesh_packet pkt;
    noInterrupts();
    memcpy(&pkt, (const void*)&rxQueue[rxTail], sizeof(pkt));
    rxTail = (rxTail + 1) % RX_QUEUE_SIZE;
    rxCount--;
    interrupts();

    pkt.saltos++;
    paquetesRecibidos++;
    strncpy(ultimoNodoVisto, pkt.nodeId, sizeof(ultimoNodoVisto) - 1);

    if (WiFi.status() == WL_CONNECTED) {
      if (Firebase.ready()) {
        struct tm timeinfo;
        char fechaStr[16] = "17/11/2026";
        char horaStr[16] = "00:00:00";
        if (getLocalTime(&timeinfo)) {
          strftime(fechaStr, sizeof(fechaStr), "%d/%m/%Y", &timeinfo);
          strftime(horaStr, sizeof(horaStr), "%H:%M:%S", &timeinfo);
        }

        String pathDisp = "/dispositivos/" + String(pkt.nodeId);
        FirebaseJson jsonRaiz;
        jsonRaiz.set("CO", (int)pkt.co);
        jsonRaiz.set("PM2_5", (int)pkt.pm25);
        jsonRaiz.set("temperatura", pkt.temperatura);
        jsonRaiz.set("humedad", (int)pkt.humedad);
        jsonRaiz.set("alarma_activa", pkt.alarma_activa != 0);
        jsonRaiz.set("origen_alarma", String(pkt.origen_alarma));
        jsonRaiz.set("msgId", (int)pkt.msgId);
        jsonRaiz.set("saltos_espnow", (int)pkt.saltos);
        jsonRaiz.set("via_puente", "GATEWAY_ISOLATED");
        jsonRaiz.set("gateway_id", String(GATEWAY_ID));
        jsonRaiz.set("fecha", String(fechaStr));
        jsonRaiz.set("hora", String(horaStr));
        jsonRaiz.set("last_update_server", (int)millis());

        if (Firebase.RTDB.updateNode(&fbdoGateway, pathDisp.c_str(), &jsonRaiz)) {
          Serial.printf("[FIREBASE OK] Gateway: %s | Nodo: %s | Gas: %ld | Hora: %s\n", GATEWAY_ID, pkt.nodeId, (long)pkt.co, horaStr);
        } else {
          Serial.printf("[FIREBASE ERROR] %s\n", fbdoGateway.errorReason().c_str());
        }

        if (pkt.guardar_historial && pkt.msgId != ultimoHistMsgIdSubido) {
          ultimoHistMsgIdSubido = pkt.msgId;
          String pathHistorial = pathDisp + "/historial";
          FirebaseJson jsonHist;
          jsonHist.set("co", (int)pkt.co);
          jsonHist.set("pm25", (int)pkt.pm25);
          jsonHist.set("temperatura", pkt.temperatura);
          jsonHist.set("humedad", (int)pkt.humedad);
          jsonHist.set("msgId", (int)pkt.msgId);
          jsonHist.set("via_puente", "GATEWAY_ISOLATED");
          jsonHist.set("gateway_id", String(GATEWAY_ID));
          jsonHist.set("fecha", String(fechaStr));
          jsonHist.set("hora", String(horaStr));

          if (Firebase.RTDB.push(&fbdoGateway, pathHistorial.c_str(), &jsonHist)) {
            Serial.printf("[HISTORIAL OK] Nodo: %s | Clave: %s\n", pkt.nodeId, fbdoGateway.pushName().c_str());
          } else {
            Serial.printf("[HISTORIAL ERROR] %s\n", fbdoGateway.errorReason().c_str());
          }
        }

        verificarYReenviarComandoWeb(pkt.nodeId);
      }
    }
  }

  if (millis() - ultimoCheckComandos >= 2000) {
    ultimoCheckComandos = millis();
    verificarYReenviarComandoWeb(ultimoNodoVisto);
  }

  delay(5);
}
