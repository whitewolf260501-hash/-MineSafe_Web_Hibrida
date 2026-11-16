import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  assertActiveSession,
  canManageContractsAndPayments,
  filterScopedEntities,
  isUserSessionActive,
} from '../src/utils/accessControl';
import {
  DEFAULT_PLATFORM_CONFIG,
  buildAlertBasePayload,
  buildRentalContractRTDBPayload,
  isTabVisibleForUser,
  mapRTDBAlertRecord,
  mapRTDBContractToRental,
  resolveConfiguredRtdbUrl,
  resolveTelemetryWindowMs,
} from '../src/services/firebase';
import {
  buildTelemetryCsvContent,
  computeTelemetryWindow,
  downsampleChartPoints,
  escapeCsvCell,
} from '../src/components/HistoricalReportsView';
import { DeviceRental, SafetyAlert, UserProfile } from '../src/types';

function makeUser(overrides: Partial<UserProfile>): UserProfile {
  return {
    id: 'usr-test',
    name: 'Test User',
    email: 'test@minesafe.cl',
    role: 'operador',
    roleLabel: 'Operador',
    rut: '12.345.678-9',
    shift: 'Turno A',
    status: 'activo',
    organizationId: 'org-alpha',
    ...overrides,
  };
}

console.log('Running MineSafe Audit & Stabilization Verification Suite...\n');

// -----------------------------------------------------------------------------
// 1. Database & Storage Security Rules Invariants
// -----------------------------------------------------------------------------
const rootDir = process.cwd();
const readRoot = (rel: string) => fs.readFileSync(path.join(rootDir, rel), 'utf8');

const dbRulesRaw = readRoot('database.rules.json');
const dbRules = JSON.parse(dbRulesRaw);
const r = dbRules.rules;

assert.ok(r, 'database.rules.json must contain top-level rules object');

// No parent-level wildcard auth.uid != null full read on sensitive collections
for (const sensitivePath of [
  'dispositivos',
  'usuarios',
  'contratos',
  'pagos',
  'asignaciones',
  'alertas',
  'bitacora_contingencias',
  'adjuntos',
  'eventos_umbrales',
  'faenas',
]) {
  const node = r[sensitivePath];
  assert.ok(node, `RTDB rule path /${sensitivePath} must exist`);
  const parentRead = String(node['.read'] || '');
  assert.ok(
    parentRead !== 'auth != null',
    `/${sensitivePath} must NOT grant unrestricted parent .read to any authenticated user`
  );
  assert.ok(
    Array.isArray(node['.indexOn']) && node['.indexOn'].length > 0,
    `/${sensitivePath} must define explicit .indexOn keys`
  );
}

assert.ok(
  r.organizaciones?.['.read']?.includes('superadmin') &&
    r.organizaciones?.['$orgId']?.['.read']?.includes('$orgId ==='),
  '/organizaciones restricts full list to SuperAdmin and child read to matching orgId'
);

assert.ok(
  Array.isArray(r.usuarios['.indexOn']) &&
    r.usuarios['.indexOn'].includes('organizationId') &&
    r.usuarios['.indexOn'].includes('email'),
  '/usuarios must index organizationId and email for scoped & login queries'
);

assert.ok(
  r.alertas?.$alertId?.['.validate']?.includes("hasChildren(['title', 'severity', 'organizationId'])"),
  '/alertas/$alertId must validate title, severity, and organizationId'
);
assert.ok(
  r.contratos?.$contractId?.['.validate']?.includes(
    "hasChildren(['contractNumber', 'deviceCode', 'provider', 'organizationId'])"
  ),
  '/contratos/$contractId must validate canonical contract fields and organizationId'
);
assert.ok(
  r.pagos?.$paymentId?.['.validate']?.includes(
    "hasChildren(['idContrato', 'monto', 'estado', 'fechaPago', 'organizationId'])"
  ),
  '/pagos/$paymentId must validate payment fields including organizationId'
);
assert.ok(
  Array.isArray(r.historial_telemetria?.$deviceId?.['.indexOn']) &&
    r.historial_telemetria.$deviceId['.indexOn'].includes('timestamp'),
  '/historial_telemetria/$deviceId must index timestamp for time-range queries'
);

const storageRules = readRoot('storage.rules');
assert.ok(storageRules.includes('allow read: if request.auth != null;'), 'Storage restricts reads to signed-in users');
assert.ok(storageRules.includes('5 * 1024 * 1024'), 'Storage enforces 5 MB upload ceiling');
assert.ok(
  storageRules.includes('image/(jpeg|png|webp)|application/pdf'),
  'Storage enforces strict evidence MIME allowlist'
);
assert.ok(storageRules.includes('allow read, write: if false;'), 'Storage denies all unconfigured paths');
console.log('✅ 1. Firebase RTDB & Storage security rules invariants passed');

