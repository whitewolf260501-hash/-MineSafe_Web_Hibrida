# P085 — Auditoría y Endurecimiento de Seguridad: Credenciales (Punto 12) y Reglas Firebase + SuperAdmin (Punto 13)

**Proyecto:** MineSafe IoT (Plataforma Web React/TypeScript/Express + Firmware ESP32 Nodo Físico, Gateway y Nodo Simulado + Firebase RTDB / Firestore / Storage)  
**Fecha de emisión:** 2026-11-25  
**Alcance ejecutado:** Código fuente del repositorio y los 3 proyectos ESP32 adjuntados, reglas de seguridad locales (`database.rules.json`, `firestore.rules`, `storage.rules`, `firebase.json`) y suites automatizadas locales.  
**Estado de producción:** **NO SE MODIFICÓ PRODUCCIÓN.** No se publicaron reglas en el proyecto Firebase real ni se interrumpió el monitoreo activo.

---

## 1. Resumen Ejecutivo de Correcciones

### Punto 12 — Seguridad de Credenciales
1. **Auditoría integral del workspace web y los 3 firmwares ESP32:**
   - **Frontend (`src/`):** Se verificó ausencia total de claves de cuentas de servicio (`firebase-adminsdk*.json`), claves privadas (`BEGIN PRIVATE KEY`), tokens legados (`FIREBASE_DB_SECRET`, `legacy_token`) o tokens de ingesta (`INGEST_API_TOKEN`). El cliente web contiene únicamente la configuración pública estándar de Firebase Web SDK (`apiKey`, `authDomain`, `databaseURL`, `projectId`, `appId`).
   - **Servidor (`server.ts`) y scripts (`scripts/migrateLegacyOrganization.ts`):** Consumen credenciales únicamente por variables de entorno de servidor (`process.env.INGEST_API_TOKEN`, `process.env.FIREBASE_AUTH_TOKEN` / `FIREBASE_DB_SECRET`), nunca expuestas con prefijo `VITE_`.
   - **Firmware Nodo Físico (`nodo_original_redactado.cpp`, `nodo_P079.cpp`), Gateway (`main_9f4e016e.cpp`) y Nodo Simulado (`main_5a70b90e.cpp`):**
     - Se confirmó que el Nodo Físico y el Gateway contenían macros `#define WIFI_SSID`, `WIFI_PASSWORD`, `FIREBASE_HOST`, `FIREBASE_AUTH` embebidas en el archivo fuente y utilizaban `fbConfig.signer.tokens.legacy_token` (Firebase Database Secret heredado, con privilegios totales que omiten las Security Rules).
     - Se confirmó que el Nodo Simulado (`device_9F4C2A7E1B08`) incluía una URL de producción fija (`minefase-fc5f5-default-rtdb.firebaseio.com`) dentro de su bloque `#else` de respaldo y también empleaba `legacy_token`.
2. **Separación de secretos y actualización de plantillas:**
   - Se endureció `.gitignore` para bloquear `**/secrets.h`, `**/secrets.local.h`, `firmware/**/secrets.h`, `include/secrets.h`, `*firebase-adminsdk*.json`, `*service-account*.json`, `serviceAccountKey.json`, `*.pem`, `*.key`, `*.p12` y `.firebase/`.
   - Se actualizó `.env.example` separando explícitamente variables públicas de cliente (`VITE_*`) de secretos exclusivos de servidor (`INGEST_API_TOKEN`, `FIREBASE_AUTH_TOKEN`, `FIREBASE_DB_SECRET` marcado como deprecado).
   - Se actualizaron/crearon los 3 firmwares bajo `/firmware/` exigiendo `#include "secrets.h"` (error en compilación si falta cuando Wi-Fi está habilitado), eliminando el fallback con URL de producción del nodo simulado y migrando el método por defecto a **Firebase Authentication (Email/Password con cuenta dedicada de dispositivo + `tokenStatusCallback`)**, manteniendo `#ifdef FIREBASE_USE_LEGACY_TOKEN` únicamente como bandera temporal de transición.
   - **Seguridad local física intacta:** No se alteró ningún pin GPIO, muestreo MQ-2/PM2.5/DHT11, umbrales locales (`350/500` ADC, `55.0/150.0 µg/m³`), sirena I2S, baliza MOSFET 12V, matriz LED MAX7219, interfaz TFT, botón de pánico ni el paquete ESP-NOW de 96 bytes (`struct_mesh_packet`).

