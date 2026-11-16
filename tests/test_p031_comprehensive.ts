import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildAtomicAlertResolutionUpdates,
  buildAtomicPaymentUpdates,
  buildOrgScopedAttachmentPath,
  DEFAULT_PLATFORM_CONFIG,
  evaluateWatchedUserStatusSnapshots,
  fetchPaginatedTelemetryHistory,
  isTabVisibleForUser,
  mapRTDBContractToRental,
  validateRentalDatesAndCost,
} from '../src/services/firebase';
import {
  TelemetryCollector,
  buildTelemetryRetentionPruningMap,
} from '../src/services/telemetryCollector';
import {
  handleDeviceWriteTrigger,
  planScheduledTelemetryPruning,
} from '../firebase-functions/telemetryCollector';
import { planLegacyOrganizationBackfill } from '../scripts/migrateLegacyOrganization';
import { buildTelemetryCsvContentAsync } from '../src/components/HistoricalReportsView';
import { resolveNode3DLiveTelemetry } from '../src/components/Node3DInspectorView';
import { resolveGatewayLiveTelemetry } from '../src/components/Gateway3DInspectorView';
import {
  canManageContractsAndPayments,
  canModifyTargetUser,
  canProvisionUserInOrganization,
  filterScopedUsers,
} from '../src/utils/accessControl';
import {
  P031_DELIVERABLE_FILENAMES,
  buildSuperAdminDocumentsCatalog,
  createZipArchiveUint8Array,
  parseMarkdownBlocks,
} from '../src/utils/superAdminDocs';
import { ROOT_MARKDOWN_FILES } from '../src/data/generatedDocs';
import { PlatformConfig, SensorDevice, TelemetryHistoryPoint, UserProfile } from '../src/types';

const rootDir = process.cwd();
const readRepoFile = (relPath: string) => fs.readFileSync(path.join(rootDir, relPath), 'utf8');

function makeUser(overrides: Partial<UserProfile>): UserProfile {
  return {
    id: 'usr-test',
    name: 'Usuario Prueba',
    email: 'prueba@minesafe.cl',
    role: 'operador',
    roleLabel: 'Operador',
    rut: '11.111.111-1',
    shift: 'Turno A',
    status: 'activo',
    organizationId: 'org-alpha',
    ...overrides,
  };
}

function makeDevice(overrides: Partial<SensorDevice> = {}): SensorDevice {
  return {
    id: 'device_38A839E81F84',
    code: 'device_38A839E81F84',
    organizationId: 'org-alpha',
    name: 'Nodo Prueba 1F84',
    type: 'estacion_fija',
    sectorId: 'sec-1',
    sectorName: 'Rampa Principal',
    batteryPct: 92,
    signalStrength: 'optima',
    lastPing: 'Hace 2s',
    status: 'normal',
    assignedTo: 'Operador 1',
    lastUpdateServer: Date.now(),
    gatewayOnline: true,
    rawCO: 18,
    rawPM25: 14,
    rawTemp: 22.8,
    rawHum: 46,
    metrics: {
      temperatura: 22.8,
      humedad: 46,
      co2: 450,
      co: 18,
      ch4: 0,
      o2: 20.9,
      flujoAire: 1.5,
      ruido: 68,
      polvoPM: 14,
    },
    ...overrides,
  };
}