// -----------------------------------------------------------------------------
// 2. Active Session & Contract/Payment RBAC Guards
// -----------------------------------------------------------------------------
const superadmin = makeUser({ id: 'sa-1', role: 'superadmin', organizationId: 'org-alpha' });
const adminAlpha = makeUser({ id: 'adm-a', role: 'admin', organizationId: 'org-alpha' });
const opAlpha = makeUser({ id: 'op-a', role: 'operador', organizationId: 'org-alpha' });
const inactiveAdmin = makeUser({ id: 'adm-off', role: 'admin', status: 'inactivo', organizationId: 'org-alpha' });

assert.equal(isUserSessionActive(adminAlpha), true);
assert.equal(isUserSessionActive(inactiveAdmin), false);
assert.throws(() => assertActiveSession(null), /inactiva|revocada/i);
assert.throws(() => assertActiveSession(inactiveAdmin), /inactiva|revocada/i);
assert.doesNotThrow(() => assertActiveSession(adminAlpha));

assert.equal(canManageContractsAndPayments(opAlpha, 'org-alpha').allowed, false, 'Operador cannot manage contracts/payments');
assert.equal(canManageContractsAndPayments(inactiveAdmin, 'org-alpha').allowed, false, 'Inactive admin cannot manage contracts/payments');
assert.equal(canManageContractsAndPayments(adminAlpha, 'org-beta').allowed, false, 'Admin Alpha cannot manage org-beta contracts/payments');
assert.equal(canManageContractsAndPayments(adminAlpha, 'org-alpha').allowed, true, 'Admin Alpha can manage org-alpha contracts/payments');
assert.equal(canManageContractsAndPayments(superadmin, 'org-beta').allowed, true, 'SuperAdmin can manage cross-org contracts/payments');

const orgItems = [
  { id: '1', organizationId: 'org-alpha' },
  { id: '2', organizationId: 'org-beta' },
];
assert.deepEqual(
  filterScopedEntities(orgItems, adminAlpha, 'org-beta').map((x) => x.id),
  ['1'],
  'Admin scope ignores foreign requestedOrgId'
);
assert.deepEqual(
  filterScopedEntities(orgItems, superadmin, 'all').map((x) => x.id),
  ['1', '2'],
  'SuperAdmin all scope returns all orgs'
);
console.log('✅ 2. Active session, multi-tenant entity scoping & contracts/payments RBAC passed');

// -----------------------------------------------------------------------------
// 3. RTDB URL Configuration, Canonical Alerts & Rental Payloads
// -----------------------------------------------------------------------------
assert.equal(
  resolveConfiguredRtdbUrl('https://custom-minesafe-rtdb.firebaseio.com/'),
  'https://custom-minesafe-rtdb.firebaseio.com/',
  'Valid https RTDB env URL is honored'
);
assert.equal(
  resolveConfiguredRtdbUrl('http://insecure-rtdb.firebaseio.com/'),
  'https://minefase-fc5f5-default-rtdb.firebaseio.com/',
  'Non-HTTPS env URL falls back to safe default'
);
assert.equal(
  resolveConfiguredRtdbUrl('not-a-url'),
  'https://minefase-fc5f5-default-rtdb.firebaseio.com/',
  'Malformed env URL falls back safely'
);

const sampleAlert: SafetyAlert = {
  id: 'alt-123',
  code: 'ALT-123',
  organizationId: 'org-alpha',
  title: 'Exceso CO Galería Norte',
  severity: 'critico',
  variableName: 'CO',
  sensorId: 'device_38A839E81F84',
  sensorCode: 'device_38A839E81F84',
  sectorName: 'Rampa Principal',
  recordedValue: '1250 ADC',
  safeLimit: '< 800 ADC',
  timestamp: '15/11/2026 10:00',
  timestampMs: 1_763_200_000_000,
  acknowledged: false,
  resolved: false,
  suggestedAction: 'Activar ventilación auxiliar',
};

const rtdbAlertPayload = buildAlertBasePayload(sampleAlert, sampleAlert.timestampMs!);
assert.equal(rtdbAlertPayload.title, sampleAlert.title, 'Canonical alert payload includes title');
assert.equal(rtdbAlertPayload.severity, 'critico', 'Canonical alert payload includes severity');
assert.equal(rtdbAlertPayload.organizationId, 'org-alpha', 'Canonical alert payload includes organizationId');
assert.equal(rtdbAlertPayload.titulo, sampleAlert.title, 'Preserves legacy titulo alias');

