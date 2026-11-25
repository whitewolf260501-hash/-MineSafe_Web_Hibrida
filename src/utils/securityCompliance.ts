import type {
  MiningSite,
  Organization,
  SecurityAuditAction,
  SecurityAuditSeverity,
  UserProfile,
  WorkerAssignment,
} from '../types/index.ts';
import { isGlobalMineSafeAdmin, isAnyAdminRole, isOrgAuthorizedForUser } from './accessControl.ts';

export const CURRENT_LEGAL_CONSENT_VERSION = '2026.1';
export const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutos (ISO/IEC 27001)
export const INACTIVITY_WARNING_MS = 60 * 1000; // Aviso previo de 60 segundos

export interface NormativeLimitEntry {
  variable: string;
  parameter: string;
  ds594Limit: string;
  ds132Context: string;
  actionRequired: string;
}

export const DS132_DS594_NORMATIVE_LIMITS: NormativeLimitEntry[] = [
  {
    variable: 'Gas / CO (MQ-2)',
    parameter: 'Monóxido de Carbono (LPP 8h / LPT)',
    ds594Limit: 'LPP 40 ppm (44 mg/m³) · Límite absoluto evacuación ≥ 100 ppm',
    ds132Context: 'Art. 138-145 DS 132: Ventilación subterránea obligatoria y evacuación ante gases tóxicos/inflamables.',
    actionRequired: 'Activar ventilación forzada, alerta sonora y evacuación de galería.',
  },
  {
    variable: 'Material Particulado PM2.5',
    parameter: 'Polvo respirable / sílice libre cristalizada',
    ds594Limit: 'Alerta ambiental ≥ 55 µg/m³ · Crítico operacional ≥ 150 µg/m³ (DS 594 Art. 66)',
    ds132Context: 'Art. 137 DS 132: Control de polvo en suspensión, humectación y EPP respiratorio P100.',
    actionRequired: 'Uso obligatorio de respirador certificado, riego de frentes y revisión de ductos.',
  },
  {
    variable: 'Temperatura Ambiente',
    parameter: 'Estrés térmico en labores subterráneas (TGBH)',
    ds594Limit: 'Preventivo ≥ 28 °C · Crítico ≥ 35 °C (DS 594 Art. 96-98)',
    ds132Context: 'Art. 142 DS 132: Control de temperatura efectiva y ciclos trabajo/descanso con hidratación.',
    actionRequired: 'Reducir carga física, pausas de enfriamiento y verificar inyección de aire fresco.',
  },
  {
    variable: 'Humedad Relativa',
    parameter: 'Condición higrométrica de galería',
    ds594Limit: 'Rango confortable 30% - 75% · Alerta condensación ≥ 85%',
    ds132Context: 'Art. 138 DS 132: Prevención de estrés térmico húmedo y deterioro de equipamiento eléctrico.',
    actionRequired: 'Monitorear drenaje de galería y condición de sensores eléctricos.',
  },
];

export interface DataRetentionPolicyItem {
  category: string;
  legalBasis: string;
  retentionPeriod: string;
  disposalMethod: string;
}

export const DATA_RETENTION_POLICY: DataRetentionPolicyItem[] = [
  {
    category: 'Telemetría continua IoT (CO, PM2.5, T°, HR)',
    legalBasis: 'Control operacional y respaldo técnico (DS 132)',
    retentionPeriod: '90 días en serie histórica activa (con agregación auditable)',
    disposalMethod: 'Depuración automática por ciclo de retención programado',
  },
  {
    category: 'Bitácora de Alertas, Evacuaciones y Simulacros',
    legalBasis: 'DS 132 (Sernageomin) y DS 594 (MINSAL) · Fiscalización laboral',
    retentionPeriod: '5 años desde el cierre del evento',
    disposalMethod: 'Archivo histórico inmutable con sello criptográfico SHA-256',
  },
  {
    category: 'Bitácora de Auditoría de Seguridad e Incidentes',
    legalBasis: 'ISO/IEC 27001 (A.8.15) · Ley 21.663 · Ley 21.459',
    retentionPeriod: '5 años (solo anexión, sin sobrescritura)',
    disposalMethod: 'Preservación probatoria ante auditorías o requerimientos CSIRT',
  },
  {
    category: 'Datos Personales de Trabajadores (Nombre, RUT, Correo)',
    legalBasis: 'Ley 19.628 y Nueva Ley 21.719 (Protección de Datos Personales)',
    retentionPeriod: 'Vigencia del vínculo laboral + plazo legal; anonimización vía ARCOP',
    disposalMethod: 'Anonimización irreversible manteniendo integridad referencial DS 132',
  },
];

