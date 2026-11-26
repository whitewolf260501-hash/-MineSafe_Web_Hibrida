# Firmware Nodo ESP32 — MineSafe

Firmware utilizado en el prototipo de nodo minero ESP32 con telemetría híbrida (Wi-Fi + Firebase RTDB y respaldo en malla ESP-NOW), control remoto de alarma (`comando_web`), pantalla TFT y barra luminosa LED MAX7219.

## Requisitos de compilación

Completar con las versiones exactas instaladas en el IDE donde se compila el prototipo:

- **Placa:** `[completar, ej. ESP32 Dev Module / DOIT ESP32 DEVKIT V1]`
- **Core Arduino-ESP32:** `[completar versión]`
- **Firebase_ESP_Client (Mobizt):** `[completar versión]`
- **DHTesp:** `[completar versión]`
- **TFT_eSPI:** `[completar versión]`
- **MD_MAX72XX:** `[completar versión]`
- **Configuración de pines del display (`User_Setup.h`):** `[completar o adjuntar archivo]`
- **Estado:** versión usada en el prototipo de la defensa.

## Configuración de credenciales locales

1. Copiar `secrets.example.h` como `secrets.h` dentro de esta misma carpeta (`firmware/nodo_esp32/secrets.h`).
2. Completar `WIFI_SSID`, `WIFI_PASSWORD`, `FIREBASE_HOST` y `FIREBASE_AUTH`.
3. `secrets.h` está listado en `.gitignore` para no exponer contraseñas ni tokens en el repositorio.

## Asignación de pines y periféricos

| Periférico | GPIO | Descripción |
|---|---|---|
| MQ-2 (AO) | `34` | Lectura analógica 12 bits (ADC1) de gases combustibles y humos |
| Sharp GP2Y1010 (`Vo` / `LED`) | `35` / `33` | Densidad estimada PM2.5 en `µg/m³` |
| DHT11 (`S`) | `22` | Temperatura (`°C`) y humedad relativa (`%`) |
| Baliza 12V (MOSFET) | `26` | Activación de baliza luminosa |
| Audio I2S (`BCLK` / `LRC` / `DIN`) | `25` / `12` / `27` | Sirena sonora a `16 kHz` |
| Matriz LED MAX7219 (`CLK` / `DIN` / `CS`) | `19` / `21` / `17` | 4 módulos en cascada (`8x32`, `FC16_HW`) |
| Botón manual / Botón ventanas | `0` / `4` | Silencio/armado local y cambio de vista TFT |

## Umbrales configurados (alineados con la plataforma web)

- **MQ-2 (ADC):** Precaución `350` / Crítico `500` *(Preventivo web: `200`)*
- **PM2.5 (`µg/m³`):** Precaución `55` / Crítico `150` *(Preventivo web: `30`)*
- **Control remoto desde web:** lee `/dispositivos/device_38A839E81F84/comando_web` (`"ENCENDER"` / `"APAGAR"`), responde `"PROCESADO_ON"` / `"PROCESADO_OFF"` y difunde la orden por ESP-NOW (`tipo = 2`, destino `"ALL"`).