const mappedLegacyAlert = mapRTDBAlertRecord('legacy-1', {
  titulo: 'Alerta Legacy ESP32',
  severidad: 'advertencia',
  valor: '450 ADC',
  timestamp: 1_763_100_000_000,
});
assert.equal(mappedLegacyAlert.title, 'Alerta Legacy ESP32', 'Maps legacy titulo cleanly');
assert.equal(mappedLegacyAlert.severity, 'advertencia', 'Maps legacy severidad cleanly');

const sampleRental: DeviceRental = {
  id: 'rent-1',
  organizationId: 'org-alpha',
  contractNumber: 'CT-2026-009',
  deviceCode: 'device_38A839E81F84',
  deviceType: 'Gateway ESP32',
  provider: 'MineSafe Mining Equipments',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  monthlyCostClp: 310000,
  paymentStatus: 'pago_pendiente',
  lastPaymentDate: '2026-10-01',
  nextDueDate: '2026-11-30',
  assignedTechnician: 'Equipo Terreno',
  notes: 'Contrato de prueba',
};
const rtdbContract = buildRentalContractRTDBPayload(sampleRental);
assert.equal(rtdbContract.contractNumber, 'CT-2026-009');
assert.equal(rtdbContract.deviceCode, 'device_38A839E81F84');
assert.equal(rtdbContract.provider, 'MineSafe Mining Equipments');
assert.equal(rtdbContract.organizationId, 'org-alpha');
assert.equal(rtdbContract.monthlyCostClp, 310000);
assert.equal(rtdbContract.paymentStatus, 'pago_pendiente');

const remappedRental = mapRTDBContractToRental('CT-2026-009', rtdbContract);
assert.equal(remappedRental.monthlyCostClp, 310000);
assert.equal(remappedRental.paymentStatus, 'pago_pendiente');
console.log('✅ 3. RTDB URL resolver & canonical alert/contract payload parity passed');

// -----------------------------------------------------------------------------
// 4. Telemetry Time Windowing, Downsampling & RFC-4180 Full CSV Export
// -----------------------------------------------------------------------------
const fixedNow = Date.UTC(2026, 10, 15, 18, 0, 0);
const w7d = resolveTelemetryWindowMs(24 * 7, fixedNow);
assert.equal(w7d.endMs, fixedNow);
assert.equal(w7d.startMs, fixedNow - 7 * 24 * 3600 * 1000);
assert.equal(w7d.limit, 15000, '7d telemetry query uses high-capacity limit (15,000)');

const customWin = computeTelemetryWindow('custom', '2026-11-01', '2026-11-10', fixedNow);
assert.equal(customWin.key, 'custom');
assert.ok(customWin.startMs <= customWin.endMs, 'Custom window bounds are ordered');

assert.equal(escapeCsvCell('Mina, "Norte"\nSector 2'), '"Mina, ""Norte""\nSector 2"', 'RFC-4180 CSV escaping works');

const denseRows = Array.from({ length: 120 }, (_, idx) => ({
  timestamp: fixedNow - (120 - idx) * 60_000,
  value: 20 + idx * 0.25,
}));
const chartSample = downsampleChartPoints(denseRows, 36);
assert.equal(chartSample.length, 36, 'Chart downsampling caps visual SVG points without altering underlying dataset');
assert.equal(chartSample[0].timestamp, denseRows[0].timestamp, 'Downsampling preserves start point');
assert.equal(chartSample[35].timestamp, denseRows[119].timestamp, 'Downsampling preserves latest point');

const csv = buildTelemetryCsvContent({
  rows: denseRows,
  deviceId: 'device_38A839E81F84',
  variableName: 'TEMPERATURA AMBIENTE',
  unit: '°C',
  siteName: 'Faena "Chuqui", Norte',
  sectorName: 'Rampa Principal',
});
assert.ok(csv.startsWith('\uFEFF'), 'CSV includes UTF-8 BOM for Excel');
const csvLines = csv.trim().split('\n');
assert.equal(csvLines.length, 121, 'CSV exports ALL 120 rows plus header (no .slice(-36) truncation)');
assert.ok(csvLines[1].includes('"Faena ""Chuqui"", Norte"'), 'Escapes quotes/commas per RFC 4180');
console.log('✅ 4. Telemetry windowing, visual downsampling & full-series RFC-4180 CSV passed');