// ============================================================================
// 1. PROTECCIÓN CONTRA INTENTOS FALLIDOS DE LOGIN (LOCKOUT PROGRESIVO)
// ============================================================================

export interface LoginAttemptRecord {
  failures: number;
  lockedUntilMs: number;
  lastAttemptMs: number;
}

export interface LoginLockoutStatus {
  locked: boolean;
  failures: number;
  remainingMs: number;
  remainingSeconds: number;
  lockedUntilMs: number;
}

export interface KeyValueStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const LOGIN_LOCKOUT_PREFIX = 'minesafe_login_guard_v1:';
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // Reinicia conteo tras 15 min sin fallos

function getDefaultSessionStorage(): KeyValueStorageLike | null {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return window.sessionStorage;
    }
  } catch {
    // Ignore restricted storage environments
  }
  return null;
}

export function normalizeLoginGuardKey(email: string): string {
  const clean = (email || '').trim().toLowerCase() || '__anonymous__';
  return `${LOGIN_LOCKOUT_PREFIX}${clean}`;
}

export function computeProgressiveLockoutMs(failures: number): number {
  if (failures >= 7) return 180_000; // 3 minutos
  if (failures >= 5) return 60_000; // 1 minuto
  if (failures >= 3) return 15_000; // 15 segundos
  return 0;
}

function readAttemptRecord(email: string, storage?: KeyValueStorageLike | null): LoginAttemptRecord | null {
  const store = storage === undefined ? getDefaultSessionStorage() : storage;
  if (!store) return null;
  try {
    const raw = store.getItem(normalizeLoginGuardKey(email));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LoginAttemptRecord>;
    if (typeof parsed.failures !== 'number' || typeof parsed.lastAttemptMs !== 'number') {
      return null;
    }
    return {
      failures: Math.max(0, Math.floor(parsed.failures)),
      lockedUntilMs: typeof parsed.lockedUntilMs === 'number' ? parsed.lockedUntilMs : 0,
      lastAttemptMs: parsed.lastAttemptMs,
    };
  } catch {
    return null;
  }
}

export function evaluateLoginLockout(
  email: string,
  nowMs: number = Date.now(),
  storage?: KeyValueStorageLike | null
): LoginLockoutStatus {
  const rec = readAttemptRecord(email, storage);
  if (!rec) {
    return { locked: false, failures: 0, remainingMs: 0, remainingSeconds: 0, lockedUntilMs: 0 };
  }
  if (nowMs - rec.lastAttemptMs > ATTEMPT_WINDOW_MS && nowMs >= rec.lockedUntilMs) {
    clearFailedLoginAttempts(email, storage);
    return { locked: false, failures: 0, remainingMs: 0, remainingSeconds: 0, lockedUntilMs: 0 };
  }
  const remainingMs = Math.max(0, rec.lockedUntilMs - nowMs);
  return {
    locked: remainingMs > 0,
    failures: rec.failures,
    remainingMs,
    remainingSeconds: Math.ceil(remainingMs / 1000),
    lockedUntilMs: rec.lockedUntilMs,
  };
}

export function recordFailedLoginAttempt(
  email: string,
  nowMs: number = Date.now(),
  storage?: KeyValueStorageLike | null
): LoginLockoutStatus {
  const store = storage === undefined ? getDefaultSessionStorage() : storage;
  const prev = readAttemptRecord(email, storage);
  const expired = !prev || (nowMs - prev.lastAttemptMs > ATTEMPT_WINDOW_MS && nowMs >= prev.lockedUntilMs);
  const failures = expired ? 1 : prev.failures + 1;
  const lockDurationMs = computeProgressiveLockoutMs(failures);
  const lockedUntilMs = lockDurationMs > 0 ? nowMs + lockDurationMs : 0;

  const next: LoginAttemptRecord = {
    failures,
    lockedUntilMs,
    lastAttemptMs: nowMs,
  };

  if (store) {
    try {
      store.setItem(normalizeLoginGuardKey(email), JSON.stringify(next));
    } catch {
      // Ignore storage quota errors
    }
  }

  const remainingMs = Math.max(0, lockedUntilMs - nowMs);
  return {
    locked: remainingMs > 0,
    failures,
    remainingMs,
    remainingSeconds: Math.ceil(remainingMs / 1000),
    lockedUntilMs,
  };
}

