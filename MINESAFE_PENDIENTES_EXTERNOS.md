# PENDIENTES EXTERNOS Y REQUISITOS FUERA DE REPOSITORIO — MINESAFE WEB HÍBRIDA (P031)

Los elementos listados a continuación **no pueden completarse desde el código local únicamente**, porque requieren credenciales en la nube, plan de facturación en Firebase, runtime Java para emuladores o hardware ESP32 físico.

---

## 1. Despliegue de Reglas e Índices Firebase (`minefase-fc5f5` y `gen-lang-client-0751389499`)
- **Acción pendiente:** Desplegar los archivos actualizados en la nube:
  - `firebase deploy --only database,storage` sobre el proyecto `minefase-fc5f5`.
  - `firebase deploy --only firestore:rules` sobre el proyecto `gen-lang-client-0751389499` (si Firestore permanece activo).
- **Por qué queda pendiente:** No existen credenciales autenticadas de Firebase CLI en este entorno ni corresponde alterar infraestructura en producción sin aprobación explícita.
- **Nota crítica de transición:** Antes o inmediatamente junto al despliegue de `database.rules.json` (que elimina el bypass `!exists()` en `organizationId` y exige `isActive === true`), ejecutar la migración de datos existentes con `scripts/migrateLegacyOrganization.ts`.

## 2. Ejecución de Script de Backfill Multiempresa sobre Datos Reales en RTDB
- **Acción pendiente:**
  1. Inspeccionar en modo simulación: `FIREBASE_RTDB_URL=https://minefase-fc5f5-default-rtdb.firebaseio.com FIREBASE_DB_SECRET=<secreto> npx tsx scripts/migrateLegacyOrganization.ts --dry-run`
  2. Aplicar parche idempotente: repetir con `--apply`.
- **Alcance:** Asigna `organizationId` a registros legados sin etiqueta en `dispositivos`, `usuarios`, `contratos`, `pagos`, `asignaciones`, `alertas`, `bitacora_contingencias`, `adjuntos`, `simulacros_bitacora`, `bitacora_configuracion_umbrales`, `eventos_umbrales`, `faenas` y `configuracion_alertas`, y migra nodos planos `/simulacro` y `/emergencia` hacia `/simulacro/{defaultOrgId}` y `/emergencia/{defaultOrgId}`.

## 3. Despliegue de Colector 24/7 en Cloud Functions (Plan Blaze) o Servidor Continuo
- **Acción pendiente:**
  - Opción A (Serverless recomendado): Activar plan **Blaze** en `minefase-fc5f5`, inicializar paquete `functions/` envolviendo `handleDeviceWriteTrigger` y `planScheduledTelemetryPruning` de `firebase-functions/telemetryCollector.ts` y desplegar con `firebase deploy --only functions`.
  - Opción B (Servidor Node.js continuo): Desplegar `server.ts` apuntando el puente/gateway o worker al endpoint `POST /api/telemetry/ingest` (verificando estado vía `GET /api/telemetry/health`).
- **Motivo:** Hasta que alguno de estos dos ejecutores corra de forma continua en la nube, la ingesta histórica en `/historial_telemetria` depende de navegadores autenticados o firmware ESP32 con escritura directa.

## 4. Pruebas Reales con Firebase Emulator Suite (Requiere Java JDK/JRE)
- **Acción pendiente:** Instalar Java JDK/JRE ≥ 11 en estación de trabajo o runner de CI y ejecutar:
  - `firebase emulators:exec --only firestore "npx tsx firestore.rules.test.ts"`
  - Pruebas equivalentes para emuladores RTDB y Storage usando `firebase.json`.

## 5. Custom Claims y Autenticación de Dispositivos Hardware ESP32
- **Acción pendiente:**
  1. Configurar generación de **Custom Auth Tokens** para cada gateway físico (`claims: { deviceId: 'device_...', organizationId: 'org-...' }`) o mantener el servicio autenticado correspondiente, dado que `database.rules.json` restringe escrituras de dispositivos a SuperAdmin, Admin de la misma organización o token custom con `deviceId === $deviceId` y `organizationId` coincidente.
  2. Probar en banco real con ESP32: desconexión física de DHT11/MQ-2/PM2.5 (`faultFields`), validación de rango ADC/°C/%, apagado de sirena (`comando_web = "APAGAR"`, `silencio_remoto = true`) y corte de red Wi-Fi.
  3. Confirmar respaldo de `customClaims.organizationId` en Firebase Auth si se desea validación estricta basada en claims en Storage además de metadatos.

## 6. Documentación Histórica de Referencia y Variables GitHub Actions
- **Documentos ausentes del repo:** `P031_Codex_revision_MineSafe_Hibrida_27067a2.md`, `P025`, `P026`, `P027`, `P030` no existen actualmente en el árbol local; si se requiere trazabilidad literal por código de hallazgo externo, incorporarlos al repositorio.
- **Variables GitHub Pages (`deploy-pages.yml`):** Confirmar en **Settings → Actions → Variables** los valores opcionales `VITE_PUBLIC_CONTACT_EMAIL`, `VITE_PUBLIC_CONTACT_ENDPOINT` y `VITE_FIREBASE_RTDB_URL`, y verificar que **Settings → Pages → Source** esté fijado en **GitHub Actions**.
