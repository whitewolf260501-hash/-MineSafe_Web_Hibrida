# P091 — Informe de Integración Web del Firmware ESP32 en MineSafe

## 1. Resumen ejecutivo

Se integró la telemetría del firmware actualizado del nodo físico ESP32 en la plataforma web existente de **MineSafe** sobre el proyecto Firebase `minefase-fc5f5` (`https://minefase-fc5f5-default-rtdb.firebaseio.com`), manteniendo intactos el diseño visual oscuro, los usuarios, los contratos, las asignaciones, el catálogo de equipos y los registros históricos previos.

El desajuste detectado en diagnóstico —donde el firmware actualizado escribe en `/diagnostico/esp32_p087` mientras la plataforma consultaba únicamente `/dispositivos/device_38A839E81F84`— quedó resuelto mediante una fusión determinista en la capa de servicios (`src/services/firebase.ts`) que proyecta las lecturas vivas e históricas sobre el nodo existente `device_38A839E81F84` **sin duplicar dispositivos** y **sin sobrescribir metadatos organizacionales ni contratos**.

> **Estado honesto del proyecto:** La integración del lado de la plataforma web, las reglas de seguridad de mínimo privilegio en el repositorio (`database.rules.json`) y las pruebas automatizadas locales están implementadas y verificadas. La publicación manual de reglas en `minefase-fc5f5` y las pruebas en vivo con hardware físico ESP32 y gateway quedan registradas como pendientes externos (ver `P091_PENDIENTES_EXTERNOS.md`).

---

## 2. Arquitectura de integración implementada

### 2.1 Identificadores preservados
- **Proyecto Firebase:** `minefase-fc5f5`
- **Realtime Database:** `https://minefase-fc5f5-default-rtdb.firebaseio.com`
- **Nodo físico existente:** `device_38A839E81F84`
- **Nodo simulado:** `device_9F4C2A7E1B08`
- **Gateway ESP-NOW:** `gateway_ESP32_DEVKIT_V1`
- **Cuenta Firebase Auth del nodo físico:** `esp32-nodo-fisico@minesafe.example`
- **UID del nodo físico:** `tJgRrlKRwPQOWCkdJiWA54B0JN33`
- **SuperAdministrador verificado:** `manuelcrisostomovega@gmail.com`

### 2.2 Fusión sin duplicación (`/diagnostico/esp32_p087` -> `device_38A839E81F84`)
1. `subscribeToRTDBDevicesRaw` y `forceRefreshDevicesFromRTDB` escuchan en paralelo `/dispositivos` (respetando aislamiento por organización) y `/diagnostico/esp32_p087`.
2. `mergeBenchTelemetryIntoPhysicalNode` aplica las variables vivas (`CO`, `PM2_5`, `temperatura`, `humedad`, `simulado`, `origen`, `last_update_server`, `via`, `via_puente`, `gateway_id`, `saltos_espnow`, `msgId`, `fecha`, `hora`, `fecha_hora`, `timestamp_unix`) sobre `device_38A839E81F84` únicamente cuando el nodo físico está autorizado dentro del alcance del usuario/organización y la marca temporal de banco es igual o más reciente que la de `/dispositivos/device_38A839E81F84`.
3. Todos los metadatos existentes (`name`, `organizationId`, `organizationName`, `siteId`, `siteName`, `sectorId`, `sectorName`, `crewId`, `crewName`, `assignmentStatus`, `assignedBy`, `assignedAt`, `assignedUserIds`, `sharedOrganizationIds`) se conservan intactos.
4. Para historial, `subscribeToTelemetryHistory`, `fetchPaginatedTelemetryHistory` y `fetchUnindexedTelemetryFallbackFromRTDB` fusionan `/diagnostico/esp32_p087/historial` con `/historial_telemetria/device_38A839E81F84` y `/dispositivos/device_38A839E81F84/historial` mediante `mergeTelemetryHistorySeries`, sin sobrescribir ni eliminar muestras legadas.

### 2.3 Conectividad estricta basada en `last_update_server`
Se corrigieron dos defectos previos que podían marcar un nodo en línea de forma falsa:
1. En `src/services/firebase.ts`, `recordDevicePacketArrival` ya no marca una carga inicial como paquete vivo, y `mapRTDBDeviceToSensorDevice` evalúa la conectividad estrictamente mediante `evaluateDeviceConnectivity(serverTime, timeoutSeconds, nowMs)` con un timeout configurable de **20 segundos por defecto**. Nunca se marca un equipo en línea solo porque exista un nodo en RTDB.
2. En `src/components/ESP32GatewaySection.tsx`, `isDeviceOnline` fue corregido para depender estrictamente de `lastUpdateServer` y `evaluateDeviceConnectivity`, eliminando la condición errónea `|| dev.status !== 'desconectado'`.

### 2.4 Separación entre telemetría de banco y alertas operacionales mineras
- Las lecturas originadas en `/diagnostico/esp32_p087` se marcan con `isBenchTelemetry: true`.
- `src/services/alertEngine.ts` ignora lecturas con `device.isBenchTelemetry === true` para que un prototipo académico de banco jamás dispare alertas operacionales ni sirenas de faena.
- `src/App.tsx` excluye `isBenchDevice` y valores de saturación ADC `4095` del banner global de emergencia operacional.
- `src/components/BenchTelemetryPanel.tsx` presenta un panel integrado en el Dashboard con aviso explícito de **Telemetría de Banco · Prototipo Académico No Certificado para Seguridad Minera**, diferenciando:
  - Estado de conexión WebSocket con Firebase RTDB (`.info/connected`) vs. recepción vigente de telemetría del ESP32 (`last_update_server`).
  - Modo de enlace híbrido (`Wi-Fi directo`, `ESP-NOW mediante gateway` con nota explícita de que el reenvío por gateway con la nueva autenticación requiere validación física en banco, `Dispositivo desconectado`, `Origen desconocido`).
  - Tipo de nodo (`Nodo físico de banco (simulado: false)` vs. `Nodo simulado (simulado: true)`).

### 2.5 Honestidad científica de sensores y alcance físico
- **MQ-2 (`CO`):** lectura analógica bruta ADC de 12 bits (`0–4095`). Nunca se presenta como concentración certificada de CO en `ppm`. El valor `4095` se reporta como **saturación ADC / medición no válida** (sin afirmar desconexión/pin flotante únicamente por leer `4095`, y sin escalar a estado crítico).
- **Polvo óptico (`PM2_5`):** identificado correctamente como **Sensor óptico de polvo OPEN-SMART (estimación sin calibración oficial)**, eliminando referencias erróneas a Sharp GP2Y10 / GP2Y1010AU0F.
- **DHT11 (`temperatura`, `humedad`):** validación estricta de rangos (`-40..100 °C`, `0..100 %`), valores `NaN`, ausentes o expirados.
- **Alcance físico de señalización:** **Matriz LED MAX7219 (8×32)**, **Audio I2S** y **Pantalla TFT ST7789**. Se retiraron las menciones obsoletas a baliza de 12 V y se aclara que los controles remotos web corresponden únicamente a simulaciones.
