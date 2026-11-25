#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <time.h>
#include <Firebase_ESP_Client.h>
#include <addons/TokenHelper.h>
#include <addons/RTDBHelper.h>

#if __has_include("secrets.h")
  #include "secrets.h"
#else
  #define WIFI_SSID       "CAMBIAR_SSID"
  #define WIFI_PASSWORD   "CAMBIAR_PASSWORD"
  #define FIREBASE_HOST   "https://minefase-fc5f5-default-rtdb.firebaseio.com"
  #define FIREBASE_AUTH   "CAMBIAR_TOKEN"
#endif

// =======================================
// IDENTIFICADOR Y MODO DE PRUEBA
// =======================================
const char NODE_ID[24] = "device_9F4C2A7E1B08";
#define DISPOSITIVO_PATH "/dispositivos/device_9F4C2A7E1B08"
#define FIRMWARE_VERSION "SIM-1.0.0-ESPNOW"

// true  -> Fuerza envio exclusivo por ESP-NOW hacia el Gateway (ideal para probar GATEWAY_ISOLATED)
// false -> Modo hibrido (intenta Wi-Fi directo y usa ESP-NOW como respaldo)
const bool MODO_SOLO_ESPNOW = true;

// IMPORTANTE: Debe coincidir con el canal Wi-Fi en el que opera el Gateway
#define ESPNOW_DEFAULT_CHANNEL 11

#define BOTON_ESCENARIO        0   // Boton BOOT integrado en ESP32 para cambiar escenario simulado
#define LED_ESTADO_PIN         2   // LED azul integrado en la mayoria de placas ESP32

const char* NTP_SERVER = "pool.ntp.org";
const char* TZ_CHILE   = "CLT3CLST,M9.1.0/0,M4.1.0/0";

FirebaseData fbdoNode;
FirebaseData fbdoControl;
FirebaseAuth auth;
FirebaseConfig fbConfig;

// =======================================
// UMBRALES HOMOLOGADOS CON NODO FISICO
// =======================================
#define UMBRAL_MQ2_PRECAUCION   350
#define UMBRAL_MQ2_CRITICO      500
#define UMBRAL_PM25_PRECAUCION  55.0f
#define UMBRAL_PM25_CRITICO     150.0f

#define INTERVALO_TELEMETRIA_MS     2000UL
#define INTERVALO_HISTORIAL_MS      60000UL
#define INTERVALO_REINTENTO_WIFI_MS 60000UL

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
uint32_t paquetesEspNowFail = 0;
uint32_t secuenciaMsgLocal = 10000;

// =======================================
// ESTADO DE SIMULACION Y ALARMAS
// =======================================
enum EscenarioSimulado {
  ESCENARIO_NORMAL = 0,
  ESCENARIO_PRECAUCION = 1,
  ESCENARIO_CRITICO = 2
};

EscenarioSimulado escenarioActual = ESCENARIO_NORMAL;
bool silencioRemotoSuperAdmin = false;
bool alarmaRemotaWeb = false;
bool estadoAlarmaActiva = false;
String origenAlarmaActual = "NINGUNO";

unsigned long ultimoEnvio = 0;
unsigned long ultimoHistorial1m = 0;
unsigned long ultimoCheckControl = 0;
unsigned long ultimoIntentoWiFi = 0;

// =======================================
// UTILIDADES DE TIEMPO Y ESP-NOW
// =======================================
void iniciarHoraNTP() {
  configTzTime(TZ_CHILE, NTP_SERVER);
}

bool obtenerFechaHoraActual(char* buf, size_t len) {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo, 200)) return false;
  strftime(buf, len, "%Y-%m-%d %H:%M:%S", &timeinfo);
  return true;
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

