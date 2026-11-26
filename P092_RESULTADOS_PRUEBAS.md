# P092 — Resultados de Pruebas y Verificación

**Proyecto:** MineSafe Web Híbrida (`minefase-fc5f5`)  
**Versión de compilación verificada:** `P092` (`MineSafe Web P092`)  
**Alcance:** Validación automatizada local del código web, reglas de seguridad Firebase, compilación de producción, sincronización estática (`/dist`, `/docs`, `/assets`, PWA) y checklist de validación en vivo pendiente de despliegue.

---

## 1. Resumen Ejecutivo de Pruebas Automatizadas (Entorno Local)

Todas las suites de validación ejecutadas tras aplicar las correcciones `P092` finalizaron con **0 fallos**:

| Suite / Comando | Alcance | Resultado | Detalle |
| --- | --- | --- | --- |
| `npm run validate:firebase` | ESLint de `firestore.rules`, validación JSON de `database.rules.json` y `firebase.json` | **PASS** | Sin errores de sintaxis ni reglas abiertas |
| `npm run test:alerts` | Motor de alertas operacionales (`alertEngine`) | **PASS** | 25/25 aserciones aprobadas |
| `npm run test:p013` | Cumplimiento, alertas y conectividad P013 | **PASS** | Todas las aserciones aprobadas |
| `npm run test:audit` | Estabilización de auditoría y ventanas temporales | **PASS** | Todas las aserciones aprobadas |
| `npm run test:p031` | Suite integral de plataforma (34 módulos RBAC, multitenancy, 3D, PWA, CI/CD) | **PASS** | 34/34 módulos aprobados |
| `npm run test:p085` | Reglas de seguridad Firebase, RBAC, higiene de credenciales y 3 firmwares | **PASS** | 8/8 bloques aprobados |
| `npm run test:p091` | Integración ESP32 físico (`/diagnostico/esp32_p087` -> `device_38A839E81F84`) | **PASS** | 20/20 casos aprobados |
| `npm run test:p092` | Corrección de visualización P092, clock-skew, anti-sobrescritura, diagnóstico SuperAdmin y PWA | **PASS** | 31/31 aserciones aprobadas |
| `npm run lint` (`tsc --noEmit`) | Verificación estricta de tipos TypeScript | **PASS** | 0 errores de tipado |
| `npm run build` (`prebuild` + `vite build` + `sync:pages`) | Compilación de producción y sincronización de `/dist`, `/docs`, `/assets` y archivos PWA | **PASS** | Artefactos generados y sincronizados con marcador `P092` |

---

## 2. Detalle de la Suite Específica `P092` (`tests/test_p092_telemetry_fix.ts` — 31/31 PASS)

### Bloque 1 — Identificador de build `P092`, `manifest.json` y Service Worker (5/5 PASS)
- `APP_BUILD_VERSION === 'P092'`.
- `public/manifest.json` usa rutas relativas `"start_url": "./"` y `"scope": "./"` compatibles con subrutas de GitHub Pages.
- `public/manifest.json` referencia `"./icon.svg"` en lugar de `"/icon.svg"`, corrigiendo el error de descarga en Chrome DevTools.
- `public/sw.js` contiene el identificador `minesafe-p092` y mantiene auto-desregistro + purga de cachés antiguos.
- `index.html` expone `<meta name="minesafe-build" content="P092" />`.

### Bloque 2 — Fusión del payload real de `/diagnostico/esp32_p087` sobre `device_38A839E81F84` (12/12 PASS)
Probado con la carga útil real capturada desde Firebase RTDB (`minefase-fc5f5`):
- Entrada simulada de legado en `/dispositivos/device_38A839E81F84`: `PM2_5: 727`, `CO: 4095`, `temperatura: null`, `humedad: null`, `last_update_server` antiguo (hace 9 min).
- Entrada real de banco en `/diagnostico/esp32_p087`: `CO: 4095`, `PM2_5: 787.51581`, `humedad: 34`, `temperatura: 29.3`, `last_update_server: 1795653371717`, `origen: "P087_BANCO"`, `simulado: false`.
- Resultados verificados:
  - Sin duplicación de dispositivos: se mantiene únicamente `device_38A839E81F84`.
  - `gatewayOnline === true`, `status === 'normal'`.
  - `rawTemp === 29.3`, `rawHum === 34`, `rawPM25 === 787.51581` (reemplaza el valor antiguo `727`).
  - `rawCO === 4095` con `adcSaturated === true`.
  - `isBenchTelemetry === true`, `isSimulated === false`, `telemetryOrigin === 'P087_BANCO'`, `sourcePath === '/diagnostico/esp32_p087'`.
  - Metadatos organizacionales (`organizationId`, `siteName`, faena y asignación) conservados intactos.

