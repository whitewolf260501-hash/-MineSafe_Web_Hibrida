# P092 — Diagnóstico de Causa Raíz: Visualización de Telemetría ESP32 en MineSafe Web

## 1. Resumen Ejecutivo

Se contrastaron las dos evidencias reales proporcionadas:

1. **Firebase Realtime Database (`minefase-fc5f5`) — `/diagnostico/esp32_p087`**:
   - `CO: 4095`
   - `PM2_5: 787.51581`
   - `humedad: 34`
   - `temperatura: 29.3`
   - `last_update_server: 1795653371717` (`2026-11-26T00:36:11.717Z`, 8 segundos antes de la captura de consola)
   - `origen: "P087_BANCO"`
   - `simulado: false`
   - `historial`: presente y con datos
2. **Panel web publicado en GitHub Pages (`whitewolf260501-hash.github.io/...-MineSafe_Web_Hibrida/#/panel`)**:
   - Mostraba `0 / 1 nodos`, `Gateway Desconectado (Sin Transmisión)`, polvo antiguo `727 µg/m³`, temperatura `-- °C · Sin señal`, humedad `-- % · Sin señal` y `Última act.: hace 9 min · Offline`.
   - En la consola de Chrome figuraba el aviso de manifiesto: `Error while trying to use the following icon from the Manifest: https://whitewolf260501-hash.g... (Download error or resource isn't a valid image)`.

El análisis completo del código fuente, reglas de seguridad, configuración de despliegue y captura publicada identificó **seis causas raíz concretas** (una causa primaria de despliegue/caché y cinco defectos o riesgos reales de ejecución en el cliente web):

---

## 2. Causas Raíz Confirmadas

### Causa Raíz 1 (Primaria — Evidencia visual directa): El sitio publicado en GitHub Pages servía un bundle anterior a P091
- **Evidencia**: En la captura del dashboard publicado aparecen los textos exactos **anteriores a P091**:
  - `"Sensor No Conectado (Pin Flotante 4095 ADC)"` (en P091 fue reemplazado por `"Saturación ADC (4095) · Medición no válida"`).
  - `"Sharp GP2Y1010 · Precaución 55 · Crítico 150 µg/m³"` (en P091 fue reemplazado por `"Sensor óptico OPEN-SMART (estimación sin calibración oficial)"`).
  - Ausencia total del componente `BenchTelemetryPanel` y ausencia de un identificador visible de versión/build.
- **Mecanismo técnico**:
  - Los cambios locales de P091 en este entorno no se habían publicado/desplegado todavía en GitHub Pages, o GitHub Pages estaba sirviendo una compilación previa en caché (el archivo `/index.html` de raíz referencia `./assets/app.js` sin hash si Pages sirve desde rama raíz en lugar de `dist/` vía GitHub Actions).
  - Mientras el navegador ejecute el bundle previo a P091, **la web nunca se suscribe a `/diagnostico/esp32_p087`** y solo consulta `/dispositivos/device_38A839E81F84` (donde reside el dato antiguo `PM2_5: 727` de hace 9 minutos).

### Causa Raíz 2 (Permisos RTDB y errores silenciados en UI): Posible `PERMISSION_DENIED` silencioso en `/diagnostico/esp32_p087`
- **Evidencia en código (`src/services/firebase.ts` y `database.rules.json`)**:
  - En `subscribeToRTDBDevicesRaw`, si `onValue(ref(rtdb, 'diagnostico/esp32_p087'))` falla con `PERMISSION_DENIED`, el error solo se enviaba a `console.warn` (o se descartaba sin registro en usuarios no globales) y el dashboard continuaba mostrando los datos viejos de `/dispositivos/device_38A839E81F84` sin informar al SuperAdministrador.
  - En `database.rules.json`, la lectura de `/diagnostico/esp32_p087` exige:
    1. Que las reglas actualizadas estén **publicadas** en `minefase-fc5f5` (si aún corren reglas previas en Firebase Console, `/diagnostico/esp32_p087` queda denegado por defecto).
    2. Que el usuario autenticado cumpla `(auth.token.email === 'manuelcrisostomovega@gmail.com' && auth.token.email_verified === true)` **o** posea ficha activa en `/usuarios/{auth.uid}` con `isActive === true` y rol autorizado (`isSuperUser: true`, `tipoUsuario: 'superadmin'`, `admin_minesafe` o misma organización del nodo).
  - **Caso crítico detectado**: Si el SuperAdmin inicia sesión con `manuelcrisostomovega@gmail.com` pero `email_verified === false` en Firebase Auth y su ficha RTDB está bajo `manual_temp_uid_01` en lugar de `/usuarios/{auth.uid}`, `resolveUserProfileFromAuthUser` permite abrir el panel en memoria pero RTDB rechaza `/diagnostico/esp32_p087` con `PERMISSION_DENIED`.

