# P094 — Actualización Web: Integración Aislada de Equipo Experimental V2 (`device_38A839E81F84_V2`)

## 1. Alcance y principios aplicados

- Se trabajó directamente sobre el código web existente de MineSafe (base P092), sin reconstruir la aplicación, sin modificar firmware ESP32, sin ampliar permisos en `database.rules.json` ni `firestore.rules`, y sin desplegar reglas automáticamente.
- El dispositivo `device_38A839E81F84_V2` se integra exclusivamente como **equipo experimental de banco sin asignación operativa**, leyendo únicamente:
  - Estado en vivo: `/dispositivos/device_38A839E81F84_V2`
  - Historial separado: `/dispositivos/device_38A839E81F84_V2/historial`
- **Cero fusión con el nodo original**: nunca se mezcla ni sobrescribe sobre `device_38A839E81F84` ni sobre `/diagnostico/esp32_p087`.

## 2. Cambios implementados

### 2.1 Tipos, control de acceso y motor de alertas
- `src/types/index.ts`:
  - Agregada fuente histórica `'dispositivos_v2_historial'` en `TelemetryHistoryPoint['source']`.
  - Agregada bandera `isExperimentalBench?: boolean` en `SensorDevice`.
- `src/utils/accessControl.ts`:
  - Exportados `EXPERIMENTAL_BENCH_V2_DEVICE_ID = 'device_38A839E81F84_V2'`, `isExperimentalBenchDeviceId(...)` y `canAccessExperimentalBenchDevice(user)` (estrictamente `true` solo para `superadmin` y `admin_minesafe` con estado `'activo'`, alineado con `database.rules.json` para dispositivos sin `organizationId`).
  - `isDeviceVisibleToUser(...)` retorna siempre `false` para `device_38A839E81F84_V2` para impedir filtración a listas, KPIs o vistas operacionales.
- `src/services/alertEngine.ts`:
  - `processDeviceTelemetry(...)` excluye inmediatamente `device.isExperimentalBench === true` o `device.id === 'device_38A839E81F84_V2'` sin modificar las reglas de alarma de dispositivos operacionales existentes.

### 2.2 Servicios Firebase RTDB (`src/services/firebase.ts`)
- Identificador de build actualizado a `P094` (`APP_BUILD_VERSION = 'P094'`, `index.html` `<meta name="minesafe-build" content="P094" />`, `public/sw.js` `minesafe-p094`).
- `mergeBenchTelemetryIntoPhysicalNode(...)`, `subscribeToRTDBDevicesRaw(...)`, `extractAlarmAuditRecords(...)` y `recordTelemetryHistoryPoint(...)` excluyen `device_38A839E81F84_V2` del flujo operacional y garantizan que nunca se fusione sobre `device_38A839E81F84`.
- `mapRTDBDeviceToSensorDevice(...)` fuerza para `device_38A839E81F84_V2`: `organizationId: '__unassigned__'`, `assignmentStatus: 'en_inventario'`, `isExperimentalBench: true`, `alarmaActiva: false`, `sourcePath: '/dispositivos/device_38A839E81F84_V2'`, sin `siteId`/`crewId`, y detección de par DHT `0/0` o `null`/`NaN` como ausente.
- Bloqueo explícito de comandos operacionales (`assertNotExperimentalBenchOperationalCommand` y `filterOutExperimentalBenchDeviceIds`) aplicado en `toggleGatewayAlarmInRTDB`, `shutdownAlarmCompletelyInRTDB`, `resetGatewayDataInRTDB`, `toggleGatewayLightInRTDB` y `broadcastDrillToRTDB`.
- Rutas históricas separadas: `fetchExperimentalBenchV2History`, `subscribeToExperimentalBenchV2History` y desvío exclusivo en `fetchPaginatedTelemetryHistory` / `subscribeToTelemetryHistory` para leer únicamente `/dispositivos/device_38A839E81F84_V2/historial`.
- Clasificador determinista `classifyExperimentalBenchReadings(...)`:
  - Conectividad estricta basada en `last_update_server`, `/.info/serverTimeOffset` y timeout configurable (`20s` por defecto); en desconexión todos los canales pasan a `DESCONECTADO` / `N/D`.
  - `MQ-2 = 4095` clasificado como `saturado_invalido` (`4095 (SAT)` · `NO VÁLIDO · SATURADO`, nunca ppm ni alarma); `0–4094` como `RAW · SIN CALIBRAR`.
  - Polvo óptico (`OPEN-SMART`) clasificado como `estimado_no_calibrado` (`ESTIMADO · NO CALIBRADO`, nunca PM2.5 certificado).
  - DHT ausente (`null`/`NaN`/fuera de rango o par `0/0`) clasificado como `N/D · DHT AUSENTE`.