// -----------------------------------------------------------------------------
// 5. Static Audit Regression Invariants
// -----------------------------------------------------------------------------
const appSrc = readRoot('src/App.tsx');
const rootAppSrc = readRoot('src/RootApp.tsx');
const reportsSrc = readRoot('src/components/HistoricalReportsView.tsx');
const gatewaySectionSrc = readRoot('src/components/ESP32GatewaySection.tsx');
const deployWorkflowSrc = readRoot('.github/workflows/deploy-pages.yml');
const pkgJsonSrc = readRoot('package.json');
const envExampleSrc = readRoot('.env.example');

assert.ok(!appSrc.includes('recordPaymentInRTDB(contractId, 25000)'), 'Hardcoded 25000 payment bug removed from App.tsx');
assert.ok(appSrc.includes('subscriptionScope'), 'App.tsx wires subscriptionScope to RTDB subscriptions');
assert.ok(appSrc.includes('scopedAlertEvents'), 'App.tsx passes org-scoped alertEvents to HistoricalReportsView');
assert.ok(rootAppSrc.includes('subscribeToCurrentUserStatus'), 'RootApp enforces direct status listener revocation');
assert.ok(!reportsSrc.includes('recentHist.slice(-36)'), 'HistoricalReportsView no longer truncates chart/export to 36 points');
assert.ok(!reportsSrc.includes('eventos_unbrales'), 'HistoricalReportsView typo /eventos_unbrales fixed');
assert.ok(!gatewaySectionSrc.includes('más de 15 seg'), 'ESP32GatewaySection avoids hardcoded mismatched 15s offline threshold copy');
assert.ok(pkgJsonSrc.includes('rm -rf dist/assets/aistudio'), 'Build strips workspace-only aistudio assets from dist');
assert.ok(deployWorkflowSrc.includes('npm test') && deployWorkflowSrc.includes('npm run lint'), 'CI executes tests and typecheck before deploying Pages');
assert.ok(!envExampleSrc.includes('AIza'), '.env.example contains zero real secrets or API keys');
console.log('✅ 5. Static audit & CI hygiene invariants passed');

// -----------------------------------------------------------------------------
// 6. Gateway 3D Role & Per-User Visibility Controls
// -----------------------------------------------------------------------------
assert.equal(
  DEFAULT_PLATFORM_CONFIG.visibility.rolePermissions.admin.gateway_3d,
  true,
  'gateway_3d defaults to visible for admin'
);
assert.equal(
  DEFAULT_PLATFORM_CONFIG.visibility.rolePermissions.operador.gateway_3d,
  false,
  'gateway_3d defaults to hidden for operador'
);
assert.equal(
  isTabVisibleForUser('gateway_3d', superadmin, DEFAULT_PLATFORM_CONFIG),
  true,
  'SuperAdmin always sees gateway_3d'
);
assert.equal(
  isTabVisibleForUser('gateway_3d', adminAlpha, DEFAULT_PLATFORM_CONFIG),
  true,
  'Admin sees gateway_3d under default config'
);
assert.equal(
  isTabVisibleForUser('gateway_3d', opAlpha, DEFAULT_PLATFORM_CONFIG),
  false,
  'Operador cannot see gateway_3d under default config'
);

const gatewayCustomConfig = {
  ...DEFAULT_PLATFORM_CONFIG,
  visibility: {
    ...DEFAULT_PLATFORM_CONFIG.visibility,
    rolePermissions: {
      ...DEFAULT_PLATFORM_CONFIG.visibility.rolePermissions,
      operador: {
        ...DEFAULT_PLATFORM_CONFIG.visibility.rolePermissions.operador,
        gateway_3d: true,
      },
    },
    userOverrides: {
      'adm-a': { gateway_3d: 'block' as const },
    },
    userOverridesByEmail: {
      'op_special@minesafe_cl': { gateway_3d: 'allow' as const },
    },
  },
};

assert.equal(
  isTabVisibleForUser('gateway_3d', opAlpha, gatewayCustomConfig),
  true,
  'Operador role toggle enables gateway_3d'
);
assert.equal(
  isTabVisibleForUser('gateway_3d', adminAlpha, gatewayCustomConfig),
  false,
  'Per-user ID block override hides gateway_3d for specific admin'
);
const opSpecial = makeUser({ id: 'op-spec', email: 'op_special@minesafe.cl', role: 'operador' });
assert.equal(
  isTabVisibleForUser('gateway_3d', opSpecial, DEFAULT_PLATFORM_CONFIG),
  false
);
assert.equal(
  isTabVisibleForUser('gateway_3d', opSpecial, gatewayCustomConfig),
  true,
  'Per-user email allow override grants gateway_3d access'
);

console.log('✅ 6. Gateway 3D role & individual visibility rules passed');
console.log('\n🎉 All MineSafe Audit & Stabilization checks passed!');