void aplicarOrdenRemotaLocal(const String &cmd) {
  if (cmd == "APAGAR") {
    silencioRemotoSuperAdmin = true;
    alarmaRemotaWeb = false;
    estadoAlarmaActiva = false;
    origenAlarmaActual = "NINGUNO";
    digitalWrite(LED_ESTADO_PIN, LOW);
    Serial.println("[SIMULADO - SUPER ADMIN] Orden aplicada: APAGAR (silencio remoto activo).");
  } else if (cmd == "ENCENDER") {
    silencioRemotoSuperAdmin = false;
    alarmaRemotaWeb = true;
    estadoAlarmaActiva = true;
    origenAlarmaActual = "ACTIVACION_MANUAL_WEB";
    digitalWrite(LED_ESTADO_PIN, HIGH);
    Serial.println("[SIMULADO - SUPER ADMIN] Orden aplicada: ENCENDER.");
  }
}

void OnDataSent(const uint8_t *mac_addr, esp_now_send_status_t status) {
  if (status == ESP_NOW_SEND_SUCCESS) {
    paquetesEspNowTx++;
  } else {
    paquetesEspNowFail++;
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

void inicializarEspNow() {
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
  Serial.printf("[ESP-NOW] Listo en canal %d.\n", ESPNOW_DEFAULT_CHANNEL);
}

// =======================================
// GENERACION DE LECTURAS SIMULADAS
// =======================================
void generarLecturasSimuladas(int &co, float &pm25, float &temp, int &hum) {
  switch (escenarioActual) {
    case ESCENARIO_NORMAL:
      co   = random(120, 185);
      pm25 = random(120, 260) / 10.0f;
      temp = random(210, 245) / 10.0f;
      hum  = random(44, 56);
      break;

    case ESCENARIO_PRECAUCION:
      co   = random(360, 440);
      pm25 = random(600, 950) / 10.0f;
      temp = random(250, 285) / 10.0f;
      hum  = random(55, 68);
      break;

    case ESCENARIO_CRITICO:
      co   = random(620, 890);
      pm25 = random(1750, 2600) / 10.0f;
      temp = random(290, 340) / 10.0f;
      hum  = random(65, 82);
      break;
  }
}

const char* nombreEscenario(EscenarioSimulado esc) {
  switch (esc) {
    case ESCENARIO_NORMAL:     return "NORMAL";
    case ESCENARIO_PRECAUCION: return "PRECAUCION";
    case ESCENARIO_CRITICO:    return "CRITICO";
    default:                   return "DESCONOCIDO";
  }
}

void cambiarEscenario(EscenarioSimulado nuevo) {
  escenarioActual = nuevo;
  if (nuevo == ESCENARIO_NORMAL) {
    silencioRemotoSuperAdmin = false;
  }
  Serial.printf("[SIMULACION] Escenario cambiado a: %s\n", nombreEscenario(escenarioActual));
}

void revisarEntradasControlLocal() {
  if (digitalRead(BOTON_ESCENARIO) == LOW) {
    delay(50);
    if (digitalRead(BOTON_ESCENARIO) == LOW) {
      EscenarioSimulado siguiente = static_cast<EscenarioSimulado>((escenarioActual + 1) % 3);
      cambiarEscenario(siguiente);
      while (digitalRead(BOTON_ESCENARIO) == LOW) delay(10);
    }
  }

  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '1') cambiarEscenario(ESCENARIO_NORMAL);
    else if (c == '2') cambiarEscenario(ESCENARIO_PRECAUCION);
    else if (c == '3') cambiarEscenario(ESCENARIO_CRITICO);
    else if (c == '0') {
      silencioRemotoSuperAdmin = false;
      alarmaRemotaWeb = false;
      Serial.println("[SIMULACION] Silencio remoto reiniciado.");
    }
  }
}