export function clearFailedLoginAttempts(
  email: string,
  storage?: KeyValueStorageLike | null
): void {
  const store = storage === undefined ? getDefaultSessionStorage() : storage;
  if (!store) return;
  try {
    store.removeItem(normalizeLoginGuardKey(email));
  } catch {
    // Ignore storage errors
  }
}

// ============================================================================
// 2. SELLO CRIPTOGRÁFICO SHA-256 PARA REPORTES NORMATIVOS (DS 132 / DS 594)
// ============================================================================

export interface ReportIntegritySeal {
  folio: string;
  sha256: string;
  shortHash: string;
  generatedAtIso: string;
  reportType: string;
  deviceId?: string;
  actorName: string;
  actorRole: string;
  normativeRef: string;
  rowCount: number;
}

export async function computeSha256Hex(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const hashBuffer = await subtle.digest('SHA-256', data);
    const bytes = new Uint8Array(hashBuffer);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback deterministic digest only if SubtleCrypto is unavailable
  let h1 = 0x811c9dc5;
  for (let i = 0; i < data.length; i += 1) {
    h1 ^= data[i];
    h1 = Math.imul(h1, 0x01000193);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0').repeat(8);
}

function escapeSealCsvCell(value: string | number): string {
  const raw = String(value ?? '');
  if (raw.includes(',') || raw.includes('"') || raw.includes('\n') || raw.includes('\r')) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

export async function buildReportIntegritySeal(params: {
  content: string;
  reportType: string;
  deviceId?: string;
  actorName: string;
  actorRole: string;
  normativeRef?: string;
  rowCount?: number;
  now?: Date;
}): Promise<ReportIntegritySeal> {
  const now = params.now ?? new Date();
  const generatedAtIso = now.toISOString();
  const normalizedBody = params.content.replace(/^\uFEFF/, '');
  const sha256 = await computeSha256Hex(normalizedBody);
  const shortHash = sha256.slice(0, 12).toUpperCase();
  const dateCompact = generatedAtIso.slice(0, 10).replace(/-/g, '');
  const folio = `MS-DS132-${dateCompact}-${shortHash.slice(0, 8)}`;

  const computedRows =
    typeof params.rowCount === 'number'
      ? params.rowCount
      : Math.max(0, normalizedBody.split(/\r?\n/).filter((l) => l.trim().length > 0).length - 1);

  return {
    folio,
    sha256,
    shortHash,
    generatedAtIso,
    reportType: params.reportType,
    deviceId: params.deviceId,
    actorName: params.actorName || 'Sistema MineSafe',
    actorRole: params.actorRole || 'usuario',
    normativeRef: params.normativeRef || 'DS 132 (Sernageomin) / DS 594 (MINSAL)',
    rowCount: computedRows,
  };
}

export function appendIntegritySealToCsv(csvContent: string, seal: ReportIntegritySeal): string {
  const cleanBody = csvContent.replace(/\r?\n+$/, '');
  const sealLines = [
    '',
    '# === SELLO DE INTEGRIDAD CRIPTOGRÁFICA MINESAFE IOT ===',
    `# Folio Verificable,${escapeSealCsvCell(seal.folio)}`,
    `# Norma Aplicable,${escapeSealCsvCell(seal.normativeRef)}`,
    `# Tipo de Reporte,${escapeSealCsvCell(seal.reportType)}`,
    ...(seal.deviceId ? [`# Dispositivo / Alcance,${escapeSealCsvCell(seal.deviceId)}`] : []),
    `# Emitido Por,${escapeSealCsvCell(`${seal.actorName} (${seal.actorRole})`)}`,
    `# Fecha Emisión UTC,${escapeSealCsvCell(seal.generatedAtIso)}`,
    `# Registros Certificados,${seal.rowCount}`,
    `# SHA-256 Cuerpo CSV,${seal.sha256}`,
  ];
  return `${cleanBody}\n${sealLines.join('\n')}\n`;
}

export async function signCsvExportWithIntegritySeal(params: {
  csvContent: string;
  reportType: string;
  deviceId?: string;
  actorName: string;
  actorRole: string;
  normativeRef?: string;
  rowCount?: number;
  now?: Date;
}): Promise<{ signedCsv: string; seal: ReportIntegritySeal }> {
  const seal = await buildReportIntegritySeal({
    content: params.csvContent,
    reportType: params.reportType,
    deviceId: params.deviceId,
    actorName: params.actorName,
    actorRole: params.actorRole,
    normativeRef: params.normativeRef,
    rowCount: params.rowCount,
    now: params.now,
  });
  const signedCsv = appendIntegritySealToCsv(params.csvContent, seal);
  return { signedCsv, seal };
}

// ============================================================================
// 3. DERECHOS ARCOP (LEY 19.628 / NUEVA LEY 21.719 CHILE) & RBAC AUDITORÍA
// ============================================================================

export function canViewSecurityAuditTab(
  user?: Pick<UserProfile, 'role' | 'status'> | null
): boolean {
  if (!user || user.status !== 'activo') return false;
  return isGlobalMineSafeAdmin(user.role);
}

export function canExportUserARCOPData(
  actingUser: UserProfile | null | undefined,
  targetUser: UserProfile | null | undefined,
  organizations?: Organization[]
): { allowed: boolean; reason?: string } {
  if (!actingUser || actingUser.status !== 'activo') {
    return { allowed: false, reason: 'La sesión actual no está activa.' };
  }
  if (!targetUser) {
    return { allowed: false, reason: 'Usuario no encontrado.' };
  }
  // Todo titular puede exportar sus propios datos personales (Derecho de Acceso y Portabilidad)
  if (actingUser.id === targetUser.id) {
    return { allowed: true };
  }
  if (isGlobalMineSafeAdmin(actingUser.role)) {
    return { allowed: true };
  }
  if (isAnyAdminRole(actingUser.role)) {
    if (isOrgAuthorizedForUser(actingUser, targetUser.organizationId, organizations)) {
      return { allowed: true };
    }
    return { allowed: false, reason: 'Solo puedes exportar datos ARCOP de usuarios de tu empresa.' };
  }
  return { allowed: false, reason: 'No tienes permisos para exportar los datos de otro usuario.' };
}

export function canAnonymizeUserPII(
  actingUser: UserProfile | null | undefined,
  targetUser: UserProfile | null | undefined
): { allowed: boolean; reason?: string } {
  if (!actingUser || actingUser.status !== 'activo') {
    return { allowed: false, reason: 'La sesión actual no está activa.' };
  }
  if (!targetUser) {
    return { allowed: false, reason: 'Usuario no encontrado.' };
  }
  if (!isGlobalMineSafeAdmin(actingUser.role)) {
    return {
      allowed: false,
      reason: 'Solo SuperAdmin o Admin MineSafe pueden ejecutar anonimización ARCOP de datos personales.',
    };
  }
  if (actingUser.id === targetUser.id) {
    return { allowed: false, reason: 'No puedes anonimizar tu propia cuenta activa.' };
  }
  if (targetUser.role === 'superadmin') {
    return { allowed: false, reason: 'No es posible anonimizar la cuenta del SuperAdministrador.' };
  }
  if (targetUser.role === 'admin_minesafe' && actingUser.role !== 'superadmin') {
    return {
      allowed: false,
      reason: 'Solo el SuperAdministrador puede anonimizar cuentas de Admin MineSafe.',
    };
  }
  if (targetUser.anonymizedAt) {
    return { allowed: false, reason: 'Los datos personales de este usuario ya fueron anonimizados.' };
  }
  return { allowed: true };
}

export interface UserARCOPExportBundle {
  schemaVersion: string;
  normativeFramework: string;
  exportedAtIso: string;
  requestedBy: {
    id: string;
    name: string;
    role: string;
  };
  dataSubject: {
    id: string;
    name: string;
    email: string;
    rut: string;
    role: string;
    roleLabel: string;
    status: string;
    shift: string;
    organizationId?: string;
    organizationName?: string;
    assignedSiteName?: string;
    assignedCrewName?: string;
    assignedSector?: string;
    assignedDeviceCode?: string;
    legalConsentVersion?: string;
    legalConsentAcceptedAtIso?: string;
    anonymizedAtIso?: string;
  };
  operationalAssignments: Array<{
    id: string;
    sectorName: string;
    crew: string;
    assignedDeviceCode: string;
    assignmentDate: string;
  }>;
  retentionNotice: string;
}

export function buildUserPersonalDataExportJson(params: {
  targetUser: UserProfile;
  actingUser: UserProfile;
  organizations?: Organization[];
  sites?: MiningSite[];
  assignments?: WorkerAssignment[];
  now?: Date;
}): UserARCOPExportBundle {
  const now = params.now ?? new Date();
  const org = (params.organizations || []).find((o) => o.id === params.targetUser.organizationId);
  const site = (params.sites || []).find((s) => s.id === params.targetUser.assignedSiteId);
  const userAssignments = (params.assignments || []).filter(
    (a) =>
      a.userId === params.targetUser.id ||
      (params.targetUser.rut &&
        a.workerRut &&
        a.workerRut.replace(/[^0-9kK]/g, '').toLowerCase() ===
          params.targetUser.rut.replace(/[^0-9kK]/g, '').toLowerCase())
  );

  return {
    schemaVersion: '1.0-ARCOP',
    normativeFramework: 'Ley 19.628 y Nueva Ley 21.719 (Protección de Datos Personales - Chile)',
    exportedAtIso: now.toISOString(),
    requestedBy: {
      id: params.actingUser.id,
      name: params.actingUser.name,
      role: params.actingUser.role,
    },
    dataSubject: {
      id: params.targetUser.id,
      name: params.targetUser.name,
      email: params.targetUser.email,
      rut: params.targetUser.rut,
      role: params.targetUser.role,
      roleLabel: params.targetUser.roleLabel,
      status: params.targetUser.status,
      shift: params.targetUser.shift,
      organizationId: params.targetUser.organizationId,
      organizationName: org?.name,
      assignedSiteName: params.targetUser.assignedSiteName || site?.name,
      assignedCrewName: params.targetUser.assignedCrewName,
      assignedSector: params.targetUser.assignedSector,
      assignedDeviceCode: params.targetUser.assignedDeviceCode,
      legalConsentVersion: params.targetUser.legalConsentVersion,
      legalConsentAcceptedAtIso: params.targetUser.legalConsentAcceptedAt
        ? new Date(params.targetUser.legalConsentAcceptedAt).toISOString()
        : undefined,
      anonymizedAtIso: params.targetUser.anonymizedAt
        ? new Date(params.targetUser.anonymizedAt).toISOString()
        : undefined,
    },
    operationalAssignments: userAssignments.map((a) => ({
      id: a.id,
      sectorName: a.sectorName,
      crew: a.crew,
      assignedDeviceCode: a.assignedDeviceCode,
      assignmentDate: a.assignmentDate,
    })),
    retentionNotice:
      'Los registros históricos de seguridad minera y emergencias (DS 132 / DS 594) se conservan por 5 años en formato auditable; la solicitud de cancelación anonimiza los identificadores personales sin alterar la trazabilidad operacional.',
  };
}

export function buildAnonymizedUserData(
  targetUser: UserProfile,
  actingUser: Pick<UserProfile, 'id' | 'name'>,
  nowMs: number = Date.now()
): {
  name: string;
  email: string;
  rut: string;
  status: 'inactivo';
  blockedReason: string;
  anonymizedAt: number;
  anonymizedBy: string;
} {
  const shortTag = (targetUser.id || 'user').replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase() || 'ANON';
  return {
    name: `Ex-Colaborador Anonimizado (#${shortTag})`,
    email: `anonimizado.${shortTag.toLowerCase()}.${nowMs}@minesafe.invalid`,
    rut: 'ANONIMIZADO',
    status: 'inactivo',
    blockedReason: 'Datos personales anonimizados en cumplimiento de derecho ARCOP (Ley 19.628 / Ley 21.719).',
    anonymizedAt: nowMs,
    anonymizedBy: `${actingUser.name} (${actingUser.id})`,
  };
}

// ============================================================================
// 4. UTILIDADES DE SEGURIDAD DEL SERVIDOR (EXPRESS / API IOT)
// ============================================================================

export const MINESAFE_SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'X-Permitted-Cross-Domain-Policies': 'none',
};

/**
 * Comparación en tiempo constante (sin filtrar longitud ni prefijos por timing).
 */
export function verifyConstantTimeToken(provided: string | undefined | null, expected: string | undefined | null): boolean {
  const a = typeof provided === 'string' ? provided : '';
  const b = typeof expected === 'string' ? expected : '';
  if (!a || !b) return false;
  const maxLen = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < maxLen; i += 1) {
    const codeA = i < a.length ? a.charCodeAt(i) : 0;
    const codeB = i < b.length ? b.charCodeAt(i) : 0;
    diff |= codeA ^ codeB;
  }
  return diff === 0;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  retryAfterMs: number;
}

