# MineSafe — Propuesta de ajustes mínimos antes de la defensa

**Fecha:** 19-11-2026
**Estado:** propuesta. No se aplicó ningún cambio al código ni a las reglas. La decisión de aplicarlos es del grupo y de quien mantiene el código.
**Base:** versión del `.zip` recibida el 19-11-2026, 18:11.
**Criterio:** cambios de pocas líneas que evitan contradicciones visibles en la demostración, sin agregar funciones nuevas.

La auditoría propuso **cuatro** ajustes. Los tres primeros tocan lo que se ve o lo que se puede leer en el repositorio; el cuarto es solo de orden y es el más prescindible.

---

## Ajuste 1 — Unificar los umbrales de MQ-2 y PM2.5 con el firmware

**Problema:** el nodo, la tarjeta de estado de la web y el motor de alertas usan umbrales distintos. Además, el firmware envía PM2.5 en µg/m³, pero el motor de alertas lo trata como "ADC raw". Ejemplo: 160 µg/m³ es crítico en el nodo y "normal" para el motor de alertas.

**Valores que ya están en el código:**

| Variable | Firmware | Tarjeta de estado web (`firebase.ts:L292-L295`) | Motor de alertas por defecto (`firebase.ts:L3263-L3277`) |
|---|---|---|---|
| MQ-2 (ADC) | precaución 350 / crítico 500 | advertencia 350 / crítico 500 | 300 / 800 / 1200 |
| PM2.5 | precaución 55 / crítico 150 µg/m³ | advertencia 55 / crítico 150 | 350 / 750 / 1200 "ADC raw" |

**Valores propuestos para el motor de alertas:**

| Variable | Preventivo | Advertencia | Crítico |
|---|---|---|---|
| MQ-2 (ADC) | **[definir, menor que 350]** | 350 | 500 |
| PM2.5 (µg/m³) | **[definir, menor que 55]** | 55 | 150 |

> **Decisión pendiente del grupo:** el firmware solo tiene dos niveles y la web exige tres en orden estrictamente creciente (`AlertConfigurationView.tsx:L377-L379`). Hay que definir el valor del nivel preventivo; no lo invento.

### Opción A — Sin tocar código (recomendada)

1. Entrar al panel como superadministrador.
2. Abrir **Configuración de alertas → Global**.
3. Cargar los valores de la tabla anterior en MQ-2 y PM2.5 y guardar.

Funciona porque la configuración guardada en la RTDB tiene prioridad sobre los valores por defecto del código (`firebase.ts:L3329-L3330`). Limitación: la etiqueta de unidad de PM2.5 seguirá diciendo "ADC raw" en el panel.

### Opción B — Cambiar los valores por defecto en el código

Archivo `src/services/firebase.ts`, bloque `DEFAULT_GLOBAL_THRESHOLDS`:

```diff
   pm25: {
     activo: true,
     notificaciones: true,
-    preventivo: 350,
-    advertencia: 750,
-    critico: 1200,
-    unidad: 'ADC raw',
+    preventivo: /* [definir, < 55] */,
+    advertencia: 55,
+    critico: 150,
+    unidad: 'µg/m³',
     minVal: 0,
     maxVal: 4095,
-    label: 'Partículas PM2.5 (Sensor Óptico ADC)',
-    descripcion: 'Lectura analógica bruta de 12 bits (0-4095) del ESP32. Valores de ejemplo referenciales sin calibración gravimétrica oficial.'
+    label: 'Partículas PM2.5 (Sharp GP2Y1010)',
+    descripcion: 'Densidad estimada en µg/m³ por el firmware con conversión lineal genérica. Sin calibración gravimétrica oficial.'
   },
   mq2: {
     activo: true,
     notificaciones: true,
-    preventivo: 300,
-    advertencia: 800,
-    critico: 1200,
+    preventivo: /* [definir, < 350] */,
+    advertencia: 350,
+    critico: 500,
     unidad: 'ADC raw',
```

Notas de la opción B:
- Solo se aplica si **no** hay una configuración global ya guardada en la RTDB. Si existe, igual hay que hacer la opción A.
- Las pruebas automáticas no dependen de este bloque: `tests/test_alert_engine.ts` usa su propia configuración de prueba.
- Quedan otras etiquetas "PM2.5 (ADC)" en la interfaz (`App.tsx:L937`, `AlertsView.tsx:L1383`, `InteractiveDeviceChartAndUsers.tsx:L609`, `MonitoringView.tsx:L841`, `accessControl.ts:L498`). Cambiarlas es solo texto, pero amplía el ajuste; queda a criterio del grupo.

---

## Ajuste 2 — Rotular el control de alarma de la web como "registro en plataforma"

**Problema:** el botón de la web escribe `comando_web` y `silencio_remoto` en Firebase, pero el firmware no lee nada de la base de datos. La sirena física no se enciende ni se apaga desde la web. Los textos actuales dicen lo contrario.

**Cambio propuesto:** solo textos; la lógica queda igual.