// =======================================
// ENVIO A FIREBASE O ESP-NOW
// =======================================
bool subirDirectoAFirebase(uint32_t msgId, int co, float pm25, float t, int h, bool alarma, const char* origen, bool guardarHistorial) {
  if (MODO_SOLO_ESPNOW) return false;
  if (WiFi.status() != WL_CONNECTED || !Firebase.ready()) return false;

  String pathDisp = String(DISPOSITIVO_PATH);
  FirebaseJson jsonRaiz;
  jsonRaiz.set("CO", co);
  jsonRaiz.set("PM2_5", (int)pm25);
  jsonRaiz.set("temperatura", t);
  jsonRaiz.set("humedad", h);
  jsonRaiz.set("alarma_activa", alarma);
  jsonRaiz.set("origen_alarma", String(origen));
  jsonRaiz.set("msgId", (int)msgId);
  jsonRaiz.set("saltos_espnow", 0);
  jsonRaiz.set("via_puente", String(NODE_ID));
  jsonRaiz.set("simulado", true);
  jsonRaiz.set("last_update_server", (int)millis());

  if (!Firebase.RTDB.updateNode(&fbdoNode, pathDisp.c_str(), &jsonRaiz)) {
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
    jsonHist.set("simulado", true);

    char fechaHoraStr[24];
    if (obtenerFechaHoraActual(fechaHoraStr, sizeof(fechaHoraStr))) {
      jsonHist.set("fecha_hora", fechaHoraStr);
      time_t ahoraEpoch = time(nullptr);
      if (ahoraEpoch > 0) jsonHist.set("timestamp_unix", (int)ahoraEpoch);
    } else {
      jsonHist.set("fecha_hora", "SIN_SINCRONIZAR_NTP");
      jsonHist.set("uptime_ms", (int)millis());
    }

    Firebase.RTDB.push(&fbdoNode, pathHistorial.c_str(), &jsonHist);
  }
  return true;
}

