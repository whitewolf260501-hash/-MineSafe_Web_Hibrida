# P092 — Correcciones Aplicadas en la Aplicación Web MineSafe

Este documento detalla todas las correcciones implementadas en el código web de MineSafe (sin modificar el firmware ESP32, sin duplicar dispositivos ni registros históricos y sin debilitar las reglas de seguridad de Firebase).

---

## 1. Identificador Visible de Versión (`P092`)

Para eliminar cualquier ambigüedad sobre si GitHub Pages o el navegador está sirviendo una versión antigua en caché:
- **`src/services/firebase.ts`**: Se exportaron `APP_BUILD_VERSION = 'P092'` y `APP_BUILD_LABEL = 'MineSafe Web P092'`.
- **`src/components/Navbar.tsx`**: Se agregó el badge visible **`P092`** junto al logotipo `MineSafe IoT`.
- **`src/components/BenchTelemetryPanel.tsx`**: Se muestra **`Build P092`** en la cabecera del panel de telemetría de banco y en la consola de diagnóstico SuperAdmin.
- **`src/App.tsx`**: Se incorporó **`Build P092`** en el pie de página del panel.
- **`index.html`**: Se agregó `<meta name="minesafe-build" content="P092" />` preservando intactos los marcadores de transformación de Vite.

---

## 2. Sincronización de Reloj Servidor Firebase (`/.info/serverTimeOffset`)

- **`src/services/firebase.ts`**:
  - Se implementó `startServerTimeOffsetSync()`, `getRTDBServerTimeOffsetMs()` y `getEstimatedServerNowMs()` (`Date.now() + rtdbServerTimeOffsetMs`).
  - `evaluateDeviceConnectivity` y `mapRTDBDeviceToSensorDevice` utilizan `getEstimatedServerNowMs()` por defecto.
  - Esto evita que un desfase horario del sistema operativo o navegador del usuario marque falsamente como desconectado un nodo ESP32 cuya marca `last_update_server` (13 dígitos en milisegundos) está vigente dentro del timeout configurable de **20 segundos**.
- **`src/App.tsx` y `src/components/BenchTelemetryPanel.tsx`**:
  - El refresco periódico de conectividad y el contador cada segundo utilizan `getEstimatedServerNowMs()`.

---

## 3. Fusión Protegida contra Sobrescritura (`mergeBenchTelemetryIntoPhysicalNode`) y Suscripciones Post-Auth

- **`src/services/firebase.ts`**:
  - `mergeBenchTelemetryIntoPhysicalNode` mantiene intacta la asociación sobre el dispositivo existente **`device_38A839E81F84`** (sin crear duplicados ni alterar empresa, faena, sector, cuadrilla ni contratos).
  - **Garantía anti-sobrescritura**: Una lectura antigua (como `PM2_5: 727`) o una marca temporal corrupta adelantada al futuro (`> serverNowMs + 60s`) en `/dispositivos/device_38A839E81F84` **nunca sobrescribe ni bloquea** las lecturas vigentes de `/diagnostico/esp32_p087` (`CO`, `PM2_5`, `temperatura`, `humedad`, `last_update_server`, `origen`, `simulado`).
  - En `subscribeToRTDBDevicesRaw` (ámbito SuperAdmin / Admin MineSafe), la telemetría de `/diagnostico/esp32_p087` se fusiona inmediatamente sobre `device_38A839E81F84` incluso si `/dispositivos` tarda en responder o reporta error, y se combina automáticamente con los metadatos de `/dispositivos` en cuanto llegan.
- **`src/App.tsx`**:
  - Se agregó seguimiento explícito de `onAuthStateChanged(auth, ...)` (`authSessionReady` y `authSessionUid` dentro de `subscriptionScope`), asegurando que las suscripciones operativas RTDB inicien **después** de confirmarse la sesión de Firebase Authentication y se reenganchen limpiamente si cambia la sesión o el SuperAdmin pulsa **Reconectar Listeners**.