- Suscripción y sondeo dedicados (`subscribeToExperimentalBenchV2`, `probeExperimentalBenchV2InRTDB`) restringidos a roles autorizados.

### 2.3 Interfaz de usuario
- `src/components/ExperimentalBenchV2Panel.tsx`:
  - Renderiza únicamente si `canAccessExperimentalBenchDevice(currentUser)` es verdadero.
  - Muestra estado RTDB, conectividad con `last_update_server`, aislamiento operacional explícito, 4 tarjetas con clasificación honesta, errores reales de Firebase RTDB, gráfico + tabla de historial separado (`/dispositivos/device_38A839E81F84_V2/historial`) y botones de solo lectura (`Sondear V2 en RTDB` y `Reconectar`). No expone ningún comando operacional.
- `src/App.tsx` y `src/components/DashboardView.tsx`:
  - Suscripción a `device_38A839E81F84_V2` iniciada solo después de `authSessionReady` y solo para roles autorizados.
  - Defensa en profundidad filtrando `isExperimentalBenchDevice` en `visibleDevices`, `collectPropagationDeviceIds` y `operationalDevices` de `DashboardView`.

### 2.4 Pruebas automatizadas
- `tests/test_p094_experimental_v2.ts` (registrada como `npm run test:p094` e integrada en `npm test`): 56 aserciones cubriendo build/reglas sin ampliar permisos, autorización/denegación de roles, identidad sin asignación y cero fusión, historial separado, aislamiento de alertas sin regresión operacional, bloqueo de los 5 comandos operacionales, desconexión/offset de servidor, honestidad de clasificación y regresión del nodo físico original `device_38A839E81F84`.
- `tests/test_p092_telemetry_fix.ts`: actualizada únicamente la aserción de etiqueta de build para aceptar `P092` o `P094`.

## 3. Resultados reales verificados en este entorno

- `npm run validate:firebase`: **APROBADO** (`eslint firestore.rules`, `database.rules.json OK`, `firebase.json OK`).
- `npm test` (8 suites completas): **APROBADO** sin fallos:
  - `test:alerts`, `test:p013`, `test:audit`, `test:p031`, `test:p085`: **PASS**
  - `test:p091`: **20/20 PASS**
  - `test:p092`: **31/31 PASS**
  - `test:p094`: **56/56 PASS**
- Verificación de tipos (`tsc --noEmit`) y compilación de producción (`npm run build`): ejecutadas al cierre del cambio.

## 4. Pendientes externos (fuera de este entorno)

1. **Despliegue público (GitHub Pages / hosting)**: publicar el artefacto compilado con build `P094` y verificar recarga limpia (Service Worker `minesafe-p094` purga cachés previas).
2. **Firebase Console (`minefase-fc5f5`) — escritura del firmware V2 y reglas activas**:
   - No se modificaron ni desplegaron reglas desde este entorno.
   - En `database.rules.json`, la lectura de `/dispositivos/device_38A839E81F84_V2` (sin `organizationId`) ya está restringida a `superadmin` y `admin_minesafe`.
   - Para la **escritura del hardware V2**, verificar en Firebase Console que la cuenta Auth o token del firmware V2 tenga permiso de escritura específico para `device_38A839E81F84_V2` (actualmente el UID hardcoded `tJgRrlKRwPQOWCkdJiWA54B0JN33` en `database.rules.json` está acotado exclusivamente a `device_38A839E81F84`).
3. **Validación en banco con hardware real V2 y sesiones reales**:
   - Verificar con sesión real de `superadmin`/`admin_minesafe` la recepción en vivo de `/dispositivos/device_38A839E81F84_V2` y `/historial`.
   - Verificar con sesión real de `operador`/`supervisor`/`admin` que la vista experimental no aparece y RTDB deniega lectura directa.
   - Confirmar desconexión física (>20s) y coexistencia en vivo con `device_38A839E81F84`.
