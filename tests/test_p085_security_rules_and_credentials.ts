import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { alertEngine } from '../src/services/alertEngine';
import {
  buildUserPersonalDataExportJson,
  computeSha256Hex,
  signCsvExportWithIntegritySeal,
} from '../src/utils/securityCompliance';
import { buildTelemetryCsvContentAsync } from '../src/components/HistoricalReportsView';
import { UserProfile } from '../src/types';

const rootDir = process.cwd();
const readRepo = (relPath: string) => fs.readFileSync(path.join(rootDir, relPath), 'utf8');

// ============================================================================
// Deterministic Firebase RTDB Rule Engine Evaluator (Local Verification)
// Implements Firebase RTDB semantics:
//  - Cascading .read/.write from root down to target path (OR across ancestors)
//  - .validate evaluated at target & ancestor rules ONLY when newData.exists()
//  - DataSnapshot wrapper: exists(), val(), child(p), hasChildren([...]), isString(), isNumber()
// ============================================================================
class MockRuleSnapshot {
  private readonly raw: any;
  constructor(value: any) {
    this.raw = value === undefined ? null : value;
  }
  exists(): boolean {
    return this.raw !== null && this.raw !== undefined;
  }
  val(): any {
    return this.raw;
  }
  isString(): boolean {
    return typeof this.raw === 'string';
  }
  isNumber(): boolean {
    return typeof this.raw === 'number' && Number.isFinite(this.raw);
  }
  child(subPath: string): MockRuleSnapshot {
    const segments = String(subPath)
      .split('/')
      .filter(Boolean);
    let cursor: any = this.raw;
    for (const seg of segments) {
      if (cursor !== null && typeof cursor === 'object' && Object.prototype.hasOwnProperty.call(cursor, seg)) {
        cursor = cursor[seg];
      } else {
        return new MockRuleSnapshot(null);
      }
    }
    return new MockRuleSnapshot(cursor);
  }
  hasChildren(keys: string[]): boolean {
    if (!this.exists() || typeof this.raw !== 'object') return false;
    return keys.every((k) => this.child(k).exists());
  }
}

interface AuthContext {
  uid: string;
  token: {
    email?: string;
    email_verified?: boolean;
    firebase?: { sign_in_provider?: string };
    deviceId?: string;
    organizationId?: string;
    isGateway?: boolean;
  };
}

interface QueryContext {
  orderByChild?: string;
  equalTo?: any;
}

function deepClone<T>(obj: T): T {
  return obj === undefined ? obj : JSON.parse(JSON.stringify(obj));
}

function getAtPath(db: Record<string, any>, segments: string[]): any {
  let cursor: any = db;
  for (const seg of segments) {
    if (cursor !== null && typeof cursor === 'object' && Object.prototype.hasOwnProperty.call(cursor, seg)) {
      cursor = cursor[seg];
    } else {
      return null;
    }
  }
  return cursor;
}

function setAtPath(db: Record<string, any>, segments: string[], value: any): Record<string, any> {
  const next = deepClone(db);
  if (segments.length === 0) return value ?? {};
  let cursor: any = next;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (!cursor[seg] || typeof cursor[seg] !== 'object') {
      cursor[seg] = {};
    }
    cursor = cursor[seg];
  }
  const leaf = segments[segments.length - 1];
  if (value === null || value === undefined) {
    delete cursor[leaf];
  } else {
    cursor[leaf] = deepClone(value);
  }
  return next;
}

function evalRuleExpr(
  expr: string | boolean | undefined,
  env: {
    auth: AuthContext | null;
    root: MockRuleSnapshot;
    data: MockRuleSnapshot;
    newData: MockRuleSnapshot;
    query: QueryContext;
    vars: Record<string, string>;
  }
): boolean {
  if (expr === undefined) return false;
  if (typeof expr === 'boolean') return expr;
  const varNames = Object.keys(env.vars);
  const varValues = varNames.map((k) => env.vars[k]);
  try {
    const fn = new Function(
      'auth',
      'root',
      'data',
      'newData',
      'query',
      ...varNames,
      `"use strict"; return Boolean(${expr});`
    );
    return Boolean(fn(env.auth, env.root, env.data, env.newData, env.query, ...varValues));
  } catch {
    // In RTDB rules, dereferencing null/undefined (e.g. auth.token.firebase.sign_in_provider when missing) evaluates to false
    return false;
  }
}

function resolveRuleChain(rulesRoot: any, segments: string[]) {
  const chain: Array<{ node: any; pathSegments: string[]; vars: Record<string, string> }> = [];
  let cursor = rulesRoot;
  const vars: Record<string, string> = {};
  chain.push({ node: cursor, pathSegments: [], vars: { ...vars } });

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!cursor || typeof cursor !== 'object') break;
    if (Object.prototype.hasOwnProperty.call(cursor, seg)) {
      cursor = cursor[seg];
    } else {
      const wildcardKey = Object.keys(cursor).find((k) => k.startsWith('$'));
      if (!wildcardKey) break;
      vars[wildcardKey] = seg;
      cursor = cursor[wildcardKey];
    }
    chain.push({
      node: cursor,
      pathSegments: segments.slice(0, i + 1),
      vars: { ...vars },
    });
  }
  return chain;
}

