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
  isEquiposSubTabVisibleForUser,
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
  assignWorkersToCrew,
  buildCrewMemberFromUser,
  canCreateOrEditOrganization,
  canDeleteOrganization,
  canManageContractsAndPayments,
  canManageCrews,
  canModifyTargetUser,
  canProvisionUserInOrganization,
  createEmptyTelemetryVariables,
  DEFAULT_ORGANIZATION_ID,
  filterScopedEntities,
  filterScopedUsers,
  findUserEmailConflictInOrg,
  getAuthorizedOrganizationIds,
  resolveEffectiveOrgId,
  resolveScopedCurrentSite,
  selectBestLoginProfileForEmail,
} from '../src/utils/accessControl';
import {
  getBulkCsvTemplate,
  getBulkJsonBundleTemplate,
  parseBulkCompanyBundle,
  parseBulkInput,
} from '../src/utils/bulkCompanyImport';
import {
  P031_DELIVERABLE_FILENAMES,
  buildSuperAdminDocumentsCatalog,
  createZipArchiveUint8Array,
  parseMarkdownBlocks,
} from '../src/utils/superAdminDocs';
import { ROOT_MARKDOWN_FILES } from '../src/data/generatedDocs';
import { MiningCrew, Organization, PlatformConfig, SensorDevice, TelemetryHistoryPoint, UserProfile } from '../src/types';

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

  // ---------------------------------------------------------------------------
  // 14. Admin: Creación de Empresas Propias, Aislamiento Multi-Org y Carga Masiva
  // ---------------------------------------------------------------------------
  assert.ok(
    rtdbRules.rules.organizaciones['.indexOn'].includes('ownerUid'),
    'RTDB organizaciones indexes ownerUid for admin queries'
  );
  assert.ok(
    rtdbRules.rules.organizaciones['$orgId']['.write'].includes('ownerUid'),
    'RTDB organizaciones/$orgId enforces ownerUid for admin creation/edit'
  );
  assert.ok(
    rtdbRules.rules.organizaciones['$orgId']['.write'].includes(DEFAULT_ORGANIZATION_ID),
    'RTDB protects default org from admin edits'
  );

  const ownedOrgs: Organization[] = [
    {
      id: DEFAULT_ORGANIZATION_ID,
      name: 'MineSafe Principal',
      rut: '76.111.222-3',
      industry: 'Minería',
      status: 'activa',
      createdAt: 1700000000000,
    },
    {
      id: 'org-gamma',
      name: 'Minera Gamma SpA',
      rut: '76.999.888-7',
      industry: 'Minería Subterránea',
      status: 'activa',
      createdAt: 1700000001000,
      ownerUid: admA.id,
      ownerId: admA.id,
      ownerEmail: admA.email,
    },
    {
      id: 'org-beta',
      name: 'Minera Beta S.A.',
      rut: '76.555.444-3',
      industry: 'Rajo',
      status: 'activa',
      createdAt: 1700000002000,
      ownerUid: 'adm-b',
      ownerId: 'adm-b',
      ownerEmail: 'adm-b@minesafe.cl',
    },
  ];

  // Tab visibility: empresas enabled for superadmin & admin, hidden for operador & monotoriador
  const monA = makeUser({ id: 'mon-a', role: 'monotoriador', organizationId: 'org-alpha' });
  assert.equal(isTabVisibleForUser('empresas', sa, DEFAULT_PLATFORM_CONFIG), true);
  assert.equal(isTabVisibleForUser('empresas', admA, DEFAULT_PLATFORM_CONFIG), true);
  assert.equal(isTabVisibleForUser('empresas', monA, DEFAULT_PLATFORM_CONFIG), false);
  assert.equal(isTabVisibleForUser('empresas', opA, DEFAULT_PLATFORM_CONFIG), false);

  // Admin can create new orgs and edit/delete orgs they own, but NOT default org or third-party orgs
  assert.equal(canCreateOrEditOrganization(admA, null).allowed, true);
  assert.equal(canCreateOrEditOrganization(admA, ownedOrgs[1]).allowed, true);
  assert.equal(canCreateOrEditOrganization(admA, ownedOrgs[0]).allowed, false);
  assert.equal(canCreateOrEditOrganization(admA, ownedOrgs[2]).allowed, false);
  assert.equal(canCreateOrEditOrganization(opA, null).allowed, false);
  assert.equal(canDeleteOrganization(admA, ownedOrgs[1]).allowed, true);
  assert.equal(canDeleteOrganization(admA, ownedOrgs[0]).allowed, false);
  assert.equal(canDeleteOrganization(admA, ownedOrgs[2]).allowed, false);

  assert.deepEqual(
    getAuthorizedOrganizationIds(admA, ownedOrgs),
    ['org-alpha', 'org-gamma']
  );
  assert.equal(resolveEffectiveOrgId(admA, 'org-gamma', ownedOrgs), 'org-gamma');
  assert.equal(resolveEffectiveOrgId(admA, 'org-beta', ownedOrgs), 'org-alpha');
  assert.equal(canProvisionUserInOrganization(admA, 'org-gamma', 'monotoriador', ownedOrgs).allowed, true);
  assert.equal(canProvisionUserInOrganization(admA, 'org-beta', 'operador', ownedOrgs).allowed, false);
  assert.equal(canManageContractsAndPayments(admA, 'org-gamma', ownedOrgs).allowed, true);
  assert.equal(canManageContractsAndPayments(admA, 'org-beta', ownedOrgs).allowed, false);
  assert.equal(
    canModifyTargetUser(admA, makeUser({ id: 'u-gamma', organizationId: 'org-gamma' }), 'admin', ownedOrgs).allowed,
    true
  );

  // Bulk CSV parsing (comma + semicolon + UTF-8 BOM + quotes + superadmin rejection)
  const usersCsvWithBomAndSuperAdmin = [
    '\uFEFFnombre;email;rut;rol;turno',
    '"Juan Pérez, Jr.";jperez@gamma.cl;16.111.222-3;operador;Turno A',
    'Ana Silva;asilva@gamma.cl;17.222.333-4;monotoriador;Turno B',
    'Intento Escalado;hacker@gamma.cl;19.333.444-5;superadmin;Turno C',
    'Duplicado;jperez@gamma.cl;16.111.222-3;admin;Turno A',
  ].join('\n');
  const parsedUsers = parseBulkInput('users', usersCsvWithBomAndSuperAdmin, {
    organizationId: 'org-gamma',
  });
  assert.equal(parsedUsers.totalRows, 4);
  assert.equal(parsedUsers.validRows.length, 2);
  assert.equal(parsedUsers.invalidRows.length, 2);
  assert.equal(parsedUsers.validRows[0].data.name, 'Juan Pérez, Jr.');
  assert.equal(parsedUsers.validRows[1].data.role, 'monotoriador');
  assert.ok(parsedUsers.invalidRows[0].errors[0].includes('SuperAdmin'));

  // Bulk CSV templates parse cleanly 100%
  const usersTpl = parseBulkInput('users', getBulkCsvTemplate('users'), { organizationId: 'org-gamma' });
  assert.equal(usersTpl.invalidRows.length, 0);
  assert.equal(usersTpl.validRows.length, 3);

  // Sites grouping (2 sectors under 1 faena -> 1 MiningSite with 2 activeSectors)
  const sitesTpl = parseBulkInput('sites', getBulkCsvTemplate('sites'), {
    organizationId: 'org-gamma',
    defaultCompanyName: 'Minera Gamma SpA',
  });
  assert.equal(sitesTpl.invalidRows.length, 0);
  assert.equal(sitesTpl.validRows.length, 1);
  assert.equal(sitesTpl.validRows[0].data.site.activeSectors.length, 2);
  assert.equal(sitesTpl.validRows[0].data.site.organizationId, 'org-gamma');

  // Rentals validation (dates, cost > 0)
  const rentalsBad = parseBulkInput(
    'rentals',
    [
      'numeroContrato,codigoDispositivo,proveedor,fechaInicio,fechaTermino,costoMensualClp',
      'CT-1,DEV-1,MineSafe,2026-12-01,2026-11-01,250000',
      'CT-2,DEV-2,MineSafe,2026-01-01,2026-12-31,0',
      'CT-3,DEV-3,MineSafe,2026-01-01,2026-12-31,250000',
    ].join('\n'),
    { organizationId: 'org-gamma' }
  );
  assert.equal(rentalsBad.validRows.length, 1);
  assert.equal(rentalsBad.invalidRows.length, 2);

  // Full JSON bundle template
  const bundleParsed = parseBulkCompanyBundle(getBulkJsonBundleTemplate(), 'org-gamma');
  assert.equal(bundleParsed.formatError, undefined);
  assert.equal(bundleParsed.organization?.valid, true);
  assert.equal(bundleParsed.users.validRows.length, 2);
  assert.equal(bundleParsed.sites.validRows.length, 1);
  assert.equal(bundleParsed.rentals.validRows.length, 1);
  assert.equal(bundleParsed.assignments.validRows.length, 1);

  console.log('✅ 14. Admin company creation, ownerUid scoping & bulk CSV/JSON import passed');

  // ---------------------------------------------------------------------------
  // 15. Aislamiento estricto por nueva empresa y limitaciones de Operador/Monotoriador
  // ---------------------------------------------------------------------------
  const admB = makeUser({ id: 'adm-b', email: 'adm-b@minesafe.cl', role: 'admin', organizationId: 'org-beta' });
  const admG = makeUser({ id: 'adm-g', email: 'adm-g@gamma.cl', role: 'admin', organizationId: 'org-gamma' });
  const monG = makeUser({
    id: 'mon-g',
    email: 'mon-g@gamma.cl',
    role: 'monotoriador',
    roleLabel: 'Monotoriador Ambiental',
    organizationId: 'org-gamma',
  });
  const opG = makeUser({
    id: 'op-g',
    email: 'op-g@gamma.cl',
    role: 'operador',
    roleLabel: 'Operador',
    organizationId: 'org-gamma',
  });
  const opPrincipal = makeUser({
    id: 'op-p',
    email: 'op@principal.cl',
    role: 'operador',
    organizationId: DEFAULT_ORGANIZATION_ID,
  });

  const mixedUsers = [sa, admA, admB, admG, opA, opB, monA, monG, opG, opPrincipal];

  // Cross-company isolation: admB (org-beta) and Principal users never see org-gamma
  assert.deepEqual(getAuthorizedOrganizationIds(admB, ownedOrgs), ['org-beta']);
  assert.deepEqual(getAuthorizedOrganizationIds(monG, ownedOrgs), ['org-gamma']);
  assert.deepEqual(getAuthorizedOrganizationIds(opG, ownedOrgs), ['org-gamma']);
  assert.deepEqual(getAuthorizedOrganizationIds(opB, ownedOrgs), ['org-beta']);

  assert.equal(resolveEffectiveOrgId(admB, 'org-gamma', ownedOrgs), 'org-beta');
  assert.equal(resolveEffectiveOrgId(monG, 'org-beta', ownedOrgs), 'org-gamma');
  assert.equal(resolveEffectiveOrgId(opG, DEFAULT_ORGANIZATION_ID, ownedOrgs), 'org-gamma');
  assert.equal(resolveEffectiveOrgId(opPrincipal, 'org-gamma', ownedOrgs), DEFAULT_ORGANIZATION_ID);

  assert.deepEqual(
    filterScopedUsers(mixedUsers, admB, 'org-beta', ownedOrgs).map((u) => u.id),
    ['adm-b', 'op-b']
  );
  assert.deepEqual(
    filterScopedUsers(mixedUsers, monG, 'org-gamma', ownedOrgs).map((u) => u.id),
    ['adm-g', 'mon-g', 'op-g']
  );
  assert.deepEqual(
    filterScopedUsers(mixedUsers, opG, 'org-alpha', ownedOrgs).map((u) => u.id),
    ['adm-g', 'mon-g', 'op-g']
  );

  // Scoped entities isolation (sites, devices, rentals, assignments)
  const mixedEntities = [
    { id: 'ent-principal', organizationId: DEFAULT_ORGANIZATION_ID },
    { id: 'ent-alpha', organizationId: 'org-alpha' },
    { id: 'ent-beta', organizationId: 'org-beta' },
    { id: 'ent-gamma', organizationId: 'org-gamma' },
  ];
  assert.deepEqual(
    filterScopedEntities(mixedEntities, admB, 'org-gamma', ownedOrgs).map((e) => e.id),
    ['ent-beta']
  );
  assert.deepEqual(
    filterScopedEntities(mixedEntities, monG, 'org-alpha', ownedOrgs).map((e) => e.id),
    ['ent-gamma']
  );
  assert.deepEqual(
    filterScopedEntities(mixedEntities, opPrincipal, 'org-gamma', ownedOrgs).map((e) => e.id),
    ['ent-principal']
  );

  // New organization with 0 sites/devices falls back to neutral empty states (no Principal/El Teniente mock leak)
  const neutralGammaSite = resolveScopedCurrentSite([], undefined, 'org-gamma', 'Minera Gamma SpA');
  assert.equal(neutralGammaSite.organizationId, 'org-gamma');
  assert.equal(neutralGammaSite.name, 'Sin faena registrada');
  assert.equal(neutralGammaSite.company, 'Minera Gamma SpA');
  assert.equal(neutralGammaSite.activeSectors.length, 0);
  assert.ok(!neutralGammaSite.name.includes('Teniente') && !neutralGammaSite.name.includes('Chuquicamata'));

  const emptyTelemetry = createEmptyTelemetryVariables();
  assert.equal(emptyTelemetry.length, 6);
  assert.ok(emptyTelemetry.every((v) => v.value === 0 && v.status === 'desconectado'));

  // Strict role lock for operador & monotoriador even with tampered platformConfig overrides
  const tamperedOpMonConfig = {
    ...DEFAULT_PLATFORM_CONFIG,
    visibility: {
      ...DEFAULT_PLATFORM_CONFIG.visibility,
      userOverrides: {
        ...DEFAULT_PLATFORM_CONFIG.visibility.userOverrides,
        [monG.id]: {
          empresas: 'allow',
          usuarios: 'allow',
          superadmin_panel: 'allow',
          superadmin_docs: 'allow',
          gateway_3d: 'allow',
        },
        [opG.id]: {
          empresas: 'allow',
          usuarios: 'allow',
          superadmin_panel: 'allow',
          superadmin_docs: 'allow',
        },
      },
      userOverridesByEmail: {
        'mon-g@gamma_cl': { empresas: 'allow', usuarios: 'allow' },
        'op-g@gamma_cl': { empresas: 'allow', usuarios: 'allow' },
      },
    },
  } as unknown as PlatformConfig;

  for (const lockedTab of ['empresas', 'usuarios', 'superadmin_panel', 'superadmin_docs'] as const) {
    assert.equal(
      isTabVisibleForUser(lockedTab, monG, tamperedOpMonConfig),
      false,
      `Monotoriador blocked from ${lockedTab} even with override`
    );
    assert.equal(
      isTabVisibleForUser(lockedTab, opG, tamperedOpMonConfig),
      false,
      `Operador blocked from ${lockedTab} even with override`
    );
  }
  assert.equal(
    isTabVisibleForUser('gateway_3d', monG, tamperedOpMonConfig),
    true,
    'Non-locked configurable tabs like gateway_3d still respect userOverrides'
  );

  for (const restrictedUser of [monG, opG]) {
    assert.equal(canCreateOrEditOrganization(restrictedUser, null).allowed, false);
    assert.equal(canDeleteOrganization(restrictedUser, ownedOrgs[1]).allowed, false);
    assert.equal(canManageContractsAndPayments(restrictedUser, 'org-gamma', ownedOrgs).allowed, false);
    assert.equal(canProvisionUserInOrganization(restrictedUser, 'org-gamma', 'operador', ownedOrgs).allowed, false);
    assert.equal(canModifyTargetUser(restrictedUser, admG, 'operador', ownedOrgs).allowed, false);
  }

  // Static audit of cross-tenant isolation & role guards in UI/services
  const firebaseSvcSrc = readRepoFile('src/services/firebase.ts');
  const appSrc = readRepoFile('src/App.tsx');
  const rootAppSrc = readRepoFile('src/RootApp.tsx');
  const sectorsSrc = readRepoFile('src/components/MiningSectorsView.tsx');
  const monitoringSrc = readRepoFile('src/components/MonitoringView.tsx');
  const emergencySrc = readRepoFile('src/components/EmergencyModal.tsx');
  const gatewaySecSrc = readRepoFile('src/components/ESP32GatewaySection.tsx');
  const alertCfgSrc = readRepoFile('src/components/AlertConfigurationView.tsx');

  assert.ok(rootAppSrc.includes('key={currentUser.id}'), 'RootApp keys MineSafePanel by currentUser.id to reset state on switch');
  assert.ok(
    firebaseSvcSrc.includes("if (tab === 'empresas' || tab === 'usuarios')"),
    'firebase.ts hard-locks empresas and usuarios to superadmin/admin'
  );
  assert.ok(
    firebaseSvcSrc.includes('buildOrgScopedQuery(\'dispositivos\', scope)') || firebaseSvcSrc.includes("buildOrgScopedQuery('dispositivos', scope)"),
    'firebase.ts uses org-scoped device query without unscoped fallback'
  );
  assert.ok(
    appSrc.includes('createEmptyTelemetryVariables()') && appSrc.includes('resolveScopedCurrentSite('),
    'App.tsx uses neutral scoped fallback helpers'
  );
  assert.ok(sectorsSrc.includes('canManageSites'), 'MiningSectorsView enforces read-only view for operador/monotoriador');
  assert.ok(monitoringSrc.includes('canSimulateEvents'), 'MonitoringView hides simulator for operador/monotoriador');
  assert.ok(emergencySrc.includes('isAdminOrSuper'), 'EmergencyModal hides drill mode for operador/monotoriador');
  assert.ok(gatewaySecSrc.includes('canOperateHardware'), 'ESP32GatewaySection gates hardware actuators');
  assert.ok(alertCfgSrc.includes('subscribeToAllThresholdConfigs'), 'AlertConfigurationView subscribes with org/device scope');

  console.log('✅ 15. Cross-company isolation & operador/monotoriador limitations passed');

  // ---------------------------------------------------------------------------
  // 16. Bloqueo de usuarios despedidos y nueva cuenta con correo anterior en otra empresa
  // ---------------------------------------------------------------------------
  const blockedAlphaWorker = makeUser({
    id: 'uid-old-alpha',
    email: 'juan.perez@correo.cl',
    role: 'operador',
    status: 'inactivo',
    organizationId: 'org-alpha',
    blockedReason: 'Desvinculación de la empresa',
    blockedAt: 1700500000000,
    blockedBy: 'Admin Alpha',
  });
  const activeAlphaWorker = makeUser({
    id: 'uid-active-alpha',
    email: 'maria.lopez@correo.cl',
    role: 'operador',
    status: 'activo',
    organizationId: 'org-alpha',
  });
  const pendingBetaWorker = makeUser({
    id: 'pend_org_beta_1700600000_ab12',
    email: 'juan.perez@correo.cl',
    role: 'monotoriador',
    status: 'activo',
    pendingActivation: true,
    organizationId: 'org-beta',
  });

  // Same company conflict vs cross-company reuse
  assert.equal(
    findUserEmailConflictInOrg([activeAlphaWorker, blockedAlphaWorker], 'maria.lopez@correo.cl', 'org-alpha').conflict,
    'active_in_same_org',
    'Rejects active duplicate inside same company'
  );
  assert.equal(
    findUserEmailConflictInOrg([activeAlphaWorker, blockedAlphaWorker], 'juan.perez@correo.cl', 'org-alpha').conflict,
    'blocked_in_same_org',
    'Flags blocked email inside same company so admin uses Desbloquear instead of duplicating'
  );
  assert.equal(
    findUserEmailConflictInOrg([activeAlphaWorker, blockedAlphaWorker], 'juan.perez@correo.cl', 'org-beta').conflict,
    'none',
    'Allows another company (org-beta) to hire/register worker using their previous email'
  );

  // Login resolution across UID states
  const activeRes = selectBestLoginProfileForEmail(
    [{ key: 'uid-active-alpha', profile: activeAlphaWorker }],
    'uid-active-alpha'
  );
  assert.equal(activeRes.resolution, 'active_direct');

  const blockedOnlyRes = selectBestLoginProfileForEmail(
    [{ key: 'uid-old-alpha', profile: blockedAlphaWorker }],
    'uid-old-alpha'
  );
  assert.equal(blockedOnlyRes.resolution, 'blocked');

  const requiresNewAccountRes = selectBestLoginProfileForEmail(
    [
      { key: 'uid-old-alpha', profile: blockedAlphaWorker },
      { key: pendingBetaWorker.id, profile: pendingBetaWorker },
    ],
    'uid-old-alpha'
  );
  assert.equal(
    requiresNewAccountRes.resolution,
    'requires_new_account',
    'Blocked user invited by Company B is guided to create a brand-new Firebase Auth account using previous email'
  );
  if (requiresNewAccountRes.resolution === 'requires_new_account') {
    assert.equal(requiresNewAccountRes.pendingEntry.profile.organizationId, 'org-beta');
    assert.equal(requiresNewAccountRes.blockedEntry.profile.organizationId, 'org-alpha');
  }

  const autoClaimRes = selectBestLoginProfileForEmail(
    [
      { key: 'uid-old-alpha', profile: blockedAlphaWorker },
      { key: pendingBetaWorker.id, profile: pendingBetaWorker },
    ],
    'uid-brand-new-beta'
  );
  assert.equal(
    autoClaimRes.resolution,
    'auto_claim_pending',
    'New Firebase Auth UID auto-claims Company B pending profile while preserving Company A blocked node'
  );

  assert.equal(
    selectBestLoginProfileForEmail([], 'uid-any').resolution,
    'not_found'
  );

  // Static audit of RTDB rules, sibling sync isolation, UI blocking & account recreation
  const usersViewSrc = readRepoFile('src/components/UsersManagementView.tsx');
  const loginViewSrc = readRepoFile('src/components/LoginView.tsx');
  const loginModalSrc = readRepoFile('src/components/LoginModal.tsx');
  const bulkViewSrc = readRepoFile('src/components/CompanyBulkManagementView.tsx');

  assert.ok(
    rtdbRules.rules.usuarios['$userId']['.write'].includes('claimedFromKey') &&
      rtdbRules.rules.usuarios['$userId']['.write'].includes("child('pendingActivation').val() === true"),
    'RTDB usuarios/$userId allows secure single-use pendingActivation claim and cleanup'
  );
  assert.ok(
    firebaseSvcSrc.includes('createNewCompanyAccountWithPreviousEmail') &&
      firebaseSvcSrc.includes('deleteUser(oldFbUser)') &&
      firebaseSvcSrc.includes("query(ref(rtdb, 'usuarios'), orderByChild('organizationId'), equalTo(targetOrg))"),
    'firebase.ts supports new-account recreation without touching previous blocked company node and scopes sibling sync by org'
  );
  assert.ok(
    usersViewSrc.includes('Bloquear') &&
      usersViewSrc.includes('Desbloquear') &&
      usersViewSrc.includes('blockedReason'),
    'UsersManagementView exposes block/unblock actions with reason tracking'
  );
  assert.ok(
    loginViewSrc.includes('createNewCompanyAccountWithPreviousEmail') &&
      loginViewSrc.includes('auth/account-recreation-required') &&
      loginModalSrc.includes('createNewCompanyAccountWithPreviousEmail') &&
      loginModalSrc.includes('auth/account-recreation-required'),
    'LoginView and LoginModal expose previous-email new-account flow'
  );
  assert.ok(
    bulkViewSrc.includes('pendingActivation'),
    'CompanyBulkManagementView notifies admins when bulk-imported users require creating a new account with their previous email'
  );

  console.log('✅ 16. Fired-user blocking & cross-company new account with previous email passed');

  // ---------------------------------------------------------------------------
  // 17. Limitación estricta Operador: solo ver datos y descripción de alertas
  // ---------------------------------------------------------------------------
  const allNavigationTabs = [
    'dashboard',
    'monitoreo',
    'alertas',
    'configuracion_alertas',
    'equipos',
    'reportes',
    'faenas',
    'usuarios',
    'empresas',
    'visor_3d',
    'gateway_3d',
    'superadmin_panel',
    'superadmin_docs',
  ] as const;

  const tamperedAllAllowOpConfig = {
    ...DEFAULT_PLATFORM_CONFIG,
    visibility: {
      ...DEFAULT_PLATFORM_CONFIG.visibility,
      rolePermissions: {
        ...DEFAULT_PLATFORM_CONFIG.visibility.rolePermissions,
        operador: {
          dashboard: true,
          monitoreo: true,
          alertas: true,
          configuracion_alertas: true,
          equipos: true,
          reportes: true,
          faenas: true,
          usuarios: true,
          empresas: true,
          visor_3d: true,
          gateway_3d: true,
        },
      },
      userOverrides: {
        [opG.id]: {
          dashboard: 'allow',
          monitoreo: 'allow',
          reportes: 'allow',
          faenas: 'allow',
          equipos: 'allow',
          gateway_3d: 'allow',
          visor_3d: 'allow',
          alertas: 'block',
        },
      },
    },
  } as unknown as PlatformConfig;

  assert.equal(DEFAULT_PLATFORM_CONFIG.visibility.rolePermissions.operador.alertas, true);
  assert.equal(DEFAULT_PLATFORM_CONFIG.visibility.rolePermissions.operador.dashboard, false);
  assert.equal(DEFAULT_PLATFORM_CONFIG.visibility.rolePermissions.operador.monitoreo, false);
  assert.equal(DEFAULT_PLATFORM_CONFIG.visibility.rolePermissions.operador.reportes, false);
  assert.equal(DEFAULT_PLATFORM_CONFIG.visibility.rolePermissions.operador.faenas, false);

  for (const tab of allNavigationTabs) {
    assert.equal(
      isTabVisibleForUser(tab, opG, DEFAULT_PLATFORM_CONFIG),
      tab === 'alertas',
      `Default config allows operador ONLY alertas (checked ${tab})`
    );
    assert.equal(
      isTabVisibleForUser(tab, opG, tamperedAllAllowOpConfig),
      tab === 'alertas',
      `Even tampered config allows operador ONLY alertas (checked ${tab})`
    );
  }

  for (const sub of ['asignaciones', 'arriendos', 'pagos', 'inventario'] as const) {
    assert.equal(
      isEquiposSubTabVisibleForUser(sub, opG, tamperedAllAllowOpConfig),
      false,
      `Operador cannot access equipos sub-tab ${sub}`
    );
  }

  const alertsViewSrc = readRepoFile('src/components/AlertsView.tsx');
  const navbarSrc = readRepoFile('src/components/Navbar.tsx');
  assert.ok(
    alertsViewSrc.includes('isOperadorReadOnly') &&
      alertsViewSrc.includes('Modo Solo Lectura — Operador') &&
      alertsViewSrc.includes('{!isOperadorReadOnly && (') &&
      alertsViewSrc.includes('effectiveSubTab') &&
      alertsViewSrc.includes('alertToResolve && !isOperadorReadOnly'),
    'AlertsView enforces read-only data and descriptions for operador'
  );
  assert.ok(
    appSrc.includes("authenticatedUser.role === 'operador' ? 'alertas' : 'dashboard'") &&
      appSrc.includes('isReadOnly={currentUser.role === \'operador\'}') &&
      appSrc.includes("showEmergencyModal && currentUser.role !== 'operador'"),
    'App.tsx lands operador on alertas, sets isReadOnly, and disables EmergencyModal/alert mutations'
  );
  assert.ok(
    navbarSrc.includes('!isOperador') && navbarSrc.includes("isOperador ? 'alertas' : 'dashboard'"),
    'Navbar hides emergency trigger and routes logo to alertas for operador'
  );
  assert.ok(
    rtdbRules.rules.alertas['$alertId']['.write'].includes("tipoUsuario').val() !== 'operador'") &&
      rtdbRules.rules.bitacora_contingencias['$alertId']['.write'].includes("tipoUsuario').val() !== 'operador'") &&
      rtdbRules.rules.adjuntos['$attachmentId']['.write'].includes("tipoUsuario').val() !== 'operador'") &&
      rtdbRules.rules.eventos_umbrales['$eventId']['.write'].includes("tipoUsuario').val() !== 'operador'") &&
      rtdbRules.rules.emergencia['$orgId']['.write'].includes("tipoUsuario').val() !== 'operador'"),
    'RTDB security rules block operador writes on alerts, logs, attachments, threshold events, and emergency node'
  );

  console.log('✅ 17. Operador alert-only read-only limitation passed');

  // ---------------------------------------------------------------------------
  // 18. Rol Admin Corporativo MineSafe (admin_minesafe) y sus limitaciones
  // ---------------------------------------------------------------------------
  const admMs = makeUser({
    id: 'adm-ms-1',
    email: 'corporativo@minesafe.cl',
    role: 'admin_minesafe',
    roleLabel: 'Admin Corporativo MineSafe',
    organizationId: DEFAULT_ORGANIZATION_ID,
  });
  const admMs2 = makeUser({
    id: 'adm-ms-2',
    email: 'corporativo2@minesafe.cl',
    role: 'admin_minesafe',
    roleLabel: 'Admin Corporativo MineSafe',
    organizationId: DEFAULT_ORGANIZATION_ID,
  });

  const expectedAllowedForAdminMinesafe = new Set<string>([
    'dashboard',
    'monitoreo',
    'alertas',
    'configuracion_alertas',
    'equipos',
    'reportes',
    'faenas',
    'usuarios',
    'empresas',
  ]);
  const blockedForAdminMinesafe = [
    'visor_3d',
    'gateway_3d',
    'superadmin_panel',
    'superadmin_docs',
  ] as const;

  const tamperedAdminMinesafeConfig = {
    ...DEFAULT_PLATFORM_CONFIG,
    visibility: {
      ...DEFAULT_PLATFORM_CONFIG.visibility,
      rolePermissions: {
        ...DEFAULT_PLATFORM_CONFIG.visibility.rolePermissions,
        admin_minesafe: {
          ...DEFAULT_PLATFORM_CONFIG.visibility.rolePermissions.admin_minesafe!,
          visor_3d: true,
          gateway_3d: true,
        },
      },
      userOverrides: {
        [admMs.id]: {
          visor_3d: 'allow',
          gateway_3d: 'allow',
          superadmin_panel: 'allow',
          superadmin_docs: 'allow',
        },
      },
      userOverridesByEmail: {
        'corporativo@minesafe_cl': {
          visor_3d: 'allow',
          gateway_3d: 'allow',
          superadmin_panel: 'allow',
          superadmin_docs: 'allow',
        },
      },
    },
  } as unknown as PlatformConfig;

  for (const tab of allNavigationTabs) {
    const shouldSee = expectedAllowedForAdminMinesafe.has(tab);
    assert.equal(
      isTabVisibleForUser(tab, admMs, DEFAULT_PLATFORM_CONFIG),
      shouldSee,
      `Default config visibility for admin_minesafe on ${tab}`
    );
    assert.equal(
      isTabVisibleForUser(tab, admMs, tamperedAdminMinesafeConfig),
      shouldSee,
      `Tampered config still blocks 4 restricted windows for admin_minesafe (${tab})`
    );
  }
  for (const blockedTab of blockedForAdminMinesafe) {
    assert.equal(
      isTabVisibleForUser(blockedTab, admMs, tamperedAdminMinesafeConfig),
      false,
      `admin_minesafe unconditionally blocked from ${blockedTab}`
    );
  }
  for (const sub of ['asignaciones', 'arriendos', 'pagos', 'inventario'] as const) {
    assert.equal(
      isEquiposSubTabVisibleForUser(sub, admMs, DEFAULT_PLATFORM_CONFIG),
      true,
      `admin_minesafe can access equipos sub-tab ${sub}`
    );
  }

  // Global cross-company visibility & operational scoping
  assert.equal(resolveEffectiveOrgId(admMs, 'all', ownedOrgs), 'all');
  assert.equal(resolveEffectiveOrgId(admMs, 'org-gamma', ownedOrgs), 'org-gamma');
  assert.deepEqual(
    getAuthorizedOrganizationIds(admMs, ownedOrgs),
    [DEFAULT_ORGANIZATION_ID, 'org-gamma', 'org-beta']
  );
  assert.deepEqual(
    filterScopedEntities(mixedEntities, admMs, 'all', ownedOrgs).map((e) => e.id),
    ['ent-principal', 'ent-alpha', 'ent-beta', 'ent-gamma']
  );
  const admMsVisibleUsers = filterScopedUsers([sa, admMs, admMs2, ...mixedUsers.slice(1)], admMs, 'all', ownedOrgs);
  assert.ok(!admMsVisibleUsers.some((u) => u.role === 'superadmin'), 'admin_minesafe does not view/manage superadmin');
  assert.ok(admMsVisibleUsers.some((u) => u.id === 'op-b') && admMsVisibleUsers.some((u) => u.id === 'adm-g'));

  // Smart security limitations: companies & hierarchy
  assert.equal(canCreateOrEditOrganization(admMs, null).allowed, true, 'Can create new client orgs');
  assert.equal(canCreateOrEditOrganization(admMs, ownedOrgs[1]).allowed, true, 'Can edit client orgs');
  assert.equal(canCreateOrEditOrganization(admMs, ownedOrgs[0]).allowed, false, 'Cannot edit Principal org');
  assert.equal(canDeleteOrganization(admMs, ownedOrgs[1]).allowed, false, 'Cannot permanently delete orgs');
  assert.equal(canManageContractsAndPayments(admMs, 'org-gamma', ownedOrgs).allowed, true);

  assert.equal(canProvisionUserInOrganization(admMs, 'org-gamma', 'admin', ownedOrgs).allowed, true);
  assert.equal(canProvisionUserInOrganization(admMs, 'org-beta', 'monotoriador', ownedOrgs).allowed, true);
  assert.equal(canProvisionUserInOrganization(admMs, 'org-beta', 'admin_minesafe', ownedOrgs).allowed, false);
  assert.equal(canProvisionUserInOrganization(admMs, 'org-beta', 'superadmin', ownedOrgs).allowed, false);
  assert.equal(canProvisionUserInOrganization(sa, DEFAULT_ORGANIZATION_ID, 'admin_minesafe', ownedOrgs).allowed, true);

  assert.equal(canModifyTargetUser(admMs, admB, 'operador', ownedOrgs).allowed, true);
  assert.equal(canModifyTargetUser(admMs, admMs2, 'operador', ownedOrgs).allowed, false, 'Cannot modify peer admin_minesafe');
  assert.equal(canModifyTargetUser(admMs, sa, 'operador', ownedOrgs).allowed, false, 'Cannot modify superadmin');
  assert.equal(canModifyTargetUser(admMs, admB, 'admin_minesafe', ownedOrgs).allowed, false, 'Cannot promote to admin_minesafe');
  assert.equal(canModifyTargetUser(sa, admMs, 'admin', ownedOrgs).allowed, true, 'SuperAdmin can manage admin_minesafe');

  // Bulk import blocks escalation to admin_minesafe
  const bulkWithAdminMinesafe = parseBulkInput(
    'users',
    [
      'nombre,email,rut,rol,turno',
      'Operador Valido,opvalido@gamma.cl,16.111.222-3,operador,Turno A',
      'Escalada Corporativa,corp@gamma.cl,17.222.333-4,admin_minesafe,Turno A',
    ].join('\n'),
    { organizationId: 'org-gamma' }
  );
  assert.equal(bulkWithAdminMinesafe.validRows.length, 1);
  assert.equal(bulkWithAdminMinesafe.invalidRows.length, 1);
  assert.ok(bulkWithAdminMinesafe.invalidRows[0].errors[0].includes('Admin Corporativo MineSafe'));

  // Rules, Blueprint & App/Service guards static checks
  const blueprintJson = JSON.parse(readRepoFile('firebase-blueprint.json'));
  const controlViewSrc = readRepoFile('src/components/SuperAdminControlView.tsx');
  assert.ok(blueprintJson.entities.user.properties.role.enum.includes('admin_minesafe'));
  assert.ok(firestoreRules.includes("'admin_minesafe'"));
  assert.ok(!rtdbRules.rules.configuracion_plataforma['.write'].includes('admin_minesafe'));
  assert.ok(!rtdbRules.rules.precarga['.read'].includes('admin_minesafe'));
  assert.ok(
    rtdbRules.rules.organizaciones['$orgId']['.write'].includes("tipoUsuario').val() === 'admin_minesafe' && $orgId !== 'org-minesafe-principal' && newData.exists()"),
    'RTDB allows admin_minesafe org create/update on client orgs without deletion'
  );
  assert.ok(
    rtdbRules.rules.configuracion_alertas['$targetId']['.write'].includes("tipoUsuario').val() === 'admin_minesafe' && $targetId !== 'global'"),
    'RTDB blocks admin_minesafe from global alert threshold config'
  );
  assert.ok(
    rtdbRules.rules.usuarios['$userId']['.write'].includes("tipoUsuario').val() === 'admin_minesafe'") &&
      rtdbRules.rules.usuarios['$userId']['.validate'].includes("newData.child('tipoUsuario').val() !== 'admin_minesafe'"),
    'RTDB enforces admin_minesafe cannot create/modify superadmin or peer admin_minesafe'
  );
  assert.ok(
    firebaseSvcSrc.includes('savePlatformConfig') &&
      appSrc.includes("currentUser.role !== 'superadmin'") &&
      controlViewSrc.includes('Bloqueada (Política)'),
    'Service, App, and SuperAdminControlView enforce admin_minesafe smart boundaries'
  );

  console.log('✅ 18. Admin Corporativo MineSafe (admin_minesafe) & security limitations passed');

  // ---------------------------------------------------------------------------
  // 19. Creación de cuadrillas y asignación de trabajadores a la cuadrilla
  // ---------------------------------------------------------------------------
  // RBAC: who can create/edit/delete crews & assign workers
  const inactiveAdm = makeUser({
    id: 'adm-inactive-crew',
    role: 'admin',
    status: 'inactivo',
    organizationId: 'org-alpha',
  });
  assert.equal(canManageCrews(opG, 'org-gamma', ownedOrgs).allowed, false, 'Operador cannot manage crews');
  assert.equal(canManageCrews(monG, 'org-gamma', ownedOrgs).allowed, false, 'Monotoriador cannot manage crews');
  assert.equal(canManageCrews(inactiveAdm, 'org-alpha', ownedOrgs).allowed, false, 'Inactive user cannot manage crews');
  assert.equal(canManageCrews(admG, 'org-gamma', ownedOrgs).allowed, true, 'Admin can manage crews in primary org');
  assert.equal(canManageCrews(admA, 'org-gamma', ownedOrgs).allowed, true, 'Admin can manage crews in owned org');
  assert.equal(canManageCrews(admG, 'org-beta', ownedOrgs).allowed, false, 'Admin cannot manage crews in non-owned third-party org');
  assert.equal(canManageCrews(admMs, 'org-alpha', ownedOrgs).allowed, true, 'admin_minesafe can manage crews across orgs');
  assert.equal(canManageCrews(sa, 'org-beta', ownedOrgs).allowed, true, 'superadmin can manage crews');

  // Worker assignment & leader deduplication logic
  const workerA = makeUser({
    id: 'usr-worker-a',
    name: 'Carlos Muñoz',
    email: 'cmunoz@gamma.cl',
    rut: '16.543.210-1',
    role: 'operador',
    organizationId: 'org-gamma',
    assignedDeviceCode: 'MS-GAS-201',
  });
  const workerB = makeUser({
    id: 'usr-worker-b',
    name: 'Elena Soto',
    email: 'esoto@gamma.cl',
    rut: '17.654.321-K',
    role: 'monotoriador',
    organizationId: 'org-gamma',
  });

  const baseCrew: MiningCrew = {
    id: 'crew-test-01',
    organizationId: 'org-gamma',
    name: 'Cuadrilla Gamma Perforación',
    code: 'CUA-01',
    shift: 'Turno Mañana (07:00 - 15:30)',
    status: 'activa',
    siteId: 'site-gamma-1',
    siteName: 'Mina Gamma',
    sectorId: 'sec-gamma-1',
    sectorName: 'Nivel -320',
    members: [],
    createdAt: 1000,
    updatedAt: 1000,
  };

  const memberA = buildCrewMemberFromUser(workerA, { isLeader: true });
  const memberADup = buildCrewMemberFromUser(workerA, { isLeader: false });
  const memberB = buildCrewMemberFromUser(workerB, { isLeader: true });

  const crewWithWorkers = assignWorkersToCrew(baseCrew, [memberA, memberADup, memberB], 2000);
  assert.equal(crewWithWorkers.members.length, 2, 'Deduplicates duplicate worker entry');
  assert.equal(crewWithWorkers.leaderUserId, workerB.id, 'Last designated leader becomes sole leader');
  assert.equal(crewWithWorkers.leaderName, 'Elena Soto');
  assert.equal(crewWithWorkers.members.filter((m) => m.isLeader).length, 1, 'At most one leader per crew');
  assert.equal(crewWithWorkers.updatedAt, 2000);

  const crewAfterRemoval = assignWorkersToCrew(
    crewWithWorkers,
    crewWithWorkers.members.filter((m) => m.userId !== workerB.id),
    3000
  );
  assert.equal(crewAfterRemoval.members.length, 1);
  assert.equal(crewAfterRemoval.leaderUserId, undefined, 'Clears leaderUserId when former leader is removed');
  assert.equal(crewAfterRemoval.leaderName, undefined, 'Clears leaderName when former leader is removed');
  assert.equal(crewAfterRemoval.members[0].userId, workerA.id);

  // Rules, Blueprint & UI/App wiring static checks for Cuadrillas
  const crewMgmtSrc = readRepoFile('src/components/CrewManagementSection.tsx');
  const devicesViewSrc = readRepoFile('src/components/DevicesAndRentalsView.tsx');
  const miningSectorsSrc = readRepoFile('src/components/MiningSectorsView.tsx');

  assert.ok(
    Boolean(rtdbRules.rules.cuadrillas) &&
      Array.isArray(rtdbRules.rules.cuadrillas['.indexOn']) &&
      rtdbRules.rules.cuadrillas['.indexOn'].includes('organizationId') &&
      rtdbRules.rules.cuadrillas['$crewId']['.write'].includes("tipoUsuario').val() === 'admin'") &&
      rtdbRules.rules.cuadrillas['$crewId']['.write'].includes("tipoUsuario').val() === 'admin_minesafe'") &&
      !rtdbRules.rules.cuadrillas['$crewId']['.write'].includes("'operador'") &&
      !rtdbRules.rules.cuadrillas['$crewId']['.write'].includes("'monotoriador'") &&
      rtdbRules.rules.cuadrillas['$crewId']['.validate'].includes('organizationId'),
    'RTDB /cuadrillas enforces organizationId indexing, admin/corporate allowlist writes, and validation'
  );
  assert.ok(
    Boolean(blueprintJson.entities.crew) &&
      Boolean(blueprintJson.firestore['/crews/{crewId}']) &&
      firestoreRules.includes('function isValidCrew(data)') &&
      firestoreRules.includes('match /crews/{crewId}'),
    'firebase-blueprint.json and firestore.rules define validated /crews collection'
  );
  assert.ok(
    firebaseSvcSrc.includes('subscribeToRTDBCrews') &&
      firebaseSvcSrc.includes('saveCrewToRTDB') &&
      firebaseSvcSrc.includes('deleteCrewFromRTDB') &&
      crewMgmtSrc.includes('Nueva Cuadrilla') &&
      crewMgmtSrc.includes('Asignar Trabajadores') &&
      crewMgmtSrc.includes('assignWorkersToCrew') &&
      devicesViewSrc.includes('<CrewManagementSection') &&
      miningSectorsSrc.includes('<CrewManagementSection') &&
      appSrc.includes('handleSaveCrew') &&
      appSrc.includes('handleDeleteCrew') &&
      appSrc.includes('scopedCrews'),
    'Firebase service, CrewManagementSection, DevicesAndRentalsView, MiningSectorsView, and App.tsx wire crew creation and worker assignment'
  );

  assert.ok(
    usersViewSrc.includes('pendingRoleChange') &&
      usersViewSrc.includes('handleConfirmRoleChange') &&
      usersViewSrc.includes('Confirmar cambio de rol') &&
      usersViewSrc.includes('¿Estás seguro de que deseas cambiar el rol de') &&
      controlViewSrc.includes('pendingRoleChange') &&
      controlViewSrc.includes('Confirmar cambio de rol'),
    'UsersManagementView and SuperAdminControlView require confirmation modal before changing user roles'
  );

  console.log('✅ 19. Crew creation & worker assignment (cuadrillas) + role-change confirmation passed');

  console.log('\n🎉 ALL P031 COMPREHENSIVE TESTS PASSED!');
}

runTests().catch((err) => {
  console.error('❌ P031 suite failed:', err);
  process.exit(1);
});