async function runTests() {
  console.log('Running MineSafe P031 Comprehensive Integrity, Security & IoT Suite...\n');

  // ---------------------------------------------------------------------------
  // 1. Validación estructural de database.rules.json, firestore.rules y storage.rules
  // ---------------------------------------------------------------------------
  const rtdbRulesRaw = readRepoFile('database.rules.json');
  const rtdbRules = JSON.parse(rtdbRulesRaw);
  const firestoreRules = readRepoFile('firestore.rules');
  const storageRules = readRepoFile('storage.rules');

  assert.equal(rtdbRules.rules['.read'], false, 'RTDB root read disabled');
  assert.equal(rtdbRules.rules['.write'], false, 'RTDB root write disabled');
  assert.ok(
    !rtdbRulesRaw.includes('!== false'),
    'RTDB no longer uses permissive isActive !== false bypass'
  );
  assert.ok(
    !rtdbRules.rules.dispositivos['$deviceId']['.read'].includes("!data.child('organizationId').exists()"),
    'RTDB dispositivos/$deviceId read removes cross-tenant !exists() bypass'
  );
  assert.ok(
    rtdbRules.rules.dispositivos['$deviceId']['.write'].includes("auth.token.firebase.sign_in_provider === 'custom'") &&
      rtdbRules.rules.dispositivos['$deviceId']['.write'].includes('auth.token.deviceId === $deviceId'),
    'RTDB dispositivos/$deviceId enforces device custom-token binding'
  );
  assert.ok(
    rtdbRules.rules.usuarios['$userId']['.write'].includes('$userId !== auth.uid'),
    'RTDB usuarios/$userId prevents admin self-modification/self-escalation'
  );
  assert.ok(
    rtdbRules.rules.pagos['$paymentId']['.validate'].includes("root.child('contratos/' + newData.child('idContrato').val()).exists()"),
    'RTDB pagos/$paymentId enforces contract existence & org matching'
  );
  assert.ok(
    Boolean(rtdbRules.rules.simulacro['$orgId']) && Boolean(rtdbRules.rules.emergencia['$orgId']),
    'RTDB simulacro & emergencia are org-scoped under $orgId'
  );
  assert.ok(
    rtdbRules.rules.simulacros_bitacora['.indexOn'].includes('organizationId') &&
      rtdbRules.rules.bitacora_configuracion_umbrales['.indexOn'].includes('organizationId'),
    'RTDB audit logs index organizationId for scoped queries'
  );
  assert.equal(rtdbRules.rules.precarga['.write'], false, 'RTDB legacy precarga write locked');

  assert.ok(
    firestoreRules.includes('function isSameOrgMember(orgId)'),
    'firestore.rules defines isSameOrgMember(orgId)'
  );
  assert.ok(
    storageRules.includes('match /adjuntos/{organizationId}/{alertId}/{fileName}') &&
      storageRules.includes('allow update: if false') &&
      storageRules.includes('5 * 1024 * 1024') &&
      storageRules.includes("request.resource.metadata['uploadedByUid'] == request.auth.uid"),
    'storage.rules enforces org-scoped path, immutability, 5MB limit and uploader UID'
  );
  console.log('✅ 1. Firebase RTDB, Firestore & Storage rules static audit passed');

  // ---------------------------------------------------------------------------
  // 2. Backfill multiempresa idempotente (migrateLegacyOrganization.ts)
  // ---------------------------------------------------------------------------
  const legacyRoot = {
    dispositivos: {
      dev1: { CO: 20, PM2_5: 10 },
      dev2: { CO: 15, organizationId: 'org-beta' },
    },
    usuarios: {
      u1: { email: 'a@b.cl', tipoUsuario: 'operador' },
    },
    contratos: {
      c1: { contractNumber: 'C1' },
    },
    alertas: {
      a1: { title: 'Alerta 1' },
    },
    configuracion_alertas: {
      global: { pm25: {} },
      dev2: { pm25: {} },
      dev1: { pm25: {} },
    },
    simulacro: { activo: true, tipo: 'gas_critico', timestamp: 1700000000000 },
    emergencia: { activa: false },
  };
  const plan = planLegacyOrganizationBackfill(legacyRoot, 'org-minesafe-principal');
  assert.equal(plan.updates['dispositivos/dev1/organizationId'], 'org-minesafe-principal');
  assert.equal(plan.updates['dispositivos/dev2/organizationId'], undefined, 'Preserves existing orgId');
  assert.equal(plan.updates['usuarios/u1/organizationId'], 'org-minesafe-principal');
  assert.equal(plan.updates['contratos/c1/organizationId'], 'org-minesafe-principal');
  assert.equal(plan.updates['alertas/a1/organizationId'], 'org-minesafe-principal');
  assert.equal(plan.updates['configuracion_alertas/dev2/organizationId'], 'org-beta');
  assert.ok(plan.updates['simulacro/org-minesafe-principal']);
  assert.ok(plan.updates['emergencia/org-minesafe-principal']);

  const alreadyMigratedPlan = planLegacyOrganizationBackfill(
    {
      dispositivos: { dev1: { organizationId: 'org-minesafe-principal' } },
      simulacro: { 'org-minesafe-principal': { activo: false } },
    },
    'org-minesafe-principal'
  );
  assert.equal(alreadyMigratedPlan.pendingUpdates, 0, 'Migration plan is idempotent');
  console.log('✅ 2. Idempotent legacy multi-org backfill passed');

  // ---------------------------------------------------------------------------
  // 3. RBAC + Aislamiento multiempresa + Visibilidad
  // ---------------------------------------------------------------------------
  const sa = makeUser({ id: 'sa', role: 'superadmin', organizationId: 'org-alpha' });
  const admA = makeUser({ id: 'adm-a', role: 'admin', organizationId: 'org-alpha' });
  const opA = makeUser({ id: 'op-a', role: 'operador', organizationId: 'org-alpha' });
  const opB = makeUser({ id: 'op-b', role: 'operador', organizationId: 'org-beta' });
  assert.equal(canProvisionUserInOrganization(admA, 'org-beta', 'operador').allowed, false);
  assert.equal(canModifyTargetUser(admA, opB).allowed, false);
  assert.equal(canManageContractsAndPayments(admA, 'org-beta').allowed, false);
  assert.equal(canManageContractsAndPayments(sa, 'org-beta').allowed, true);
  assert.deepEqual(
    filterScopedUsers([sa, admA, opA, opB], admA, 'org-beta').map((u) => u.id),
    ['adm-a', 'op-a']
  );
  console.log('✅ 3. RBAC & organization scoping checks passed');

  // ---------------------------------------------------------------------------
  // 4. Expiración / revocación en tiempo real de sesión
  // ---------------------------------------------------------------------------
  assert.equal(
    evaluateWatchedUserStatusSnapshots({
      'uid-1': { exists: true, val: { isActive: true, status: 'activo' } },
    }),
    'activo'
  );
  assert.equal(
    evaluateWatchedUserStatusSnapshots({
      'uid-1': { exists: true, val: { isActive: false, status: 'inactivo' } },
    }),
    'inactivo'
  );
  assert.equal(
    evaluateWatchedUserStatusSnapshots({
      'uid-1': { exists: false },
      'uid-2': { exists: false },
    }),
    'deleted'
  );
  console.log('✅ 4. Live session deactivation & deletion watcher passed');

  // ---------------------------------------------------------------------------
  // 5. Consistencia atómica en cierre de alertas y pagos
  // ---------------------------------------------------------------------------
  const alertUpdates = buildAtomicAlertResolutionUpdates(
    {
      id: 'alt-123',
      code: 'ALT-123',
      organizationId: 'org-alpha',
      title: 'CO Alto',
      severity: 'critico',
      variableName: 'CO',
      sensorId: 'device_1',
      sensorCode: 'DEV1',
      sectorName: 'Nivel 4',
      recordedValue: '60 ppm',
      safeLimit: '< 25 ppm',
      timestamp: '15/11/2026 10:00',
      timestampMs: 1700000000000,
      acknowledged: false,
      resolved: false,
      suggestedAction: 'Ventilar',
    },
    {
      resolutionType: 'emergencia_real',
      comment: 'Ventilación forzada aplicada.',
      correctiveActions: 'Encendido extractor N4.',
      resolvedBy: 'Prevencionista',
      resolvedAt: '15/11/2026 10:15',
    },
    1700000900000,
    { isExistingThresholdEvent: true }
  );
  assert.equal(alertUpdates['alertas/alt-123'].status, 'resuelta');
  assert.equal(alertUpdates['alertas/alt-123'].organizationId, 'org-alpha');
  assert.equal(alertUpdates['bitacora_contingencias/alt-123'].estado, 'resuelta');
  assert.equal(alertUpdates['eventos_umbrales/alt-123/estado'], 'recuperada');

  const paymentUpdates = buildAtomicPaymentUpdates({
    contractKey: 'CNT-2026-01',
    pagoId: 'PAY-1',
    organizationId: 'org-alpha',
    amount: 240000,
    fechaPago: '2026-11-15',
    recordedBy: 'Admin',
    nowMs: 1700001000000,
  });
  assert.equal(paymentUpdates['pagos/PAY-1'].monto, 240000);
  assert.equal(paymentUpdates['pagos/PAY-1'].idContrato, 'CNT-2026-01');
  assert.equal(paymentUpdates['contratos/CNT-2026-01/paymentStatus'], 'al_dia');
  console.log('✅ 5. Atomic multi-path alert resolution & payment updates passed');

  // ---------------------------------------------------------------------------
  // 6. Contratos, fechas, montos > 0 y compatibilidad de dispositivos
  // ---------------------------------------------------------------------------
  assert.throws(
    () =>
      validateRentalDatesAndCost({
        startDate: '2026-12-01',
        endDate: '2026-11-01',
        monthlyCostClp: 200000,
        deviceCode: 'device_1',
        provider: 'MineSafe',
      }),
    /fecha de término/i
  );
  assert.throws(
    () =>
      validateRentalDatesAndCost({
        startDate: '2026-11-01',
        endDate: '2026-12-01',
        monthlyCostClp: 0,
        deviceCode: 'device_1',
        provider: 'MineSafe',
      }),
    /mayor a 0/i
  );
  assert.throws(
    () =>
      validateRentalDatesAndCost({
        startDate: '2026-11-01',
        endDate: '2026-12-01',
        monthlyCostClp: 150000,
        deviceCode: 'device_off',
        provider: 'MineSafe',
        organizationId: 'org-alpha',
        registeredDevices: [
          {
            id: 'device_off',
            name: 'Off',
            category: 'sensor',
            sectorName: 'Nivel 1',
            organizationId: 'org-alpha',
            enabled: false,
            createdAt: 1700000000000,
          },
        ],
      }),
    /deshabilitado/i
  );
  assert.throws(
    () =>
      validateRentalDatesAndCost({
        startDate: '2026-11-01',
        endDate: '2026-12-01',
        monthlyCostClp: 150000,
        deviceCode: 'device_beta',
        provider: 'MineSafe',
        organizationId: 'org-alpha',
        registeredDevices: [
          {
            id: 'device_beta',
            name: 'Beta',
            category: 'sensor',
            sectorName: 'Nivel 2',
            organizationId: 'org-beta',
            enabled: true,
            createdAt: 1700000000000,
          },
        ],
      }),
    /otra organización/i
  );
  const legacyRental = mapRTDBContractToRental('CNT-OLD', {
    idDispositivo: 'DEV-OLD',
    empresa: 'Dräger',
    fechaInicioArriendo: '2025-05-01',
    fechaFinArriendo: '2026-05-01',
    monto: 310000,
    estadoGeneral: 'Por Vencer',
  });
  assert.equal(legacyRental.paymentStatus, 'proximo_a_vencer');
  assert.equal(legacyRental.monthlyCostClp, 310000);
  console.log('✅ 6. Contract date/cost/device compatibility & legacy mapping passed');

  // ---------------------------------------------------------------------------
  // 7. Paginación completa de historial de telemetría (sin truncamiento silencioso)
  // ---------------------------------------------------------------------------
  const allSyntheticPoints: TelemetryHistoryPoint[] = Array.from({ length: 130 }, (_, i) => ({
    timestamp: 1_700_000_000_000 + i * 60_000,
    co: 10 + (i % 5),
    pm25: 12,
    temperatura: 22,
    humedad: 45,
  }));
  const paginatedResult = await fetchPaginatedTelemetryHistory(
    'device_38A839E81F84',
    {
      startMs: allSyntheticPoints[0].timestamp,
      endMs: allSyntheticPoints[allSyntheticPoints.length - 1].timestamp,
    },
    {
      pageSize: 50,
      maxPages: 10,
      fetchPage: async (cursorTs, endMs, pageSize) =>
        allSyntheticPoints
          .filter((p) => p.timestamp >= cursorTs && p.timestamp <= endMs)
          .slice(0, pageSize),
    }
  );
  assert.equal(paginatedResult.points.length, 130, 'Fetches every page across cursor');
  assert.equal(paginatedResult.pagesFetched, 3);
  assert.equal(paginatedResult.truncated, false);
  assert.equal(paginatedResult.error, null);

  const truncatedResult = await fetchPaginatedTelemetryHistory(
    'device_38A839E81F84',
    {
      startMs: allSyntheticPoints[0].timestamp,
      endMs: allSyntheticPoints[allSyntheticPoints.length - 1].timestamp,
    },
    {
      pageSize: 50,
      maxPages: 2,
      fetchPage: async (cursorTs, endMs, pageSize) =>
        allSyntheticPoints
          .filter((p) => p.timestamp >= cursorTs && p.timestamp <= endMs)
          .slice(0, pageSize),
    }
  );
  assert.equal(truncatedResult.points.length, 100);
  assert.equal(truncatedResult.truncated, true, 'Flags explicit truncation when maxPages hit');
  console.log('✅ 7. Cursor-paginated telemetry history & truncation detection passed');

  // ---------------------------------------------------------------------------
  // 8. Exportación CSV asíncrona por bloques (> 12.000 muestras) + RFC-4180
  // ---------------------------------------------------------------------------
  const largeRows = Array.from({ length: 12050 }, (_, idx) => ({
    timestamp: 1_700_000_000_000 + idx * 1000,
    value: Number((20 + (idx % 10) * 0.5).toFixed(1)),
  }));
  const csvOut = await buildTelemetryCsvContentAsync(
    {
      rows: largeRows,
      deviceId: 'device_38A839E81F84',
      variableName: 'Monóxido "CO", Galería Norte',
      unit: 'ppm',
      siteName: 'Faena Norte',
      sectorName: 'Nivel 3, Rampa',
    },
    3000
  );
  assert.ok(csvOut.startsWith('\uFEFFDispositivo,'), 'Includes UTF-8 BOM + headers');
  assert.ok(
    csvOut.includes('"Monóxido ""CO"", Galería Norte"'),
    'Escapes quotes and commas per RFC 4180'
  );
  const lineCount = csvOut.trimEnd().split('\n').length;
  assert.equal(lineCount, 12051, 'Exports header + all 12,050 rows without loss');
  console.log('✅ 8. Async chunked CSV export (12,050 rows + RFC 4180) passed');

  // ---------------------------------------------------------------------------
  // 9. Adjuntos en ruta multiempresa
  // ---------------------------------------------------------------------------
  const scopedPath = buildOrgScopedAttachmentPath(
    'org-alpha',
    'alt-999',
    'att_1',
    'evidencia informe (1).pdf'
  );
  assert.equal(
    scopedPath.storagePath,
    'adjuntos/org-alpha/alt-999/att_1_evidencia_informe__1_.pdf'
  );
  console.log('✅ 9. Org-scoped Storage attachment path builder passed');

  // ---------------------------------------------------------------------------
  // 10. Colector 24/7, validación IoT, deduplicación, fallas y retención
  // ---------------------------------------------------------------------------
  const collector = new TelemetryCollector({
    minIntervalMs: 5000,
    heartbeatIntervalMs: 30000,
    retentionDays: 90,
  });
  const baseTs = 1_700_100_000_000;
  const firstIngest = collector.processIngest(
    { deviceId: 'dev_1', organizationId: 'org-alpha', CO: 24, PM2_5: 18, temperatura: 22.5, humedad: 48 },
    baseTs
  );
  assert.equal(firstIngest.accepted, true);
  assert.equal(firstIngest.sample?.isValid, true);

  // Deduplicación rápida idéntica (< minIntervalMs)
  const dupRapid = collector.processIngest(
    { deviceId: 'dev_1', organizationId: 'org-alpha', CO: 24, PM2_5: 18, temperatura: 22.5, humedad: 48 },
    baseTs + 2000
  );
  assert.equal(dupRapid.accepted, false);
  assert.equal(dupRapid.reason, 'deduplicated_rapid');

  // Canal fuera de rango (-120°C) marca faultFields sin contaminar lectura válida de CO/PM
  const partialFault = collector.processIngest(
    { deviceId: 'dev_1', organizationId: 'org-alpha', CO: 31, PM2_5: 19, temperatura: -120, humedad: 48 },
    baseTs + 6000
  );
  assert.equal(partialFault.accepted, true);
  assert.deepEqual(partialFault.sample?.faultFields, ['temperatura']);
  assert.equal(partialFault.sample?.temperatura, null);
  assert.equal(partialFault.sample?.isValid, false);

  // Cloud Function trigger puro
  const writtenSamples: Array<{ path: string; sample: Record<string, any> }> = [];
  const fnRes = await handleDeviceWriteTrigger(
    {
      deviceId: 'dev_cf_1',
      afterData: {
        organizationId: 'org-beta',
        CO: 42,
        PM2_5: 28,
        temperatura: 24.1,
        humedad: 51,
        last_update_server: 1_700_100_050_000,
      },
    },
    async (rtdbPath, sample) => {
      writtenSamples.push({ path: rtdbPath, sample });
    }
  );
  assert.equal(fnRes.written, true);
  assert.equal(writtenSamples.length, 1);

  // Política de retención (90 días)
  const nowPruneMs = 1_700_100_000_000;
  const oldTs = nowPruneMs - 95 * 24 * 3600 * 1000;
  const recentTs = nowPruneMs - 5 * 24 * 3600 * 1000;
  const removals = buildTelemetryRetentionPruningMap(
    {
      [String(oldTs)]: { timestamp: oldTs },
      [String(recentTs)]: { timestamp: recentTs },
    },
    'dev_1',
    90,
    nowPruneMs
  );
  assert.equal(removals[`historial_telemetria/dev_1/${oldTs}`], null);
  assert.equal(removals[`historial_telemetria/dev_1/${recentTs}`], undefined);
  const scheduledRemovals = planScheduledTelemetryPruning(
    { dev_1: { [String(oldTs)]: { timestamp: oldTs } } },
    90,
    nowPruneMs
  );
  assert.equal(scheduledRemovals[`historial_telemetria/dev_1/${oldTs}`], null);
  console.log('✅ 10. 24/7 TelemetryCollector, Cloud Function trigger & 90d pruning passed');

  // ---------------------------------------------------------------------------
  // 11. Visores 3D: sin datos inventados cuando falta canal o está desconectado
  // ---------------------------------------------------------------------------
  assert.equal(resolveNode3DLiveTelemetry(makeDevice(), false, false), null, 'Simulation returns null for live override');
  const nodeLiveOk = resolveNode3DLiveTelemetry(makeDevice(), false, true);
  assert.equal(nodeLiveOk?.mode, 'vivo');
  assert.equal(nodeLiveOk?.badgeLabel, 'DATOS EN VIVO');
  assert.equal(nodeLiveOk?.temp, 22.8);

  const nodeFault = resolveNode3DLiveTelemetry(
    makeDevice({ faultFields: ['temperatura', 'CO'], rawCO: undefined }),
    false,
    true
  );
  assert.equal(nodeFault?.mode, 'falla_canal');
  assert.equal(nodeFault?.temp, null, 'Faulty temp never falls back to hardcoded 23.4');
  assert.equal(nodeFault?.co, null, 'Faulty CO never falls back to hardcoded value');

  const nodeOffline = resolveNode3DLiveTelemetry(
    makeDevice({ gatewayOnline: false, status: 'desconectado', lastUpdateServer: 0 }),
    false,
    true
  );
  assert.equal(nodeOffline?.mode, 'desconectado');
  assert.equal(nodeOffline?.hum, null);

  const gtwNoTelemetry = resolveGatewayLiveTelemetry(undefined, false);
  assert.equal(gtwNoTelemetry.mode, 'sin_telemetria');
  assert.equal(gtwNoTelemetry.co, null, 'Gateway without live telemetry never fabricates CO=45');
  assert.equal(gtwNoTelemetry.temp, null, 'Gateway without live telemetry never fabricates T=21.5');
  const gtwLive = resolveGatewayLiveTelemetry(makeDevice(), true);
  assert.equal(gtwLive.mode, 'vivo');
  assert.equal(gtwLive.badgeLabel, 'DATOS EN VIVO');
  console.log('✅ 11. 3D Node & Gateway telemetry honesty (live vs fault vs demo) passed');

  // ---------------------------------------------------------------------------
  // 12. Coherencia CI/CD GitHub Pages y configuración Vite
  // ---------------------------------------------------------------------------
  const viteCfg = readRepoFile('vite.config.ts');
  const ghWorkflow = readRepoFile('.github/workflows/deploy-pages.yml');
  assert.ok(viteCfg.includes("base: command === 'build' ? './' : '/'"), 'Relative build base preserved for GitHub Pages');
  assert.ok(
    ghWorkflow.includes('npm run lint') &&
      ghWorkflow.includes('npx eslint firestore.rules') &&
      ghWorkflow.includes('npm test') &&
      ghWorkflow.includes('npm run build'),
    'GitHub Actions workflow runs lint, rules check, unit tests, and production build'
  );
  console.log('✅ 12. GitHub Pages CI/CD pipeline & build config verified');

  // ---------------------------------------------------------------------------
  // 13. Centro Documental P031 exclusivo de SuperAdmin y generación ZIP
  // ---------------------------------------------------------------------------
  const tamperedDocsConfig = {
    ...DEFAULT_PLATFORM_CONFIG,
    visibility: {
      ...DEFAULT_PLATFORM_CONFIG.visibility,
      userOverrides: {
        ...DEFAULT_PLATFORM_CONFIG.visibility.userOverrides,
        [admA.id]: { superadmin_docs: 'allow' },
        [opA.id]: { superadmin_docs: 'allow' },
      },
    },
  } as unknown as PlatformConfig;
  assert.equal(isTabVisibleForUser('superadmin_docs', sa, tamperedDocsConfig), true, 'SuperAdmin always sees superadmin_docs');
  assert.equal(isTabVisibleForUser('superadmin_docs', admA, tamperedDocsConfig), false, 'Admin never sees superadmin_docs');
  assert.equal(isTabVisibleForUser('superadmin_docs', opA, tamperedDocsConfig), false, 'Operador never sees superadmin_docs');
  assert.equal(isTabVisibleForUser('superadmin_docs', null, tamperedDocsConfig), false, 'Null session never sees superadmin_docs');

  const docsViewSrc = readRepoFile('src/components/SuperAdminDocsView.tsx');
  assert.ok(docsViewSrc.includes('ROOT_MARKDOWN_FILES'), 'SuperAdminDocsView loads bundled deliverables manifest');
  assert.ok(!docsViewSrc.includes('import.meta.glob'), 'SuperAdminDocsView avoids import.meta.glob path issues');
  assert.ok(docsViewSrc.includes("currentUser.role !== 'superadmin'"), 'SuperAdminDocsView enforces SuperAdmin-only guard internally');

  for (const fname of P031_DELIVERABLE_FILENAMES) {
    assert.ok(typeof ROOT_MARKDOWN_FILES[fname] === 'string' && ROOT_MARKDOWN_FILES[fname].length > 100, `Generated manifest contains ${fname}`);
  }

  const rawDeliverables: Record<string, string> = {};
  for (const fname of P031_DELIVERABLE_FILENAMES) {
    rawDeliverables[fname] = readRepoFile(fname);
  }
  rawDeliverables['README.md'] = readRepoFile('README.md');

  const docsCatalog = buildSuperAdminDocumentsCatalog(rawDeliverables);
  assert.equal(docsCatalog.length, P031_DELIVERABLE_FILENAMES.length + 1);
  for (let i = 0; i < P031_DELIVERABLE_FILENAMES.length; i++) {
    assert.equal(docsCatalog[i].filename, P031_DELIVERABLE_FILENAMES[i], `P031 deliverable ordered first: ${P031_DELIVERABLE_FILENAMES[i]}`);
    assert.equal(docsCatalog[i].isP031Deliverable, true);
    assert.ok(docsCatalog[i].sizeBytes > 100);
  }

  const parsedBlocks = parseMarkdownBlocks(docsCatalog[0].content);
  assert.ok(parsedBlocks.some((b) => b.type === 'heading' && b.level === 1));
  assert.ok(parsedBlocks.some((b) => b.type === 'table'));

  const zipArchive = createZipArchiveUint8Array(
    docsCatalog.slice(0, 5).map((d) => ({ name: d.filename, content: d.content }))
  );
  assert.equal(zipArchive[0], 0x50); // 'P'
  assert.equal(zipArchive[1], 0x4b); // 'K'
  assert.equal(zipArchive[2], 0x03);
  assert.equal(zipArchive[3], 0x04);
  const eocdOffset = zipArchive.length - 22;
  assert.equal(zipArchive[eocdOffset], 0x50);
  assert.equal(zipArchive[eocdOffset + 1], 0x4b);
  assert.equal(zipArchive[eocdOffset + 2], 0x05);
  assert.equal(zipArchive[eocdOffset + 3], 0x06);
  console.log('✅ 13. SuperAdmin-only P031 docs center, RBAC guard & PKZIP export passed');

  console.log('\n🎉 ALL P031 COMPREHENSIVE TESTS PASSED!');
}

runTests().catch((err) => {
  console.error('❌ P031 suite failed:', err);
  process.exit(1);
});
