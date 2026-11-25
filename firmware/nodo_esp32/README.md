# Firmware Nodo Físico ESP32 — MineSafe (`device_38A839E81F84`)

Firmware del nodo minero físico ESP32 con telemetría híbrida (Wi-Fi + Firebase RTDB y respaldo en malla ESP-NOW), registro autónomo en `/dispositivos/device_38A839E81F84/historial` con hora NTP (`fecha_hora` y `timestamp_unix`), control remoto de alarma (`comando_web`), pantalla TFT, sirena I2S, baliza 12V y barra luminosa LED MAX7219.

## Seguridad de credenciales (Punto 12)

1. Copiar `secrets.example.h` como `secrets.h` dentro de esta misma carpeta (`firmware/nodo_esp32/secrets.h`).
2. Completar `WIFI_SSID`, `WIFI_PASSWORD`, `FIREBASE_HOST`, `FIREBASE_API_KEY`, `FIREBASE_DEVICE_EMAIL` y `FIREBASE_DEVICE_PASSWORD`.
3. `secrets.h` está bloqueado en `.gitignore` para nunca exponer contraseñas ni tokens en el repositorio.
4. Por defecto el firmware autentica contra **Firebase Authentication** (cuenta dedicada de dispositivo con ID Token rotativo), eliminando el uso de `legacy_token` (Database Secret). Si necesitas un despliegue gradual, puedes habilitar temporalmente `#define FIREBASE_USE_LEGACY_TOKEN` en `secrets.h` y revocar el token legado al finalizar la migración.

## Asignación de pines y periféricos (sin alteraciones)

| Periférico | GPIO | Descripción |
|---|---|---|
| MQ-2 (AO) | `34` | Lectura analógica 12 bits (ADC1) de gases combustibles y humos |
| Sharp GP2Y1010 (`Vo` / `LED`) | `35` / `33` | Densidad estimada PM2.5 en `µg/m³` |
| DHT11 (`S`) | `22` | Temperatura (`°C`) y humedad relativa (`%`) |
| Baliza 12V (MOSFET) | `26` | Activación de baliza luminosa |
| Audio I2S (`BCLK` / `LRC` / `DIN`) | `25` / `12` / `27` | Sirena sonora a `16 kHz` |
| Matriz LED MAX7219 (`CLK` / `DIN` / `CS`) | `19` / `21` / `17` | 4 módulos en cascada (`8x32`, `FC16_HW`) |
| Botón manual / Botón ventanas | `0` / `4` | Silencio/armado local y cambio de vista TFT |

## Umbrales locales de seguridad (intactos)

- **MQ-2 (ADC):** Precaución `350` / Crítico `500`
- **PM2.5 (`µg/m³`):** Precaución `55.0` / Crítico `150.0`
- **Control remoto desde web:** lee `/dispositivos/device_38A839E81F84/comando_web` (`"ENCENDER"` / `"APAGAR"`), responde `"PROCESADO_ON"` / `"PROCESADO_OFF"` y difunde la orden por ESP-NOW (`tipo = 2`, destino `"ALL"`).