### Punto 13 — Reglas Firebase y SuperAdmin
1. **Endurecimiento de `database.rules.json` (RTDB):**
   - **Denegación por defecto:** `".read": false`, `".write": false` en la raíz; cero reglas públicas.
   - **Compatibilidad segura con los 3 ESP32 sin `legacy_token`:** Se habilitó lectura/escritura acotada en `/dispositivos/$deviceId` (incluyendo `/comando_web` y `/historial/$histId`) y escritura append-only en `/historial_telemetria/$deviceId/$sampleTs` para:
     1. Cuentas dedicadas en Firebase Auth (`tipoUsuario === 'dispositivo_iot'` con `isActive === true`) vinculadas a su `organizationId` y a su `deviceId` exacto — o con `isGateway === true` para el Gateway (`gateway_ESP32_DEVKIT_V1`) que retransmite nodos de su misma organización (`via_puente: "GATEWAY_ISOLATED"`).
     2. Custom Tokens emitidos por backend (`sign_in_provider === 'custom'` con claims `deviceId` / `isGateway` + `organizationId`).
   - **Validaciones estrictas de telemetría y comandos:** Rangos físicos en `CO` (`0..4095`), `PM2_5` (`0..4095`), `temperatura` (`-40..100`), `humedad` (`0..100`), lista blanca en `comando_web` (`ENCENDER`, `APAGAR`, `PROCESADO_ON`, `PROCESADO_OFF`, `""`), límites de longitud en `via_puente` y `gateway_id`, rango en `saltos_espnow` (`0..16`) y validación de esquema en `/dispositivos/$deviceId/historial/$histId`.
   - **Protección anti-borrado de bitácoras e historiales:** En Firebase RTDB `.validate` se omite al eliminar (`newData.exists() === false`). Se corrigió este vector añadiendo `newData.exists()` obligatorio para roles no-SuperAdmin en `alertas`, `bitacora_contingencias`, `simulacros_bitacora`, `eventos_umbrales`, `pagos`, `configuracion_alertas`, `bitacora_configuracion_umbrales`, `historial_telemetria` e `incidentes_ciberseguridad`.
   - **Endurecimiento de `auditoria_seguridad`:** Estrictamente *append-only* (`!data.exists() && newData.exists()`), ahora exige cuenta activa (`isActive === true`) o SuperAdmin verificado, y vincula `actorId === auth.uid` para impedir suplantación del actor o spam desde cuentas bloqueadas.
   - **Protección contra escalamiento de privilegios en `/usuarios/$userId`:** Ningún usuario puede auto-modificarse (`$userId !== auth.uid`), ningún rol inferior puede asignar `superadmin`, `admin_minesafe`, `isSuperUser: true` ni aprovisionar cuentas `dispositivo_iot` (restringido a SuperAdmin y Admin MineSafe).
   - **SuperAdmin único y verificado:** Valida correo autorizado + `auth.token.email_verified === true`.
2. **Alineación de `firestore.rules` y `firestore.rules.test.ts`:**
   - Se incorporó `admin_minesafe` en `isValidAdmin(data)` (`['superadmin', 'admin_minesafe', 'admin']`) manteniendo 0 errores en `eslint firestore.rules`.
   - Se amplió `firestore.rules.test.ts` para cubrir los 5 roles completos cuando se ejecute contra Firebase Emulator Suite.
3. **Revisión de `storage.rules`:**
   - Mantiene denegación por defecto, verificación de correo del SuperAdmin, ruta canónica `/adjuntos/{organizationId}/{alertId}/{fileName}`, límite de 5 MB, lista blanca MIME (`image/jpeg|png|webp`, `application/pdf`), inmutabilidad (`allow update: if false`) y `uploadedByUid == request.auth.uid`.
   - **Observación técnica:** Para aislamiento duro entre organizaciones en lecturas de Storage sin depender de `resource.metadata`, se recomienda poblar el *Custom Claim* `organizationId` vía Firebase Admin SDK al aprovisionar usuarios.

---

## 2. Archivos Modificados y Creados

| Archivo | Acción | Propósito |
|---|---|---|
| `.gitignore` | Modificado | Bloquea `**/secrets.h`, `secrets.local.h`, `*firebase-adminsdk*.json`, `*service-account*.json`, `*.pem`, `*.key`, `*.p12`, `.firebase/`. |
| `.env.example` | Modificado | Separa variables públicas `VITE_*` de secretos de servidor (`INGEST_API_TOKEN`, `FIREBASE_AUTH_TOKEN`, `FIREBASE_DB_SECRET` marcado legado). |
| `firmware/nodo_esp32/nodo_esp32.ino` | Modificado | Integra NTP P079, exige `#include "secrets.h"`, migra autenticación por defecto a Firebase Auth Email/Password con fallback opcional `#ifdef FIREBASE_USE_LEGACY_TOKEN`. |
| `firmware/nodo_esp32/secrets.example.h` | Modificado | Plantilla segura con `FIREBASE_API_KEY`, `FIREBASE_DEVICE_EMAIL`, `FIREBASE_DEVICE_PASSWORD`. |
| `firmware/nodo_esp32/README.md` | Modificado | Documentación de credenciales externas y cuenta IoT del nodo físico `device_38A839E81F84`. |
| `firmware/gateway_esp32/main.cpp` | Creado | Versión endurecida del Gateway `gateway_ESP32_DEVKIT_V1` con `secrets.h` y Firebase Auth seguro (preservando ESP-NOW y `GATEWAY_ISOLATED`). |
| `firmware/gateway_esp32/secrets.example.h` | Creado | Plantilla de credenciales del Gateway IoT. |
| `firmware/gateway_esp32/README.md` | Creado | Guía de registro de la cuenta Gateway (`isGateway: true`) en Firebase Auth/RTDB. |
| `firmware/nodo_simulado_esp32/main.cpp` | Creado | Versión endurecida del Nodo Simulado `device_9F4C2A7E1B08`: elimina URL fija de producción y exige `secrets.h` en modo híbrido. |
| `firmware/nodo_simulado_esp32/secrets.example.h` | Creado | Plantilla de credenciales del Nodo Simulado. |
| `firmware/nodo_simulado_esp32/README.md` | Creado | Documentación de operación solo ESP-NOW vs. modo híbrido seguro. |
| `database.rules.json` | Modificado | Reglas RTDB endurecidas: compatibilidad segura ESP32/Gateway, validación de `comando_web` e `historial`, protección anti-borrado en bitácoras/historiales y `auditoria_seguridad` vinculada a `actorId`. |
| `firestore.rules` | Modificado | Incorpora `admin_minesafe` en `isValidAdmin` (0 errores ESLint). |
| `firestore.rules.test.ts` | Modificado | Amplía cobertura de emulador Firestore a los 5 roles completos. |
| `tests/test_p085_security_rules_and_credentials.ts` | Creado | Suite automatizada con evaluador determinista de reglas RTDB (5 roles + 3 ESP32 + anti-borrado + anti-escalamiento + exportaciones + alertas + higiene de credenciales). |
| `package.json` | Modificado | Agrega script `test:p085` y lo integra en `npm test`. |
| `P085_IAStudio_MineSafe_Seguridad_Credenciales_Firebase.md` | Creado | Informe técnico entregable completo (también copiado a `public/` y sincronizado en el Centro Documental SuperAdmin). |