**`src/components/Navbar.tsx`**

```diff
                   title={
                     isAlarmActive
-                      ? 'Alarma y baliza activas - Clic para apagar y propagar a todos los nodos'
-                      : 'Alarma inactiva - Clic para activar sirena y baliza en nodos vinculados'
+                      ? 'Alarma registrada en la plataforma - Clic para cerrarla. La sirena física se silencia desde el nodo.'
+                      : 'Registrar una alarma en la plataforma. La sirena física se controla desde el nodo.'
                   }
```

```diff
                   <span className="text-[11px] font-bold">
-                    {isAlarmActive ? 'Apagar Alarma' : 'Alarma'}
+                    {isAlarmActive ? 'Cerrar alarma' : 'Registrar alarma'}
                   </span>
```

**`src/components/ESP32GatewaySection.tsx`**

```diff
       showNotification(
         nextActive
-          ? `Alarma sonora y baliza luminosa activadas automáticamente en ${nodesLabel} (${group.sectorLabel}).`
-          : `Alarma y baliza luminosa apagadas en ${nodesLabel} (${group.sectorLabel}).`
+          ? `Alarma registrada en la plataforma para ${nodesLabel} (${group.sectorLabel}). La sirena física se controla desde el nodo.`
+          : `Alarma cerrada en la plataforma para ${nodesLabel} (${group.sectorLabel}). Para silenciar la sirena física, use el botón del nodo o su portal local.`
       );
```

```diff
-                            <span>{isBusy ? 'Enviando...' : 'Apagar Alarma y Baliza'}</span>
+                            <span>{isBusy ? 'Enviando...' : 'Cerrar alarma en plataforma'}</span>
```

```diff
-                            <span>{isBusy ? 'Enviando...' : 'Activar Alarma'}</span>
+                            <span>{isBusy ? 'Enviando...' : 'Registrar alarma'}</span>
```

Ubicación en la versión auditada: `Navbar.tsx:L306-L307` y `L316`; `ESP32GatewaySection.tsx:L229-L230`, `L585` y `L590`.

**Alternativa sin cambiar código:** no usar ese botón durante la demostración y declararlo en el informe como función de plataforma, con el control físico en el nodo.

---

## Ajuste 3 — Exigir correo verificado en el acceso del superadministrador

**Problema:** las reglas dan acceso total a quien tenga el correo `manuelcrisostomovega@gmail.com` en su sesión, sin comprobar que el correo esté verificado.

**Cambio propuesto (buscar y reemplazar):**

**`database.rules.json`** — 65 apariciones:

```text
Buscar:      auth.token.email === 'manuelcrisostomovega@gmail.com'
Reemplazar:  (auth.token.email === 'manuelcrisostomovega@gmail.com' && auth.token.email_verified === true)
```

**`storage.rules`** — función `isPrimarySuperAdmin()`, línea 6:

```diff
     function isPrimarySuperAdmin() {
-      return request.auth != null && request.auth.token.email == 'manuelcrisostomovega@gmail.com';
+      return request.auth != null && request.auth.token.email == 'manuelcrisostomovega@gmail.com'
+        && request.auth.token.email_verified == true;
     }
```

Comprobado en una copia: el `database.rules.json` resultante sigue siendo JSON válido y queda con 65 condiciones `email_verified === true`.

**Precauciones de este ajuste:**
- **Antes**, confirmar en la consola de Firebase (Authentication → Usuarios) que la cuenta de Manuel tiene el correo verificado. Si no lo está, perdería el acceso de superadministrador cuando se publiquen las reglas.
- El cambio queda **solo en el repositorio**. Solo tiene efecto cuando se publiquen las reglas, y publicarlas no se recomienda antes de la defensa (ver la precaución 1).
- `firestore.rules` ya incluye esta verificación; no requiere cambios.

---

## Ajuste 4 (opcional) — Dejar el firmware como archivo propio y reproducible

**Problema:** el firmware está guardado como un archivo pegado sin extensión dentro de `public/assets/aistudio/`, sin placa ni versiones de librerías.

**Cambio propuesto:**
1. Copiar `public/assets/aistudio/Paste_November_11__2026_-_8_23PM_1a02a4e5` a `firmware/nodo_esp32/nodo_esp32.ino`.
2. Crear `firmware/nodo_esp32/README.md` con esta plantilla y completarla con los datos del IDE donde se compila:

```markdown
# Firmware nodo ESP32 — MineSafe

- Placa: [completar, ej. modelo exacto de la placa ESP32]
- Core Arduino-ESP32: [completar versión]
- Firebase_ESP_Client (Mobizt): [completar versión]
- DHTesp: [completar versión]
- TFT_eSPI: [completar versión]
- Configuración de pines del display (User_Setup.h): [completar o adjuntar archivo]
- Estado: versión usada en el prototipo de la defensa.
```

No hace falta borrar las copias actuales: el proceso de build ya excluye `assets/aistudio` del sitio publicado.