### Causa Raíz 3 (Desfase de reloj cliente vs. servidor RTDB): Falsos `Desconectado` por uso de `Date.now()` local
- **Evidencia en código (`src/services/firebase.ts` y `src/components/BenchTelemetryPanel.tsx`)**:
  - El ESP32 escribe `last_update_server` con reloj de servidor Firebase (`ServerValue.TIMESTAMP`).
  - `evaluateDeviceConnectivity`, `mapRTDBDeviceToSensorDevice` y `BenchTelemetryPanel` comparaban `last_update_server` contra `Date.now()` del navegador local.
  - Si el reloj del sistema operativo del usuario está adelantado más de 20 segundos respecto al servidor Firebase RTDB, `Date.now() - last_update_server > 20000` marca el nodo como **Desconectado (`0/1 nodos activos`)** aunque el ESP32 esté transmitiendo cada pocos segundos.

### Causa Raíz 4 (Regla de fusión y orden de llegada): Riesgo de bloqueo por marca temporal corrupta o llegada asíncrona
- **Evidencia en código (`src/services/firebase.ts`)**:
  - En `mergeBenchTelemetryIntoPhysicalNode`, la condición `if (existingTs > 0 && benchTs > 0 && existingTs > benchTs) return merged;` permitía que un timestamp corrupto o adelantado en el futuro dentro de `/dispositivos/device_38A839E81F84` bloqueara lecturas vivas de `/diagnostico/esp32_p087`.
  - Además, en el listener global de `subscribeToRTDBDevicesRaw`, si `/diagnostico/esp32_p087` respondía antes de que terminara `/dispositivos` (`devicesLoaded === false`), el snapshot de banco se ignoraba hasta recibir `/dispositivos` (y si `/dispositivos` devolvía error, nunca se materializaba).

### Causa Raíz 5 (Consultas históricas de banco y tarjetas rápidas del dashboard):
- **Historial `/diagnostico/esp32_p087/historial`**:
  - `fetchBenchDiagnosticHistoryFromRTDB` y `subscribeToTelemetryHistory` consultaban `orderByChild('timestamp').startAt(startMs).endAt(endMs)` en milisegundos sin margen NTP superior y sin respaldo por clave si el firmware guardó `timestamp` en segundos (10 dígitos) o bajo `last_update_server`. Tampoco exponían errores de lectura al diagnóstico SuperAdmin.
- **Mini-tarjetas rápidas (`src/App.tsx` y `src/components/DualReadingSensorCards.tsx`)**:
  - Cuando el nodo entra en línea con `CO: 4095` y `PM2_5: 787.51581` en modo banco (`isBenchTelemetry: true`), `App.tsx` evaluaba `4095 >= m.coCritico` y `788 >= m.pm25Critico`, etiquetando erróneamente las mini-tarjetas como `'Crítico'` / `'Polvo Crítico'` en vez de `'Saturación ADC'` y `'Banco OPEN-SMART'`, además de mostrar 5 decimales crudos en polvo.

### Causa Raíz 6 (Manifiesto PWA y archivos estáticos en subruta de GitHub Pages):
- **Evidencia en `public/manifest.json` y `scripts/syncStaticPages.mjs`**:
  - `public/manifest.json` declaraba `"start_url": "/"`, `"scope": "/"` y `"src": "/icon.svg"` con barra inicial absoluta. Al publicarse bajo subruta (`https://whitewolf260501-hash.github.io/<repositorio>/`), el navegador solicitó `https://whitewolf260501-hash.github.io/icon.svg` (404), generando exactamente el warning visible en la consola de Chrome.
  - Además, `scripts/syncStaticPages.mjs` solo copiaba `manifest.json`, `icon.svg` y `sw.js` hacia `/docs/`, omitiendo sincronizarlos con la raíz `/` del repositorio.

---

## 3. Verificación de Alcance y Estado Real

- **Firmware ESP32**: No fue modificado. Los datos confirmados en `/diagnostico/esp32_p087` son válidos y consistentes.
- **Reglas Firebase**: No se abrieron al público ni se debilitaron los requisitos de autenticación (`auth != null`, denegación por defecto, `email_verified` y aislamiento por organización se mantienen intactos). No se ejecutó despliegue automático de reglas.
- **Estado real frente a producción**: Las correcciones de código y pruebas automatizadas están verificadas localmente en el workspace (`Build P092`), pero **el problema en el sitio publicado solo podrá declararse resuelto cuando el usuario publique el build `P092` en GitHub Pages, confirme la publicación de `database.rules.json` en `minefase-fc5f5` y verifique el badge `P092` junto con la telemetría viva en el navegador**.