function canReadRTDB(
  rulesDoc: any,
  db: Record<string, any>,
  targetPath: string,
  auth: AuthContext | null,
  query: QueryContext = {}
): boolean {
  const segments = targetPath.split('/').filter(Boolean);
  const chain = resolveRuleChain(rulesDoc.rules, segments);
  const rootSnap = new MockRuleSnapshot(db);

  for (const step of chain) {
    if (step.node['.read'] === undefined) continue;
    const dataSnap = new MockRuleSnapshot(getAtPath(db, step.pathSegments));
    if (
      evalRuleExpr(step.node['.read'], {
        auth,
        root: rootSnap,
        data: dataSnap,
        newData: dataSnap,
        query,
        vars: step.vars,
      })
    ) {
      return true;
    }
  }
  return false;
}

function canWriteRTDB(
  rulesDoc: any,
  db: Record<string, any>,
  targetPath: string,
  newValue: any,
  auth: AuthContext | null
): boolean {
  const segments = targetPath.split('/').filter(Boolean);
  const chain = resolveRuleChain(rulesDoc.rules, segments);
  const nextDb = setAtPath(db, segments, newValue);
  const rootSnap = new MockRuleSnapshot(db);

  // 1. Cascading .write check (any ancestor or target returning true grants write authorization)
  let writeAuthorized = false;
  for (const step of chain) {
    if (step.node['.write'] === undefined) continue;
    const dataSnap = new MockRuleSnapshot(getAtPath(db, step.pathSegments));
    const newDataSnap = new MockRuleSnapshot(getAtPath(nextDb, step.pathSegments));
    if (
      evalRuleExpr(step.node['.write'], {
        auth,
        root: rootSnap,
        data: dataSnap,
        newData: newDataSnap,
        query: {},
        vars: step.vars,
      })
    ) {
      writeAuthorized = true;
      break;
    }
  }
  if (!writeAuthorized) return false;

  // 2. Non-cascading .validate checks (every matching rule along the path where newData exists MUST pass)
  for (const step of chain) {
    if (step.node['.validate'] === undefined) continue;
    const dataSnap = new MockRuleSnapshot(getAtPath(db, step.pathSegments));
    const newDataSnap = new MockRuleSnapshot(getAtPath(nextDb, step.pathSegments));
    if (!newDataSnap.exists()) continue; // Firebase RTDB skips .validate on deletion
    const ok = evalRuleExpr(step.node['.validate'], {
      auth,
      root: rootSnap,
      data: dataSnap,
      newData: newDataSnap,
      query: {},
      vars: step.vars,
    });
    if (!ok) return false;
  }

  // 3. Validate direct child rules when writing an object payload
  const leafNode = chain[chain.length - 1]?.node;
  const leafVars = chain[chain.length - 1]?.vars ?? {};
  if (leafNode && newValue && typeof newValue === 'object') {
    for (const [childKey, childVal] of Object.entries(newValue)) {
      const childRule = leafNode[childKey];
      if (!childRule || childRule['.validate'] === undefined) continue;
      if (childVal === null || childVal === undefined) continue;
      const childPath = [...segments, childKey];
      const ok = evalRuleExpr(childRule['.validate'], {
        auth,
        root: rootSnap,
        data: new MockRuleSnapshot(getAtPath(db, childPath)),
        newData: new MockRuleSnapshot(childVal),
        query: {},
        vars: leafVars,
      });
      if (!ok) return false;
    }
  }

  return true;
}

// ============================================================================
// Seeded In-Memory RTDB Fixture & Role Contexts
// ============================================================================
const SUPERADMIN_EMAIL = 'manuelcrisostomovega@gmail.com';

