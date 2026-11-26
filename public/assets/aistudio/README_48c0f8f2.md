# ESP32 Simulador MineSafe (`device_9F4C2A7E1B08`)

Proyecto PlatformIO listo para compilar y cargar en un ESP32 (`esp32dev`) sin sensores externos.

## Estructura incluida
- `platformio.ini`: Configuracion de placa `esp32dev`, `espressif32 @ 6.12.0` y libreria `Firebase_ESP_Client @ 4.4.17`.
- `src/main.cpp`: Firmware completo del nodo simulado `device_9F4C2A7E1B08`.
- `include/secrets.example.h`: Plantilla de credenciales (solo necesaria si cambias `MODO_SOLO_ESPNOW = false`).
- `.gitignore`: Excluye `.pio` e `include/secrets.h`.

## Pasos para cargar (PlatformIO / VS Code)
1. Extrae la carpeta `ESP32_Simulador_MineSafe` y abrela en VS Code con PlatformIO.
2. Verifica en `src/main.cpp` que `#define ESPNOW_DEFAULT_CHANNEL 11` coincida con el canal Wi-Fi en el que este conectado tu Gateway (`gateway_ESP32_DEVKIT_V1`).
3. Conecta el ESP32 por USB y ejecuta:
   ```powershell
   pio run --target upload
   ```
4. Abre el monitor serie a `115200` baudios:
   ```powershell
   pio device monitor -b 115200
   ```

## Controles durante la prueba
- **Boton BOOT (`GPIO 0`)**: Alterna entre `NORMAL` -> `PRECAUCION` -> `CRITICO`.
- **Monitor Serie (`115200`)**:
  - `1`: Escenario `NORMAL`
  - `2`: Escenario `PRECAUCION`
  - `3`: Escenario `CRITICO` (simula alerta critica y enciende el LED integrado en `GPIO 2`)
  - `0`: Reinicia `silencioRemotoSuperAdmin`