### Bloque 3 — Protección contra sobrescritura desde `/dispositivos` (2/2 PASS)
- Un registro legado con `last_update_server` corrupto en el futuro (`+1 hora`) y `PM2_5: 727` en `/dispositivos/device_38A839E81F84` **no** bloquea ni sobrescribe la telemetría vigente de `/diagnostico/esp32_p087`.
- El diagnóstico SuperAdmin registra `mergeDecision.applied === true` y `mergeDecision.isOnline === true`.

### Bloque 4 — Compensación de desfase de reloj vía `/.info/serverTimeOffset` (2/2 PASS)
- Simulando un reloj local de PC adelantado `+45 s` respecto al servidor Firebase (`offset = -45000 ms`):
  - Sin compensación (`Date.now()` crudo), una lectura real de hace `5 s` se evaluaría erróneamente como `OFFLINE`.
  - Con `getEstimatedServerNowMs()` (que aplica `/.info/serverTimeOffset`), el mismo nodo se evalúa correctamente como `ONLINE` (`diff = 5 s <= 20 s`).

### Bloque 5 — Timeout configurable de 20 segundos y reconexión (2/2 PASS)
- Tras `21 s` sin actualización (`> 20 s`), el nodo pasa a `isOnline = false` (`isStale = true`).
- Al llegar un nuevo `last_update_server`, vuelve inmediatamente a `isOnline = true`.

### Bloque 6 — Separación estricta de alertas operacionales (1/1 PASS)
- `alertEngine.processDeviceTelemetry(mappedPhysical)` con `CO = 4095` y `PM2_5 = 787.51581` (con `isBenchTelemetry === true`) retorna `highestSeverity: 'normal'`, `newEvents: []`, `recoveredEvents: []`.
- Confirmado que ninguna lectura de banco dispara falsas emergencias mineras.

### Bloque 7 — Normalización de timestamps e historial fusionado (5/5 PASS)
- Conserva epoch en milisegundos de 13 dígitos (`1795653371717`), convierte strings numéricos y normaliza epoch en segundos de 10 dígitos (`* 1000`).
- `mapTelemetrySnapshotRaw` interpreta tanto `timestamp` como `last_update_server` en `/diagnostico/esp32_p087/historial`.
- `mergeTelemetryHistorySeries` conserva el historial legado de `/historial_telemetria` y anexa las muestras nuevas de `/diagnostico/esp32_p087/historial` ordenadas cronológicamente.

### Bloque 8 — Captura de errores reales de Firebase RTDB para SuperAdmin (2/2 PASS)
- Un rechazo `PERMISSION_DENIED` en `/diagnostico/esp32_p087` queda registrado con código y mensaje exactos en el store diagnóstico visible solo para `superadmin`.
- Ruta monitoreada para historial confirmada en `/diagnostico/esp32_p087/historial`.

---

## 3. Verificación de Integridad y Restricciones de Seguridad

- **Firmware ESP32:** No se modificó ningún archivo de firmware.
- **Reglas Firebase (`database.rules.json` / `firestore.rules`):** No se abrieron reglas públicas (`".read": true` / `".write": true`), no se debilitó el aislamiento por organización ni el RBAC por rol, y no se ejecutó despliegue automático sobre Firebase.
- **Identidad de dispositivo:** No se creó ningún dispositivo duplicado; `device_38A839E81F84` sigue siendo el único nodo físico asociado.

---

## 4. Pruebas en Vivo Pendientes (Requieren Acción del Usuario en Producción)

El entorno local valida la lógica y genera los artefactos listos para publicar, pero **no puede afirmar que el sitio publicado en GitHub Pages esté corregido hasta completar estos pasos reales**:

1. **Publicar el build `P092` en GitHub Pages** (`git push` / workflow o carpeta `/docs` + raíz sincronizada) y confirmar en la barra superior que aparece la insignia **`P092`**.
2. **Verificar en Firebase Console (`minefase-fc5f5`)** que las reglas vigentes de Realtime Database incluyen `/diagnostico/esp32_p087` y que la cuenta SuperAdmin cumple `email_verified === true` (o posee perfil activo `/usuarios/{auth.uid}`).
3. **Limpiar caché del navegador y Service Worker** (DevTools -> Application -> Clear site data + recarga forzada) y confirmar que desaparece el warning de descarga del icono en `manifest.json`.
4. **Validar lectura en vivo en el Dashboard publicado** con el ESP32 transmitiendo `[DATOS OK]` y `[HISTORIAL OK]`:
   - `1 / 1 nodos` activos.
   - `device_38A839E81F84` en línea con temperatura (~`29.3 °C`), humedad (~`34 %`), polvo OPEN-SMART (~`787.5`), y MQ-2 (`4095` marcado como `Saturación ADC`, no como fallo crítico operativo).
   - Ejecutar el botón **Ejecutar Sonda Diagnóstica RTDB** en el panel diagnóstico SuperAdmin y confirmar estado `OK` sin `PERMISSION_DENIED`.
