# Firmware Gateway ESP32 — MineSafe (`gateway_ESP32_DEVKIT_V1`)

Puente ESP-NOW a Wi-Fi/Firebase RTDB que recibe paquetes `struct_mesh_packet` (96 bytes) de nodos sin cobertura Wi-Fi directa (`device_38A839E81F84`, `device_9F4C2A7E1B08`, etc.) y los publica en `/dispositivos/{nodeId}` con `via_puente: "GATEWAY_ISOLATED"`, además de reenviar `/dispositivos/{nodeId}/historial` y comandos remotos `/comando_web`.

## Configuración segura de credenciales (Punto 12)

1. Copiar `secrets.example.h` como `secrets.h` dentro de esta carpeta (o en `include/secrets.h` en PlatformIO).
2. Completar `WIFI_SSID`, `WIFI_PASSWORD`, `FIREBASE_HOST`, `FIREBASE_API_KEY`, `FIREBASE_DEVICE_EMAIL` y `FIREBASE_DEVICE_PASSWORD`.
3. En Firebase RTDB (`/usuarios/{uid_del_gateway}`), registrar la cuenta con:
   ```json
   {
     "email": "gateway-devkit-v1@iot.minesafe.local",
     "tipoUsuario": "dispositivo_iot",
     "deviceId": "gateway_ESP32_DEVKIT_V1",
     "isGateway": true,
     "organizationId": "org-minesafe-principal",
     "isActive": true
   }
   ```
4. Con ese perfil, las reglas endurecidas de `database.rules.json` autorizan al gateway a leer/escribir únicamente nodos pertenecientes a su misma `organizationId`, sin depender de tokens heredados (`legacy_token`).
