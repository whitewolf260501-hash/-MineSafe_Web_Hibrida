# P091 — Guía de Despliegue y Validación Manual

> **Advertencia de seguridad:** Ninguna regla de Firebase ni firmware fue desplegado automáticamente desde este entorno. Todos los pasos de publicación en `minefase-fc5f5` deben ejecutarse y verificarse manualmente por el responsable del proyecto.

---

## 1. Verificación previa local (antes de publicar)

```bash
npm run validate:firebase
npm test
npm run lint
npm run build
```

Todos los comandos anteriores deben terminar con código de salida `0`.

---

## 2. Publicación manual de reglas de seguridad en Firebase (`minefase-fc5f5`)

### Opción A — Firebase CLI (recomendada)

1. Autenticarse y seleccionar el proyecto real:
   ```bash
   firebase login
   firebase use minefase-fc5f5
   ```
2. Revisar el diff de `database.rules.json` antes de publicar:
   - Verificar que la raíz mantiene `".read": false` y `".write": false`.
   - Verificar que `/diagnostico` mantiene `".read": false` y `".write": false`, y que solo `/diagnostico/esp32_p087` concede acceso por mínimo privilegio al UID `tJgRrlKRwPQOWCkdJiWA54B0JN33` y a los usuarios autorizados de la organización propietaria de `device_38A839E81F84`.
   - Verificar que `manuelcrisostomovega@gmail.com` tiene `email_verified === true` en Firebase Authentication.
3. Publicar **únicamente** las reglas de Realtime Database (y opcionalmente Firestore/Storage si hubo cambios pendientes en el proyecto real):
   ```bash
   firebase deploy --only database --project minefase-fc5f5
   ```
   Si también deseas asegurar sincronía de Firestore y Storage:
   ```bash
   firebase deploy --only database,firestore:rules,storage --project minefase-fc5f5
   ```

### Opción B — Consola Web de Firebase

1. Abrir Firebase Console → Proyecto **`minefase-fc5f5`** → **Realtime Database** → pestaña **Reglas**.
2. Pegar el contenido completo de `database.rules.json` del repositorio.
3. Hacer clic en **Publicar** y verificar que no existan advertencias de sintaxis ni de índices faltantes (`.indexOn: ["timestamp"]`).

---

## 3. Comprobación en banco con el nodo físico ESP32

1. Confirmar que el firmware del nodo físico `device_38A839E81F84` inicia sesión en Firebase Auth con:
   - Correo: `esp32-nodo-fisico@minesafe.example`
   - UID esperado: `tJgRrlKRwPQOWCkdJiWA54B0JN33`
2. Verificar en el monitor serie que el firmware realiza:
   - **`PATCH`** sobre `/diagnostico/esp32_p087.json?auth=<ID_TOKEN>` cada ~2 s incluyendo `"last_update_server": {".sv": "timestamp"}`.
   - **`POST`** sobre `/diagnostico/esp32_p087/historial.json?auth=<ID_TOKEN>` cada ~60 s con `{ co, pm25, temperatura, humedad, timestamp: {".sv": "timestamp"} }`.
   - **Nunca** ejecutar `PUT` sobre `/diagnostico/esp32_p087.json` (sobrescribiría `/historial` y será rechazado por las reglas).
3. Abrir la plataforma web MineSafe autenticándose como SuperAdmin (`manuelcrisostomovega@gmail.com`) o usuario autorizado de la empresa propietaria de `device_38A839E81F84`:
   - Confirmar en **Dashboard** → bloque **Telemetría de Banco ESP32** que:
     - `Conexión Firebase RTDB` indica **WebSocket Activo**.
     - `Recepción Telemetría ESP32` pasa a **En línea** con contador de segundos `< 20 s`.
     - Se actualizan `CO` (ADC raw), `PM2_5` (estimación OPEN-SMART), `temperatura` y `humedad`.
     - No aparece ningún equipo duplicado (`device_38A839E81F84` sigue siendo único con su faena, sector y contrato).
     - No se disparan alertas operacionales en el banner rojo global ni en la bitácora de emergencias.
4. **Prueba de desconexión y reconexión real:**
   - Desenergizar el ESP32 y esperar **> 20 segundos**: confirmar que la web cambia a **Desconectado / dato expirado** aun cuando el WebSocket de Firebase siga activo.
   - Reconectar el ESP32: confirmar recuperación automática a **En línea** al llegar la siguiente trama.
5. **Prueba de historial con navegador cerrado:**
   - Cerrar todas las pestañas del navegador durante 3–5 minutos con el ESP32 encendido.
   - Reabrir la web → **Historial y Reportes** → confirmar que las muestras persistidas en `/diagnostico/esp32_p087/historial` aparecen graficadas junto con el historial previo.

---

## 4. Despliegue de la aplicación web

Una vez validadas las pruebas locales y publicadas las reglas en Firebase, construir y publicar el frontend según el flujo habitual de despliegue de Cloud Run / Hosting (`npm run build`).
