# P092 — Guía de Despliegue, Reglas Firebase y Validación en Vivo

Esta guía detalla los pasos manuales requeridos para publicar la versión **`P092`** en GitHub Pages, confirmar las reglas de seguridad de Firebase Realtime Database en `minefase-fc5f5` y verificar en el navegador que la telemetría viva del ESP32 se visualiza correctamente.

> **Importante**: Ningún cambio en `database.rules.json` ni despliegue a GitHub Pages se ejecuta automáticamente desde este entorno. El incidente no debe declararse cerrado en producción hasta completar la verificación del paso 4.

---

## Paso 1: Verificar y publicar reglas RTDB en Firebase Console (`minefase-fc5f5`)

1. Abrir **Firebase Console** -> proyecto **`minefase-fc5f5`** -> **Realtime Database** -> pestaña **Reglas**.
2. Confirmar que el contenido publicado coincide con el archivo local `database.rules.json` del repositorio (mantiene denegación por defecto `".read": false, ".write": false`, autenticación obligatoria `auth != null`, aislamiento por organización y acceso al nodo `/diagnostico/esp32_p087` para SuperAdmin, usuarios autorizados de la organización del nodo físico y el UID del ESP32 `tJgRrlKRwPQOWCkdJiWA54B0JN33`).
3. **No abrir** las reglas a `".read": true` ni `".write": true`.
4. Verificar la cuenta del SuperAdministrador en **Firebase Console -> Authentication -> Users**:
   - Confirmar el **UID** real del SuperAdministrador (`manuelcrisostomovega@gmail.com`).
   - Confirmar si su correo tiene **`email_verified = true`**.
   - **Recomendación de seguridad**: Confirmar además que en Realtime Database exista `/usuarios/{UID_REAL_DEL_SUPERADMIN}` con `isActive: true`, `isSuperUser: true` y `tipoUsuario: "superadmin"` (si solo existe bajo `manual_temp_uid_01` y `email_verified` es `false`, las reglas rechazarán la lectura con `PERMISSION_DENIED`).

---

## Paso 2: Compilar y publicar la versión `P092` en GitHub Pages

Desde el repositorio local conectado a GitHub:

```bash
npm install
npm run validate:firebase
npm run lint
npm test
npm run build
```

Luego confirmar que los archivos actualizados (`src/`, `public/`, `index.html`, `docs/`, `assets/`, `manifest.json`, `icon.svg`, `sw.js`, `404.html`, `tests/`, `P092_*.md`) queden incluidos en el commit y hacer `git push` a la rama `main`:

```bash
git status
git add .
git commit -m "P092: correccion visualizacion telemetria ESP32 y diagnostico SuperAdmin"
git push origin main
```

Verificar en **GitHub -> Actions -> Deploy MineSafe to GitHub Pages**:
- Confirmar que el workflow `.github/workflows/deploy-pages.yml` termina en estado verde (`build` + `deploy`).
- En **GitHub -> Settings -> Pages**, confirmar preferiblemente **Source: GitHub Actions** (así se sirven siempre los archivos con hash `dist/assets/app-[hash].js` en lugar de archivos estáticos sin hash).

---

## Paso 3: Limpiar caché y Service Worker en el navegador

Al abrir la URL publicada de GitHub Pages:

1. Abrir **Chrome DevTools** (`F12`) -> pestaña **Application** (Aplicación):
   - En **Service Workers**: si aparece alguno antiguo, pulsar **Unregister**.
   - En **Storage / Cache Storage**: pulsar **Clear site data** (o borrar entradas antiguas de caché).
2. Recargar forzadamente con `Ctrl + Shift + R` (Windows/Linux) o `Cmd + Shift + R` (macOS).
3. Verificar en **Elements (`<head>`)** o en la barra superior del panel que aparezca visiblemente el identificador **`P092`**:
   - Badge **`P092`** junto a `MineSafe IoT` en la barra superior.
   - Badge **`Build P092`** en la cabecera del panel **Telemetría de Banco** y en el pie de página.
   - Meta tag `<meta name="minesafe-build" content="P092">` en el HTML.
4. Verificar en **Console** que el aviso `Error while trying to use the following icon from the Manifest` haya desaparecido.

---

## Paso 4: Checklist de Validación Real con el ESP32 Transmitiendo

Con el ESP32 encendido y mostrando `[DATOS OK]` / `[HISTORIAL OK]` en el monitor serial:

1. **Confirmar diagnóstico SuperAdmin (nuevo bloque en `BenchTelemetryPanel`)**:
   - Hacer clic en **"Ejecutar Sonda Diagnóstica RTDB"**.
   - Verificar `UID`, `email`, `email_verified`, estado de `/diagnostico/esp32_p087` = **`OK`** (sin `PERMISSION_DENIED`), `Fusión aplicada: SÍ (Banco activo)`, `Conectividad: ONLINE` y desfase `.info/serverTimeOffset`.
   - Si aparece `PERMISSION_DENIED`, revisar inmediatamente el Paso 1 (reglas no publicadas o `email_verified: false` sin `/usuarios/{uid}`).
2. **Confirmar tarjetas existentes del Dashboard**:
   - Contador superior: **`1 / 1 Nodos Online`** (para `device_38A839E81F84`).
   - Tarjeta **Confort Térmico (DHT11)** y mini-tarjetas: temperatura en vivo (ej. `29.3 °C`) y humedad en vivo (ej. `34 %`), ya no `-- °C · Sin señal`.
   - Tarjeta **Polvo PM2.5 / Suspensión**: valor en vivo de `/diagnostico/esp32_p087` (ej. `787.5 µg/m³`, ya no `727` antiguo) con etiqueta OPEN-SMART sin calibración oficial.
   - Tarjeta **Monóxido / Gases (MQ-2)**: `4095` identificado como **Saturación ADC (4095) · Medición no válida** sin generar alertas operacionales de seguridad minera.
3. **Confirmar historial y gráficas**:
   - En el panel **Historial Integrado del Nodo** y en **Historial y Reportes**, comprobar que aparecen muestras procedentes de `/diagnostico/esp32_p087/historial`.
4. **Confirmar timeout de 20 segundos**:
   - Desconectar/pausar el ESP32: tras superar **20 segundos** sin nueva marca `last_update_server`, el nodo debe pasar automáticamente a **Desconectado**.
   - Reconectar el ESP32: al llegar una nueva lectura, debe volver a **En línea** sin recargar la página.