export interface SlidingWindowRateLimiter {
  check(key: string, nowMs?: number): RateLimitCheckResult;
  reset(key?: string): void;
}

export function createSlidingWindowRateLimiter(options: {
  maxRequests: number;
  windowMs: number;
}): SlidingWindowRateLimiter {
  const maxRequests = Math.max(1, Math.floor(options.maxRequests));
  const windowMs = Math.max(1000, Math.floor(options.windowMs));
  const buckets = new Map<string, number[]>();

  return {
    check(key: string, nowMs: number = Date.now()): RateLimitCheckResult {
      const normalizedKey = (key || 'global').trim();
      const cutoff = nowMs - windowMs;
      const existing = (buckets.get(normalizedKey) || []).filter((ts) => ts > cutoff);

      if (existing.length >= maxRequests) {
        const oldest = existing[0] ?? nowMs;
        const retryAfterMs = Math.max(1000, oldest + windowMs - nowMs);
        buckets.set(normalizedKey, existing);
        return {
          allowed: false,
          remaining: 0,
          limit: maxRequests,
          retryAfterMs,
        };
      }

      existing.push(nowMs);
      buckets.set(normalizedKey, existing);
      return {
        allowed: true,
        remaining: Math.max(0, maxRequests - existing.length),
        limit: maxRequests,
        retryAfterMs: 0,
      };
    },
    reset(key?: string): void {
      if (key) {
        buckets.delete(key);
      } else {
        buckets.clear();
      }
    },
  };
}