---

## 3. Código Anterior vs. Corregido (Valores Sensibles Censurados)

### 3.1 Firmware Nodo Físico y Gateway (Eliminación de secretos embebidos y `legacy_token`)

**Antes (inseguro — credenciales embebidas + Database Secret legado):**
```cpp
#define WIFI_SSID       "[REDACTED_WIFI_SSID]"
#define WIFI_PASSWORD   "[REDACTED_WIFI_PASSWORD]"
#define FIREBASE_HOST   "[REDACTED_FIREBASE_HOST]"
#define FIREBASE_AUTH   "[REDACTED_FIREBASE_AUTH]"
// ...
fbConfig.database_url = FIREBASE_HOST;
fbConfig.signer.tokens.legacy_token = FIREBASE_AUTH;
```

**Después (endurecido — archivo externo `secrets.h` + Firebase Auth por dispositivo):**
```cpp
#if __has_include("secrets.h")
  #include "secrets.h"
#else
  #error "Falta secrets.h. Copia secrets.example.h a secrets.h con tus credenciales locales."
#endif
// ...
void iniciarFirebaseSeguro() {
  fbConfig.database_url = FIREBASE_HOST;
#ifdef FIREBASE_USE_LEGACY_TOKEN
  // Solo transición temporal — revocar tras migrar
  fbConfig.signer.tokens.legacy_token = FIREBASE_AUTH;
#else
  fbConfig.api_key = FIREBASE_API_KEY;
  auth.user.email = FIREBASE_DEVICE_EMAIL;
  auth.user.password = FIREBASE_DEVICE_PASSWORD;
  fbConfig.token_status_callback = tokenStatusCallback;
#endif
  Firebase.begin(&fbConfig, &auth);
  Firebase.reconnectWiFi(true);
}
```

### 3.2 Firmware Nodo Simulado (`device_9F4C2A7E1B08` — Eliminación de host de producción en fallback)

**Antes:**
```cpp
#if __has_include("secrets.h")
  #include "secrets.h"
#else
  #define WIFI_SSID       "CAMBIAR_SSID"
  #define WIFI_PASSWORD   "CAMBIAR_PASSWORD"
  #define FIREBASE_HOST   "https://[REDACTED_PROD_HOST]"
  #define FIREBASE_AUTH   "CAMBIAR_TOKEN"
#endif
```

**Después:**
```cpp
#define MODO_SOLO_ESPNOW_DEF 1
const bool MODO_SOLO_ESPNOW = (MODO_SOLO_ESPNOW_DEF == 1);

#if __has_include("secrets.h")
  #include "secrets.h"
#elif MODO_SOLO_ESPNOW_DEF == 0
  #error "Falta secrets.h para compilar en modo hibrido (MODO_SOLO_ESPNOW_DEF == 0)."
#else
  #define WIFI_SSID                ""
  #define WIFI_PASSWORD            ""
  #define FIREBASE_HOST            ""
  #define FIREBASE_API_KEY         ""
  #define FIREBASE_DEVICE_EMAIL    ""
  #define FIREBASE_DEVICE_PASSWORD ""
#endif
```

### 3.3 Reglas RTDB — Protección contra borrado y suplantación en `auditoria_seguridad` y `bitacora_contingencias`

**Antes (`auditoria_seguridad/$eventId/.write`):**
```json
".write": "auth != null && !data.exists() && newData.exists()"
```
*(Permitía escribir a usuarios bloqueados `isActive: false` y falsificar cualquier `actorId`.)*

**Después (`auditoria_seguridad/$eventId/.write`):**
```json
".write": "auth != null && !data.exists() && newData.exists() && ((auth.token.email === '<SUPERADMIN_EMAIL>' && auth.token.email_verified === true) || (root.child('usuarios/' + auth.uid).exists() && root.child('usuarios/' + auth.uid + '/isActive').val() === true && (root.child('usuarios/' + auth.uid + '/isSuperUser').val() === true || root.child('usuarios/' + auth.uid + '/tipoUsuario').val() === 'superadmin' || newData.child('actorId').val() === auth.uid)))"
```

---

## 4. Reglas Firebase Propuestas (Resumen Técnico y Ubicación Exacta)

> Por política de privacidad en este informe, el correo del SuperAdmin primario se representa como `<SUPERADMIN_EMAIL>` en los fragmentos ilustrativos; los archivos reales del repositorio (`database.rules.json`, `firestore.rules`, `storage.rules`) ya contienen el correo configurado y verificado con `email_verified === true`.

