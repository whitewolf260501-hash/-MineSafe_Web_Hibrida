/**
 * P092 — Suite de pruebas automatizadas para la corrección de visualización
 * de telemetría ESP32 (/diagnostico/esp32_p087 -> device_38A839E81F84).
 *
 * Verifica:
 * 1. Fusión exacta del payload real observado en Firebase RTDB
 *    (CO=4095, PM2_5=787.51581, humedad=34, temperatura=29.3,
 *     last_update_server=1795653371717, origen="P087_BANCO", simulado=false)
 *    sobre el dispositivo existente device_38A839E81F84 (sin duplicarlo).
 * 2. Protección contra sobrescritura por datos antiguos (PM2_5=727) o timestamps
 *    futuros corruptos en /dispositivos/device_38A839E81F84.
 * 3. Sincronización con .info/serverTimeOffset para eliminar falsos "Desconectado"
 *    por desfase del reloj del PC/navegador.
 * 4. Timeout configurable de 20s: en línea (<=20s), desconectado (>20s) y reconexión.
 * 5. Separación estricta entre telemetría de banco y alertas operacionales de seguridad minera.
 * 6. Normalización de historial con timestamps en milisegundos, segundos y last_update_server.
 * 7. Registro de errores reales de Firebase RTDB en el store diagnóstico exclusivo de SuperAdmin.
 * 8. Verificación de identificador de build P092, manifest.json relativo y Service Worker P092.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  APP_BUILD_VERSION,
  BENCH_HISTORY_PATH,
  BENCH_TELEMETRY_PATH,
  DEFAULT_DEVICE_TIMEOUT_SECONDS,
  PHYSICAL_NODE_DEVICE_ID,
  evaluateDeviceConnectivity,
  getBenchDiagnosticSnapshot,
  getEstimatedServerNowMs,
  mapRTDBDeviceToSensorDevice,
  mapTelemetrySnapshotRaw,
  mergeBenchTelemetryIntoPhysicalNode,
  mergeTelemetryHistorySeries,
  normalizeServerTimestampMs,
  recordBenchListenerErrorForDiagnostics,
  resetBenchDiagnosticsForTesting,
  setRTDBServerTimeOffsetForTesting,
} from '../src/services/firebase';
import { alertEngine } from '../src/services/alertEngine';

let passed = 0;
let failed = 0;

function assert(condition: unknown, message: string): void {
  if (condition) {
    passed += 1;
    console.log(`  [PASS] ${message}`);
  } else {
    failed += 1;
    console.error(`  [FAIL] ${message}`);
  }
}

console.log('\n=== P092: Suite de Validación Telemetría ESP32 y Diagnóstico Web ===\n');

// ---------------------------------------------------------------------------
// 1. Identificador de build P092 y configuración de manifest / SW / HTML
// ---------------------------------------------------------------------------
console.log('1. Identificador de build P092/P094, manifest.json y Service Worker');
const currentBuildVersion: string = APP_BUILD_VERSION;
assert(
  currentBuildVersion === 'P092' || currentBuildVersion === 'P094',
  `APP_BUILD_VERSION debe ser 'P092' o 'P094' (actual: ${currentBuildVersion})`
);

const manifestRaw = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'public', 'manifest.json'), 'utf8')
);
assert(
  manifestRaw.start_url === './' && manifestRaw.scope === './',
  'public/manifest.json usa rutas relativas (./) compatibles con subruta de GitHub Pages'
);
assert(
  Array.isArray(manifestRaw.icons) && manifestRaw.icons[0]?.src === './icon.svg',
  'public/manifest.json apunta al icono ./icon.svg (corrige error de descarga en subruta GitHub Pages)'
);

const swText = fs.readFileSync(path.join(process.cwd(), 'public', 'sw.js'), 'utf8');
assert(
  (swText.includes('minesafe-p092') || swText.includes('minesafe-p094')) &&
    swText.includes('self.registration.unregister()'),
  'public/sw.js incluye marcador P092/P094 y auto-desregistro con purga de cachés'
);

const indexHtml = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
assert(
  indexHtml.includes('name="minesafe-build" content="P092"') ||
    indexHtml.includes('name="minesafe-build" content="P094"'),
  'index.html expone <meta name="minesafe-build" content="P092|P094" />'
);

// ---------------------------------------------------------------------------
// 2. Payload real de Firebase RTDB (/diagnostico/esp32_p087) fusionado sobre device_38A839E81F84
// ---------------------------------------------------------------------------
console.log('\n2. Fusión del payload real de /diagnostico/esp32_p087 sobre device_38A839E81F84');
resetBenchDiagnosticsForTesting();

const REAL_SERVER_TS = 1795653371717;
const SIMULATED_NOW_MS = REAL_SERVER_TS + 4000; // 4 segundos después (dentro de 20s)

const staleLegacyDevices = {
  [PHYSICAL_NODE_DEVICE_ID]: {
    name: 'Nodo Sensor & Gateway Principal',
    organizationId: 'org-minesafe-principal',
    organizationName: 'MineSafe Operaciones Centrales',
    siteId: 'site-el-teniente',
    siteName: 'Faena El Teniente - Nivel Subterráneo 6',
    sectorId: 'sec-rampa',
    sectorName: 'Rampa Principal',
    PM2_5: 727, // dato antiguo reportado en el dashboard previo
    CO: 4095,
    temperatura: null,
    humedad: null,
    last_update_server: REAL_SERVER_TS - 9 * 60 * 1000, // hace 9 minutos
  },
};

const realBenchPayload = {
  CO: 4095,
  PM2_5: 787.51581,
  humedad: 34,
  temperatura: 29.3,
  last_update_server: REAL_SERVER_TS,
  origen: 'P087_BANCO',
  simulado: false,
};

const mergedReal = mergeBenchTelemetryIntoPhysicalNode(
  staleLegacyDevices,
  realBenchPayload,
  true,
  SIMULATED_NOW_MS,
  DEFAULT_DEVICE_TIMEOUT_SECONDS
);

assert(
  Object.keys(mergedReal).length === 1 && Object.keys(mergedReal)[0] === PHYSICAL_NODE_DEVICE_ID,
  'No duplica dispositivos: mantiene únicamente device_38A839E81F84'
);

const mappedPhysical = mapRTDBDeviceToSensorDevice(
  PHYSICAL_NODE_DEVICE_ID,
  mergedReal[PHYSICAL_NODE_DEVICE_ID],
  DEFAULT_DEVICE_TIMEOUT_SECONDS,
  SIMULATED_NOW_MS
);

assert(mappedPhysical.gatewayOnline === true, 'Nodo físico marcado EN LÍNEA (gatewayOnline=true)');
assert(mappedPhysical.status === 'normal', 'Estado operacional normal (separado de alertas mineras)');
assert(mappedPhysical.rawTemp === 29.3, `Temperatura en vivo = 29.3 °C (actual: ${mappedPhysical.rawTemp})`);
assert(mappedPhysical.rawHum === 34, `Humedad en vivo = 34 % (actual: ${mappedPhysical.rawHum})`);
assert(
  Math.abs((mappedPhysical.rawPM25 ?? 0) - 787.51581) < 0.001,
  `Polvo en vivo = 787.51581 (reemplaza 727 antiguo; actual: ${mappedPhysical.rawPM25})`
);
assert(mappedPhysical.rawCO === 4095 && mappedPhysical.adcSaturated === true, 'CO=4095 reconocido como saturación ADC');
assert(mappedPhysical.isBenchTelemetry === true, 'Flag isBenchTelemetry = true');
assert(mappedPhysical.isSimulated === false, 'Flag isSimulated = false (simulado: false)');
assert(mappedPhysical.telemetryOrigin === 'P087_BANCO', 'Origen conservado = P087_BANCO');
assert(mappedPhysical.sourcePath === `/${BENCH_TELEMETRY_PATH}`, `sourcePath = /${BENCH_TELEMETRY_PATH}`);
assert(
  mappedPhysical.siteName === 'Faena El Teniente - Nivel Subterráneo 6' &&
    mappedPhysical.organizationId === 'org-minesafe-principal',
  'Metadatos organizacionales y de faena conservados intactos'
);

// ---------------------------------------------------------------------------
// 3. Protección anti-sobrescritura (datos antiguos o reloj futuro corrupto en /dispositivos)
// ---------------------------------------------------------------------------
console.log('\n3. Protección contra sobrescritura desde /dispositivos');
const corruptedFutureDevices = {
  [PHYSICAL_NODE_DEVICE_ID]: {
    ...staleLegacyDevices[PHYSICAL_NODE_DEVICE_ID],
    PM2_5: 727,
    last_update_server: SIMULATED_NOW_MS + 3_600_000, // reloj cliente corrupto +1 hora en el futuro
  },
};

const mergedAgainstFuture = mergeBenchTelemetryIntoPhysicalNode(
  corruptedFutureDevices,
  realBenchPayload,
  true,
  SIMULATED_NOW_MS,
  DEFAULT_DEVICE_TIMEOUT_SECONDS
);
assert(
  mergedAgainstFuture[PHYSICAL_NODE_DEVICE_ID].PM2_5 === 787.51581 &&
    mergedAgainstFuture[PHYSICAL_NODE_DEVICE_ID].last_update_server === REAL_SERVER_TS,
  'Timestamp corrupto en el futuro en /dispositivos NO bloquea telemetría vigente de /diagnostico/esp32_p087'
);

const diagAfterMerge = getBenchDiagnosticSnapshot();
assert(
  diagAfterMerge.mergeDecision.applied === true && diagAfterMerge.mergeDecision.isOnline === true,
  'Diagnóstico SuperAdmin registra fusión aplicada=true e isOnline=true'
);

// ---------------------------------------------------------------------------
// 4. Compensación de desfase de reloj vía .info/serverTimeOffset
// ---------------------------------------------------------------------------
console.log('\n4. Compensación de desfase de reloj del navegador (.info/serverTimeOffset)');
resetBenchDiagnosticsForTesting();
// Simular que el reloj del PC del usuario está 45 segundos ADELANTADO respecto al servidor Firebase:
// offset = serverTime - localTime = -45000 ms
setRTDBServerTimeOffsetForTesting(-45_000);
const serverNowReal = getEstimatedServerNowMs();
const freshEspServerTs = serverNowReal - 5_000; // ESP32 transmitió hace 5s en tiempo servidor
// Sin compensación (usando Date.now() crudo), parecería hace 50s -> OFFLINE!
const withoutOffset = evaluateDeviceConnectivity(freshEspServerTs, 20, Date.now());
assert(
  withoutOffset.isOnline === false,
  'Sin serverTimeOffset, un reloj local +45s adelantado marcaría falsamente OFFLINE'
);
// Con compensación automática (default getEstimatedServerNowMs()):
const withOffset = evaluateDeviceConnectivity(freshEspServerTs, 20);
assert(
  withOffset.isOnline === true && withOffset.diffSeconds <= 6,
  `Con .info/serverTimeOffset (-45000ms), el nodo se evalúa correctamente ONLINE (diff=${withOffset.diffSeconds}s)`
);
setRTDBServerTimeOffsetForTesting(0);

// ---------------------------------------------------------------------------
// 5. Timeout configurable de 20s: desconexión y reconexión
// ---------------------------------------------------------------------------
console.log('\n5. Timeout configurable de 20 segundos (en línea -> desconectado -> reconexión)');
const expiredEval = evaluateDeviceConnectivity(REAL_SERVER_TS, 20, REAL_SERVER_TS + 21_000);
assert(expiredEval.isOnline === false && expiredEval.isStale === true, 'Después de 21s (>20s) pasa a desconectado');

const reconnectedTs = REAL_SERVER_TS + 25_000;
const reconnectedEval = evaluateDeviceConnectivity(reconnectedTs, 20, reconnectedTs + 2_000);
assert(reconnectedEval.isOnline === true, 'Al recibir nueva muestra vuelve a ONLINE inmediatamente');

// ---------------------------------------------------------------------------
// 6. Separación estricta entre telemetría de banco y alertas operacionales
// ---------------------------------------------------------------------------
console.log('\n6. Separación estricta de alertas operacionales');
alertEngine.clearActiveIncidents();
const benchEval = alertEngine.processDeviceTelemetry(mappedPhysical);
assert(
  benchEval.highestSeverity === 'normal' &&
    benchEval.newEvents.length === 0 &&
    benchEval.recoveredEvents.length === 0,
  'Lectura de banco (CO=4095, PM2_5=787.5) genera 0 alertas operacionales de seguridad minera'
);

// ---------------------------------------------------------------------------
// 7. Conversión de timestamps e historial integrado (/diagnostico/esp32_p087/historial)
// ---------------------------------------------------------------------------
console.log('\n7. Normalización de timestamps e historial fusionado');
assert(normalizeServerTimestampMs(1795653371717) === 1795653371717, 'Preserva epoch ms de 13 dígitos');
assert(normalizeServerTimestampMs('1795653371717') === 1795653371717, 'Convierte string numérico de 13 dígitos');
assert(normalizeServerTimestampMs(1795653371) === 1795653371000, 'Convierte epoch en segundos (10 dígitos) a ms');

const rawBenchHistory = {
  '-O_sample_ms': {
    co: 4095,
    pm25: 787.51581,
    temperatura: 29.3,
    humedad: 34,
    timestamp: REAL_SERVER_TS,
  },
  '-O_sample_sec': {
    CO: 4095,
    PM2_5: 781.2,
    temperatura: 29.1,
    humedad: 35,
    last_update_server: Math.floor((REAL_SERVER_TS - 10_000) / 1000), // 10 dígitos
  },
};

const mappedBenchHist = mapTelemetrySnapshotRaw(
  rawBenchHistory,
  REAL_SERVER_TS - 60_000,
  REAL_SERVER_TS + 60_000,
  'diagnostico_p087'
);
assert(mappedBenchHist.length === 2, `Historial de banco parsea muestras en ms y en segundos (total=${mappedBenchHist.length})`);
const legacyHist = [
  { timestamp: REAL_SERVER_TS - 120_000, co: 180, pm25: 42, temperatura: 24.5, humedad: 48, source: 'historial_telemetria' as const },
];
const fusedHist = mergeTelemetryHistorySeries(legacyHist, mappedBenchHist);
assert(
  fusedHist.length === 3 &&
    fusedHist[0].source === 'historial_telemetria' &&
    fusedHist[2].source === 'diagnostico_p087',
  'Historial fusionado conserva muestras legadas y agrega lecturas nuevas de /diagnostico/esp32_p087/historial'
);

// ---------------------------------------------------------------------------
// 8. Captura de errores reales de Firebase RTDB para diagnóstico SuperAdmin
// ---------------------------------------------------------------------------
console.log('\n8. Captura de errores reales de Firebase RTDB en store diagnóstico SuperAdmin');
resetBenchDiagnosticsForTesting();
recordBenchListenerErrorForDiagnostics({
  code: 'PERMISSION_DENIED',
  message: `permission_denied at /${BENCH_TELEMETRY_PATH}: Client doesn't have permission to access the desired data.`,
});
const errSnap = getBenchDiagnosticSnapshot();
assert(
  errSnap.benchListener.status === 'error' &&
    errSnap.benchListener.errorCode === 'PERMISSION_DENIED' &&
    Boolean(errSnap.benchListener.error?.includes('permission_denied')),
  `Diagnóstico SuperAdmin captura error real PERMISSION_DENIED en /${BENCH_TELEMETRY_PATH}`
);
assert(
  errSnap.historyListener.path === `/${BENCH_HISTORY_PATH}`,
  `Ruta histórica monitoreada correctamente: /${BENCH_HISTORY_PATH}`
);

// ---------------------------------------------------------------------------
// Resumen final
// ---------------------------------------------------------------------------
console.log(`\n=== Resultado P092: ${passed} pasaron, ${failed} fallaron ===\n`);
if (failed > 0) {
  process.exit(1);
}