export function validateTelemetryIngestPayload(
  body: unknown
): { valid: boolean; reason?: string; deviceId?: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, reason: 'invalid_json_object' };
  }
  const rec = body as Record<string, unknown>;
  const deviceId = typeof rec.deviceId === 'string' ? rec.deviceId.trim() : '';
  if (!deviceId || !/^[A-Za-z0-9_-]{3,64}$/.test(deviceId)) {
    return { valid: false, reason: 'invalid_device_id' };
  }

  const numericChecks: Array<{ keys: string[]; min: number; max: number; label: string }> = [
    { keys: ['CO', 'co'], min: 0, max: 10000, label: 'CO' },
    { keys: ['PM2_5', 'pm25'], min: 0, max: 10000, label: 'PM2_5' },
    { keys: ['temperatura', 'temperature'], min: -50, max: 120, label: 'temperatura' },
    { keys: ['humedad', 'humidity'], min: 0, max: 100, label: 'humedad' },
  ];

  for (const check of numericChecks) {
    for (const key of check.keys) {
      if (rec[key] !== undefined && rec[key] !== null) {
        const num = Number(rec[key]);
        if (!Number.isFinite(num) || num < check.min || num > check.max) {
          return { valid: false, reason: `out_of_range_${check.label}` };
        }
      }
    }
  }

  return { valid: true, deviceId };
}