### 4.1 `database.rules.json` (Realtime Database)
- **Raíz:** `".read": false`, `".write": false`.
- **`/dispositivos`:** `.indexOn: ["organizationId"]`. Lectura padre solo para SuperAdmin verificado, `admin_minesafe` o consulta acotada `query.orderByChild === 'organizationId'` de la propia empresa.
- **`/dispositivos/$deviceId`:**
  - `.read`: SuperAdmin verificado, Custom Token (`deviceId === $deviceId` o `isGateway === true` de igual `organizationId`), cuenta `dispositivo_iot` activa (mismo `deviceId` o `isGateway === true` de igual `organizationId`), `admin_minesafe`, o usuario humano activo de la misma `organizationId`.
  - `.write`: SuperAdmin verificado, Custom Token (`deviceId` / `isGateway`, con `newData.exists()` e inmutabilidad de `organizationId`), cuenta `dispositivo_iot` activa (sin poder borrar ni cambiar `organizationId`), `admin_minesafe`, o `admin` de empresa (solo sobre equipos existentes asignados a su empresa, sin cambiar `organizationId` ni `deviceCategory` ni borrar).
  - `.validate`: exige `CO` (`0..4095`), `PM2_5` (`0..4095`), `temperatura` (`-40..100`), `humedad` (`0..100`), `last_update_server` numérico, `comando_web` en lista blanca (`ENCENDER`, `APAGAR`, `PROCESADO_ON`, `PROCESADO_OFF`, `""`), `via_puente` (`<= 64`), `gateway_id` (`<= 64`), `saltos_espnow` (`0..16`), y esquema completo en `/historial/$histId`.
- **`/historial_telemetria/$deviceId/$sampleTs`:** Lectura acotada por empresa del dispositivo; escritura habilitada para ESP32 (`custom` o `dispositivo_iot` activo) y usuarios de la misma empresa con `newData.exists()` obligatorio (solo SuperAdmin puede depurar retención > 90 días).
- **`/usuarios/$userId`:** Lectura propia (`auth.uid === $userId`) o por administración de empresa; escritura prohíbe auto-edición (`$userId !== auth.uid`), bloquea asignación de `superadmin`/`admin_minesafe`/`dispositivo_iot` por roles no autorizados, y permite únicamente la activación única controlada mediante `claimedFromKey`.
- **`/alertas`, `/bitacora_contingencias`, `/simulacros_bitacora`, `/eventos_umbrales`:** Aislados por `organizationId`; `operador` y `dispositivo_iot` en solo lectura; roles no-SuperAdmin no pueden eliminar registros (`newData.exists()`).
- **`/auditoria_seguridad/$eventId`:** Append-only estricto (`!data.exists() && newData.exists()`), requiere usuario activo y `actorId === auth.uid`.
- **`/precarga`:** `".write": false` (bloqueado incluso para SuperAdmin).

### 4.2 `firestore.rules`
- Regla global `match /{document=**} { allow read, write: if false; }`.
- Requiere `isVerifiedUser()` (`request.auth != null && request.auth.token.email_verified == true`) en todas las colecciones operativas.
- `isPrimaryAdminEmail()` exige correo del SuperAdmin primario **y** `email_verified == true`.
- `isValidAdmin` valida `['superadmin', 'admin_minesafe', 'admin']`.
- Valida esquema estricto (`hasAll` + `hasOnly`), límites de longitud, inmutabilidad de `id`/`ownerId`/`createdAt`, sello temporal del servidor (`request.time`), bloqueo de estado terminal en alertas resueltas (`existing().status == 'activa'`) y existencia obligatoria de alerta padre en `/attachments`.

### 4.3 `storage.rules`
- Ruta única autorizada: `/adjuntos/{organizationId}/{alertId}/{fileName}`.
- Restricción de tamaño (`<= 5 MB`), MIME (`image/jpeg`, `image/png`, `image/webp`, `application/pdf`), inmutabilidad (`allow update: if false`), metadatos obligatorios (`organizationId`, `alertId`, `uploadedByUid == request.auth.uid`) y bloqueo total del resto del bucket (`allow read, write: if false`).

---

## 5. Matriz de Permisos por Rol (5 Roles Humanos + 2 Perfiles IoT)