void transmitirTelemetria(int co, float pm25, float t, int h, bool alarma, bool guardarHistorial) {
  uint32_t idLectura = ++secuenciaMsgLocal;

  if (!MODO_SOLO_ESPNOW && WiFi.status() == WL_CONNECTED && Firebase.ready()) {
    if (subirDirectoAFirebase(idLectura, co, pm25, t, h, alarma, origenAlarmaActual.c_str(), guardarHistorial)) {
      Serial.printf("[WIFI DIRECTO] %s | Escenario: %s | CO: %d | PM2.5: %.1f | MsgID: %lu\n",
                    NODE_ID, nombreEscenario(escenarioActual), co, pm25, (unsigned long)idLectura);
      return;
    }
  }

  struct_mesh_packet pkt = {};
  pkt.version = 1;
  pkt.tipo = 1;
  pkt.ttl = 5;
  pkt.saltos = 0;
  pkt.msgId = idLectura;
  strncpy(pkt.nodeId, NODE_ID, sizeof(pkt.nodeId) - 1);
  pkt.co = co;
  pkt.pm25 = pm25;
  pkt.temperatura = t;
  pkt.humedad = h;
  pkt.alarma_activa = alarma ? 1 : 0;
  pkt.guardar_historial = guardarHistorial ? 1 : 0;
  strncpy(pkt.origen_alarma, origenAlarmaActual.c_str(), sizeof(pkt.origen_alarma) - 1);

  registrarPaqueteVisto(pkt.msgId);
  esp_err_t res = esp_now_send(broadcastAddress, (const uint8_t *)&pkt, sizeof(pkt));

  Serial.printf("[ESP-NOW TX] Nodo: %s | Esc: %s | CO: %d | PM2.5: %.1f | Hist: %d | MsgID: %lu | Status: %s\n",
                NODE_ID, nombreEscenario(escenarioActual), co, pm25,
                guardarHistorial ? 1 : 0, (unsigned long)idLectura,
                (res == ESP_OK) ? "ENVIADO" : "ERROR");

  if (!MODO_SOLO_ESPNOW && WiFi.status() != WL_CONNECTED && (millis() - ultimoIntentoWiFi >= INTERVALO_REINTENTO_WIFI_MS)) {
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

void sincronizarOrdenDesdeWeb() {
  if (MODO_SOLO_ESPNOW) return;
  if (WiFi.status() != WL_CONNECTED || !Firebase.ready()) return;
  if (millis() - ultimoCheckControl < 2000UL) return;
  ultimoCheckControl = millis();

  String pathCmd = String(DISPOSITIVO_PATH) + "/comando_web";
  if (Firebase.RTDB.getString(&fbdoControl, pathCmd)) {
    String cmd = fbdoControl.stringData();
    if (cmd == "APAGAR" || cmd == "ENCENDER") {
      aplicarOrdenRemotaLocal(cmd);
      String ack = (cmd == "APAGAR") ? "PROCESADO_OFF" : "PROCESADO_ON";
      Firebase.RTDB.setString(&fbdoControl, pathCmd, ack);
    }
  }
}

// =======================================
// SETUP Y LOOP
// =======================================
void setup() {
  Serial.begin(115200);
  delay(500);

  pinMode(BOTON_ESCENARIO, INPUT_PULLUP);
  pinMode(LED_ESTADO_PIN, OUTPUT);
  digitalWrite(LED_ESTADO_PIN, LOW);

  randomSeed((uint32_t)esp_random());

  Serial.println("\n==============================================");
  Serial.printf("  NODO SIMULADO MINESAFE: %s\n", NODE_ID);
  Serial.printf("  Firmware: %s | Modo solo ESP-NOW: %s\n",
                FIRMWARE_VERSION, MODO_SOLO_ESPNOW ? "SI" : "NO");
  Serial.println("  Controles: Boton BOOT o Serial [1]=Normal [2]=Precaucion [3]=Critico [0]=Reset silencio");
  Serial.println("==============================================");

  WiFi.mode(WIFI_AP_STA);

  if (MODO_SOLO_ESPNOW) {
    WiFi.disconnect();
    fijarCanalEspNow(ESPNOW_DEFAULT_CHANNEL);
    inicializarEspNow();
  } else {
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    unsigned long t0 = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t0 < 6000) {
      delay(300);
    }
    inicializarEspNow();
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
}

void loop() {
  revisarEntradasControlLocal();
  procesarPaqueteMeshVecino();
  sincronizarOrdenDesdeWeb();

  if (millis() - ultimoEnvio >= INTERVALO_TELEMETRIA_MS) {
    ultimoEnvio = millis();

    int co = 0;
    float pm25 = 0.0f;
    float temp = 0.0f;
    int hum = 0;
    generarLecturasSimuladas(co, pm25, temp, hum);

    bool gasCritico = (co >= UMBRAL_MQ2_CRITICO);
    bool pmCritico  = (pm25 >= UMBRAL_PM25_CRITICO);

    if (silencioRemotoSuperAdmin && !alarmaRemotaWeb) {
      estadoAlarmaActiva = false;
      origenAlarmaActual = "NINGUNO";
    } else if (alarmaRemotaWeb) {
      estadoAlarmaActiva = true;
      origenAlarmaActual = "ACTIVACION_MANUAL_WEB";
    } else if (gasCritico || pmCritico) {
      estadoAlarmaActiva = true;
      origenAlarmaActual = "SIMULACION_NODO_SECUNDARIO";
    } else {
      estadoAlarmaActiva = false;
      origenAlarmaActual = "NINGUNO";
    }

    digitalWrite(LED_ESTADO_PIN, estadoAlarmaActiva ? HIGH : LOW);

    bool guardarHistorial1m = false;
    if (millis() - ultimoHistorial1m >= INTERVALO_HISTORIAL_MS) {
      ultimoHistorial1m = millis();
      guardarHistorial1m = true;
    }

    transmitirTelemetria(co, pm25, temp, hum, estadoAlarmaActiva, guardarHistorial1m);
  }

  delay(10);
}
