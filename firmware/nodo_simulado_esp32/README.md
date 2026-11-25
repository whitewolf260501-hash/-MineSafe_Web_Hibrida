# Firmware Nodo Simulado ESP32 — MineSafe (`device_9F4C2A7E1B08`)

Nodo secundario simulado para validar escenarios `NORMAL`, `PRECAUCION` y `CRITICO` sobre malla ESP-NOW hacia `gateway_ESP32_DEVKIT_V1` (`via_puente: "GATEWAY_ISOLATED"`), o en modo híbrido Wi-Fi/Firebase.

## Seguridad de credenciales (Punto 12)

- Se eliminó la URL fija de producción del bloque `#else` de `main.cpp`.
- Con `#define MODO_SOLO_ESPNOW_DEF 1` (por defecto), el nodo opera 100% por ESP-NOW sin necesitar Wi-Fi ni credenciales Firebase.
- Si cambias a modo híbrido (`#define MODO_SOLO_ESPNOW_DEF 0`), la compilación exige crear `secrets.h` a partir de `secrets.example.h` (ignorado en `.gitignore`) usando Firebase Auth Email/Password para cuenta dedicada IoT.