---

## 4. Sección de Diagnóstico Real Exclusiva de SuperAdministrador

- **`src/services/firebase.ts`**:
  - Se creó el estado reactivo `BenchTelemetryDiagnostics` (`subscribeToBenchDiagnostics`, `getBenchDiagnosticSnapshot`, `runSuperAdminBenchProbe`) que captura en tiempo real:
    - Proyecto Firebase (`minefase-fc5f5`), URL RTDB, estado WebSocket (`.info/connected`) y desfase de reloj (`.info/serverTimeOffset`).
    - Estado real de Firebase Auth (`UID`, `email`, `email_verified`, existencia y flags de `/usuarios/{uid}`).
    - Estado y **errores reales exactos** (p. ej. `PERMISSION_DENIED`) de `/dispositivos`, `/diagnostico/esp32_p087` y `/diagnostico/esp32_p087/historial`.
    - Payload crudo recibido en `/diagnostico/esp32_p087` y decisión exacta de `mergeBenchTelemetryIntoPhysicalNode` (motivo, timestamp efectivo, diferencia en segundos, timeout y estado `ONLINE`/`OFFLINE`).
- **`src/components/BenchTelemetryPanel.tsx` y `src/components/DashboardView.tsx`**:
  - Se renderiza el bloque **Diagnóstico Real Firebase RTDB & Permisos (Exclusivo SuperAdmin · P092)** únicamente cuando `currentUser?.role === 'superadmin'`.
  - Incluye aviso explícito si `email_verified === false` en Firebase Auth y botones de **Ejecutar Sonda Diagnóstica RTDB** y **Reconectar Listeners**.

---

## 5. Tarjetas Existentes del Dashboard e Historial Integrado

- **`src/App.tsx` y `src/components/DualReadingSensorCards.tsx`**:
  - Las tarjetas diagnósticas principales y las 6 mini-tarjetas rápidas reflejan en vivo `temperatura` (`29.3 °C`), `humedad` (`34 %`), `PM2_5` (`787.5 µg/m³`, formateado a 1 decimal, modelo OPEN-SMART sin calibración oficial) y `CO` (`4095`, etiquetado explícitamente como **Saturación ADC / Medición no válida** sin generar falsas etiquetas críticas operacionales).
  - Se añadió badge discreto indicando la fuente `/diagnostico/esp32_p087 · P087_BANCO` cuando la telemetría de banco está activa.
  - Se mantiene la separación estricta entre telemetría experimental de banco y alertas operacionales de seguridad minera (`alertEngine` genera 0 alertas mineras por muestras de banco).
- **`src/services/firebase.ts` (Historial)**:
  - `mapTelemetrySnapshotRaw` acepta ahora también `last_update_server` y normaliza marcas en segundos (10 dígitos) y milisegundos (13 dígitos).
  - `fetchBenchDiagnosticHistoryFromRTDB` y `subscribeToTelemetryHistory` aplican margen NTP superior (`+60s`), respaldo acotado `limitToLast` cuando las claves no coinciden con consulta indexada en milisegundos, y reportan cualquier error real de Firebase al panel de diagnóstico SuperAdmin.

---

## 6. Corrección de Manifiesto PWA, Service Worker y Caché de GitHub Pages

- **`public/manifest.json`**: Se corrigieron `"start_url": "./"`, `"scope": "./"` y `"src": "./icon.svg"` para compatibilidad con subrutas de GitHub Pages, eliminando el error de descarga de icono observado en Chrome DevTools.
- **`public/sw.js`**: Se actualizó la versión de limpieza a `minesafe-p092`, manteniendo auto-desregistro y purga de cachés antiguos.
- **`scripts/syncStaticPages.mjs`**: Ahora sincroniza `.nojekyll`, `icon.svg`, `manifest.json` y `sw.js` tanto en `/docs/` como en la raíz `/` junto con los bundles compilados de Vite (`app-[hash].js`, `index-[hash].css`).
