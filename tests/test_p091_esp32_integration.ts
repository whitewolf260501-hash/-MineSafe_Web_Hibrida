/**
 * P091 — Suite de pruebas automatizadas de integración ESP32 + plataforma web MineSafe
 * Cubre los 20 casos de prueba obligatorios sobre contrato RTDB, fusión sin duplicados,
 * conectividad estricta por timestamp de servidor (20s), historial combinado, reglas de
 * mínimo privilegio, aislamiento multi-empresa, roles, saturación ADC 4095, DHT11 inválido,
 * separación banco vs alertas operacionales y honestidad de sensores/alcance hardware.
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

import {
  PHYSICAL_NODE_DEVICE_ID,
  SIMULATED_NODE_DEVICE_ID,
  GATEWAY_DEVICE_ID,
  PHYSICAL_NODE_AUTH_UID,
  BENCH_TELEMETRY_PATH,
  BENCH_HISTORY_PATH,
  DEFAULT_DEVICE_TIMEOUT_SECONDS,
  DEFAULT_GLOBAL_THRESHOLDS,
  DUST_SENSOR_MODEL_LABEL,
  normalizeServerTimestampMs,
  evaluateDeviceConnectivity,
  classifyCommunicationLink,
  mergeBenchTelemetryIntoPhysicalNode,
  mapRTDBDeviceToSensorDevice,
  mapTelemetrySnapshotRaw,
  mergeTelemetryHistorySeries,
} from '../src/services/firebase';
import { alertEngine } from '../src/services/alertEngine';
import { downsampleChartPoints } from '../src/components/HistoricalReportsView';
import type { TelemetryHistoryPoint } from '../src/types';

// -----------------------------------------------------------------------------
// Evaluador determinista de reglas RTDB (soporta root, data, newData, auth, now)
// -----------------------------------------------------------------------------
interface MockAuth {
  uid: string;
  token?: {
    email?: string;
    email_verified?: boolean;
  };
}

class MockSnapshot {
  constructor(private readonly value: any) {}

  exists(): boolean {
    return this.value !== undefined && this.value !== null;
  }
  val(): any {
    return this.value;
  }
  isString(): boolean {
    return typeof this.value === 'string';
  }
  isNumber(): boolean {
    return typeof this.value === 'number' && Number.isFinite(this.value);
  }
  isBoolean(): boolean {
    return typeof this.value === 'boolean';
  }
  child(subPath: string): MockSnapshot {
    const parts = subPath.split('/').filter(Boolean);
    let cur = this.value;
    for (const part of parts) {
      if (cur && typeof cur === 'object' && Object.prototype.hasOwnProperty.call(cur, part)) {
        cur = cur[part];
      } else {
        return new MockSnapshot(undefined);
      }
    }
    return new MockSnapshot(cur);
  }
  hasChildren(keys: string[]): boolean {
    if (!this.value || typeof this.value !== 'object') return false;
    return keys.every(
      (k) =>
        Object.prototype.hasOwnProperty.call(this.value, k) &&
        this.value[k] !== undefined &&
        this.value[k] !== null
    );
  }
}

function getAtPath(obj: any, segments: string[]): any {
  let cur = obj;
  for (const s of segments) {
    if (cur && typeof cur === 'object' && Object.prototype.hasOwnProperty.call(cur, s)) {
      cur = cur[s];
    } else {
      return undefined;
    }
  }
  return cur;
}

function evalRuleExpr(
  expr: boolean | string | undefined,
  ctx: {
    auth: MockAuth | null;
    root: MockSnapshot;
    data: MockSnapshot;
    newData: MockSnapshot;
    vars: Record<string, string>;
    now: number;
  }
): boolean {
  if (typeof expr === 'boolean') return expr;
  if (typeof expr !== 'string') return false;
  const varNames = Object.keys(ctx.vars);
  const varVals = varNames.map((k) => ctx.vars[k]);
  const fn = new Function(
    'auth',
    'root',
    'data',
    'newData',
    'now',
    ...varNames,
    `return Boolean(${expr});`
  );
  try {
    return Boolean(fn(ctx.auth, ctx.root, ctx.data, ctx.newData, ctx.now, ...varVals));
  } catch {
    return false;
  }
}

function evaluateRTDBRule(
  rulesRoot: any,
  dbState: Record<string, any>,
  mode: '.read' | '.write',
  targetPath: string,
  auth: MockAuth | null,
  newValue?: any,
  nowMs: number = Date.now()
): boolean {
  const segments = targetPath.split('/').filter(Boolean);
  let node = rulesRoot.rules;
  const vars: Record<string, string> = {};
  const chain: Array<{ node: any; segments: string[]; vars: Record<string, string> }> = [
    { node, segments: [], vars: { ...vars } },
  ];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!node || typeof node !== 'object') break;
    if (Object.prototype.hasOwnProperty.call(node, seg)) {
      node = node[seg];
    } else {
      const wildKey = Object.keys(node).find((k) => k.startsWith('$'));
      if (!wildKey) {
        node = undefined;
        break;
      }
      vars[wildKey] = seg;
      node = node[wildKey];
    }
    chain.push({ node, segments: segments.slice(0, i + 1), vars: { ...vars } });
  }

  const rootSnap = new MockSnapshot(dbState);
  let allowed = false;
  for (const step of chain) {
    if (!step.node || typeof step.node !== 'object') continue;
    const ruleExpr = step.node[mode];
    if (ruleExpr === undefined) continue;
    const curVal = getAtPath(dbState, step.segments);
    const isTarget = step.segments.length === segments.length;
    const nextVal = isTarget ? newValue : curVal;
    const ok = evalRuleExpr(ruleExpr, {
      auth,
      root: rootSnap,
      data: new MockSnapshot(curVal),
      newData: new MockSnapshot(nextVal),
      vars: step.vars,
      now: nowMs,
    });
    if (ok) {
      allowed = true;
      break;
    }
  }
  if (!allowed) return false;

  // Para .write también deben cumplirse todas las reglas .validate de la ruta si newValue existe
  if (mode === '.write' && newValue !== undefined && newValue !== null) {
    const last = chain[chain.length - 1];
    if (last?.node && last.node['.validate'] !== undefined) {
      const curVal = getAtPath(dbState, segments);
      const valid = evalRuleExpr(last.node['.validate'], {
        auth,
        root: rootSnap,
        data: new MockSnapshot(curVal),
        newData: new MockSnapshot(newValue),
        vars: last.vars,
        now: nowMs,
      });
      if (!valid) return false;
    }
  }
  return true;
}

// -----------------------------------------------------------------------------
// Fixtures comunes
// -----------------------------------------------------------------------------
const ROOT_DIR = process.cwd();
const rtdbRules = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'database.rules.json'), 'utf8'));

const SUPERADMIN_AUTH: MockAuth = {
  uid: 'uid-superadmin',
  token: { email: 'manuelcrisostomovega@gmail.com', email_verified: true },
};
const ADMIN_MINESAFE_AUTH: MockAuth = {
  uid: 'uid-admin-minesafe',
  token: { email: 'admin@minesafe.cl', email_verified: true },
};
const ORG_A_ADMIN_AUTH: MockAuth = {
  uid: 'uid-admin-org-a',
  token: { email: 'admin@codelco.cl', email_verified: true },
};
const ORG_A_SUPERVISOR_AUTH: MockAuth = {
  uid: 'uid-sup-org-a',
  token: { email: 'supervisor@codelco.cl', email_verified: true },
};
const ORG_A_OPERATOR_AUTH: MockAuth = {
  uid: 'uid-op-org-a',
  token: { email: 'operador@codelco.cl', email_verified: true },
};
const ORG_B_ADMIN_AUTH: MockAuth = {
  uid: 'uid-admin-org-b',
  token: { email: 'admin@otraempresa.cl', email_verified: true },
};
const ESP32_PHYSICAL_AUTH: MockAuth = {
  uid: PHYSICAL_NODE_AUTH_UID,
  token: { email: 'esp32-nodo-fisico@minesafe.example', email_verified: true },
};

const NOW = 1_765_000_000_000;

const MOCK_DB: Record<string, any> = {
  usuarios: {
    'uid-superadmin': {
      tipoUsuario: 'superadmin',
      isSuperUser: true,
      isAdmin: true,
      isActive: true,
      organizationId: 'org-codelco-norte',
    },
    'uid-admin-minesafe': {
      tipoUsuario: 'admin_minesafe',
      isSuperUser: false,
      isAdmin: true,
      isActive: true,
      organizationId: 'org-codelco-norte',
    },
    'uid-admin-org-a': {
      tipoUsuario: 'admin',
      isSuperUser: false,
      isAdmin: true,
      isActive: true,
      organizationId: 'org-codelco-norte',
    },
    'uid-sup-org-a': {
      tipoUsuario: 'supervisor',
      isSuperUser: false,
      isAdmin: false,
      isActive: true,
      organizationId: 'org-codelco-norte',
    },
    'uid-op-org-a': {
      tipoUsuario: 'operador',
      isSuperUser: false,
      isAdmin: false,
      isActive: true,
      organizationId: 'org-codelco-norte',
    },
    'uid-admin-org-b': {
      tipoUsuario: 'admin',
      isSuperUser: false,
      isAdmin: true,
      isActive: true,
      organizationId: 'org-minera-sur',
    },
  },
  dispositivos: {
    [PHYSICAL_NODE_DEVICE_ID]: {
      name: 'Gateway Principal Mina Norte',
      organizationId: 'org-codelco-norte',
      organizationName: 'Codelco División Norte',
      siteId: 'site-chuqui',
      siteName: 'Faena Chuquicamata',
      sectorId: 'sec-rampa',
      sectorName: 'Rampa Principal',
      crewId: 'crew-alfa',
      crewName: 'Cuadrilla Alfa',
      assignmentStatus: 'asignado_sector',
      CO: 120,
      PM2_5: 18,
      temperatura: 21.5,
      humedad: 48,
      last_update_server: NOW - 300_000,
    },
    [SIMULATED_NODE_DEVICE_ID]: {
      name: 'Nodo Simulado ESP32',
      organizationId: 'org-codelco-norte',
      simulado: true,
      origen: 'nodo_simulado_p085',
      CO: 150,
      PM2_5: 22,
      temperatura: 23,
      humedad: 50,
      last_update_server: NOW - 5_000,
    },
    device_BETA_01: {
      name: 'Nodo Minera Sur',
      organizationId: 'org-minera-sur',
      CO: 90,
      PM2_5: 10,
      temperatura: 19,
      humedad: 55,
      last_update_server: NOW - 4_000,
    },
  },
  diagnostico: {
    esp32_p087: {
      CO: 245,
      PM2_5: 32,
      temperatura: 24.4,
      humedad: 51,
      simulado: false,
      origen: 'esp32_p087_banco',
      via: 'WIFI_DIRECTO',
      last_update_server: NOW - 3_000,
      historial: {
        hist_existing_1: {
          co: 210,
          pm25: 28,
          temperatura: 24.1,
          humedad: 50,
          timestamp: NOW - 120_000,
        },
      },
    },
  },
  historial_telemetria: {
    [PHYSICAL_NODE_DEVICE_ID]: {
      [String(NOW - 300_000)]: {
        co: 115,
        pm25: 17,
        temperatura: 21.3,
        humedad: 47,
        timestamp: NOW - 300_000,
      },
    },
  },
};

let passed = 0;
function test(id: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  [PASS] ${id}`);
  } catch (err: any) {
    console.error(`  [FAIL] ${id}: ${err?.message || err}`);
    throw err;
  }
}

console.log('\n=== P091 — SUITE DE INTEGRACIÓN ESP32 + PLATAFORMA WEB MINESAFE (20 CASOS) ===');

// 1. Reconocimiento del nodo físico fusionando /diagnostico/esp32_p087 sobre device_38A839E81F84
test('P091-01: Reconocimiento del nodo físico existente mediante fusión /diagnostico/esp32_p087', () => {
  const merged = mergeBenchTelemetryIntoPhysicalNode(
    MOCK_DB.dispositivos,
    MOCK_DB.diagnostico.esp32_p087,
    false
  );
  const mapped = mapRTDBDeviceToSensorDevice(
    PHYSICAL_NODE_DEVICE_ID,
    merged[PHYSICAL_NODE_DEVICE_ID],
    DEFAULT_DEVICE_TIMEOUT_SECONDS,
    NOW
  );
  assert.equal(mapped.id, PHYSICAL_NODE_DEVICE_ID);
  assert.equal(mapped.gatewayOnline, true);
  assert.equal(mapped.isBenchTelemetry, true);
  assert.equal(mapped.sourcePath, `/${BENCH_TELEMETRY_PATH}`);
});

// 2. Escritura y lectura autenticada del nodo físico UID tJgRrlKRwPQOWCkdJiWA54B0JN33
test('P091-02: Lectura y escritura autenticada del nodo físico ESP32 en /diagnostico/esp32_p087 y /dispositivos/device_38A839E81F84', () => {
  assert.equal(
    evaluateRTDBRule(rtdbRules, MOCK_DB, '.read', `${BENCH_TELEMETRY_PATH}`, ESP32_PHYSICAL_AUTH, undefined, NOW),
    true
  );
  assert.equal(
    evaluateRTDBRule(rtdbRules, MOCK_DB, '.write', `${BENCH_TELEMETRY_PATH}/CO`, ESP32_PHYSICAL_AUTH, 312, NOW),
    true
  );
  assert.equal(
    evaluateRTDBRule(rtdbRules, MOCK_DB, '.write', `${BENCH_TELEMETRY_PATH}/PM2_5`, ESP32_PHYSICAL_AUTH, 41, NOW),
    true
  );
  assert.equal(
    evaluateRTDBRule(rtdbRules, MOCK_DB, '.write', `${BENCH_TELEMETRY_PATH}/temperatura`, ESP32_PHYSICAL_AUTH, 25.1, NOW),
    true
  );
  assert.equal(
    evaluateRTDBRule(rtdbRules, MOCK_DB, '.write', `${BENCH_TELEMETRY_PATH}/humedad`, ESP32_PHYSICAL_AUTH, 52, NOW),
    true
  );
  assert.equal(
    evaluateRTDBRule(rtdbRules, MOCK_DB, '.write', `${BENCH_TELEMETRY_PATH}/simulado`, ESP32_PHYSICAL_AUTH, false, NOW),
    true
  );
  assert.equal(
    evaluateRTDBRule(rtdbRules, MOCK_DB, '.write', `${BENCH_TELEMETRY_PATH}/last_update_server`, ESP32_PHYSICAL_AUTH, NOW, NOW),
    true
  );
  assert.equal(
    evaluateRTDBRule(
      rtdbRules,
      MOCK_DB,
      '.write',
      `dispositivos/${PHYSICAL_NODE_DEVICE_ID}`,
      ESP32_PHYSICAL_AUTH,
      { ...MOCK_DB.dispositivos[PHYSICAL_NODE_DEVICE_ID], CO: 260, last_update_server: NOW },
      NOW
    ),
    true
  );
});

// 3. Actualización en tiempo real de las 4 variables (CO, PM2_5, temperatura, humedad)
test('P091-03: Actualización en vivo de las 4 variables (CO, PM2_5, temperatura, humedad)', () => {
  const freshBench = {
    CO: 318,
    PM2_5: 44,
    temperatura: 26.8,
    humedad: 57,
    simulado: false,
    origen: 'esp32_p087_banco',
    via: 'WIFI_DIRECTO',
    last_update_server: NOW - 2_000,
  };
  const merged = mergeBenchTelemetryIntoPhysicalNode(MOCK_DB.dispositivos, freshBench, false);
  const dev = mapRTDBDeviceToSensorDevice(PHYSICAL_NODE_DEVICE_ID, merged[PHYSICAL_NODE_DEVICE_ID], 20, NOW);
  assert.equal(dev.rawCO, 318);
  assert.equal(dev.rawPM25, 44);
  assert.equal(dev.rawTemp, 26.8);
  assert.equal(dev.rawHum, 57);
  assert.equal(dev.metrics.temperatura, 26.8);
  assert.equal(dev.metrics.humedad, 57);
});

// 4. Desconexión tras >20s sin actualización de last_update_server
test('P091-04: Detección estricta de desconexión tras superar timeout de 20s (nunca online solo por existir en RTDB)', () => {
  const staleBench = { ...MOCK_DB.diagnostico.esp32_p087, last_update_server: NOW - 25_000 };
  const merged = mergeBenchTelemetryIntoPhysicalNode(MOCK_DB.dispositivos, staleBench, false);
  const dev = mapRTDBDeviceToSensorDevice(PHYSICAL_NODE_DEVICE_ID, merged[PHYSICAL_NODE_DEVICE_ID], 20, NOW);
  assert.equal(dev.gatewayOnline, false);
  assert.equal(dev.status, 'desconectado');

  const noTsDev = mapRTDBDeviceToSensorDevice(
    PHYSICAL_NODE_DEVICE_ID,
    { CO: 120, PM2_5: 15, temperatura: 22, humedad: 45 },
    20,
    NOW
  );
  assert.equal(noTsDev.gatewayOnline, false);
  assert.equal(noTsDev.status, 'desconectado');
});

// 5. Reconexión automática al recibir marca temporal vigente
test('P091-05: Reconexión automática al recibir nueva marca temporal last_update_server dentro de 20s', () => {
  const staleEval = evaluateDeviceConnectivity(NOW - 35_000, 20, NOW);
  assert.equal(staleEval.isOnline, false);
  assert.equal(staleEval.isStale, true);

  const recoveredEval = evaluateDeviceConnectivity(NOW - 2_000, 20, NOW);
  assert.equal(recoveredEval.isOnline, true);
  assert.equal(recoveredEval.isStale, false);

  // Soporta epoch en segundos (10 dígitos) normalizado a ms
  const secMs = normalizeServerTimestampMs(Math.floor((NOW - 4_000) / 1000));
  assert.equal(evaluateDeviceConnectivity(secMs, 20, NOW).isOnline, true);
});

// 6. Lectura de /diagnostico/esp32_p087/historial y fusión sin sobrescribir historial legado
test('P091-06: Lectura y fusión de /diagnostico/esp32_p087/historial junto a /historial_telemetria sin sobrescribir legado', () => {
  const legacyPts = mapTelemetrySnapshotRaw(
    MOCK_DB.historial_telemetria[PHYSICAL_NODE_DEVICE_ID],
    NOW - 600_000,
    NOW,
    'historial_telemetria'
  );
  const benchPts = mapTelemetrySnapshotRaw(
    {
      ...MOCK_DB.diagnostico.esp32_p087.historial,
      hist_new_2: {
        co: 255,
        pm25: 34,
        temperatura: 24.6,
        humedad: 52,
        timestamp: NOW - 60_000,
      },
    },
    NOW - 600_000,
    NOW,
    'diagnostico_p087'
  );
  const merged = mergeTelemetryHistorySeries(legacyPts, benchPts);
  assert.equal(merged.length, 3);
  assert.equal(merged[0].source, 'historial_telemetria');
  assert.equal(merged[1].source, 'diagnostico_p087');
  assert.equal(merged[2].source, 'diagnostico_p087');
  assert.ok(merged[0].timestamp < merged[1].timestamp && merged[1].timestamp < merged[2].timestamp);
});

// 7. Preparación y submuestreo equilibrado de gráficos con historial combinado
test('P091-07: Preparación de series para gráficos históricos con muestras fusionadas', () => {
  const syntheticSeries: TelemetryHistoryPoint[] = Array.from({ length: 120 }, (_, i) => ({
    timestamp: NOW - (120 - i) * 60_000,
    co: 180 + (i % 40),
    pm25: 20 + (i % 15),
    temperatura: 22 + (i % 5) * 0.2,
    humedad: 45 + (i % 10),
    source: i < 60 ? 'historial_telemetria' : 'diagnostico_p087',
  }));
  const chartPts = downsampleChartPoints(
    syntheticSeries.map((p) => ({ timestamp: p.timestamp, label: String(p.timestamp), value: p.co ?? 0 })),
    48
  );
  assert.ok(chartPts.length <= 48 && chartPts.length >= 20);
  assert.equal(chartPts[0].timestamp, syntheticSeries[0].timestamp);
  assert.equal(chartPts[chartPts.length - 1].timestamp, syntheticSeries[syntheticSeries.length - 1].timestamp);
});

// 8. Cero duplicación de dispositivos (solo 1 entrada device_38A839E81F84)
test('P091-08: No se duplican dispositivos al fusionar /diagnostico/esp32_p087', () => {
  const merged = mergeBenchTelemetryIntoPhysicalNode(
    MOCK_DB.dispositivos,
    MOCK_DB.diagnostico.esp32_p087,
    true
  );
  const keys = Object.keys(merged);
  assert.equal(keys.filter((k) => k === PHYSICAL_NODE_DEVICE_ID).length, 1);
  assert.equal(keys.includes('esp32_p087'), false);
  assert.equal(keys.length, Object.keys(MOCK_DB.dispositivos).length);
});

// 9. Preservación de asignaciones, organización, faena, sector y cuadrilla existentes
test('P091-09: Conservación intacta de organización, faena, sector, cuadrilla y estado de asignación', () => {
  const merged = mergeBenchTelemetryIntoPhysicalNode(
    MOCK_DB.dispositivos,
    MOCK_DB.diagnostico.esp32_p087,
    false
  );
  const dev = mapRTDBDeviceToSensorDevice(PHYSICAL_NODE_DEVICE_ID, merged[PHYSICAL_NODE_DEVICE_ID], 20, NOW);
  assert.equal(dev.organizationId, 'org-codelco-norte');
  assert.equal(dev.organizationName, 'Codelco División Norte');
  assert.equal(dev.siteId, 'site-chuqui');
  assert.equal(dev.siteName, 'Faena Chuquicamata');
  assert.equal(dev.sectorName, 'Rampa Principal');
  assert.equal(dev.crewName, 'Cuadrilla Alfa');
  assert.equal(dev.assignmentStatus, 'asignado_sector');
});

// 10. Verificación de vínculo demo con organización, faena y contrato (sin pérdida tras fusión)
test('P091-10: Vínculo del nodo físico con empresa, faena y metadatos de contrato preservado', () => {
  const withContract = {
    ...MOCK_DB.dispositivos,
    [PHYSICAL_NODE_DEVICE_ID]: {
      ...MOCK_DB.dispositivos[PHYSICAL_NODE_DEVICE_ID],
      assignedBy: 'manuelcrisostomovega@gmail.com',
      assignedAt: NOW - 86_400_000,
      assignedUserIds: ['uid-op-org-a'],
    },
  };
  const merged = mergeBenchTelemetryIntoPhysicalNode(withContract, MOCK_DB.diagnostico.esp32_p087, false);
  const dev = mapRTDBDeviceToSensorDevice(PHYSICAL_NODE_DEVICE_ID, merged[PHYSICAL_NODE_DEVICE_ID], 20, NOW);
  assert.equal(dev.assignedBy, 'manuelcrisostomovega@gmail.com');
  assert.deepEqual(dev.assignedUserIds, ['uid-op-org-a']);
  assert.equal(dev.rawCO, 245);
});

// 11. Aislamiento entre organizaciones sobre /diagnostico/esp32_p087, /dispositivos e historial
test('P091-11: Aislamiento multi-organización en RTDB y en fusión de cliente', () => {
  // Empresa B no puede leer /diagnostico/esp32_p087 ni /dispositivos/device_38A839E81F84 ni su historial
  assert.equal(
    evaluateRTDBRule(rtdbRules, MOCK_DB, '.read', BENCH_TELEMETRY_PATH, ORG_B_ADMIN_AUTH, undefined, NOW),
    false
  );
  assert.equal(
    evaluateRTDBRule(rtdbRules, MOCK_DB, '.read', BENCH_HISTORY_PATH, ORG_B_ADMIN_AUTH, undefined, NOW),
    false
  );
  assert.equal(
    evaluateRTDBRule(rtdbRules, MOCK_DB, '.read', `dispositivos/${PHYSICAL_NODE_DEVICE_ID}`, ORG_B_ADMIN_AUTH, undefined, NOW),
    false
  );
  // En fusión con alcance de Empresa B (solo device_BETA_01), allowMaterializeIfMissing=false no filtra el nodo físico
  const orgBDevices = { device_BETA_01: MOCK_DB.dispositivos.device_BETA_01 };
  const mergedB = mergeBenchTelemetryIntoPhysicalNode(orgBDevices, MOCK_DB.diagnostico.esp32_p087, false);
  assert.equal(Object.prototype.hasOwnProperty.call(mergedB, PHYSICAL_NODE_DEVICE_ID), false);
});

// 12. Matriz de permisos para los 5 roles sobre /diagnostico/esp32_p087
test('P091-12: Matriz de permisos para los 5 roles (superadmin, admin_minesafe, admin, supervisor, operador)', () => {
  for (const auth of [
    SUPERADMIN_AUTH,
    ADMIN_MINESAFE_AUTH,
    ORG_A_ADMIN_AUTH,
    ORG_A_SUPERVISOR_AUTH,
    ORG_A_OPERATOR_AUTH,
  ]) {
    assert.equal(
      evaluateRTDBRule(rtdbRules, MOCK_DB, '.read', BENCH_TELEMETRY_PATH, auth, undefined, NOW),
      true,
      `Rol ${auth.uid} de org autorizada debe poder leer ${BENCH_TELEMETRY_PATH}`
    );
  }
  // Operador y supervisor NO pueden escribir telemetría en /diagnostico/esp32_p087/CO
  assert.equal(
    evaluateRTDBRule(rtdbRules, MOCK_DB, '.write', `${BENCH_TELEMETRY_PATH}/CO`, ORG_A_OPERATOR_AUTH, 100, NOW),
    false
  );
  assert.equal(
    evaluateRTDBRule(rtdbRules, MOCK_DB, '.write', `${BENCH_TELEMETRY_PATH}/CO`, ORG_A_SUPERVISOR_AUTH, 100, NOW),
    false
  );
  // SuperAdmin verificado sí puede administrar
  assert.equal(
    evaluateRTDBRule(rtdbRules, MOCK_DB, '.write', `${BENCH_TELEMETRY_PATH}/CO`, SUPERADMIN_AUTH, 100, NOW),
    true
  );
});

// 13. Bloqueo de escrituras indebidas del ESP32 fuera de su alcance estricto
test('P091-13: UID del ESP32 bloqueado en usuarios, contratos, organizaciones, alertas, config y otros dispositivos', () => {
  const forbiddenWrites: Array<[string, any]> = [
    ['usuarios/uid-admin-org-a', { role: 'superadmin', status: 'activo' }],
    ['contratos/contract-1', { monto: 1 }],
    ['asignaciones/asg-1', { workerId: 'w1' }],
    ['organizaciones/org-codelco-norte', { name: 'hacked' }],
    ['alertas/alt-1', { title: 'fake' }],
    ['configuracion_plataforma/global', { mode: 'open' }],
    [`dispositivos/${SIMULATED_NODE_DEVICE_ID}`, { CO: 999 }],
    ['dispositivos/device_BETA_01', { CO: 999 }],
    [`dispositivos/${PHYSICAL_NODE_DEVICE_ID}`, null], // prohibido borrar nodo físico
  ];
  for (const [p, val] of forbiddenWrites) {
    assert.equal(
      evaluateRTDBRule(rtdbRules, MOCK_DB, '.write', p, ESP32_PHYSICAL_AUTH, val, NOW),
      false,
      `ESP32 no debe poder escribir en ${p}`
    );
  }
});

// 14. Denegación sin autenticación en /diagnostico/esp32_p087 y su historial
test('P091-14: Acceso no autenticado denegado en lectura y escritura de /diagnostico/esp32_p087 e historial', () => {
  assert.equal(evaluateRTDBRule(rtdbRules, MOCK_DB, '.read', BENCH_TELEMETRY_PATH, null, undefined, NOW), false);
  assert.equal(evaluateRTDBRule(rtdbRules, MOCK_DB, '.write', `${BENCH_TELEMETRY_PATH}/CO`, null, 120, NOW), false);
  assert.equal(evaluateRTDBRule(rtdbRules, MOCK_DB, '.read', BENCH_HISTORY_PATH, null, undefined, NOW), false);
  assert.equal(
    evaluateRTDBRule(
      rtdbRules,
      MOCK_DB,
      '.write',
      `${BENCH_HISTORY_PATH}/hist_unauth`,
      null,
      { co: 100, pm25: 10, temperatura: 22, humedad: 45, timestamp: NOW },
      NOW
    ),
    false
  );
});

// 15. Inmutabilidad y anti-borrado de historial (append-only para ESP32)
test('P091-15: Historial append-only (ESP32 agrega nuevos puntos, pero no sobrescribe ni elimina existentes)', () => {
  // Insertar nuevo punto en /diagnostico/esp32_p087/historial -> PERMITIDO
  assert.equal(
    evaluateRTDBRule(
      rtdbRules,
      MOCK_DB,
      '.write',
      `${BENCH_HISTORY_PATH}/hist_new_999`,
      ESP32_PHYSICAL_AUTH,
      { co: 220, pm25: 25, temperatura: 24.0, humedad: 51, timestamp: NOW },
      NOW
    ),
    true
  );
  // Sobrescribir punto existente -> DENEGADO
  assert.equal(
    evaluateRTDBRule(
      rtdbRules,
      MOCK_DB,
      '.write',
      `${BENCH_HISTORY_PATH}/hist_existing_1`,
      ESP32_PHYSICAL_AUTH,
      { co: 0, pm25: 0, temperatura: 0, humedad: 0, timestamp: NOW },
      NOW
    ),
    false
  );
  // Eliminar punto existente -> DENEGADO
  assert.equal(
    evaluateRTDBRule(rtdbRules, MOCK_DB, '.write', `${BENCH_HISTORY_PATH}/hist_existing_1`, ESP32_PHYSICAL_AUTH, null, NOW),
    false
  );
  // Eliminar todo el historial -> DENEGADO
  assert.equal(
    evaluateRTDBRule(rtdbRules, MOCK_DB, '.write', BENCH_HISTORY_PATH, ESP32_PHYSICAL_AUTH, null, NOW),
    false
  );
});

// 16. Manejo de MQ-2 = 4095 como saturación ADC / medición no válida (sin falsa alarma crítica ni ppm)
test('P091-16: MQ-2 = 4095 marcado como saturación ADC / medición no válida sin generar estado crítico', () => {
  const dev = mapRTDBDeviceToSensorDevice(
    'device_TEST_4095',
    { CO: 4095, PM2_5: 20, temperatura: 22, humedad: 45, last_update_server: NOW - 2_000 },
    20,
    NOW
  );
  assert.equal(dev.adcSaturated, true);
  assert.equal(dev.status, 'normal');
  alertEngine.clearActiveIncidents();
  alertEngine.setDeviceConfig(dev.id, DEFAULT_GLOBAL_THRESHOLDS);
  const engineRes = alertEngine.processDeviceTelemetry(dev);
  assert.equal(engineRes.highestSeverity, 'normal');
  assert.equal(engineRes.newEvents.length, 0);
});

// 17. Manejo seguro de lecturas DHT11 inválidas / NaN / ausentes / fuera de rango
test('P091-17: Lecturas DHT11 ausentes, NaN o fuera de rango registradas como faultFields sin romper mapeo', () => {
  const dev = mapRTDBDeviceToSensorDevice(
    PHYSICAL_NODE_DEVICE_ID,
    {
      CO: 190,
      PM2_5: 25,
      temperatura: Number.NaN,
      humedad: 145,
      last_update_server: NOW - 3_000,
      _isBenchTelemetry: true,
    },
    20,
    NOW
  );
  assert.equal(dev.rawTemp, undefined);
  assert.equal(dev.rawHum, undefined);
  assert.equal(dev.sensorFault, true);
  assert.ok(dev.faultFields?.includes('temperatura'));
  assert.ok(dev.faultFields?.includes('humedad'));
  assert.equal(dev.gatewayOnline, true);
});

// 18. Diferenciación explícita entre nodo físico de banco (simulado: false) y nodo simulado (simulado: true)
test('P091-18: Diferenciación clara entre nodo físico de banco y nodo simulado', () => {
  const merged = mergeBenchTelemetryIntoPhysicalNode(MOCK_DB.dispositivos, MOCK_DB.diagnostico.esp32_p087, false);
  const phys = mapRTDBDeviceToSensorDevice(PHYSICAL_NODE_DEVICE_ID, merged[PHYSICAL_NODE_DEVICE_ID], 20, NOW);
  const sim = mapRTDBDeviceToSensorDevice(SIMULATED_NODE_DEVICE_ID, merged[SIMULATED_NODE_DEVICE_ID], 20, NOW);
  assert.equal(phys.isSimulated, false);
  assert.equal(phys.isBenchTelemetry, true);
  assert.equal(sim.isSimulated, true);
  assert.notEqual(phys.isSimulated, sim.isSimulated);
});

// 19. Separación estricta: telemetría de banco NUNCA genera alertas operacionales en alertEngine
test('P091-19: Telemetría de banco aislada de alertEngine (no dispara alertas operacionales mineras)', () => {
  const hotBench = mergeBenchTelemetryIntoPhysicalNode(
    MOCK_DB.dispositivos,
    {
      CO: 1200,
      PM2_5: 320,
      temperatura: 45,
      humedad: 95,
      simulado: false,
      origen: 'esp32_p087_banco',
      last_update_server: NOW - 1_000,
    },
    false
  );
  const benchDev = mapRTDBDeviceToSensorDevice(PHYSICAL_NODE_DEVICE_ID, hotBench[PHYSICAL_NODE_DEVICE_ID], 20, NOW);
  assert.equal(benchDev.isBenchTelemetry, true);
  assert.equal(benchDev.status, 'normal');
  alertEngine.clearActiveIncidents();
  alertEngine.setDeviceConfig(benchDev.id, DEFAULT_GLOBAL_THRESHOLDS);
  const alertRes = alertEngine.processDeviceTelemetry(benchDev);
  assert.equal(alertRes.highestSeverity, 'normal');
  assert.equal(alertRes.newEvents.length, 0);
});

// 20. Clasificación híbrida de enlace + auditoría de honestidad de sensores y alcance hardware en UI
test('P091-20: Clasificación de enlace híbrido (Wi-Fi directo / ESP-NOW / Desconectado / Desconocido) y honestidad de sensores/alcance', () => {
  const wifiDev = mapRTDBDeviceToSensorDevice(
    PHYSICAL_NODE_DEVICE_ID,
    { CO: 100, PM2_5: 10, temperatura: 22, humedad: 45, via: 'WIFI_DIRECTO', last_update_server: NOW - 2_000 },
    20,
    NOW
  );
  const espNowDev = mapRTDBDeviceToSensorDevice(
    PHYSICAL_NODE_DEVICE_ID,
    {
      CO: 100,
      PM2_5: 10,
      temperatura: 22,
      humedad: 45,
      via: 'ESP_NOW',
      via_puente: true,
      gateway_id: GATEWAY_DEVICE_ID,
      saltos_espnow: 1,
      last_update_server: NOW - 2_000,
    },
    20,
    NOW
  );
  const unknownDev = mapRTDBDeviceToSensorDevice(
    PHYSICAL_NODE_DEVICE_ID,
    { CO: 100, PM2_5: 10, temperatura: 22, humedad: 45, last_update_server: NOW - 2_000 },
    20,
    NOW
  );
  const offlineDev = mapRTDBDeviceToSensorDevice(
    PHYSICAL_NODE_DEVICE_ID,
    { CO: 100, PM2_5: 10, temperatura: 22, humedad: 45, via: 'WIFI_DIRECTO', last_update_server: NOW - 90_000 },
    20,
    NOW
  );

  assert.equal(classifyCommunicationLink(wifiDev), 'wifi_directo');
  assert.equal(classifyCommunicationLink(espNowDev), 'espnow_gateway');
  assert.equal(classifyCommunicationLink(unknownDev), 'origen_desconocido');
  assert.equal(classifyCommunicationLink(offlineDev), 'desconectado');
  assert.ok(DUST_SENSOR_MODEL_LABEL.includes('OPEN-SMART'));
  assert.ok(!DUST_SENSOR_MODEL_LABEL.includes('Sharp'));

  // Verificar ausencia de afirmaciones obsoletas Sharp GP2Y10 / Baliza en módulos clave actualizados
  const checkedFiles = [
    'src/components/BenchTelemetryPanel.tsx',
    'src/components/DualReadingSensorCards.tsx',
    'src/components/ESP32GatewaySection.tsx',
    'src/components/Node3DInspectorView.tsx',
    'src/services/firebase.ts',
  ];
  for (const rel of checkedFiles) {
    const content = fs.readFileSync(path.join(ROOT_DIR, rel), 'utf8');
    assert.equal(/Sharp\s+GP2Y10/i.test(content), false, `${rel} no debe afirmar Sharp GP2Y10`);
  }
});

console.log(`\n✓ P091 COMPLETADO: ${passed}/20 casos de prueba aprobados.\n`);