const baseDb: Record<string, any> = {
  organizaciones: {
    'org-minesafe-principal': { id: 'org-minesafe-principal', name: 'MineSafe Principal', status: 'activa' },
    'org-alpha': { id: 'org-alpha', name: 'Minera Alpha SpA', status: 'activa', ownerUid: 'uid-admin-a' },
    'org-beta': { id: 'org-beta', name: 'Minera Beta S.A.', status: 'activa', ownerUid: 'uid-admin-b' },
  },
  usuarios: {
    'uid-superadmin': {
      email: SUPERADMIN_EMAIL,
      tipoUsuario: 'superadmin',
      isSuperUser: true,
      isAdmin: true,
      isActive: true,
      organizationId: 'org-minesafe-principal',
    },
    'uid-admin-ms': {
      email: 'admin.minesafe@minesafe.cl',
      tipoUsuario: 'admin_minesafe',
      isSuperUser: false,
      isAdmin: true,
      isActive: true,
      organizationId: 'org-minesafe-principal',
    },
    'uid-admin-a': {
      email: 'admin@alpha.cl',
      tipoUsuario: 'admin',
      isSuperUser: false,
      isAdmin: true,
      isActive: true,
      organizationId: 'org-alpha',
    },
    'uid-sup-a': {
      email: 'supervisor@alpha.cl',
      tipoUsuario: 'supervisor',
      isSuperUser: false,
      isAdmin: false,
      isActive: true,
      organizationId: 'org-alpha',
    },
    'uid-op-a': {
      email: 'operador@alpha.cl',
      tipoUsuario: 'operador',
      isSuperUser: false,
      isAdmin: false,
      isActive: true,
      organizationId: 'org-alpha',
    },
    'uid-blocked-a': {
      email: 'bloqueado@alpha.cl',
      tipoUsuario: 'admin',
      isSuperUser: false,
      isAdmin: true,
      isActive: false,
      organizationId: 'org-alpha',
    },
    'uid-admin-b': {
      email: 'admin@beta.cl',
      tipoUsuario: 'admin',
      isSuperUser: false,
      isAdmin: true,
      isActive: true,
      organizationId: 'org-beta',
    },
    'uid-iot-node-1f84': {
      email: 'nodo-38a839e81f84@iot.minesafe.local',
      tipoUsuario: 'dispositivo_iot',
      deviceId: 'device_38A839E81F84',
      isGateway: false,
      isSuperUser: false,
      isAdmin: false,
      isActive: true,
      organizationId: 'org-alpha',
    },
    'uid-iot-gateway-v1': {
      email: 'gateway-devkit-v1@iot.minesafe.local',
      tipoUsuario: 'dispositivo_iot',
      deviceId: 'gateway_ESP32_DEVKIT_V1',
      isGateway: true,
      isSuperUser: false,
      isAdmin: false,
      isActive: true,
      organizationId: 'org-alpha',
    },
  },
  dispositivos: {
    device_38A839E81F84: {
      CO: 140,
      PM2_5: 18,
      temperatura: 22.5,
      humedad: 48,
      organizationId: 'org-alpha',
      deviceCategory: 'nodo',
      comando_web: 'PROCESADO_OFF',
      last_update_server: 1763200000000,
    },
    device_9F4C2A7E1B08: {
      CO: 155,
      PM2_5: 20,
      temperatura: 23.0,
      humedad: 50,
      organizationId: 'org-alpha',
      deviceCategory: 'nodo',
      via_puente: 'GATEWAY_ISOLATED',
      gateway_id: 'gateway_ESP32_DEVKIT_V1',
      saltos_espnow: 1,
      last_update_server: 1763200001000,
    },
    device_BETA_01: {
      CO: 120,
      PM2_5: 15,
      temperatura: 21.0,
      humedad: 45,
      organizationId: 'org-beta',
      deviceCategory: 'nodo',
      last_update_server: 1763200002000,
    },
  },
  alertas: {
    alt_a1: { title: 'Gas CO Elevado', severity: 'critico', organizationId: 'org-alpha' },
    alt_b1: { title: 'Polvo Beta', severity: 'advertencia', organizationId: 'org-beta' },
  },
  bitacora_contingencias: {
    alt_a1: { alertaId: 'alt_a1', titulo: 'Gas CO Elevado', estado: 'activa', organizationId: 'org-alpha' },
    alt_b1: { alertaId: 'alt_b1', titulo: 'Polvo Beta', estado: 'activa', organizationId: 'org-beta' },
  },
  contratos: {
    cnt_a1: {
      contractNumber: 'CT-A-01',
      deviceCode: 'device_38A839E81F84',
      provider: 'MineSafe',
      monthlyCostClp: 250000,
      organizationId: 'org-alpha',
    },
    cnt_b1: {
      contractNumber: 'CT-B-01',
      deviceCode: 'device_BETA_01',
      provider: 'MineSafe',
      monthlyCostClp: 280000,
      organizationId: 'org-beta',
    },
  },
  configuracion_alertas: {
    global: { pm25: { critical: 150 }, mq2: { critical: 500 }, temperatura: { critical: 45 }, humedad: { critical: 90 } },
    device_38A839E81F84: { pm25: { critical: 150 }, mq2: { critical: 500 }, temperatura: { critical: 45 }, humedad: { critical: 90 } },
  },
  auditoria_seguridad: {
    evt_existing: {
      id: 'evt_existing',
      timestamp: 1763200000000,
      action: 'LOGIN',
      actorId: 'uid-admin-a',
      summary: 'Inicio de sesión',
    },
  },
  historial_telemetria: {
    device_38A839E81F84: {
      '1763200000000': { timestamp: 1763200000000, co: 140, pm25: 18 },
    },
    device_BETA_01: {
      '1763200000000': { timestamp: 1763200000000, co: 120, pm25: 15 },
    },
  },
};

const ctx = {
  unauth: null as AuthContext | null,
  superAdminVerified: {
    uid: 'uid-superadmin',
    token: { email: SUPERADMIN_EMAIL, email_verified: true, firebase: { sign_in_provider: 'password' } },
  } as AuthContext,
  superAdminUnverifiedSpoof: {
    uid: 'uid-spoof-sa',
    token: { email: SUPERADMIN_EMAIL, email_verified: false, firebase: { sign_in_provider: 'password' } },
  } as AuthContext,
  adminMineSafe: {
    uid: 'uid-admin-ms',
    token: { email: 'admin.minesafe@minesafe.cl', email_verified: true, firebase: { sign_in_provider: 'password' } },
  } as AuthContext,
  adminAlpha: {
    uid: 'uid-admin-a',
    token: { email: 'admin@alpha.cl', email_verified: true, firebase: { sign_in_provider: 'password' } },
  } as AuthContext,
  supervisorAlpha: {
    uid: 'uid-sup-a',
    token: { email: 'supervisor@alpha.cl', email_verified: true, firebase: { sign_in_provider: 'password' } },
  } as AuthContext,
  operadorAlpha: {
    uid: 'uid-op-a',
    token: { email: 'operador@alpha.cl', email_verified: true, firebase: { sign_in_provider: 'password' } },
  } as AuthContext,
  blockedAdminAlpha: {
    uid: 'uid-blocked-a',
    token: { email: 'bloqueado@alpha.cl', email_verified: true, firebase: { sign_in_provider: 'password' } },
  } as AuthContext,
  iotNodeAuth: {
    uid: 'uid-iot-node-1f84',
    token: { email: 'nodo-38a839e81f84@iot.minesafe.local', email_verified: false, firebase: { sign_in_provider: 'password' } },
  } as AuthContext,
  iotNodeCustomToken: {
    uid: 'iot-custom-1f84',
    token: {
      firebase: { sign_in_provider: 'custom' },
      deviceId: 'device_38A839E81F84',
      organizationId: 'org-alpha',
    },
  } as AuthContext,
  iotGatewayAuth: {
    uid: 'uid-iot-gateway-v1',
    token: { email: 'gateway-devkit-v1@iot.minesafe.local', email_verified: false, firebase: { sign_in_provider: 'password' } },
  } as AuthContext,
  iotGatewayCustomToken: {
    uid: 'iot-custom-gw-v1',
    token: {
      firebase: { sign_in_provider: 'custom' },
      deviceId: 'gateway_ESP32_DEVKIT_V1',
      isGateway: true,
      organizationId: 'org-alpha',
    },
  } as AuthContext,
};

