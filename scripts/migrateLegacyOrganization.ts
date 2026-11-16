/**
 * Script idempotente de migración multiempresa (P031-01)
 *
 * Etiqueta registros legados sin `organizationId` en las colecciones principales de RTDB:
 * - dispositivos, usuarios, contratos, pagos, asignaciones, alertas, bitacora_contingencias,
 *   adjuntos, simulacros_bitacora, eventos_umbrales, faenas
 * - Migra nodos planos `/simulacro` y `/emergencia` hacia `/simulacro/{defaultOrgId}` y `/emergencia/{defaultOrgId}` si corresponden.
 *
 * Uso:
 *   npx tsx scripts/migrateLegacyOrganization.ts --dry-run
 *   FIREBASE_RTDB_URL=https://minefase-fc5f5-default-rtdb.firebaseio.com FIREBASE_DB_SECRET=<token> npx tsx scripts/migrateLegacyOrganization.ts --apply
 */

export const LEGACY_ORG_SCOPED_COLLECTIONS = [
  'dispositivos',
  'usuarios',
  'contratos',
  'pagos',
  'asignaciones',
  'alertas',
  'bitacora_contingencias',
  'adjuntos',
  'simulacros_bitacora',
  'bitacora_configuracion_umbrales',
  'eventos_umbrales',
  'faenas',
] as const;

export interface MigrationPlanResult {
  updates: Record<string, unknown>;
  scannedRecords: number;
  pendingUpdates: number;
  byCollection: Record<string, number>;
}

/**
 * Construye de forma determinista e idempotente el mapa de actualizaciones multi-path
 * únicamente para los registros que aún carecen de `organizationId` válido.
 */
export function planLegacyOrganizationBackfill(
  rtdbRootSnapshot: Record<string, any> | null | undefined,
  defaultOrgId: string = 'org-minesafe-principal'
): MigrationPlanResult {
  const cleanDefaultOrg = (defaultOrgId || 'org-minesafe-principal').trim();
  const root = rtdbRootSnapshot && typeof rtdbRootSnapshot === 'object' ? rtdbRootSnapshot : {};
  const updates: Record<string, unknown> = {};
  const byCollection: Record<string, number> = {};
  let scannedRecords = 0;

  for (const collection of LEGACY_ORG_SCOPED_COLLECTIONS) {
    const branch = root[collection];
    if (!branch || typeof branch !== 'object') continue;
    let collectionCount = 0;
    for (const [recordId, record] of Object.entries<any>(branch)) {
      scannedRecords += 1;
      if (!record || typeof record !== 'object') continue;
      const existingOrg = typeof record.organizationId === 'string' ? record.organizationId.trim() : '';
      if (!existingOrg) {
        updates[`${collection}/${recordId}/organizationId`] = cleanDefaultOrg;
        collectionCount += 1;
      }
    }
    if (collectionCount > 0) {
      byCollection[collection] = collectionCount;
    }
  }

  // Migrar configuracion_alertas (excepto 'global') heredando la organización del dispositivo
  const thresholdsBranch = root.configuracion_alertas;
  const devicesBranch = root.dispositivos || {};
  if (thresholdsBranch && typeof thresholdsBranch === 'object') {
    let threshCount = 0;
    for (const [targetId, cfg] of Object.entries<any>(thresholdsBranch)) {
      if (targetId === 'global' || !cfg || typeof cfg !== 'object') continue;
      scannedRecords += 1;
      if (!cfg.organizationId) {
        const deviceOrg = devicesBranch[targetId]?.organizationId || cleanDefaultOrg;
        updates[`configuracion_alertas/${targetId}/organizationId`] = deviceOrg;
        threshCount += 1;
      }
    }
    if (threshCount > 0) {
      byCollection.configuracion_alertas = threshCount;
    }
  }

  // Migrar flags planos /simulacro y /emergencia hacia rutas con alcance de organización si no existen
  if (root.simulacro && typeof root.simulacro === 'object' && 'activo' in root.simulacro) {
    const orgSimNode = root.simulacro[cleanDefaultOrg];
    if (!orgSimNode) {
      updates[`simulacro/${cleanDefaultOrg}`] = {
        activo: Boolean(root.simulacro.activo),
        ...(root.simulacro.tipo ? { tipo: root.simulacro.tipo } : {}),
        ...(root.simulacro.nombre ? { nombre: root.simulacro.nombre } : {}),
        ...(root.simulacro.timestamp ? { timestamp: root.simulacro.timestamp } : {}),
        organizationId: cleanDefaultOrg,
      };
      byCollection.simulacro = 1;
    }
  }

  if (root.emergencia && typeof root.emergencia === 'object' && 'activa' in root.emergencia) {
    const orgEmNode = root.emergencia[cleanDefaultOrg];
    if (!orgEmNode) {
      updates[`emergencia/${cleanDefaultOrg}`] = {
        activa: Boolean(root.emergencia.activa),
        ...(root.emergencia.esSimulacro !== undefined ? { esSimulacro: Boolean(root.emergencia.esSimulacro) } : {}),
        ...(root.emergencia.alertaId ? { alertaId: root.emergencia.alertaId } : {}),
        ...(root.emergencia.titulo ? { titulo: root.emergencia.titulo } : {}),
        ...(root.emergencia.timestamp ? { timestamp: root.emergencia.timestamp } : {}),
        organizationId: cleanDefaultOrg,
      };
      byCollection.emergencia = 1;
    }
  }

  return {
    updates,
    scannedRecords,
    pendingUpdates: Object.keys(updates).length,
    byCollection,
  };
}