| Recurso / Acción | SuperAdmin (verificado) | Admin MineSafe | Administrador (Empresa) | Supervisor | Operador | ESP32 Nodo (`dispositivo_iot`) | ESP32 Gateway (`isGateway: true`) |
|---|---|---|---|---|---|---|---|
| Lectura telemetría propia empresa | Sí (Todas) | Sí (Todas) | Sí | Sí | Sí | Solo su `$deviceId` | Nodos de su `organizationId` |
| Lectura telemetría otra empresa | Sí | Sí | **Denegado** | **Denegado** | **Denegado** | **Denegado** | **Denegado** |
| Escribir telemetría / historial | Sí | Sí | Solo config/cmd propia org | **Denegado** | **Denegado** | Solo su `$deviceId` (sin borrar) | Nodos misma org (sin borrar) |
| Emitir `comando_web` (`APAGAR`/`ENCENDER`) | Sí | Sí | Solo su empresa | **Denegado** | **Denegado** | Solo ACK (`PROCESADO_*`) | Solo ACK (`PROCESADO_*`) |
| Gestionar `/usuarios` | Total | Excepto `superadmin`/`admin_minesafe` y sí mismo | Solo su empresa (sin `superadmin`/`admin_minesafe`/`dispositivo_iot` ni sí mismo) | **Denegado** | **Denegado** | **Denegado** | **Denegado** |
| Resolver alertas y editar bitácora | Sí (y borrar) | Sí (sin borrar) | Sí en su org (sin borrar) | Sí en su org (sin borrar) | **Denegado** (solo lectura) | **Denegado** | **Denegado** |
| Umbrales `/configuracion_alertas` | Global y por equipo | Por equipo (no global) | Por equipo de su org (no global) | Solo lectura | Solo lectura | **Denegado** | **Denegado** |
| `configuracion_plataforma` | Lectura y Escritura | Solo lectura | Solo lectura | Solo lectura | Solo lectura | **Denegado** | **Denegado** |
| `auditoria_seguridad` | Leer + Append (sin borrar ni editar) | Leer + Append propio `actorId` | Append propio `actorId` | Append propio `actorId` | Append propio `actorId` | **Denegado** | **Denegado** |
| Cuentas con `isActive: false` | — | **Denegado total** | **Denegado total** | **Denegado total** | **Denegado total** | **Denegado total** | **Denegado total** |

---

## 6. Resultados Reales de Pruebas Ejecutadas vs. Bloqueadas por Entorno

### 6.1 Pruebas Ejecutadas y Verificadas en este Workspace (100% Reales)

| Comando / Suite | Resultado Real | Cobertura Verificada |
|---|---|---|
| `npm run validate:firebase` | **PASS** (`eslint firestore.rules` = 0 errores; `database.rules.json OK`; `firebase.json OK`) | Sintaxis y reglas estáticas de seguridad Firestore, RTDB y configuración de emuladores. |
| `npm run test:alerts` | **PASS (25/25)** | Motor de umbrales dinámicos, anti-flapping, escalamiento, recuperación y protección contra pin flotante `4095`. |
| `npm run test:p013` | **PASS (5/5)** | Rutas, privacidad de portada, RBAC, aislamiento multiempresa y visor 3D. |
| `npm run test:audit` | **PASS (6/6)** | Invariantes de RTDB/Storage, sesiones revocadas, contratos/pagos, exportación CSV completa y visibilidad de roles. |
| `npm run test:p031` | **PASS (34/34)** | Integridad multiempresa, backfill idempotente, ciclo de vida de dispositivos, enmascaramiento PII y 7 pilares de seguridad/cumplimiento. |
| `npm run test:p085` | **PASS (8/8 bloques)** | Evaluador determinista sobre `database.rules.json`: denegación sin auth, SuperAdmin verificado vs. no verificado, matriz 5 roles + cuenta bloqueada, anti-escalamiento, compatibilidad ESP32 físico/Gateway/simulado (`GATEWAY_ISOLATED`, `comando_web`, `/historial`, `/historial_telemetria`), append-only en `auditoria_seguridad`, exportación CSV+SHA-256 y ARCOP, alerta crítica simulada e higiene de credenciales en frontend + 3 firmwares. |
| `npm run lint` (`tsc --noEmit`) y `npm run build` | **PASS** | Compilación TypeScript y empaquetado Vite sin errores. |

### 6.2 Pruebas NO Ejecutables en este Entorno (Reportadas Honestamente)

| Prueba | Estado | Motivo Real del Bloqueo |
|---|---|---|
| **Firebase Emulator Suite (JVM)** (`firebase emulators:exec --only auth,database,firestore,storage`) | **BLOQUEADA EN WORKSPACE** | El entorno contenedorizado no dispone de Java JDK (`which java` sin resultados) ni de `@firebase/rules-unit-testing` instalado; el binario `/usr/local/bin/firebase` sí está presente pero los emuladores requieren JVM (>= Java 21). |
| **Compilación PlatformIO / Arduino IDE de los 3 ESP32** | **NO EJECUTADA EN WORKSPACE** | No existe toolchain PlatformIO / `arduino-cli` ni placas físicas conectadas en este entorno. |
| **Prueba física en banco (ESP32 + Gateway `GATEWAY_ISOLATED` + alarma + historial con navegador cerrado)** | **PENDIENTE EN BANCO** | Requiere hardware físico alimentado, compilación con `secrets.h` y entorno Firebase de pruebas/staging. |
| **Auditoría del historial Git remoto** | **PENDIENTE MANUAL** | Este workspace no contiene carpeta `.git` local; los commits históricos deben inspeccionarse en el repositorio real del proyecto. |

---

## 7. Credenciales que Deben Revocarse y Rotarse Manualmente + Revisión Git

### 7.1 Lista de Credenciales a Revocar / Rotar (Manual)
1. **Firebase Realtime Database Secret (`legacy_token`):**
   - **Acción:** Crear primero las cuentas de dispositivo en Firebase Authentication, actualizar y validar los 3 ESP32 con `secrets.h`, y **revocar/eliminar** el Database Secret antiguo en *Firebase Console → Project Settings → Service Accounts → Database Secrets*.
2. **Contraseña de la red Wi-Fi (`WIFI_PASSWORD`):**
   - **Acción:** Cambiar la clave Wi-Fi del laboratorio/faena si estuvo expuesta en archivos fuente, capturas, repositorios o entregas previas.