async function runTests() {
  console.log('Running MineSafe P085 Security, Credentials & Firebase Rules Verification Suite...\n');

  const rtdbRules = JSON.parse(readRepo('database.rules.json'));

  // ---------------------------------------------------------------------------
  // 1. Acceso sin autenticación denegado (Default Deny)
  // ---------------------------------------------------------------------------
  for (const p of [
    '/',
    'dispositivos',
    'dispositivos/device_38A839E81F84',
    'usuarios',
    'usuarios/uid-admin-a',
    'alertas/alt_a1',
    'bitacora_contingencias/alt_a1',
    'historial_telemetria/device_38A839E81F84',
    'auditoria_seguridad',
    'configuracion_alertas/global',
  ]) {
    assert.equal(canReadRTDB(rtdbRules, baseDb, p, ctx.unauth), false, `Unauth read denied on ${p}`);
    assert.equal(canWriteRTDB(rtdbRules, baseDb, p, { test: 1 }, ctx.unauth), false, `Unauth write denied on ${p}`);
  }
  console.log('✅ 1. Unauthenticated access denied across all RTDB paths (Default Deny)');

  // ---------------------------------------------------------------------------
  // 2. SuperAdmin verificado vs. SuperAdmin sin correo verificado
  // ---------------------------------------------------------------------------
  assert.equal(canReadRTDB(rtdbRules, baseDb, 'dispositivos/device_BETA_01', ctx.superAdminVerified), true);
  assert.equal(canReadRTDB(rtdbRules, baseDb, 'usuarios/uid-admin-b', ctx.superAdminVerified), true);
  assert.equal(
    canWriteRTDB(rtdbRules, baseDb, 'configuracion_alertas/global', { pm25: {}, mq2: {}, temperatura: {}, humedad: {} }, ctx.superAdminVerified),
    true
  );
  assert.equal(canWriteRTDB(rtdbRules, baseDb, 'precarga/test', { a: 1 }, ctx.superAdminVerified), false, 'precarga write locked even for SuperAdmin');

  assert.equal(canReadRTDB(rtdbRules, baseDb, 'dispositivos/device_38A839E81F84', ctx.superAdminUnverifiedSpoof), false);
  assert.equal(canReadRTDB(rtdbRules, baseDb, 'usuarios', ctx.superAdminUnverifiedSpoof), false);
  assert.equal(
    canWriteRTDB(rtdbRules, baseDb, 'configuracion_alertas/global', { pm25: {}, mq2: {}, temperatura: {}, humedad: {} }, ctx.superAdminUnverifiedSpoof),
    false,
    'Unverified SuperAdmin spoof denied'
  );
  console.log('✅ 2. Verified SuperAdmin allowed & unverified SuperAdmin spoof denied');

  // ---------------------------------------------------------------------------
  // 3. Matriz de los 5 roles + aislamiento entre organizaciones
  // ---------------------------------------------------------------------------
  // 3A. Admin MineSafe
  assert.equal(canReadRTDB(rtdbRules, baseDb, 'dispositivos/device_BETA_01', ctx.adminMineSafe), true, 'Admin MineSafe reads multi-org');
  assert.equal(
    canWriteRTDB(rtdbRules, baseDb, 'configuracion_alertas/global', { pm25: {}, mq2: {}, temperatura: {}, humedad: {} }, ctx.adminMineSafe),
    false,
    'Admin MineSafe cannot overwrite global thresholds'
  );
  assert.equal(
    canWriteRTDB(rtdbRules, baseDb, 'configuracion_alertas/device_38A839E81F84', { pm25: {}, mq2: {}, temperatura: {}, humedad: {} }, ctx.adminMineSafe),
    true,
    'Admin MineSafe can update per-device thresholds'
  );
  assert.equal(
    canWriteRTDB(rtdbRules, baseDb, 'configuracion_plataforma', { visibility: {}, metrics: {}, appearance: {} }, ctx.adminMineSafe),
    false,
    'Admin MineSafe cannot mutate configuracion_plataforma'
  );
  assert.equal(
    canWriteRTDB(rtdbRules, baseDb, 'bitacora_contingencias/alt_a1', null, ctx.adminMineSafe),
    false,
    'Admin MineSafe cannot delete bitacora_contingencias'
  );

  // 3B. Administrador de empresa (org-alpha)
  assert.equal(canReadRTDB(rtdbRules, baseDb, 'dispositivos/device_38A839E81F84', ctx.adminAlpha), true);
  assert.equal(canReadRTDB(rtdbRules, baseDb, 'dispositivos/device_BETA_01', ctx.adminAlpha), false, 'Cross-org device read denied');
  assert.equal(canReadRTDB(rtdbRules, baseDb, 'alertas/alt_b1', ctx.adminAlpha), false, 'Cross-org alert read denied');
  assert.equal(canReadRTDB(rtdbRules, baseDb, 'historial_telemetria/device_BETA_01', ctx.adminAlpha), false, 'Cross-org history read denied');
  assert.equal(
    canWriteRTDB(rtdbRules, baseDb, 'dispositivos/device_38A839E81F84/comando_web', 'APAGAR', ctx.adminAlpha),
    true,
    'Company Admin can issue comando_web on own org device'
  );
  assert.equal(
    canWriteRTDB(rtdbRules, baseDb, 'dispositivos/device_BETA_01/comando_web', 'APAGAR', ctx.adminAlpha),
    false,
    'Company Admin denied comando_web on foreign org device'
  );
  assert.equal(
    canWriteRTDB(rtdbRules, baseDb, 'configuracion_alertas/device_38A839E81F84', { pm25: {}, mq2: {}, temperatura: {}, humedad: {} }, ctx.adminAlpha),
    true,
    'Company Admin can update thresholds of own org device'
  );
  assert.equal(
    canWriteRTDB(rtdbRules, baseDb, 'bitacora_contingencias/alt_a1', null, ctx.adminAlpha),
    false,
    'Company Admin cannot delete bitacora_contingencias'
  );

  // 3C. Supervisor (org-alpha)
  assert.equal(canReadRTDB(rtdbRules, baseDb, 'dispositivos/device_38A839E81F84', ctx.supervisorAlpha), true);
  assert.equal(canReadRTDB(rtdbRules, baseDb, 'dispositivos/device_BETA_01', ctx.supervisorAlpha), false);
  assert.equal(
    canWriteRTDB(
      rtdbRules,
      baseDb,
      'bitacora_contingencias/alt_a1',
      { alertaId: 'alt_a1', titulo: 'Gas CO Elevado', estado: 'resuelta', organizationId: 'org-alpha' },
      ctx.supervisorAlpha
    ),
    true,
    'Supervisor can resolve bitacora in own org'
  );
  assert.equal(
    canWriteRTDB(rtdbRules, baseDb, 'bitacora_contingencias/alt_a1', null, ctx.supervisorAlpha),
    false,
    'Supervisor cannot delete bitacora'
  );
  assert.equal(
    canWriteRTDB(rtdbRules, baseDb, 'dispositivos/device_38A839E81F84/comando_web', 'APAGAR', ctx.supervisorAlpha),
    false,
    'Supervisor cannot write comando_web directly to /dispositivos'
  );
  assert.equal(
    canWriteRTDB(rtdbRules, baseDb, 'configuracion_alertas/device_38A839E81F84', { pm25: {}, mq2: {}, temperatura: {}, humedad: {} }, ctx.supervisorAlpha),
    false,
    'Supervisor cannot edit thresholds'
  );

  // 3D. Operador (org-alpha)
  assert.equal(canReadRTDB(rtdbRules, baseDb, 'dispositivos/device_38A839E81F84', ctx.operadorAlpha), true);
  assert.equal(canReadRTDB(rtdbRules, baseDb, 'alertas/alt_a1', ctx.operadorAlpha), true);
  assert.equal(canReadRTDB(rtdbRules, baseDb, 'alertas/alt_b1', ctx.operadorAlpha), false);
  assert.equal(
    canWriteRTDB(
      rtdbRules,
      baseDb,
      'alertas/alt_a1',
      { title: 'Edit', severity: 'normal', organizationId: 'org-alpha' },
      ctx.operadorAlpha
    ),
    false,
    'Operador cannot write alertas'
  );
  assert.equal(
    canWriteRTDB(
      rtdbRules,
      baseDb,
      'bitacora_contingencias/alt_a1',
      { alertaId: 'alt_a1', titulo: 'Edit', estado: 'resuelta', organizationId: 'org-alpha' },
      ctx.operadorAlpha
    ),
    false,
    'Operador cannot write bitacora_contingencias'
  );
  assert.equal(
    canWriteRTDB(
      rtdbRules,
      baseDb,
      'simulacros_bitacora/sim_1',
      { id: 'sim_1', tipoSimulacro: 'gas', clasificacion: 'simulacro', organizationId: 'org-alpha', timestamp: Date.now() },
      ctx.operadorAlpha
    ),
    false,
    'Operador cannot write simulacros_bitacora'
  );

  // 3E. Cuenta bloqueada (isActive: false)
  assert.equal(canReadRTDB(rtdbRules, baseDb, 'dispositivos/device_38A839E81F84', ctx.blockedAdminAlpha), false);
  assert.equal(
    canWriteRTDB(
      rtdbRules,
      baseDb,
      'auditoria_seguridad/evt_blocked',
      { id: 'evt_blocked', timestamp: Date.now(), action: 'FORGE', actorId: 'uid-blocked-a', summary: 'x' },
      ctx.blockedAdminAlpha
    ),
    false,
    'Blocked user cannot write auditoria_seguridad'
  );
  console.log('✅ 3. All 5 roles + cross-organization isolation + blocked user checks passed');

  // ---------------------------------------------------------------------------
  // 4. Prevención de escalamiento de privilegios en /usuarios
  // ---------------------------------------------------------------------------
  assert.equal(
    canWriteRTDB(
      rtdbRules,
      baseDb,
      'usuarios/uid-op-a',
      { email: 'operador@alpha.cl', tipoUsuario: 'superadmin', isSuperUser: true, organizationId: 'org-alpha', isActive: true },
      ctx.operadorAlpha
    ),
    false,
    'Operador self-escalation denied'
  );
  assert.equal(
    canWriteRTDB(
      rtdbRules,
      baseDb,
      'usuarios/uid-admin-a',
      { email: 'admin@alpha.cl', tipoUsuario: 'superadmin', isSuperUser: true, organizationId: 'org-alpha', isActive: true },
      ctx.adminAlpha
    ),
    false,
    'Company Admin self-escalation denied'
  );
  assert.equal(
    canWriteRTDB(
      rtdbRules,
      baseDb,
      'usuarios/uid-new-iot',
      { email: 'rogue@iot.local', tipoUsuario: 'dispositivo_iot', organizationId: 'org-alpha', isActive: true },
      ctx.adminAlpha
    ),
    false,
    'Company Admin cannot provision dispositivo_iot credentials'
  );
  assert.equal(
    canWriteRTDB(
      rtdbRules,
      baseDb,
      'usuarios/uid-admin-ms',
      { email: 'admin.minesafe@minesafe.cl', tipoUsuario: 'superadmin', isSuperUser: true, organizationId: 'org-minesafe-principal', isActive: true },
      ctx.adminMineSafe
    ),
    false,
    'Admin MineSafe self-escalation denied'
  );
  console.log('✅ 4. Privilege escalation attempts blocked across all roles');

  // ---------------------------------------------------------------------------
  // 5. Compatibilidad segura ESP32 (Nodo físico, Gateway y Nodo simulado)
  // ---------------------------------------------------------------------------
  const validNodeUpdate = {
    ...baseDb.dispositivos.device_38A839E81F84,
    CO: 410,
    PM2_5: 62,
    temperatura: 24.5,
    humedad: 53,
    last_update_server: 1763200555,
  };
  const validHistEntry = {
    co: 410,
    pm25: 62,
    temperatura: 24.5,
    humedad: 53,
    msgId: 101,
    fecha_hora: '2026-11-25 14:00:00',
    timestamp_unix: 1795615200,
  };

  // Nodo físico con cuenta Firebase Auth IoT
  assert.equal(canWriteRTDB(rtdbRules, baseDb, 'dispositivos/device_38A839E81F84', validNodeUpdate, ctx.iotNodeAuth), true);
  assert.equal(canReadRTDB(rtdbRules, baseDb, 'dispositivos/device_38A839E81F84/comando_web', ctx.iotNodeAuth), true);
  assert.equal(canWriteRTDB(rtdbRules, baseDb, 'dispositivos/device_38A839E81F84/comando_web', 'PROCESADO_OFF', ctx.iotNodeAuth), true);
  assert.equal(canWriteRTDB(rtdbRules, baseDb, 'dispositivos/device_38A839E81F84/historial/-PushKey1', validHistEntry, ctx.iotNodeAuth), true);
  assert.equal(canWriteRTDB(rtdbRules, baseDb, 'historial_telemetria/device_38A839E81F84/1763200555000', { timestamp: 1763200555000, co: 410 }, ctx.iotNodeAuth), true);

  // Nodo físico con Custom Token
  assert.equal(canWriteRTDB(rtdbRules, baseDb, 'dispositivos/device_38A839E81F84', validNodeUpdate, ctx.iotNodeCustomToken), true);
  assert.equal(canReadRTDB(rtdbRules, baseDb, 'dispositivos/device_38A839E81F84/comando_web', ctx.iotNodeCustomToken), true);

  // Restricciones de nodo físico: NO puede escribir otro nodo, NO puede borrar, NO puede cambiar org, NO puede enviar valores corruptos
  assert.equal(canWriteRTDB(rtdbRules, baseDb, 'dispositivos/device_9F4C2A7E1B08', { ...baseDb.dispositivos.device_9F4C2A7E1B08, CO: 200 }, ctx.iotNodeAuth), false, 'Node cannot write sibling node');
  assert.equal(canWriteRTDB(rtdbRules, baseDb, 'dispositivos/device_BETA_01', { ...baseDb.dispositivos.device_BETA_01, CO: 200 }, ctx.iotNodeAuth), false, 'Node cannot write foreign org node');
  assert.equal(canWriteRTDB(rtdbRules, baseDb, 'dispositivos/device_38A839E81F84', null, ctx.iotNodeAuth), false, 'Node cannot delete itself');
  assert.equal(canWriteRTDB(rtdbRules, baseDb, 'dispositivos/device_38A839E81F84', { ...validNodeUpdate, organizationId: 'org-beta' }, ctx.iotNodeAuth), false, 'Node cannot hijack organizationId');
  assert.equal(canWriteRTDB(rtdbRules, baseDb, 'dispositivos/device_38A839E81F84', { ...validNodeUpdate, CO: 99999 }, ctx.iotNodeAuth), false, 'Out-of-range CO rejected');
  assert.equal(canWriteRTDB(rtdbRules, baseDb, 'dispositivos/device_38A839E81F84/comando_web', 'HACKED', ctx.iotNodeAuth), false, 'Invalid comando_web rejected');
  assert.equal(canWriteRTDB(rtdbRules, baseDb, 'historial_telemetria/device_38A839E81F84/1763200000000', null, ctx.iotNodeAuth), false, 'Node cannot delete history');

  // Gateway (Firebase Auth IoT + Custom Token) retransmitiendo nodo simulado GATEWAY_ISOLATED
  const gatewayRelayedPayload = {
    ...baseDb.dispositivos.device_9F4C2A7E1B08,
    CO: 680,
    PM2_5: 190,
    temperatura: 31.2,
    humedad: 72,
    via_puente: 'GATEWAY_ISOLATED',
    gateway_id: 'gateway_ESP32_DEVKIT_V1',
    saltos_espnow: 1,
    last_update_server: 1763200999,
  };
  assert.equal(canWriteRTDB(rtdbRules, baseDb, 'dispositivos/device_9F4C2A7E1B08', gatewayRelayedPayload, ctx.iotGatewayAuth), true, 'Gateway Auth relays same-org simulated node');
  assert.equal(canWriteRTDB(rtdbRules, baseDb, 'dispositivos/device_9F4C2A7E1B08/historial/-GwPush1', validHistEntry, ctx.iotGatewayAuth), true, 'Gateway Auth pushes autonomous history');
  assert.equal(canReadRTDB(rtdbRules, baseDb, 'dispositivos/device_9F4C2A7E1B08/comando_web', ctx.iotGatewayAuth), true, 'Gateway Auth polls comando_web');
  assert.equal(canWriteRTDB(rtdbRules, baseDb, 'dispositivos/device_9F4C2A7E1B08', gatewayRelayedPayload, ctx.iotGatewayCustomToken), true, 'Gateway Custom Token relays same-org simulated node');
  assert.equal(canWriteRTDB(rtdbRules, baseDb, 'dispositivos/device_BETA_01', { ...baseDb.dispositivos.device_BETA_01, CO: 200 }, ctx.iotGatewayAuth), false, 'Gateway denied cross-org device');
  assert.equal(canReadRTDB(rtdbRules, baseDb, 'dispositivos/device_BETA_01/comando_web', ctx.iotGatewayAuth), false, 'Gateway denied cross-org comando_web');
  console.log('✅ 5. ESP32 Physical Node, Gateway (GATEWAY_ISOLATED) & Simulated Node RTDB rules verified');

  // ---------------------------------------------------------------------------
  // 6. Integridad de auditoria_seguridad (append-only + actorId binding)
  // ---------------------------------------------------------------------------
  assert.equal(
    canWriteRTDB(
      rtdbRules,
      baseDb,
      'auditoria_seguridad/evt_new_1',
      { id: 'evt_new_1', timestamp: Date.now(), action: 'EXPORT_CSV', actorId: 'uid-admin-a', summary: 'Exportó historial' },
      ctx.adminAlpha
    ),
    true,
    'Active user appends own audit event'
  );
  assert.equal(
    canWriteRTDB(
      rtdbRules,
      baseDb,
      'auditoria_seguridad/evt_spoof_actor',
      { id: 'evt_spoof_actor', timestamp: Date.now(), action: 'EXPORT_CSV', actorId: 'uid-superadmin', summary: 'Spoofed actor' },
      ctx.adminAlpha
    ),
    false,
    'Non-SuperAdmin cannot forge another actorId in auditoria_seguridad'
  );
  assert.equal(
    canWriteRTDB(
      rtdbRules,
      baseDb,
      'auditoria_seguridad/evt_existing',
      { id: 'evt_existing', timestamp: Date.now(), action: 'TAMPER', actorId: 'uid-superadmin', summary: 'Tamper' },
      ctx.superAdminVerified
    ),
    false,
    'Existing auditoria_seguridad record cannot be overwritten (append-only)'
  );
  assert.equal(
    canWriteRTDB(rtdbRules, baseDb, 'auditoria_seguridad/evt_existing', null, ctx.superAdminVerified),
    false,
    'Existing auditoria_seguridad record cannot be deleted (append-only)'
  );
  console.log('✅ 6. Append-only security audit log & anti-forgery rules passed');

  // ---------------------------------------------------------------------------
  // 7. Exportaciones (CSV + sello SHA-256 y ARCOP) y Alertas simuladas
  // ---------------------------------------------------------------------------
  const csvRaw = await buildTelemetryCsvContentAsync({
    rows: [
      { timestamp: 1763200000000, value: 420 },
      { timestamp: 1763200060000, value: 680 },
    ],
    deviceId: 'device_9F4C2A7E1B08',
    variableName: 'Gas CO (MQ-2)',
    unit: 'ADC',
    siteName: 'Faena Alpha',
    sectorName: 'Galería 3',
  });
  const sealedCsv = await signCsvExportWithIntegritySeal({
    csvContent: csvRaw,
    reportType: 'telemetria_p085',
    deviceId: 'device_9F4C2A7E1B08',
    actorName: 'Admin Alpha',
    actorRole: 'admin',
    rowCount: 2,
  });
  assert.ok(sealedCsv.signedCsv.includes('# SHA-256 Cuerpo CSV,'), 'Signed CSV includes SHA-256 integrity footer');
  assert.equal(
    sealedCsv.seal.sha256,
    await computeSha256Hex(csvRaw.replace(/^\uFEFF/, '')),
    'SHA-256 matches normalized raw CSV'
  );

  const sampleProfile: UserProfile = {
    id: 'uid-op-a',
    name: 'Operador Alpha',
    email: 'operador@alpha.cl',
    role: 'operador',
    roleLabel: 'Operador',
    rut: '12.345.678-9',
    shift: 'Turno A',
    status: 'activo',
    organizationId: 'org-alpha',
  };
  const arcopBundle = buildUserPersonalDataExportJson({
    targetUser: sampleProfile,
    actingUser: sampleProfile,
  });
  assert.ok(arcopBundle.normativeFramework.includes('Ley 21.719'), 'ARCOP export references Ley 21.719 compliance');

  alertEngine.setPersistenceHandlers({
    saveEvent: async () => {},
    updateEvent: async () => {},
    closeAlert: async () => {},
    playSound: () => {},
  });
  const simEval = alertEngine.processDeviceTelemetry({
    id: 'device_9F4C2A7E1B08',
    code: 'device_9F4C2A7E1B08',
    organizationId: 'org-alpha',
    name: 'Nodo Simulado 1B08',
    type: 'estacion_fija',
    sectorId: 'sec-1',
    sectorName: 'Galería 3',
    batteryPct: 95,
    signalStrength: 'optima',
    lastPing: 'Hace 2s',
    status: 'normal',
    assignedTo: 'Operador Alpha',
    rawCO: 720,
    rawPM25: 195,
    rawTemp: 32,
    rawHum: 70,
    metrics: {
      temperatura: 32,
      humedad: 70,
      co2: 450,
      co: 720,
      ch4: 0,
      o2: 20.9,
      flujoAire: 1.5,
      ruido: 68,
      polvoPM: 195,
    },
  });
  alertEngine.resetPersistenceHandlers();
  assert.equal(simEval.highestSeverity, 'critico', 'Simulated critical reading evaluates to critico');
  assert.ok(simEval.newEvents.length >= 2, 'Triggers both CO and PM2.5 critical events');
  console.log('✅ 7. Signed CSV + ARCOP exports & simulated critical alert evaluation passed');

  // ---------------------------------------------------------------------------
  // 8. Higiene de credenciales en frontend, firmware y configuración (Punto 12)
  // ---------------------------------------------------------------------------
  const gitignore = readRepo('.gitignore');
  assert.ok(gitignore.includes('**/secrets.h') && gitignore.includes('*firebase-adminsdk*.json') && gitignore.includes('*.pem'));

  const envExample = readRepo('.env.example');
  assert.ok(!envExample.includes('AIza') && envExample.includes('INGEST_API_TOKEN=""') && envExample.includes('FIREBASE_DB_SECRET=""'));

  const nodoIno = readRepo('firmware/nodo_esp32/nodo_esp32.ino');
  const gwCpp = readRepo('firmware/gateway_esp32/main.cpp');
  const simCpp = readRepo('firmware/nodo_simulado_esp32/main.cpp');

  for (const [label, src] of [
    ['firmware/nodo_esp32/nodo_esp32.ino', nodoIno],
    ['firmware/gateway_esp32/main.cpp', gwCpp],
    ['firmware/nodo_simulado_esp32/main.cpp', simCpp],
  ]) {
    assert.ok(src.includes('#include "secrets.h"'), `${label} loads credentials from external secrets.h`);
    assert.ok(!src.includes('minefase-fc5f5'), `${label} has no hardcoded production Firebase host`);
    assert.ok(src.includes('FIREBASE_DEVICE_EMAIL') && src.includes('FIREBASE_API_KEY'), `${label} supports Firebase Auth device login`);
    assert.ok(src.includes('struct_mesh_packet') && src.includes('96'), `${label} preserves 96-byte ESP-NOW packet`);
  }

  // Verify local safety thresholds untouched in physical node
  assert.ok(
    nodoIno.includes('#define UMBRAL_MQ2_PRECAUCION  350') &&
      nodoIno.includes('#define UMBRAL_MQ2_CRITICO     500') &&
      nodoIno.includes('#define UMBRAL_PM25_PRECAUCION 55.0') &&
      nodoIno.includes('#define UMBRAL_PM25_CRITICO    150.0') &&
      nodoIno.includes('ejecutarPatronSirena') &&
      nodoIno.includes('actualizarMatrizAlarma'),
    'Physical node preserves all local safety thresholds and physical alarm actuators'
  );

  // Verify zero server-side admin secrets in src/
  const walkSrcFiles = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...walkSrcFiles(full));
      else if (/\.(ts|tsx|js|mjs)$/.test(entry.name) && entry.name !== 'generatedDocs.ts') out.push(full);
    }
    return out;
  };
  const frontendFiles = walkSrcFiles(path.join(rootDir, 'src'));
  const forbiddenPatterns = [
    /BEGIN PRIVATE KEY/,
    /firebase-adminsdk/i,
    /FIREBASE_DB_SECRET/,
    /INGEST_API_TOKEN/,
    /legacy_token/,
  ];
  for (const f of frontendFiles) {
    const content = fs.readFileSync(f, 'utf8');
    for (const pat of forbiddenPatterns) {
      assert.equal(pat.test(content), false, `Frontend file ${path.relative(rootDir, f)} must not contain ${pat}`);
    }
  }
  console.log('✅ 8. Credential hygiene across frontend, .gitignore, .env.example & all 3 ESP32 firmwares passed');

  console.log('\n🎉 All MineSafe P085 security, credentials & Firebase rules checks passed!');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