async function runCli() {
  const args = process.argv.slice(2);
  const isApply = args.includes('--apply');
  const rtdbUrl = (
    process.env.FIREBASE_RTDB_URL ||
    process.env.VITE_FIREBASE_RTDB_URL ||
    'https://minefase-fc5f5-default-rtdb.firebaseio.com'
  ).replace(/\/+$/, '');
  const authToken = process.env.FIREBASE_DB_SECRET || process.env.FIREBASE_AUTH_TOKEN || '';
  const defaultOrg = process.env.DEFAULT_ORGANIZATION_ID || 'org-minesafe-principal';

  if (!authToken) {
    console.log(
      '[migrateLegacyOrganization] No se detectó FIREBASE_DB_SECRET ni FIREBASE_AUTH_TOKEN. ' +
        'Ejecutando verificación de ejemplo local (--dry-run) sobre snapshot vacío.'
    );
    const sample = planLegacyOrganizationBackfill({}, defaultOrg);
    console.log('[migrateLegacyOrganization] Planificación verificada:', JSON.stringify(sample));
    return;
  }

  const res = await fetch(`${rtdbUrl}/.json?auth=${encodeURIComponent(authToken)}`);
  if (!res.ok) {
    throw new Error(`No se pudo leer RTDB (${res.status} ${res.statusText})`);
  }
  const snapshot = (await res.json()) as Record<string, any>;
  const plan = planLegacyOrganizationBackfill(snapshot, defaultOrg);

  console.log(
    `[migrateLegacyOrganization] Escaneados: ${plan.scannedRecords} registros | Pendientes: ${plan.pendingUpdates}`,
    plan.byCollection
  );

  if (!isApply) {
    console.log('[migrateLegacyOrganization] Modo --dry-run activo. Use --apply para escribir en RTDB.');
    return;
  }

  if (plan.pendingUpdates === 0) {
    console.log('[migrateLegacyOrganization] Base de datos ya migrada; 0 cambios pendientes.');
    return;
  }

  const patchRes = await fetch(`${rtdbUrl}/.json?auth=${encodeURIComponent(authToken)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(plan.updates),
  });
  if (!patchRes.ok) {
    throw new Error(`Fallo aplicando PATCH multi-path en RTDB (${patchRes.status} ${patchRes.statusText})`);
  }
  console.log(`[migrateLegacyOrganization] Migración aplicada exitosamente (${plan.pendingUpdates} rutas).`);
}

const invokedDirectly =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1]?.includes('migrateLegacyOrganization');

if (invokedDirectly) {
  runCli().catch((err) => {
    console.error('[migrateLegacyOrganization] Error:', err?.message || err);
    process.exit(1);
  });
}