3. **Cualquier Service Account JSON descargado previamente (`*firebase-adminsdk*.json`):**
   - **Acción:** Verificar en *Google Cloud Console → IAM & Admin → Service Accounts → Keys* que no existan llaves JSON sin uso o filtradas; revocar y emitir nueva llave solo si es estrictamente necesaria en servidor.
4. **`INGEST_API_TOKEN` (si ya fue desplegado en servidor):**
   - **Acción:** Rotar con un secreto aleatorio de mínimo 32 bytes (`openssl rand -hex 32`) en variables de entorno de Cloud Run / servidor.
5. **Credencial del SuperAdmin primario:**
   - **Acción:** Confirmar que `email_verified === true` en Firebase Authentication, activar contraseña robusta única y habilitar 2FA/MFA si el plan Firebase Identity Platform lo permite.

### 7.2 Revisión y Saneamiento del Historial Git (Ejecutar en Máquina Local con Git)
Como este entorno no dispone de `.git`, ejecuta en tu repositorio local:
```bash
# 1. Buscar referencias históricas de secretos o secrets.h en todo el historial Git
git log --all --full-history -- "**/secrets.h" ".env*" "*firebase-adminsdk*.json"
git grep -n -E "FIREBASE_AUTH|legacy_token|WIFI_PASSWORD|BEGIN PRIVATE KEY" $(git rev-list --all)

# 2. Si existieron secretos reales en commits antiguos:
#    a) ROTAR primero las credenciales (la limpieza Git NO invalida un secreto ya copiado).
#    b) Purgar el historial con git-filter-repo (preferido sobre filter-branch):
git filter-repo --invert-paths --path-glob '**/secrets.h' --path-glob '*firebase-adminsdk*.json'
#    c) Forzar actualización controlada y coordinar re-clonación del equipo:
git push --force --all && git push --force --tags
```

---

## 8. Claves Públicas Firebase Web vs. Credenciales Privadas y Plan de Migración desde `legacy_token`

### 8.1 Diferenciación Crítica
| Tipo de Credencial | Ejemplo | ¿Es secreto privado? | Ubicación permitida | Mecanismo real de protección |
|---|---|---|---|---|
| **Configuración Web pública Firebase** | `apiKey`, `authDomain`, `databaseURL`, `projectId`, `appId` | **NO** (identificadores públicos de proyecto diseñados por Google para el navegador) | `src/services/firebase.ts`, `firebase-applet-config.json`, `VITE_*` | Firebase Auth + Security Rules + Restricciones HTTP Referrer en GCP + App Check. |
| **Database Secret (`legacy_token`)** | Token secreto RTDB heredado | **SÍ (CRÍTICO — bypass total de reglas)** | **DEPRECADO — debe eliminarse** | Reemplazar por Firebase Auth / Custom Tokens y revocar. |
| **Clave de Service Account / Admin SDK** | `private_key` en `*firebase-adminsdk*.json` | **SÍ (CRÍTICO)** | Solo Secret Manager / backend servidor | IAM mínimo privilegio, nunca en cliente ni Git. |
| **Credenciales Wi-Fi / Dispositivo IoT** | `WIFI_PASSWORD`, `FIREBASE_DEVICE_PASSWORD` | **SÍ** | Exclusivamente `secrets.h` local (ignorado en `.gitignore`) | Permisos mínimos por `deviceId` + `organizationId` en RTDB Rules. |
| **Token de Ingesta Servidor** | `INGEST_API_TOKEN` | **SÍ** | Variables de entorno de servidor (sin `VITE_`) | Comparación en tiempo constante (`timingSafeEqual`) + rate limit. |

### 8.2 Plan de Migración Segura desde `legacy_token` (3 Opciones)
1. **Opción A — Implementada por defecto en los 3 firmwares (Recomendada por simplicidad y compatibilidad inmediata con `Firebase_ESP_Client`):**
   - Cuenta dedicada Email/Password en Firebase Authentication por cada placa física (`nodo-38a839e81f84@iot.minesafe.local`, `gateway-devkit-v1@iot.minesafe.local`, `nodo-9f4c2a7e1b08@iot.minesafe.local`).
   - Registro de su `uid` en `/usuarios/{uid}` con `tipoUsuario: "dispositivo_iot"`, `deviceId`, `isGateway` (`true` solo para el Gateway), `organizationId` e `isActive: true`.
   - `Firebase_ESP_Client` renueva automáticamente el ID Token JWT cada hora; si una placa es robada, basta con cambiar `isActive: false` en RTDB o deshabilitar el usuario en Firebase Auth para revocar acceso al instante sin tocar los demás equipos.
2. **Opción B — Custom Tokens firmados por backend (ya soportada en `database.rules.json`):**
   - Un endpoint/Cloud Function autentica el dispositivo (por secreto por dispositivo o certificado) y emite un `Custom Token` con claims `{ deviceId, isGateway, organizationId }`.
   - Las reglas ya aceptan `auth.token.firebase.sign_in_provider === 'custom'` con validación estricta de `deviceId` / `isGateway` + `organizationId`.
3. **Opción C — Ingesta vía servidor proxy autenticado (`POST /api/telemetry/ingest`):**
   - El Gateway envía lecturas por HTTPS a `server.ts` con `X-MineSafe-Ingest-Token`, donde el servidor valida rangos físicos, aplica rate limiting y escribe en Firebase vía Admin SDK.

---