export const SECURITY_AUDIT_ACTION_LABELS: Record<SecurityAuditAction, string> = {
  login_exitoso: 'Inicio de Sesión',
  intento_login_fallido: 'Intento Fallido de Acceso',
  bloqueo_login_temporal: 'Bloqueo Temporal por Fuerza Bruta',
  cierre_sesion: 'Cierre de Sesión',
  cierre_inactividad: 'Cierre Automático por Inactividad (15m)',
  consentimiento_legal: 'Aceptación de Política y Términos',
  acceso_pii_rut: 'Desbloqueo de RUT (Dato Sensible)',
  acceso_pii_email: 'Desbloqueo de Correo Corporativo',
  exportacion_arcop: 'Exportación Portabilidad ARCOP',
  anonimizacion_arcop: 'Anonimización ARCOP de PII',
  cambio_rol_usuario: 'Cambio de Rol de Usuario',
  cambio_estado_usuario: 'Bloqueo / Reactivación de Usuario',
  gestion_empresa: 'Gestión de Empresa (Bloqueo / Eliminación)',
  gestion_faena_cuadrilla: 'Gestión de Faena o Cuadrilla',
  gestion_dispositivo_iot: 'Gestión de Dispositivo IoT',
  control_alarma_emergencia: 'Control de Alarma / Emergencia',
  cambio_umbral: 'Modificación de Umbral Normativo',
  exportacion_reporte_sellado: 'Exportación Reporte con Sello SHA-256',
  incidente_ciberseguridad: 'Registro / Gestión de Incidente Ciberseguridad',
};

export const SECURITY_AUDIT_SEVERITY_STYLES: Record<
  SecurityAuditSeverity,
  { label: string; badgeClass: string }
> = {
  info: {
    label: 'Informativo',
    badgeClass: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  },
  warning: {
    label: 'Sensible',
    badgeClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  },
  critical: {
    label: 'Crítico',
    badgeClass: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  },
};
