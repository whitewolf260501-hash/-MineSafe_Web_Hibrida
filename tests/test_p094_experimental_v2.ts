/**
 * P094 — Suite de pruebas automatizadas para la integración aislada del equipo
 * experimental de banco sin asignación: device_38A839E81F84_V2.
 *
 * Cubre explícitamente:
 * 1. Marcadores de build P094, SW, HTML, ausencia de secretos y reglas RTDB sin ampliar permisos.
 * 2. Lectura autorizada (superadmin, admin_minesafe activos) y denegación para otros roles / inactivos / anónimos.
 * 3. Identidad experimental sin asignación, exclusión de vistas operacionales y cero fusión sobre device_38A839E81F84.
 * 4. Historial estrictamente separado (/dispositivos/device_38A839E81F84_V2/historial).
 * 5. Aislamiento total de alertas operacionales (sin alterar alarmas operacionales existentes).
 * 6. Bloqueo de comandos operacionales sobre device_38A839E81F84_V2.
 * 7. Estado desconectado estricto con timestamp de servidor (last_update_server) y offset de servidor.
 * 8. Honestidad de clasificación (MQ-2=4095 saturado no válido, polvo OPEN-SMART estimado no calibrado, DHT ausente N/D).
 * 9. Regresión completa del nodo físico original device_38A839E81F84 + /diagnostico/esp32_p087.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  APP_BUILD_VERSION,
  DEFAULT_DEVICE_TIMEOUT_SECONDS,
  EXPERIMENTAL_BENCH_V2_DEVICE_ID,
  EXPERIMENTAL_BENCH_V2_HISTORY_PATH,
  EXPERIMENTAL_BENCH_V2_PATH,
  PHYSICAL_NODE_DEVICE_ID,
  assertNotExperimentalBenchOperationalCommand,
  broadcastDrillToRTDB,
  canAccessExperimentalBenchDevice,
  classifyExperimentalBenchReadings,
  fetchExperimentalBenchV2History,
  filterOutExperimentalBenchDeviceIds,
  getEstimatedServerNowMs,
  isExperimentalBenchDevice,
  isExperimentalBenchDeviceId,
  mapRTDBDeviceToSensorDevice,
  mapTelemetrySnapshotRaw,
  mergeBenchTelemetryIntoPhysicalNode,
  probeExperimentalBenchV2InRTDB,
  resetGatewayDataInRTDB,
  setRTDBServerTimeOffsetForTesting,
  shutdownAlarmCompletelyInRTDB,
  subscribeToExperimentalBenchV2,
  subscribeToExperimentalBenchV2History,
  toggleGatewayAlarmInRTDB,
  toggleGatewayLightInRTDB,
} from '../src/services/firebase';
import {
  UNASSIGNED_DEVICE_ORG_ID,
  isDeviceVisibleToUser,
} from '../src/utils/accessControl';
import { alertEngine } from '../src/services/alertEngine';
import { SensorDevice, UserProfile } from '../src/types';

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

async function assertRejects(
  fn: () => Promise<unknown>,
  message: string,
  expectedSubstring?: string
): Promise<void> {
  try {
    await fn();
    failed += 1;
    console.error(`  [FAIL] ${message} (no rechazó)`);
  } catch (err: any) {
    const errMsg = String(err?.message || err || '');
    if (expectedSubstring && !errMsg.toLowerCase().includes(expectedSubstring.toLowerCase())) {
      failed += 1;
      console.error(
        `  [FAIL] ${message} (rechazó con mensaje inesperado: ${errMsg})`
      );
      return;
    }
    passed += 1;
    console.log(`  [PASS] ${message}`);
  }
}

function makeUser(role: UserProfile['role'], status: UserProfile['status'] = 'activo'): UserProfile {
  return {
    id: `usr-${role}-${status}`,
    name: `Usuario ${role}`,
    email: `${role}@minesafe.example`,
    role,
    roleLabel: role,
    rut: '11.111.111-1',
    shift: 'Turno A',
    status,
    organizationId: 'org-minesafe-principal',
  };
}

async function run(): Promise<void> {
  console.log('\n=== P094: Suite de Validación Equipo Experimental V2 (device_38A839E81F84_V2) ===\n');

  // -------------------------------------------------------------------------
  // 1. Build P094, SW, HTML, ausencia de secretos y reglas Firebase sin ampliar
  // -------------------------------------------------------------------------
  console.log('1. Build P094, artefactos de caché y reglas Firebase sin ampliación de permisos');
  assert(
    APP_BUILD_VERSION === 'P094',
    `APP_BUILD_VERSION debe ser 'P094' (actual: ${APP_BUILD_VERSION})`
  );
  assert(
    EXPERIMENTAL_BENCH_V2_DEVICE_ID === 'device_38A839E81F84_V2',
    'ID experimental coincide exactamente con device_38A839E81F84_V2'
  );
  assert(
    EXPERIMENTAL_BENCH_V2_PATH === 'dispositivos/device_38A839E81F84_V2' &&
      EXPERIMENTAL_BENCH_V2_HISTORY_PATH === 'dispositivos/device_38A839E81F84_V2/historial',
    'Rutas RTDB exclusivas apuntan a /dispositivos/device_38A839E81F84_V2 y /historial'
  );

  const indexHtml = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  assert(
    indexHtml.includes('name="minesafe-build" content="P094"'),
    'index.html expone <meta name="minesafe-build" content="P094" />'
  );
  const swText = fs.readFileSync(path.join(process.cwd(), 'public', 'sw.js'), 'utf8');
  assert(
    swText.includes('minesafe-p094'),
    'public/sw.js actualizado con marcador minesafe-p094'
  );

  const dbRules = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'database.rules.json'), 'utf8')
  );
  assert(
    dbRules.rules['.read'] === false && dbRules.rules['.write'] === false,
    'database.rules.json mantiene denegación por defecto (.read=false, .write=false)'
  );
  const deviceRuleRead = String(dbRules.rules.dispositivos?.['$deviceId']?.['.read'] || '');
  assert(
    deviceRuleRead.startsWith('auth != null') &&
      deviceRuleRead.trim() !== 'true' &&
      deviceRuleRead.includes("val() === 'superadmin'") &&
      deviceRuleRead.includes("val() === 'admin_minesafe'") &&
      deviceRuleRead.includes("data.child('organizationId').exists()"),
    'database.rules.json restringe dispositivos sin organizationId únicamente a superadmin/admin_minesafe (sin ampliar permisos)'
  );
  const histIndex = dbRules.rules.dispositivos?.['$deviceId']?.historial?.['.indexOn'];
  assert(
    Array.isArray(histIndex) && histIndex.includes('timestamp'),
    'database.rules.json mantiene índice timestamp en /dispositivos/$deviceId/historial'
  );

  const panelSource = fs.readFileSync(
    path.join(process.cwd(), 'src', 'components', 'ExperimentalBenchV2Panel.tsx'),
    'utf8'
  );
  assert(
    !/AIza[0-9A-Za-z_-]{20,}|BEGIN PRIVATE KEY|databaseSecret/i.test(panelSource),
    'ExperimentalBenchV2Panel.tsx no contiene secretos ni credenciales embebidas'
  );
  assert(
    !panelSource.includes('toggleGatewayAlarmInRTDB') &&
      !panelSource.includes('shutdownAlarmCompletelyInRTDB') &&
      !panelSource.includes('broadcastDrillToRTDB') &&
      !panelSource.includes('resetGatewayDataInRTDB'),
    'ExperimentalBenchV2Panel.tsx no importa ni expone comandos operacionales'
  );

  // -------------------------------------------------------------------------
  // 2. Autorización por rol y denegación para otros usuarios
  // -------------------------------------------------------------------------
  console.log('\n2. Lectura autorizada y denegación para roles no autorizados');
  const superAdmin = makeUser('superadmin', 'activo');
  const adminMineSafe = makeUser('admin_minesafe', 'activo');
  const companyAdmin = makeUser('admin', 'activo');
  const supervisor = makeUser('supervisor', 'activo');
  const operador = makeUser('operador', 'activo');
  const inactiveSuperAdmin = makeUser('superadmin', 'inactivo');

  assert(canAccessExperimentalBenchDevice(superAdmin) === true, 'superadmin activo autorizado');
  assert(canAccessExperimentalBenchDevice(adminMineSafe) === true, 'admin_minesafe activo autorizado');
  assert(canAccessExperimentalBenchDevice(companyAdmin) === false, 'admin de empresa denegado');
  assert(canAccessExperimentalBenchDevice(supervisor) === false, 'supervisor denegado');
  assert(canAccessExperimentalBenchDevice(operador) === false, 'operador denegado');
  assert(
    canAccessExperimentalBenchDevice(inactiveSuperAdmin) === false,
    'superadmin inactivo denegado'
  );
  assert(canAccessExperimentalBenchDevice(null) === false, 'usuario no autenticado denegado');

  let deniedStateStatus = '';
  let deniedErrorCode: string | null = null;
  const unsubDenied = subscribeToExperimentalBenchV2((st) => {
    deniedStateStatus = st.status;
    deniedErrorCode = st.errorCode;
  }, operador);
  unsubDenied();
  assert(
    deniedStateStatus === 'denied' && deniedErrorCode === 'UNAUTHORIZED_ROLE',
    'subscribeToExperimentalBenchV2 deniega inmediatamente al operador sin abrir lectura RTDB'
  );

  const probeDenied = await probeExperimentalBenchV2InRTDB(supervisor);
  assert(
    probeDenied.status === 'denied' && probeDenied.authorized === false,
    'probeExperimentalBenchV2InRTDB deniega al supervisor'
  );

  const histFetchDenied = await fetchExperimentalBenchV2History(6, companyAdmin);
  assert(
    histFetchDenied.points.length === 0 && Boolean(histFetchDenied.error?.includes('Acceso denegado')),
    'fetchExperimentalBenchV2History deniega al admin de empresa'
  );

  let histSubDeniedError = '';
  const unsubHistDenied = subscribeToExperimentalBenchV2History(
    6,
    (_pts, meta) => {
      histSubDeniedError = meta?.error || '';
    },
    operador
  );
  unsubHistDenied();
  assert(
    histSubDeniedError.includes('Acceso denegado'),
    'subscribeToExperimentalBenchV2History deniega al operador'
  );

  // -------------------------------------------------------------------------
  // 3. Identidad sin asignación, exclusión operacional y cero fusión con original
  // -------------------------------------------------------------------------
  console.log('\n3. Identidad sin asignación, aislamiento operacional y cero fusión con nodo original');
  const NOW_MS = 1795660000000;
  setRTDBServerTimeOffsetForTesting(0);

  const rawV2Payload = {
    CO: 4095,
    PM2_5: 787.51581,
    temperatura: null,
    humedad: null,
    last_update_server: NOW_MS - 3000,
    origen: 'ESP32_V2_BANCO',
    simulado: false,
    via: 'wifi_directo',
    alarma: true,
    organizationId: 'org-intrusa', // debe ignorarse y forzarse sin asignación
    siteId: 'site-intruso',
  };

  const mappedV2 = mapRTDBDeviceToSensorDevice(
    EXPERIMENTAL_BENCH_V2_DEVICE_ID,
    rawV2Payload,
    DEFAULT_DEVICE_TIMEOUT_SECONDS,
    NOW_MS
  );

  assert(isExperimentalBenchDeviceId(EXPERIMENTAL_BENCH_V2_DEVICE_ID), 'Helper reconoce ID V2');
  assert(!isExperimentalBenchDeviceId(PHYSICAL_NODE_DEVICE_ID), 'Helper NO marca nodo original como V2');
  assert(isExperimentalBenchDevice(mappedV2), 'Dispositivo mapeado marcado como experimental');
  assert(
    mappedV2.organizationId === UNASSIGNED_DEVICE_ORG_ID &&
      mappedV2.assignmentStatus === 'en_inventario',
    'device_38A839E81F84_V2 se fuerza siempre sin asignación (__unassigned__ / en_inventario)'
  );
  assert(
    mappedV2.siteId === undefined && mappedV2.crewId === undefined && mappedV2.alarmaActiva === false,
    'device_38A839E81F84_V2 sin faena/cuadrilla y con alarmaActiva forzada en false'
  );
  assert(
    mappedV2.sourcePath === '/dispositivos/device_38A839E81F84_V2',
    'sourcePath apunta estrictamente a /dispositivos/device_38A839E81F84_V2'
  );
  assert(
    isDeviceVisibleToUser(mappedV2, superAdmin, 'all') === false &&
      isDeviceVisibleToUser(mappedV2, adminMineSafe, 'all') === false,
    'isDeviceVisibleToUser excluye device_38A839E81F84_V2 de listas operacionales incluso para SuperAdmin'
  );

  // Nunca fusiona V2 sobre device_38A839E81F84
  const mergedOperational = mergeBenchTelemetryIntoPhysicalNode(
    {
      [PHYSICAL_NODE_DEVICE_ID]: {
        name: 'Nodo Sensor & Gateway Principal',
        organizationId: 'org-minesafe-principal',
        siteId: 'site-el-teniente',
        PM2_5: 120,
        CO: 350,
        temperatura: 22.1,
        humedad: 45,
        last_update_server: NOW_MS - 5000,
      },
      [EXPERIMENTAL_BENCH_V2_DEVICE_ID]: rawV2Payload,
    },
    null,
    false,
    NOW_MS
  );
  assert(
    !(EXPERIMENTAL_BENCH_V2_DEVICE_ID in mergedOperational),
    'mergeBenchTelemetryIntoPhysicalNode elimina device_38A839E81F84_V2 del mapa operacional'
  );
  assert(
    mergedOperational[PHYSICAL_NODE_DEVICE_ID]?.PM2_5 === 120 &&
      mergedOperational[PHYSICAL_NODE_DEVICE_ID]?.CO === 350 &&
      mergedOperational[PHYSICAL_NODE_DEVICE_ID]?.temperatura === 22.1,
    'device_38A839E81F84 conserva intactas sus lecturas originales sin mezcla con V2'
  );

  // -------------------------------------------------------------------------
  // 4. Historial separado
  // -------------------------------------------------------------------------
  console.log('\n4. Historial separado (/dispositivos/device_38A839E81F84_V2/historial)');
  const v2RawHistory = {
    k1: { timestamp: NOW_MS - 120_000, CO: 4095, PM2_5: 512.4, temperatura: null, humedad: null },
    k2: { last_update_server: NOW_MS - 60_000, CO: 820, PM2_5: 430.2, temperatura: 25.4, humedad: 41 },
  };
  const v2HistoryPoints = mapTelemetrySnapshotRaw(
    v2RawHistory,
    NOW_MS - 3600_000,
    NOW_MS + 60_000,
    'dispositivos_v2_historial'
  );
  assert(v2HistoryPoints.length === 2, 'Historial V2 mapea las 2 muestras separadas');
  assert(
    v2HistoryPoints.every((p) => p.source === 'dispositivos_v2_historial'),
    'Todas las muestras V2 conservan source=dispositivos_v2_historial'
  );
  assert(
    v2HistoryPoints[0].co === 4095 && v2HistoryPoints[1].temperatura === 25.4,
    'Valores y orden cronológico del historial V2 preservados correctamente'
  );

  // -------------------------------------------------------------------------
  // 5. Aislamiento de alertas operacionales (sin romper alarmas existentes)
  // -------------------------------------------------------------------------
  console.log('\n5. Aislamiento de alertas operacionales y regresión de alarmas existentes');
  alertEngine.setPersistenceHandlers({
    saveEvent: async () => {},
    updateEvent: async () => {},
    closeAlert: async () => {},
    playSound: () => {},
  });
  const v2ExtremeDevice: SensorDevice = {
    ...mappedV2,
    status: 'critico',
    rawCO: 2900,
    rawPM25: 900,
    rawTemp: 60,
    rawHum: 95,
    metrics: {
      temperatura: 60,
      humedad: 95,
      co2: 5000,
      co: 2900,
      ch4: 5,
      o2: 15,
      flujoAire: 0,
      ruido: 110,
      polvoPM: 900,
    },
  };
  const v2AlertResult = alertEngine.processDeviceTelemetry(v2ExtremeDevice);
  assert(
    v2AlertResult.newEvents.length === 0 && v2AlertResult.highestSeverity === 'normal',
    'alertEngine.processDeviceTelemetry genera 0 alertas operacionales para device_38A839E81F84_V2'
  );

  const operationalNode: SensorDevice = {
    id: 'device_OP_REGRESSION_01',
    code: 'device_OP_REGRESSION_01',
    organizationId: 'org-minesafe-principal',
    name: 'Nodo Operacional Galería Norte',
    type: 'estacion_fija',
    sectorId: 'sec-norte',
    sectorName: 'Galería Norte',
    batteryPct: 92,
    signalStrength: 'optima',
    lastPing: 'Hace 2s',
    status: 'normal',
    assignedTo: 'Cuadrilla A',
    isBenchTelemetry: false,
    isExperimentalBench: false,
    rawCO: 2800,
    rawPM25: 320,
    rawTemp: 24,
    rawHum: 45,
    metrics: {
      temperatura: 24,
      humedad: 45,
      co2: 450,
      co: 2800, // sobre umbral crítico MQ-2 operacional
      ch4: 0.1,
      o2: 20.8,
      flujoAire: 2.5,
      ruido: 65,
      polvoPM: 320, // sobre umbral crítico polvo operacional
    },
  };
  const opAlertResult = alertEngine.processDeviceTelemetry(operationalNode);
  alertEngine.resetPersistenceHandlers();
  assert(
    opAlertResult.newEvents.length > 0 && opAlertResult.highestSeverity === 'critico',
    `Alarmas operacionales existentes siguen funcionando sin regresión (eventos generados: ${opAlertResult.newEvents.length}, severidad: ${opAlertResult.highestSeverity})`
  );

  // -------------------------------------------------------------------------
  // 6. Aislamiento de comandos operacionales
  // -------------------------------------------------------------------------
  console.log('\n6. Bloqueo de comandos operacionales sobre device_38A839E81F84_V2');
  let syncBlocked = false;
  try {
    assertNotExperimentalBenchOperationalCommand(EXPERIMENTAL_BENCH_V2_DEVICE_ID, 'APAGAR');
  } catch {
    syncBlocked = true;
  }
  assert(syncBlocked, 'assertNotExperimentalBenchOperationalCommand bloquea device_38A839E81F84_V2');

  const filteredIds = filterOutExperimentalBenchDeviceIds([
    PHYSICAL_NODE_DEVICE_ID,
    EXPERIMENTAL_BENCH_V2_DEVICE_ID,
    'device_9F4C2A7E1B08',
  ]);
  assert(
    filteredIds.length === 2 && !filteredIds.includes(EXPERIMENTAL_BENCH_V2_DEVICE_ID),
    'filterOutExperimentalBenchDeviceIds elimina device_38A839E81F84_V2 de propagaciones'
  );

  await assertRejects(
    () => toggleGatewayAlarmInRTDB(EXPERIMENTAL_BENCH_V2_DEVICE_ID, true, superAdmin),
    'toggleGatewayAlarmInRTDB rechaza comando ENCENDER/APAGAR en device_38A839E81F84_V2',
    'experimental'
  );
  await assertRejects(
    () => shutdownAlarmCompletelyInRTDB(EXPERIMENTAL_BENCH_V2_DEVICE_ID, superAdmin),
    'shutdownAlarmCompletelyInRTDB rechaza apagado operacional en device_38A839E81F84_V2',
    'experimental'
  );
  await assertRejects(
    () => resetGatewayDataInRTDB(EXPERIMENTAL_BENCH_V2_DEVICE_ID, superAdmin),
    'resetGatewayDataInRTDB rechaza reinicio operacional en device_38A839E81F84_V2',
    'experimental'
  );
  await assertRejects(
    () => toggleGatewayLightInRTDB(EXPERIMENTAL_BENCH_V2_DEVICE_ID, true, superAdmin),
    'toggleGatewayLightInRTDB rechaza control de baliza en device_38A839E81F84_V2',
    'experimental'
  );
  await assertRejects(
    () =>
      broadcastDrillToRTDB(
        true,
        'gas_critico',
        EXPERIMENTAL_BENCH_V2_DEVICE_ID,
        'org-minesafe-principal'
      ),
    'broadcastDrillToRTDB rechaza simulacro dirigido a device_38A839E81F84_V2',
    'experimental'
  );

  // -------------------------------------------------------------------------
  // 7. Estado desconectado y marca temporal de servidor (last_update_server)
  // -------------------------------------------------------------------------
  console.log('\n7. Estado desconectado, timeout 20s y compensación .info/serverTimeOffset');
  const onlineClass = classifyExperimentalBenchReadings(mappedV2, 20, NOW_MS);
  assert(
    onlineClass.connectivity.isOnline === true &&
      onlineClass.overallStatus === 'en_linea_con_observaciones',
    'Dentro de 20s con last_update_server válido => en línea con observaciones'
  );

  const staleV2 = mapRTDBDeviceToSensorDevice(
    EXPERIMENTAL_BENCH_V2_DEVICE_ID,
    { ...rawV2Payload, last_update_server: NOW_MS - 35_000 },
    20,
    NOW_MS
  );
  const offlineClass = classifyExperimentalBenchReadings(staleV2, 20, NOW_MS);
  assert(
    offlineClass.connectivity.isOnline === false && offlineClass.overallStatus === 'desconectado',
    'Con >20s sin actualización => estado estricto DESCONECTADO'
  );
  assert(
    offlineClass.channels.mq2.status === 'desconectado' &&
      offlineClass.channels.polvo.status === 'desconectado' &&
      offlineClass.channels.temperatura.status === 'desconectado' &&
      offlineClass.channels.humedad.status === 'desconectado' &&
      offlineClass.channels.polvo.displayValue === 'N/D',
    'En desconexión todos los canales muestran DESCONECTADO / N/D (sin lecturas viejas como vigentes)'
  );

  // Compensación de desfase de reloj de 5 minutos mediante .info/serverTimeOffset
  const fiveMinMs = 5 * 60 * 1000;
  setRTDBServerTimeOffsetForTesting(fiveMinMs);
  const estServerNow = getEstimatedServerNowMs();
  const offsetV2 = mapRTDBDeviceToSensorDevice(
    EXPERIMENTAL_BENCH_V2_DEVICE_ID,
    { ...rawV2Payload, last_update_server: estServerNow - 4000 },
    20,
    estServerNow
  );
  const offsetClass = classifyExperimentalBenchReadings(offsetV2, 20, estServerNow);
  assert(
    offsetClass.connectivity.isOnline === true,
    'Offset .info/serverTimeOffset evita falso desconectado cuando el reloj local está desfasado'
  );
  setRTDBServerTimeOffsetForTesting(0);

  // -------------------------------------------------------------------------
  // 8. Honestidad de clasificación (MQ-2=4095, Polvo OPEN-SMART, DHT ausente)
  // -------------------------------------------------------------------------
  console.log('\n8. Honestidad de clasificación experimental (sin presentar mediciones como certificadas)');
  assert(
    onlineClass.certifiedMeasurement === false &&
      onlineClass.operationalAlertsEnabled === false &&
      onlineClass.operationalCommandsAllowed === false,
    'Metadatos globales declaran certifiedMeasurement=false, alertas=false y comandos=false'
  );
  assert(
    onlineClass.channels.mq2.status === 'saturado_invalido' &&
      onlineClass.channels.mq2.isValid === false &&
      onlineClass.channels.mq2.displayValue === '4095 (SAT)' &&
      onlineClass.channels.mq2.badge.includes('NO VÁLIDO'),
    'MQ-2 = 4095 se clasifica como saturado / NO válido (nunca ppm ni alarma)'
  );
  assert(
    onlineClass.channels.polvo.status === 'estimado_no_calibrado' &&
      onlineClass.channels.polvo.certified === false &&
      onlineClass.channels.polvo.badge.includes('ESTIMADO') &&
      onlineClass.channels.polvo.detail.includes('OPEN-SMART'),
    'Polvo (PM2_5=787.5) se clasifica como estimado no calibrado (OPEN-SMART)'
  );
  assert(
    onlineClass.channels.temperatura.status === 'no_disponible' &&
      onlineClass.channels.temperatura.displayValue === 'N/D' &&
      onlineClass.channels.temperatura.badge.includes('DHT AUSENTE') &&
      onlineClass.channels.humedad.status === 'no_disponible' &&
      onlineClass.channels.humedad.displayValue === 'N/D',
    'DHT ausente (null) se muestra como N/D (DHT ausente)'
  );

  // Par DHT 0/0 también tratado como ausente, y MQ-2 normal (620) como RAW sin calibrar
  const zeroDhtAndRawMq2 = mapRTDBDeviceToSensorDevice(
    EXPERIMENTAL_BENCH_V2_DEVICE_ID,
    {
      CO: 620,
      PM2_5: 4095,
      temperatura: 0,
      humedad: 0,
      last_update_server: NOW_MS - 2000,
    },
    20,
    NOW_MS
  );
  const zeroDhtClass = classifyExperimentalBenchReadings(zeroDhtAndRawMq2, 20, NOW_MS);
  assert(
    zeroDhtClass.channels.mq2.status === 'experimental_raw' &&
      zeroDhtClass.channels.mq2.displayValue === '620 ADC' &&
      zeroDhtClass.channels.mq2.certified === false,
    'MQ-2 en rango 0–4094 se muestra como RAW ADC sin calibrar (nunca ppm)'
  );
  assert(
    zeroDhtClass.channels.polvo.status === 'saturado_invalido' &&
      zeroDhtClass.channels.polvo.isValid === false,
    'Polvo = 4095 se clasifica como saturado no válido'
  );
  assert(
    zeroDhtClass.channels.temperatura.displayValue === 'N/D' &&
      zeroDhtClass.channels.humedad.displayValue === 'N/D',
    'Par DHT no inicializado (0 / 0) se presenta como N/D (DHT ausente)'
  );

  // Lectura ambiental DHT válida -> no certificada
  const validDhtV2 = mapRTDBDeviceToSensorDevice(
    EXPERIMENTAL_BENCH_V2_DEVICE_ID,
    {
      CO: 510,
      PM2_5: 145.3,
      temperatura: 23.6,
      humedad: 47,
      last_update_server: NOW_MS - 2000,
    },
    20,
    NOW_MS
  );
  const validDhtClass = classifyExperimentalBenchReadings(validDhtV2, 20, NOW_MS);
  assert(
    validDhtClass.overallStatus === 'en_linea_experimental' &&
      validDhtClass.channels.temperatura.displayValue === '23.6 °C' &&
      validDhtClass.channels.humedad.displayValue === '47 %' &&
      validDhtClass.channels.temperatura.certified === false,
    'DHT presente con lecturas válidas se presenta como experimental no certificado'
  );

  // -------------------------------------------------------------------------
  // 9. Regresión del nodo físico original device_38A839E81F84 + /diagnostico/esp32_p087
  // -------------------------------------------------------------------------
  console.log('\n9. Regresión del nodo original device_38A839E81F84 con /diagnostico/esp32_p087');
  const regMerged = mergeBenchTelemetryIntoPhysicalNode(
    {
      [PHYSICAL_NODE_DEVICE_ID]: {
        name: 'Nodo Sensor & Gateway Principal',
        organizationId: 'org-minesafe-principal',
        siteId: 'site-el-teniente',
        PM2_5: 727,
        last_update_server: NOW_MS - 9 * 60 * 1000,
      },
      [EXPERIMENTAL_BENCH_V2_DEVICE_ID]: {
        CO: 123,
        PM2_5: 999,
        temperatura: 11.1,
        humedad: 99,
        last_update_server: NOW_MS - 1000,
      },
    },
    {
      CO: 4095,
      PM2_5: 787.51581,
      temperatura: 29.3,
      humedad: 34,
      last_update_server: NOW_MS - 3000,
      origen: 'P087_BANCO',
      simulado: false,
    },
    false,
    NOW_MS
  );
  const regDevice = mapRTDBDeviceToSensorDevice(
    PHYSICAL_NODE_DEVICE_ID,
    regMerged[PHYSICAL_NODE_DEVICE_ID],
    20,
    NOW_MS
  );
  assert(
    !(EXPERIMENTAL_BENCH_V2_DEVICE_ID in regMerged),
    'V2 excluido del mapa operacional en escenario de regresión'
  );
  assert(
    regDevice.id === PHYSICAL_NODE_DEVICE_ID &&
      regDevice.organizationId === 'org-minesafe-principal' &&
      regDevice.status !== 'desconectado' &&
      regDevice.rawTemp === 29.3 &&
      regDevice.rawHum === 34 &&
      Math.abs((regDevice.rawPM25 ?? 0) - 787.51581) < 0.01,
    'Nodo original device_38A839E81F84 mantiene intacta su telemetría /diagnostico/esp32_p087 sin interferencia de V2'
  );

  console.log(`\nResultado P094: ${passed} passed, ${failed} failed.\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Error fatal ejecutando test_p094_experimental_v2:', err);
  process.exit(1);
});