## 9. Instrucciones Paso a Paso para Configurar Firebase

### Paso 1: Verificar correo del SuperAdmin primario
1. Ir a **Firebase Console → Authentication → Users**.
2. Ubicar la cuenta del SuperAdmin primario y confirmar que su correo esté verificado (`emailVerified: true`). Si no lo está, disparar verificación desde la app o marcarla verificada mediante Firebase Admin SDK.
3. Confirmar que exista su registro en `/usuarios/{uid}` con `isSuperUser: true`, `tipoUsuario: "superadmin"`, `isActive: true`.

### Paso 2: Ejecutar Backfill Multiempresa (obligatorio antes de endurecer RTDB)
Para asegurar que ningún dispositivo, alerta, contrato o usuario quede huérfano sin `organizationId`:
```bash
# Modo simulación primero (no escribe nada):
FIREBASE_RTDB_URL="https://<TU-PROYECTO>-default-rtdb.firebaseio.com" \
FIREBASE_AUTH_TOKEN="<OAUTH_O_TOKEN_ADMIN>" \
npx tsx scripts/migrateLegacyOrganization.ts --dry-run

# Luego aplicar cambios:
FIREBASE_RTDB_URL="https://<TU-PROYECTO>-default-rtdb.firebaseio.com" \
FIREBASE_AUTH_TOKEN="<OAUTH_O_TOKEN_ADMIN>" \
npx tsx scripts/migrateLegacyOrganization.ts --apply
```

### Paso 3: Crear Cuentas IoT en Firebase Authentication y Registrarlas en `/usuarios`
Crear 3 usuarios en **Firebase Console → Authentication → Add User** (contraseña aleatoria única de >= 20 caracteres por placa) y anotar cada `UID`:
1. **Nodo Físico (`device_38A839E81F84`):**
   ```json
   // Ruta RTDB: /usuarios/<UID_NODO_FISICO>
   {
     "email": "nodo-38a839e81f84@iot.minesafe.local",
     "nombre": "ESP32 Nodo Físico 1F84",
     "tipoUsuario": "dispositivo_iot",
     "deviceId": "device_38A839E81F84",
     "isGateway": false,
     "organizationId": "org-minesafe-principal",
     "isActive": true,
     "isAdmin": false,
     "isSuperUser": false
   }
   ```
2. **Gateway (`gateway_ESP32_DEVKIT_V1`):**
   ```json
   // Ruta RTDB: /usuarios/<UID_GATEWAY>
   {
     "email": "gateway-devkit-v1@iot.minesafe.local",
     "nombre": "ESP32 Gateway DevKit V1",
     "tipoUsuario": "dispositivo_iot",
     "deviceId": "gateway_ESP32_DEVKIT_V1",
     "isGateway": true,
     "organizationId": "org-minesafe-principal",
     "isActive": true,
     "isAdmin": false,
     "isSuperUser": false
   }
   ```
3. **Nodo Simulado (`device_9F4C2A7E1B08` — solo si se usa en modo híbrido Wi-Fi):**
   ```json
   // Ruta RTDB: /usuarios/<UID_NODO_SIMULADO>
   {
     "email": "nodo-9f4c2a7e1b08@iot.minesafe.local",
     "nombre": "ESP32 Nodo Simulado 1B08",
     "tipoUsuario": "dispositivo_iot",
     "deviceId": "device_9F4C2A7E1B08",
     "isGateway": false,
     "organizationId": "org-minesafe-principal",
     "isActive": true,
     "isAdmin": false,
     "isSuperUser": false
   }
   ```
4. Verificar que `/dispositivos/device_38A839E81F84` y `/dispositivos/device_9F4C2A7E1B08` tengan `"organizationId": "org-minesafe-principal"` (o la organización correspondiente).

### Paso 4: Ejecutar Firebase Emulator Suite en máquina local con Java 21+
```bash
npm install --no-save @firebase/rules-unit-testing
firebase emulators:exec --only auth,database,firestore,storage "npx tsx firestore.rules.test.ts"
```

---

## 10. Procedimiento de Despliegue Seguro por Fases y Reversión (Rollback)

> **Regla de oro:** Nunca publicar las reglas nuevas de RTDB antes de que los ESP32 estén autenticando con Firebase Auth o antes de que los nodos tengan su `organizationId` poblado.

1. **Fase 0 — Respaldo previo:** Descargar una copia local de las reglas actuales de RTDB, Firestore y Storage desde Firebase Console (`backup_rules_YYYYMMDD/`).
2. **Fase 1 — Backfill y cuentas IoT:** Ejecutar `migrateLegacyOrganization.ts --apply` y crear las cuentas `dispositivo_iot` en Auth + `/usuarios/{uid}`.
3. **Fase 2 — Actualización de firmwares (sin cortar monitoreo):**
   - Crear `secrets.h` en cada carpeta de firmware (sin `FIREBASE_USE_LEGACY_TOKEN`).
   - Flashear primero el **Gateway** y confirmar en Monitor Serial `[FIREBASE OK]` con ID Token.
   - Flashear el **Nodo Físico** (`device_38A839E81F84`) y confirmar `[FIREBASE DIRECTO]` y `[HISTORIAL OK]`.
   - Flashear el **Nodo Simulado** (`device_9F4C2A7E1B08`) y verificar recepción `via_puente: "GATEWAY_ISOLATED"`.
