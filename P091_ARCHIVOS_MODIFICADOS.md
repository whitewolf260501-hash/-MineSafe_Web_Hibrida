# P091 — Registro de Archivos Modificados y Creados

## 1. Archivos de código fuente modificados

| Archivo | Propósito del cambio |
| --- | --- |
| `src/types/index.ts` | Se exportó `CommunicationLinkMode`, se agregó `source` a `TelemetryHistoryPoint` y se añadieron campos opcionales en `SensorDevice` para telemetría de banco, metadatos híbridos (`viaPuente`, `gatewayId`, `saltosEspNow`, `msgId`, `fechaHora`, `timestampUnix`, `isSimulated`, `telemetryOrigin`, `isBenchTelemetry`, `sourcePath`, `adcSaturated`, `dustSensorModel`). |
| `src/services/firebase.ts` | Se exportaron constantes P091 y funciones puras (`normalizeServerTimestampMs`, `evaluateDeviceConnectivity`, `classifyCommunicationLink`, `mergeBenchTelemetryIntoPhysicalNode`, `mergeTelemetryHistorySeries`). Se integró la suscripción/fusión de `/diagnostico/esp32_p087` sobre `device_38A839E81F84` sin duplicar nodos, se fusionó `/diagnostico/esp32_p087/historial` con el historial legado, se corrigió el falso positivo de conectividad inicial en `recordDevicePacketArrival`/`mapRTDBDeviceToSensorDevice`, se separó `isBenchTelemetry` del estado operacional crítico, se impidió escalar `4095` como crítico y se actualizaron etiquetas obsoletas (`Sharp GP2Y1010` -> `Sensor óptico OPEN-SMART`, retiro de texto de baliza). |
| `src/services/alertEngine.ts` | Se añadió salvaguarda para omitir telemetría de banco (`device.isBenchTelemetry === true`) evitando alertas operacionales y sirenas desde el prototipo académico; se actualizó el comentario de `4095` a saturación ADC 12 bits / medición no válida. |
| `src/App.tsx` | Se protegió el banner global de emergencia operacional contra `isBenchTelemetry` y saturación ADC `4095`, se pasó `isFirebaseConnected` a `DashboardView` y se actualizaron mensajes de UI que citaban la baliza 12 V retirada del alcance. |
| `src/components/DashboardView.tsx` | Se integró `BenchTelemetryPanel` en la vista principal para el nodo físico `device_38A839E81F84` y se actualizaron textos de tarjetas de capacidades para reflejar Matriz LED MAX7219, Audio I2S y TFT ST7789. |
| `src/components/DualReadingSensorCards.tsx` | Se corrigieron las etiquetas de `4095` a "Saturación ADC (4095) · Medición no válida", se diferenció lectura de banco, se retiró mención de baliza y se corrigió `Sharp GP2Y1010` por `Sensor óptico OPEN-SMART (estimación sin calibración oficial)`. |
| `src/components/ESP32GatewaySection.tsx` | Se corrigió `isDeviceOnline` para evaluar estrictamente `lastUpdateServer` mediante `evaluateDeviceConnectivity`, se incorporaron insignias de enlace híbrido y nodo físico/simulado, y se actualizó la terminología de baliza a señalización de simulación (Matriz LED MAX7219 / Audio I2S / TFT). |
| `src/components/MonitoringView.tsx` | Se añadieron etiquetas visuales para saturación ADC `4095`, modo de enlace híbrido (`Wi-Fi directo`, `ESP-NOW vía gateway`, `Desconectado`, `Origen desconocido`), diferenciación `Banco físico` vs `Simulado` y unidad estimada de polvo óptico. |
| `src/components/HistoricalReportsView.tsx` | Se indicó explícitamente la procedencia fusionada `/historial_telemetria/device_38A839E81F84` + `/diagnostico/esp32_p087/historial` y el modelo OPEN-SMART en el encabezado de reportes. |
| `src/components/Node3DInspectorView.tsx` | Se actualizaron las especificaciones técnicas mostradas en el visor 3D: MQ-2 como ADC bruto 12 bits (`4095` = saturación), sensor óptico de polvo OPEN-SMART (sin calibración oficial) y Matriz LED MAX7219 / Audio I2S / TFT ST7789 (indicando retiro de baliza 12 V y botón BOOT). |
| `src/components/AlertResolutionModal.tsx` | Se reemplazó la redacción "pin flotante 4095 ADC" por "saturación ADC (4095 — medición no válida)". |
| `src/components/SuperAdminControlView.tsx` | Se actualizó la descripción de controles rápidos en barra superior retirando la referencia a baliza. |

## 2. Reglas Firebase y configuración modificadas

| Archivo | Propósito del cambio |
| --- | --- |
| `database.rules.json` | Se incorporó `/diagnostico` con denegación por defecto y `/diagnostico/esp32_p087` con mínimo privilegio (lectura restringida por rol/organización del nodo `device_38A839E81F84`, escritura per-campo para UID `tJgRrlKRwPQOWCkdJiWA54B0JN33` con validaciones de tipo/rango, e historial `append-only` con `.indexOn: ["timestamp"]`). Se amplió `/dispositivos/$deviceId` y `/historial_telemetria/$deviceId/$sampleTs` para autorizar el mismo UID únicamente sobre `device_38A839E81F84` sin permitir borrado ni cambio de organización. **No desplegado automáticamente.** |
| `package.json` | Se registró el script `"test:p091"` y se integró en `"test"`. |

## 3. Archivos nuevos creados

| Archivo | Propósito |
| --- | --- |
| `src/components/BenchTelemetryPanel.tsx` | Panel integrado de telemetría de banco ESP32 con aviso académico/no certificado, estado dual (Firebase RTDB WebSocket vs. recepción de telemetría con timeout 20s), 4 tarjetas de sensores con honestidad metrológica, metadatos híbridos, alcance hardware real e historial fusionado. |
| `tests/test_p091_esp32_integration.ts` | Suite automatizada de los 20 casos obligatorios de P091. |
| `P091_INFORME_INTEGRACION_WEB.md` | Informe técnico de la integración web. |
| `P091_CONTRATO_DATOS_ESP32.md` | Contrato oficial de rutas, métodos REST, payloads y permisos ESP32 ↔ RTDB. |
| `P091_RESULTADOS_PRUEBAS.md` | Resultados exactos de pruebas locales y separación frente a validaciones físicas pendientes. |
| `P091_ARCHIVOS_MODIFICADOS.md` | Este inventario de cambios. |
| `P091_GUIA_DESPLIEGUE.md` | Guía paso a paso para publicación manual de reglas y validación en banco. |
| `P091_PENDIENTES_EXTERNOS.md` | Lista honesta de tareas externas pendientes fuera del alcance de este entorno. |
| `src/data/generatedDocs.ts` | Actualizado automáticamente vía `npm run sync:docs` para incluir los 6 documentos P091 en la vista de documentación del SuperAdministrador. |