4. **Fase 3 — Validación en Emulador / Staging:** Ejecutar `firebase emulators:exec` con los 5 roles y verificar `npm run validate:firebase && npm test`.
5. **Fase 4 — Publicación controlada en Producción (solo con autorización expresa):**
   ```bash
   firebase deploy --only database,firestore,storage
   ```
   Verificar inmediatamente en los primeros 5 minutos:
   - Lectura en vivo de los 2 nodos en el panel web con los 5 roles.
   - Escritura continua de `last_update_server` y `/historial`.
   - Comando `APAGAR`/`ENCENDER` y su ACK `PROCESADO_OFF`/`PROCESADO_ON`.
   - Consulta no autenticada `curl https://<TU-PROYECTO>-default-rtdb.firebaseio.com/dispositivos.json` devuelve `401 Permission denied`.
6. **Fase 5 — Revocación final:** Una vez estable por 24 horas sin errores de permisos, revocar el Database Secret (`legacy_token`) en Firebase Console.
7. **Procedimiento de Reversión (Rollback) en < 60 segundos:**
   - En Firebase Console → Realtime Database / Firestore / Storage → pestaña **Rules** → seleccionar la revisión anterior en el historial de versiones y presionar **Publish** (o ejecutar `firebase deploy --only database` restaurando el JSON de `backup_rules_YYYYMMDD/`).

---

## 11. Evidencias Necesarias para Cerrar Oficialmente Puntos 12 y 13

### Para cerrar Punto 12 (Retiro y Rotación de Credenciales)
- [ ] Captura de Firebase Console confirmando revocación/eliminación del Database Secret legado (`legacy_token`).
- [ ] Confirmación de rotación de `WIFI_PASSWORD` (si estuvo expuesta) y `INGEST_API_TOKEN`.
- [ ] Salida de `git log` / `git grep` sobre el repositorio remoto confirmando ausencia de secretos en historial (o evidencia de purga con `git-filter-repo`).
- [ ] Captura de compilación limpia en PlatformIO / Arduino IDE de los 3 firmwares usando `secrets.h` externo (sin credenciales en `.cpp`/`.ino`).

### Para cerrar Punto 13 (Reglas Firebase y SuperAdmin)
- [ ] Captura de `firebase emulators:exec` ejecutando `firestore.rules.test.ts` en entorno con Java 21+ (0 fallos).
- [ ] Captura de `curl https://<PROYECTO>-default-rtdb.firebaseio.com/dispositivos.json` respondiendo `Permission denied` tras publicar `database.rules.json`.
- [ ] Captura de Firebase Console → Rules mostrando las versiones publicadas de `database.rules.json`, `firestore.rules` y `storage.rules` con fecha/hora de despliegue.
- [ ] Captura de Firebase Authentication confirmando `emailVerified: true` para el SuperAdmin primario y las cuentas `dispositivo_iot` activas.
- [ ] Validación funcional en vivo con los 5 roles (SuperAdmin, Admin MineSafe, Administrador, Supervisor, Operador) y telemetría simultánea del Nodo Físico + Gateway (`GATEWAY_ISOLATED`).

---

## 12. Limitaciones, Vulnerabilidades Transitivas (`bun audit`) y Pendientes

1. **Entorno sin Java JDK ni hardware físico:** Las pruebas de emulador JVM de Firebase y las pruebas físicas en banco (alarma, cobertura ESP-NOW, historial con navegador cerrado) no pueden ejecutarse dentro de este contenedor y permanecen pendientes en banco local.
2. **Auditoría de dependencias (`bun audit`):** Se detectaron avisos en dependencias transitivas (`@grpc/grpc-js`, `body-parser`, `minimatch`, `qs`, `re2js`, `source-map-js`, `vite@8.3.1`). No se forzaron actualizaciones mayores en este ciclo para evitar regresiones en Vite/Firebase SDK; se recomienda planificar un mantenimiento controlado de `package.json` / lockfile con pruebas de regresión.
3. **Aislamiento Storage con Custom Claims:** `storage.rules` incluye un respaldo para sesiones sin claim `organizationId` (`request.auth.token.organizationId == null`). Para reforzar aún más Storage contra lecturas cruzadas por URL directa adivinada, configurar una Cloud Function / Admin SDK que sincronice el Custom Claim `organizationId` y luego eliminar esa rama de respaldo.

---

## 13. Estado Final Honesto de los Puntos 12 y 13

| Punto | Estado Actual | Justificación Objetiva |
|---|---|---|
| **Punto 12 — Retiro y rotación de credenciales** | **EN PROGRESO (Código y plantillas endurecidos; cierre manual pendiente)** | Secretos retirados del código fuente y los 3 firmwares, `.gitignore`/`.env.example`/`secrets.example.h` corregidos y verificados por pruebas automatizadas. **Falta:** rotación/revocación manual del Database Secret y Wi-Fi en producción, y revisión del historial Git remoto. |
| **Punto 13 — Reglas Firebase y SuperAdmin** | **EN PROGRESO (Reglas endurecidas y validadas localmente; publicación y emulador JVM pendientes)** | `database.rules.json`, `firestore.rules`, `storage.rules` y suites (`validate:firebase`, `test:p085`, `firestore.rules.test.ts`) listos y verificados al 100% en entorno local sin tocar producción. **Falta:** ejecutar Emulator Suite con Java 21+, confirmar `email_verified` en consola real, migrar placas a Auth y publicar reglas en producción tras aprobación. |
