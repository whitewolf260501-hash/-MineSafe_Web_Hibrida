import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  Firestore
} from 'firebase/firestore';
import {
  getDatabase,
  ref,
  onValue,
  set,
  update,
  get,
  remove,
  query,
  orderByChild,
  equalTo,
  startAt,
  endAt,
  orderByKey,
  limitToFirst,
  limitToLast,
  Database,
  DatabaseReference,
  Query
} from 'firebase/database';
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  FirebaseStorage
} from 'firebase/storage';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile,
  updatePassword,
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
  User as FirebaseUser
} from 'firebase/auth';

import firebaseConfig from '../../firebase-applet-config.json';
import {
  SensorDevice,
  CommunicationLinkMode,
  UserProfile,
  DeviceRental,
  UserRole,
  SafetyAlert,
  AlertSeverity,
  AlertResolutionDetails,
  DrillDebriefRecord,
  DeviceThresholdsConfig,
  AlertEventRecord,
  AlarmAuditRecord,
  ControllableTab,
  ControllableRoleKey,
  EquiposSubTab,
  NavigationTab,
  PlatformConfig,
  WindowOverrideValue,
  SectionVisibilityKey,
  RegisteredDeviceConfig,
  DeviceCategory,
  DeviceAssignmentStatus,
  DeviceAssignmentAuditEntry,
  MiningSite,
  MiningSector,
  Organization,
  TelemetryHistoryPoint,
  TelemetryHistoryPageResult,
  AlertAttachment,
  WorkerAssignment,
  CrewMember,
  MiningCrew,
  SecurityAuditEvent,
  SecurityAuditAction,
  SecurityAuditSeverity,
  CybersecurityIncident,
  CybersecurityIncidentCategory,
  CybersecurityIncidentSeverity,
  CybersecurityIncidentStatus
} from '../types';
import {
  assertActiveSession,
  canAccessExperimentalBenchDevice,
  canBlockOrDeleteIoTDevice,
  canBlockOrDeleteSite,
  canControlMineAlarm,
  canCreateOrEditOrganization,
  canDeleteOrganization,
  canDistributeDeviceInsideOrg,
  canManageContractsAndPayments,
  canManageCrews,
  canManageOrganizationHierarchy,
  canModifyTargetUser,
  canProvisionUserInOrganization,
  canRegisterAndAssignIoTDevices,
  DEFAULT_ORGANIZATION_ID,
  EmailProfileEntry,
  EXPERIMENTAL_BENCH_V2_DEVICE_ID,
  findUserEmailConflictInOrg,
  isAnyAdminRole,
  isExperimentalBenchDeviceId,
  isGlobalMineSafeAdmin,
  isMultiNodeSimulatedDeviceId,
  isOrgAuthorizedForUser,
  isSimulatedDevice,
  isSimulatedOrBenchDevice,
  isUnassignedDeviceOrg,
  MULTINODE_SIMULATED_ID_REGEX,
  resolveDeviceAssignmentStatus,
  selectBestLoginProfileForEmail,
  UNASSIGNED_DEVICE_ORG_ID,
} from '../utils/accessControl';
import {
  BulkAssignmentImportItem,
  BulkCrewImportItem,
  BulkDeviceImportItem,
  BulkHierarchyImportItem,
  BulkRentalImportItem,
  BulkSiteImportItem,
  BulkUserImportItem,
  buildCompanyUserProfile,
  expandHierarchyRowsToEntities,
} from '../utils/bulkCompanyImport';
import { isPlaceholderRut, validateChileanRut } from '../utils/rut';
import {
  CURRENT_LEGAL_CONSENT_VERSION,
  buildAnonymizedUserData,
  canAnonymizeUserPII,
  canViewSecurityAuditTab,
} from '../utils/securityCompliance';
import {
  CURRENT_PASSWORD_POLICY_VERSION,
  validatePasswordPolicy,
} from '../utils/passwordPolicy';

const DEFAULT_RTDB_URL = "https://minefase-fc5f5-default-rtdb.firebaseio.com/";

export function resolveConfiguredRtdbUrl(envUrl?: string): string {
  const rawCandidate =
    envUrl ??
    (typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_FIREBASE_RTDB_URL : undefined) ??
    '';
  const candidate = String(rawCandidate).trim();
  if (!candidate) return DEFAULT_RTDB_URL;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === 'https:' && parsed.hostname.endsWith('.firebaseio.com')) {
      return candidate.endsWith('/') ? candidate : `${candidate}/`;
    }
  } catch {
    // Fallback to validated default URL when env override is malformed
  }
  return DEFAULT_RTDB_URL;
}

export const USER_RTDB_URL = resolveConfiguredRtdbUrl();

const minefaseConfig = {
  apiKey: "AIzaSyA14qbuEIlTtln7A0U5xJCzFtj9jIxDHCg",
  authDomain: "minefase-fc5f5.firebaseapp.com",
  databaseURL: USER_RTDB_URL,
  projectId: "minefase-fc5f5",
  storageBucket: "minefase-fc5f5.firebasestorage.app",
  messagingSenderId: "766582128927",
  appId: "1:766582128927:web:1cf296e3c84874221bb02a",
  measurementId: "G-DP6YY8GJWE"
};

export const DEFAULT_ORGANIZATION: Organization = {
  id: 'org-minesafe-principal',
  name: 'MineSafe Operaciones Centrales',
  rut: '76.420.110-K',
  industry: 'Minería Subterránea & Rajo',
  status: 'activa',
  createdAt: 1760000000000,
};

// Primary Firebase App connected to user's minefase-fc5f5 project (Auth + RTDB + Storage)
const minefaseApp = getApps().find((a) => a.name === 'minefase-primary')
  || initializeApp(minefaseConfig, 'minefase-primary');

// Default AI Studio Firestore app
const appletApp = getApps().find((a) => a.name === '[DEFAULT]')
  || initializeApp(firebaseConfig);

// Firebase Realtime Database, Auth & Storage connected strictly to minefase-fc5f5
export const rtdb: Database = getDatabase(minefaseApp, USER_RTDB_URL);
export const auth = getAuth(minefaseApp);
export const minefaseStorage: FirebaseStorage = getStorage(minefaseApp);

// Firestore instance
export const db: Firestore = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
  ? getFirestore(appletApp, firebaseConfig.firestoreDatabaseId)
  : getFirestore(appletApp);

// Connection test for user's Realtime Database (respects org scope for non-superadmin,
// with safe fallback when legacy RTDB lacks .indexOn or organizationId on device nodes)
export async function testConnection(scope?: RTDBSubscriptionScope): Promise<boolean> {
  try {
    const testQuery = buildOrgScopedQuery('dispositivos', scope);
    const snapshot = await get(testQuery);
    if (snapshot.exists()) return true;
  } catch (error) {
    console.warn('RTDB scoped connection test warning:', error);
  }

  // Fallback 1: check first explicitly authorized device node (works even without .indexOn)
  const explicitIds = Array.from(new Set((scope?.deviceIds || []).filter(Boolean)));
  for (const devId of explicitIds.slice(0, 2)) {
    try {
      const snap = await get(ref(rtdb, `dispositivos/${devId}`));
      if (snap.exists()) return true;
    } catch {
      // continue to next check
    }
  }

  // Fallback 2: check RTDB WebSocket connection state directly
  try {
    const connSnap = await get(ref(rtdb, '.info/connected'));
    if (connSnap.val() === true) return true;
  } catch (error) {
    console.warn('RTDB .info/connected error:', error);
  }
  return false;
}

export function subscribeToRTDBConnectionState(
  callback: (connected: boolean) => void
): () => void {
  const connectedRef = ref(rtdb, '.info/connected');
  return onValue(
    connectedRef,
    (snapshot) => {
      const isConn = snapshot.val() === true;
      updateBenchDiagnostics({ rtdbConnected: isConn });
      callback(isConn);
    },
    () => {
      updateBenchDiagnostics({ rtdbConnected: false });
      callback(false);
    }
  );
}

// -------------------------------------------------------------
// P091 / P092 / P094 — CONSTANTES DE INTEGRACIÓN ESP32, V2 EXPERIMENTAL Y DIAGNÓSTICO
// -------------------------------------------------------------
export const APP_BUILD_VERSION = 'P094';
export const APP_BUILD_LABEL = 'MineSafe Web P094';
export const PHYSICAL_NODE_DEVICE_ID = 'device_38A839E81F84';
export const SIMULATED_NODE_DEVICE_ID = 'device_9F4C2A7E1B08';
export const GATEWAY_DEVICE_ID = 'gateway_ESP32_DEVKIT_V1';
export const PHYSICAL_NODE_AUTH_EMAIL = 'esp32-nodo-fisico@minesafe.example';
export const PHYSICAL_NODE_AUTH_UID = 'tJgRrlKRwPQOWCkdJiWA54B0JN33';
export const BENCH_TELEMETRY_PATH = 'diagnostico/esp32_p087';
export const BENCH_HISTORY_PATH = 'diagnostico/esp32_p087/historial';
export const MULTINODE_SIMULATED_NODES_PATH = 'diagnostico/nodos_simulados';
export const MULTINODE_GATEWAY_DIAG_PATH = 'diagnostico/gateway_ESP32_DEVKIT_V1';
export {
  EXPERIMENTAL_BENCH_V2_DEVICE_ID,
  MULTINODE_SIMULATED_ID_REGEX,
  isExperimentalBenchDeviceId,
  canAccessExperimentalBenchDevice,
  isMultiNodeSimulatedDeviceId,
  isSimulatedDevice,
  isSimulatedOrBenchDevice,
};
export const EXPERIMENTAL_BENCH_V2_PATH = `dispositivos/${EXPERIMENTAL_BENCH_V2_DEVICE_ID}`;
export const EXPERIMENTAL_BENCH_V2_HISTORY_PATH = `dispositivos/${EXPERIMENTAL_BENCH_V2_DEVICE_ID}/historial`;
export const DEFAULT_DEVICE_TIMEOUT_SECONDS = 20;
export const DUST_SENSOR_MODEL_LABEL =
  'Sensor óptico de polvo OPEN-SMART (estimación sin calibración oficial)';

export function isExperimentalBenchDevice(
  device?: Pick<SensorDevice, 'id' | 'isExperimentalBench'> | null
): boolean {
  if (!device) return false;
  return device.isExperimentalBench === true || isExperimentalBenchDeviceId(device.id);
}

export function assertNotExperimentalBenchOperationalCommand(
  deviceId: string | undefined | null,
  operationName: string = 'comando operacional'
): void {
  if (isExperimentalBenchDeviceId(deviceId)) {
    throw new Error(
      `Operación bloqueada (${operationName}): ${EXPERIMENTAL_BENCH_V2_DEVICE_ID} es un equipo experimental de banco sin asignación y está excluido de alertas y comandos operacionales.`
    );
  }
  if (isMultiNodeSimulatedDeviceId(deviceId)) {
    throw new Error(
      `Operación bloqueada (${operationName}): ${deviceId} es un dispositivo simulado (MultiNode V2 / modo banco) y no puede ejecutar comandos operacionales ni activar alarmas físicas.`
    );
  }
}

export function filterOutExperimentalBenchDeviceIds(ids?: string[]): string[] {
  return Array.from(
    new Set(
      (ids || []).filter(
        (id) =>
          Boolean(id) &&
          !isExperimentalBenchDeviceId(id) &&
          !isMultiNodeSimulatedDeviceId(id)
      )
    )
  );
}

// Sincronización con el reloj del servidor de Firebase RTDB (/.info/serverTimeOffset)
// para evitar falsos "Desconectado" cuando el reloj del PC/navegador está desfasado.
let rtdbServerTimeOffsetMs = 0;
let serverTimeOffsetStarted = false;

export function getRTDBServerTimeOffsetMs(): number {
  return rtdbServerTimeOffsetMs;
}

export function getEstimatedServerNowMs(): number {
  return Date.now() + rtdbServerTimeOffsetMs;
}

export function setRTDBServerTimeOffsetForTesting(offsetMs: number): void {
  rtdbServerTimeOffsetMs = Number.isFinite(offsetMs) ? Math.round(offsetMs) : 0;
  updateBenchDiagnostics({ serverTimeOffsetMs: rtdbServerTimeOffsetMs });
}

export function startServerTimeOffsetSync(): void {
  if (serverTimeOffsetStarted) return;
  serverTimeOffsetStarted = true;
  try {
    onValue(
      ref(rtdb, '.info/serverTimeOffset'),
      (snap) => {
        const val = Number(snap.val());
        rtdbServerTimeOffsetMs = Number.isFinite(val) ? Math.round(val) : 0;
        updateBenchDiagnostics({ serverTimeOffsetMs: rtdbServerTimeOffsetMs });
      },
      () => {
        // Mantener offset 0 si el cliente aún no conecta o está en pruebas offline
      }
    );
  } catch {
    // Entorno sin WebSocket RTDB activo
  }
}

export interface BenchTelemetryDiagnostics {
  buildVersion: string;
  projectId: string;
  rtdbUrl: string;
  rtdbConnected: boolean;
  serverTimeOffsetMs: number;
  auth: {
    authenticated: boolean;
    uid: string | null;
    email: string | null;
    emailVerified: boolean;
    providerId: string | null;
    profileNodeExists: boolean | null;
    profileIsActive: boolean | null;
    profileRole: string | null;
    profileIsSuperUser: boolean | null;
    profileReadError: string | null;
  };
  devicesListener: {
    status: 'idle' | 'listening' | 'ok' | 'error';
    lastEventAt: number | null;
    devicesCount: number;
    physicalNodeExists: boolean;
    physicalNodeRawTs: number;
    physicalNodeRawPM25: number | null;
    error: string | null;
  };
  benchListener: {
    path: string;
    status: 'idle' | 'listening' | 'ok' | 'empty' | 'error';
    lastEventAt: number | null;
    error: string | null;
    errorCode: string | null;
    normalizedServerTs: number;
    rawPayload: {
      CO?: unknown;
      PM2_5?: unknown;
      temperatura?: unknown;
      humedad?: unknown;
      last_update_server?: unknown;
      origen?: unknown;
      simulado?: unknown;
      hasHistorial?: boolean;
    } | null;
  };
  mergeDecision: {
    applied: boolean;
    reason: string;
    existingPhysicalTs: number;
    benchTs: number;
    effectiveTs: number;
    serverNowMs: number;
    diffSeconds: number;
    timeoutSeconds: number;
    isOnline: boolean;
  };
  historyListener: {
    path: string;
    status: 'idle' | 'listening' | 'ok' | 'empty' | 'error';
    benchPointsCount: number;
    legacyPointsCount: number;
    lastError: string | null;
  };
  lastProbeAt: number | null;
}

const createInitialBenchDiagnostics = (): BenchTelemetryDiagnostics => ({
  buildVersion: APP_BUILD_VERSION,
  projectId: minefaseConfig.projectId,
  rtdbUrl: USER_RTDB_URL,
  rtdbConnected: false,
  serverTimeOffsetMs: 0,
  auth: {
    authenticated: false,
    uid: null,
    email: null,
    emailVerified: false,
    providerId: null,
    profileNodeExists: null,
    profileIsActive: null,
    profileRole: null,
    profileIsSuperUser: null,
    profileReadError: null,
  },
  devicesListener: {
    status: 'idle',
    lastEventAt: null,
    devicesCount: 0,
    physicalNodeExists: false,
    physicalNodeRawTs: 0,
    physicalNodeRawPM25: null,
    error: null,
  },
  benchListener: {
    path: `/${BENCH_TELEMETRY_PATH}`,
    status: 'idle',
    lastEventAt: null,
    error: null,
    errorCode: null,
    normalizedServerTs: 0,
    rawPayload: null,
  },
  mergeDecision: {
    applied: false,
    reason: 'Sin eventos recibidos aún',
    existingPhysicalTs: 0,
    benchTs: 0,
    effectiveTs: 0,
    serverNowMs: Date.now(),
    diffSeconds: 999999,
    timeoutSeconds: DEFAULT_DEVICE_TIMEOUT_SECONDS,
    isOnline: false,
  },
  historyListener: {
    path: `/${BENCH_HISTORY_PATH}`,
    status: 'idle',
    benchPointsCount: 0,
    legacyPointsCount: 0,
    lastError: null,
  },
  lastProbeAt: null,
});

let benchDiagnosticsState: BenchTelemetryDiagnostics = createInitialBenchDiagnostics();
const benchDiagnosticsSubscribers = new Set<(diag: BenchTelemetryDiagnostics) => void>();

function notifyBenchDiagnostics(): void {
  const snapshot = getBenchDiagnosticSnapshot();
  benchDiagnosticsSubscribers.forEach((cb) => {
    try {
      cb(snapshot);
    } catch {
      // ignore subscriber callback error
    }
  });
}

function updateBenchDiagnostics(
  patch: Partial<
    Omit<
      BenchTelemetryDiagnostics,
      'auth' | 'devicesListener' | 'benchListener' | 'mergeDecision' | 'historyListener'
    >
  > & {
    auth?: Partial<BenchTelemetryDiagnostics['auth']>;
    devicesListener?: Partial<BenchTelemetryDiagnostics['devicesListener']>;
    benchListener?: Partial<BenchTelemetryDiagnostics['benchListener']>;
    mergeDecision?: Partial<BenchTelemetryDiagnostics['mergeDecision']>;
    historyListener?: Partial<BenchTelemetryDiagnostics['historyListener']>;
  }
): void {
  benchDiagnosticsState = {
    ...benchDiagnosticsState,
    ...patch,
    auth: patch.auth ? { ...benchDiagnosticsState.auth, ...patch.auth } : benchDiagnosticsState.auth,
    devicesListener: patch.devicesListener
      ? { ...benchDiagnosticsState.devicesListener, ...patch.devicesListener }
      : benchDiagnosticsState.devicesListener,
    benchListener: patch.benchListener
      ? { ...benchDiagnosticsState.benchListener, ...patch.benchListener }
      : benchDiagnosticsState.benchListener,
    mergeDecision: patch.mergeDecision
      ? { ...benchDiagnosticsState.mergeDecision, ...patch.mergeDecision }
      : benchDiagnosticsState.mergeDecision,
    historyListener: patch.historyListener
      ? { ...benchDiagnosticsState.historyListener, ...patch.historyListener }
      : benchDiagnosticsState.historyListener,
  };
  notifyBenchDiagnostics();
}

export function syncAuthStateIntoBenchDiagnostics(fbUser?: FirebaseUser | null): void {
  const active = fbUser !== undefined ? fbUser : auth.currentUser;
  updateBenchDiagnostics({
    auth: {
      authenticated: Boolean(active),
      uid: active?.uid || null,
      email: active?.email || null,
      emailVerified: Boolean(active?.emailVerified),
      providerId: active?.providerData?.[0]?.providerId || active?.providerId || null,
    },
  });
}

export function getBenchDiagnosticSnapshot(): BenchTelemetryDiagnostics {
  return {
    ...benchDiagnosticsState,
    auth: { ...benchDiagnosticsState.auth },
    devicesListener: { ...benchDiagnosticsState.devicesListener },
    benchListener: {
      ...benchDiagnosticsState.benchListener,
      rawPayload: benchDiagnosticsState.benchListener.rawPayload
        ? { ...benchDiagnosticsState.benchListener.rawPayload }
        : null,
    },
    mergeDecision: { ...benchDiagnosticsState.mergeDecision },
    historyListener: { ...benchDiagnosticsState.historyListener },
  };
}

export function subscribeToBenchDiagnostics(
  callback: (diag: BenchTelemetryDiagnostics) => void
): () => void {
  syncAuthStateIntoBenchDiagnostics();
  benchDiagnosticsSubscribers.add(callback);
  callback(getBenchDiagnosticSnapshot());
  return () => {
    benchDiagnosticsSubscribers.delete(callback);
  };
}

export function resetBenchDiagnosticsForTesting(): void {
  benchDiagnosticsState = createInitialBenchDiagnostics();
  rtdbServerTimeOffsetMs = 0;
}

export function recordBenchListenerErrorForDiagnostics(err: any): void {
  const code = err?.code ? String(err.code) : null;
  const message = err?.message ? String(err.message) : String(err || 'Error desconocido en RTDB');
  updateBenchDiagnostics({
    benchListener: {
      status: 'error',
      lastEventAt: Date.now(),
      error: message,
      errorCode: code,
    },
  });
}

/**
 * Ejecuta una sonda diagnóstica exclusiva para SuperAdmin contra Firebase Auth y RTDB,
 * exponiendo errores reales de permisos, verificación de correo y payloads sin debilitar reglas.
 */
export async function runSuperAdminBenchProbe(
  actingUser?: UserProfile | null
): Promise<BenchTelemetryDiagnostics> {
  if (actingUser && actingUser.role !== 'superadmin') {
    return getBenchDiagnosticSnapshot();
  }
  const fbUser = auth.currentUser;
  syncAuthStateIntoBenchDiagnostics(fbUser);

  if (fbUser?.uid) {
    try {
      const userSnap = await get(ref(rtdb, `usuarios/${fbUser.uid}`));
      if (userSnap.exists()) {
        const val = userSnap.val() || {};
        updateBenchDiagnostics({
          auth: {
            profileNodeExists: true,
            profileIsActive: val.isActive !== false,
            profileRole: String(val.tipoUsuario || (val.isSuperUser ? 'superadmin' : 'sin_rol')),
            profileIsSuperUser: val.isSuperUser === true,
            profileReadError: null,
          },
        });
      } else {
        updateBenchDiagnostics({
          auth: {
            profileNodeExists: false,
            profileIsActive: null,
            profileRole: null,
            profileIsSuperUser: null,
            profileReadError: `No existe /usuarios/${fbUser.uid} en RTDB. Si email_verified es false, database.rules.json rechazará las lecturas.`,
          },
        });
      }
    } catch (err: any) {
      updateBenchDiagnostics({
        auth: {
          profileNodeExists: null,
          profileReadError: err?.message || String(err || 'Error leyendo /usuarios/{uid}'),
        },
      });
    }
  }

  let probedPhysical: Record<string, any> | null = null;
  try {
    const devSnap = await get(ref(rtdb, `dispositivos/${PHYSICAL_NODE_DEVICE_ID}`));
    probedPhysical = devSnap.exists() ? devSnap.val() || null : null;
    const rawTs = normalizeServerTimestampMs(
      probedPhysical?.last_update_server ??
        probedPhysical?.timestamp_server ??
        probedPhysical?.timestamp_unix
    );
    updateBenchDiagnostics({
      devicesListener: {
        status: 'ok',
        lastEventAt: Date.now(),
        physicalNodeExists: Boolean(probedPhysical),
        physicalNodeRawTs: rawTs,
        physicalNodeRawPM25:
          typeof probedPhysical?.PM2_5 === 'number'
            ? probedPhysical.PM2_5
            : typeof probedPhysical?.pm25 === 'number'
            ? probedPhysical.pm25
            : null,
        error: null,
      },
    });
  } catch (err: any) {
    updateBenchDiagnostics({
      devicesListener: {
        status: 'error',
        lastEventAt: Date.now(),
        error: err?.message || String(err || 'Error leyendo /dispositivos/device_38A839E81F84'),
      },
    });
  }

  let probedBench: Record<string, any> | null = null;
  try {
    const benchSnap = await get(ref(rtdb, BENCH_TELEMETRY_PATH));
    probedBench = benchSnap.exists() ? benchSnap.val() || null : null;
    const benchTs = normalizeServerTimestampMs(
      probedBench?.last_update_server ??
        probedBench?.timestamp_server ??
        probedBench?.timestamp_unix
    );
    updateBenchDiagnostics({
      benchListener: {
        status: probedBench ? 'ok' : 'empty',
        lastEventAt: Date.now(),
        error: null,
        errorCode: null,
        normalizedServerTs: benchTs,
        rawPayload: probedBench
          ? {
              CO: probedBench.CO ?? probedBench.co,
              PM2_5: probedBench.PM2_5 ?? probedBench.pm25,
              temperatura: probedBench.temperatura ?? probedBench.temp,
              humedad: probedBench.humedad ?? probedBench.hum,
              last_update_server: probedBench.last_update_server,
              origen: probedBench.origen,
              simulado: probedBench.simulado,
              hasHistorial: Boolean(probedBench.historial && typeof probedBench.historial === 'object'),
            }
          : null,
      },
    });
  } catch (err: any) {
    recordBenchListenerErrorForDiagnostics(err);
  }

  try {
    const histSnap = await get(query(ref(rtdb, BENCH_HISTORY_PATH), limitToLast(10)));
    const count = histSnap.exists() ? Object.keys(histSnap.val() || {}).length : 0;
    updateBenchDiagnostics({
      historyListener: {
        status: count > 0 ? 'ok' : 'empty',
        benchPointsCount: count,
        lastError: null,
      },
    });
  } catch (err: any) {
    updateBenchDiagnostics({
      historyListener: {
        status: 'error',
        lastError: err?.message || String(err || `Error leyendo /${BENCH_HISTORY_PATH}`),
      },
    });
  }

  // Recalcular decisión de fusión con los payloads sondeados
  mergeBenchTelemetryIntoPhysicalNode(
    probedPhysical ? { [PHYSICAL_NODE_DEVICE_ID]: probedPhysical } : {},
    probedBench,
    true
  );

  updateBenchDiagnostics({ lastProbeAt: Date.now() });
  return getBenchDiagnosticSnapshot();
}

export function normalizeServerTimestampMs(rawTs: unknown): number {
  const num =
    typeof rawTs === 'number'
      ? rawTs
      : typeof rawTs === 'string' && rawTs.trim() !== ''
      ? Number(rawTs)
      : NaN;
  if (!Number.isFinite(num) || num <= 0) return 0;
  // Epoch Unix en segundos (10 dígitos, >= año 2001)
  if (num >= 1_000_000_000 && num < 100_000_000_000) {
    return Math.round(num * 1000);
  }
  // Epoch Unix en milisegundos (>= 12 dígitos)
  if (num >= 100_000_000_000) {
    return Math.round(num);
  }
  return 0;
}

export interface DeviceConnectivityEvaluation {
  isOnline: boolean;
  isStale: boolean;
  diffSeconds: number;
  timeoutSeconds: number;
}

export function evaluateDeviceConnectivity(
  serverTimeMs: number,
  timeoutSeconds: number = DEFAULT_DEVICE_TIMEOUT_SECONDS,
  nowMs: number = getEstimatedServerNowMs()
): DeviceConnectivityEvaluation {
  const effectiveTimeout = Math.max(5, Number(timeoutSeconds) || DEFAULT_DEVICE_TIMEOUT_SECONDS);
  if (!Number.isFinite(serverTimeMs) || serverTimeMs <= 0) {
    return {
      isOnline: false,
      isStale: true,
      diffSeconds: 999999,
      timeoutSeconds: effectiveTimeout,
    };
  }
  const deltaMs = nowMs - serverTimeMs;
  const diffSeconds = Math.max(0, Math.floor(Math.abs(deltaMs) / 1000));
  // Tolerar pequeño desfase NTP de hasta 60s hacia el futuro; expirar estrictamente tras timeoutSeconds.
  const isOnline = deltaMs >= -60_000 && deltaMs <= effectiveTimeout * 1000;
  return {
    isOnline,
    isStale: !isOnline,
    diffSeconds,
    timeoutSeconds: effectiveTimeout,
  };
}

export function classifyCommunicationLink(
  device: Pick<
    SensorDevice,
    'via' | 'viaPuente' | 'gatewayId' | 'saltosEspNow' | 'gatewayOnline' | 'status'
  >,
  isOnlineOverride?: boolean
): CommunicationLinkMode {
  const online =
    typeof isOnlineOverride === 'boolean'
      ? isOnlineOverride
      : Boolean(device.gatewayOnline && device.status !== 'desconectado');
  if (!online) {
    return 'desconectado';
  }
  const viaStr = String(device.via || '').toUpperCase().trim();
  const viaPuenteActive =
    device.viaPuente === true ||
    (typeof device.viaPuente === 'string' &&
      device.viaPuente.trim() !== '' &&
      device.viaPuente.trim().toLowerCase() !== 'false' &&
      device.viaPuente.trim() !== '0');
  const hasEspNowSignals =
    viaPuenteActive ||
    viaStr.includes('ESP_NOW') ||
    viaStr.includes('ESPNOW') ||
    viaStr.includes('GATEWAY') ||
    viaStr.includes('PUENTE') ||
    Boolean(device.gatewayId && String(device.gatewayId).trim() !== '') ||
    (typeof device.saltosEspNow === 'number' && device.saltosEspNow > 0);
  if (hasEspNowSignals) {
    return 'espnow_gateway';
  }
  if (
    viaStr.includes('WIFI') ||
    viaStr.includes('DIRECT') ||
    viaStr.includes('FIREBASE') ||
    viaStr.includes('HTTP')
  ) {
    return 'wifi_directo';
  }
  return 'origen_desconocido';
}

export function hasBenchTelemetryFields(benchRaw: unknown): benchRaw is Record<string, any> {
  if (!benchRaw || typeof benchRaw !== 'object') return false;
  const obj = benchRaw as Record<string, any>;
  return (
    obj.CO !== undefined ||
    obj.co !== undefined ||
    obj.PM2_5 !== undefined ||
    obj.pm25 !== undefined ||
    obj.temperatura !== undefined ||
    obj.temp !== undefined ||
    obj.humedad !== undefined ||
    obj.hum !== undefined ||
    obj.last_update_server !== undefined ||
    obj.timestamp_unix !== undefined ||
    obj.origen !== undefined ||
    obj.simulado !== undefined
  );
}

/**
 * Fusiona la telemetría en vivo de `/diagnostico/esp32_p087` sobre el nodo físico
 * existente `device_38A839E81F84` sin duplicar dispositivos ni sobrescribir metadatos
 * organizacionales, contratos, faena, sector ni asignaciones.
 * Garantiza que lecturas antiguas o con reloj corrupto de `/dispositivos` nunca
 * sobrescriban lecturas vigentes de `/diagnostico/esp32_p087`.
 */
export function mergeBenchTelemetryIntoPhysicalNode(
  rawDevices: Record<string, any>,
  benchRaw: Record<string, any> | null | undefined,
  allowMaterializeIfMissing: boolean = false,
  nowMs: number = getEstimatedServerNowMs(),
  timeoutSeconds: number = DEFAULT_DEVICE_TIMEOUT_SECONDS
): Record<string, any> {
  const merged: Record<string, any> = { ...(rawDevices || {}) };
  // P094: Nunca fusionar ni arrastrar el equipo experimental V2 dentro del mapa operacional ni sobre el ID original.
  if (Object.prototype.hasOwnProperty.call(merged, EXPERIMENTAL_BENCH_V2_DEVICE_ID)) {
    delete merged[EXPERIMENTAL_BENCH_V2_DEVICE_ID];
  }
  const hasExistingPhysical = Object.prototype.hasOwnProperty.call(
    merged,
    PHYSICAL_NODE_DEVICE_ID
  );
  const existingPhysical = hasExistingPhysical
    ? { ...(merged[PHYSICAL_NODE_DEVICE_ID] || {}) }
    : {};
  const existingTs = normalizeServerTimestampMs(
    existingPhysical.last_update_server ??
      existingPhysical.timestamp_server ??
      existingPhysical.timestamp_unix
  );

  if (!hasBenchTelemetryFields(benchRaw)) {
    const fallbackConn = evaluateDeviceConnectivity(existingTs, timeoutSeconds, nowMs);
    updateBenchDiagnostics({
      mergeDecision: {
        applied: false,
        reason: 'Sin payload de telemetría disponible en /diagnostico/esp32_p087',
        existingPhysicalTs: existingTs,
        benchTs: 0,
        effectiveTs: existingTs,
        serverNowMs: nowMs,
        diffSeconds: fallbackConn.diffSeconds,
        timeoutSeconds: fallbackConn.timeoutSeconds,
        isOnline: fallbackConn.isOnline,
      },
    });
    return merged;
  }

  if (!hasExistingPhysical && !allowMaterializeIfMissing) {
    updateBenchDiagnostics({
      mergeDecision: {
        applied: false,
        reason: 'Nodo device_38A839E81F84 fuera del alcance autorizado de esta organización',
        existingPhysicalTs: 0,
        benchTs: normalizeServerTimestampMs(
          benchRaw.last_update_server ?? benchRaw.timestamp_server ?? benchRaw.timestamp_unix
        ),
        effectiveTs: 0,
        serverNowMs: nowMs,
        diffSeconds: 999999,
        timeoutSeconds,
        isOnline: false,
      },
    });
    return merged;
  }

  const benchTs = normalizeServerTimestampMs(
    benchRaw.last_update_server ?? benchRaw.timestamp_server ?? benchRaw.timestamp_unix
  );

  // Verificar si /dispositivos/device_38A839E81F84 tiene una marca temporal estrictamente más nueva
  // y válida (no adelantada artificialmente al futuro por reloj local corrupto).
  const existingIsValidNonFuture = existingTs > 0 && existingTs <= nowMs + 60_000;
  const benchConn = evaluateDeviceConnectivity(benchTs, timeoutSeconds, nowMs);
  const existingConn = evaluateDeviceConnectivity(existingTs, timeoutSeconds, nowMs);

  if (
    existingIsValidNonFuture &&
    benchTs > 0 &&
    existingTs > benchTs &&
    (existingConn.isOnline || !benchConn.isOnline)
  ) {
    updateBenchDiagnostics({
      mergeDecision: {
        applied: false,
        reason: `/dispositivos/${PHYSICAL_NODE_DEVICE_ID} posee una lectura más reciente y válida (${existingTs} > ${benchTs})`,
        existingPhysicalTs: existingTs,
        benchTs,
        effectiveTs: existingTs,
        serverNowMs: nowMs,
        diffSeconds: existingConn.diffSeconds,
        timeoutSeconds: existingConn.timeoutSeconds,
        isOnline: existingConn.isOnline,
      },
    });
    return merged;
  }

  const telemetryOverlay: Record<string, any> = {
    ...existingPhysical,
    _isBenchTelemetry: true,
    _sourcePath: `/${BENCH_TELEMETRY_PATH}`,
    _benchHistoryPath: `/${BENCH_HISTORY_PATH}`,
  };

  if (benchRaw.CO !== undefined || benchRaw.co !== undefined) {
    telemetryOverlay.CO = benchRaw.CO !== undefined ? benchRaw.CO : benchRaw.co;
  }
  if (benchRaw.PM2_5 !== undefined || benchRaw.pm25 !== undefined) {
    telemetryOverlay.PM2_5 = benchRaw.PM2_5 !== undefined ? benchRaw.PM2_5 : benchRaw.pm25;
  }
  if (benchRaw.temperatura !== undefined || benchRaw.temp !== undefined) {
    telemetryOverlay.temperatura =
      benchRaw.temperatura !== undefined ? benchRaw.temperatura : benchRaw.temp;
  }
  if (benchRaw.humedad !== undefined || benchRaw.hum !== undefined) {
    telemetryOverlay.humedad =
      benchRaw.humedad !== undefined ? benchRaw.humedad : benchRaw.hum;
  }
  if (benchRaw.simulado !== undefined) {
    telemetryOverlay.simulado = Boolean(benchRaw.simulado);
  } else if (telemetryOverlay.simulado === undefined) {
    telemetryOverlay.simulado = false;
  }
  if (typeof benchRaw.origen === 'string' && benchRaw.origen.trim() !== '') {
    telemetryOverlay.origen = benchRaw.origen.trim();
  }
  if (benchTs > 0) {
    telemetryOverlay.last_update_server = benchTs;
  } else if (benchRaw.last_update_server !== undefined) {
    telemetryOverlay.last_update_server = benchRaw.last_update_server;
  } else if (benchRaw.timestamp_unix !== undefined) {
    telemetryOverlay.last_update_server = benchRaw.timestamp_unix;
  }
  if (benchRaw.via !== undefined) telemetryOverlay.via = benchRaw.via;
  if (benchRaw.via_puente !== undefined) telemetryOverlay.via_puente = Boolean(benchRaw.via_puente);
  if (benchRaw.gateway_id !== undefined) telemetryOverlay.gateway_id = benchRaw.gateway_id;
  if (benchRaw.saltos_espnow !== undefined) telemetryOverlay.saltos_espnow = benchRaw.saltos_espnow;
  if (benchRaw.msgId !== undefined) telemetryOverlay.msgId = benchRaw.msgId;
  if (benchRaw.fecha !== undefined) telemetryOverlay.fecha = benchRaw.fecha;
  if (benchRaw.hora !== undefined) telemetryOverlay.hora = benchRaw.hora;
  if (benchRaw.fecha_hora !== undefined) telemetryOverlay.fecha_hora = benchRaw.fecha_hora;
  if (benchRaw.timestamp_unix !== undefined) telemetryOverlay.timestamp_unix = benchRaw.timestamp_unix;

  merged[PHYSICAL_NODE_DEVICE_ID] = telemetryOverlay;
  updateBenchDiagnostics({
    mergeDecision: {
      applied: true,
      reason:
        existingTs > 0 && !existingIsValidNonFuture
          ? 'Telemetría de banco aplicada (marca previa en /dispositivos descartada por desfase futuro)'
          : `Telemetría de /${BENCH_TELEMETRY_PATH} fusionada sobre ${PHYSICAL_NODE_DEVICE_ID}`,
      existingPhysicalTs: existingTs,
      benchTs,
      effectiveTs: benchTs || existingTs,
      serverNowMs: nowMs,
      diffSeconds: benchConn.diffSeconds,
      timeoutSeconds: benchConn.timeoutSeconds,
      isOnline: benchConn.isOnline,
    },
  });
  return merged;
}

export function hasMultiNodePayload(raw: unknown): raw is Record<string, any> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const obj = raw as Record<string, any>;
  return (
    obj.CO !== undefined ||
    obj.co !== undefined ||
    obj.PM2_5 !== undefined ||
    obj.pm25 !== undefined ||
    obj.temperatura !== undefined ||
    obj.temp !== undefined ||
    obj.humedad !== undefined ||
    obj.hum !== undefined ||
    obj.last_update_server !== undefined ||
    obj.timestamp_server !== undefined ||
    obj.timestamp_unix !== undefined ||
    obj.msgId !== undefined ||
    obj.gateway_id !== undefined ||
    obj.via_puente !== undefined ||
    obj.simulado !== undefined ||
    obj.modo_banco !== undefined ||
    obj.historial !== undefined ||
    obj.origen !== undefined ||
    obj.via !== undefined ||
    obj.nodos_activos !== undefined ||
    obj.localIp !== undefined ||
    obj.ip !== undefined ||
    obj.estado !== undefined
  );
}

export function extractEmbeddedDeviceHistory(
  rawNode: any,
  startMs: number = 0,
  endMs: number = Number.MAX_SAFE_INTEGER,
  source: TelemetryHistoryPoint['source'] = 'diagnostico_nodos_simulados'
): TelemetryHistoryPoint[] {
  if (!rawNode || typeof rawNode !== 'object') return [];
  const hist = rawNode.historial;
  if (!hist || typeof hist !== 'object') return [];
  return mapTelemetrySnapshotRaw(hist, startMs, endMs, source);
}

export interface MergeMultiNodeOptions {
  allowSimulatedDiscovery?: boolean;
  allowedDeviceIds?: Set<string> | string[];
  nowMs?: number;
  timeoutSeconds?: number;
}

/**
 * Fusiona los dispositivos detectados dinámicamente desde `/diagnostico/nodos_simulados`
 * (`device_SIM_01`..`device_SIM_10`) y `/diagnostico/gateway_ESP32_DEVKIT_V1` con `/dispositivos`
 * sin duplicar identificadores, sin inventar nodos ni valores y sin sobrescribir asignaciones
 * ni el nodo físico operativo `device_38A839E81F84`.
 */
export function mergeMultiNodeSimulatedDevices(
  rawDevices: Record<string, any>,
  simulatedNodesRaw: Record<string, any> | null | undefined,
  gatewayDiagRaw: Record<string, any> | null | undefined,
  options?: MergeMultiNodeOptions
): Record<string, any> {
  const merged: Record<string, any> = { ...(rawDevices || {}) };
  if (Object.prototype.hasOwnProperty.call(merged, EXPERIMENTAL_BENCH_V2_DEVICE_ID)) {
    delete merged[EXPERIMENTAL_BENCH_V2_DEVICE_ID];
  }

  const allowDiscovery = options?.allowSimulatedDiscovery !== false;
  const allowedSet = new Set<string>(
    options?.allowedDeviceIds instanceof Set
      ? Array.from(options.allowedDeviceIds)
      : Array.isArray(options?.allowedDeviceIds)
      ? options.allowedDeviceIds
      : []
  );
  const nowMs = options?.nowMs ?? getEstimatedServerNowMs();
  const timeoutSeconds = options?.timeoutSeconds ?? DEFAULT_DEVICE_TIMEOUT_SECONDS;

  const hasValidGatewayDiag = hasMultiNodePayload(gatewayDiagRaw);

  // 1. Fusionar /diagnostico/gateway_ESP32_DEVKIT_V1 sin duplicar el gateway ni pisar asignaciones
  if (hasValidGatewayDiag) {
    const canIncludeGateway =
      allowDiscovery ||
      Object.prototype.hasOwnProperty.call(merged, GATEWAY_DEVICE_ID) ||
      allowedSet.has(GATEWAY_DEVICE_ID);

    if (canIncludeGateway) {
      const existingGw = merged[GATEWAY_DEVICE_ID] && typeof merged[GATEWAY_DEVICE_ID] === 'object'
        ? { ...merged[GATEWAY_DEVICE_ID] }
        : null;
      const existingTs = normalizeServerTimestampMs(
        existingGw?.last_update_server ?? existingGw?.timestamp_server ?? existingGw?.timestamp_unix
      );
      const diagTs = normalizeServerTimestampMs(
        gatewayDiagRaw.last_update_server ??
          gatewayDiagRaw.timestamp_server ??
          gatewayDiagRaw.timestamp_unix
      );
      const existingValidNonFuture = existingTs > 0 && existingTs <= nowMs + 60_000;
      const diagConn = evaluateDeviceConnectivity(diagTs, timeoutSeconds, nowMs);
      const existingConn = evaluateDeviceConnectivity(existingTs, timeoutSeconds, nowMs);
      const useDiagTelemetry =
        !existingGw ||
        !existingValidNonFuture ||
        (diagTs > 0 && (diagTs >= existingTs || (diagConn.isOnline && !existingConn.isOnline)));

      const mergedGw: Record<string, any> = {
        ...(existingGw || {}),
        deviceCategory: existingGw?.deviceCategory || 'gateway',
        _sourcePath:
          existingGw?._sourcePath ||
          (existingGw ? `/dispositivos/${GATEWAY_DEVICE_ID}` : `/${MULTINODE_GATEWAY_DIAG_PATH}`),
      };

      if (!existingGw && !mergedGw.organizationId) {
        mergedGw.organizationId = UNASSIGNED_DEVICE_ORG_ID;
        mergedGw.assignmentStatus = 'en_inventario';
      }

      if (useDiagTelemetry) {
        if (diagTs > 0) mergedGw.last_update_server = diagTs;
        else if (gatewayDiagRaw.last_update_server !== undefined) {
          mergedGw.last_update_server = gatewayDiagRaw.last_update_server;
        }
        if (gatewayDiagRaw.CO !== undefined || gatewayDiagRaw.co !== undefined) {
          mergedGw.CO = gatewayDiagRaw.CO !== undefined ? gatewayDiagRaw.CO : gatewayDiagRaw.co;
        }
        if (gatewayDiagRaw.PM2_5 !== undefined || gatewayDiagRaw.pm25 !== undefined) {
          mergedGw.PM2_5 =
            gatewayDiagRaw.PM2_5 !== undefined ? gatewayDiagRaw.PM2_5 : gatewayDiagRaw.pm25;
        }
        if (gatewayDiagRaw.temperatura !== undefined || gatewayDiagRaw.temp !== undefined) {
          mergedGw.temperatura =
            gatewayDiagRaw.temperatura !== undefined
              ? gatewayDiagRaw.temperatura
              : gatewayDiagRaw.temp;
        }
        if (gatewayDiagRaw.humedad !== undefined || gatewayDiagRaw.hum !== undefined) {
          mergedGw.humedad =
            gatewayDiagRaw.humedad !== undefined ? gatewayDiagRaw.humedad : gatewayDiagRaw.hum;
        }
        if (gatewayDiagRaw.msgId !== undefined) mergedGw.msgId = gatewayDiagRaw.msgId;
        if (gatewayDiagRaw.via !== undefined) mergedGw.via = gatewayDiagRaw.via;
        if (gatewayDiagRaw.via_puente !== undefined) mergedGw.via_puente = gatewayDiagRaw.via_puente;
        if (gatewayDiagRaw.origen !== undefined) mergedGw.origen = gatewayDiagRaw.origen;
        if (gatewayDiagRaw.fecha !== undefined) mergedGw.fecha = gatewayDiagRaw.fecha;
        if (gatewayDiagRaw.hora !== undefined) mergedGw.hora = gatewayDiagRaw.hora;
        if (gatewayDiagRaw.fecha_hora !== undefined) mergedGw.fecha_hora = gatewayDiagRaw.fecha_hora;
        if (gatewayDiagRaw.historial && typeof gatewayDiagRaw.historial === 'object') {
          mergedGw.historial = {
            ...(existingGw?.historial && typeof existingGw.historial === 'object'
              ? existingGw.historial
              : {}),
            ...gatewayDiagRaw.historial,
          };
        }
      }

      if (gatewayDiagRaw.localIp !== undefined || gatewayDiagRaw.ip !== undefined) {
        mergedGw.localIp = gatewayDiagRaw.localIp || gatewayDiagRaw.ip || mergedGw.localIp;
      }
      if (typeof gatewayDiagRaw.nodos_activos === 'number') {
        mergedGw.nodos_activos = gatewayDiagRaw.nodos_activos;
      }
      if (gatewayDiagRaw.simulado !== undefined) {
        mergedGw.simulado = Boolean(gatewayDiagRaw.simulado);
      }
      if (gatewayDiagRaw.modo_banco !== undefined) {
        mergedGw.modo_banco = Boolean(gatewayDiagRaw.modo_banco);
      }
      if (!mergedGw.origen) {
        mergedGw.origen = 'GATEWAY_ESP32_DIAGNOSTICO';
      }

      merged[GATEWAY_DEVICE_ID] = mergedGw;
    }
  }

  // 2. Fusionar /diagnostico/nodos_simulados (device_SIM_01..device_SIM_10 o nodos virtuales reales en RTDB)
  if (simulatedNodesRaw && typeof simulatedNodesRaw === 'object' && !Array.isArray(simulatedNodesRaw)) {
    Object.entries(simulatedNodesRaw).forEach(([nodeId, rawNode]) => {
      if (!nodeId || isExperimentalBenchDeviceId(nodeId) || nodeId === PHYSICAL_NODE_DEVICE_ID) {
        return;
      }
      if (!hasMultiNodePayload(rawNode)) {
        return;
      }
      const alreadyInMerged = Object.prototype.hasOwnProperty.call(merged, nodeId);
      const canIncludeNode = allowDiscovery || alreadyInMerged || allowedSet.has(nodeId);
      if (!canIncludeNode) {
        return;
      }

      const existing = alreadyInMerged && merged[nodeId] && typeof merged[nodeId] === 'object'
        ? { ...merged[nodeId] }
        : null;

      const existingTs = normalizeServerTimestampMs(
        existing?.last_update_server ?? existing?.timestamp_server ?? existing?.timestamp_unix
      );
      const simTs = normalizeServerTimestampMs(
        rawNode.last_update_server ?? rawNode.timestamp_server ?? rawNode.timestamp_unix
      );
      const existingValidNonFuture = existingTs > 0 && existingTs <= nowMs + 60_000;
      const simConn = evaluateDeviceConnectivity(simTs, timeoutSeconds, nowMs);
      const existingConn = evaluateDeviceConnectivity(existingTs, timeoutSeconds, nowMs);
      const useSimTelemetry =
        !existing ||
        !existingValidNonFuture ||
        (simTs > 0 && (simTs >= existingTs || (simConn.isOnline && !existingConn.isOnline)));

      const combined: Record<string, any> = {
        ...(existing || {}),
        simulado: rawNode.simulado !== undefined ? Boolean(rawNode.simulado) : true,
        modo_banco:
          rawNode.modo_banco !== undefined
            ? Boolean(rawNode.modo_banco)
            : existing?.modo_banco !== undefined
            ? Boolean(existing.modo_banco)
            : true,
        deviceCategory: existing?.deviceCategory || 'nodo',
        _sourcePath: `/${MULTINODE_SIMULATED_NODES_PATH}/${nodeId}`,
        _historyPath: `/${MULTINODE_SIMULATED_NODES_PATH}/${nodeId}/historial`,
      };

      // Nunca sobrescribir asignaciones existentes; solo inicializar en inventario si no tenía organización.
      if (!combined.organizationId) {
        combined.organizationId = UNASSIGNED_DEVICE_ORG_ID;
      }
      if (!combined.assignmentStatus && isUnassignedDeviceOrg(combined.organizationId)) {
        combined.assignmentStatus = 'en_inventario';
      }

      if (useSimTelemetry) {
        if (rawNode.CO !== undefined || rawNode.co !== undefined) {
          combined.CO = rawNode.CO !== undefined ? rawNode.CO : rawNode.co;
        }
        if (rawNode.PM2_5 !== undefined || rawNode.pm25 !== undefined) {
          combined.PM2_5 = rawNode.PM2_5 !== undefined ? rawNode.PM2_5 : rawNode.pm25;
        }
        if (rawNode.temperatura !== undefined || rawNode.temp !== undefined) {
          combined.temperatura =
            rawNode.temperatura !== undefined ? rawNode.temperatura : rawNode.temp;
        }
        if (rawNode.humedad !== undefined || rawNode.hum !== undefined) {
          combined.humedad = rawNode.humedad !== undefined ? rawNode.humedad : rawNode.hum;
        }
        if (simTs > 0) {
          combined.last_update_server = simTs;
        } else if (rawNode.last_update_server !== undefined) {
          combined.last_update_server = rawNode.last_update_server;
        } else if (rawNode.timestamp_unix !== undefined) {
          combined.last_update_server = rawNode.timestamp_unix;
        }
        if (rawNode.msgId !== undefined) combined.msgId = rawNode.msgId;
        if (rawNode.gateway_id !== undefined) combined.gateway_id = rawNode.gateway_id;
        if (rawNode.via_puente !== undefined) combined.via_puente = rawNode.via_puente;
        if (rawNode.via !== undefined) combined.via = rawNode.via;
        if (rawNode.saltos_espnow !== undefined) combined.saltos_espnow = rawNode.saltos_espnow;
        if (rawNode.fecha !== undefined) combined.fecha = rawNode.fecha;
        if (rawNode.hora !== undefined) combined.hora = rawNode.hora;
        if (rawNode.fecha_hora !== undefined) combined.fecha_hora = rawNode.fecha_hora;
        if (rawNode.timestamp_unix !== undefined) combined.timestamp_unix = rawNode.timestamp_unix;
      }

      if (!combined.gateway_id && hasValidGatewayDiag) {
        combined.gateway_id = GATEWAY_DEVICE_ID;
      }
      if (!combined.parentGatewayId && typeof combined.gateway_id === 'string' && combined.gateway_id.trim()) {
        combined.parentGatewayId = combined.gateway_id.trim();
      }
      if (typeof rawNode.origen === 'string' && rawNode.origen.trim() !== '') {
        combined.origen = rawNode.origen.trim();
      } else if (!combined.origen) {
        combined.origen = 'ESP32_MULTINODE_V2_SIMULADO';
      }

      // Conservar historial embebido combinado (sin eliminar muestras al desconectarse)
      if (rawNode.historial && typeof rawNode.historial === 'object') {
        combined.historial = {
          ...(existing?.historial && typeof existing.historial === 'object' ? existing.historial : {}),
          ...rawNode.historial,
        };
      }

      // Garantizar aislamiento de alarmas en dispositivos simulados
      combined.alarma_activa = false;
      combined.alarma = false;

      merged[nodeId] = combined;
    });
  }

  return merged;
}

export function buildCatalogRegistrationForDiscoveredDevice(
  device: Pick<
    SensorDevice,
    | 'id'
    | 'name'
    | 'deviceCategory'
    | 'gatewayId'
    | 'parentGatewayId'
    | 'localIp'
    | 'isSimulated'
    | 'simulado'
    | 'modoBanco'
    | 'isBenchTelemetry'
    | 'sourcePath'
    | 'telemetryOrigin'
  >
): RegisterIoTDeviceParams {
  const isGateway =
    device.deviceCategory === 'gateway' ||
    device.deviceCategory === 'gateway_sensor' ||
    device.id === GATEWAY_DEVICE_ID ||
    /^gateway_/i.test(device.id);
  const category: 'gateway' | 'nodo' = isGateway ? 'gateway' : 'nodo';
  const simulated = isSimulatedDevice(device);
  const modoBanco = simulated || device.modoBanco === true || device.isBenchTelemetry === true;

  return {
    id: device.id,
    name: device.name || device.id,
    category,
    parentGatewayId: category === 'nodo' ? device.gatewayId || device.parentGatewayId : undefined,
    localIp: device.localIp,
    organizationId: UNASSIGNED_DEVICE_ORG_ID,
    simulado: simulated ? true : undefined,
    modo_banco: modoBanco ? true : undefined,
    sourcePath: device.sourcePath,
    telemetryOrigin: device.telemetryOrigin,
    gatewayId: device.gatewayId || device.parentGatewayId,
    allowAttachExistingRTDB: true,
    note: simulated
      ? `Registro autorizado de dispositivo simulado MultiNode V2 (${device.id}) en inventario global sin asignación.`
      : `Registro autorizado de dispositivo detectado en Firebase RTDB (${device.id}) en inventario global.`,
  };
}

// -------------------------------------------------------------
// MAPPER UTILS FOR USER'S RTDB SCHEMA
// -------------------------------------------------------------
// Cache of live update reception times (used strictly for legacy uptime-only packets without Unix epoch)
const lastPacketArrivalMap: Record<string, number> = {};
const lastPacketSignatureMap: Record<string, string> = {};

export function recordDevicePacketArrival(key: string, data?: any) {
  if (!data || typeof data !== 'object') {
    return;
  }
  const signature = JSON.stringify([
    data.CO ?? data.co ?? null,
    data.PM2_5 ?? data.pm25 ?? null,
    data.temperatura ?? data.temp ?? null,
    data.humedad ?? data.hum ?? null,
    data.last_update_server ?? data.timestamp_server ?? data.timestamp_unix ?? null,
    data.msgId ?? null,
    data.via_puente ?? null,
    data.alarma_activa ?? data.alarma ?? null,
    data.luz ?? null,
    data.estado_adquisicion ?? null,
  ]);
  // En la primera lectura inicial solo memorizamos la firma sin fingir que llegó un paquete vivo.
  if (lastPacketSignatureMap[key] === undefined) {
    lastPacketSignatureMap[key] = signature;
    return;
  }
  if (lastPacketSignatureMap[key] !== signature) {
    lastPacketSignatureMap[key] = signature;
    lastPacketArrivalMap[key] = Date.now();
  }
}

function readStrictBoundedNum(
  primary: unknown,
  secondary: unknown,
  minVal: number,
  maxVal: number
): number | null {
  const candidate = primary !== undefined ? primary : secondary;
  let num: number | null = null;
  if (typeof candidate === 'number' && Number.isFinite(candidate)) {
    num = candidate;
  } else if (typeof candidate === 'string' && candidate.trim() !== '') {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed)) num = parsed;
  }
  if (num === null || num < minVal || num > maxVal) {
    return null;
  }
  return num;
}

export function mapRTDBDeviceToSensorDevice(
  key: string,
  data: any,
  timeoutSeconds: number = DEFAULT_DEVICE_TIMEOUT_SECONDS,
  nowMs: number = getEstimatedServerNowMs()
): SensorDevice {
  const isExperimentalV2 = isExperimentalBenchDeviceId(key);
  const coVal = readStrictBoundedNum(data?.CO, data?.co, 0, 4095);
  const pmVal = readStrictBoundedNum(data?.PM2_5, data?.pm25, 0, 4095);
  const parsedTempVal = readStrictBoundedNum(data?.temperatura, data?.temp, -40, 100);
  const parsedHumVal = readStrictBoundedNum(data?.humedad, data?.hum, 0, 100);
  // En equipo experimental V2, DHT ausente (null/NaN o par 0/0 sin sensor conectado) se clasifica estrictamente como N/D.
  const dhtPairZeroAbsent = isExperimentalV2 && parsedTempVal === 0 && parsedHumVal === 0;
  const tempVal = dhtPairZeroAbsent ? null : parsedTempVal;
  const humVal = dhtPairZeroAbsent ? null : parsedHumVal;

  const faultFields: ('CO' | 'PM2_5' | 'temperatura' | 'humedad')[] = [];
  if (coVal === null) faultFields.push('CO');
  if (pmVal === null) faultFields.push('PM2_5');
  if (tempVal === null) faultFields.push('temperatura');
  if (humVal === null) faultFields.push('humedad');
  const sensorFault = faultFields.length > 0;

  const effectiveTimeout = Math.max(5, Number(timeoutSeconds) || DEFAULT_DEVICE_TIMEOUT_SECONDS);
  const rawServerCandidate =
    data?.last_update_server ?? data?.timestamp_server ?? data?.timestamp_unix ?? 0;
  const rawServerNum = Number(rawServerCandidate) || 0;
  let serverTime = normalizeServerTimestampMs(rawServerCandidate);
  let isOnline = false;
  let diffSeconds = 999999;

  if (serverTime > 0) {
    // Conectividad estricta basada en marca temporal de servidor (nunca marcar en línea solo por existir en RTDB).
    const evalConn = evaluateDeviceConnectivity(serverTime, effectiveTimeout, nowMs);
    isOnline = evalConn.isOnline;
    diffSeconds = evalConn.diffSeconds;
  } else if (rawServerNum > 0 && rawServerNum < 1_000_000_000) {
    // Firmware heredado que envió millis() de uptime en lugar de época Unix:
    // solo se considera en línea si se observó una actualización real tras la carga inicial.
    const lastArrival = lastPacketArrivalMap[key] || 0;
    if (lastArrival > 0) {
      serverTime = lastArrival;
      const evalConn = evaluateDeviceConnectivity(lastArrival, effectiveTimeout, nowMs);
      isOnline = evalConn.isOnline;
      diffSeconds = evalConn.diffSeconds;
    }
  }

  const isMultiNodeSim =
    isMultiNodeSimulatedDeviceId(key) ||
    (typeof data?._sourcePath === 'string' &&
      data._sourcePath.includes(MULTINODE_SIMULATED_NODES_PATH));

  const telemetryOrigin =
    typeof data?.origen === 'string' && data.origen.trim() !== ''
      ? data.origen.trim()
      : isExperimentalV2
      ? 'EXPERIMENTAL_V2_BANCO'
      : isMultiNodeSim
      ? 'ESP32_MULTINODE_V2_SIMULADO'
      : undefined;
  const sourcePath = isExperimentalV2
    ? `/${EXPERIMENTAL_BENCH_V2_PATH}`
    : typeof data?._sourcePath === 'string' && data._sourcePath.trim() !== ''
    ? data._sourcePath.trim()
    : `/dispositivos/${key}`;
  const isBenchTelemetry =
    isExperimentalV2 ||
    Boolean(data?._isBenchTelemetry) ||
    sourcePath.includes(BENCH_TELEMETRY_PATH) ||
    Boolean(telemetryOrigin && /p087|banco|diagnostico|experimental/i.test(telemetryOrigin));
  const isSimulated =
    data?.simulado === true ||
    key === SIMULATED_NODE_DEVICE_ID ||
    isMultiNodeSim ||
    Boolean(telemetryOrigin && /simula/i.test(telemetryOrigin));
  const modoBanco =
    data?.modo_banco === true ||
    isExperimentalV2 ||
    (isMultiNodeSim && data?.modo_banco !== false);
  const adcSaturated = coVal === 4095 || pmVal === 4095;

  const isIsolatedFromOperationalAlarms =
    isBenchTelemetry || isExperimentalV2 || isSimulated || modoBanco;
  const alarmaActiva = isIsolatedFromOperationalAlarms ? false : Boolean(data?.alarma_activa);
  const origenAlarma = isIsolatedFromOperationalAlarms ? '' : data?.origen_alarma || '';
  const descripcionMonitoreo = data?.descripcion_monitoreo || '';

  let status: AlertSeverity = 'normal';
  if (!isOnline) {
    status = 'desconectado';
  } else if (isIsolatedFromOperationalAlarms) {
    // Telemetría simulada / de banco / experimental separada de alertas operacionales mineras.
    status = 'normal';
  } else if (
    alarmaActiva ||
    (coVal !== null && coVal < 4095 && coVal >= 500) ||
    (pmVal !== null && pmVal < 4095 && pmVal >= 150)
  ) {
    status = 'critico';
  } else if (
    (coVal !== null && coVal < 4095 && coVal >= 350) ||
    (pmVal !== null && pmVal < 4095 && pmVal >= 55)
  ) {
    status = 'advertencia';
  }

  const isDiscoveredDiagnosticGateway =
    key === GATEWAY_DEVICE_ID &&
    sourcePath.includes(MULTINODE_GATEWAY_DIAG_PATH) &&
    !data?.organizationId;

  const resolvedOrgId = isExperimentalV2
    ? UNASSIGNED_DEVICE_ORG_ID
    : data?.organizationId === UNASSIGNED_DEVICE_ORG_ID
    ? UNASSIGNED_DEVICE_ORG_ID
    : data?.organizationId
    ? String(data.organizationId)
    : isMultiNodeSim || isDiscoveredDiagnosticGateway
    ? UNASSIGNED_DEVICE_ORG_ID
    : DEFAULT_ORGANIZATION.id;

  let deviceName = data?.name || key;
  let siteName = data?.siteName || '';
  let crewName = data?.crewName || '';
  let sectorName =
    data?.sectorName ||
    (isUnassignedDeviceOrg(resolvedOrgId) ? 'En inventario' : 'Sector Operativo');

  if (isExperimentalV2) {
    deviceName = data?.name || 'Banco Experimental ESP32 V2 (Sin Asignación)';
    siteName = '';
    crewName = '';
    sectorName = 'Sin asignar (Banco Experimental)';
  } else if (isMultiNodeSim) {
    const simSuffix = key.replace(/^device_/i, '');
    deviceName = data?.name || `Nodo Simulado MultiNode (${simSuffix})`;
    siteName = data?.siteName || '';
    crewName = data?.crewName || '';
    sectorName =
      data?.sectorName ||
      (isUnassignedDeviceOrg(resolvedOrgId) ? 'En inventario' : 'Pendiente de asignación');
  } else if (key === PHYSICAL_NODE_DEVICE_ID) {
    deviceName = data?.name || 'Gateway Principal Mina Norte';
    siteName = data?.siteName || 'Faena Chuquicamata';
    crewName = data?.crewName || 'Cuadrilla Alfa';
    sectorName = data?.sectorName || 'Rampa Principal';
  } else if (key === SIMULATED_NODE_DEVICE_ID) {
    deviceName = data?.name || 'Nodo Simulado ESP32';
    siteName = data?.siteName || 'Banco de Pruebas Simulado';
    crewName = data?.crewName || 'Pruebas de Laboratorio';
    sectorName = data?.sectorName || 'Entorno Simulado';
  } else if (key === GATEWAY_DEVICE_ID) {
    deviceName = data?.name || 'Gateway ESP32 DevKit V1';
    siteName = isDiscoveredDiagnosticGateway ? '' : data?.siteName || 'Faena Chuquicamata';
    crewName = isDiscoveredDiagnosticGateway ? '' : data?.crewName || 'Cuadrilla Alfa';
    sectorName = isDiscoveredDiagnosticGateway
      ? 'En inventario'
      : data?.sectorName || 'Enlace ESP-NOW';
  } else if (key === 'device_A4CB2F124B00') {
    deviceName = data?.name || 'Gateway Sector San José';
    siteName = data?.siteName || 'Faena San José';
    crewName = data?.crewName || 'Cuadrilla Beta';
    sectorName = data?.sectorName || 'Nivel -400m';
  } else if (key === 'NODO_U-01') {
    deviceName = data?.name || 'Nodo Fijo Monitoreo U-01';
    siteName = data?.siteName || 'Faena Chuquicamata';
    crewName = data?.crewName || 'Cuadrilla Alfa';
    sectorName = data?.sectorName || 'Socavón Norte Frente de Avance';
  }

  const hasReportedBattery = typeof data?.bateria === 'number' && !Number.isNaN(data.bateria);

  const mappedAssignmentStatus: DeviceAssignmentStatus = isExperimentalV2
    ? 'en_inventario'
    : data?.assignmentStatus &&
      ['en_inventario', 'asignado_empresa', 'asignado_faena', 'asignado_sector'].includes(
        data.assignmentStatus
      )
    ? data.assignmentStatus
    : resolveDeviceAssignmentStatus({
        organizationId: resolvedOrgId,
        siteId: data?.siteId || undefined,
        siteName: siteName || undefined,
        crewId: data?.crewId || undefined,
        sectorId: data?.sectorId || undefined,
        sectorName,
      });

  const historyList: DeviceAssignmentAuditEntry[] | undefined = Array.isArray(data?.assignmentHistory)
    ? data.assignmentHistory
    : data?.assignmentHistory && typeof data.assignmentHistory === 'object'
    ? Object.values(data.assignmentHistory)
    : undefined;

  const saltosEspNow =
    typeof data?.saltos_espnow === 'number' && Number.isFinite(data.saltos_espnow)
      ? data.saltos_espnow
      : undefined;
  const timestampUnix =
    typeof data?.timestamp_unix === 'number' && Number.isFinite(data.timestamp_unix)
      ? data.timestamp_unix
      : undefined;
  const viaPuenteVal: boolean | string | undefined =
    typeof data?.via_puente === 'boolean'
      ? data.via_puente
      : typeof data?.via_puente === 'string' && data.via_puente.trim() !== ''
      ? data.via_puente.trim()
      : undefined;
  const embeddedHistoryEntries =
    data?.historial && typeof data.historial === 'object' ? Object.keys(data.historial).length : 0;
  const resolvedCategory: DeviceCategory =
    data?.deviceCategory ||
    (isMultiNodeSim || key.startsWith('NODO') ? 'nodo' : 'gateway');
  const resolvedGatewayId =
    typeof data?.gateway_id === 'string' && data.gateway_id.trim() !== ''
      ? data.gateway_id.trim()
      : typeof data?.parentGatewayId === 'string' && data.parentGatewayId.trim() !== ''
      ? data.parentGatewayId.trim()
      : undefined;

  return {
    id: key,
    code: key,
    name: deviceName,
    type:
      key.startsWith('NODO') || isMultiNodeSim || resolvedCategory === 'nodo'
        ? 'estacion_fija'
        : 'multigas_portatil',
    organizationId: resolvedOrgId,
    organizationName: isExperimentalV2
      ? 'Sin asignación (Equipo Experimental de Banco)'
      : data?.organizationName || undefined,
    siteId: isExperimentalV2 ? undefined : data?.siteId || undefined,
    siteName: isExperimentalV2 ? undefined : siteName || undefined,
    crewId: isExperimentalV2 ? undefined : data?.crewId || undefined,
    crewName: isExperimentalV2 ? undefined : crewName || undefined,
    sectorId: isExperimentalV2 ? 'sec-experimental-bench-v2' : data?.sectorId || `sec-${key}`,
    sectorName: sectorName,
    batteryPct: hasReportedBattery ? Math.max(0, Math.min(100, Math.round(data.bateria))) : 0,
    batteryReported: hasReportedBattery,
    signalStrength: isOnline ? 'optima' : 'sin_conexion',
    lastPing: serverTime > 0
      ? (diffSeconds < 60 ? `hace ${diffSeconds} seg` : `hace ${Math.floor(diffSeconds / 60)} min`)
      : 'sin marca temporal',
    status: status,
    assignedTo: '',
    rawCO: coVal === null ? undefined : coVal,
    rawPM25: pmVal === null ? undefined : pmVal,
    rawTemp: tempVal === null ? undefined : tempVal,
    rawHum: humVal === null ? undefined : humVal,
    sensorFault: sensorFault,
    faultFields: faultFields,
    lastUpdateServer: serverTime,
    gatewayOnline: isOnline,
    alarmaActiva: alarmaActiva,
    origenAlarma: origenAlarma,
    descripcionMonitoreo: descripcionMonitoreo,
    fecha: data?.fecha || '',
    hora: data?.hora || '',
    fechaHora: typeof data?.fecha_hora === 'string' ? data.fecha_hora : undefined,
    timestampUnix,
    via: data?.via || '',
    viaPuente: viaPuenteVal,
    gatewayId: resolvedGatewayId,
    saltosEspNow,
    msgId:
      typeof data?.msgId === 'string' || typeof data?.msgId === 'number'
        ? data.msgId
        : undefined,
    isSimulated,
    simulado: isSimulated,
    modoBanco,
    telemetryOrigin,
    isBenchTelemetry,
    isExperimentalBench: isExperimentalV2,
    sourcePath,
    hasEmbeddedHistory: embeddedHistoryEntries > 0,
    embeddedHistoryCount: embeddedHistoryEntries,
    historyPath:
      typeof data?._historyPath === 'string'
        ? data._historyPath
        : isMultiNodeSim
        ? `/${MULTINODE_SIMULATED_NODES_PATH}/${key}/historial`
        : `/dispositivos/${key}/historial`,
    nodosActivos:
      typeof data?.nodos_activos === 'number' && Number.isFinite(data.nodos_activos)
        ? data.nodos_activos
        : undefined,
    adcSaturated,
    dustSensorModel: DUST_SENSOR_MODEL_LABEL,
    localIp: data?.localIp || data?.ip || undefined,
    deviceCategory: resolvedCategory,
    parentGatewayId: isExperimentalV2
      ? undefined
      : data?.parentGatewayId || (resolvedCategory === 'nodo' ? resolvedGatewayId : undefined),
    registroAlarmas: isIsolatedFromOperationalAlarms ? undefined : data?.registro_alarmas,
    assignmentStatus: mappedAssignmentStatus,
    assignedBy: data?.assignedBy || undefined,
    assignedAt: typeof data?.assignedAt === 'number' ? data.assignedAt : undefined,
    assignmentHistory: historyList,
    blocked: data?.blocked === true || data?.enabled === false,
    blockedAt: typeof data?.blockedAt === 'number' ? data.blockedAt : undefined,
    blockedBy: data?.blockedBy || undefined,
    enabled: data?.enabled !== false && data?.blocked !== true,
    assignedUserIds: Array.isArray(data?.assignedUserIds)
      ? data.assignedUserIds.filter((x: any) => typeof x === 'string' && x.trim() !== '')
      : undefined,
    sharedOrganizationIds: Array.isArray(data?.sharedOrganizationIds)
      ? data.sharedOrganizationIds.filter((x: any) => typeof x === 'string' && x.trim() !== '')
      : undefined,
    sharedWithAllAssignedUsers: data?.sharedWithAllAssignedUsers === true,
    metrics: {
      temperatura: tempVal === null ? 0 : Number(tempVal.toFixed(1)),
      humedad: humVal === null ? 0 : Number(humVal.toFixed(0)),
      co2: typeof data?.CO2 === 'number' ? data.CO2 : 0,
      co: coVal === null ? 0 : Number(coVal.toFixed(1)),
      ch4: typeof data?.CH4 === 'number' ? data.CH4 : 0,
      o2: typeof data?.O2 === 'number' ? data.O2 : 0,
      flujoAire: typeof data?.flujo_aire === 'number' ? data.flujo_aire : 0,
      ruido: typeof data?.ruido === 'number' ? data.ruido : 0,
      polvoPM: pmVal === null ? 0 : Number(pmVal.toFixed(0)),
    },
  };
}

export const PRIMARY_SUPERADMIN_EMAIL = 'manuelcrisostomovega@gmail.com';
export const PRIMARY_SUPERADMIN_UID = 'manual_temp_uid_01';
export const FIREBASE_PROJECT_ID = minefaseConfig.projectId;

export class FirebaseAuthActionError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

function mapFirebaseAuthError(err: any): FirebaseAuthActionError {
  const code = err?.code || '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return new FirebaseAuthActionError('Correo o contraseña incorrectos en Firebase Authentication. Acceso denegado.', code);
    case 'auth/invalid-email':
      return new FirebaseAuthActionError('El formato del correo electrónico no es válido.', code);
    case 'auth/user-disabled':
      return new FirebaseAuthActionError('Esta cuenta ha sido deshabilitada en Firebase Authentication.', code);
    case 'auth/too-many-requests':
      return new FirebaseAuthActionError('Demasiados intentos fallidos. Espera unos minutos antes de volver a intentar.', code);
    case 'auth/email-already-in-use':
      return new FirebaseAuthActionError('Este correo electrónico ya está registrado en Firebase Authentication.', code);
    case 'auth/weak-password':
      return new FirebaseAuthActionError('La contraseña debe tener al menos 8 caracteres.', code);
    case 'auth/operation-not-allowed':
      return new FirebaseAuthActionError(
        'El método de inicio de sesión con correo y contraseña no está habilitado en el proveedor de autenticación.',
        code
      );
    case 'auth/public-registration-disabled':
    case 'auth/unauthorized-profile':
    case 'auth/account-recreation-required':
      return new FirebaseAuthActionError(
        err?.message || 'El acceso requiere una cuenta habilitada por un responsable autorizado.',
        code
      );
    case 'auth/unauthorized-domain':
      return new FirebaseAuthActionError(
        'Este dominio no está autorizado para iniciar sesión en el proveedor de autenticación.',
        code
      );
    case 'auth/popup-closed-by-user':
      return new FirebaseAuthActionError('Se cerró la ventana emergente antes de completar el acceso.', code);
    case 'auth/popup-blocked':
      return new FirebaseAuthActionError('El navegador bloqueó la ventana emergente de acceso. Permite ventanas emergentes e intenta nuevamente.', code);
    case 'auth/network-request-failed':
      return new FirebaseAuthActionError('Error de red al conectar con el servicio de autenticación. Verifica tu conexión a Internet.', code);
    default:
      return new FirebaseAuthActionError(err?.message || 'Error al autenticar con Firebase Authentication.', code || 'auth/unknown');
  }
}

export function mapRTDBUserToUserProfile(key: string, data: any): UserProfile {
  const emailLower = (data?.email || '').toLowerCase();
  const isCanonicalSuper =
    emailLower === PRIMARY_SUPERADMIN_EMAIL ||
    key === PRIMARY_SUPERADMIN_UID;
  const tipoRaw = String(data?.tipoUsuario || '').trim().toLowerCase();
  const cargoRaw = String(data?.cargo || '').trim().toLowerCase();
  const isSuper = isCanonicalSuper || data?.isSuperUser === true || tipoRaw === 'superadmin';
  const isAdminMineSafe = !isSuper && (tipoRaw === 'admin_minesafe' || cargoRaw === 'admin_minesafe');
  const isAdmin =
    isSuper ||
    isAdminMineSafe ||
    data?.isAdmin === true ||
    tipoRaw === 'admin' ||
    data?.cargo === 'Administrador';
  const isSupervisor =
    !isAdmin &&
    (tipoRaw === 'supervisor' ||
      cargoRaw === 'supervisor' ||
      tipoRaw === 'monotoriador' ||
      cargoRaw === 'monotoriador' ||
      tipoRaw === 'monitoreador' ||
      cargoRaw === 'monitoreador');

  let role: UserRole = 'operador';
  let roleLabel = 'Usuario Normal / Operador Minero';

  if (isSuper) {
    role = 'superadmin';
    roleLabel = 'Super Administrador de Seguridad Minera';
  } else if (isAdminMineSafe) {
    role = 'admin_minesafe';
    roleLabel = 'Admin Corporativo MineSafe';
  } else if (isAdmin) {
    role = 'admin';
    roleLabel = 'Administrador de Empresa';
  } else if (isSupervisor) {
    role = 'supervisor';
    roleLabel = 'Supervisor Ambiental';
  }

  const assignedSector = data?.geoMina 
    || (data?.comuna ? `${data.comuna}, ${data.region || 'Chile'}` : 'Faena Minera');

  const assignedDev = data?.deviceId 
    || data?.dispositivo?.nombreDispositivo 
    || (key === 'manual_temp_uid_01' ? 'device_38A839E81F84' : '');

  return {
    id: key,
    organizationId: data?.organizationId || DEFAULT_ORGANIZATION.id,
    name: data?.nombre || key,
    email: data?.email || `${key.toLowerCase().replace(/[^a-z0-9]/g, '')}@minesafe.cl`,
    role: role,
    roleLabel: roleLabel,
    rut: data?.codigoId || data?.telefono || 'No registrado',
    shift: data?.cargo || data?.tipoMina || 'Turno Continuo A',
    status: data?.isActive !== false ? 'activo' : 'inactivo',
    blockedReason: data?.blockedReason || undefined,
    blockedAt: typeof data?.blockedAt === 'number' ? data.blockedAt : undefined,
    blockedBy: data?.blockedBy || undefined,
    pendingActivation: data?.pendingActivation === true,
    claimedFromKey: data?.claimedFromKey || undefined,
    lastLogin: data?.pendingActivation === true ? 'Pendiente crear nueva cuenta (/acceso)' : 'En línea (Firebase Auth)',
    assignedSector: assignedSector,
    assignedSiteId: data?.assignedSiteId || undefined,
    assignedSiteName: data?.assignedSiteName || undefined,
    assignedCrewId: data?.assignedCrewId || undefined,
    assignedCrewName: data?.assignedCrewName || undefined,
    assignedSectors: Array.isArray(data?.assignedSectors) ? data.assignedSectors : undefined,
    assignedDeviceCode: assignedDev,
    mustChangePassword: data?.mustChangePassword === true,
    passwordPolicyVersion:
      typeof data?.passwordPolicyVersion === 'number' ? data.passwordPolicyVersion : undefined,
    passwordUpdatedAt:
      typeof data?.passwordUpdatedAt === 'number' ? data.passwordUpdatedAt : undefined,
    legalConsentVersion:
      typeof data?.legalConsentVersion === 'string' ? data.legalConsentVersion : undefined,
    legalConsentAcceptedAt:
      typeof data?.legalConsentAcceptedAt === 'number' ? data.legalConsentAcceptedAt : undefined,
    anonymizedAt:
      typeof data?.anonymizedAt === 'number' ? data.anonymizedAt : undefined,
    anonymizedBy:
      typeof data?.anonymizedBy === 'string' ? data.anonymizedBy : undefined,
  };
}

export async function updateCurrentUserPasswordWithPolicy(
  newPassword: string,
  user: UserProfile
): Promise<UserProfile> {
  const policyCheck = validatePasswordPolicy(newPassword);
  if (!policyCheck.valid) {
    throw new Error(policyCheck.errors[0] || 'La nueva contraseña no cumple la política de seguridad.');
  }

  const fbUser = auth.currentUser;
  if (!fbUser) {
    throw new Error('Tu sesión de autenticación expiró. Inicia sesión nuevamente para actualizar tu contraseña.');
  }

  try {
    await updatePassword(fbUser, newPassword);
  } catch (err: any) {
    if (err?.code === 'auth/requires-recent-login') {
      throw new Error(
        'Por seguridad, vuelve a iniciar sesión e intenta cambiar la contraseña de inmediato, o solicita un enlace de restablecimiento a tu correo.'
      );
    }
    throw mapFirebaseAuthError(err);
  }

  const now = Date.now();
  const targetUid = fbUser.uid || user.id;
  await update(ref(rtdb, `usuarios/${targetUid}`), {
    mustChangePassword: false,
    passwordPolicyVersion: CURRENT_PASSWORD_POLICY_VERSION,
    passwordUpdatedAt: now,
  }).catch(() => {});

  return {
    ...user,
    mustChangePassword: false,
    passwordPolicyVersion: CURRENT_PASSWORD_POLICY_VERSION,
    passwordUpdatedAt: now,
  };
}

/**
 * Permite a cualquier usuario autenticado cambiar su propia contraseña de forma voluntaria,
 * reautenticándolo primero con su contraseña actual y aplicando la política vigente.
 */
export async function changeAuthenticatedUserPassword(
  currentPassword: string,
  newPassword: string,
  user: UserProfile
): Promise<UserProfile> {
  if (!currentPassword) {
    throw new Error('Debes ingresar tu contraseña actual para confirmar el cambio.');
  }
  const policyCheck = validatePasswordPolicy(newPassword);
  if (!policyCheck.valid) {
    throw new Error(policyCheck.errors[0] || 'La nueva contraseña no cumple la política de seguridad.');
  }
  if (currentPassword === newPassword) {
    throw new Error('La nueva contraseña debe ser diferente a la contraseña actual.');
  }

  const fbUser = auth.currentUser;
  if (!fbUser || !fbUser.email) {
    throw new Error('Tu sesión de autenticación expiró. Inicia sesión nuevamente para cambiar tu contraseña.');
  }

  try {
    const credential = EmailAuthProvider.credential(fbUser.email, currentPassword);
    await reauthenticateWithCredential(fbUser, credential);
    await updatePassword(fbUser, newPassword);
  } catch (err: any) {
    if (err?.code === 'auth/wrong-password' || err?.code === 'auth/invalid-credential') {
      throw new Error('La contraseña actual ingresada es incorrecta.');
    }
    throw mapFirebaseAuthError(err);
  }

  const now = Date.now();
  const targetUid = fbUser.uid || user.id;
  await update(ref(rtdb, `usuarios/${targetUid}`), {
    mustChangePassword: false,
    passwordPolicyVersion: CURRENT_PASSWORD_POLICY_VERSION,
    passwordUpdatedAt: now,
  }).catch(() => {});

  return {
    ...user,
    mustChangePassword: false,
    passwordPolicyVersion: CURRENT_PASSWORD_POLICY_VERSION,
    passwordUpdatedAt: now,
  };
}

let isAccountRecreationInProgress = false;

async function claimPendingProfileForAuthUser(
  fbUser: FirebaseUser,
  pendingKey: string,
  pendingRawData: any,
  emailLower: string
): Promise<UserProfile> {
  const pendingTipo = String(pendingRawData?.tipoUsuario || '').trim().toLowerCase();
  const claimedRole: UserRole =
    pendingTipo === 'admin_minesafe'
      ? 'admin_minesafe'
      : pendingTipo === 'admin'
      ? 'admin'
      : pendingTipo === 'supervisor' || pendingTipo === 'monotoriador' || pendingTipo === 'monitoreador'
      ? 'supervisor'
      : 'operador';
  const claimedPayload: Record<string, any> = {
    nombre: pendingRawData?.nombre || fbUser.displayName || emailLower,
    email: emailLower,
    organizationId: pendingRawData?.organizationId || DEFAULT_ORGANIZATION.id,
    isAdmin: pendingRawData?.isAdmin === true || claimedRole === 'admin' || claimedRole === 'admin_minesafe',
    isSuperUser: false,
    tipoUsuario: claimedRole,
    isActive: true,
    pendingActivation: false,
    claimedFromKey: pendingKey,
    telefono: pendingRawData?.telefono || pendingRawData?.codigoId || 'No registrado',
    cargo: pendingRawData?.cargo || 'Turno Continuo A',
    geoMina: pendingRawData?.geoMina || 'Faena Minera Central',
    deviceId: pendingRawData?.deviceId || '',
    updatedAt: new Date().toISOString(),
  };

  await set(ref(rtdb, `usuarios/${fbUser.uid}`), claimedPayload);
  await remove(ref(rtdb, `usuarios/${pendingKey}`)).catch(() => {});
  return mapRTDBUserToUserProfile(fbUser.uid, claimedPayload);
}

export async function resolveUserProfileFromAuthUser(fbUser: FirebaseUser): Promise<UserProfile> {
  const emailLower = (fbUser.email || '').trim().toLowerCase();
  const entriesMap = new Map<string, { profile: UserProfile; raw: any }>();

  // 1. Buscar directamente por UID en /usuarios/{uid}
  try {
    const byUidSnap = await get(ref(rtdb, `usuarios/${fbUser.uid}`));
    if (byUidSnap.exists()) {
      const raw = byUidSnap.val() || {};
      entriesMap.set(fbUser.uid, {
        profile: mapRTDBUserToUserProfile(fbUser.uid, raw),
        raw,
      });
    }
  } catch { /* ignore */ }

  // 2. Buscar por email en /usuarios usando consulta indexada (compatibles con reglas restrictivas para operadores)
  if (emailLower) {
    try {
      const byEmailQuery = query(ref(rtdb, 'usuarios'), orderByChild('email'), equalTo(emailLower));
      const byEmailSnap = await get(byEmailQuery);
      if (byEmailSnap.exists()) {
        const matchedObj = byEmailSnap.val() || {};
        Object.keys(matchedObj).forEach((k) => {
          const raw = matchedObj[k] || {};
          entriesMap.set(k, {
            profile: mapRTDBUserToUserProfile(k, raw),
            raw,
          });
        });
      }
    } catch { /* ignore */ }

    if (entriesMap.size === 0) {
      try {
        const allUsersSnap = await get(ref(rtdb, 'usuarios'));
        if (allUsersSnap.exists()) {
          const allUsers = allUsersSnap.val() || {};
          Object.keys(allUsers).forEach((k) => {
            if ((allUsers[k]?.email || '').trim().toLowerCase() === emailLower) {
              const raw = allUsers[k] || {};
              entriesMap.set(k, {
                profile: mapRTDBUserToUserProfile(k, raw),
                raw,
              });
            }
          });
        }
      } catch { /* ignore */ }
    }
  }

  const entries: EmailProfileEntry[] = Array.from(entriesMap.entries()).map(([key, v]) => ({
    key,
    profile: v.profile,
  }));
  const resolution = selectBestLoginProfileForEmail(entries, fbUser.uid);

  if (resolution.resolution === 'active_direct') {
    return resolution.entry.profile;
  }

  if (resolution.resolution === 'auto_claim_pending') {
    const pendingRaw = entriesMap.get(resolution.entry.key)?.raw;
    return await claimPendingProfileForAuthUser(fbUser, resolution.entry.key, pendingRaw, emailLower);
  }

  if (resolution.resolution === 'requires_new_account') {
    await signOut(auth).catch(() => {});
    throw new FirebaseAuthActionError(
      'Tu cuenta de la empresa anterior fue bloqueada y una nueva empresa ya habilitó tu acceso. Usa "Crear nueva cuenta con correo anterior" para activar tus nuevas credenciales.',
      'auth/account-recreation-required'
    );
  }

  if (resolution.resolution === 'blocked') {
    await signOut(auth).catch(() => {});
    const reason = resolution.blockedEntry.profile.blockedReason;
    throw new FirebaseAuthActionError(
      reason
        ? `Tu cuenta fue bloqueada por tu empresa (${reason}). Si te contrataron en otra empresa, solicita que te registren y crea una nueva cuenta con tu correo.`
        : 'Tu cuenta fue bloqueada/desactivada por administración. Si te contrataron en otra empresa, solicita el alta y crea una nueva cuenta con tu correo.',
      'auth/user-disabled'
    );
  }

  // 3. Únicamente el SuperAdministrador canónico tiene respaldo automático; cualquier otra cuenta
  // debe contar con perfil autorizado y activo en /usuarios.
  if (emailLower === PRIMARY_SUPERADMIN_EMAIL) {
    return {
      id: PRIMARY_SUPERADMIN_UID,
      organizationId: DEFAULT_ORGANIZATION.id,
      name: fbUser.displayName || 'Manuel Crisostomo',
      email: fbUser.email || PRIMARY_SUPERADMIN_EMAIL,
      role: 'superadmin',
      roleLabel: 'Super Administrador de Seguridad Minera',
      rut: 'No registrado',
      shift: 'Turno Continuo A',
      status: 'activo',
      lastLogin: 'En línea (Firebase Auth)',
      assignedSector: 'Mina Chuquicamata',
      assignedDeviceCode: 'device_38A839E81F84',
    };
  }

  await signOut(auth).catch(() => {});
  throw new FirebaseAuthActionError(
    'Tu cuenta no se encuentra habilitada o asociada a una organización autorizada. Solicita el alta a un responsable.',
    'auth/unauthorized-profile'
  );
}

export async function loginWithFirebaseAuth(
  email: string,
  password: string,
  rememberMe: boolean = true
): Promise<UserProfile> {
  const cleanEmail = email.trim();
  if (!cleanEmail || !password) {
    throw new Error('Debes ingresar tu correo electrónico y contraseña.');
  }

  try {
    await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence).catch(() => {});
    const credential = await signInWithEmailAndPassword(auth, cleanEmail, password);
    return await resolveUserProfileFromAuthUser(credential.user);
  } catch (err: any) {
    throw mapFirebaseAuthError(err);
  }
}

export async function loginWithGoogleFirebaseAuth(rememberMe: boolean = true): Promise<UserProfile> {
  try {
    await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence).catch(() => {});
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const credential = await signInWithPopup(auth, provider);
    // No auto-registra cuentas nuevas: exige perfil autorizado previo en /usuarios
    return await resolveUserProfileFromAuthUser(credential.user);
  } catch (err: any) {
    throw mapFirebaseAuthError(err);
  }
}

export async function registerWithFirebaseAuth(
  _name: string,
  _email: string,
  _password: string,
  _rut: string,
  _shift: string
): Promise<UserProfile> {
  throw new FirebaseAuthActionError(
    'El autorregistro público está deshabilitado. Las cuentas deben ser habilitadas por un responsable autorizado de la organización.',
    'auth/public-registration-disabled'
  );
}

/**
 * Crea una cuenta real en Firebase Authentication desde la consola Admin/SuperAdmin
 * utilizando una instancia secundaria aislada para no cerrar ni alterar la sesión actual del administrador,
 * y envía opcionalmente el correo de restablecimiento/activación de contraseña.
 */
export async function createUserAccountByAdmin(params: {
  name: string;
  email: string;
  password: string;
  role: 'admin_minesafe' | 'admin' | 'operador' | 'supervisor';
  rut: string;
  shift: string;
  assignedSector: string;
  assignedDeviceCode?: string;
  organizationId?: string;
  organizations?: Organization[];
  existingUsersInOrg?: UserProfile[];
  sendResetEmail?: boolean;
  actingUser?: UserProfile | null;
}): Promise<UserProfile> {
  const cleanEmail = params.email.trim().toLowerCase();
  const cleanName = params.name.trim();
  if (!cleanName || !cleanEmail) {
    throw new Error('Nombre y correo electrónico válido son obligatorios.');
  }
  const passwordPolicy = validatePasswordPolicy(params.password || '');
  if (!passwordPolicy.valid) {
    throw new Error(
      passwordPolicy.errors[0] ||
        'La contraseña inicial debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número.'
    );
  }

  let normalizedRut = 'No registrado';
  if (!isPlaceholderRut(params.rut)) {
    const rutCheck = validateChileanRut(params.rut);
    if (!rutCheck.valid) {
      throw new Error(rutCheck.error || 'El RUT ingresado no es válido según Módulo 11.');
    }
    normalizedRut = rutCheck.formatted!;
  }

  const safeRole: UserRole =
    params.role === 'admin_minesafe'
      ? 'admin_minesafe'
      : params.role === 'admin'
      ? 'admin'
      : params.role === 'supervisor'
      ? 'supervisor'
      : 'operador';

  let authorizedOrgs = params.organizations;
  const requestedOrg = params.organizationId || params.actingUser?.organizationId || DEFAULT_ORGANIZATION.id;
  if (
    params.actingUser?.role === 'admin' &&
    requestedOrg !== (params.actingUser.organizationId || DEFAULT_ORGANIZATION_ID) &&
    (!authorizedOrgs || authorizedOrgs.length === 0)
  ) {
    const orgSnap = await get(ref(rtdb, `organizaciones/${requestedOrg}`)).catch(() => null);
    if (orgSnap?.exists()) {
      authorizedOrgs = [{ id: requestedOrg, ...(orgSnap.val() || {}) } as Organization];
    }
  }

  const targetOrgId =
    params.actingUser?.role === 'admin'
      ? (isOrgAuthorizedForUser(params.actingUser, requestedOrg, authorizedOrgs)
          ? requestedOrg
          : params.actingUser.organizationId || DEFAULT_ORGANIZATION_ID)
      : requestedOrg;

  if (params.actingUser) {
    const check = canProvisionUserInOrganization(params.actingUser, targetOrgId, safeRole, authorizedOrgs);
    if (!check.allowed) {
      throw new Error(check.reason || 'Permisos insuficientes para crear cuentas.');
    }
  }

  // Verificar duplicados/bloqueos solo dentro de la MISMA empresa objetivo
  let orgUsersToCheck: UserProfile[] = params.existingUsersInOrg || [];
  if (orgUsersToCheck.length === 0) {
    const orgUsersSnap = await get(
      query(ref(rtdb, 'usuarios'), orderByChild('organizationId'), equalTo(targetOrgId))
    ).catch(() => null);
    if (orgUsersSnap?.exists()) {
      const rawMap = orgUsersSnap.val() || {};
      orgUsersToCheck = Object.keys(rawMap).map((k) => mapRTDBUserToUserProfile(k, rawMap[k]));
    }
  }

  const sameOrgConflict = findUserEmailConflictInOrg(orgUsersToCheck, cleanEmail, targetOrgId);
  if (sameOrgConflict.conflict === 'active_in_same_org') {
    throw new FirebaseAuthActionError(
      `El correo ${cleanEmail} ya posee una cuenta activa en esta empresa.`,
      'auth/email-already-in-use'
    );
  }
  if (sameOrgConflict.conflict === 'blocked_in_same_org') {
    throw new FirebaseAuthActionError(
      `El correo ${cleanEmail} se encuentra bloqueado en esta empresa. Usa el botón "Desbloquear" en la lista de usuarios si deseas rehabilitarlo aquí.`,
      'auth/email-already-in-use'
    );
  }

  const secondaryApp =
    getApps().find((a) => a.name === 'admin-provisioner') ||
    initializeApp(minefaseConfig, 'admin-provisioner');
  const secondaryAuth = getAuth(secondaryApp);
  let createdFbUser: FirebaseUser | null = null;

  const roleLabel =
    safeRole === 'admin_minesafe'
      ? 'Admin Corporativo MineSafe'
      : safeRole === 'admin'
      ? 'Administrador de Empresa'
      : safeRole === 'supervisor'
      ? 'Supervisor Ambiental'
      : 'Operador / Minero en Faena';

  try {
    const credential = await createUserWithEmailAndPassword(secondaryAuth, cleanEmail, params.password);
    createdFbUser = credential.user;
    await updateProfile(credential.user, { displayName: cleanName }).catch(() => {});
    const newUid = credential.user.uid;
    if (params.sendResetEmail) {
      await sendPasswordResetEmail(secondaryAuth, cleanEmail).catch(() => {});
    }

    const createdProfile: UserProfile = {
      id: newUid,
      organizationId: targetOrgId,
      name: cleanName,
      email: cleanEmail,
      role: safeRole,
      roleLabel,
      rut: normalizedRut,
      shift: params.shift.trim() || 'Turno Continuo A',
      status: 'activo',
      pendingActivation: false,
      lastLogin: 'Cuenta creada por administración',
      assignedSector: params.assignedSector || 'Faena Minera Central',
      assignedDeviceCode: params.assignedDeviceCode || '',
    };

    await addUserToRTDB(createdProfile, params.actingUser, authorizedOrgs);
    await signOut(secondaryAuth).catch(() => {});
    return createdProfile;
  } catch (err: any) {
    // Si el correo ya existía en Firebase Auth (por pertenecer antes a otra empresa),
    // habilitamos una ficha pendiente para que el trabajador cree una nueva cuenta con ese mismo correo en /acceso.
    if (err?.code === 'auth/email-already-in-use') {
      await signOut(secondaryAuth).catch(() => {});
      const safeOrgSlug = targetOrgId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 28);
      const pendingId = `pend_${safeOrgSlug}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const pendingProfile: UserProfile = {
        id: pendingId,
        organizationId: targetOrgId,
        name: cleanName,
        email: cleanEmail,
        role: safeRole,
        roleLabel,
        rut: normalizedRut,
        shift: params.shift.trim() || 'Turno Continuo A',
        status: 'activo',
        pendingActivation: true,
        lastLogin: 'Pendiente crear nueva cuenta (/acceso)',
        assignedSector: params.assignedSector || 'Faena Minera Central',
        assignedDeviceCode: params.assignedDeviceCode || '',
      };
      await addUserToRTDB(pendingProfile, params.actingUser, authorizedOrgs);
      return pendingProfile;
    }

    // Revertir cuenta creada en Firebase Auth si falló el guardado del perfil en RTDB (anti-huérfano)
    if (createdFbUser) {
      await createdFbUser.delete().catch(() => {});
    }
    await signOut(secondaryAuth).catch(() => {});
    throw mapFirebaseAuthError(err);
  }
}

/**
 * Permite a un trabajador bloqueado o proveniente de otra empresa crear una nueva cuenta
 * (nuevo UID y nueva contraseña en Firebase Auth) reutilizando su correo anterior,
 * siempre que la nueva empresa haya habilitado una ficha pendiente activa para ese correo.
 * Conserva intacto en RTDB el registro bloqueado de la empresa anterior.
 */
export async function createNewCompanyAccountWithPreviousEmail(params: {
  email: string;
  previousPassword: string;
  newPassword: string;
  rememberMe?: boolean;
}): Promise<UserProfile> {
  const cleanEmail = params.email.trim().toLowerCase();
  if (!cleanEmail || !params.previousPassword || params.newPassword.length < 8) {
    throw new FirebaseAuthActionError(
      'Debes ingresar tu correo anterior, tu contraseña anterior y una nueva contraseña (mínimo 8 caracteres).',
      'auth/invalid-input'
    );
  }

  isAccountRecreationInProgress = true;
  try {
    await setPersistence(auth, params.rememberMe !== false ? browserLocalPersistence : browserSessionPersistence).catch(() => {});
    const oldCred = await signInWithEmailAndPassword(auth, cleanEmail, params.previousPassword);
    const oldFbUser = oldCred.user;
    const oldUid = oldFbUser.uid;

    // Consultar fichas por email y ficha directa del UID antiguo
    const entriesMap = new Map<string, { profile: UserProfile; raw: any }>();
    try {
      const byUidSnap = await get(ref(rtdb, `usuarios/${oldUid}`));
      if (byUidSnap.exists()) {
        const raw = byUidSnap.val() || {};
        entriesMap.set(oldUid, {
          profile: mapRTDBUserToUserProfile(oldUid, raw),
          raw,
        });
      }
    } catch { /* ignore */ }

    const byEmailQuery = query(ref(rtdb, 'usuarios'), orderByChild('email'), equalTo(cleanEmail));
    const byEmailSnap = await get(byEmailQuery);
    if (byEmailSnap.exists()) {
      const matched = byEmailSnap.val() || {};
      Object.keys(matched).forEach((k) => {
        const raw = matched[k] || {};
        entriesMap.set(k, {
          profile: mapRTDBUserToUserProfile(k, raw),
          raw,
        });
      });
    }

    const entries: EmailProfileEntry[] = Array.from(entriesMap.entries()).map(([key, v]) => ({
      key,
      profile: v.profile,
    }));
    const resolution = selectBestLoginProfileForEmail(entries, oldUid);

    if (resolution.resolution === 'active_direct') {
      await signOut(auth).catch(() => {});
      throw new FirebaseAuthActionError(
        'Tu cuenta actual sigue activa y no tienes pendiente una reincorporación en otra empresa. Inicia sesión normalmente.',
        'auth/already-active'
      );
    }

    if (resolution.resolution !== 'requires_new_account' && resolution.resolution !== 'auto_claim_pending') {
      await signOut(auth).catch(() => {});
      throw new FirebaseAuthActionError(
        'No existe una invitación o ficha activa en una nueva empresa para este correo. Pide al administrador de la nueva empresa que te registre primero.',
        'auth/unauthorized-profile'
      );
    }

    const targetPending =
      resolution.resolution === 'requires_new_account'
        ? resolution.pendingEntry
        : resolution.entry;
    const pendingRaw = entriesMap.get(targetPending.key)?.raw;

    // 1. Eliminar solo la credencial antigua de Firebase Auth (la ficha RTDB de la empresa anterior queda intacta y bloqueada)
    await deleteUser(oldFbUser);

    // 2. Crear nueva cuenta en Firebase Auth con el mismo correo y la nueva contraseña
    const newCred = await createUserWithEmailAndPassword(auth, cleanEmail, params.newPassword);
    await updateProfile(newCred.user, {
      displayName: pendingRaw?.nombre || targetPending.profile.name || cleanEmail,
    }).catch(() => {});

    // 3. Reclamar la ficha autorizada de la nueva empresa bajo el nuevo UID
    return await claimPendingProfileForAuthUser(
      newCred.user,
      targetPending.key,
      pendingRaw,
      cleanEmail
    );
  } catch (err: any) {
    if (err instanceof FirebaseAuthActionError) {
      throw err;
    }
    throw mapFirebaseAuthError(err);
  } finally {
    isAccountRecreationInProgress = false;
  }
}

export async function sendPasswordResetWithFirebase(email: string): Promise<void> {
  const cleanEmail = email.trim();
  if (!cleanEmail) {
    throw new FirebaseAuthActionError('Ingresa tu correo electrónico registrado.', 'auth/invalid-input');
  }
  try {
    await sendPasswordResetEmail(auth, cleanEmail);
  } catch (err: any) {
    throw mapFirebaseAuthError(err);
  }
}

export async function logoutFromFirebaseAuth(): Promise<void> {
  await signOut(auth);
}

export function subscribeToFirebaseAuth(
  callback: (user: UserProfile | null, authError?: string | null) => void
): () => void {
  return onAuthStateChanged(auth, async (fbUser) => {
    syncAuthStateIntoBenchDiagnostics(fbUser);
    if (isAccountRecreationInProgress) {
      return;
    }
    if (!fbUser) {
      callback(null, null);
      return;
    }
    try {
      const profile = await resolveUserProfileFromAuthUser(fbUser);
      callback(profile, null);
    } catch (err: any) {
      callback(null, err?.message || 'Tu cuenta no está habilitada para acceder al panel.');
    }
  });
}

export type CurrentUserStatusSignal = 'activo' | 'inactivo' | 'deleted' | 'error';

export function evaluateWatchedUserStatusSnapshots(
  states: Record<string, { exists: boolean; val?: any }>
): CurrentUserStatusSignal {
  const entries = Object.values(states);
  if (entries.length === 0) return 'deleted';
  const existing = entries.filter((e) => e.exists);
  if (existing.length === 0) return 'deleted';
  if (existing.some((e) => e.val?.isActive === false || e.val?.status === 'inactivo')) {
    return 'inactivo';
  }
  return 'activo';
}

/**
 * Listener directo sobre el nodo propio /usuarios/{uid} y /usuarios/{profileId} para revocar la sesión
 * de forma inmediata ante desactivación (isActive === false), eliminación del perfil o error de lectura/permisos.
 */
export function subscribeToCurrentUserStatus(
  profileId: string,
  authUid: string | null | undefined,
  callback: (status: CurrentUserStatusSignal, updatedProfile?: UserProfile, errorMessage?: string) => void
): () => void {
  const watchedIds = Array.from(new Set([profileId, authUid].filter((id): id is string => Boolean(id))));
  if (watchedIds.length === 0) return () => {};

  const snapshotState: Record<string, { resolved: boolean; exists: boolean; val?: any }> = {};
  watchedIds.forEach((id) => {
    snapshotState[id] = { resolved: false, exists: false };
  });

  const unsubs = watchedIds.map((uid) =>
    onValue(
      ref(rtdb, `usuarios/${uid}`),
      (snapshot) => {
        snapshotState[uid] = {
          resolved: true,
          exists: snapshot.exists(),
          val: snapshot.exists() ? snapshot.val() : undefined,
        };

        const signal = evaluateWatchedUserStatusSnapshots(snapshotState);
        if (signal === 'inactivo') {
          callback('inactivo', undefined, 'Tu cuenta fue desactivada por administración.');
          return;
        }
        const allResolved = watchedIds.every((id) => snapshotState[id].resolved);
        if (allResolved && signal === 'deleted') {
          callback('deleted', undefined, 'Tu perfil de usuario ya no existe en Firebase RTDB.');
          return;
        }
        if (snapshot.exists()) {
          const updated = mapRTDBUserToUserProfile(uid, snapshot.val());
          callback(updated.status, updated);
        }
      },
      (err) => {
        const errMsg = err?.message || String(err || 'Error de permisos verificando sesión en RTDB');
        console.warn(`Error verificando estado de sesión para /usuarios/${uid}:`, errMsg);
        callback('error', undefined, errMsg);
      }
    )
  );

  return () => {
    unsubs.forEach((fn) => fn());
  };
}

/**
 * Verifica contra Firebase Authentication y la base de datos RTDB si el usuario autenticado
 * posee privilegios reales de SuperAdministrador.
 */
export async function verifySuperAdminPrivileges(actingUser?: UserProfile | null): Promise<boolean> {
  const fbUser = auth.currentUser;
  if (!fbUser) {
    return false;
  }

  const fbEmail = (fbUser.email || '').trim().toLowerCase();
  if (actingUser && actingUser.role !== 'superadmin') {
    return false;
  }

  try {
    const byUidSnap = await get(ref(rtdb, `usuarios/${fbUser.uid}`));
    if (byUidSnap.exists()) {
      const data = byUidSnap.val();
      if (data?.isActive === false) return false;
      if (data?.isSuperUser === true || data?.tipoUsuario === 'superadmin') {
        return true;
      }
    }

    const allUsersSnap = await get(ref(rtdb, 'usuarios'));
    if (allUsersSnap.exists()) {
      const allUsers = allUsersSnap.val() || {};
      const matchedKey = Object.keys(allUsers).find(
        (k) => (allUsers[k]?.email || '').trim().toLowerCase() === fbEmail
      );
      if (matchedKey) {
        const u = allUsers[matchedKey];
        if (u?.isActive === false) return false;
        if (u?.isSuperUser === true || u?.tipoUsuario === 'superadmin' || matchedKey === PRIMARY_SUPERADMIN_UID) {
          return true;
        }
        return false;
      }
    }
  } catch (err) {
    console.warn('Error verificando privilegios SuperAdmin en RTDB:', err);
  }

  return fbEmail === PRIMARY_SUPERADMIN_EMAIL;
}

export function mapRTDBContractToRental(key: string, data: any): DeviceRental {
  const rawPaymentStatus = data?.paymentStatus;
  const estadoGeneral = data?.estadoGeneral || data?.estadoArriendo || 'Activo';
  let paymentStatus: DeviceRental['paymentStatus'] = 'al_dia';

  if (
    rawPaymentStatus === 'al_dia' ||
    rawPaymentStatus === 'proximo_a_vencer' ||
    rawPaymentStatus === 'pago_pendiente' ||
    rawPaymentStatus === 'vencido'
  ) {
    paymentStatus = rawPaymentStatus;
  } else if (estadoGeneral === 'Por Vencer') {
    paymentStatus = 'proximo_a_vencer';
  } else if (estadoGeneral === 'Finalizado' || estadoGeneral === 'Vencido') {
    paymentStatus = 'vencido';
  } else if (data?.pagos_simulados?.some((p: any) => p.estadoPago === 'Pendiente' || p.estado === 'Pendiente')) {
    paymentStatus = 'pago_pendiente';
  }

  return {
    id: key,
    organizationId: data?.organizationId || DEFAULT_ORGANIZATION.id,
    contractNumber: data?.contractNumber || key,
    deviceCode: data?.deviceCode || data?.deviceId || data?.idDispositivo || 'MS-IOT-REG',
    deviceType: data?.deviceType || 'Detector MultiGas Certificado DS 132',
    provider: data?.provider || data?.empresa || 'Dräger / MineSafe Mining Equipments',
    startDate: data?.startDate || data?.fechaInicioArriendo || data?.fechaInicio || '2025-01-01',
    endDate: data?.endDate || data?.fechaFinArriendo || data?.fechaFinContrato || data?.fechaTermino || '2026-12-31',
    monthlyCostClp:
      typeof data?.monthlyCostClp === 'number'
        ? data.monthlyCostClp
        : typeof data?.monto === 'number'
        ? data.monto
        : 185000,
    paymentStatus,
    lastPaymentDate: data?.lastPaymentDate || data?.fechaUltimoPago || '2025-11-15',
    nextDueDate: data?.nextDueDate || data?.fechaFinArriendo || '2026-03-31',
    assignedTechnician: data?.assignedTechnician || data?.tec || 'Ingeniería y Soporte MineSafe',
    notes: data?.notes || `Contrato sincronizado desde Realtime Database (${estadoGeneral}).`,
  };
}

export interface RTDBSubscriptionScope {
  uid?: string;
  authUid?: string;
  role?: UserRole;
  organizationId?: string;
  deviceIds?: string[];
}

function buildOrgScopedQuery(path: string, scope?: RTDBSubscriptionScope): DatabaseReference | Query {
  const baseRef = ref(rtdb, path);
  if (scope?.role && !isGlobalMineSafeAdmin(scope.role)) {
    const orgId = scope.organizationId && scope.organizationId !== 'all'
      ? scope.organizationId
      : DEFAULT_ORGANIZATION_ID;
    return query(baseRef, orderByChild('organizationId'), equalTo(orgId));
  }
  return baseRef;
}

// -------------------------------------------------------------
// REALTIME LISTENERS (RTDB)
// -------------------------------------------------------------
export function subscribeToRTDBDevicesRaw(
  callback: (rawDevices: Record<string, any>) => void,
  scope?: RTDBSubscriptionScope
): () => void {
  startServerTimeOffsetSync();
  syncAuthStateIntoBenchDiagnostics();
  updateBenchDiagnostics({
    devicesListener: { status: 'listening', error: null },
    benchListener: { status: 'listening', error: null, errorCode: null },
  });

  const recordBenchSnapshotForDiag = (val: Record<string, any> | null) => {
    const benchTs = normalizeServerTimestampMs(
      val?.last_update_server ?? val?.timestamp_server ?? val?.timestamp_unix
    );
    updateBenchDiagnostics({
      benchListener: {
        status: val ? 'ok' : 'empty',
        lastEventAt: Date.now(),
        error: null,
        errorCode: null,
        normalizedServerTs: benchTs,
        rawPayload: val
          ? {
              CO: val.CO ?? val.co,
              PM2_5: val.PM2_5 ?? val.pm25,
              temperatura: val.temperatura ?? val.temp,
              humedad: val.humedad ?? val.hum,
              last_update_server: val.last_update_server,
              origen: val.origen,
              simulado: val.simulado,
              hasHistorial: Boolean(val.historial && typeof val.historial === 'object'),
            }
          : null,
      },
    });
  };

  if (scope?.role && !isGlobalMineSafeAdmin(scope.role)) {
    const targetOrgId =
      scope.organizationId && scope.organizationId !== 'all'
        ? scope.organizationId
        : DEFAULT_ORGANIZATION_ID;

    let queryDevices: Record<string, any> = {};
    const explicitDevices: Record<string, any> = {};
    const explicitSimulatedNodes: Record<string, any> = {};
    let benchDiagData: Record<string, any> | null = null;
    let gatewayDiagData: Record<string, any> | null = null;

    const emitScoped = () => {
      const merged: Record<string, any> = {};
      const assignIfMatches = (devId: string, val: any, isExplicitAuthorized: boolean) => {
        // P094: El equipo experimental V2 se consume exclusivamente mediante su suscripción dedicada.
        if (isExperimentalBenchDeviceId(devId)) return;
        if (!val || typeof val !== 'object') return;
        const explicitOrg = typeof val.organizationId === 'string' ? val.organizationId.trim() : '';
        const sharedOrgs: string[] = Array.isArray(val.sharedOrganizationIds) ? val.sharedOrganizationIds : [];
        const assignedUsers: string[] = Array.isArray(val.assignedUserIds) ? val.assignedUserIds : [];
        const isSharedWithThisScope =
          val.sharedWithAllAssignedUsers === true ||
          sharedOrgs.includes(targetOrgId) ||
          (Boolean(scope.uid) && assignedUsers.includes(scope.uid!));
        if (explicitOrg && explicitOrg !== targetOrgId && !isSharedWithThisScope) {
          return;
        }
        if (!explicitOrg && !isExplicitAuthorized && !isSharedWithThisScope && targetOrgId !== DEFAULT_ORGANIZATION_ID) {
          return;
        }
        merged[devId] = val;
        recordDevicePacketArrival(devId, val);
      };
      Object.entries(queryDevices).forEach(([k, v]) => assignIfMatches(k, v, false));
      Object.entries(explicitDevices).forEach(([k, v]) => assignIfMatches(k, v, true));

      const rawPhys = merged[PHYSICAL_NODE_DEVICE_ID];
      updateBenchDiagnostics({
        devicesListener: {
          status: 'ok',
          lastEventAt: Date.now(),
          devicesCount: Object.keys(merged).length,
          physicalNodeExists: Boolean(rawPhys),
          physicalNodeRawTs: normalizeServerTimestampMs(
            rawPhys?.last_update_server ?? rawPhys?.timestamp_server ?? rawPhys?.timestamp_unix
          ),
          physicalNodeRawPM25:
            typeof rawPhys?.PM2_5 === 'number'
              ? rawPhys.PM2_5
              : typeof rawPhys?.pm25 === 'number'
              ? rawPhys.pm25
              : null,
          error: null,
        },
      });

      // Fusionar telemetría de /diagnostico/esp32_p087 únicamente si device_38A839E81F84
      // pertenece al alcance autorizado de la organización/usuario actual (aislamiento estricto).
      const afterBench = mergeBenchTelemetryIntoPhysicalNode(merged, benchDiagData, false);
      const allowedScopedIds = new Set<string>([
        ...Object.keys(afterBench),
        ...Array.from(new Set((scope.deviceIds || []).filter(Boolean))),
      ]);
      const finalMerged = mergeMultiNodeSimulatedDevices(
        afterBench,
        explicitSimulatedNodes,
        gatewayDiagData,
        {
          allowSimulatedDiscovery: false,
          allowedDeviceIds: allowedScopedIds,
        }
      );
      Object.keys(finalMerged).forEach((key) => {
        recordDevicePacketArrival(key, finalMerged[key]);
      });
      callback(finalMerged);
    };

    const unsubs: Array<() => void> = [];
    let fallbackAttached = false;
    const attachIndexFallbackIfAllowed = () => {
      if (fallbackAttached) return;
      fallbackAttached = true;
      unsubs.push(
        onValue(
          ref(rtdb, 'dispositivos'),
          (snap) => {
            queryDevices = snap.exists() ? snap.val() || {} : {};
            emitScoped();
          },
          (fallbackErr) => {
            const msg = fallbackErr?.message || String(fallbackErr || '');
            console.warn(
              `Error in fallback RTDB /dispositivos listener (${targetOrgId}):`,
              msg
            );
            updateBenchDiagnostics({
              devicesListener: { status: 'error', lastEventAt: Date.now(), error: msg },
            });
          }
        )
      );
    };

    const scopedRef = buildOrgScopedQuery('dispositivos', scope);
    unsubs.push(
      onValue(
        scopedRef,
        (snapshot) => {
          queryDevices = snapshot.exists() ? snapshot.val() || {} : {};
          emitScoped();
        },
        (err) => {
          const msg = String(err?.message || err || '');
          console.warn(`Error subscribing to scoped RTDB /dispositivos (${targetOrgId}):`, msg);
          updateBenchDiagnostics({
            devicesListener: { status: 'error', lastEventAt: Date.now(), error: msg },
          });
          if (/index/i.test(msg)) {
            attachIndexFallbackIfAllowed();
          } else {
            queryDevices = {};
            emitScoped();
          }
        }
      )
    );

    const uniqueIds = Array.from(new Set((scope.deviceIds || []).filter(Boolean)));
    uniqueIds.forEach((devId) => {
      unsubs.push(
        onValue(
          ref(rtdb, `dispositivos/${devId}`),
          (snapshot) => {
            if (snapshot.exists()) {
              explicitDevices[devId] = snapshot.val();
            } else {
              delete explicitDevices[devId];
            }
            emitScoped();
          },
          (err) => {
            console.warn(`Error subscribing to RTDB /dispositivos/${devId}:`, err?.message || err);
          }
        )
      );

      // Si el usuario/organización tiene asignado un nodo simulado MultiNode V2, escuchar /diagnostico/nodos_simulados/{devId}
      if (isMultiNodeSimulatedDeviceId(devId)) {
        unsubs.push(
          onValue(
            ref(rtdb, `${MULTINODE_SIMULATED_NODES_PATH}/${devId}`),
            (snapshot) => {
              if (snapshot.exists()) {
                explicitSimulatedNodes[devId] = snapshot.val();
              } else {
                delete explicitSimulatedNodes[devId];
              }
              emitScoped();
            },
            () => {
              // Silencioso si el rol/organización no tiene permiso sobre ese nodo simulado
              delete explicitSimulatedNodes[devId];
            }
          )
        );
      }
    });

    // Suscripción acotada al diagnóstico del gateway solo si el alcance incluye el gateway o nodos simulados
    if (
      uniqueIds.includes(GATEWAY_DEVICE_ID) ||
      uniqueIds.some((id) => isMultiNodeSimulatedDeviceId(id))
    ) {
      unsubs.push(
        onValue(
          ref(rtdb, MULTINODE_GATEWAY_DIAG_PATH),
          (snapshot) => {
            gatewayDiagData = snapshot.exists() ? snapshot.val() || null : null;
            emitScoped();
          },
          () => {
            gatewayDiagData = null;
          }
        )
      );
    }

    // Suscripción complementaria a /diagnostico/esp32_p087 (si las reglas RTDB lo autorizan)
    unsubs.push(
      onValue(
        ref(rtdb, BENCH_TELEMETRY_PATH),
        (snapshot) => {
          benchDiagData = snapshot.exists() ? snapshot.val() || null : null;
          recordBenchSnapshotForDiag(benchDiagData);
          emitScoped();
        },
        (err) => {
          // Usuarios de organizaciones sin acceso al nodo físico reciben permission_denied de forma esperada.
          benchDiagData = null;
          recordBenchListenerErrorForDiagnostics(err);
        }
      )
    );

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }

  let latestDevices: Record<string, any> = {};
  let latestBenchDiag: Record<string, any> | null = null;
  let latestSimulatedNodes: Record<string, any> | null = null;
  let latestGatewayDiag: Record<string, any> | null = null;
  let devicesLoaded = false;

  const emitGlobal = () => {
    const rawPhys = latestDevices[PHYSICAL_NODE_DEVICE_ID];
    if (devicesLoaded) {
      updateBenchDiagnostics({
        devicesListener: {
          status: 'ok',
          lastEventAt: Date.now(),
          devicesCount: Object.keys(latestDevices).length,
          physicalNodeExists: Boolean(rawPhys),
          physicalNodeRawTs: normalizeServerTimestampMs(
            rawPhys?.last_update_server ?? rawPhys?.timestamp_server ?? rawPhys?.timestamp_unix
          ),
          physicalNodeRawPM25:
            typeof rawPhys?.PM2_5 === 'number'
              ? rawPhys.PM2_5
              : typeof rawPhys?.pm25 === 'number'
              ? rawPhys.pm25
              : null,
          error: null,
        },
      });
    }

    // Para SuperAdmin / Admin MineSafe, permitir materializar/fusionar inmediatamente
    // la telemetría viva de /diagnostico/esp32_p087 sobre device_38A839E81F84 y descubrir
    // dinámicamente los nodos MultiNode V2 (/diagnostico/nodos_simulados + gateway_ESP32_DEVKIT_V1).
    const afterBench = mergeBenchTelemetryIntoPhysicalNode(
      latestDevices,
      latestBenchDiag,
      true
    );
    const finalMerged = mergeMultiNodeSimulatedDevices(
      afterBench,
      latestSimulatedNodes,
      latestGatewayDiag,
      { allowSimulatedDiscovery: true }
    );
    Object.keys(finalMerged).forEach((key) => {
      recordDevicePacketArrival(key, finalMerged[key]);
    });
    callback(finalMerged);
  };

  const devicesRef = buildOrgScopedQuery('dispositivos', scope);
  const unsubDevices = onValue(
    devicesRef,
    (snapshot) => {
      devicesLoaded = true;
      latestDevices = snapshot.exists() ? snapshot.val() || {} : {};
      emitGlobal();
    },
    (err) => {
      const msg = err?.message || String(err || 'Error leyendo /dispositivos');
      console.warn('Error subscribing to RTDB /dispositivos:', msg);
      updateBenchDiagnostics({
        devicesListener: {
          status: 'error',
          lastEventAt: Date.now(),
          error: msg,
        },
      });
      // Emitir igualmente si ya existe telemetría viva en /diagnostico/*
      if (latestBenchDiag || latestSimulatedNodes || latestGatewayDiag) {
        emitGlobal();
      }
    }
  );

  const unsubBench = onValue(
    ref(rtdb, BENCH_TELEMETRY_PATH),
    (snapshot) => {
      latestBenchDiag = snapshot.exists() ? snapshot.val() || null : null;
      recordBenchSnapshotForDiag(latestBenchDiag);
      emitGlobal();
    },
    (err) => {
      const msg = err?.message || String(err || `Error leyendo /${BENCH_TELEMETRY_PATH}`);
      console.warn(`Error subscribing to RTDB /${BENCH_TELEMETRY_PATH}:`, msg);
      latestBenchDiag = null;
      recordBenchListenerErrorForDiagnostics(err);
      emitGlobal();
    }
  );

  const unsubSimulatedNodes = onValue(
    ref(rtdb, MULTINODE_SIMULATED_NODES_PATH),
    (snapshot) => {
      latestSimulatedNodes = snapshot.exists() ? snapshot.val() || null : null;
      emitGlobal();
    },
    (err) => {
      console.warn(
        `Error subscribing to RTDB /${MULTINODE_SIMULATED_NODES_PATH}:`,
        err?.message || err
      );
      latestSimulatedNodes = null;
      emitGlobal();
    }
  );

  const unsubGatewayDiag = onValue(
    ref(rtdb, MULTINODE_GATEWAY_DIAG_PATH),
    (snapshot) => {
      latestGatewayDiag = snapshot.exists() ? snapshot.val() || null : null;
      emitGlobal();
    },
    (err) => {
      console.warn(
        `Error subscribing to RTDB /${MULTINODE_GATEWAY_DIAG_PATH}:`,
        err?.message || err
      );
      latestGatewayDiag = null;
      emitGlobal();
    }
  );

  return () => {
    unsubDevices();
    unsubBench();
    unsubSimulatedNodes();
    unsubGatewayDiag();
  };
}

export function subscribeToRTDBDevices(
  callback: (devices: SensorDevice[]) => void,
  timeoutSeconds: number = DEFAULT_DEVICE_TIMEOUT_SECONDS,
  scope?: RTDBSubscriptionScope
): () => void {
  return subscribeToRTDBDevicesRaw((incoming) => {
    const combined: SensorDevice[] = Object.keys(incoming).map((key) =>
      mapRTDBDeviceToSensorDevice(key, incoming[key], timeoutSeconds)
    );
    callback(combined);
  }, scope);
}

export async function forceRefreshDevicesFromRTDB(
  timeoutSeconds: number = DEFAULT_DEVICE_TIMEOUT_SECONDS,
  scope?: RTDBSubscriptionScope
): Promise<{ raw: Record<string, any>; devices: SensorDevice[] }> {
  const benchSnap = await get(ref(rtdb, BENCH_TELEMETRY_PATH)).catch(() => null);
  const benchRaw = benchSnap && benchSnap.exists() ? benchSnap.val() : null;

  if (scope?.role && !isGlobalMineSafeAdmin(scope.role)) {
    const targetOrgId =
      scope.organizationId && scope.organizationId !== 'all'
        ? scope.organizationId
        : DEFAULT_ORGANIZATION_ID;
    const raw: Record<string, any> = {};
    const scopedSimNodes: Record<string, any> = {};

    let scopedFailedForIndex = false;
    const scopedSnap = await get(buildOrgScopedQuery('dispositivos', scope)).catch((err) => {
      if (/index/i.test(String(err?.message || err || ''))) {
        scopedFailedForIndex = true;
      }
      return null;
    });
    if (scopedSnap && scopedSnap.exists()) {
      const val = scopedSnap.val() || {};
      Object.keys(val).forEach((id) => {
        const devOrg = val[id]?.organizationId || DEFAULT_ORGANIZATION_ID;
        if (devOrg === targetOrgId) {
          raw[id] = val[id];
        }
      });
    } else if (scopedFailedForIndex) {
      const allSnap = await get(ref(rtdb, 'dispositivos')).catch(() => null);
      if (allSnap && allSnap.exists()) {
        const val = allSnap.val() || {};
        Object.keys(val).forEach((id) => {
          const devOrg = val[id]?.organizationId || DEFAULT_ORGANIZATION_ID;
          if (devOrg === targetOrgId) {
            raw[id] = val[id];
          }
        });
      }
    }

    const explicitIds = Array.from(new Set((scope.deviceIds || []).filter(Boolean)));
    for (const id of explicitIds) {
      if (!raw[id]) {
        const snap = await get(ref(rtdb, `dispositivos/${id}`)).catch(() => null);
        if (snap && snap.exists()) {
          const val = snap.val();
          const explicitOrg = typeof val?.organizationId === 'string' ? val.organizationId.trim() : '';
          if (!explicitOrg || explicitOrg === targetOrgId) {
            raw[id] = val;
          }
        }
      }
      if (isMultiNodeSimulatedDeviceId(id)) {
        const simSnap = await get(ref(rtdb, `${MULTINODE_SIMULATED_NODES_PATH}/${id}`)).catch(() => null);
        if (simSnap && simSnap.exists()) {
          scopedSimNodes[id] = simSnap.val();
        }
      }
    }

    let gwDiagRaw: Record<string, any> | null = null;
    if (
      explicitIds.includes(GATEWAY_DEVICE_ID) ||
      explicitIds.some((id) => isMultiNodeSimulatedDeviceId(id))
    ) {
      const gwSnap = await get(ref(rtdb, MULTINODE_GATEWAY_DIAG_PATH)).catch(() => null);
      gwDiagRaw = gwSnap && gwSnap.exists() ? gwSnap.val() : null;
    }

    const afterBench = mergeBenchTelemetryIntoPhysicalNode(raw, benchRaw, false);
    const mergedRaw = mergeMultiNodeSimulatedDevices(afterBench, scopedSimNodes, gwDiagRaw, {
      allowSimulatedDiscovery: false,
      allowedDeviceIds: [...Object.keys(afterBench), ...explicitIds],
      timeoutSeconds,
    });
    const devices = Object.keys(mergedRaw).map((id) => {
      recordDevicePacketArrival(id, mergedRaw[id]);
      return mapRTDBDeviceToSensorDevice(id, mergedRaw[id], timeoutSeconds);
    });
    return { raw: mergedRaw, devices };
  }

  const [snapshot, simNodesSnap, gwDiagSnap] = await Promise.all([
    get(ref(rtdb, 'dispositivos')).catch(() => null),
    get(ref(rtdb, MULTINODE_SIMULATED_NODES_PATH)).catch(() => null),
    get(ref(rtdb, MULTINODE_GATEWAY_DIAG_PATH)).catch(() => null),
  ]);
  const incoming = snapshot && snapshot.exists() ? snapshot.val() || {} : {};
  const simNodesRaw = simNodesSnap && simNodesSnap.exists() ? simNodesSnap.val() : null;
  const gwDiagRaw = gwDiagSnap && gwDiagSnap.exists() ? gwDiagSnap.val() : null;
  const afterBench = mergeBenchTelemetryIntoPhysicalNode(incoming, benchRaw, true);
  const mergedRaw = mergeMultiNodeSimulatedDevices(afterBench, simNodesRaw, gwDiagRaw, {
    allowSimulatedDiscovery: true,
    timeoutSeconds,
  });
  const devices = Object.keys(mergedRaw).map((key) => {
    recordDevicePacketArrival(key, mergedRaw[key]);
    return mapRTDBDeviceToSensorDevice(key, mergedRaw[key], timeoutSeconds);
  });
  return { raw: mergedRaw, devices };
}

export function extractAlarmAuditRecords(devices: SensorDevice[]): AlarmAuditRecord[] {
  const records: AlarmAuditRecord[] = [];

  devices.forEach((dev) => {
    if (isExperimentalBenchDevice(dev) || isSimulatedDevice(dev)) return;
    if (dev.registroAlarmas && typeof dev.registroAlarmas === 'object') {
      Object.keys(dev.registroAlarmas).forEach((alarmKey) => {
        const item = dev.registroAlarmas![alarmKey];
        if (item) {
          records.push({
            id: alarmKey,
            deviceId: dev.id,
            deviceName: dev.name,
            fecha: item.fecha || dev.fecha || '11/11/2026',
            hora: item.hora || dev.hora || '00:00:00',
            origen: item.origen || item.origen_alarma || dev.origenAlarma || 'CAUSA_NATURAL_SENSORES',
            descripcion: item.descripcion || item.descripcion_monitoreo || dev.descripcionMonitoreo || 'Alarma registrada en nodo ESP32',
            co: typeof item.CO === 'number' ? item.CO : (typeof item.co === 'number' ? item.co : (dev.rawCO || 0)),
            pm25: typeof item.PM2_5 === 'number' ? item.PM2_5 : (typeof item.pm25 === 'number' ? item.pm25 : (dev.rawPM25 || 0)),
            temperatura: typeof item.temperatura === 'number' ? item.temperatura : (typeof item.temp === 'number' ? item.temp : (dev.rawTemp || 0)),
            humedad: typeof item.humedad === 'number' ? item.humedad : (typeof item.hum === 'number' ? item.hum : (dev.rawHum || 0)),
            via: item.via || 'WIFI_DIRECTO',
            timestampServer: item.timestamp_server || item.last_update_server || 0,
            sourceKind: 'esp32',
          });
        }
      });
    }
  });

  return records.sort((a, b) => {
    if (b.timestampServer && a.timestampServer) {
      return b.timestampServer - a.timestampServer;
    }
    return b.hora.localeCompare(a.hora);
  });
}

export function buildAuditRecordsFromAlerts(alerts: SafetyAlert[]): AlarmAuditRecord[] {
  const originMap: Record<string, string> = {
    emergencia_real: 'BITACORA_EMERGENCIA_REAL',
    simulacro: 'BITACORA_SIMULACRO',
    falsa_alarma_sensor: 'BITACORA_FALSA_ALARMA',
    prueba_operativa: 'BITACORA_PRUEBA_OPERATIVA',
  };

  return alerts
    .filter((a) => a.resolved || Boolean(a.resolutionDetails?.comment))
    .map((a) => {
      const dateSource = a.resolutionDetails?.resolvedAt || a.timestamp || '';
      const parts = dateSource.split(',').map((p) => p.trim());
      const fecha = parts[0] || dateSource || 'Reciente';
      const hora = parts[1] || (a.timestampMs ? new Date(a.timestampMs).toLocaleTimeString('es-CL') : '—');
      const origen = a.resolutionDetails?.resolutionType
        ? originMap[a.resolutionDetails.resolutionType] || 'BITACORA_CONSOLIDADA'
        : 'BITACORA_CONSOLIDADA';

      return {
        id: a.code ? `${a.code} (${a.id})` : a.id,
        deviceId: a.sensorCode || a.sensorId,
        deviceName: a.sectorName || a.sensorCode || a.sensorId,
        fecha,
        hora,
        origen,
        alertTitle: a.title,
        closingTitle: a.resolutionDetails?.closingTitle,
        attachments: a.resolutionDetails?.attachments,
        descripcion:
          a.resolutionDetails?.comment ||
          a.suggestedAction ||
          'Alerta cerrada y documentada en bitácora.',
        correctiveActions: a.resolutionDetails?.correctiveActions,
        resolvedBy: a.resolutionDetails?.resolvedBy || a.acknowledgedBy || 'Supervisor',
        metricSummary: `${a.variableName}: ${a.recordedValue} (Límite: ${a.safeLimit})`,
        co: 0,
        pm25: 0,
        temperatura: 0,
        humedad: 0,
        via: 'BITACORA_WEB_RTDB',
        timestampServer: a.timestampMs || 0,
        sourceKind: 'bitacora_web' as const,
      };
    });
}

export function subscribeToRTDBAlarmRecords(
  callback: (records: AlarmAuditRecord[]) => void,
  scope?: RTDBSubscriptionScope
): () => void {
  return subscribeToRTDBDevices((devList) => {
    callback(extractAlarmAuditRecords(devList));
  }, 20, scope);
}

export function subscribeToRTDBUsers(
  callback: (users: UserProfile[]) => void,
  scope?: RTDBSubscriptionScope
): () => void {
  // Operadores y Supervisores no tienen permiso de lectura sobre la colección completa /usuarios
  if (scope?.role === 'operador' || scope?.role === 'supervisor') {
    callback([]);
    return () => {};
  }

  const usersRef = buildOrgScopedQuery('usuarios', scope);
  const precargaRef = ref(rtdb, 'precarga/usuarios_contratos');

  let directUsers: Record<string, any> = {};
  let precargaUsers: Record<string, any> = {};

  const emitCombined = () => {
    const list: UserProfile[] = [];
    const seenOrgEmails = new Set<string>();

    // 1. Process direct usuarios (priorizar UIDs reales de Firebase Auth / manual_temp_uid_01 frente a llaves temporales usr-* / pend_*)
    const sortedDirectKeys = Object.keys(directUsers).sort((a, b) => {
      const aTemp = a.startsWith('usr-') || a.startsWith('usr0') || a.startsWith('pend_') ? 1 : 0;
      const bTemp = b.startsWith('usr-') || b.startsWith('usr0') || b.startsWith('pend_') ? 1 : 0;
      return aTemp - bTemp;
    });
    sortedDirectKeys.forEach((key) => {
      const u = mapRTDBUserToUserProfile(key, directUsers[key]);
      const emailLower = (u.email || '').trim().toLowerCase();
      const orgKey = `${u.organizationId || DEFAULT_ORGANIZATION.id}::${emailLower}`;
      if (emailLower && seenOrgEmails.has(orgKey)) {
        return;
      }
      if (emailLower) seenOrgEmails.add(orgKey);
      list.push(u);
    });

    // 2. Process precarga usuarios (solo para superadmin)
    if (!scope?.role || scope.role === 'superadmin') {
      Object.keys(precargaUsers).forEach((key) => {
        const pu = precargaUsers[key];
        const email = (pu?.email || '').trim().toLowerCase();
        const orgKey = `${pu?.organizationId || DEFAULT_ORGANIZATION.id}::${email}`;
        if (!seenOrgEmails.has(orgKey)) {
          if (email) seenOrgEmails.add(orgKey);
          list.push(mapRTDBUserToUserProfile(key, pu));
        }
      });
    }

    // Garantizar que solo exista un único SuperAdministrador en toda la plataforma
    const hasCanonicalSuper = list.some(
      (u) => u.id === PRIMARY_SUPERADMIN_UID || u.email.toLowerCase() === PRIMARY_SUPERADMIN_EMAIL
    );
    let superAssigned = false;
    const normalizedList = list.map((u) => {
      const isCanonical = u.id === PRIMARY_SUPERADMIN_UID || u.email.toLowerCase() === PRIMARY_SUPERADMIN_EMAIL;
      if (hasCanonicalSuper) {
        if (isCanonical) {
          superAssigned = true;
          return {
            ...u,
            role: 'superadmin' as UserRole,
            roleLabel: 'Super Administrador de Seguridad Minera',
          };
        }
        if (u.role === 'superadmin') {
          return {
            ...u,
            role: 'admin' as UserRole,
            roleLabel: 'Administrador de Empresa',
          };
        }
        return u;
      }

      if (u.role === 'superadmin') {
        if (!superAssigned) {
          superAssigned = true;
          return u;
        }
        return {
          ...u,
          role: 'admin' as UserRole,
          roleLabel: 'Administrador de Empresa',
        };
      }
      return u;
    });

    const roleOrder: Record<UserRole, number> = {
      superadmin: 0,
      admin_minesafe: 1,
      admin: 2,
      supervisor: 3,
      operador: 4,
    };
    normalizedList.sort((a, b) => {
      const diff = (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9);
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name);
    });

    callback(normalizedList);
  };

  const unsub1 = onValue(
    usersRef,
    (snapshot) => {
      directUsers = snapshot.exists() ? snapshot.val() || {} : {};
      emitCombined();
    },
    (err) => {
      console.warn('Acceso restringido o error leyendo /usuarios en RTDB:', err?.message || err);
    }
  );

  const unsub2 = !scope?.role || scope.role === 'superadmin'
    ? onValue(
        precargaRef,
        (snapshot) => {
          if (snapshot.exists()) {
            precargaUsers = snapshot.val() || {};
            emitCombined();
          }
        },
        () => {}
      )
    : () => {};

  return () => {
    unsub1();
    unsub2();
  };
}

export function subscribeToRTDBRentals(
  callback: (rentals: DeviceRental[]) => void,
  scope?: RTDBSubscriptionScope
): () => void {
  const contractsRef = buildOrgScopedQuery('contratos', scope);
  const precargaRef = ref(rtdb, 'precarga/usuarios_contratos');

  let directContracts: Record<string, any> = {};
  let precargaData: Record<string, any> = {};

  const emitCombined = () => {
    const list: DeviceRental[] = [];
    const seenContracts = new Set<string>();

    Object.keys(directContracts).forEach((key) => {
      const r = mapRTDBContractToRental(key, directContracts[key]);
      list.push(r);
      seenContracts.add(key);
    });

    if (!scope?.role || scope.role === 'superadmin') {
      Object.keys(precargaData).forEach((userKey) => {
        const u = precargaData[userKey];
        const arr = u?.arriendo;
        if (arr && arr.idArriendo && !seenContracts.has(arr.idArriendo)) {
          seenContracts.add(arr.idArriendo);
          list.push({
            id: arr.idArriendo,
            organizationId: DEFAULT_ORGANIZATION.id,
            contractNumber: arr.idArriendo,
            deviceCode: u?.dispositivo?.nombreDispositivo || u?.dispositivo?.idDispositivo || 'DS-FLEET',
            deviceType: 'Detector Portátil MultiGas Certificado DS 132',
            provider: u.empresa || 'MineSafe / Dräger Mining',
            startDate: arr.fechaInicioArriendo || '2025-01-01',
            endDate: arr.fechaTerminoArriendo || '2026-01-01',
            monthlyCostClp: 220000,
            paymentStatus: arr.estadoArriendo === 'Vigente' ? 'al_dia' : (arr.estadoArriendo === 'Vencido' ? 'vencido' : 'proximo_a_vencer'),
            lastPaymentDate: '2025-11-20',
            nextDueDate: arr.fechaTerminoArriendo || '2026-03-31',
            assignedTechnician: u.tec || 'Ingeniería MineSafe',
            notes: `Arriendo de ${u.nombre || 'Trabajador'} (${u.cargo || 'Operador'}).`,
          });
        }
      });
    }

    callback(list);
  };

  const unsub1 = onValue(
    contractsRef,
    (snapshot) => {
      directContracts = snapshot.exists() ? snapshot.val() || {} : {};
      emitCombined();
    },
    (err) => {
      console.warn('Error subscribing to RTDB /contratos:', err?.message || err);
    }
  );

  const unsub2 = !scope?.role || scope.role === 'superadmin'
    ? onValue(
        precargaRef,
        (snapshot) => {
          if (snapshot.exists()) {
            precargaData = snapshot.val() || {};
            emitCombined();
          }
        },
        () => {}
      )
    : () => {};

  return () => {
    unsub1();
    unsub2();
  };
}

// -------------------------------------------------------------
// WRITE OPERATIONS TO RTDB
// -------------------------------------------------------------
export async function updateDeviceInRTDB(
  deviceId: string, 
  data: { 
    CO?: number; 
    PM2_5?: number; 
    temperatura?: number; 
    humedad?: number;
    alarma?: boolean;
    buzzer?: boolean;
    luz?: boolean;
    iluminacion_led?: boolean;
    estado_adquisicion?: string;
  }
): Promise<void> {
  try {
    const devRef = ref(rtdb, `dispositivos/${deviceId}`);
    await update(devRef, {
      ...data,
      last_update_server: Date.now(),
    });
  } catch (err) {
    console.warn('Error updating device in RTDB:', err);
  }
}

async function resolveAuthorizedOrganizationsForActor(
  actingUser?: UserProfile | null,
  targetOrgId?: string,
  providedOrgs?: Organization[]
): Promise<Organization[] | undefined> {
  if (!actingUser || actingUser.role !== 'admin') return providedOrgs;
  if (providedOrgs && providedOrgs.length > 0) return providedOrgs;
  const normalized = targetOrgId || DEFAULT_ORGANIZATION_ID;
  if (normalized === (actingUser.organizationId || DEFAULT_ORGANIZATION_ID)) {
    return providedOrgs;
  }
  const snap = await get(ref(rtdb, `organizaciones/${normalized}`)).catch(() => null);
  if (snap?.exists()) {
    return [{ id: normalized, ...(snap.val() || {}) } as Organization];
  }
  return undefined;
}

export async function addUserToRTDB(
  user: UserProfile,
  actingUser?: UserProfile | null,
  organizations?: Organization[]
): Promise<void> {
  try {
    // Regla de plataforma: Solo existe un único SuperAdmin; nuevos usuarios nunca pueden crearse como superadmin
    const isCanonicalSuper =
      user.id === PRIMARY_SUPERADMIN_UID || user.email.toLowerCase() === PRIMARY_SUPERADMIN_EMAIL;
    const safeRole: UserRole =
      user.role === 'superadmin' && !isCanonicalSuper ? 'admin' : user.role;

    const requestedOrgId = user.organizationId || actingUser?.organizationId || DEFAULT_ORGANIZATION.id;
    const resolvedOrgs = await resolveAuthorizedOrganizationsForActor(actingUser, requestedOrgId, organizations);

    const targetOrgId =
      actingUser?.role === 'admin'
        ? (isOrgAuthorizedForUser(actingUser, requestedOrgId, resolvedOrgs)
            ? requestedOrgId
            : actingUser.organizationId || DEFAULT_ORGANIZATION_ID)
        : requestedOrgId;

    if (actingUser) {
      const check = canProvisionUserInOrganization(actingUser, targetOrgId, safeRole, resolvedOrgs);
      if (!check.allowed) {
        throw new Error(check.reason || 'Permisos insuficientes para crear el usuario.');
      }
    }

    const cleanEmail = user.email.trim().toLowerCase();
    const userRef = ref(rtdb, `usuarios/${user.id}`);
    await set(userRef, {
      nombre: user.name,
      email: cleanEmail,
      organizationId: targetOrgId,
      isAdmin: safeRole === 'superadmin' || safeRole === 'admin_minesafe' || safeRole === 'admin',
      isSuperUser: safeRole === 'superadmin',
      tipoUsuario: safeRole,
      isActive: user.status === 'activo',
      pendingActivation: Boolean(user.pendingActivation),
      telefono: user.rut,
      cargo: user.shift || 'Turno Continuo A',
      geoMina: user.assignedSector || 'Mina Chuquicamata',
      deviceId: user.assignedDeviceCode || '',
      updatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.warn('Error adding user to RTDB:', err);
    throw new Error(err?.message || 'No se pudo registrar el perfil del usuario en Firebase RTDB.');
  }
}

export async function updateUserInRTDB(
  userId: string,
  updates: Partial<UserProfile>,
  actingUser?: UserProfile | null,
  organizations?: Organization[]
): Promise<void> {
  if (actingUser && !isAnyAdminRole(actingUser.role)) {
    throw new Error('Permisos insuficientes para modificar usuarios.');
  }

  const userRef = ref(rtdb, `usuarios/${userId}`);
  const existingSnap = await get(userRef).catch(() => null);
  const existingData = existingSnap?.exists() ? existingSnap.val() : null;

  const existingEmail = (existingData?.email || updates.email || '').trim().toLowerCase();
  const targetOrg = existingData?.organizationId || DEFAULT_ORGANIZATION_ID;
  const nextOrg = updates.organizationId || targetOrg;
  const isChangingOrganization = Boolean(
    updates.organizationId && nextOrg !== targetOrg
  );
  const existingMapped = existingData
    ? mapRTDBUserToUserProfile(userId, existingData)
    : ({
        id: userId,
        organizationId: targetOrg,
        name: updates.name || userId,
        email: existingEmail,
        role: 'operador',
        roleLabel: 'Operador',
        rut: updates.rut || '',
        shift: updates.shift || '',
        status: 'activo',
      } as UserProfile);

  const isTargetSuperAdmin =
    userId === PRIMARY_SUPERADMIN_UID ||
    existingEmail === PRIMARY_SUPERADMIN_EMAIL ||
    existingData?.isSuperUser === true ||
    existingData?.tipoUsuario === 'superadmin';

  // Protección absoluta: Nadie puede quitarle permisos ni desactivar al único SuperAdmin
  if (isTargetSuperAdmin) {
    if ((updates.role && updates.role !== 'superadmin') || updates.status === 'inactivo') {
      throw new Error('Acción denegada: No se pueden quitar permisos ni desactivar al SuperAdministrador.');
    }
  }

  // Regla: Solo existe un SuperAdmin en toda la plataforma
  if (updates.role === 'superadmin' && !isTargetSuperAdmin) {
    throw new Error('Acción denegada: Solo puede existir un único SuperAdministrador en toda la plataforma.');
  }

  if (actingUser) {
    const check = canModifyTargetUser(actingUser, existingMapped, updates.role, organizations);
    if (!check.allowed) {
      throw new Error(check.reason || 'Acción denegada para modificar este usuario.');
    }
  }

  // Aislamiento de organización: un Administrador local no puede modificar usuarios de organizaciones no autorizadas
  if (actingUser && actingUser.role === 'admin') {
    const resolvedOrgs = await resolveAuthorizedOrganizationsForActor(actingUser, targetOrg, organizations);
    if (!isOrgAuthorizedForUser(actingUser, targetOrg, resolvedOrgs)) {
      throw new Error('Acción denegada: No puedes modificar usuarios de otra organización.');
    }
    if (updates.organizationId) {
      const nextResolvedOrgs = await resolveAuthorizedOrganizationsForActor(
        actingUser,
        updates.organizationId,
        resolvedOrgs
      );
      if (!isOrgAuthorizedForUser(actingUser, updates.organizationId, nextResolvedOrgs)) {
        throw new Error('Acción denegada: Un Administrador no puede reasignar usuarios a una organización no autorizada.');
      }
    }
  }

  const rtdbUpdates: any = {
    updatedAt: new Date().toISOString(),
  };
  if (updates.name) rtdbUpdates.nombre = updates.name;
  if (updates.email) rtdbUpdates.email = updates.email.trim().toLowerCase();
  if (updates.organizationId && (!actingUser || isAnyAdminRole(actingUser.role))) {
    rtdbUpdates.organizationId = updates.organizationId;
    if (isChangingOrganization) {
      // Limpiar asignaciones operacionales de la empresa anterior para evitar cruces entre organizaciones
      rtdbUpdates.assignedSiteId = null;
      rtdbUpdates.assignedSiteName = null;
      rtdbUpdates.assignedCrewId = null;
      rtdbUpdates.assignedCrewName = null;
      rtdbUpdates.assignedSectors = null;
      rtdbUpdates.deviceId = updates.assignedDeviceCode ?? '';
      rtdbUpdates.geoMina = updates.assignedSector ?? 'Sin asignar';
    }
  }
  if (updates.rut) rtdbUpdates.codigoId = updates.rut;
  if (updates.role) {
    rtdbUpdates.tipoUsuario = updates.role;
    rtdbUpdates.isAdmin =
      updates.role === 'admin' || updates.role === 'admin_minesafe' || updates.role === 'superadmin';
    rtdbUpdates.isSuperUser = updates.role === 'superadmin';
  }
  if (updates.status) {
    rtdbUpdates.isActive = updates.status === 'activo';
    if (updates.status === 'inactivo') {
      rtdbUpdates.blockedReason = updates.blockedReason || 'Bloqueado por desvinculación empresarial';
      rtdbUpdates.blockedAt = updates.blockedAt || Date.now();
      rtdbUpdates.blockedBy = updates.blockedBy || actingUser?.name || actingUser?.email || 'Administración';
    } else {
      rtdbUpdates.blockedReason = null;
      rtdbUpdates.blockedAt = null;
      rtdbUpdates.blockedBy = null;
    }
  }
  if (updates.assignedSector) rtdbUpdates.geoMina = updates.assignedSector;
  if (updates.assignedDeviceCode !== undefined) rtdbUpdates.deviceId = updates.assignedDeviceCode;

  try {
    await update(userRef, rtdbUpdates);

    // Sincronizar únicamente nodos duplicados del mismo correo dentro de la MISMA organización
    if (existingEmail) {
      const orgUsersSnap = await get(
        query(ref(rtdb, 'usuarios'), orderByChild('organizationId'), equalTo(targetOrg))
      ).catch(() => null);
      if (orgUsersSnap?.exists()) {
        const orgUsers = orgUsersSnap.val() || {};
        const siblingKeys = Object.keys(orgUsers).filter(
          (k) =>
            k !== userId &&
            (orgUsers[k]?.email || '').trim().toLowerCase() === existingEmail &&
            (orgUsers[k]?.organizationId || DEFAULT_ORGANIZATION_ID) === targetOrg
        );
        for (const sibKey of siblingKeys) {
          await update(ref(rtdb, `usuarios/${sibKey}`), rtdbUpdates).catch(() => {});
        }
      }
    }
  } catch (err: any) {
    console.warn('Error updating user in RTDB:', err);
    const rawMsg = String(err?.message || err || '');
    if (rawMsg.toLowerCase().includes('permission') || rawMsg.toLowerCase().includes('denied')) {
      throw new Error(
        'Firebase RTDB rechazó actualizar el usuario (PERMISSION_DENIED). Verifica las Reglas de Realtime Database para el SuperAdmin.'
      );
    }
    throw err;
  }
}

export function buildRentalContractRTDBPayload(rental: DeviceRental): Record<string, any> {
  const now = Date.now();
  const orgId = rental.organizationId || DEFAULT_ORGANIZATION.id;
  const cleanContractNumber = (rental.contractNumber || '').trim();
  const cleanDeviceCode = (rental.deviceCode || '').trim();
  const cleanProvider = (rental.provider || '').trim();
  const monthlyCost = Number(rental.monthlyCostClp) || 0;
  const estadoGeneral =
    rental.paymentStatus === 'al_dia'
      ? 'Activo'
      : rental.paymentStatus === 'vencido'
      ? 'Vencido'
      : 'Por Vencer';

  return {
    id: rental.id || cleanContractNumber,
    contractNumber: cleanContractNumber,
    deviceCode: cleanDeviceCode,
    deviceType: rental.deviceType || 'Detector MultiGas Certificado DS 132',
    provider: cleanProvider,
    organizationId: orgId,
    monthlyCostClp: monthlyCost,
    paymentStatus: rental.paymentStatus || 'al_dia',
    startDate: rental.startDate,
    endDate: rental.endDate,
    lastPaymentDate: rental.lastPaymentDate,
    nextDueDate: rental.nextDueDate,
    assignedTechnician: rental.assignedTechnician || 'Ingeniería MineSafe',
    notes: rental.notes || '',
    // Campos legacy mantenidos para compatibilidad
    deviceId: cleanDeviceCode,
    empresa: cleanProvider,
    monto: monthlyCost,
    tec: rental.assignedTechnician || 'Ingeniería MineSafe',
    estadoGeneral,
    fechaInicioArriendo: rental.startDate,
    fechaFinArriendo: rental.endDate,
    fechaInicioContrato: rental.startDate,
    fechaFinContrato: rental.endDate,
    fechaUltimoPago: rental.lastPaymentDate,
    updatedAt: now,
  };
}

export function validateRentalDatesAndCost(params: {
  startDate?: string;
  endDate?: string;
  monthlyCostClp: number;
  deviceCode: string;
  provider: string;
  organizationId?: string;
  registeredDevices?: RegisteredDeviceConfig[];
}): void {
  if (!params.deviceCode.trim() || !params.provider.trim()) {
    throw new Error('Código de dispositivo y proveedor son obligatorios.');
  }
  if (!Number.isFinite(Number(params.monthlyCostClp)) || Number(params.monthlyCostClp) <= 0) {
    throw new Error('El costo mensual (CLP) debe ser mayor a 0.');
  }
  if (params.startDate && params.endDate) {
    const startMs = new Date(`${params.startDate}T00:00:00`).getTime();
    const endMs = new Date(`${params.endDate}T23:59:59`).getTime();
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs < startMs) {
      throw new Error('La fecha de término del contrato no puede ser anterior a la fecha de inicio.');
    }
  }
  if (params.registeredDevices && params.registeredDevices.length > 0) {
    const matched = params.registeredDevices.find(
      (d) =>
        d.id.toLowerCase() === params.deviceCode.trim().toLowerCase() ||
        d.name.toLowerCase() === params.deviceCode.trim().toLowerCase()
    );
    if (matched) {
      if (matched.enabled === false) {
        throw new Error(`El dispositivo "${matched.id}" está deshabilitado en la plataforma.`);
      }
      if (
        params.organizationId &&
        matched.organizationId &&
        matched.organizationId !== params.organizationId
      ) {
        throw new Error(
          `El dispositivo "${matched.id}" pertenece a otra organización (${matched.organizationId}).`
        );
      }
    }
  }
}

export async function addRentalContractToRTDB(
  rental: DeviceRental,
  actingUser?: UserProfile | null,
  registeredDevices?: RegisteredDeviceConfig[],
  organizations?: Organization[]
): Promise<void> {
  if (actingUser) {
    if (actingUser.status !== 'activo') {
      throw new Error('Tu sesión se encuentra inactiva.');
    }
    if (!isAnyAdminRole(actingUser.role)) {
      throw new Error('Permisos insuficientes: solo Administradores o SuperAdministrador pueden registrar contratos.');
    }
  }
  const cleanKey = (rental.contractNumber || '').trim().replace(/[.#$/[\]]/g, '_');
  if (!cleanKey) {
    throw new Error('El número de contrato es obligatorio.');
  }
  const requestedOrg = rental.organizationId || actingUser?.organizationId || DEFAULT_ORGANIZATION.id;
  const resolvedOrgs = await resolveAuthorizedOrganizationsForActor(actingUser, requestedOrg, organizations);

  if (actingUser) {
    const access = canManageContractsAndPayments(actingUser, requestedOrg, resolvedOrgs);
    if (!access.allowed) {
      throw new Error(access.reason || 'Permisos insuficientes para registrar contratos en esta organización.');
    }
  }

  const targetOrgId =
    actingUser?.role === 'admin'
      ? (isOrgAuthorizedForUser(actingUser, requestedOrg, resolvedOrgs)
          ? requestedOrg
          : actingUser.organizationId || DEFAULT_ORGANIZATION_ID)
      : requestedOrg;

  validateRentalDatesAndCost({
    startDate: rental.startDate,
    endDate: rental.endDate,
    monthlyCostClp: rental.monthlyCostClp,
    deviceCode: rental.deviceCode,
    provider: rental.provider,
    organizationId: targetOrgId,
    registeredDevices,
  });

  const contractRef = ref(rtdb, `contratos/${cleanKey}`);
  const existingSnap = await get(contractRef).catch(() => null);
  if (existingSnap && existingSnap.exists()) {
    throw new Error(`Ya existe un contrato registrado con el número "${cleanKey}".`);
  }

  const payload = buildRentalContractRTDBPayload({
    ...rental,
    contractNumber: cleanKey,
    organizationId: targetOrgId,
  });
  await set(contractRef, { ...payload, createdAt: Date.now() });
}

export async function updateRentalContractInRTDB(
  contractId: string,
  updates: Partial<DeviceRental>,
  actingUser?: UserProfile | null,
  registeredDevices?: RegisteredDeviceConfig[],
  organizations?: Organization[]
): Promise<DeviceRental> {
  if (actingUser) {
    if (actingUser.status !== 'activo') {
      throw new Error('Tu sesión se encuentra inactiva.');
    }
    if (!isAnyAdminRole(actingUser.role)) {
      throw new Error('Permisos insuficientes: solo Administradores o SuperAdministrador pueden editar contratos.');
    }
  }

  const cleanKey = contractId.trim().replace(/[.#$/[\]]/g, '_');
  if (!cleanKey) {
    throw new Error('ID de contrato inválido.');
  }

  const contractRef = ref(rtdb, `contratos/${cleanKey}`);
  const snap = await get(contractRef);
  if (!snap.exists()) {
    throw new Error(`No existe el contrato "${cleanKey}" en Firebase RTDB.`);
  }

  const currentMapped = mapRTDBContractToRental(cleanKey, snap.val());
  if (actingUser?.role === 'admin') {
    const resolvedOrgs = await resolveAuthorizedOrganizationsForActor(
      actingUser,
      currentMapped.organizationId,
      organizations
    );
    if (!isOrgAuthorizedForUser(actingUser, currentMapped.organizationId, resolvedOrgs)) {
      throw new Error('Acción denegada: No puedes editar contratos de otra organización.');
    }
  }

  const merged: DeviceRental = {
    ...currentMapped,
    ...updates,
    id: cleanKey,
    contractNumber: currentMapped.contractNumber,
    organizationId: currentMapped.organizationId || DEFAULT_ORGANIZATION.id,
  };

  validateRentalDatesAndCost({
    startDate: merged.startDate,
    endDate: merged.endDate,
    monthlyCostClp: merged.monthlyCostClp,
    deviceCode: merged.deviceCode,
    provider: merged.provider,
    organizationId: merged.organizationId,
    registeredDevices,
  });

  const payload = buildRentalContractRTDBPayload(merged);
  await update(contractRef, payload);
  return merged;
}

export function buildAtomicPaymentUpdates(params: {
  contractKey: string;
  pagoId: string;
  organizationId: string;
  amount: number;
  fechaPago: string;
  recordedBy: string;
  nowMs: number;
}): Record<string, any> {
  const { contractKey, pagoId, organizationId, amount, fechaPago, recordedBy, nowMs } = params;
  return {
    [`pagos/${pagoId}`]: {
      id: pagoId,
      idContrato: contractKey,
      organizationId,
      monto: amount,
      estado: 'Pagado',
      fechaPago,
      referencia: `REF-${pagoId}`,
      recordedBy,
      timestamp: nowMs,
    },
    [`contratos/${contractKey}/paymentStatus`]: 'al_dia',
    [`contratos/${contractKey}/estadoGeneral`]: 'Activo',
    [`contratos/${contractKey}/lastPaymentDate`]: fechaPago,
    [`contratos/${contractKey}/fechaUltimoPago`]: fechaPago,
    [`contratos/${contractKey}/updatedAt`]: nowMs,
  };
}

export async function recordPaymentInRTDB(
  contractId: string,
  amount: number,
  options?: { organizationId?: string; actingUser?: UserProfile | null; organizations?: Organization[] }
): Promise<{ pagoId: string; fechaPago: string; amount: number }> {
  const actingUser = options?.actingUser;
  if (actingUser) {
    if (actingUser.status !== 'activo') {
      throw new Error('Tu sesión se encuentra inactiva.');
    }
    if (!isAnyAdminRole(actingUser.role)) {
      throw new Error('Permisos insuficientes: solo Administradores o SuperAdministrador pueden registrar pagos.');
    }
  }

  const cleanContractKey = contractId.trim().replace(/[.#$/[\]]/g, '_');
  if (!cleanContractKey) {
    throw new Error('El identificador del contrato es obligatorio.');
  }

  const contractRef = ref(rtdb, `contratos/${cleanContractKey}`);
  const contractSnap = await get(contractRef);
  if (!contractSnap.exists()) {
    throw new Error(`No existe el contrato "${cleanContractKey}" en RTDB. Registra el contrato antes de imputar pagos.`);
  }
  const existingContract = contractSnap.val();
  const targetOrgId = existingContract?.organizationId || DEFAULT_ORGANIZATION.id;

  if (actingUser?.role === 'admin') {
    const resolvedOrgs = await resolveAuthorizedOrganizationsForActor(
      actingUser,
      targetOrgId,
      options?.organizations
    );
    if (!isOrgAuthorizedForUser(actingUser, targetOrgId, resolvedOrgs)) {
      throw new Error('Acción denegada: El contrato pertenece a otra organización.');
    }
  } else if (options?.organizationId && options.organizationId !== 'all' && options.organizationId !== targetOrgId) {
    throw new Error('El contrato no coincide con la organización seleccionada.');
  }

  const contractAmount =
    typeof existingContract?.monthlyCostClp === 'number' && existingContract.monthlyCostClp > 0
      ? existingContract.monthlyCostClp
      : typeof existingContract?.monto === 'number' && existingContract.monto > 0
      ? existingContract.monto
      : Number(amount);

  const safeAmount = Number(amount) > 0 ? Number(amount) : contractAmount;
  if (!Number.isFinite(safeAmount) || safeAmount <= 0) {
    throw new Error('El monto del pago debe ser mayor a cero y estar definido en el contrato.');
  }

  const today = new Date().toISOString().split('T')[0];
  if (
    (existingContract?.paymentStatus === 'al_dia' || existingContract?.estadoGeneral === 'Activo') &&
    (existingContract?.fechaUltimoPago === today || existingContract?.lastPaymentDate === today)
  ) {
    throw new Error(`El contrato ${cleanContractKey} ya registra un pago al día con fecha de hoy.`);
  }

  const now = Date.now();
  const fechaPago = today;
  const pagoId = `PAGO-${now}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const atomicUpdates = buildAtomicPaymentUpdates({
    contractKey: cleanContractKey,
    pagoId,
    organizationId: targetOrgId,
    amount: safeAmount,
    fechaPago,
    recordedBy: actingUser?.email || actingUser?.name || 'Sistema',
    nowMs: now,
  });

  await update(ref(rtdb), atomicUpdates);
  return { pagoId, fechaPago, amount: safeAmount };
}

export async function sendESP32Command(
  deviceId: string,
  command: 'pause' | 'resume' | 'ping',
  actingUser?: UserProfile | null
): Promise<void> {
  if (actingUser && !isAnyAdminRole(actingUser.role)) {
    throw new Error('Acceso denegado: Solo Administrador o SuperAdministrador puede enviar comandos al hardware ESP32.');
  }
  assertNotExperimentalBenchOperationalCommand(deviceId, 'sendESP32Command');
  try {
    const devRef = ref(rtdb, `dispositivos/${deviceId}`);
    const updates: any = {
      estado_adquisicion: command === 'pause' ? 'pausado' : 'activo',
    };
    if (command === 'ping') {
      updates.last_update_server = Date.now();
    }
    await update(devRef, updates);
  } catch (err) {
    console.warn('Error sending ESP32 command:', err);
  }
}

async function ensureValidDevicePayload(
  deviceId: string,
  payload: Record<string, any>
): Promise<void> {
  const devRef = ref(rtdb, `dispositivos/${deviceId}`);
  const snap = await get(devRef).catch(() => null);
  const existing = snap?.exists() ? snap.val() : null;

  const finalPayload: Record<string, any> = { ...payload };
  // Si el nodo aún no existe o le falta/excede alguno de los campos obligatorios de validación RTDB,
  // los completamos para garantizar que update() nunca sea rechazado por .validate
  const validCO = typeof existing?.CO === 'number' && existing.CO >= 0 && existing.CO <= 4095;
  const validPM = typeof existing?.PM2_5 === 'number' && existing.PM2_5 >= 0 && existing.PM2_5 <= 4095;
  const validTemp = typeof existing?.temperatura === 'number' && existing.temperatura >= -40 && existing.temperatura <= 100;
  const validHum = typeof existing?.humedad === 'number' && existing.humedad >= 0 && existing.humedad <= 100;

  if (!validCO && finalPayload.CO === undefined) finalPayload.CO = 45;
  if (!validPM && finalPayload.PM2_5 === undefined) finalPayload.PM2_5 = 25;
  if (!validTemp && finalPayload.temperatura === undefined) finalPayload.temperatura = 22.0;
  if (!validHum && finalPayload.humedad === undefined) finalPayload.humedad = 48;

  await update(devRef, finalPayload);
}

export async function resetGatewayDataInRTDB(
  deviceId?: string,
  actingUser?: UserProfile | null
): Promise<void> {
  if (actingUser && actingUser.role !== 'superadmin') {
    const isSuper = await verifySuperAdminPrivileges(actingUser);
    if (!isSuper) {
      throw new Error('Acceso denegado: Solo el SuperAdministrador autenticado puede resetear o apagar alarmas en RTDB.');
    }
  }
  const now = Date.now();
  const resetPayload = {
    CO: 45,
    PM2_5: 25,
    temperatura: 21.5,
    humedad: 48,
    last_update_server: now,
    alarma: false,
    alarma_activa: false,
    buzzer: false,
    luz: false,
    iluminacion_led: false,
    comando_web: 'APAGAR',
    silencio_remoto: true,
    origen_alarma: 'NINGUNO',
    estado_adquisicion: 'activo',
    simulacro_activo: false,
  };

  const orgScopeId = actingUser?.organizationId || DEFAULT_ORGANIZATION.id;
  const targetId = deviceId || 'device_38A839E81F84';
  assertNotExperimentalBenchOperationalCommand(targetId, 'resetGatewayDataInRTDB');
  await update(ref(rtdb, `dispositivos/${targetId}`), resetPayload);

  if (targetId !== 'device_38A839E81F84' && orgScopeId === DEFAULT_ORGANIZATION.id) {
    await ensureValidDevicePayload('device_38A839E81F84', {
      comando_web: 'APAGAR',
      silencio_remoto: true,
      alarma: false,
      alarma_activa: false,
      buzzer: false,
      luz: false,
      iluminacion_led: false,
      last_update_server: now,
    }).catch(() => {});
  }

  await update(ref(rtdb, `simulacro/${orgScopeId}`), {
    activo: false,
    finalizado: true,
    organizationId: orgScopeId,
    timestamp: now,
  }).catch(() => {});
  await update(ref(rtdb, `emergencia/${orgScopeId}`), {
    activa: false,
    organizationId: orgScopeId,
    timestamp: now,
  }).catch(() => {});
}

export async function toggleGatewayAlarmInRTDB(
  deviceId: string,
  active: boolean,
  actingUser?: UserProfile | null,
  options?: { targetDeviceIds?: string[]; organizationId?: string }
): Promise<void> {
  if (actingUser) {
    const authCheck = canControlMineAlarm(actingUser, options?.organizationId || actingUser.organizationId);
    if (!authCheck.allowed) {
      throw new Error(
        authCheck.reason ||
          'Acceso denegado: Solo el Administrador de la empresa minera o SuperAdmin puede operar la alarma.'
      );
    }
  }

  const now = Date.now();
  const payload: Record<string, any> = {
    comando_web: active ? 'ENCENDER' : 'APAGAR',
    silencio_remoto: !active,
    alarma: active,
    alarma_activa: active,
    buzzer: active,
    // Señalización visual LED (solo simulaciones / comandos web; baliza 12 V retirada del alcance)
    luz: active,
    iluminacion_led: active,
    origen_alarma: active ? 'ACTIVACION_MANUAL_WEB' : 'NINGUNO',
    last_update_server: now,
  };

  const primaryId = deviceId || 'device_38A839E81F84';
  assertNotExperimentalBenchOperationalCommand(primaryId, 'toggleGatewayAlarmInRTDB');
  const targetSet = new Set<string>(
    filterOutExperimentalBenchDeviceIds([primaryId, ...(options?.targetDeviceIds || [])])
  );

  await Promise.all(
    Array.from(targetSet).map((id) =>
      ensureValidDevicePayload(id, payload).catch((err) => {
        if (id === primaryId) throw err;
        console.warn(`No se pudo propagar comando de alarma a nodo subordinado ${id}:`, err);
      })
    )
  );
}

export async function shutdownAlarmCompletelyInRTDB(
  deviceId: string,
  actingUser: UserProfile | null,
  options?: { resetSensorBaselines?: boolean; organizationId?: string; targetDeviceIds?: string[] }
): Promise<void> {
  const authCheck = canControlMineAlarm(actingUser, options?.organizationId);
  if (!authCheck.allowed) {
    throw new Error(
      authCheck.reason ||
        'Acceso denegado: Se requieren permisos de Administrador de Empresa o SuperAdmin para apagar la alarma.'
    );
  }

  const now = Date.now();
  const orgScopeId =
    (options?.organizationId && options.organizationId !== 'all' ? options.organizationId : null) ||
    actingUser?.organizationId ||
    DEFAULT_ORGANIZATION.id;
  const primaryId = deviceId || 'device_38A839E81F84';
  assertNotExperimentalBenchOperationalCommand(primaryId, 'shutdownAlarmCompletelyInRTDB');
  const actorLabel = actingUser?.name || auth.currentUser?.email || 'Administrador';
  const devPayload: Record<string, any> = {
    comando_web: 'APAGAR',
    silencio_remoto: true,
    alarma: false,
    alarma_activa: false,
    buzzer: false,
    luz: false,
    iluminacion_led: false,
    simulacro_activo: false,
    origen_alarma: 'NINGUNO',
    descripcion_monitoreo: `Alarma y señalización detenidas por ${actorLabel}.`,
    last_update_server: now,
  };

  if (options?.resetSensorBaselines) {
    devPayload.CO = 45;
    devPayload.PM2_5 = 25;
    devPayload.estado_adquisicion = 'activo';
  }

  const targetSet = new Set<string>(
    filterOutExperimentalBenchDeviceIds([primaryId, ...(options?.targetDeviceIds || [])])
  );
  await Promise.all(
    Array.from(targetSet).map((id) =>
      ensureValidDevicePayload(id, devPayload).catch((err) => {
        if (id === primaryId) throw err;
        console.warn(`No se pudo apagar nodo subordinado ${id}:`, err);
      })
    )
  );

  await update(ref(rtdb, `simulacro/${orgScopeId}`), {
    activo: false,
    finalizado: true,
    organizationId: orgScopeId,
    detenidoPor: actorLabel,
    timestamp: now,
  }).catch(() => {});

  await update(ref(rtdb, `emergencia/${orgScopeId}`), {
    activa: false,
    organizationId: orgScopeId,
    detenidoPor: actorLabel,
    timestamp: now,
  }).catch(() => {});
}

export async function toggleGatewayLightInRTDB(
  deviceId: string,
  active: boolean,
  actingUser?: UserProfile | null
): Promise<void> {
  if (actingUser && !isAnyAdminRole(actingUser.role)) {
    throw new Error('Acceso denegado: Solo Administrador o SuperAdministrador puede controlar la señalización LED del nodo.');
  }
  const now = Date.now();
  const payload = {
    luz: active,
    iluminacion_led: active,
    last_update_server: now,
  };

  const targetId = deviceId || 'device_38A839E81F84';
  assertNotExperimentalBenchOperationalCommand(targetId, 'toggleGatewayLightInRTDB');
  await ensureValidDevicePayload(targetId, payload);
}

// -------------------------------------------------------------
// BROADCAST DRILL AND ALERTS FOR HARDWARE SYNC
// -------------------------------------------------------------
export async function broadcastDrillToRTDB(
  active: boolean,
  drillType: string | null = 'gas_critico',
  primaryDeviceId: string = 'device_38A839E81F84',
  organizationId: string = DEFAULT_ORGANIZATION.id
): Promise<void> {
  assertNotExperimentalBenchOperationalCommand(primaryDeviceId, 'broadcastDrillToRTDB');
  try {
    const now = Date.now();
    const orgId = (organizationId && organizationId !== 'all' ? organizationId : DEFAULT_ORGANIZATION.id).trim();
    const devIds = filterOutExperimentalBenchDeviceIds([primaryDeviceId || 'device_38A839E81F84']);

    if (active) {
      const isGas = drillType === 'gas_critico';
      const isPolvo = drillType === 'incendio_polvo';

      const drillPayload = {
        CO: isGas ? 1250 : 45,
        PM2_5: isPolvo ? 650 : 25,
        temperatura: isGas ? 31.4 : 24.5,
        comando_web: 'ENCENDER',
        silencio_remoto: false,
        alarma: true,
        alarma_activa: true,
        buzzer: true,
        luz: true,
        iluminacion_led: true,
        estado_adquisicion: 'simulacro',
        simulacro_activo: true,
        tipo_simulacro: drillType || 'gas_critico',
        last_update_server: now,
      };

      for (const id of devIds) {
        await ensureValidDevicePayload(id, drillPayload).catch(() => {});
      }

      await update(ref(rtdb, `simulacro/${orgId}`), {
        activo: true,
        organizationId: orgId,
        tipo: drillType || 'gas_critico',
        nombre:
          drillType === 'gas_critico'
            ? 'Simulacro de Fuga de Monóxido de Carbono (DS 132)'
            : drillType === 'incendio_polvo'
            ? 'Simulacro de Incendio y Humo Denso (DS 132)'
            : 'Simulacro General de Evacuación Minera (DS 132)',
        iniciadoPor: 'Consola Central MineSafe',
        timestamp: now,
      }).catch(() => {});

      await update(ref(rtdb, `emergencia/${orgId}`), {
        activa: true,
        esSimulacro: true,
        organizationId: orgId,
        tipo: drillType || 'gas_critico',
        timestamp: now,
      }).catch(() => {});
    } else {
      await resetGatewayDataInRTDB(primaryDeviceId);
      await update(ref(rtdb, `simulacro/${orgId}`), { activo: false, finalizado: true, organizationId: orgId, timestamp: now }).catch(() => {});
      await update(ref(rtdb, `emergencia/${orgId}`), { activa: false, organizationId: orgId, timestamp: now }).catch(() => {});
    }
  } catch (err) {
    console.warn('Error broadcasting drill to RTDB:', err);
  }
}

function formatAlertTimestamp(ts: unknown, fallbackText?: string): string {
  if (typeof ts === 'number' && !isNaN(ts) && ts > 0) {
    return new Date(ts).toLocaleString('es-CL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  if (typeof ts === 'string' && ts.trim()) {
    return ts;
  }
  return fallbackText || 'Reciente';
}

export function buildAlertBasePayload(alert: SafetyAlert, now: number): Record<string, any> {
  return {
    id: alert.id,
    codigo: alert.code,
    organizationId: alert.organizationId || DEFAULT_ORGANIZATION.id,
    // Campos canónicos exigidos por database.rules.json
    title: alert.title,
    severity: alert.severity,
    status: alert.resolved ? 'resuelta' : 'activa',
    // Campos legacy mantenidos para compatibilidad con lectores existentes
    titulo: alert.title,
    severidad: alert.severity,
    variable: alert.variableName,
    sensorId: alert.sensorId,
    sensorCode: alert.sensorCode,
    sector: alert.sectorName,
    valor: alert.recordedValue,
    limite: alert.safeLimit,
    atendida: Boolean(alert.acknowledged),
    ...(alert.acknowledgedBy ? { atendida_por: alert.acknowledgedBy } : {}),
    ...(alert.acknowledgedAt ? { timestamp_atendida: alert.acknowledgedAt } : {}),
    resuelta: Boolean(alert.resolved),
    accionSugerida: alert.suggestedAction || '',
    creado_en_texto: alert.timestamp || formatAlertTimestamp(alert.timestampMs || now),
    timestamp: alert.timestampMs || now,
  };
}

export function mapRTDBAlertRecord(id: string, data: any, bit: any = {}): SafetyAlert {
  const resolved = Boolean(data?.resuelta || data?.status === 'resuelta' || bit?.descripcion || bit?.tipoResolucion);
  const comment = data?.descripcion_cierre || bit?.descripcion || '';
  const hasResolution =
    resolved ||
    Boolean(comment) ||
    Boolean(data?.tipo_resolucion) ||
    Boolean(bit?.tipoResolucion);

  const attachmentsRaw = data?.adjuntos || bit?.adjuntos;
  const attachments: AlertAttachment[] | undefined = Array.isArray(attachmentsRaw)
    ? attachmentsRaw
    : attachmentsRaw && typeof attachmentsRaw === 'object'
    ? (Object.values(attachmentsRaw) as AlertAttachment[])
    : undefined;

  const tsNum = Math.max(
    typeof data?.timestamp_cierre === 'number' ? data.timestamp_cierre : 0,
    typeof bit?.timestamp === 'number' ? bit.timestamp : 0,
    typeof data?.timestamp === 'number' ? data.timestamp : 0
  );

  return {
    id,
    code: data?.codigo || id,
    organizationId: data?.organizationId || bit?.organizationId || DEFAULT_ORGANIZATION.id,
    title:
      data?.title ||
      data?.titulo ||
      (bit?.idAlerta ? `Contingencia Registrada (${bit.idAlerta})` : 'Alerta de Seguridad'),
    severity: ((data?.severity || data?.severidad) as SafetyAlert['severity']) || 'advertencia',
    variableName: data?.variable || 'Variable Ambiental',
    sensorId: data?.sensorId || 'device_38A839E81F84',
    sensorCode: data?.sensorCode || data?.sensorId || 'ESP32',
    sectorName: data?.sector || 'Mina Chuquicamata - Rampa Principal',
    recordedValue: data?.valor || '-',
    safeLimit: data?.limite || '-',
    timestamp: data?.creado_en_texto || formatAlertTimestamp(tsNum, bit?.fecha),
    timestampMs: tsNum,
    acknowledged: Boolean(data?.atendida || resolved),
    acknowledgedBy: data?.atendida_por,
    acknowledgedAt: typeof data?.timestamp_atendida === 'number' ? data.timestamp_atendida : undefined,
    resolved,
    suggestedAction:
      data?.accionSugerida ||
      data?.descripcion ||
      'Verificar condiciones del sector y registrar medidas de control.',
    ...(hasResolution
      ? {
          resolutionDetails: {
            resolutionType: data?.tipo_resolucion || bit?.tipoResolucion || 'simulacro',
            closingTitle: data?.titulo_cierre || bit?.tituloCierre || undefined,
            comment,
            correctiveActions: data?.acciones_correctivas || bit?.accionesCorrectivas || '',
            resolvedBy: data?.resuelto_por || bit?.supervisor || 'Supervisor de Turno',
            resolvedAt:
              data?.resuelto_en ||
              bit?.fecha ||
              formatAlertTimestamp(data?.timestamp_cierre || bit?.timestamp),
            attachments,
          },
        }
      : {}),
  };
}

export async function broadcastAlertToRTDB(alert: SafetyAlert): Promise<void> {
  const now = alert.timestampMs || Date.now();
  const alertRef = ref(rtdb, `alertas/${alert.id}`);
  const payload = buildAlertBasePayload(alert, now);
  if (alert.resolutionDetails) {
    payload.tipo_resolucion = alert.resolutionDetails.resolutionType;
    if (alert.resolutionDetails.closingTitle) {
      payload.titulo_cierre = alert.resolutionDetails.closingTitle;
    }
    payload.descripcion_cierre = alert.resolutionDetails.comment;
    payload.acciones_correctivas = alert.resolutionDetails.correctiveActions || '';
    payload.resuelto_por = alert.resolutionDetails.resolvedBy;
    payload.resuelto_en = alert.resolutionDetails.resolvedAt;
    payload.timestamp_cierre = now;
    if (alert.resolutionDetails.attachments?.length) {
      payload.adjuntos = alert.resolutionDetails.attachments;
    }
  }
  await set(alertRef, payload);

  // If it's a critical alert, activate alarma and buzzer on RTDB devices so hardware/web react
  if (alert.severity === 'critico') {
    const devIds = Array.from(new Set([alert.sensorId, 'device_38A839E81F84']));
    for (const id of devIds) {
      await ensureValidDevicePayload(id, {
        comando_web: 'ENCENDER',
        silencio_remoto: false,
        alarma: true,
        alarma_activa: true,
        buzzer: true,
        luz: true,
        last_update_server: now,
      }).catch(() => {});
    }
    const alertOrg = alert.organizationId || DEFAULT_ORGANIZATION.id;
    await update(ref(rtdb, `emergencia/${alertOrg}`), {
      activa: true,
      esSimulacro: false,
      organizationId: alertOrg,
      alertaId: alert.id,
      titulo: alert.title,
      timestamp: now,
    }).catch(() => {});
  }
}

export function isAlertDismissedOnAcknowledge(data: any, bit: any = {}): boolean {
  if (data?.eliminada_al_reconocer === true) return true;
  const hasFormalResolution = Boolean(
    data?.resuelta ||
      data?.status === 'resuelta' ||
      data?.descripcion_cierre ||
      data?.tipo_resolucion ||
      bit?.descripcion ||
      bit?.tipoResolucion
  );
  // Cualquier alarma reconocida sin bitácora de resolución formal queda descartada por completo
  return Boolean(data?.atendida) && !hasFormalResolution;
}

export function buildAtomicAlertAcknowledgeDismissUpdates(
  alertOrId: SafetyAlert | string,
  acknowledgedBy: string,
  relatedAlertIds: string[] = [],
  nowMs: number = Date.now(),
  options?: {
    isExistingThresholdEvent?: boolean;
    existingRelatedThresholdEventIds?: string[];
    clearEmergencyIfNone?: boolean;
    organizationId?: string;
  }
): Record<string, any> {
  const alertId = typeof alertOrId === 'string' ? alertOrId : alertOrId.id;
  const resolvedAt = formatAlertTimestamp(nowMs);
  const orgId =
    options?.organizationId ||
    (typeof alertOrId === 'object' && alertOrId?.organizationId) ||
    DEFAULT_ORGANIZATION.id;

  const updates: Record<string, any> = {};

  if (typeof alertOrId === 'object' && alertOrId !== null) {
    const baseFields = buildAlertBasePayload(alertOrId, alertOrId.timestampMs || nowMs);
    updates[`alertas/${alertId}`] = {
      ...baseFields,
      id: alertId,
      organizationId: orgId,
      status: 'resuelta',
      resuelta: true,
      atendida: true,
      atendida_por: acknowledgedBy,
      timestamp_atendida: nowMs,
      eliminada_al_reconocer: true,
      resuelto_por: acknowledgedBy,
      resuelto_en: resolvedAt,
      timestamp_cierre: nowMs,
    };
  } else {
    updates[`alertas/${alertId}/status`] = 'resuelta';
    updates[`alertas/${alertId}/resuelta`] = true;
    updates[`alertas/${alertId}/atendida`] = true;
    updates[`alertas/${alertId}/atendida_por`] = acknowledgedBy;
    updates[`alertas/${alertId}/timestamp_atendida`] = nowMs;
    updates[`alertas/${alertId}/eliminada_al_reconocer`] = true;
    updates[`alertas/${alertId}/resuelto_por`] = acknowledgedBy;
    updates[`alertas/${alertId}/resuelto_en`] = resolvedAt;
    updates[`alertas/${alertId}/timestamp_cierre`] = nowMs;
  }

  if (options?.isExistingThresholdEvent) {
    updates[`eventos_umbrales/${alertId}/estado`] = 'recuperada';
    updates[`eventos_umbrales/${alertId}/recuperada_en`] = nowMs;
  }

  const relatedThresholdSet = new Set(options?.existingRelatedThresholdEventIds || []);
  relatedAlertIds
    .filter((id) => id && id !== alertId)
    .forEach((relId) => {
      updates[`alertas/${relId}/status`] = 'resuelta';
      updates[`alertas/${relId}/resuelta`] = true;
      updates[`alertas/${relId}/atendida`] = true;
      updates[`alertas/${relId}/atendida_por`] = acknowledgedBy;
      updates[`alertas/${relId}/timestamp_atendida`] = nowMs;
      updates[`alertas/${relId}/eliminada_al_reconocer`] = true;
      updates[`alertas/${relId}/resuelto_por`] = acknowledgedBy;
      updates[`alertas/${relId}/resuelto_en`] = resolvedAt;
      updates[`alertas/${relId}/timestamp_cierre`] = nowMs;
      if (relatedThresholdSet.has(relId)) {
        updates[`eventos_umbrales/${relId}/estado`] = 'recuperada';
        updates[`eventos_umbrales/${relId}/recuperada_en`] = nowMs;
      }
    });

  if (options?.clearEmergencyIfNone) {
    updates[`emergencia/${orgId}/activa`] = false;
    updates[`emergencia/${orgId}/recuperado_en`] = nowMs;
    updates[`emergencia/${orgId}/timestamp`] = nowMs;
  }

  return updates;
}

export async function acknowledgeAlertInRTDB(
  alertOrId: SafetyAlert | string,
  acknowledgedBy: string,
  relatedAlertIds: string[] = [],
  options?: { clearEmergencyIfNone?: boolean; organizationId?: string }
): Promise<void> {
  const alertId = typeof alertOrId === 'string' ? alertOrId : alertOrId.id;
  const now = Date.now();

  let isExistingThresholdEvent = false;
  if (alertId.startsWith('evt_')) {
    const evtSnap = await get(ref(rtdb, `eventos_umbrales/${alertId}`)).catch(() => null);
    isExistingThresholdEvent = Boolean(evtSnap?.exists());
  }

  const existingRelatedThresholdEventIds: string[] = [];
  for (const relId of relatedAlertIds) {
    if (relId && relId !== alertId && relId.startsWith('evt_')) {
      const relSnap = await get(ref(rtdb, `eventos_umbrales/${relId}`)).catch(() => null);
      if (relSnap?.exists()) {
        existingRelatedThresholdEventIds.push(relId);
      }
    }
  }

  const updates = buildAtomicAlertAcknowledgeDismissUpdates(
    alertOrId,
    acknowledgedBy,
    relatedAlertIds,
    now,
    {
      isExistingThresholdEvent,
      existingRelatedThresholdEventIds,
      clearEmergencyIfNone: options?.clearEmergencyIfNone,
      organizationId: options?.organizationId,
    }
  );

  await update(ref(rtdb), updates);
}

export function deduplicateActiveSafetyAlerts(mapped: SafetyAlert[]): SafetyAlert[] {
  const normVar = (v?: string) => (v || '').trim().toLowerCase();
  const sorted = [...mapped].sort((a, b) => {
    // Priorizar alertas reconocidas y más recientes dentro de las activas del mismo sensor+variable
    if (!a.resolved && !b.resolved && a.sensorId === b.sensorId && normVar(a.variableName) === normVar(b.variableName)) {
      if (a.acknowledged !== b.acknowledged) {
        return a.acknowledged ? -1 : 1;
      }
    }
    return (b.timestampMs || 0) - (a.timestampMs || 0);
  });

  const seenActiveKeys = new Set<string>();
  const deduped: SafetyAlert[] = [];

  for (const item of sorted) {
    if (!item.resolved && item.sensorId) {
      const dedupKey = `${item.sensorId}::${normVar(item.variableName)}`;
      if (seenActiveKeys.has(dedupKey)) {
        continue;
      }
      seenActiveKeys.add(dedupKey);
    }
    deduped.push(item);
  }

  return deduped.sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0));
}

export function subscribeToRTDBAlerts(
  callback: (alerts: SafetyAlert[]) => void,
  scope?: RTDBSubscriptionScope,
  onDismissedAlerts?: (dismissed: SafetyAlert[]) => void
): () => void {
  let rawAlertas: Record<string, any> = {};
  let rawBitacora: Record<string, any> = {};
  let alertasReady = false;

  const emitCombined = () => {
    if (!alertasReady) return;
    const allIds = new Set([...Object.keys(rawAlertas), ...Object.keys(rawBitacora)]);
    const mapped: SafetyAlert[] = [];
    const dismissed: SafetyAlert[] = [];

    allIds.forEach((id) => {
      const data = rawAlertas[id] || {};
      const bit = rawBitacora[id] || {};
      if (!data && !bit) return;
      const record = mapRTDBAlertRecord(id, data, bit);
      if (isAlertDismissedOnAcknowledge(data, bit)) {
        dismissed.push(record);
        return;
      }
      mapped.push(record);
    });

    if (onDismissedAlerts && dismissed.length > 0) {
      onDismissedAlerts(dismissed);
    }
    callback(deduplicateActiveSafetyAlerts(mapped));
  };

  const unsubAlertas = onValue(
    buildOrgScopedQuery('alertas', scope),
    (snapshot) => {
      rawAlertas = snapshot.exists() ? snapshot.val() || {} : {};
      alertasReady = true;
      emitCombined();
    },
    (err) => {
      console.warn('Error subscribing to RTDB /alertas:', err?.message || err);
      alertasReady = true;
      emitCombined();
    }
  );

  const unsubBitacora = onValue(
    buildOrgScopedQuery('bitacora_contingencias', scope),
    (snapshot) => {
      rawBitacora = snapshot.exists() ? snapshot.val() || {} : {};
      emitCombined();
    },
    (err) => {
      console.warn('Error subscribing to RTDB /bitacora_contingencias:', err?.message || err);
    }
  );

  return () => {
    unsubAlertas();
    unsubBitacora();
  };
}

export function subscribeToRTDBDrill(
  callback: (drillState: { active: boolean; type?: string; nombre?: string }) => void,
  organizationId: string = DEFAULT_ORGANIZATION.id
): () => void {
  const orgId = organizationId && organizationId !== 'all' ? organizationId : DEFAULT_ORGANIZATION.id;
  const simulacroRef = ref(rtdb, `simulacro/${orgId}`);
  return onValue(simulacroRef, (snapshot) => {
    if (snapshot.exists()) {
      const val = snapshot.val();
      callback({
        active: val?.activo === true,
        type: val?.tipo,
        nombre: val?.nombre,
      });
    } else {
      callback({ active: false });
    }
  });
}

/**
 * Construye el payload atómico multi-path para cerrar una alerta simultáneamente en
 * /alertas, /bitacora_contingencias y (si aplica) /eventos_umbrales.
 */
export function buildAtomicAlertResolutionUpdates(
  alertOrId: SafetyAlert | string,
  details: AlertResolutionDetails,
  nowMs: number = Date.now(),
  options?: { isExistingThresholdEvent?: boolean }
): Record<string, any> {
  const alertId = typeof alertOrId === 'string' ? alertOrId : alertOrId.id;
  const baseFields =
    typeof alertOrId === 'object' && alertOrId !== null
      ? buildAlertBasePayload(alertOrId, alertOrId.timestampMs || nowMs)
      : {};
  const orgId =
    (typeof alertOrId === 'object' && alertOrId?.organizationId) || DEFAULT_ORGANIZATION.id;
  const cleanAttachments = (details.attachments || []).map((a) => ({ ...a }));

  const updates: Record<string, any> = {
    [`alertas/${alertId}`]: {
      ...baseFields,
      id: alertId,
      organizationId: orgId,
      status: 'resuelta',
      resuelta: true,
      atendida: true,
      tipo_resolucion: details.resolutionType,
      ...(details.closingTitle ? { titulo_cierre: details.closingTitle } : {}),
      descripcion_cierre: details.comment,
      acciones_correctivas: details.correctiveActions || '',
      resuelto_por: details.resolvedBy,
      resuelto_en: details.resolvedAt,
      timestamp_cierre: nowMs,
      ...(cleanAttachments.length > 0 ? { adjuntos: cleanAttachments } : {}),
    },
    [`bitacora_contingencias/${alertId}`]: {
      alertaId: alertId,
      idAlerta: alertId,
      organizationId: orgId,
      titulo:
        details.closingTitle ||
        (typeof alertOrId === 'object' ? alertOrId.title : 'Contingencia Resuelta'),
      estado: 'resuelta',
      tipoResolucion: details.resolutionType,
      ...(details.closingTitle ? { tituloCierre: details.closingTitle } : {}),
      descripcion: details.comment,
      accionesCorrectivas: details.correctiveActions || '',
      supervisor: details.resolvedBy,
      fecha: details.resolvedAt,
      timestamp: nowMs,
      ...(cleanAttachments.length > 0 ? { adjuntos: cleanAttachments } : {}),
    },
  };

  if (options?.isExistingThresholdEvent) {
    updates[`eventos_umbrales/${alertId}/estado`] = 'recuperada';
    updates[`eventos_umbrales/${alertId}/recuperada_en`] = nowMs;
  }

  return updates;
}

/**
 * Registra el cierre y clasificación de una alerta en Firebase RTDB de manera atómica multi-path.
 */
export async function resolveAlertInRTDB(
  alertOrId: SafetyAlert | string,
  details: AlertResolutionDetails,
  relatedAlertIds: string[] = []
): Promise<void> {
  const alertId = typeof alertOrId === 'string' ? alertOrId : alertOrId.id;
  const now = Date.now();
  let isExistingThresholdEvent = false;
  if (alertId.startsWith('evt_')) {
    const evtSnap = await get(ref(rtdb, `eventos_umbrales/${alertId}`)).catch(() => null);
    isExistingThresholdEvent = Boolean(evtSnap?.exists());
  }

  const updates = buildAtomicAlertResolutionUpdates(alertOrId, details, now, {
    isExistingThresholdEvent,
  });

  // Cerrar también eventos evt_ antiguos duplicados del mismo sensor + variable para que no reaparezcan
  for (const relId of relatedAlertIds) {
    if (!relId || relId === alertId) continue;
    updates[`alertas/${relId}/status`] = 'resuelta';
    updates[`alertas/${relId}/resuelta`] = true;
    updates[`alertas/${relId}/atendida`] = true;
    updates[`alertas/${relId}/descripcion_cierre`] = `Consolidada en cierre de alerta ${alertId}: ${details.comment}`;
    updates[`alertas/${relId}/resuelto_por`] = details.resolvedBy;
    updates[`alertas/${relId}/resuelto_en`] = details.resolvedAt;
    updates[`alertas/${relId}/timestamp_cierre`] = now;
  }

  await update(ref(rtdb), updates);
}

export async function closeAlertLifecycleInRTDB(
  alertId: string,
  reason: string,
  options?: { clearEmergencyIfNone?: boolean; organizationId?: string }
): Promise<void> {
  const now = Date.now();
  const resolvedAt = formatAlertTimestamp(now);
  const alertRef = ref(rtdb, `alertas/${alertId}`);
  const snap = await get(alertRef).catch(() => null);

  if (snap && snap.exists()) {
    const existing = snap.val() || {};
    const orgId = existing.organizationId || options?.organizationId || DEFAULT_ORGANIZATION.id;
    const updates: Record<string, any> = {
      [`alertas/${alertId}/status`]: 'resuelta',
      [`alertas/${alertId}/resuelta`]: true,
      [`alertas/${alertId}/atendida`]: true,
      [`alertas/${alertId}/auto_recuperada`]: true,
      [`alertas/${alertId}/descripcion_cierre`]: reason,
      [`alertas/${alertId}/resuelto_por`]: 'Motor Automático MineSafe',
      [`alertas/${alertId}/resuelto_en`]: resolvedAt,
      [`alertas/${alertId}/timestamp_cierre`]: now,
      [`bitacora_contingencias/${alertId}`]: {
        alertaId: alertId,
        idAlerta: alertId,
        organizationId: orgId,
        titulo: existing.title || existing.titulo || 'Auto-recuperación de umbral',
        estado: 'resuelta',
        tipoResolucion: 'prueba_operativa',
        descripcion: reason,
        accionesCorrectivas: 'Auto-recuperación confirmada en telemetría.',
        supervisor: 'Motor Automático MineSafe',
        fecha: resolvedAt,
        timestamp: now,
      },
    };
    if (options?.clearEmergencyIfNone) {
      updates[`emergencia/${orgId}/activa`] = false;
      updates[`emergencia/${orgId}/recuperado_en`] = now;
      updates[`emergencia/${orgId}/timestamp`] = now;
    }
    await update(ref(rtdb), updates);
  } else if (options?.clearEmergencyIfNone) {
    const orgId = options.organizationId || DEFAULT_ORGANIZATION.id;
    await update(ref(rtdb, `emergencia/${orgId}`), {
      activa: false,
      organizationId: orgId,
      recuperado_en: now,
      timestamp: now,
    });
  }
}

export async function resolveActiveAlertsInRTDB(
  alertsToClose: SafetyAlert[],
  reasonText: string,
  resolvedBy: string
): Promise<void> {
  const unresolved = alertsToClose.filter((a) => !a.resolved);
  if (unresolved.length === 0) return;
  const now = Date.now();
  const resolvedAt = formatAlertTimestamp(now);
  const combinedUpdates: Record<string, any> = {};

  for (const alert of unresolved) {
    const details: AlertResolutionDetails = {
      resolutionType: alert.id.startsWith('alt-drill-') ? 'simulacro' : 'prueba_operativa',
      comment: reasonText,
      correctiveActions: 'Restablecimiento de niveles normales y silenciamiento desde consola central.',
      resolvedBy,
      resolvedAt,
    };
    Object.assign(combinedUpdates, buildAtomicAlertResolutionUpdates(alert, details, now));
  }

  await update(ref(rtdb), combinedUpdates);
}

/**
 * Registra la bitácora de evaluación y observaciones de un simulacro finalizado
 */
export async function saveDrillDebriefInRTDB(record: DrillDebriefRecord): Promise<void> {
  const orgId = record.organizationId || DEFAULT_ORGANIZATION.id;
  const debriefRef = ref(rtdb, `simulacros_bitacora/${record.id}`);
  await set(debriefRef, {
    id: record.id,
    organizationId: orgId,
    tipoSimulacro: record.drillType,
    clasificacion: record.classification,
    observaciones: record.notes,
    accionesCorrectivas: record.correctiveActions || '',
    supervisor: record.supervisorName,
    timestamp: record.timestamp,
  });
}

/**
 * ============================================================================
 * CONFIGURACIÓN DINÁMICA DE UMBRALES DE ALERTA (RTDB)
 * ============================================================================
 */

export const DEFAULT_GLOBAL_THRESHOLDS: DeviceThresholdsConfig = {
  dispositivo_id: 'global',
  dispositivo_nombre: 'Configuración Global (Todos los Sensores por Defecto)',
  pm25: {
    activo: true,
    notificaciones: true,
    preventivo: 30,
    advertencia: 55,
    critico: 150,
    unidad: 'µg/m³',
    minVal: 0,
    maxVal: 4095,
    label: 'Partículas PM2.5 (Sensor óptico OPEN-SMART — estimación sin calibración)',
    descripcion: 'Estimación de polvo óptico mediante sensor OPEN-SMART sin calibración gravimétrica oficial. Uso referencial en prototipo académico.'
  },
  mq2: {
    activo: true,
    notificaciones: true,
    preventivo: 200,
    advertencia: 350,
    critico: 500,
    unidad: 'ADC raw',
    minVal: 0,
    maxVal: 4095,
    label: 'Gases Combustibles y Humos (MQ-2 ADC)',
    descripcion: 'Lectura analógica bruta de 12 bits (0-4095). Valores alineados con el firmware ESP32 (precaución 350 / crítico 500); no representan PPM certificados sin calibración con gas patrón.'
  },
  temperatura: {
    activo: true,
    notificaciones: true,
    preventivo: 26,
    advertencia: 32,
    critico: 38,
    unidad: '°C',
    minVal: -20,
    maxVal: 80,
    label: 'Temperatura Ambiental (DHT)',
    descripcion: 'Monitoreo térmico en galerías subterráneas y frentes de avance. Valores de ejemplo según protocolo de estrés térmico.'
  },
  humedad: {
    activo: true,
    notificaciones: true,
    preventivo: 70,
    advertencia: 80,
    critico: 90,
    unidad: '%',
    minVal: 0,
    maxVal: 100,
    label: 'Humedad Relativa (DHT)',
    descripcion: 'Humedad relativa ambiental. Valores de ejemplo referenciales para control de ventilación y saturación ambiental.'
  },
  actualizado_en: Date.now(),
  actualizado_por: 'Sistema MineSafe (Valores Iniciales)',
  notas: 'Límites iniciales configurables de ejemplo. Modificar según protocolos de seguridad de la faena.'
};

/**
 * Escucha la configuración de umbrales para un dispositivo específico o 'global'
 */
export function subscribeToAlertThresholds(
  targetId: string, 
  callback: (config: DeviceThresholdsConfig) => void
): () => void {
  const path = `configuracion_alertas/${targetId}`;
  const configRef = ref(rtdb, path);

  return onValue(configRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      callback({
        dispositivo_id: targetId,
        dispositivo_nombre: data.dispositivo_nombre || targetId,
        pm25: { ...DEFAULT_GLOBAL_THRESHOLDS.pm25, ...(data.pm25 || {}) },
        mq2: { ...DEFAULT_GLOBAL_THRESHOLDS.mq2, ...(data.mq2 || {}) },
        temperatura: { ...DEFAULT_GLOBAL_THRESHOLDS.temperatura, ...(data.temperatura || {}) },
        humedad: { ...DEFAULT_GLOBAL_THRESHOLDS.humedad, ...(data.humedad || {}) },
        actualizado_en: data.actualizado_en || Date.now(),
        actualizado_por: data.actualizado_por || 'Desconocido',
        notas: data.notas || ''
      });
    } else {
      callback({
        ...DEFAULT_GLOBAL_THRESHOLDS,
        dispositivo_id: targetId,
        dispositivo_nombre: targetId === 'global' ? DEFAULT_GLOBAL_THRESHOLDS.dispositivo_nombre : `Dispositivo ${targetId}`
      });
    }
  }, (err) => {
    console.warn(`Error subscribing to thresholds for ${targetId}:`, err);
    callback({
      ...DEFAULT_GLOBAL_THRESHOLDS,
      dispositivo_id: targetId
    });
  });
}

/**
 * Escucha todas las configuraciones de umbrales existentes en la base de datos
 */
function normalizeThresholdConfigSnapshot(
  key: string,
  item: any
): DeviceThresholdsConfig {
  return {
    dispositivo_id: key,
    dispositivo_nombre: item?.dispositivo_nombre || key,
    pm25: { ...DEFAULT_GLOBAL_THRESHOLDS.pm25, ...(item?.pm25 || {}) },
    mq2: { ...DEFAULT_GLOBAL_THRESHOLDS.mq2, ...(item?.mq2 || {}) },
    temperatura: { ...DEFAULT_GLOBAL_THRESHOLDS.temperatura, ...(item?.temperatura || {}) },
    humedad: { ...DEFAULT_GLOBAL_THRESHOLDS.humedad, ...(item?.humedad || {}) },
    actualizado_en: item?.actualizado_en || Date.now(),
    actualizado_por: item?.actualizado_por || 'Desconocido',
    notas: item?.notas || ''
  };
}

/**
 * Escucha las configuraciones de umbrales permitidas según rol y dispositivos de la organización
 */
export function subscribeToAllThresholdConfigs(
  callback: (configs: Record<string, DeviceThresholdsConfig>) => void,
  scope?: RTDBSubscriptionScope
): () => void {
  if (scope?.role && !isGlobalMineSafeAdmin(scope.role)) {
    const watchedIds = Array.from(
      new Set(['global', ...(scope.deviceIds || []).filter(Boolean)])
    );
    const result: Record<string, DeviceThresholdsConfig> = {
      global: { ...DEFAULT_GLOBAL_THRESHOLDS },
    };

    const unsubs = watchedIds.map((targetId) =>
      onValue(
        ref(rtdb, `configuracion_alertas/${targetId}`),
        (snapshot) => {
          if (snapshot.exists()) {
            result[targetId] = normalizeThresholdConfigSnapshot(targetId, snapshot.val());
          } else if (targetId === 'global') {
            result.global = { ...DEFAULT_GLOBAL_THRESHOLDS };
          } else {
            delete result[targetId];
          }
          callback({ ...result });
        },
        (err) => {
          console.warn(`Error subscribing to threshold config /configuracion_alertas/${targetId}:`, err?.message || err);
        }
      )
    );

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }

  const configsRef = ref(rtdb, 'configuracion_alertas');

  return onValue(configsRef, (snapshot) => {
    const result: Record<string, DeviceThresholdsConfig> = {};
    if (snapshot.exists()) {
      const data = snapshot.val();
      Object.keys(data).forEach((key) => {
        result[key] = normalizeThresholdConfigSnapshot(key, data[key]);
      });
    }
    if (!result['global']) {
      result['global'] = { ...DEFAULT_GLOBAL_THRESHOLDS };
    }
    callback(result);
  }, (err) => {
    console.warn('Error subscribing to all threshold configs:', err);
    callback({ global: DEFAULT_GLOBAL_THRESHOLDS });
  });
}

/**
 * Guarda o actualiza los umbrales de alerta en Firebase RTDB
 * Valida que el usuario tenga rol de administrador o superadmin
 */
export async function saveThresholdConfig(
  targetId: string, 
  config: DeviceThresholdsConfig, 
  user: UserProfile,
  organizationIdOverride?: string
): Promise<void> {
  if (!isAnyAdminRole(user.role)) {
    throw new Error('Permisos insuficientes: Solo los usuarios con rol Administrador o SuperAdmin pueden modificar los umbrales de seguridad operacional.');
  }
  if (targetId === 'global' && user.role !== 'superadmin') {
    throw new Error('Permisos insuficientes: Solo el SuperAdministrador puede modificar la configuración global de umbrales. Seleccione un dispositivo de su empresa.');
  }

  // Validación estricta de rangos físicos y orden matemático (preventivo < advertencia < critico)
  const physicalBounds: Record<'pm25' | 'mq2' | 'temperatura' | 'humedad', { min: number; max: number }> = {
    mq2: { min: 0, max: 4095 },
    pm25: { min: 0, max: 4095 },
    temperatura: { min: -40, max: 100 },
    humedad: { min: 0, max: 100 },
  };
  const variables: ('pm25' | 'mq2' | 'temperatura' | 'humedad')[] = ['pm25', 'mq2', 'temperatura', 'humedad'];
  for (const v of variables) {
    const cfg = config[v];
    if (!cfg) {
      throw new Error(`Falta la configuración de la variable ${v}.`);
    }
    const bounds = physicalBounds[v];
    const minAllowed = typeof cfg.minVal === 'number' && Number.isFinite(cfg.minVal) ? Math.max(bounds.min, cfg.minVal) : bounds.min;
    const maxAllowed = typeof cfg.maxVal === 'number' && Number.isFinite(cfg.maxVal) ? Math.min(bounds.max, cfg.maxVal) : bounds.max;
    const values = [
      { name: 'Preventivo', val: cfg.preventivo },
      { name: 'Advertencia', val: cfg.advertencia },
      { name: 'Crítico', val: cfg.critico },
    ];
    for (const item of values) {
      if (typeof item.val !== 'number' || !Number.isFinite(item.val)) {
        throw new Error(`En la variable ${cfg.label}: el umbral ${item.name} debe ser un número válido.`);
      }
      if (item.val < minAllowed || item.val > maxAllowed) {
        throw new Error(
          `En la variable ${cfg.label}: el umbral ${item.name} (${item.val}) debe estar entre ${minAllowed} y ${maxAllowed} ${cfg.unidad}.`
        );
      }
    }
    if (cfg.preventivo >= cfg.advertencia) {
      throw new Error(`En la variable ${cfg.label}: el umbral Preventivo (${cfg.preventivo}) debe ser estrictamente menor que Advertencia (${cfg.advertencia}).`);
    }
    if (cfg.advertencia >= cfg.critico) {
      throw new Error(`En la variable ${cfg.label}: el umbral Advertencia (${cfg.advertencia}) debe ser estrictamente menor que Crítico (${cfg.critico}).`);
    }
  }

  const payload: DeviceThresholdsConfig = {
    ...config,
    dispositivo_id: targetId,
    actualizado_en: Date.now(),
    actualizado_por: user.name ? `${user.name} (${user.role})` : user.email,
  };

  const targetRef = ref(rtdb, `configuracion_alertas/${targetId}`);
  await set(targetRef, payload);

  // Registro de auditoría inmutable con organizationId en la bitácora de configuraciones
  const auditKey = `${targetId}_${Date.now()}`;
  const auditOrgId =
    (organizationIdOverride && organizationIdOverride !== 'all' ? organizationIdOverride : null) ||
    user.organizationId ||
    DEFAULT_ORGANIZATION.id;
  const auditRef = ref(rtdb, `bitacora_configuracion_umbrales/${auditKey}`);
  await set(auditRef, {
    targetId,
    organizationId: auditOrgId,
    configGuardada: payload,
    modificadoPor: payload.actualizado_por,
    timestamp: Date.now(),
    fecha: new Date().toISOString()
  }).catch((err) => console.warn('Error saving audit log:', err));

  // Si es SuperAdmin y editó 'global', sincronizar también /configuracion_plataforma/metrics
  if (targetId === 'global' && user.role === 'superadmin') {
    await update(ref(rtdb, 'configuracion_plataforma/metrics'), {
      coPreventivo: payload.mq2.preventivo,
      coAdvertencia: payload.mq2.advertencia,
      coCritico: payload.mq2.critico,
      pm25Preventivo: payload.pm25.preventivo,
      pm25Advertencia: payload.pm25.advertencia,
      pm25Critico: payload.pm25.critico,
      tempPreventivo: payload.temperatura.preventivo,
      tempAdvertencia: payload.temperatura.advertencia,
      tempCritico: payload.temperatura.critico,
      humPreventivo: payload.humedad.preventivo,
      humAdvertencia: payload.humedad.advertencia,
      humCritico: payload.humedad.critico,
    }).catch(() => {});
  }
}

/**
 * Restaura los valores de umbrales a los predeterminados de fábrica
 */
export async function resetThresholdConfigToDefault(
  targetId: string, 
  user: UserProfile
): Promise<DeviceThresholdsConfig> {
  if (!isAnyAdminRole(user.role)) {
    throw new Error('Permisos insuficientes: Solo los administradores pueden restaurar valores de seguridad.');
  }
  if (targetId === 'global' && user.role !== 'superadmin') {
    throw new Error('Permisos insuficientes: Solo el SuperAdministrador puede restaurar los valores globales.');
  }

  const restoredConfig: DeviceThresholdsConfig = {
    ...DEFAULT_GLOBAL_THRESHOLDS,
    dispositivo_id: targetId,
    dispositivo_nombre: targetId === 'global' ? DEFAULT_GLOBAL_THRESHOLDS.dispositivo_nombre : `Dispositivo ${targetId}`,
    actualizado_en: Date.now(),
    actualizado_por: `${user.name} (${user.role}) [Restauración a Fábrica]`,
    notas: 'Configuración restaurada a valores de ejemplo por defecto.'
  };

  const targetRef = ref(rtdb, `configuracion_alertas/${targetId}`);
  await set(targetRef, restoredConfig);

  return restoredConfig;
}

/**
 * Registra un evento de superación o recuperación de umbral en Firebase RTDB
 */
export async function saveAlertThresholdEvent(event: AlertEventRecord): Promise<void> {
  try {
    const orgId = event.organizationId || DEFAULT_ORGANIZATION.id;
    const enrichedEvent: AlertEventRecord = {
      ...event,
      organizationId: orgId,
    };
    const eventRef = ref(rtdb, `eventos_umbrales/${event.id}`);
    await set(eventRef, enrichedEvent);

    // Si el evento está activo y es de advertencia o crítico, reflejarlo en la lista de alertas activas
    if (event.estado === 'activa' && (event.nivel === 'advertencia' || event.nivel === 'critico')) {
      const safetyAlert: SafetyAlert = {
        id: event.id,
        organizationId: orgId,
        code: `EVT-${event.variable.toUpperCase()}-${event.id.slice(-6)}`,
        title: `Umbral ${event.nivel.toUpperCase()}: ${event.variable_label}`,
        severity: event.nivel === 'critico' ? 'critico' : 'advertencia',
        variableName: event.variable_label,
        sensorId: event.dispositivo_id,
        sensorCode: event.dispositivo_nombre || event.dispositivo_id,
        sectorName: event.sector_nombre || 'Faena Central',
        recordedValue: `${event.valor_detectado} ${event.unidad}`,
        safeLimit: `< ${event.umbral_superado} ${event.unidad}`,
        timestamp: event.fecha_hora,
        timestampMs: event.timestamp,
        acknowledged: false,
        resolved: false,
        suggestedAction: event.nivel === 'critico'
          ? 'Evacuar el área inmediata, activar ventilación forzada y notificar a brigada de rescate.'
          : 'Inspeccionar sensores del sector, verificar ductos de ventilación y advertir a la cuadrilla.'
      };
      await broadcastAlertToRTDB(safetyAlert);
    }
  } catch (err) {
    console.warn('Error saving alert event in RTDB:', err);
  }
}

/**
 * Actualiza el estado de un evento de umbral (por ejemplo, al recuperarse a la normalidad)
 */
export async function updateAlertThresholdEvent(
  eventId: string, 
  updates: Partial<AlertEventRecord>
): Promise<void> {
  try {
    const eventRef = ref(rtdb, `eventos_umbrales/${eventId}`);
    await update(eventRef, updates);
  } catch (err) {
    console.warn('Error updating alert event in RTDB:', err);
  }
}

/**
 * Suscribe a los eventos históricos y en vivo generados por el motor de umbrales
 */
export function subscribeToAlertEvents(
  callback: (events: AlertEventRecord[]) => void,
  scope?: RTDBSubscriptionScope
): () => void {
  const eventsRef = buildOrgScopedQuery('eventos_umbrales', scope);

  return onValue(eventsRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      const list: AlertEventRecord[] = Object.keys(data).map(k => ({
        id: k,
        ...data[k]
      }));
      list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      callback(list);
    } else {
      callback([]);
    }
  }, (err) => {
    console.warn('Error subscribing to alert events:', err?.message || err);
    callback([]);
  });
}

/**
 * ============================================================================
 * CONFIGURACIÓN MAESTRA DE PLATAFORMA Y VISIBILIDAD DE VENTANAS (SOLO SUPERADMIN)
 * ============================================================================
 */

export const DEFAULT_PLATFORM_CONFIG: PlatformConfig = {
  visibility: {
    rolePermissions: {
      admin_minesafe: {
        dashboard: true,
        monitoreo: true,
        alertas: true,
        configuracion_alertas: true,
        equipos: true,
        reportes: true,
        faenas: true,
        usuarios: true,
        empresas: true,
        visor_3d: false,
        gateway_3d: false,
      },
      admin: {
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
      operador: {
        dashboard: false,
        monitoreo: false,
        alertas: true,
        configuracion_alertas: false,
        equipos: false,
        reportes: false,
        faenas: false,
        usuarios: false,
        empresas: false,
        visor_3d: false,
        gateway_3d: false,
      },
      supervisor: {
        dashboard: true,
        monitoreo: true,
        alertas: true,
        configuracion_alertas: false,
        equipos: false,
        reportes: true,
        faenas: true,
        usuarios: false,
        empresas: false,
        visor_3d: false,
        gateway_3d: false,
      },
    },
    userOverrides: {},
    userOverridesByEmail: {},
    equiposSubTabRolePermissions: {
      admin_minesafe: {
        asignaciones: true,
        arriendos: true,
        pagos: true,
        inventario: true,
        dispositivos: true,
        empresas: true,
      },
      admin: {
        asignaciones: true,
        arriendos: true,
        pagos: true,
        inventario: true,
        dispositivos: true,
        empresas: true,
      },
      operador: {
        asignaciones: false,
        arriendos: false,
        pagos: false,
        inventario: false,
        dispositivos: false,
        empresas: false,
      },
      supervisor: {
        asignaciones: true,
        arriendos: true,
        pagos: true,
        inventario: true,
        dispositivos: true,
        empresas: true,
      },
    },
    equiposSubTabUserOverrides: {},
    equiposSubTabUserOverridesByEmail: {},
    policyLocks: {
      operadorStrictPolicy: true,
      adminMineSafe3DPolicy: true,
      roleWindowPolicyLocks: {},
    },
    sectionRolePermissions: {
      admin_minesafe: {
        dash_hero_metrics: true,
        dash_hero_diagnostics: false,
        dash_welcome_banner: true,
        dash_welcome_stats: true,
        dash_welcome_diagnostics: false,
        dash_dual_diagnostic_row: true,
        dash_dual_quick_core: true,
        dash_dual_battery_airflow: false,
        dash_dual_o2_noise: false,
        dash_sector_chart: true,
        dash_sector_chart_extended: false,
        dash_users_panel: false,
        dash_gateway_section: true,
        dash_gateway_hw_controls: false,
        dash_capabilities_grid: true,
        dash_footer_alerts: false,
        mon_filters_bar: true,
        mon_tech_diagnostics: false,
        mon_simulation_controls: true,
        alerts_summary_cards: true,
        alerts_filters_bar: true,
        alerts_audit_subtab: true,
        alerts_siren_test: false,
        cfg_scope_actions: true,
        cfg_events_table: true,
        rep_export_csv: true,
        rep_chart_card: true,
        rep_audit_table: true,
        eq_header_kpis: true,
        eq_subtab_bar: true,
        faenas_sector_cards: true,
        faenas_crews_section: true,
        v3d_telemetry_panel: true,
      },
      admin: {
        dash_hero_metrics: true,
        dash_hero_diagnostics: false,
        dash_welcome_banner: true,
        dash_welcome_stats: true,
        dash_welcome_diagnostics: false,
        dash_dual_diagnostic_row: true,
        dash_dual_quick_core: true,
        dash_dual_battery_airflow: false,
        dash_dual_o2_noise: false,
        dash_sector_chart: true,
        dash_sector_chart_extended: false,
        dash_users_panel: false,
        dash_gateway_section: true,
        dash_gateway_hw_controls: false,
        dash_capabilities_grid: true,
        dash_footer_alerts: false,
        mon_filters_bar: true,
        mon_tech_diagnostics: false,
        mon_simulation_controls: true,
        alerts_summary_cards: true,
        alerts_filters_bar: true,
        alerts_audit_subtab: true,
        alerts_siren_test: false,
        cfg_scope_actions: true,
        cfg_events_table: true,
        rep_export_csv: true,
        rep_chart_card: true,
        rep_audit_table: true,
        eq_header_kpis: true,
        eq_subtab_bar: true,
        faenas_sector_cards: true,
        faenas_crews_section: true,
        v3d_telemetry_panel: true,
      },
      supervisor: {
        dash_hero_metrics: true,
        dash_hero_diagnostics: false,
        dash_welcome_banner: true,
        dash_welcome_stats: true,
        dash_welcome_diagnostics: false,
        dash_dual_diagnostic_row: true,
        dash_dual_quick_core: true,
        dash_dual_battery_airflow: false,
        dash_dual_o2_noise: false,
        dash_sector_chart: true,
        dash_sector_chart_extended: false,
        dash_users_panel: false,
        dash_gateway_section: true,
        dash_gateway_hw_controls: false,
        dash_capabilities_grid: true,
        dash_footer_alerts: false,
        mon_filters_bar: true,
        mon_tech_diagnostics: false,
        mon_simulation_controls: false,
        alerts_summary_cards: true,
        alerts_filters_bar: true,
        alerts_audit_subtab: true,
        alerts_siren_test: false,
        cfg_scope_actions: false,
        cfg_events_table: true,
        rep_export_csv: true,
        rep_chart_card: true,
        rep_audit_table: true,
        eq_header_kpis: true,
        eq_subtab_bar: true,
        faenas_sector_cards: true,
        faenas_crews_section: true,
        v3d_telemetry_panel: true,
      },
      operador: {
        dash_hero_metrics: false,
        dash_hero_diagnostics: false,
        dash_welcome_banner: true,
        dash_welcome_stats: false,
        dash_welcome_diagnostics: false,
        dash_dual_diagnostic_row: true,
        dash_dual_quick_core: true,
        dash_dual_battery_airflow: false,
        dash_dual_o2_noise: false,
        dash_sector_chart: true,
        dash_sector_chart_extended: false,
        dash_users_panel: false,
        dash_gateway_section: false,
        dash_gateway_hw_controls: false,
        dash_capabilities_grid: false,
        dash_footer_alerts: false,
        mon_filters_bar: true,
        mon_tech_diagnostics: false,
        mon_simulation_controls: false,
        alerts_summary_cards: true,
        alerts_filters_bar: true,
        alerts_audit_subtab: false,
        alerts_siren_test: false,
        cfg_scope_actions: false,
        cfg_events_table: true,
        rep_export_csv: false,
        rep_chart_card: true,
        rep_audit_table: true,
        eq_header_kpis: true,
        eq_subtab_bar: true,
        faenas_sector_cards: true,
        faenas_crews_section: false,
        v3d_telemetry_panel: true,
      },
    },
    sectionUserOverrides: {},
    sectionUserOverridesByEmail: {},
  },
  metrics: {
    coPreventivo: 200,
    coAdvertencia: 350,
    coCritico: 500,
    coChartSafeMax: 350,
    pm25Preventivo: 30,
    pm25Advertencia: 55,
    pm25Critico: 150,
    pm25ChartSafeMax: 55,
    tempMin: 10,
    tempPreventivo: 26,
    tempAdvertencia: 32,
    tempCritico: 38,
    humMin: 30,
    humPreventivo: 70,
    humAdvertencia: 80,
    humCritico: 90,
    airFlowMin: 0.5,
    airFlowMax: 3.0,
    batteryMin: 20,
    co2SafeMax: 1000,
    co2CriticalMax: 2000,
    ch4SafeMax: 1.5,
    ch4CriticalMax: 5.0,
    o2MinSafe: 19.5,
    noiseSafeMax: 82,
    noiseCriticalMax: 90,
    gatewayTimeoutSeconds: 20,
    emergencyGasThreshold: 500,
    emergencyDustThreshold: 150,
  },
  appearance: {
    platformTitle: 'MineSafe: Monitoreo IoT y Seguridad Minera',
    platformSubtitle: 'Supervisión ambiental subterránea continua, control de gases críticos, ventilación de galerías y respuesta temprana ante incidentes.',
    siteBadgeText: 'Faena El Teniente · Nivel -510m',
    footerText: 'Cumplimiento Normativo DS 132 / Sernageomin · Plataforma Industrial',
    textScalePct: 100,
    titleScalePct: 100,
    subtitleScalePct: 100,
    smallTextScalePct: 100,
    heroTitleScale: 'normal',
    announcementEnabled: false,
    announcementText: '',
    announcementTone: 'info',
    showChartsAndUsers: true,
    showESP32Section: true,
    showDualSensorCards: true,
    showHeroMetricCards: true,
    showCapabilitiesGrid: true,
    showAdditionalGasesRow: true,
    allowHardwareControlsForNonSuperAdmin: true,
    allowEmergencyButtonForOperador: true,
  },
  registeredDevices: [
    {
      id: 'device_38A839E81F84',
      organizationId: DEFAULT_ORGANIZATION.id,
      name: 'Nodo Sensor & Gateway Principal (1F84)',
      category: 'gateway_sensor',
      sectorName: 'Mina Chuquicamata - Rampa Principal',
      localIp: '192.168.4.1',
      enabled: true,
      createdAt: 1763000000000,
    },
  ],
  onlyShowRegisteredDevices: true,
  actualizado_en: Date.now(),
  actualizado_por: 'SuperAdmin (Por defecto)',
};

export function normalizeEmailOverrideKey(email?: string | null): string {
  if (!email) return '';
  return email.trim().toLowerCase().replace(/[.#$/[\]]/g, '_');
}

export function isWindowPolicyLockedForRole(
  role: ControllableRoleKey,
  tab: ControllableTab,
  config?: PlatformConfig | null
): boolean {
  const policyLocks = config?.visibility?.policyLocks;
  const explicit = policyLocks?.roleWindowPolicyLocks?.[role]?.[tab];
  if (explicit === true) return true;
  if (explicit === false) return false;

  if ((role === 'supervisor' || role === 'operador') && (tab === 'empresas' || tab === 'usuarios')) {
    return true;
  }
  if (role === 'admin_minesafe' && (tab === 'visor_3d' || tab === 'gateway_3d')) {
    return policyLocks?.adminMineSafe3DPolicy ?? true;
  }
  if (role === 'operador' && tab !== 'alertas') {
    return policyLocks?.operadorStrictPolicy ?? true;
  }
  return false;
}

export function isTabVisibleForUser(
  tab: NavigationTab,
  user: UserProfile | null,
  config?: PlatformConfig | null
): boolean {
  if (!user) return false;
  if (tab === 'superadmin_panel' || tab === 'superadmin_vistas' || tab === 'superadmin_docs') {
    return user.role === 'superadmin';
  }
  if (tab === 'auditoria_seguridad') {
    return isGlobalMineSafeAdmin(user.role);
  }
  if (user.role === 'superadmin') {
    return true;
  }

  const controllableTab = tab as ControllableTab;
  const roleKey: ControllableRoleKey =
    user.role === 'admin_minesafe'
      ? 'admin_minesafe'
      : user.role === 'admin'
      ? 'admin'
      : user.role === 'supervisor'
      ? 'supervisor'
      : 'operador';

  // Policy lock check (blocks rolePermissions and userOverrides until SuperAdmin unlocks by policy)
  if (isWindowPolicyLockedForRole(roleKey, controllableTab, config)) {
    return false;
  }

  if (tab === 'empresas' || tab === 'usuarios') {
    if (!isAnyAdminRole(user.role)) {
      const explicitlyUnlocked =
        config?.visibility?.policyLocks?.roleWindowPolicyLocks?.[roleKey]?.[controllableTab] === false;
      if (!explicitlyUnlocked) {
        return false;
      }
    }
  }

  // When Operador strict policy is active and Alertas was not individually overridden by policy, keep Alertas fixed read-only
  if (roleKey === 'operador' && controllableTab === 'alertas') {
    const strictActive = config?.visibility?.policyLocks?.operadorStrictPolicy ?? true;
    const explicitAlertas = config?.visibility?.policyLocks?.roleWindowPolicyLocks?.operador?.alertas;
    if (strictActive && explicitAlertas === undefined) {
      return true;
    }
  }

  const emailKey = normalizeEmailOverrideKey(user.email);
  const byIdOverride: WindowOverrideValue | undefined =
    config?.visibility?.userOverrides?.[user.id]?.[controllableTab];
  const byEmailOverride: WindowOverrideValue | undefined =
    emailKey ? config?.visibility?.userOverridesByEmail?.[emailKey]?.[controllableTab] : undefined;

  const userOverride: WindowOverrideValue | undefined =
    byIdOverride && byIdOverride !== 'inherit'
      ? byIdOverride
      : byEmailOverride;

  if (userOverride === 'allow') return true;
  if (userOverride === 'block') return false;

  const configuredRoleVal = config?.visibility?.rolePermissions?.[roleKey]?.[controllableTab];
  if (typeof configuredRoleVal === 'boolean') {
    return configuredRoleVal;
  }

  return DEFAULT_PLATFORM_CONFIG.visibility.rolePermissions[roleKey]![controllableTab];
}

export function isEquiposSubTabVisibleForUser(
  subTab: EquiposSubTab,
  user: UserProfile | null,
  config?: PlatformConfig | null
): boolean {
  if (!user) return false;
  if (user.role === 'superadmin') {
    return true;
  }

  const roleKey: ControllableRoleKey =
    user.role === 'admin_minesafe'
      ? 'admin_minesafe'
      : user.role === 'admin'
      ? 'admin'
      : user.role === 'supervisor'
      ? 'supervisor'
      : 'operador';

  if (isWindowPolicyLockedForRole(roleKey, 'equipos', config)) {
    return false;
  }

  const emailKey = normalizeEmailOverrideKey(user.email);
  const byIdOverride: WindowOverrideValue | undefined =
    config?.visibility?.equiposSubTabUserOverrides?.[user.id]?.[subTab];
  const byEmailOverride: WindowOverrideValue | undefined =
    emailKey ? config?.visibility?.equiposSubTabUserOverridesByEmail?.[emailKey]?.[subTab] : undefined;

  const userOverride: WindowOverrideValue | undefined =
    byIdOverride && byIdOverride !== 'inherit'
      ? byIdOverride
      : byEmailOverride;

  if (userOverride === 'allow') return true;
  if (userOverride === 'block') return false;

  const configuredRoleVal = config?.visibility?.equiposSubTabRolePermissions?.[roleKey]?.[subTab];
  if (typeof configuredRoleVal === 'boolean') {
    return configuredRoleVal;
  }

  return DEFAULT_PLATFORM_CONFIG.visibility.equiposSubTabRolePermissions![roleKey]![subTab];
}

export function isSectionVisibleForUser(
  section: SectionVisibilityKey,
  user: UserProfile | null | undefined,
  config?: PlatformConfig | null
): boolean {
  if (!user) return false;
  if (user.role === 'superadmin') {
    return true;
  }

  const roleKey: ControllableRoleKey =
    user.role === 'admin_minesafe'
      ? 'admin_minesafe'
      : user.role === 'admin'
      ? 'admin'
      : user.role === 'supervisor'
      ? 'supervisor'
      : 'operador';

  const emailKey = normalizeEmailOverrideKey(user.email);
  const byIdOverride: WindowOverrideValue | undefined =
    config?.visibility?.sectionUserOverrides?.[user.id]?.[section];
  const byEmailOverride: WindowOverrideValue | undefined =
    emailKey ? config?.visibility?.sectionUserOverridesByEmail?.[emailKey]?.[section] : undefined;

  const userOverride: WindowOverrideValue | undefined =
    byIdOverride && byIdOverride !== 'inherit'
      ? byIdOverride
      : byEmailOverride;

  if (userOverride === 'allow') return true;
  if (userOverride === 'block') return false;

  const configuredRoleVal = config?.visibility?.sectionRolePermissions?.[roleKey]?.[section];
  if (typeof configuredRoleVal === 'boolean') {
    return configuredRoleVal;
  }

  return Boolean(DEFAULT_PLATFORM_CONFIG.visibility.sectionRolePermissions?.[roleKey]?.[section]);
}

function mergePlatformConfig(raw: any): PlatformConfig {
  const rawPolicyLocks = raw?.visibility?.policyLocks;
  const defaultSections = DEFAULT_PLATFORM_CONFIG.visibility.sectionRolePermissions!;
  return {
    visibility: {
      rolePermissions: {
        admin_minesafe: {
          ...DEFAULT_PLATFORM_CONFIG.visibility.rolePermissions.admin_minesafe!,
          ...(raw?.visibility?.rolePermissions?.admin_minesafe || {}),
        },
        admin: {
          ...DEFAULT_PLATFORM_CONFIG.visibility.rolePermissions.admin,
          ...(raw?.visibility?.rolePermissions?.admin || {}),
        },
        operador: {
          ...DEFAULT_PLATFORM_CONFIG.visibility.rolePermissions.operador,
          ...(raw?.visibility?.rolePermissions?.operador || {}),
        },
        supervisor: {
          ...DEFAULT_PLATFORM_CONFIG.visibility.rolePermissions.supervisor,
          ...(raw?.visibility?.rolePermissions?.monotoriador || {}),
          ...(raw?.visibility?.rolePermissions?.supervisor || {}),
        },
      },
      userOverrides: raw?.visibility?.userOverrides || {},
      userOverridesByEmail: raw?.visibility?.userOverridesByEmail || {},
      equiposSubTabRolePermissions: {
        admin_minesafe: {
          ...DEFAULT_PLATFORM_CONFIG.visibility.equiposSubTabRolePermissions!.admin_minesafe!,
          ...(raw?.visibility?.equiposSubTabRolePermissions?.admin_minesafe || {}),
        },
        admin: {
          ...DEFAULT_PLATFORM_CONFIG.visibility.equiposSubTabRolePermissions!.admin,
          ...(raw?.visibility?.equiposSubTabRolePermissions?.admin || {}),
        },
        operador: {
          ...DEFAULT_PLATFORM_CONFIG.visibility.equiposSubTabRolePermissions!.operador,
          ...(raw?.visibility?.equiposSubTabRolePermissions?.operador || {}),
        },
        supervisor: {
          ...DEFAULT_PLATFORM_CONFIG.visibility.equiposSubTabRolePermissions!.supervisor,
          ...(raw?.visibility?.equiposSubTabRolePermissions?.monotoriador || {}),
          ...(raw?.visibility?.equiposSubTabRolePermissions?.supervisor || {}),
        },
      },
      equiposSubTabUserOverrides: raw?.visibility?.equiposSubTabUserOverrides || {},
      equiposSubTabUserOverridesByEmail: raw?.visibility?.equiposSubTabUserOverridesByEmail || {},
      policyLocks: {
        operadorStrictPolicy:
          typeof rawPolicyLocks?.operadorStrictPolicy === 'boolean'
            ? rawPolicyLocks.operadorStrictPolicy
            : true,
        adminMineSafe3DPolicy:
          typeof rawPolicyLocks?.adminMineSafe3DPolicy === 'boolean'
            ? rawPolicyLocks.adminMineSafe3DPolicy
            : true,
        roleWindowPolicyLocks: rawPolicyLocks?.roleWindowPolicyLocks || {},
      },
      sectionRolePermissions: {
        admin_minesafe: {
          ...(defaultSections.admin_minesafe || {}),
          ...(raw?.visibility?.sectionRolePermissions?.admin_minesafe || {}),
        },
        admin: {
          ...(defaultSections.admin || {}),
          ...(raw?.visibility?.sectionRolePermissions?.admin || {}),
        },
        operador: {
          ...(defaultSections.operador || {}),
          ...(raw?.visibility?.sectionRolePermissions?.operador || {}),
        },
        supervisor: {
          ...(defaultSections.supervisor || {}),
          ...(raw?.visibility?.sectionRolePermissions?.supervisor || {}),
        },
      },
      sectionUserOverrides: raw?.visibility?.sectionUserOverrides || {},
      sectionUserOverridesByEmail: raw?.visibility?.sectionUserOverridesByEmail || {},
    },
    metrics: {
      ...DEFAULT_PLATFORM_CONFIG.metrics,
      ...(raw?.metrics || {}),
    },
    appearance: {
      ...DEFAULT_PLATFORM_CONFIG.appearance,
      ...(raw?.appearance || {}),
      textScalePct: clampTextScalePct(raw?.appearance?.textScalePct),
      titleScalePct: clampTitleScalePct(raw?.appearance?.titleScalePct),
      subtitleScalePct: clampSubtitleScalePct(raw?.appearance?.subtitleScalePct),
      smallTextScalePct: clampSmallTextScalePct(raw?.appearance?.smallTextScalePct),
      heroTitleScale: normalizeHeroTitleScale(raw?.appearance?.heroTitleScale),
    },
    registeredDevices: Array.isArray(raw?.registeredDevices)
      ? raw.registeredDevices.map((dev: any) => {
          const rawOrg = typeof dev?.organizationId === 'string' ? dev.organizationId.trim() : '';
          const isExplicitInventory =
            rawOrg === UNASSIGNED_DEVICE_ORG_ID || dev?.assignmentStatus === 'en_inventario';
          return {
            ...dev,
            organizationId: isExplicitInventory
              ? UNASSIGNED_DEVICE_ORG_ID
              : rawOrg || DEFAULT_ORGANIZATION.id,
          };
        })
      : DEFAULT_PLATFORM_CONFIG.registeredDevices,
    onlyShowRegisteredDevices:
      typeof raw?.onlyShowRegisteredDevices === 'boolean'
        ? raw.onlyShowRegisteredDevices
        : true,
    actualizado_en: raw?.actualizado_en || Date.now(),
    actualizado_por: raw?.actualizado_por || 'SuperAdmin',
  };
}

export function clampTextScalePct(val?: number | null): number {
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n) || n <= 0) return 100;
  return Math.min(130, Math.max(85, Math.round(n)));
}

export function clampTitleScalePct(val?: number | null): number {
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n) || n <= 0) return 100;
  return Math.min(160, Math.max(75, Math.round(n)));
}

export function clampSubtitleScalePct(val?: number | null): number {
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n) || n <= 0) return 100;
  return Math.min(150, Math.max(75, Math.round(n)));
}

export function clampSmallTextScalePct(val?: number | null): number {
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n) || n <= 0) return 100;
  return Math.min(140, Math.max(80, Math.round(n)));
}

export function normalizeHeroTitleScale(
  val?: unknown
): 'compact' | 'normal' | 'large' | 'xlarge' {
  return val === 'compact' || val === 'normal' || val === 'large' || val === 'xlarge'
    ? val
    : 'normal';
}

export async function initializeRegisteredDeviceInRTDB(
  device: RegisteredDeviceConfig,
  actingUser: UserProfile
): Promise<void> {
  const perm = canRegisterAndAssignIoTDevices(actingUser);
  if (!perm.allowed) {
    throw new Error(perm.reason || 'Acceso denegado: Solo SuperAdmin o Admin MineSafe pueden inicializar dispositivos en Firebase.');
  }
  const cleanId = sanitizeDeviceHardwareId(device.id);
  const devRef = ref(rtdb, `dispositivos/${cleanId}`);
  const snap = await get(devRef).catch(() => null);
  const normalizedOrgId = isUnassignedDeviceOrg(device.organizationId)
    ? UNASSIGNED_DEVICE_ORG_ID
    : device.organizationId!;
  const assignmentStatus = resolveDeviceAssignmentStatus({
    ...device,
    organizationId: normalizedOrgId,
  });
  const baseMetadata = {
    name: device.name,
    organizationId: normalizedOrgId,
    organizationName: isUnassignedDeviceOrg(normalizedOrgId) ? null : device.organizationName || null,
    siteId: isUnassignedDeviceOrg(normalizedOrgId) ? null : device.siteId || null,
    siteName: isUnassignedDeviceOrg(normalizedOrgId) ? null : device.siteName || null,
    crewId: isUnassignedDeviceOrg(normalizedOrgId) ? null : device.crewId || null,
    crewName: isUnassignedDeviceOrg(normalizedOrgId) ? null : device.crewName || null,
    sectorId: isUnassignedDeviceOrg(normalizedOrgId) ? null : device.sectorId || null,
    sectorName: isUnassignedDeviceOrg(normalizedOrgId) ? 'En inventario' : device.sectorName || 'Pendiente de asignación',
    deviceCategory: device.category,
    assignmentStatus,
    parentGatewayId: device.parentGatewayId || null,
    localIp: device.localIp || '192.168.4.1',
    assignedBy: device.assignedBy || actingUser.name,
    assignedAt: device.assignedAt || Date.now(),
  };

  if (snap && snap.exists()) {
    await update(devRef, baseMetadata);
  } else {
    await set(devRef, {
      ...baseMetadata,
      CO: 0,
      PM2_5: 0,
      temperatura: 0,
      humedad: 0,
      alarma_activa: false,
      alarma: false,
      buzzer: false,
      luz: false,
      iluminacion_led: false,
      estado_adquisicion: 'pendiente_hardware',
      origen_alarma: 'NINGUNO',
      descripcion_monitoreo: `Dispositivo ${device.name} registrado por ${actingUser.name}, en espera de telemetría ESP32.`,
      via: (device.category === 'nodo' || device.category === 'sensor') && device.parentGatewayId ? 'ESP_NOW_GATEWAY' : 'WIFI_DIRECTO',
      last_update_server: 0,
    });
  }
}

export function subscribeToPlatformConfig(
  callback: (config: PlatformConfig) => void
): () => void {
  const cfgRef = ref(rtdb, 'configuracion_plataforma');
  return onValue(
    cfgRef,
    (snapshot) => {
      if (snapshot.exists()) {
        callback(mergePlatformConfig(snapshot.val()));
      } else {
        callback(DEFAULT_PLATFORM_CONFIG);
      }
    },
    (err) => {
      console.warn('Error subscribing to platform config:', err);
      callback(DEFAULT_PLATFORM_CONFIG);
    }
  );
}

export async function savePlatformConfig(
  config: PlatformConfig,
  actingUser: UserProfile
): Promise<void> {
  if (actingUser.role !== 'superadmin') {
    throw new Error('Acceso denegado: Solo el SuperAdministrador puede modificar la configuración maestra de la plataforma.');
  }

  const m = config.metrics;
  if (m.coPreventivo >= m.coAdvertencia || m.coAdvertencia >= m.coCritico) {
    throw new Error('En Gas CO (MQ-2): Preventivo debe ser menor que Advertencia y éste menor que Crítico.');
  }
  if (m.pm25Preventivo >= m.pm25Advertencia || m.pm25Advertencia >= m.pm25Critico) {
    throw new Error('En Polvo PM2.5: Preventivo debe ser menor que Advertencia y éste menor que Crítico.');
  }
  if (m.tempPreventivo >= m.tempAdvertencia || m.tempAdvertencia >= m.tempCritico) {
    throw new Error('En Temperatura: Preventivo debe ser menor que Advertencia y éste menor que Crítico.');
  }
  if (m.humPreventivo >= m.humAdvertencia || m.humAdvertencia >= m.humCritico) {
    throw new Error('En Humedad: Preventivo debe ser menor que Advertencia y éste menor que Crítico.');
  }

  const payload: PlatformConfig = JSON.parse(
    JSON.stringify({
      ...config,
      appearance: {
        ...DEFAULT_PLATFORM_CONFIG.appearance,
        ...(config.appearance || {}),
        textScalePct: clampTextScalePct(config.appearance?.textScalePct),
        titleScalePct: clampTitleScalePct(config.appearance?.titleScalePct),
        subtitleScalePct: clampSubtitleScalePct(config.appearance?.subtitleScalePct),
        smallTextScalePct: clampSmallTextScalePct(config.appearance?.smallTextScalePct),
        heroTitleScale: normalizeHeroTitleScale(config.appearance?.heroTitleScale),
      },
      actualizado_en: Date.now(),
      actualizado_por: `${actingUser.name} (SuperAdmin)`,
    })
  );

  try {
    await set(ref(rtdb, 'configuracion_plataforma'), payload);
  } catch (err: any) {
    const rawMsg = String(err?.message || err || '');
    if (rawMsg.toLowerCase().includes('permission') || rawMsg.toLowerCase().includes('denied')) {
      throw new Error(
        'Firebase RTDB rechazó guardar en /configuracion_plataforma (PERMISSION_DENIED). Verifica en Realtime Database → Reglas del proyecto minefase-fc5f5 que el SuperAdmin tenga permiso de escritura.'
      );
    }
    throw err;
  }

  // Sincronizar también umbrales globales en /configuracion_alertas/global para el motor de alertas
  try {
    const existingGlobalSnap = await get(ref(rtdb, 'configuracion_alertas/global')).catch(() => null);
    const baseGlobal = existingGlobalSnap?.exists() ? existingGlobalSnap.val() : DEFAULT_GLOBAL_THRESHOLDS;
    await set(ref(rtdb, 'configuracion_alertas/global'), {
      ...baseGlobal,
      dispositivo_id: 'global',
      mq2: {
        ...DEFAULT_GLOBAL_THRESHOLDS.mq2,
        ...(baseGlobal.mq2 || {}),
        preventivo: m.coPreventivo,
        advertencia: m.coAdvertencia,
        critico: m.coCritico,
      },
      pm25: {
        ...DEFAULT_GLOBAL_THRESHOLDS.pm25,
        ...(baseGlobal.pm25 || {}),
        preventivo: m.pm25Preventivo,
        advertencia: m.pm25Advertencia,
        critico: m.pm25Critico,
      },
      temperatura: {
        ...DEFAULT_GLOBAL_THRESHOLDS.temperatura,
        ...(baseGlobal.temperatura || {}),
        preventivo: m.tempPreventivo,
        advertencia: m.tempAdvertencia,
        critico: m.tempCritico,
      },
      humedad: {
        ...DEFAULT_GLOBAL_THRESHOLDS.humedad,
        ...(baseGlobal.humedad || {}),
        preventivo: m.humPreventivo,
        advertencia: m.humAdvertencia,
        critico: m.humCritico,
      },
      actualizado_en: Date.now(),
      actualizado_por: `${actingUser.name} (SuperAdmin Maestro)`,
    });
  } catch (syncErr) {
    console.warn('Error syncing global alert thresholds from platform config:', syncErr);
  }
}

export async function resetPlatformConfigToDefault(
  actingUser: UserProfile
): Promise<PlatformConfig> {
  if (actingUser.role !== 'superadmin') {
    throw new Error('Acceso denegado: Solo el SuperAdministrador puede restaurar la configuración maestra.');
  }
  const restored: PlatformConfig = {
    ...DEFAULT_PLATFORM_CONFIG,
    actualizado_en: Date.now(),
    actualizado_por: `${actingUser.name} (Restauración SuperAdmin)`,
  };
  await set(ref(rtdb, 'configuracion_plataforma'), restored);
  return restored;
}

/**
 * ============================================================================
 * PERSISTENCIA DE FAENAS MINERAS, SECTORES Y CUADRILLAS ASIGNADAS (/faenas)
 * ============================================================================
 */
const FAENAS_CACHE_KEY = 'minesafe_saved_faenas_v1';

function normalizeSector(raw: any, index: number): MiningSector {
  const crewsRaw = raw?.assignedCrews;
  const assignedCrews: string[] = Array.isArray(crewsRaw)
    ? crewsRaw.filter((c) => typeof c === 'string' && c.trim() !== '')
    : crewsRaw && typeof crewsRaw === 'object'
    ? (Object.values(crewsRaw).filter((c) => typeof c === 'string' && c.trim() !== '') as string[])
    : [];

  return {
    id: raw?.id || `sec-${Date.now()}-${index}`,
    name: raw?.name || `Sector ${index + 1}`,
    code: raw?.code || `SEC-0${index + 1}`,
    depthMeters: typeof raw?.depthMeters === 'number' ? raw.depthMeters : Number(raw?.depthMeters) || 200,
    type: raw?.type || 'socavon',
    activeWorkers: typeof raw?.activeWorkers === 'number' ? raw.activeWorkers : Number(raw?.activeWorkers) || 0,
    sensorsCount: typeof raw?.sensorsCount === 'number' ? raw.sensorsCount : Number(raw?.sensorsCount) || 1,
    generalStatus: raw?.generalStatus || 'normal',
    ventilationFanStatus: raw?.ventilationFanStatus || 'operativo_normal',
    assignedCrews,
  };
}

export function normalizeMiningSite(raw: any, fallbackId?: string): MiningSite {
  const rawSectors = raw?.activeSectors;
  const sectorsArr: any[] = Array.isArray(rawSectors)
    ? rawSectors
    : rawSectors && typeof rawSectors === 'object'
    ? Object.values(rawSectors)
    : [];

  return {
    id: raw?.id || fallbackId || `site-${Date.now()}`,
    organizationId: raw?.organizationId || DEFAULT_ORGANIZATION.id,
    name: raw?.name || 'Faena Minera',
    company: raw?.company || 'Empresa Minera',
    location: raw?.location || (raw?.comuna && raw?.region ? `${raw.comuna}, ${raw.region}` : 'Chile'),
    comuna: raw?.comuna || undefined,
    region: raw?.region || 'Antofagasta',
    type: raw?.type || 'subterranea',
    elevationMsl: typeof raw?.elevationMsl === 'number' ? raw.elevationMsl : Number(raw?.elevationMsl) || 2400,
    isPreloaded: Boolean(raw?.isPreloaded),
    status: raw?.status === 'bloqueada' ? 'bloqueada' : 'activa',
    activeSectors: sectorsArr.map((s, idx) => normalizeSector(s, idx)),
  };
}

export function loadCachedSites(): MiningSite[] {
  try {
    const raw = localStorage.getItem(FAENAS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((s) => normalizeMiningSite(s));
  } catch {
    return [];
  }
}

export function saveCachedSites(sites: MiningSite[]): void {
  try {
    localStorage.setItem(FAENAS_CACHE_KEY, JSON.stringify(sites));
  } catch {
    // ignore storage quota errors
  }
}

export function mergeMiningSites(baseSites: MiningSite[], incomingSites: MiningSite[]): MiningSite[] {
  const map = new Map<string, MiningSite>();
  baseSites.forEach((s) => map.set(s.id, normalizeMiningSite(s, s.id)));
  incomingSites.forEach((s) => map.set(s.id, normalizeMiningSite(s, s.id)));
  return Array.from(map.values());
}

export async function saveSiteToRTDB(
  site: MiningSite
): Promise<{ savedToRTDB: boolean; error?: string }> {
  const cleanSite: MiningSite = JSON.parse(JSON.stringify(normalizeMiningSite(site, site.id)));
  const cached = loadCachedSites();
  saveCachedSites(mergeMiningSites(cached, [cleanSite]));

  try {
    await set(ref(rtdb, `faenas/${cleanSite.id}`), {
      ...cleanSite,
      updatedAt: Date.now(),
    });
    return { savedToRTDB: true };
  } catch (err: any) {
    console.warn('Error saving site to RTDB (/faenas):', err);
    return {
      savedToRTDB: false,
      error: err?.message || 'Guardado en respaldo local (sin permisos en /faenas de RTDB).',
    };
  }
}

export async function deleteSiteFromRTDB(
  siteId: string,
  actingUser: UserProfile | null | undefined
): Promise<{ deletedFromRTDB: boolean; error?: string }> {
  assertActiveSession(actingUser);
  const check = canBlockOrDeleteSite(actingUser, { id: siteId });
  if (!check.allowed) {
    throw new Error(check.reason || 'Permisos insuficientes para eliminar esta faena.');
  }

  const cleanId = siteId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const cached = loadCachedSites().filter((s) => s.id !== siteId && s.id !== cleanId);
  saveCachedSites(cached);

  try {
    await remove(ref(rtdb, `faenas/${siteId}`));
    if (cleanId !== siteId) {
      await remove(ref(rtdb, `faenas/${cleanId}`)).catch(() => {});
    }
    return { deletedFromRTDB: true };
  } catch (err: any) {
    console.warn('Error removing site from RTDB (/faenas):', err);
    return {
      deletedFromRTDB: false,
      error: err?.message || 'Eliminada localmente (error al eliminar en /faenas de RTDB).',
    };
  }
}

export function subscribeToRTDBSites(
  callback: (sites: MiningSite[]) => void,
  scope?: RTDBSubscriptionScope
): () => void {
  const sitesRef = buildOrgScopedQuery('faenas', scope);
  return onValue(
    sitesRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const val = snapshot.val() || {};
        const remoteList = Object.keys(val).map((k) => normalizeMiningSite(val[k], k));
        callback(remoteList);
      } else {
        callback([]);
      }
    },
    (err) => {
      console.warn('Error subscribing to RTDB /faenas:', err?.message || err);
      callback([]);
    }
  );
}

/**
 * ============================================================================
 * ORGANIZACIONES MULTI-EMPRESA (/organizaciones)
 * ============================================================================
 */
function mapRTDBOrganization(id: string, val: any): Organization {
  return {
    id,
    name: val?.name || id,
    rut: val?.rut || '',
    industry: val?.industry || 'Minería',
    status: val?.status === 'suspendida' ? 'suspendida' : 'activa',
    createdAt: typeof val?.createdAt === 'number' ? val.createdAt : Date.now(),
    updatedAt: val?.updatedAt,
    createdBy: val?.createdBy,
    ownerId: val?.ownerId || val?.ownerUid,
    ownerUid: val?.ownerUid || val?.ownerId,
    ownerEmail: val?.ownerEmail,
  };
}

export function subscribeToRTDBOrganizations(
  callback: (orgs: Organization[]) => void,
  scope?: RTDBSubscriptionScope
): () => void {
  if (scope?.role === 'admin') {
    const primaryOrgId =
      scope.organizationId && scope.organizationId !== 'all'
        ? scope.organizationId
        : DEFAULT_ORGANIZATION_ID;

    let primaryOrg: Organization | null = null;
    let ownedOrgs: Record<string, Organization> = {};

    const emitAdminOrgs = () => {
      const mergedMap = new Map<string, Organization>();
      if (primaryOrg) {
        mergedMap.set(primaryOrg.id, primaryOrg);
      } else if (primaryOrgId === DEFAULT_ORGANIZATION.id) {
        mergedMap.set(DEFAULT_ORGANIZATION.id, DEFAULT_ORGANIZATION);
      }
      Object.values(ownedOrgs).forEach((o) => {
        mergedMap.set(o.id, o);
      });
      const result = Array.from(mergedMap.values());
      result.sort((a, b) => {
        if (a.id === primaryOrgId) return -1;
        if (b.id === primaryOrgId) return 1;
        return a.name.localeCompare(b.name);
      });
      const fallbackPrimary: Organization =
        primaryOrgId === DEFAULT_ORGANIZATION.id
          ? DEFAULT_ORGANIZATION
          : {
              id: primaryOrgId,
              name: primaryOrgId,
              rut: '',
              industry: 'Minería',
              status: 'activa',
              createdAt: 0,
            };
      callback(result.length > 0 ? result : [fallbackPrimary]);
    };

    const unsubPrimary = onValue(
      ref(rtdb, `organizaciones/${primaryOrgId}`),
      (snapshot) => {
        if (snapshot.exists()) {
          primaryOrg = mapRTDBOrganization(primaryOrgId, snapshot.val());
        } else {
          primaryOrg = primaryOrgId === DEFAULT_ORGANIZATION.id ? DEFAULT_ORGANIZATION : null;
        }
        emitAdminOrgs();
      },
      () => {
        emitAdminOrgs();
      }
    );

    const ownerUid = scope.uid || auth.currentUser?.uid;
    const unsubOwned = ownerUid
      ? onValue(
          query(ref(rtdb, 'organizaciones'), orderByChild('ownerUid'), equalTo(ownerUid)),
          (snapshot) => {
            const nextOwned: Record<string, Organization> = {};
            if (snapshot.exists()) {
              const val = snapshot.val() || {};
              Object.keys(val).forEach((k) => {
                nextOwned[k] = mapRTDBOrganization(k, val[k]);
              });
            }
            ownedOrgs = nextOwned;
            emitAdminOrgs();
          },
          () => {
            emitAdminOrgs();
          }
        )
      : () => {};

    return () => {
      unsubPrimary();
      unsubOwned();
    };
  }

  if (scope?.role && !isGlobalMineSafeAdmin(scope.role)) {
    const orgId =
      scope.organizationId && scope.organizationId !== 'all'
        ? scope.organizationId
        : DEFAULT_ORGANIZATION_ID;
    const fallbackOrg: Organization =
      orgId === DEFAULT_ORGANIZATION.id
        ? DEFAULT_ORGANIZATION
        : {
            id: orgId,
            name: orgId,
            rut: '',
            industry: 'Minería',
            status: 'activa',
            createdAt: 0,
          };
    return onValue(
      ref(rtdb, `organizaciones/${orgId}`),
      (snapshot) => {
        if (snapshot.exists()) {
          callback([mapRTDBOrganization(orgId, snapshot.val() || {})]);
        } else {
          callback([fallbackOrg]);
        }
      },
      () => {
        callback([fallbackOrg]);
      }
    );
  }

  const orgsRef = ref(rtdb, 'organizaciones');
  return onValue(
    orgsRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const val = snapshot.val() || {};
        const list: Organization[] = Object.keys(val).map((k) => mapRTDBOrganization(k, val[k]));
        if (!list.some((o) => o.id === DEFAULT_ORGANIZATION.id)) {
          list.unshift(DEFAULT_ORGANIZATION);
        }
        callback(list);
      } else {
        callback([DEFAULT_ORGANIZATION]);
      }
    },
    () => {
      callback([DEFAULT_ORGANIZATION]);
    }
  );
}

export async function saveOrganizationToRTDB(
  org: Organization,
  actingUser: UserProfile
): Promise<Organization> {
  assertActiveSession(actingUser);
  const cleanId = org.id.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  if (!cleanId) {
    throw new Error('El identificador de la organización es inválido.');
  }
  const cleanName = org.name.trim();
  if (cleanName.length < 2 || cleanName.length > 160) {
    throw new Error('El nombre comercial de la empresa debe tener entre 2 y 160 caracteres.');
  }

  const orgRef = ref(rtdb, `organizaciones/${cleanId}`);
  const existingSnap = await get(orgRef).catch(() => null);
  const existingOrg = existingSnap?.exists()
    ? mapRTDBOrganization(cleanId, existingSnap.val())
    : null;

  const permCheck = canCreateOrEditOrganization(actingUser, existingOrg);
  if (!permCheck.allowed) {
    throw new Error(permCheck.reason || 'Permisos insuficientes para guardar la organización.');
  }

  const ownerUid =
    existingOrg?.ownerUid || org.ownerUid || actingUser.id || auth.currentUser?.uid || '';
  const ownerEmail =
    existingOrg?.ownerEmail || org.ownerEmail || actingUser.email || '';

  let formattedOrgRut = '';
  if (!isPlaceholderRut(org.rut)) {
    const rutCheck = validateChileanRut(org.rut || '');
    if (!rutCheck.valid) {
      throw new Error(rutCheck.error || 'El RUT de la empresa no es válido según Módulo 11.');
    }
    formattedOrgRut = rutCheck.formatted!;
  }

  const payload: Organization & { ownerUid: string } = {
    id: cleanId,
    name: cleanName,
    rut: formattedOrgRut,
    industry: org.industry?.trim() || 'Minería',
    status: org.status || 'activa',
    createdAt: existingOrg?.createdAt || org.createdAt || Date.now(),
    updatedAt: Date.now(),
    createdBy: existingOrg?.createdBy || actingUser.email || actingUser.name,
    ownerId: ownerUid,
    ownerUid,
    ownerEmail,
  };

  await set(orgRef, payload);
  return payload;
}

export async function deleteOrganizationFromRTDB(
  orgId: string,
  actingUser: UserProfile
): Promise<void> {
  assertActiveSession(actingUser);
  if (orgId === DEFAULT_ORGANIZATION.id) {
    throw new Error('No se puede eliminar la organización principal por defecto.');
  }
  const orgRef = ref(rtdb, `organizaciones/${orgId}`);
  const existingSnap = await get(orgRef).catch(() => null);
  const existingOrg: Organization | null = existingSnap?.exists()
    ? mapRTDBOrganization(orgId, existingSnap.val())
    : {
        id: orgId,
        name: orgId,
        status: 'activa',
        createdAt: 0,
      };
  const check = canDeleteOrganization(actingUser, existingOrg);
  if (!check.allowed) {
    throw new Error(check.reason || 'Permisos insuficientes para eliminar esta organización.');
  }
  await remove(orgRef);
}

/**
 * ============================================================================
 * ASIGNACIONES DE PERSONAL (/asignaciones)
 * ============================================================================
 */
export function subscribeToRTDBAssignments(
  callback: (assignments: WorkerAssignment[]) => void,
  scope?: RTDBSubscriptionScope
): () => void {
  const assignRef = buildOrgScopedQuery('asignaciones', scope);
  return onValue(
    assignRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const val = snapshot.val() || {};
        const list: WorkerAssignment[] = Object.keys(val).map((k) => ({
          id: k,
          organizationId: val[k]?.organizationId || DEFAULT_ORGANIZATION.id,
          workerRut: val[k]?.workerRut || '',
          workerName: val[k]?.workerName || 'Operador',
          role: val[k]?.role || 'Operador Mina',
          crew: val[k]?.crew || 'Cuadrilla Alfa',
          sectorName: val[k]?.sectorName || 'Faena Central',
          assignedDeviceId: val[k]?.assignedDeviceId || '',
          assignedDeviceCode: val[k]?.assignedDeviceCode || '',
          assignmentDate: val[k]?.assignmentDate || new Date().toISOString().split('T')[0],
          deviceBattery: typeof val[k]?.deviceBattery === 'number' ? val[k].deviceBattery : 100,
          emergencyContact: val[k]?.emergencyContact || '',
          userId: val[k]?.userId || undefined,
          crewId: val[k]?.crewId || undefined,
        }));
        callback(list);
      } else {
        callback([]);
      }
    },
    () => callback([])
  );
}

export async function saveAssignmentToRTDB(assignment: WorkerAssignment): Promise<void> {
  const cleanId = assignment.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const payload = JSON.parse(
    JSON.stringify({
      ...assignment,
      id: cleanId,
      organizationId: assignment.organizationId || DEFAULT_ORGANIZATION.id,
      updatedAt: Date.now(),
    })
  );
  await set(ref(rtdb, `asignaciones/${cleanId}`), payload);
}

/**
 * ============================================================================
 * CUADRILLAS OPERATIVAS Y ASIGNACIÓN DE TRABAJADORES (/cuadrillas)
 * ============================================================================
 */
const CUADRILLAS_CACHE_KEY = 'minesafe_saved_cuadrillas_v1';

function normalizeCrewMember(raw: any, idx: number): CrewMember {
  return {
    id: String(raw?.id || `mbr-${Date.now()}-${idx}`),
    userId: raw?.userId ? String(raw.userId) : undefined,
    assignmentId: raw?.assignmentId ? String(raw.assignmentId) : undefined,
    name: String(raw?.name || 'Trabajador').trim(),
    rut: String(raw?.rut || 'Sin RUT').trim(),
    role: String(raw?.role || 'Operador de Faena').trim(),
    email: raw?.email ? String(raw.email).trim() : undefined,
    assignedDeviceCode: raw?.assignedDeviceCode ? String(raw.assignedDeviceCode).trim() : undefined,
    emergencyContact: raw?.emergencyContact ? String(raw.emergencyContact).trim() : undefined,
    isLeader: Boolean(raw?.isLeader),
    addedAt: typeof raw?.addedAt === 'number' ? raw.addedAt : Date.now(),
  };
}

export function normalizeMiningCrew(raw: any, fallbackId?: string): MiningCrew {
  const rawMembers = raw?.members;
  const membersArr: any[] = Array.isArray(rawMembers)
    ? rawMembers
    : rawMembers && typeof rawMembers === 'object'
    ? Object.values(rawMembers)
    : [];
  const members = membersArr.map((m, idx) => normalizeCrewMember(m, idx));
  const leader = members.find((m) => m.isLeader);

  return {
    id: String(raw?.id || fallbackId || `crew-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_'),
    organizationId: String(raw?.organizationId || DEFAULT_ORGANIZATION.id),
    name: String(raw?.name || 'Cuadrilla Operativa').trim(),
    code: String(raw?.code || 'CUA-01').trim(),
    shift: String(raw?.shift || 'Turno Mañana (07:00 - 15:30)').trim(),
    leaderName: raw?.leaderName || leader?.name || undefined,
    leaderUserId: raw?.leaderUserId || leader?.userId || undefined,
    siteId: raw?.siteId || undefined,
    siteName: raw?.siteName || undefined,
    sectorId: raw?.sectorId || undefined,
    sectorName: raw?.sectorName || undefined,
    notes: raw?.notes ? String(raw.notes).trim() : undefined,
    status:
      raw?.status === 'inactiva' || raw?.status === 'en_descanso' || raw?.status === 'bloqueada'
        ? raw.status
        : 'activa',
    members,
    createdBy: raw?.createdBy || undefined,
    createdAt: typeof raw?.createdAt === 'number' ? raw.createdAt : Date.now(),
    updatedAt: typeof raw?.updatedAt === 'number' ? raw.updatedAt : Date.now(),
  };
}

export function loadCachedCrews(): MiningCrew[] {
  try {
    const raw = localStorage.getItem(CUADRILLAS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((c) => normalizeMiningCrew(c));
  } catch {
    return [];
  }
}

export function saveCachedCrews(crews: MiningCrew[]): void {
  try {
    localStorage.setItem(CUADRILLAS_CACHE_KEY, JSON.stringify(crews));
  } catch {
    // ignore storage quota errors
  }
}

export function mergeMiningCrews(baseCrews: MiningCrew[], incomingCrews: MiningCrew[]): MiningCrew[] {
  const map = new Map<string, MiningCrew>();
  baseCrews.forEach((c) => map.set(c.id, normalizeMiningCrew(c, c.id)));
  incomingCrews.forEach((c) => map.set(c.id, normalizeMiningCrew(c, c.id)));
  return Array.from(map.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function subscribeToRTDBCrews(
  callback: (crews: MiningCrew[]) => void,
  scope?: RTDBSubscriptionScope
): () => void {
  const crewsRef = buildOrgScopedQuery('cuadrillas', scope);
  return onValue(
    crewsRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const val = snapshot.val() || {};
        const list = Object.keys(val).map((k) => normalizeMiningCrew(val[k], k));
        list.sort((a, b) => b.updatedAt - a.updatedAt);
        callback(list);
      } else {
        callback([]);
      }
    },
    (err) => {
      console.warn('Error subscribing to RTDB /cuadrillas:', err?.message || err);
      callback([]);
    }
  );
}

export async function saveCrewToRTDB(
  crew: MiningCrew,
  actingUser: UserProfile | null | undefined,
  organizations?: Organization[]
): Promise<{ savedToRTDB: boolean; crew: MiningCrew; error?: string }> {
  assertActiveSession(actingUser);
  const targetOrg = crew.organizationId || DEFAULT_ORGANIZATION.id;
  const check = canManageCrews(actingUser, targetOrg, organizations);
  if (!check.allowed) {
    throw new Error(check.reason || 'Permisos insuficientes para gestionar cuadrillas.');
  }

  const normalized = normalizeMiningCrew(
    {
      ...crew,
      organizationId: targetOrg,
      createdBy: crew.createdBy || actingUser!.name || actingUser!.email,
      updatedAt: Date.now(),
    },
    crew.id
  );
  const cleanPayload: MiningCrew = JSON.parse(JSON.stringify(normalized));

  const cached = loadCachedCrews();
  saveCachedCrews(mergeMiningCrews(cached, [cleanPayload]));

  try {
    await set(ref(rtdb, `cuadrillas/${cleanPayload.id}`), cleanPayload);
    return { savedToRTDB: true, crew: cleanPayload };
  } catch (err: any) {
    console.warn('Error saving crew to RTDB (/cuadrillas):', err);
    return {
      savedToRTDB: false,
      crew: cleanPayload,
      error: err?.message || 'Guardado en respaldo local (sin permisos en /cuadrillas de RTDB).',
    };
  }
}

export async function deleteCrewFromRTDB(
  crewId: string,
  targetOrgId: string,
  actingUser: UserProfile | null | undefined,
  organizations?: Organization[]
): Promise<{ deletedFromRTDB: boolean; error?: string }> {
  assertActiveSession(actingUser);
  const check = canManageCrews(actingUser, targetOrgId, organizations);
  if (!check.allowed) {
    throw new Error(check.reason || 'Permisos insuficientes para eliminar esta cuadrilla.');
  }

  const cleanId = crewId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const cached = loadCachedCrews().filter((c) => c.id !== cleanId && c.id !== crewId);
  saveCachedCrews(cached);

  try {
    await remove(ref(rtdb, `cuadrillas/${cleanId}`));
    return { deletedFromRTDB: true };
  } catch (err: any) {
    console.warn('Error removing crew from RTDB (/cuadrillas):', err);
    return {
      deletedFromRTDB: false,
      error: err?.message || 'Eliminado localmente (error al eliminar en /cuadrillas de RTDB).',
    };
  }
}

/**
 * ============================================================================
 * HISTORIAL REAL DE TELEMETRÍA (/historial_telemetria/{deviceId}/{timestamp})
 * ============================================================================
 */
const lastTelemetryWriteMap: Record<string, { ts: number; sig: string }> = {};

export async function recordTelemetryHistoryPoint(device: SensorDevice): Promise<void> {
  // No duplicar historial operacional para telemetría de banco ni para el equipo experimental V2.
  if (device.isBenchTelemetry || isExperimentalBenchDevice(device)) return;
  if (!device.gatewayOnline || device.status === 'desconectado') return;
  if (
    device.rawCO === undefined &&
    device.rawPM25 === undefined &&
    device.rawTemp === undefined &&
    device.rawHum === undefined
  ) {
    return;
  }

  const now = Date.now();
  const prev = lastTelemetryWriteMap[device.id];
  const sig = `${device.rawCO ?? 'x'}|${device.rawPM25 ?? 'x'}|${device.rawTemp ?? 'x'}|${device.rawHum ?? 'x'}`;

  // Throttling: mínimo 5 segundos entre puntos; si no cambiaron los valores, guardar latido cada 30s
  if (prev) {
    const elapsed = now - prev.ts;
    if (elapsed < 5000) return;
    if (prev.sig === sig && elapsed < 30000) return;
  }

  // Evitar colisiones con prev.ts garantizando marca estrictamente creciente
  const safeTs = prev && now <= prev.ts ? prev.ts + 1 : now;
  lastTelemetryWriteMap[device.id] = { ts: safeTs, sig };

  const sample: TelemetryHistoryPoint = {
    timestamp: safeTs,
    co: device.rawCO ?? null,
    pm25: device.rawPM25 ?? null,
    temperatura: device.rawTemp ?? null,
    humedad: device.rawHum ?? null,
  };

  try {
    await set(ref(rtdb, `historial_telemetria/${device.id}/${safeTs}`), sample);
  } catch (err) {
    console.warn('Error persisting telemetry history sample:', err);
  }
}

export function resolveTelemetryWindowMs(
  rangeOrOptions: number | { startMs: number; endMs?: number; limit?: number },
  nowMs: number = getEstimatedServerNowMs()
): { startMs: number; endMs: number; limit: number } {
  if (typeof rangeOrOptions === 'number') {
    const hours = Math.max(0.25, rangeOrOptions);
    return {
      startMs: nowMs - hours * 3600 * 1000,
      endMs: nowMs,
      limit: hours >= 24 * 7 ? 15000 : hours > 24 ? 5000 : 2500,
    };
  }
  const endMs = typeof rangeOrOptions.endMs === 'number' && rangeOrOptions.endMs > 0
    ? rangeOrOptions.endMs
    : nowMs;
  const startMs = Math.min(rangeOrOptions.startMs, endMs);
  const limit = Math.max(100, rangeOrOptions.limit || 20000);
  return { startMs, endMs, limit };
}

export function mapTelemetrySnapshotRaw(
  raw: Record<string, any>,
  startMs: number,
  endMs: number,
  source?: TelemetryHistoryPoint['source']
): TelemetryHistoryPoint[] {
  const toFiniteOrNull = (v: unknown): number | null => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const parsed = Number(v);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  };

  return Object.keys(raw || {})
    .map((k) => {
      const item = raw[k];
      if (!item || typeof item !== 'object') return null;
      const rawCandidate =
        item.timestamp ??
        item.last_update_server ??
        item.timestamp_server ??
        item.serverTimestamp ??
        item.timestamp_unix ??
        k;
      const ts = normalizeServerTimestampMs(rawCandidate);
      if (!ts) return null;

      const co = toFiniteOrNull(item.co ?? item.CO ?? item.mq2 ?? item.gas);
      const pm25 = toFiniteOrNull(item.pm25 ?? item.PM2_5 ?? item.polvo ?? item.dust);
      const temperatura = toFiniteOrNull(item.temperatura ?? item.temp ?? item.temperature);
      const humedad = toFiniteOrNull(item.humedad ?? item.hum ?? item.humidity);

      if (co === null && pm25 === null && temperatura === null && humedad === null) {
        return null;
      }

      return {
        timestamp: ts,
        co,
        pm25,
        temperatura,
        humedad,
        ...(source ? { source } : {}),
        ...(typeof item.originTimestamp === 'number' ? { originTimestamp: item.originTimestamp } : {}),
        ...(typeof item.serverTimestamp === 'number' ? { serverTimestamp: item.serverTimestamp } : {}),
      } as TelemetryHistoryPoint;
    })
    .filter(
      (p): p is TelemetryHistoryPoint =>
        p !== null && Number.isFinite(p.timestamp) && p.timestamp >= startMs && p.timestamp <= endMs
    )
    .sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Fusiona series históricas de distintas rutas (/historial_telemetria, /dispositivos/{id}/historial,
 * /diagnostico/esp32_p087/historial) sin borrar ni sobrescribir muestras previas.
 */
export function mergeTelemetryHistorySeries(
  ...seriesList: TelemetryHistoryPoint[][]
): TelemetryHistoryPoint[] {
  const map = new Map<number, TelemetryHistoryPoint>();
  for (const series of seriesList) {
    if (!Array.isArray(series)) continue;
    for (const pt of series) {
      if (!pt || !Number.isFinite(pt.timestamp)) continue;
      if (!map.has(pt.timestamp)) {
        map.set(pt.timestamp, pt);
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp);
}

function isRTDBIndexMissingError(err: any): boolean {
  const msg = String(err?.message || err || '');
  return /index\s+not\s+defined|\.indexOn|add\s+"\.indexOn"/i.test(msg);
}

async function fetchBenchDiagnosticHistoryFromRTDB(
  startMs: number,
  endMs: number
): Promise<TelemetryHistoryPoint[]> {
  const benchEndMs = endMs + 60_000;
  try {
    const indexedQuery = query(
      ref(rtdb, BENCH_HISTORY_PATH),
      orderByChild('timestamp'),
      startAt(startMs),
      endAt(benchEndMs),
      limitToLast(5000)
    );
    const snap = await get(indexedQuery);
    if (snap.exists()) {
      const mapped = mapTelemetrySnapshotRaw(snap.val() || {}, startMs, benchEndMs, 'diagnostico_p087');
      if (mapped.length > 0) {
        updateBenchDiagnostics({
          historyListener: {
            status: 'ok',
            benchPointsCount: mapped.length,
            lastError: null,
          },
        });
        return mapped;
      }
    }
    // Respaldo si las muestras usan timestamp en segundos (10 dígitos) o clave push sin índice ms
    const tailSnap = await get(query(ref(rtdb, BENCH_HISTORY_PATH), limitToLast(1000)));
    if (tailSnap.exists()) {
      const mappedTail = mapTelemetrySnapshotRaw(
        tailSnap.val() || {},
        startMs,
        benchEndMs,
        'diagnostico_p087'
      );
      updateBenchDiagnostics({
        historyListener: {
          status: mappedTail.length > 0 ? 'ok' : 'empty',
          benchPointsCount: mappedTail.length,
          lastError: null,
        },
      });
      return mappedTail;
    }
    updateBenchDiagnostics({
      historyListener: { status: 'empty', benchPointsCount: 0, lastError: null },
    });
    return [];
  } catch (err: any) {
    if (isRTDBIndexMissingError(err)) {
      try {
        const rawSnap = await get(query(ref(rtdb, BENCH_HISTORY_PATH), limitToLast(1000)));
        if (rawSnap.exists()) {
          const mapped = mapTelemetrySnapshotRaw(
            rawSnap.val() || {},
            startMs,
            endMs,
            'diagnostico_p087'
          );
          updateBenchDiagnostics({
            historyListener: {
              status: mapped.length > 0 ? 'ok' : 'empty',
              benchPointsCount: mapped.length,
              lastError: null,
            },
          });
          return mapped;
        }
      } catch (fallbackErr: any) {
        const fbMsg = fallbackErr?.message || String(fallbackErr || '');
        console.warn(`Fallback read on /${BENCH_HISTORY_PATH} failed:`, fbMsg);
        updateBenchDiagnostics({
          historyListener: { status: 'error', lastError: fbMsg },
        });
      }
      return [];
    }
    const errMsg = err?.message || String(err || `Error leyendo /${BENCH_HISTORY_PATH}`);
    console.warn(`Read on /${BENCH_HISTORY_PATH} failed:`, errMsg);
    updateBenchDiagnostics({
      historyListener: { status: 'error', lastError: errMsg },
    });
    return [];
  }
}

async function fetchMultiNodeSimulatedHistoryFromRTDB(
  deviceId: string,
  startMs: number,
  endMs: number
): Promise<TelemetryHistoryPoint[]> {
  if (!deviceId) return [];
  const histPath = `${MULTINODE_SIMULATED_NODES_PATH}/${deviceId}/historial`;
  const effectiveEndMs = endMs + 60_000;
  try {
    const q = query(
      ref(rtdb, histPath),
      orderByChild('timestamp'),
      startAt(startMs),
      endAt(effectiveEndMs),
      limitToLast(1000)
    );
    const snap = await get(q);
    if (snap.exists()) {
      const mapped = mapTelemetrySnapshotRaw(
        snap.val() || {},
        startMs,
        effectiveEndMs,
        'diagnostico_nodos_simulados'
      );
      if (mapped.length > 0) return mapped;
    }
    const tailSnap = await get(query(ref(rtdb, histPath), limitToLast(1000)));
    if (tailSnap.exists()) {
      return mapTelemetrySnapshotRaw(
        tailSnap.val() || {},
        startMs,
        effectiveEndMs,
        'diagnostico_nodos_simulados'
      );
    }
    return [];
  } catch {
    try {
      const rawSnap = await get(query(ref(rtdb, histPath), limitToLast(1000)));
      if (rawSnap.exists()) {
        return mapTelemetrySnapshotRaw(
          rawSnap.val() || {},
          startMs,
          effectiveEndMs,
          'diagnostico_nodos_simulados'
        );
      }
    } catch {
      // Silencioso si no existe historial o sin permiso
    }
    return [];
  }
}

async function fetchUnindexedTelemetryFallbackFromRTDB(
  deviceId: string,
  startMs: number,
  endMs: number
): Promise<TelemetryHistoryPoint[]> {
  const series: TelemetryHistoryPoint[][] = [];

  try {
    const primarySnap = await get(ref(rtdb, `historial_telemetria/${deviceId}`));
    if (primarySnap.exists()) {
      series.push(
        mapTelemetrySnapshotRaw(primarySnap.val() || {}, startMs, endMs, 'historial_telemetria')
      );
    }
  } catch (err) {
    console.warn('Fallback read on /historial_telemetria failed:', err);
  }

  try {
    const espSnap = await get(ref(rtdb, `dispositivos/${deviceId}/historial`));
    if (espSnap.exists()) {
      series.push(
        mapTelemetrySnapshotRaw(espSnap.val() || {}, startMs, endMs, 'dispositivos_historial')
      );
    }
  } catch (err) {
    console.warn('Secondary fallback read on /dispositivos/{id}/historial failed:', err);
  }

  if (deviceId === PHYSICAL_NODE_DEVICE_ID) {
    const benchPts = await fetchBenchDiagnosticHistoryFromRTDB(startMs, endMs);
    if (benchPts.length > 0) {
      series.push(benchPts);
    }
  }

  if (isMultiNodeSimulatedDeviceId(deviceId)) {
    const simPts = await fetchMultiNodeSimulatedHistoryFromRTDB(deviceId, startMs, endMs);
    if (simPts.length > 0) {
      series.push(simPts);
    }
  }

  return mergeTelemetryHistorySeries(...series);
}

/**
 * Consulta paginada por cursor (`orderByChild('timestamp') + startAt + limitToFirst`) para evitar
 * truncamiento silencioso en ventanas extensas de telemetría.
 * Si RTDB no tiene `.indexOn: "timestamp"` definido en reglas, hace fallback automático
 * a lectura directa sin índice + filtrado/ordenamiento en cliente.
 * Para el nodo físico `device_38A839E81F84`, fusiona además `/diagnostico/esp32_p087/historial`
 * preservando el historial legado sin sobrescribirlo.
 * Para nodos simulados MultiNode V2 (`device_SIM_01`..`device_SIM_10`), lee su historial en
 * `/diagnostico/nodos_simulados/{deviceId}/historial` (y `/dispositivos/{deviceId}/historial`)
 * sin mezclarlo con mediciones operativas reales.
 */
export async function fetchPaginatedTelemetryHistory(
  deviceId: string,
  rangeOrOptions: { startMs: number; endMs?: number },
  options?: {
    pageSize?: number;
    maxPages?: number;
    fetchPage?: (cursorTs: number, endMs: number, pageSize: number) => Promise<TelemetryHistoryPoint[]>;
    fetchUnindexedFallback?: (startMs: number, endMs: number) => Promise<TelemetryHistoryPoint[]>;
  }
): Promise<TelemetryHistoryPageResult> {
  if (!deviceId) {
    return { points: [], pagesFetched: 0, truncated: false, error: null };
  }
  // P094: El historial del equipo experimental V2 vive estrictamente separado en /dispositivos/device_38A839E81F84_V2/historial.
  if (isExperimentalBenchDeviceId(deviceId) && !options?.fetchPage) {
    const v2Result = await fetchExperimentalBenchV2History(rangeOrOptions);
    return {
      points: v2Result.points,
      pagesFetched: v2Result.points.length > 0 ? 1 : 0,
      truncated: false,
      error: v2Result.error,
    };
  }
  const { startMs, endMs } = resolveTelemetryWindowMs(rangeOrOptions);
  // MultiNode V2: leer historial aislado directamente desde /diagnostico/nodos_simulados/{id}/historial y /dispositivos/{id}/historial
  if (isMultiNodeSimulatedDeviceId(deviceId) && !options?.fetchPage) {
    const [simPts, devSnap] = await Promise.all([
      fetchMultiNodeSimulatedHistoryFromRTDB(deviceId, startMs, endMs),
      get(ref(rtdb, `dispositivos/${deviceId}/historial`)).catch(() => null),
    ]);
    const devPts =
      devSnap && devSnap.exists()
        ? mapTelemetrySnapshotRaw(devSnap.val() || {}, startMs, endMs, 'dispositivos_historial')
        : [];
    const mergedPts = mergeTelemetryHistorySeries(devPts, simPts);
    return {
      points: mergedPts,
      pagesFetched: mergedPts.length > 0 ? 1 : 0,
      truncated: false,
      error: null,
    };
  }
  const pageSize = Math.max(50, options?.pageSize ?? 500);
  const maxPages = Math.max(1, options?.maxPages ?? 40);

  const collectedMap = new Map<number, TelemetryHistoryPoint>();
  let cursorTs = startMs;
  let pagesFetched = 0;
  let truncated = false;

  try {
    while (pagesFetched < maxPages && cursorTs <= endMs) {
      let pagePoints: TelemetryHistoryPoint[];
      if (options?.fetchPage) {
        pagePoints = await options.fetchPage(cursorTs, endMs, pageSize);
      } else {
        const pageQuery = query(
          ref(rtdb, `historial_telemetria/${deviceId}`),
          orderByChild('timestamp'),
          startAt(cursorTs),
          endAt(endMs),
          limitToFirst(pageSize)
        );
        const snap = await get(pageQuery);
        if (!snap.exists()) {
          pagePoints = [];
        } else {
          pagePoints = mapTelemetrySnapshotRaw(
            snap.val() || {},
            cursorTs,
            endMs,
            'historial_telemetria'
          );
        }
      }

      pagesFetched += 1;
      if (pagePoints.length === 0) break;

      let highestTs = cursorTs;
      for (const pt of pagePoints) {
        collectedMap.set(pt.timestamp, pt);
        if (pt.timestamp > highestTs) highestTs = pt.timestamp;
      }

      if (pagePoints.length < pageSize) {
        break;
      }

      const nextCursor = highestTs + 1;
      if (nextCursor <= cursorTs) {
        break;
      }
      cursorTs = nextCursor;

      if (pagesFetched === maxPages) {
        truncated = true;
      }
    }

    // Fusionar historial de /diagnostico/esp32_p087/historial para el nodo físico en modo real
    if (!options?.fetchPage && deviceId === PHYSICAL_NODE_DEVICE_ID) {
      const benchPoints = await fetchBenchDiagnosticHistoryFromRTDB(startMs, endMs);
      benchPoints.forEach((pt) => {
        if (!collectedMap.has(pt.timestamp)) {
          collectedMap.set(pt.timestamp, pt);
        }
      });
    }

    // Si aún no hay muestras en modo real, revisar /dispositivos/{id}/historial
    if (collectedMap.size === 0 && !options?.fetchPage) {
      const espPoints = await fetchUnindexedTelemetryFallbackFromRTDB(deviceId, startMs, endMs);
      espPoints.forEach((pt) => {
        if (!collectedMap.has(pt.timestamp)) {
          collectedMap.set(pt.timestamp, pt);
        }
      });
    }

    const points = Array.from(collectedMap.values()).sort((a, b) => a.timestamp - b.timestamp);
    return { points, pagesFetched, truncated, error: null };
  } catch (err: any) {
    if (isRTDBIndexMissingError(err)) {
      try {
        const fallbackPoints = options?.fetchUnindexedFallback
          ? await options.fetchUnindexedFallback(startMs, endMs)
          : await fetchUnindexedTelemetryFallbackFromRTDB(deviceId, startMs, endMs);
        fallbackPoints.forEach((pt) => {
          if (!collectedMap.has(pt.timestamp)) {
            collectedMap.set(pt.timestamp, pt);
          }
        });
        const points = Array.from(collectedMap.values()).sort((a, b) => a.timestamp - b.timestamp);
        return {
          points,
          pagesFetched: Math.max(1, pagesFetched),
          truncated: false,
          error: null,
        };
      } catch (fallbackErr: any) {
        return {
          points: Array.from(collectedMap.values()).sort((a, b) => a.timestamp - b.timestamp),
          pagesFetched,
          truncated,
          error:
            fallbackErr?.message ||
            'Error leyendo historial de telemetría en modo respaldo desde Firebase RTDB.',
        };
      }
    }

    return {
      points: Array.from(collectedMap.values()).sort((a, b) => a.timestamp - b.timestamp),
      pagesFetched,
      truncated,
      error: err?.message || 'Error leyendo historial paginado desde Firebase RTDB.',
    };
  }
}

export function subscribeToTelemetryHistory(
  deviceId: string,
  rangeOrOptions: number | { startMs: number; endMs?: number; limit?: number },
  callback: (points: TelemetryHistoryPoint[], meta?: { error?: string | null }) => void
): () => void {
  if (!deviceId) {
    callback([], { error: null });
    return () => {};
  }
  // P094: El historial de device_38A839E81F84_V2 nunca se mezcla con /historial_telemetria ni con /diagnostico/esp32_p087/historial.
  if (isExperimentalBenchDeviceId(deviceId)) {
    return subscribeToExperimentalBenchV2History(rangeOrOptions, callback);
  }
  const { startMs, endMs, limit } = resolveTelemetryWindowMs(rangeOrOptions);

  // MultiNode V2: suscribirse exclusivamente al historial del nodo simulado sin tocar /historial_telemetria real
  if (isMultiNodeSimulatedDeviceId(deviceId)) {
    let disposedSim = false;
    let simPoints: TelemetryHistoryPoint[] = [];
    let devPoints: TelemetryHistoryPoint[] = [];
    const simEndMs = endMs + 60_000;
    const emitSim = () => {
      if (disposedSim) return;
      const merged = mergeTelemetryHistorySeries(devPoints, simPoints);
      const sliced = merged.length > limit ? merged.slice(-limit) : merged;
      callback(sliced, { error: null });
    };
    const unsubSimHist = onValue(
      query(ref(rtdb, `${MULTINODE_SIMULATED_NODES_PATH}/${deviceId}/historial`), limitToLast(Math.min(limit, 1000))),
      (snap) => {
        if (disposedSim) return;
        simPoints = snap.exists()
          ? mapTelemetrySnapshotRaw(snap.val() || {}, startMs, simEndMs, 'diagnostico_nodos_simulados')
          : [];
        emitSim();
      },
      () => {
        if (disposedSim) return;
        simPoints = [];
        emitSim();
      }
    );
    const unsubDevHist = onValue(
      query(ref(rtdb, `dispositivos/${deviceId}/historial`), limitToLast(Math.min(limit, 1000))),
      (snap) => {
        if (disposedSim) return;
        devPoints = snap.exists()
          ? mapTelemetrySnapshotRaw(snap.val() || {}, startMs, simEndMs, 'dispositivos_historial')
          : [];
        emitSim();
      },
      () => {
        if (disposedSim) return;
        devPoints = [];
        emitSim();
      }
    );
    return () => {
      disposedSim = true;
      unsubSimHist();
      unsubDevHist();
    };
  }

  let disposed = false;
  let primaryUnsub: (() => void) | null = null;
  let benchUnsub: (() => void) | null = null;
  let primaryPoints: TelemetryHistoryPoint[] = [];
  let benchPoints: TelemetryHistoryPoint[] = [];
  let primaryError: string | null = null;

  const emitMerged = () => {
    if (disposed) return;
    const merged = mergeTelemetryHistorySeries(primaryPoints, benchPoints);
    const sliced = merged.length > limit ? merged.slice(-limit) : merged;
    // Si existen puntos del historial de banco, no bloquear la vista por un error secundario.
    callback(sliced, { error: sliced.length > 0 ? null : primaryError });
  };

  const attachPrimaryFallbackListener = () => {
    if (disposed) return;
    const rawRef = ref(rtdb, `historial_telemetria/${deviceId}`);
    primaryUnsub = onValue(
      rawRef,
      (snapshot) => {
        if (disposed) return;
        primaryError = null;
        primaryPoints = snapshot.exists()
          ? mapTelemetrySnapshotRaw(snapshot.val() || {}, startMs, endMs, 'historial_telemetria')
          : [];
        emitMerged();
      },
      (fallbackErr) => {
        if (disposed) return;
        primaryError = fallbackErr?.message || 'Error consultando historial de telemetría.';
        console.warn('Error in fallback telemetry history subscription:', primaryError);
        primaryPoints = [];
        emitMerged();
      }
    );
  };

  const histQuery = query(
    ref(rtdb, `historial_telemetria/${deviceId}`),
    orderByChild('timestamp'),
    startAt(startMs),
    endAt(endMs),
    limitToLast(limit)
  );
  primaryUnsub = onValue(
    histQuery,
    (snapshot) => {
      if (disposed) return;
      primaryError = null;
      primaryPoints = snapshot.exists()
        ? mapTelemetrySnapshotRaw(snapshot.val() || {}, startMs, endMs, 'historial_telemetria')
        : [];
      emitMerged();
    },
    (err) => {
      if (disposed) return;
      if (isRTDBIndexMissingError(err)) {
        if (primaryUnsub) {
          try {
            primaryUnsub();
          } catch {
            // ignore
          }
          primaryUnsub = null;
        }
        attachPrimaryFallbackListener();
        return;
      }
      primaryError = err?.message || 'Error consultando historial de telemetría.';
      console.warn('Error subscribing to telemetry history:', primaryError);
      primaryPoints = [];
      emitMerged();
    }
  );

  // Para el nodo físico device_38A839E81F84, suscribirse también a /diagnostico/esp32_p087/historial
  if (deviceId === PHYSICAL_NODE_DEVICE_ID) {
    const benchEndMs = endMs + 60_000;
    updateBenchDiagnostics({
      historyListener: { status: 'listening', lastError: null },
    });
    const attachBenchFallbackListener = () => {
      if (disposed) return;
      benchUnsub = onValue(
        query(ref(rtdb, BENCH_HISTORY_PATH), limitToLast(Math.min(limit, 1000))),
        (snapshot) => {
          if (disposed) return;
          benchPoints = snapshot.exists()
            ? mapTelemetrySnapshotRaw(snapshot.val() || {}, startMs, benchEndMs, 'diagnostico_p087')
            : [];
          updateBenchDiagnostics({
            historyListener: {
              status: benchPoints.length > 0 ? 'ok' : 'empty',
              benchPointsCount: benchPoints.length,
              legacyPointsCount: primaryPoints.length,
              lastError: null,
            },
          });
          emitMerged();
        },
        (fallbackErr) => {
          if (disposed) return;
          const msg = fallbackErr?.message || String(fallbackErr || `Error leyendo /${BENCH_HISTORY_PATH}`);
          updateBenchDiagnostics({
            historyListener: { status: 'error', lastError: msg },
          });
          benchPoints = [];
          emitMerged();
        }
      );
    };

    const benchQuery = query(
      ref(rtdb, BENCH_HISTORY_PATH),
      orderByChild('timestamp'),
      startAt(startMs),
      endAt(benchEndMs),
      limitToLast(limit)
    );
    benchUnsub = onValue(
      benchQuery,
      (snapshot) => {
        if (disposed) return;
        const mapped = snapshot.exists()
          ? mapTelemetrySnapshotRaw(snapshot.val() || {}, startMs, benchEndMs, 'diagnostico_p087')
          : [];
        if (mapped.length === 0 && !snapshot.exists()) {
          // Si la consulta por índice ms devuelve vacío (p. ej. timestamp en segundos), cambiar a tail por clave
          if (benchUnsub) {
            try {
              benchUnsub();
            } catch {
              // ignore
            }
            benchUnsub = null;
          }
          attachBenchFallbackListener();
          return;
        }
        benchPoints = mapped;
        updateBenchDiagnostics({
          historyListener: {
            status: benchPoints.length > 0 ? 'ok' : 'empty',
            benchPointsCount: benchPoints.length,
            legacyPointsCount: primaryPoints.length,
            lastError: null,
          },
        });
        emitMerged();
      },
      (err) => {
        if (disposed) return;
        if (isRTDBIndexMissingError(err)) {
          if (benchUnsub) {
            try {
              benchUnsub();
            } catch {
              // ignore
            }
            benchUnsub = null;
          }
          attachBenchFallbackListener();
          return;
        }
        const msg = err?.message || String(err || `Error leyendo /${BENCH_HISTORY_PATH}`);
        console.warn(`Error subscribing to /${BENCH_HISTORY_PATH}:`, msg);
        updateBenchDiagnostics({
          historyListener: { status: 'error', lastError: msg },
        });
        benchPoints = [];
        emitMerged();
      }
    );
  }

  return () => {
    disposed = true;
    if (primaryUnsub) {
      try {
        primaryUnsub();
      } catch {
        // ignore
      }
      primaryUnsub = null;
    }
    if (benchUnsub) {
      try {
        benchUnsub();
      } catch {
        // ignore
      }
      benchUnsub = null;
    }
  };
}

/**
 * ============================================================================
 * P094 — EQUIPO EXPERIMENTAL DE BANCO SIN ASIGNACIÓN (device_38A839E81F84_V2)
 * Rutas exclusivas:
 *   - /dispositivos/device_38A839E81F84_V2
 *   - /dispositivos/device_38A839E81F84_V2/historial
 * Nunca se fusiona sobre device_38A839E81F84, nunca entra a alertas,
 * indicadores operacionales ni comandos operacionales.
 * ============================================================================
 */
export type ExperimentalBenchChannelStatus =
  | 'desconectado'
  | 'no_disponible'
  | 'saturado_invalido'
  | 'experimental_raw'
  | 'estimado_no_calibrado'
  | 'experimental_ambiental';

export interface ExperimentalBenchChannelClassification {
  status: ExperimentalBenchChannelStatus;
  displayValue: string;
  badge: string;
  detail: string;
  isValid: boolean;
  certified: false;
}

export interface ExperimentalBenchClassification {
  deviceId: string;
  sourcePath: string;
  historyPath: string;
  assignmentState: 'sin_asignacion';
  certifiedMeasurement: false;
  operationalAlertsEnabled: false;
  operationalCommandsAllowed: false;
  connectivity: DeviceConnectivityEvaluation;
  overallStatus: 'desconectado' | 'en_linea_con_observaciones' | 'en_linea_experimental';
  overallLabel: string;
  channels: {
    mq2: ExperimentalBenchChannelClassification;
    polvo: ExperimentalBenchChannelClassification;
    temperatura: ExperimentalBenchChannelClassification;
    humedad: ExperimentalBenchChannelClassification;
  };
}

export function classifyExperimentalBenchReadings(
  device: SensorDevice | null | undefined,
  timeoutSeconds: number = DEFAULT_DEVICE_TIMEOUT_SECONDS,
  nowMs: number = getEstimatedServerNowMs()
): ExperimentalBenchClassification {
  const connectivity = evaluateDeviceConnectivity(
    device?.lastUpdateServer || 0,
    timeoutSeconds,
    nowMs
  );

  const offlineChannel = (label: string): ExperimentalBenchChannelClassification => ({
    status: 'desconectado',
    displayValue: 'N/D',
    badge: 'DESCONECTADO',
    detail: `${label}: sin transmisión vigente dentro del timeout (${connectivity.timeoutSeconds}s).`,
    isValid: false,
    certified: false,
  });

  if (!device || !connectivity.isOnline) {
    return {
      deviceId: EXPERIMENTAL_BENCH_V2_DEVICE_ID,
      sourcePath: `/${EXPERIMENTAL_BENCH_V2_PATH}`,
      historyPath: `/${EXPERIMENTAL_BENCH_V2_HISTORY_PATH}`,
      assignmentState: 'sin_asignacion',
      certifiedMeasurement: false,
      operationalAlertsEnabled: false,
      operationalCommandsAllowed: false,
      connectivity,
      overallStatus: 'desconectado',
      overallLabel: device?.lastUpdateServer
        ? `Desconectado / señal expirada (hace ${connectivity.diffSeconds}s)`
        : 'Desconectado · sin marca temporal de servidor',
      channels: {
        mq2: offlineChannel('MQ-2 (ADC 12 bits)'),
        polvo: offlineChannel('Polvo óptico OPEN-SMART'),
        temperatura: offlineChannel('Temperatura DHT'),
        humedad: offlineChannel('Humedad DHT'),
      },
    };
  }

  const faultSet = new Set(device.faultFields || []);
  const coVal =
    !faultSet.has('CO') && typeof device.rawCO === 'number' && Number.isFinite(device.rawCO)
      ? device.rawCO
      : null;
  const pmVal =
    !faultSet.has('PM2_5') && typeof device.rawPM25 === 'number' && Number.isFinite(device.rawPM25)
      ? device.rawPM25
      : null;
  const rawTempCandidate =
    !faultSet.has('temperatura') &&
    typeof device.rawTemp === 'number' &&
    Number.isFinite(device.rawTemp)
      ? device.rawTemp
      : null;
  const rawHumCandidate =
    !faultSet.has('humedad') &&
    typeof device.rawHum === 'number' &&
    Number.isFinite(device.rawHum)
      ? device.rawHum
      : null;
  const dhtZeroPair = rawTempCandidate === 0 && rawHumCandidate === 0;
  const tempVal = dhtZeroPair ? null : rawTempCandidate;
  const humVal = dhtZeroPair ? null : rawHumCandidate;

  const mq2: ExperimentalBenchChannelClassification =
    coVal === null
      ? {
          status: 'no_disponible',
          displayValue: 'N/D',
          badge: 'N/D · SIN LECTURA',
          detail: 'MQ-2 sin dato numérico válido en el rango ADC 0–4095.',
          isValid: false,
          certified: false,
        }
      : coVal === 4095
      ? {
          status: 'saturado_invalido',
          displayValue: '4095 (SAT)',
          badge: 'NO VÁLIDO · SATURADO',
          detail:
            'MQ-2 saturado en tope de escala ADC 12 bits (4095). Medición NO válida; no equivale a CO en ppm ni dispara alarmas operacionales.',
          isValid: false,
          certified: false,
        }
      : {
          status: 'experimental_raw',
          displayValue: `${coVal} ADC`,
          badge: 'RAW · SIN CALIBRAR',
          detail:
            'Señal analógica bruta ADC 12 bits (0–4094) en banco experimental. No representa ppm certificados de CO.',
          isValid: true,
          certified: false,
        };

  const polvo: ExperimentalBenchChannelClassification =
    pmVal === null
      ? {
          status: 'no_disponible',
          displayValue: 'N/D',
          badge: 'N/D · SIN LECTURA',
          detail: 'Sensor óptico OPEN-SMART sin dato numérico válido (0–4095).',
          isValid: false,
          certified: false,
        }
      : pmVal === 4095
      ? {
          status: 'saturado_invalido',
          displayValue: '4095 (SAT)',
          badge: 'NO VÁLIDO · SATURADO',
          detail:
            'Saturación ADC (4095) en sensor óptico OPEN-SMART. Lectura no válida y sin calibración oficial.',
          isValid: false,
          certified: false,
        }
      : {
          status: 'estimado_no_calibrado',
          displayValue: `${Number.isInteger(pmVal) ? pmVal : pmVal.toFixed(1)} µg/m³ est.`,
          badge: 'ESTIMADO · NO CALIBRADO',
          detail:
            'Polvo estimado por sensor óptico OPEN-SMART en banco sin calibración gravimétrica ni certificación minera.',
          isValid: true,
          certified: false,
        };

  const temperatura: ExperimentalBenchChannelClassification =
    tempVal === null
      ? {
          status: 'no_disponible',
          displayValue: 'N/D',
          badge: 'N/D · DHT AUSENTE',
          detail: 'Sensor DHT ausente o sin lectura válida de temperatura (-40 °C a 100 °C).',
          isValid: false,
          certified: false,
        }
      : {
          status: 'experimental_ambiental',
          displayValue: `${tempVal.toFixed(1)} °C`,
          badge: 'BANCO · NO CERTIFICADO',
          detail: 'Lectura ambiental DHT en banco experimental (no calibrada ni certificada).',
          isValid: true,
          certified: false,
        };

  const humedad: ExperimentalBenchChannelClassification =
    humVal === null
      ? {
          status: 'no_disponible',
          displayValue: 'N/D',
          badge: 'N/D · DHT AUSENTE',
          detail: 'Sensor DHT ausente o sin lectura válida de humedad relativa (0% a 100%).',
          isValid: false,
          certified: false,
        }
      : {
          status: 'experimental_ambiental',
          displayValue: `${humVal.toFixed(0)} %`,
          badge: 'BANCO · NO CERTIFICADO',
          detail: 'Humedad relativa DHT en banco experimental (no calibrada ni certificada).',
          isValid: true,
          certified: false,
        };

  const hasObservations = [mq2, polvo, temperatura, humedad].some((ch) => !ch.isValid);

  return {
    deviceId: EXPERIMENTAL_BENCH_V2_DEVICE_ID,
    sourcePath: `/${EXPERIMENTAL_BENCH_V2_PATH}`,
    historyPath: `/${EXPERIMENTAL_BENCH_V2_HISTORY_PATH}`,
    assignmentState: 'sin_asignacion',
    certifiedMeasurement: false,
    operationalAlertsEnabled: false,
    operationalCommandsAllowed: false,
    connectivity,
    overallStatus: hasObservations ? 'en_linea_con_observaciones' : 'en_linea_experimental',
    overallLabel: hasObservations
      ? `En línea en banco (hace ${connectivity.diffSeconds}s) · con canales saturados o N/D`
      : `En línea en banco (hace ${connectivity.diffSeconds}s) · lecturas experimentales no certificadas`,
    channels: { mq2, polvo, temperatura, humedad },
  };
}

export interface ExperimentalBenchV2State {
  authorized: boolean;
  status: 'idle' | 'listening' | 'ok' | 'empty' | 'denied' | 'error';
  device: SensorDevice | null;
  sourcePath: string;
  historyPath: string;
  normalizedServerTs: number;
  lastEventAt: number | null;
  error: string | null;
  errorCode: string | null;
  rawPayload: {
    CO?: unknown;
    PM2_5?: unknown;
    temperatura?: unknown;
    humedad?: unknown;
    last_update_server?: unknown;
    origen?: unknown;
    simulado?: unknown;
    via?: unknown;
    hasHistorial?: boolean;
  } | null;
}

export function createInitialExperimentalBenchV2State(
  authorized: boolean = false
): ExperimentalBenchV2State {
  return {
    authorized,
    status: authorized ? 'idle' : 'denied',
    device: null,
    sourcePath: `/${EXPERIMENTAL_BENCH_V2_PATH}`,
    historyPath: `/${EXPERIMENTAL_BENCH_V2_HISTORY_PATH}`,
    normalizedServerTs: 0,
    lastEventAt: null,
    error: authorized
      ? null
      : 'Acceso denegado: la vista experimental de banco está restringida a roles autorizados (SuperAdmin / Admin MineSafe).',
    errorCode: authorized ? null : 'UNAUTHORIZED_ROLE',
    rawPayload: null,
  };
}

function summarizeExperimentalV2RawPayload(
  val: Record<string, any> | null
): ExperimentalBenchV2State['rawPayload'] {
  if (!val || typeof val !== 'object') return null;
  return {
    CO: val.CO ?? val.co,
    PM2_5: val.PM2_5 ?? val.pm25,
    temperatura: val.temperatura ?? val.temp,
    humedad: val.humedad ?? val.hum,
    last_update_server: val.last_update_server ?? val.timestamp_server ?? val.timestamp_unix,
    origen: val.origen,
    simulado: val.simulado,
    via: val.via,
    hasHistorial: Boolean(val.historial && typeof val.historial === 'object'),
  };
}

export function subscribeToExperimentalBenchV2(
  callback: (state: ExperimentalBenchV2State) => void,
  actingUser?: Pick<UserProfile, 'role' | 'status'> | null,
  timeoutSeconds: number = DEFAULT_DEVICE_TIMEOUT_SECONDS
): () => void {
  if (!canAccessExperimentalBenchDevice(actingUser)) {
    callback(createInitialExperimentalBenchV2State(false));
    return () => {};
  }

  startServerTimeOffsetSync();
  callback({
    ...createInitialExperimentalBenchV2State(true),
    status: 'listening',
  });

  const nodeRef = ref(rtdb, EXPERIMENTAL_BENCH_V2_PATH);
  return onValue(
    nodeRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        callback({
          ...createInitialExperimentalBenchV2State(true),
          status: 'empty',
          lastEventAt: Date.now(),
        });
        return;
      }
      const val = snapshot.val() || {};
      const normalizedServerTs = normalizeServerTimestampMs(
        val.last_update_server ?? val.timestamp_server ?? val.timestamp_unix
      );
      const mapped = mapRTDBDeviceToSensorDevice(
        EXPERIMENTAL_BENCH_V2_DEVICE_ID,
        val,
        timeoutSeconds,
        getEstimatedServerNowMs()
      );
      callback({
        authorized: true,
        status: 'ok',
        device: mapped,
        sourcePath: `/${EXPERIMENTAL_BENCH_V2_PATH}`,
        historyPath: `/${EXPERIMENTAL_BENCH_V2_HISTORY_PATH}`,
        normalizedServerTs,
        lastEventAt: Date.now(),
        error: null,
        errorCode: null,
        rawPayload: summarizeExperimentalV2RawPayload(val),
      });
    },
    (err: any) => {
      const code = err?.code ? String(err.code) : null;
      const msg =
        err?.message || String(err || `Error leyendo /${EXPERIMENTAL_BENCH_V2_PATH}`);
      console.warn(`Error subscribing to RTDB /${EXPERIMENTAL_BENCH_V2_PATH}:`, msg);
      callback({
        ...createInitialExperimentalBenchV2State(true),
        status: 'error',
        lastEventAt: Date.now(),
        error: msg,
        errorCode: code,
      });
    }
  );
}

export async function probeExperimentalBenchV2InRTDB(
  actingUser?: Pick<UserProfile, 'role' | 'status'> | null,
  timeoutSeconds: number = DEFAULT_DEVICE_TIMEOUT_SECONDS
): Promise<ExperimentalBenchV2State> {
  if (!canAccessExperimentalBenchDevice(actingUser)) {
    return createInitialExperimentalBenchV2State(false);
  }
  try {
    const snap = await get(ref(rtdb, EXPERIMENTAL_BENCH_V2_PATH));
    if (!snap.exists()) {
      return {
        ...createInitialExperimentalBenchV2State(true),
        status: 'empty',
        lastEventAt: Date.now(),
      };
    }
    const val = snap.val() || {};
    const normalizedServerTs = normalizeServerTimestampMs(
      val.last_update_server ?? val.timestamp_server ?? val.timestamp_unix
    );
    const mapped = mapRTDBDeviceToSensorDevice(
      EXPERIMENTAL_BENCH_V2_DEVICE_ID,
      val,
      timeoutSeconds,
      getEstimatedServerNowMs()
    );
    return {
      authorized: true,
      status: 'ok',
      device: mapped,
      sourcePath: `/${EXPERIMENTAL_BENCH_V2_PATH}`,
      historyPath: `/${EXPERIMENTAL_BENCH_V2_HISTORY_PATH}`,
      normalizedServerTs,
      lastEventAt: Date.now(),
      error: null,
      errorCode: null,
      rawPayload: summarizeExperimentalV2RawPayload(val),
    };
  } catch (err: any) {
    return {
      ...createInitialExperimentalBenchV2State(true),
      status: 'error',
      lastEventAt: Date.now(),
      error: err?.message || String(err || `Error leyendo /${EXPERIMENTAL_BENCH_V2_PATH}`),
      errorCode: err?.code ? String(err.code) : null,
    };
  }
}

export async function fetchExperimentalBenchV2History(
  rangeOrOptions: number | { startMs: number; endMs?: number; limit?: number },
  actingUser?: Pick<UserProfile, 'role' | 'status'> | null
): Promise<{ points: TelemetryHistoryPoint[]; error: string | null }> {
  if (actingUser !== undefined && !canAccessExperimentalBenchDevice(actingUser)) {
    return {
      points: [],
      error:
        'Acceso denegado: historial experimental restringido a roles autorizados (SuperAdmin / Admin MineSafe).',
    };
  }
  const { startMs, endMs, limit } = resolveTelemetryWindowMs(rangeOrOptions);
  const v2EndMs = endMs + 60_000;
  try {
    const indexedQuery = query(
      ref(rtdb, EXPERIMENTAL_BENCH_V2_HISTORY_PATH),
      orderByChild('timestamp'),
      startAt(startMs),
      endAt(v2EndMs),
      limitToLast(Math.min(limit, 5000))
    );
    const snap = await get(indexedQuery);
    if (snap.exists()) {
      const mapped = mapTelemetrySnapshotRaw(
        snap.val() || {},
        startMs,
        v2EndMs,
        'dispositivos_v2_historial'
      );
      if (mapped.length > 0) {
        return { points: mapped, error: null };
      }
    }
    const tailSnap = await get(
      query(ref(rtdb, EXPERIMENTAL_BENCH_V2_HISTORY_PATH), limitToLast(Math.min(limit, 1000)))
    );
    if (tailSnap.exists()) {
      const mappedTail = mapTelemetrySnapshotRaw(
        tailSnap.val() || {},
        startMs,
        v2EndMs,
        'dispositivos_v2_historial'
      );
      return { points: mappedTail, error: null };
    }
    return { points: [], error: null };
  } catch (err: any) {
    if (isRTDBIndexMissingError(err)) {
      try {
        const rawSnap = await get(
          query(ref(rtdb, EXPERIMENTAL_BENCH_V2_HISTORY_PATH), limitToLast(Math.min(limit, 1000)))
        );
        if (rawSnap.exists()) {
          return {
            points: mapTelemetrySnapshotRaw(
              rawSnap.val() || {},
              startMs,
              v2EndMs,
              'dispositivos_v2_historial'
            ),
            error: null,
          };
        }
        return { points: [], error: null };
      } catch (fbErr: any) {
        return {
          points: [],
          error:
            fbErr?.message ||
            String(fbErr || `Error leyendo /${EXPERIMENTAL_BENCH_V2_HISTORY_PATH}`),
        };
      }
    }
    return {
      points: [],
      error: err?.message || String(err || `Error leyendo /${EXPERIMENTAL_BENCH_V2_HISTORY_PATH}`),
    };
  }
}

export function subscribeToExperimentalBenchV2History(
  rangeOrOptions: number | { startMs: number; endMs?: number; limit?: number },
  callback: (points: TelemetryHistoryPoint[], meta?: { error?: string | null }) => void,
  actingUser?: Pick<UserProfile, 'role' | 'status'> | null
): () => void {
  if (actingUser !== undefined && !canAccessExperimentalBenchDevice(actingUser)) {
    callback([], {
      error:
        'Acceso denegado: historial experimental restringido a roles autorizados (SuperAdmin / Admin MineSafe).',
    });
    return () => {};
  }

  const { startMs, endMs, limit } = resolveTelemetryWindowMs(rangeOrOptions);
  const v2EndMs = endMs + 60_000;
  let disposed = false;
  let activeUnsub: (() => void) | null = null;

  const attachFallbackTail = () => {
    if (disposed) return;
    activeUnsub = onValue(
      query(ref(rtdb, EXPERIMENTAL_BENCH_V2_HISTORY_PATH), limitToLast(Math.min(limit, 1000))),
      (snapshot) => {
        if (disposed) return;
        const pts = snapshot.exists()
          ? mapTelemetrySnapshotRaw(
              snapshot.val() || {},
              startMs,
              v2EndMs,
              'dispositivos_v2_historial'
            )
          : [];
        callback(pts, { error: null });
      },
      (fallbackErr: any) => {
        if (disposed) return;
        const msg =
          fallbackErr?.message ||
          String(fallbackErr || `Error leyendo /${EXPERIMENTAL_BENCH_V2_HISTORY_PATH}`);
        callback([], { error: msg });
      }
    );
  };

  const indexedQuery = query(
    ref(rtdb, EXPERIMENTAL_BENCH_V2_HISTORY_PATH),
    orderByChild('timestamp'),
    startAt(startMs),
    endAt(v2EndMs),
    limitToLast(limit)
  );

  activeUnsub = onValue(
    indexedQuery,
    (snapshot) => {
      if (disposed) return;
      const mapped = snapshot.exists()
        ? mapTelemetrySnapshotRaw(
            snapshot.val() || {},
            startMs,
            v2EndMs,
            'dispositivos_v2_historial'
          )
        : [];
      if (mapped.length === 0 && !snapshot.exists()) {
        if (activeUnsub) {
          try {
            activeUnsub();
          } catch {
            // ignore
          }
          activeUnsub = null;
        }
        attachFallbackTail();
        return;
      }
      callback(mapped, { error: null });
    },
    (err: any) => {
      if (disposed) return;
      if (isRTDBIndexMissingError(err)) {
        if (activeUnsub) {
          try {
            activeUnsub();
          } catch {
            // ignore
          }
          activeUnsub = null;
        }
        attachFallbackTail();
        return;
      }
      const msg =
        err?.message || String(err || `Error leyendo /${EXPERIMENTAL_BENCH_V2_HISTORY_PATH}`);
      callback([], { error: msg });
    }
  );

  return () => {
    disposed = true;
    if (activeUnsub) {
      try {
        activeUnsub();
      } catch {
        // ignore
      }
      activeUnsub = null;
    }
  };
}

/**
 * ============================================================================
 * ADJUNTOS DE EVIDENCIA EN FIREBASE STORAGE (/adjuntos/{orgId}/{alertId}/{file})
 * ============================================================================
 */
const ALLOWED_ATTACHMENT_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5 MB

export function buildOrgScopedAttachmentPath(
  organizationId: string,
  alertId: string,
  attId: string,
  fileName: string
): { safeOrgId: string; safeAlertId: string; storagePath: string } {
  const safeOrgId = (organizationId || DEFAULT_ORGANIZATION.id).replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeAlertId = alertId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  return {
    safeOrgId,
    safeAlertId,
    storagePath: `adjuntos/${safeOrgId}/${safeAlertId}/${attId}_${safeName}`,
  };
}

export async function uploadAlertAttachmentToStorage(
  alertId: string,
  file: File,
  uploadedBy: string,
  organizationId?: string
): Promise<AlertAttachment> {
  if (!ALLOWED_ATTACHMENT_MIME.has(file.type)) {
    throw new Error('Formato no permitido. Solo se aceptan imágenes JPG, PNG, WEBP o documentos PDF.');
  }
  if (file.size <= 0 || file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error('El archivo supera el límite máximo permitido de 5 MB.');
  }

  const uploaderUid = auth.currentUser?.uid || '';
  if (!uploaderUid) {
    throw new Error('Sesión de Firebase Auth requerida para adjuntar evidencias.');
  }

  const attId = `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const { safeOrgId, safeAlertId, storagePath } = buildOrgScopedAttachmentPath(
    organizationId || DEFAULT_ORGANIZATION.id,
    alertId,
    attId,
    file.name
  );
  const fileRef = storageRef(minefaseStorage, storagePath);

  let uploadedToStorage = false;
  try {
    await uploadBytes(fileRef, file, {
      contentType: file.type,
      customMetadata: {
        organizationId: safeOrgId,
        alertId: safeAlertId,
        uploadedByUid: uploaderUid,
        attId,
      },
    });
    uploadedToStorage = true;
    const downloadUrl = await getDownloadURL(fileRef);

    const attachment: AlertAttachment = {
      id: attId,
      alertId: safeAlertId,
      organizationId: safeOrgId,
      fileName: file.name,
      contentType: file.type,
      sizeBytes: file.size,
      downloadUrl,
      storagePath,
      uploadedBy,
      uploadedByUid: uploaderUid,
      createdAt: Date.now(),
    };

    // Persistir índice en RTDB; si falla, revertir objeto huérfano en Storage
    try {
      await set(ref(rtdb, `adjuntos/${attId}`), attachment);
    } catch (rtdbErr: any) {
      await deleteObject(fileRef).catch(() => {});
      throw new Error(
        rtdbErr?.message ||
          'No se pudo registrar el índice del adjunto en RTDB; la subida en Storage fue revertida.'
      );
    }
    return attachment;
  } catch (err: any) {
    if (!uploadedToStorage) {
      const code = err?.code || '';
      if (code === 'storage/unauthorized' || String(err?.message || '').includes('permission')) {
        throw new Error(
          'Firebase Storage rechazó la subida de evidencia (storage/unauthorized). Verifica las reglas de Storage y la organización del usuario.'
        );
      }
    }
    throw new Error(err?.message || 'No se pudo subir el archivo de evidencia a Firebase Storage.');
  }
}

export async function deleteAlertAttachment(attachment: AlertAttachment): Promise<void> {
  if (attachment.storagePath) {
    try {
      await deleteObject(storageRef(minefaseStorage, attachment.storagePath));
    } catch (err: any) {
      const code = err?.code || '';
      if (code !== 'storage/object-not-found') {
        throw new Error(err?.message || 'No se pudo eliminar el archivo de evidencia en Storage.');
      }
    }
  }
  await remove(ref(rtdb, `adjuntos/${attachment.id}`));
}

/**
 * ============================================================================
 * REGISTRO, CLASIFICACIÓN Y ASIGNACIÓN DE DISPOSITIVOS IoT (GATEWAY / NODO)
 * ============================================================================
 */
export function sanitizeDeviceHardwareId(rawId: string): string {
  const cleaned = String(rawId || '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[.#$/[\]]/g, '_');
  if (!cleaned || cleaned.length < 3) {
    throw new Error('Ingresa un ID de hardware válido de al menos 3 caracteres (ej. device_38A839E81F84 o NODO_U-01).');
  }
  return cleaned;
}

function normalizeDeviceCatalogCategory(category?: string): 'gateway' | 'nodo' {
  const val = String(category || '').trim().toLowerCase();
  if (val === 'gateway' || val === 'gateway_sensor') return 'gateway';
  if (val === 'nodo' || val === 'sensor') return 'nodo';
  throw new Error('Debes seleccionar un tipo de dispositivo válido: Gateway o Nodo.');
}

function normalizeCatalogRecord(raw: any, key: string): RegisteredDeviceConfig {
  const orgId = isUnassignedDeviceOrg(raw?.organizationId)
    ? UNASSIGNED_DEVICE_ORG_ID
    : String(raw.organizationId);
  const isMultiNodeSim = isMultiNodeSimulatedDeviceId(raw?.id || key);
  const category: DeviceCategory =
    raw?.category === 'gateway' ||
    raw?.category === 'nodo' ||
    raw?.category === 'sensor' ||
    raw?.category === 'gateway_sensor'
      ? raw.category
      : isMultiNodeSim || key.startsWith('NODO')
      ? 'nodo'
      : 'gateway';
  const history: DeviceAssignmentAuditEntry[] = Array.isArray(raw?.assignmentHistory)
    ? raw.assignmentHistory
    : raw?.assignmentHistory && typeof raw.assignmentHistory === 'object'
    ? Object.values(raw.assignmentHistory)
    : [];

  const assignedUserIds: string[] | undefined = Array.isArray(raw?.assignedUserIds)
    ? Array.from(new Set(raw.assignedUserIds.map((x: any) => String(x || '').trim()).filter(Boolean)))
    : undefined;
  const sharedOrganizationIds: string[] | undefined = Array.isArray(raw?.sharedOrganizationIds)
    ? Array.from(new Set(raw.sharedOrganizationIds.map((x: any) => String(x || '').trim()).filter(Boolean)))
    : undefined;
  const isBlocked = raw?.blocked === true || raw?.enabled === false || raw?.active === false;
  const isSim = raw?.simulado === true || isMultiNodeSim;
  const isModoBanco = raw?.modo_banco === true || (isMultiNodeSim && raw?.modo_banco !== false);

  const base: RegisteredDeviceConfig = {
    id: raw?.id || key,
    name: raw?.name || key,
    category,
    organizationId: orgId,
    organizationName: isUnassignedDeviceOrg(orgId) ? undefined : raw?.organizationName || undefined,
    siteId: isUnassignedDeviceOrg(orgId) ? undefined : raw?.siteId || undefined,
    siteName: isUnassignedDeviceOrg(orgId) ? undefined : raw?.siteName || undefined,
    crewId: isUnassignedDeviceOrg(orgId) ? undefined : raw?.crewId || undefined,
    crewName: isUnassignedDeviceOrg(orgId) ? undefined : raw?.crewName || undefined,
    sectorId: isUnassignedDeviceOrg(orgId) ? undefined : raw?.sectorId || undefined,
    sectorName: isUnassignedDeviceOrg(orgId)
      ? 'En inventario'
      : raw?.sectorName || 'Pendiente de asignación',
    parentGatewayId: raw?.parentGatewayId || raw?.gatewayId || undefined,
    localIp: raw?.localIp || undefined,
    enabled: !isBlocked,
    active: !isBlocked,
    blocked: isBlocked,
    blockedAt: typeof raw?.blockedAt === 'number' ? raw.blockedAt : undefined,
    blockedBy: raw?.blockedBy || undefined,
    assignedUserIds: assignedUserIds && assignedUserIds.length > 0 ? assignedUserIds : undefined,
    sharedOrganizationIds:
      sharedOrganizationIds && sharedOrganizationIds.length > 0 ? sharedOrganizationIds : undefined,
    sharedWithAllAssignedUsers: raw?.sharedWithAllAssignedUsers === true,
    createdAt: typeof raw?.createdAt === 'number' ? raw.createdAt : Date.now(),
    assignedBy: raw?.assignedBy || undefined,
    assignedAt: typeof raw?.assignedAt === 'number' ? raw.assignedAt : undefined,
    assignmentHistory: history,
    simulado: isSim ? true : undefined,
    modo_banco: isModoBanco ? true : undefined,
    sourcePath: typeof raw?.sourcePath === 'string' ? raw.sourcePath : undefined,
    telemetryOrigin: typeof raw?.telemetryOrigin === 'string' ? raw.telemetryOrigin : undefined,
    gatewayId: typeof raw?.gatewayId === 'string' ? raw.gatewayId : raw?.parentGatewayId || undefined,
  };
  base.assignmentStatus = resolveDeviceAssignmentStatus(base);
  return base;
}

export function subscribeToDeviceCatalog(
  callback: (devices: RegisteredDeviceConfig[]) => void,
  scope?: RTDBSubscriptionScope
): () => void {
  if (scope?.role && !isGlobalMineSafeAdmin(scope.role)) {
    const targetOrgId =
      scope.organizationId && scope.organizationId !== 'all'
        ? scope.organizationId
        : DEFAULT_ORGANIZATION_ID;
    let orgRecords: Record<string, RegisteredDeviceConfig> = {};
    const explicitRecords: Record<string, RegisteredDeviceConfig> = {};
    const emitMerged = () => {
      const mergedMap = new Map<string, RegisteredDeviceConfig>();
      Object.values(orgRecords).forEach((d) => mergedMap.set(d.id, d));
      Object.values(explicitRecords).forEach((d) => mergedMap.set(d.id, d));
      const list = Array.from(mergedMap.values()).sort(
        (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
      );
      callback(list);
    };

    const unsubs: Array<() => void> = [];
    const scopedRef = query(
      ref(rtdb, 'catalogo_dispositivos'),
      orderByChild('organizationId'),
      equalTo(targetOrgId)
    );
    unsubs.push(
      onValue(
        scopedRef,
        (snapshot) => {
          const next: Record<string, RegisteredDeviceConfig> = {};
          if (snapshot.exists()) {
            const raw = snapshot.val() || {};
            Object.entries(raw)
              .filter(([, val]) => val && typeof val === 'object')
              .forEach(([key, val]) => {
                next[key] = normalizeCatalogRecord(val, key);
              });
          }
          orgRecords = next;
          emitMerged();
        },
        (err) => {
          console.warn('Error subscribing to scoped RTDB /catalogo_dispositivos:', err?.message || err);
          orgRecords = {};
          emitMerged();
        }
      )
    );

    const uniqueIds = Array.from(new Set((scope.deviceIds || []).filter(Boolean)));
    uniqueIds.forEach((devId) => {
      unsubs.push(
        onValue(
          ref(rtdb, `catalogo_dispositivos/${devId}`),
          (snapshot) => {
            if (snapshot.exists()) {
              explicitRecords[devId] = normalizeCatalogRecord(snapshot.val(), devId);
            } else {
              delete explicitRecords[devId];
            }
            emitMerged();
          },
          () => {
            // Best-effort read for shared/assigned device catalog record
          }
        )
      );
    });

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }

  return onValue(
    ref(rtdb, 'catalogo_dispositivos'),
    (snapshot) => {
      if (!snapshot.exists()) {
        callback([]);
        return;
      }
      const raw = snapshot.val() || {};
      const list: RegisteredDeviceConfig[] = Object.entries(raw)
        .filter(([, val]) => val && typeof val === 'object')
        .map(([key, val]) => normalizeCatalogRecord(val, key))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      callback(list);
    },
    (err) => {
      console.warn('Error subscribing to RTDB /catalogo_dispositivos:', err?.message || err);
      callback([]);
    }
  );
}

async function syncPlatformRegisteredDevicesIfSuperAdmin(
  record: RegisteredDeviceConfig,
  actingUser: UserProfile,
  removeId?: string
): Promise<void> {
  if (!isGlobalMineSafeAdmin(actingUser.role)) return;
  try {
    const snap = await get(ref(rtdb, 'configuracion_plataforma/registeredDevices'));
    const existing: RegisteredDeviceConfig[] =
      snap.exists() && Array.isArray(snap.val()) ? snap.val() : [];
    const filtered = existing.filter((d) => d.id !== (removeId || record.id));
    const nextList = removeId ? filtered : [...filtered, JSON.parse(JSON.stringify(record))];
    await set(ref(rtdb, 'configuracion_plataforma/registeredDevices'), nextList);
  } catch {
    // Best-effort sync with legacy SuperAdmin platformConfig list
  }
}

export interface RegisterIoTDeviceParams {
  id: string;
  name: string;
  category: 'gateway' | 'nodo';
  parentGatewayId?: string;
  localIp?: string;
  organizationId?: string | null;
  organizationName?: string;
  siteId?: string | null;
  siteName?: string;
  sectorId?: string | null;
  sectorName?: string;
  crewId?: string | null;
  crewName?: string;
  note?: string;
  isEdit?: boolean;
  allowAttachExistingRTDB?: boolean;
  simulado?: boolean;
  modo_banco?: boolean;
  sourcePath?: string;
  telemetryOrigin?: string;
  gatewayId?: string;
}

export async function registerIoTDeviceInRTDB(
  params: RegisterIoTDeviceParams,
  actingUser: UserProfile | null | undefined
): Promise<RegisteredDeviceConfig> {
  assertActiveSession(actingUser);
  const perm = canRegisterAndAssignIoTDevices(actingUser);
  if (!perm.allowed) {
    throw new Error(perm.reason);
  }

  const cleanId = sanitizeDeviceHardwareId(params.id);
  const cleanCategory = normalizeDeviceCatalogCategory(params.category);
  const cleanName = (params.name || '').trim() || cleanId;

  const catalogRef = ref(rtdb, `catalogo_dispositivos/${cleanId}`);
  const devRef = ref(rtdb, `dispositivos/${cleanId}`);
  const [catalogSnap, devSnap, cfgSnap] = await Promise.all([
    get(catalogRef).catch(() => null),
    get(devRef).catch(() => null),
    get(ref(rtdb, 'configuracion_plataforma/registeredDevices')).catch(() => null),
  ]);

  const existingCatalog = catalogSnap && catalogSnap.exists() ? normalizeCatalogRecord(catalogSnap.val(), cleanId) : null;
  const legacyList: RegisteredDeviceConfig[] =
    cfgSnap && cfgSnap.exists() && Array.isArray(cfgSnap.val()) ? cfgSnap.val() : [];
  const existsInLegacy = legacyList.some((d) => d.id === cleanId);

  if (!params.isEdit) {
    if (existingCatalog || existsInLegacy) {
      throw new Error(
        `El ID de dispositivo "${cleanId}" ya está registrado en la plataforma. Usa la opción Editar o Reasignar para evitar duplicados.`
      );
    }
    if (devSnap && devSnap.exists() && !params.allowAttachExistingRTDB) {
      throw new Error(
        `El ID "${cleanId}" ya existe en Firebase RTDB (/dispositivos). Usa "Registrar detectado" desde la bandeja de hardware RTDB para clasificarlo sin duplicar.`
      );
    }
  }

  const now = Date.now();
  const isUnassigned = isUnassignedDeviceOrg(params.organizationId);
  const normalizedOrgId = isUnassigned ? UNASSIGNED_DEVICE_ORG_ID : String(params.organizationId).trim();
  const normalizedSiteId = !isUnassigned && params.siteId ? String(params.siteId).trim() : undefined;
  const normalizedSiteName = !isUnassigned && params.siteName ? params.siteName.trim() : undefined;
  const normalizedCrewId = !isUnassigned && params.crewId ? String(params.crewId).trim() : undefined;
  const normalizedCrewName = !isUnassigned && params.crewName ? params.crewName.trim() : undefined;
  const normalizedSectorId = !isUnassigned && params.sectorId ? String(params.sectorId).trim() : undefined;
  const normalizedSectorName = isUnassigned
    ? 'En inventario'
    : (params.sectorName || '').trim() || (normalizedSiteName ? 'Pendiente de sector' : 'Pendiente de asignación');

  const assignmentStatus = resolveDeviceAssignmentStatus({
    organizationId: normalizedOrgId,
    siteId: normalizedSiteId,
    siteName: normalizedSiteName,
    crewId: normalizedCrewId,
    sectorId: normalizedSectorId,
    sectorName: normalizedSectorName,
  });

  const actionType: DeviceAssignmentAuditEntry['action'] = params.isEdit
    ? isUnassigned
      ? 'desasignacion'
      : normalizedSiteId
      ? 'asignacion_faena'
      : 'asignacion_empresa'
    : 'registro';

  const auditEntry: DeviceAssignmentAuditEntry = {
    timestamp: now,
    actorName: actingUser!.name,
    actorRole: actingUser!.role,
    action: actionType,
    fromOrganizationId: existingCatalog?.organizationId,
    fromOrganizationName: existingCatalog?.organizationName,
    toOrganizationId: isUnassigned ? undefined : normalizedOrgId,
    toOrganizationName: isUnassigned ? 'Inventario Global (Sin asignar)' : params.organizationName || normalizedOrgId,
    toSiteId: normalizedSiteId,
    toSiteName: normalizedSiteName,
    note:
      params.note?.trim() ||
      (params.isEdit
        ? `Actualización de ficha (${cleanCategory.toUpperCase()})`
        : isUnassigned
        ? `Alta de hardware ${cleanCategory.toUpperCase()} en inventario global`
        : normalizedSiteName
        ? `Alta de hardware ${cleanCategory.toUpperCase()} asignado a faena ${normalizedSiteName}`
        : `Alta de hardware ${cleanCategory.toUpperCase()} asignado a empresa`),
  };

  const prevHistory = existingCatalog?.assignmentHistory || [];
  const nextHistory = [auditEntry, ...prevHistory].slice(0, 25);

  const existingLegacy = legacyList.find((d) => d.id === cleanId);
  const existingBlocked = existingCatalog?.blocked ?? existingLegacy?.blocked ?? false;
  const existingAssignedUsers = existingCatalog?.assignedUserIds ?? existingLegacy?.assignedUserIds;
  const existingSharedOrgs = isUnassigned
    ? undefined
    : existingCatalog?.sharedOrganizationIds ?? existingLegacy?.sharedOrganizationIds;
  const existingSharedAll = isUnassigned
    ? false
    : existingCatalog?.sharedWithAllAssignedUsers ?? existingLegacy?.sharedWithAllAssignedUsers ?? false;

  const isSimulatedRec =
    params.simulado === true ||
    existingCatalog?.simulado === true ||
    isMultiNodeSimulatedDeviceId(cleanId);
  const isModoBancoRec =
    params.modo_banco === true ||
    existingCatalog?.modo_banco === true ||
    isSimulatedRec;

  const record: RegisteredDeviceConfig = {
    id: cleanId,
    name: cleanName,
    category: cleanCategory,
    organizationId: normalizedOrgId,
    organizationName: isUnassigned ? undefined : params.organizationName || normalizedOrgId,
    siteId: normalizedSiteId,
    siteName: normalizedSiteName,
    crewId: normalizedCrewId,
    crewName: normalizedCrewName,
    sectorId: normalizedSectorId,
    sectorName: normalizedSectorName,
    parentGatewayId:
      cleanCategory === 'nodo'
        ? params.parentGatewayId?.trim() || params.gatewayId?.trim() || undefined
        : undefined,
    localIp: params.localIp?.trim() || existingCatalog?.localIp || existingLegacy?.localIp || undefined,
    enabled: !existingBlocked,
    active: !existingBlocked,
    blocked: existingBlocked,
    blockedAt: existingBlocked ? existingCatalog?.blockedAt ?? existingLegacy?.blockedAt : undefined,
    blockedBy: existingBlocked ? existingCatalog?.blockedBy ?? existingLegacy?.blockedBy : undefined,
    assignedUserIds: existingAssignedUsers,
    sharedOrganizationIds: existingSharedOrgs,
    sharedWithAllAssignedUsers: existingSharedAll,
    createdAt: existingCatalog?.createdAt || existingLegacy?.createdAt || now,
    assignmentStatus,
    assignedBy: actingUser!.name,
    assignedAt: now,
    assignmentHistory: nextHistory,
    simulado: isSimulatedRec ? true : undefined,
    modo_banco: isModoBancoRec ? true : undefined,
    sourcePath: params.sourcePath || existingCatalog?.sourcePath || undefined,
    telemetryOrigin: params.telemetryOrigin || existingCatalog?.telemetryOrigin || undefined,
    gatewayId:
      params.gatewayId?.trim() ||
      params.parentGatewayId?.trim() ||
      existingCatalog?.gatewayId ||
      undefined,
  };

  await set(catalogRef, JSON.parse(JSON.stringify(record)));

  const rtdbMetadata = {
    name: record.name,
    organizationId: record.organizationId,
    organizationName: record.organizationName || null,
    siteId: record.siteId || null,
    siteName: record.siteName || null,
    crewId: record.crewId || null,
    crewName: record.crewName || null,
    sectorId: record.sectorId || null,
    sectorName: record.sectorName,
    deviceCategory: record.category,
    assignmentStatus: record.assignmentStatus,
    parentGatewayId: record.parentGatewayId || null,
    localIp: record.localIp || null,
    assignedBy: record.assignedBy || null,
    assignedAt: record.assignedAt || now,
    assignmentHistory: JSON.parse(JSON.stringify(nextHistory)),
    ...(isSimulatedRec ? { simulado: true } : {}),
    ...(isModoBancoRec ? { modo_banco: true } : {}),
  };

  if (devSnap && devSnap.exists()) {
    await update(devRef, rtdbMetadata);
  } else if (!isSimulatedRec) {
    // Solo inicializar placeholder en /dispositivos para equipos físicos; los simulados conservan
    // su telemetría exclusivamente en /diagnostico/nodos_simulados sin inventar ceros en /dispositivos.
    await set(devRef, {
      ...rtdbMetadata,
      CO: 0,
      PM2_5: 0,
      temperatura: 0,
      humedad: 0,
      alarma_activa: false,
      alarma: false,
      buzzer: false,
      luz: false,
      iluminacion_led: false,
      estado_adquisicion: 'pendiente_hardware',
      origen_alarma: 'NINGUNO',
      descripcion_monitoreo: `Dispositivo ${record.name} registrado (${record.category}), en espera de telemetría ESP32.`,
      via: record.category === 'nodo' && record.parentGatewayId ? 'ESP_NOW_GATEWAY' : 'WIFI_DIRECTO',
      last_update_server: 0,
    });
  }

  await syncPlatformRegisteredDevicesIfSuperAdmin(record, actingUser!);
  return record;
}

export interface AssignOrTransferIoTDeviceParams {
  deviceId: string;
  targetOrganizationId?: string | null;
  targetOrganizationName?: string;
  targetSiteId?: string | null;
  targetSiteName?: string;
  note?: string;
  fallbackDevice?: Partial<RegisteredDeviceConfig>;
}

export async function assignOrTransferIoTDeviceInRTDB(
  params: AssignOrTransferIoTDeviceParams,
  actingUser: UserProfile | null | undefined
): Promise<RegisteredDeviceConfig> {
  assertActiveSession(actingUser);
  const perm = canRegisterAndAssignIoTDevices(actingUser);
  if (!perm.allowed) {
    throw new Error(perm.reason);
  }

  const cleanId = sanitizeDeviceHardwareId(params.deviceId);
  const catalogRef = ref(rtdb, `catalogo_dispositivos/${cleanId}`);
  const devRef = ref(rtdb, `dispositivos/${cleanId}`);
  const [catalogSnap, devSnap] = await Promise.all([
    get(catalogRef).catch(() => null),
    get(devRef).catch(() => null),
  ]);

  const existing: RegisteredDeviceConfig =
    catalogSnap && catalogSnap.exists()
      ? normalizeCatalogRecord(catalogSnap.val(), cleanId)
      : devSnap && devSnap.exists()
      ? normalizeCatalogRecord(
          {
            ...devSnap.val(),
            category: devSnap.val()?.deviceCategory || params.fallbackDevice?.category || 'gateway',
          },
          cleanId
        )
      : normalizeCatalogRecord(
          {
            id: cleanId,
            name: params.fallbackDevice?.name || cleanId,
            category: params.fallbackDevice?.category || 'gateway',
            organizationId: params.fallbackDevice?.organizationId || UNASSIGNED_DEVICE_ORG_ID,
            siteId: params.fallbackDevice?.siteId,
            siteName: params.fallbackDevice?.siteName,
            localIp: params.fallbackDevice?.localIp,
            simulado: params.fallbackDevice?.simulado,
            modo_banco: params.fallbackDevice?.modo_banco,
            sourcePath: params.fallbackDevice?.sourcePath,
            telemetryOrigin: params.fallbackDevice?.telemetryOrigin,
            gatewayId: params.fallbackDevice?.gatewayId,
            createdAt: params.fallbackDevice?.createdAt || Date.now(),
          },
          cleanId
        );

  const now = Date.now();
  const isUnassigning = isUnassignedDeviceOrg(params.targetOrganizationId);
  const nextOrgId = isUnassigning ? UNASSIGNED_DEVICE_ORG_ID : String(params.targetOrganizationId).trim();
  const nextOrgName = isUnassigning ? undefined : params.targetOrganizationName || nextOrgId;
  const nextSiteId = !isUnassigning && params.targetSiteId ? String(params.targetSiteId).trim() : undefined;
  const nextSiteName = !isUnassigning && params.targetSiteName ? params.targetSiteName.trim() : undefined;

  const orgChanged = (existing.organizationId || UNASSIGNED_DEVICE_ORG_ID) !== nextOrgId;
  const siteChanged = (existing.siteId || '') !== (nextSiteId || '');
  const clearInternalHierarchy = isUnassigning || orgChanged || siteChanged;

  const nextCrewId = clearInternalHierarchy ? undefined : existing.crewId;
  const nextCrewName = clearInternalHierarchy ? undefined : existing.crewName;
  const nextSectorId = clearInternalHierarchy ? undefined : existing.sectorId;
  const nextSectorName = isUnassigning
    ? 'En inventario'
    : clearInternalHierarchy
    ? nextSiteName
      ? 'Pendiente de sector'
      : 'Pendiente de asignación'
    : existing.sectorName;
  const nextParentGatewayId =
    isUnassigning || orgChanged ? undefined : existing.parentGatewayId;

  const nextStatus = resolveDeviceAssignmentStatus({
    organizationId: nextOrgId,
    siteId: nextSiteId,
    siteName: nextSiteName,
    crewId: nextCrewId,
    sectorId: nextSectorId,
    sectorName: nextSectorName,
  });

  const wasAssigned = !isUnassignedDeviceOrg(existing.organizationId);
  const action: DeviceAssignmentAuditEntry['action'] = isUnassigning
    ? 'desasignacion'
    : wasAssigned && (orgChanged || siteChanged)
    ? 'reasignacion'
    : nextSiteId
    ? 'asignacion_faena'
    : 'asignacion_empresa';

  const auditEntry: DeviceAssignmentAuditEntry = {
    timestamp: now,
    actorName: actingUser!.name,
    actorRole: actingUser!.role,
    action,
    fromOrganizationId: existing.organizationId,
    fromOrganizationName: isUnassignedDeviceOrg(existing.organizationId)
      ? 'Inventario Global'
      : existing.organizationName || existing.organizationId,
    toOrganizationId: isUnassigning ? undefined : nextOrgId,
    toOrganizationName: isUnassigning ? 'Inventario Global (Sin asignar)' : nextOrgName,
    toSiteId: nextSiteId,
    toSiteName: nextSiteName,
    note:
      params.note?.trim() ||
      (isUnassigning
        ? 'Dispositivo desasignado y devuelto al inventario global.'
        : action === 'reasignacion'
        ? `Traslado de equipo hacia ${nextOrgName}${nextSiteName ? ` / ${nextSiteName}` : ''}.`
        : nextSiteName
        ? `Asignación directa a faena ${nextSiteName} (${nextOrgName}).`
        : `Asignación a empresa ${nextOrgName} para distribución interna.`),
  };

  const nextHistory = [auditEntry, ...(existing.assignmentHistory || [])].slice(0, 25);

  const updated: RegisteredDeviceConfig = {
    ...existing,
    organizationId: nextOrgId,
    organizationName: nextOrgName,
    siteId: nextSiteId,
    siteName: nextSiteName,
    crewId: nextCrewId,
    crewName: nextCrewName,
    sectorId: nextSectorId,
    sectorName: nextSectorName,
    parentGatewayId: nextParentGatewayId,
    sharedOrganizationIds: isUnassigning ? undefined : existing.sharedOrganizationIds,
    sharedWithAllAssignedUsers: isUnassigning ? false : existing.sharedWithAllAssignedUsers,
    assignmentStatus: nextStatus,
    assignedBy: actingUser!.name,
    assignedAt: now,
    assignmentHistory: nextHistory,
  };

  await set(catalogRef, JSON.parse(JSON.stringify(updated)));

  const isSimulatedTarget = isSimulatedDevice(updated);
  const rtdbUpdate = {
    name: updated.name,
    organizationId: updated.organizationId,
    organizationName: updated.organizationName || null,
    siteId: updated.siteId || null,
    siteName: updated.siteName || null,
    crewId: updated.crewId || null,
    crewName: updated.crewName || null,
    sectorId: updated.sectorId || null,
    sectorName: updated.sectorName,
    deviceCategory: updated.category,
    assignmentStatus: updated.assignmentStatus,
    parentGatewayId: updated.parentGatewayId || null,
    sharedOrganizationIds: updated.sharedOrganizationIds || null,
    sharedWithAllAssignedUsers: Boolean(updated.sharedWithAllAssignedUsers),
    assignedBy: updated.assignedBy || null,
    assignedAt: now,
    assignmentHistory: JSON.parse(JSON.stringify(nextHistory)),
    ...(updated.simulado ? { simulado: true } : {}),
    ...(updated.modo_banco ? { modo_banco: true } : {}),
  };

  if (devSnap && devSnap.exists()) {
    await update(devRef, rtdbUpdate);
  } else if (!isSimulatedTarget) {
    await set(devRef, {
      ...rtdbUpdate,
      CO: 0,
      PM2_5: 0,
      temperatura: 0,
      humedad: 0,
      alarma_activa: false,
      alarma: false,
      buzzer: false,
      luz: false,
      iluminacion_led: false,
      estado_adquisicion: 'pendiente_hardware',
      origen_alarma: 'NINGUNO',
      descripcion_monitoreo: `Dispositivo ${updated.name} actualizado (${updated.assignmentStatus}).`,
      via: updated.category === 'nodo' && updated.parentGatewayId ? 'ESP_NOW_GATEWAY' : 'WIFI_DIRECTO',
      last_update_server: 0,
    });
  }

  await syncPlatformRegisteredDevicesIfSuperAdmin(updated, actingUser!);
  return updated;
}

async function resolveExistingCatalogRecord(
  cleanId: string,
  fallbackDevice?: Partial<RegisteredDeviceConfig>
): Promise<{
  record: RegisteredDeviceConfig;
  devExists: boolean;
}> {
  const catalogRef = ref(rtdb, `catalogo_dispositivos/${cleanId}`);
  const devRef = ref(rtdb, `dispositivos/${cleanId}`);
  const [catalogSnap, devSnap, cfgSnap] = await Promise.all([
    get(catalogRef).catch(() => null),
    get(devRef).catch(() => null),
    get(ref(rtdb, 'configuracion_plataforma/registeredDevices')).catch(() => null),
  ]);
  const legacyList: RegisteredDeviceConfig[] =
    cfgSnap && cfgSnap.exists() && Array.isArray(cfgSnap.val()) ? cfgSnap.val() : [];
  const legacyMatch = legacyList.find((d) => d.id === cleanId);

  const record: RegisteredDeviceConfig =
    catalogSnap && catalogSnap.exists()
      ? normalizeCatalogRecord(catalogSnap.val(), cleanId)
      : legacyMatch
      ? normalizeCatalogRecord(legacyMatch, cleanId)
      : devSnap && devSnap.exists()
      ? normalizeCatalogRecord(
          {
            ...devSnap.val(),
            category: devSnap.val()?.deviceCategory || fallbackDevice?.category || 'nodo',
          },
          cleanId
        )
      : normalizeCatalogRecord(
          {
            id: cleanId,
            name: fallbackDevice?.name || cleanId,
            category: fallbackDevice?.category || 'nodo',
            organizationId: fallbackDevice?.organizationId || DEFAULT_ORGANIZATION_ID,
            siteId: fallbackDevice?.siteId,
            siteName: fallbackDevice?.siteName,
            sectorName: fallbackDevice?.sectorName || 'Pendiente de asignación',
            localIp: fallbackDevice?.localIp,
            createdAt: fallbackDevice?.createdAt || Date.now(),
          },
          cleanId
        );

  return { record, devExists: Boolean(devSnap && devSnap.exists()) };
}

export async function toggleIoTDeviceBlockInRTDB(
  deviceId: string,
  nextBlocked: boolean,
  actingUser: UserProfile | null | undefined,
  fallbackDevice?: Partial<RegisteredDeviceConfig>,
  note?: string
): Promise<RegisteredDeviceConfig> {
  assertActiveSession(actingUser);
  const perm = canBlockOrDeleteIoTDevice(actingUser);
  if (!perm.allowed) {
    throw new Error(perm.reason);
  }

  const cleanId = sanitizeDeviceHardwareId(deviceId);
  const { record: existing, devExists } = await resolveExistingCatalogRecord(cleanId, fallbackDevice);
  const now = Date.now();

  const auditEntry: DeviceAssignmentAuditEntry = {
    timestamp: now,
    actorName: actingUser!.name,
    actorRole: actingUser!.role,
    action: nextBlocked ? 'bloqueo' : 'desbloqueo',
    toOrganizationId: isUnassignedDeviceOrg(existing.organizationId) ? undefined : existing.organizationId,
    toOrganizationName: existing.organizationName,
    note:
      note?.trim() ||
      (nextBlocked
        ? `Dispositivo bloqueado administrativamente por ${actingUser!.name}.`
        : `Dispositivo reactivado / desbloqueado por ${actingUser!.name}.`),
  };

  const nextHistory = [auditEntry, ...(existing.assignmentHistory || [])].slice(0, 25);
  const updated: RegisteredDeviceConfig = {
    ...existing,
    blocked: nextBlocked,
    enabled: !nextBlocked,
    active: !nextBlocked,
    blockedAt: nextBlocked ? now : undefined,
    blockedBy: nextBlocked ? actingUser!.name : undefined,
    assignmentHistory: nextHistory,
  };

  await set(ref(rtdb, `catalogo_dispositivos/${cleanId}`), JSON.parse(JSON.stringify(updated)));

  if (devExists) {
    await update(ref(rtdb, `dispositivos/${cleanId}`), {
      blocked: nextBlocked,
      enabled: !nextBlocked,
      active: !nextBlocked,
      blockedAt: nextBlocked ? now : null,
      blockedBy: nextBlocked ? actingUser!.name : null,
      assignmentHistory: JSON.parse(JSON.stringify(nextHistory)),
    }).catch(() => {});
  }

  await syncPlatformRegisteredDevicesIfSuperAdmin(updated, actingUser!);
  return updated;
}

export async function assignDeviceToAllOrgUsersInRTDB(
  deviceId: string,
  usersList: UserProfile[],
  organizations: Organization[],
  actingUser: UserProfile | null | undefined,
  fallbackDevice?: Partial<RegisteredDeviceConfig>
): Promise<{
  device: RegisteredDeviceConfig;
  assignedUserIds: string[];
  sharedOrganizationIds: string[];
}> {
  assertActiveSession(actingUser);
  const perm = canRegisterAndAssignIoTDevices(actingUser);
  if (!perm.allowed) {
    throw new Error(perm.reason);
  }

  const cleanId = sanitizeDeviceHardwareId(deviceId);
  const { record: existing, devExists } = await resolveExistingCatalogRecord(cleanId, fallbackDevice);

  // Obtener también usuarios reales directamente desde RTDB /usuarios para cubrir todos los usuarios con empresa asignada
  const usersSnap = await get(ref(rtdb, 'usuarios')).catch(() => null);
  const rtdbUsersMap: Record<string, any> = usersSnap && usersSnap.exists() ? usersSnap.val() || {} : {};
  const targetUserMap = new Map<string, { id: string; organizationId: string }>();

  Object.entries(rtdbUsersMap).forEach(([uid, raw]) => {
    if (!raw || typeof raw !== 'object') return;
    const orgId = typeof raw.organizationId === 'string' ? raw.organizationId.trim() : '';
    if (orgId && !isUnassignedDeviceOrg(orgId)) {
      targetUserMap.set(uid, { id: uid, organizationId: orgId });
    }
  });

  usersList.forEach((u) => {
    const orgId = (u.organizationId || '').trim();
    if (u.id && orgId && !isUnassignedDeviceOrg(orgId)) {
      targetUserMap.set(u.id, { id: u.id, organizationId: orgId });
    }
  });

  const assignedUserIds = Array.from(targetUserMap.keys());
  const orgIdSet = new Set<string>();
  targetUserMap.forEach((entry) => orgIdSet.add(entry.organizationId));
  organizations.forEach((o) => {
    if (o.id && !isUnassignedDeviceOrg(o.id) && o.status !== 'suspendida') {
      orgIdSet.add(o.id);
    }
  });
  if (!isUnassignedDeviceOrg(existing.organizationId) && existing.organizationId) {
    orgIdSet.add(existing.organizationId);
  }
  const sharedOrganizationIds = Array.from(orgIdSet);

  const now = Date.now();
  const auditEntry: DeviceAssignmentAuditEntry = {
    timestamp: now,
    actorName: actingUser!.name,
    actorRole: actingUser!.role,
    action: 'asignacion_usuarios',
    toOrganizationId: isUnassignedDeviceOrg(existing.organizationId)
      ? sharedOrganizationIds[0] || DEFAULT_ORGANIZATION_ID
      : existing.organizationId,
    toOrganizationName:
      existing.organizationName ||
      `${sharedOrganizationIds.length} empresas (${assignedUserIds.length} usuarios)`,
    note: `Asignación masiva del dispositivo ${cleanId} a ${assignedUserIds.length} usuarios con empresa asignada (${sharedOrganizationIds.length} empresas).`,
  };

  const nextHistory = [auditEntry, ...(existing.assignmentHistory || [])].slice(0, 25);
  const nextPrimaryOrgId = isUnassignedDeviceOrg(existing.organizationId)
    ? sharedOrganizationIds[0] || DEFAULT_ORGANIZATION_ID
    : existing.organizationId!;

  const updated: RegisteredDeviceConfig = {
    ...existing,
    organizationId: nextPrimaryOrgId,
    organizationName:
      existing.organizationName ||
      organizations.find((o) => o.id === nextPrimaryOrgId)?.name ||
      nextPrimaryOrgId,
    assignedUserIds,
    sharedOrganizationIds,
    sharedWithAllAssignedUsers: true,
    assignedBy: actingUser!.name,
    assignedAt: now,
    assignmentHistory: nextHistory,
  };
  updated.assignmentStatus = resolveDeviceAssignmentStatus(updated);

  await set(ref(rtdb, `catalogo_dispositivos/${cleanId}`), JSON.parse(JSON.stringify(updated)));

  if (devExists) {
    await update(ref(rtdb, `dispositivos/${cleanId}`), {
      organizationId: updated.organizationId,
      organizationName: updated.organizationName || null,
      assignedUserIds,
      sharedOrganizationIds,
      sharedWithAllAssignedUsers: true,
      enabled: !updated.blocked,
      blocked: Boolean(updated.blocked),
      assignedBy: actingUser!.name,
      assignedAt: now,
      assignmentHistory: JSON.parse(JSON.stringify(nextHistory)),
    }).catch(() => {});
  }

  // Persistir assignedDeviceCode en cada usuario en /usuarios/{uid}
  if (assignedUserIds.length > 0) {
    const userUpdates: Record<string, any> = {};
    assignedUserIds.forEach((uid) => {
      userUpdates[`usuarios/${uid}/assignedDeviceCode`] = cleanId;
    });
    await update(ref(rtdb), userUpdates);
  }

  await syncPlatformRegisteredDevicesIfSuperAdmin(updated, actingUser!);

  return {
    device: updated,
    assignedUserIds,
    sharedOrganizationIds,
  };
}

export async function replaceDeviceForUsersInRTDB(
  fromDeviceId: string,
  toDeviceId: string | null,
  usersList: UserProfile[],
  actingUser: UserProfile | null | undefined,
  fallbackFromDevice?: Partial<RegisteredDeviceConfig>,
  fallbackToDevice?: Partial<RegisteredDeviceConfig>
): Promise<{
  fromDevice: RegisteredDeviceConfig;
  toDevice: RegisteredDeviceConfig | null;
  affectedUserIds: string[];
}> {
  assertActiveSession(actingUser);
  const perm = canBlockOrDeleteIoTDevice(actingUser);
  if (!perm.allowed) {
    throw new Error(perm.reason);
  }

  const cleanFrom = sanitizeDeviceHardwareId(fromDeviceId);
  const cleanTo = toDeviceId ? sanitizeDeviceHardwareId(toDeviceId) : null;
  if (cleanTo && cleanTo === cleanFrom) {
    throw new Error('Selecciona un dispositivo destino distinto al actual para realizar el cambio.');
  }

  const { record: fromRec, devExists: fromDevExists } = await resolveExistingCatalogRecord(
    cleanFrom,
    fallbackFromDevice
  );
  const toResolved = cleanTo
    ? await resolveExistingCatalogRecord(cleanTo, fallbackToDevice)
    : null;

  const usersSnap = await get(ref(rtdb, 'usuarios')).catch(() => null);
  const rtdbUsersMap: Record<string, any> = usersSnap && usersSnap.exists() ? usersSnap.val() || {} : {};
  const affectedSet = new Set<string>(fromRec.assignedUserIds || []);

  Object.entries(rtdbUsersMap).forEach(([uid, raw]) => {
    if (raw && typeof raw === 'object' && raw.assignedDeviceCode === cleanFrom) {
      affectedSet.add(uid);
    }
  });
  usersList.forEach((u) => {
    if (u.assignedDeviceCode === cleanFrom) {
      affectedSet.add(u.id);
    }
  });

  const affectedUserIds = Array.from(affectedSet);
  const now = Date.now();

  if (affectedUserIds.length > 0) {
    const userUpdates: Record<string, any> = {};
    affectedUserIds.forEach((uid) => {
      userUpdates[`usuarios/${uid}/assignedDeviceCode`] = cleanTo;
    });
    await update(ref(rtdb), userUpdates);
  }

  const fromAudit: DeviceAssignmentAuditEntry = {
    timestamp: now,
    actorName: actingUser!.name,
    actorRole: actingUser!.role,
    action: 'cambio_dispositivo',
    note: cleanTo
      ? `Usuarios (${affectedUserIds.length}) cambiados desde ${cleanFrom} hacia ${cleanTo}.`
      : `Asignación de usuarios (${affectedUserIds.length}) retirada del dispositivo ${cleanFrom}.`,
  };
  const updatedFrom: RegisteredDeviceConfig = {
    ...fromRec,
    assignedUserIds: undefined,
    sharedOrganizationIds: undefined,
    sharedWithAllAssignedUsers: false,
    assignmentHistory: [fromAudit, ...(fromRec.assignmentHistory || [])].slice(0, 25),
  };

  await set(ref(rtdb, `catalogo_dispositivos/${cleanFrom}`), JSON.parse(JSON.stringify(updatedFrom)));
  if (fromDevExists) {
    await update(ref(rtdb, `dispositivos/${cleanFrom}`), {
      assignedUserIds: null,
      sharedOrganizationIds: null,
      sharedWithAllAssignedUsers: false,
      assignmentHistory: JSON.parse(JSON.stringify(updatedFrom.assignmentHistory)),
    }).catch(() => {});
  }
  await syncPlatformRegisteredDevicesIfSuperAdmin(updatedFrom, actingUser!);

  let updatedTo: RegisteredDeviceConfig | null = null;
  if (cleanTo && toResolved) {
    const mergedUsers = Array.from(
      new Set([...(toResolved.record.assignedUserIds || []), ...affectedUserIds])
    );
    const mergedOrgs = Array.from(
      new Set([
        ...(toResolved.record.sharedOrganizationIds || []),
        ...(fromRec.sharedOrganizationIds || []),
      ])
    );
    const toAudit: DeviceAssignmentAuditEntry = {
      timestamp: now,
      actorName: actingUser!.name,
      actorRole: actingUser!.role,
      action: 'cambio_dispositivo',
      note: `Recibió ${affectedUserIds.length} usuarios transferidos desde ${cleanFrom}.`,
    };
    updatedTo = {
      ...toResolved.record,
      assignedUserIds: mergedUsers.length > 0 ? mergedUsers : undefined,
      sharedOrganizationIds: mergedOrgs.length > 0 ? mergedOrgs : undefined,
      sharedWithAllAssignedUsers: Boolean(
        toResolved.record.sharedWithAllAssignedUsers || fromRec.sharedWithAllAssignedUsers
      ),
      assignmentHistory: [toAudit, ...(toResolved.record.assignmentHistory || [])].slice(0, 25),
    };
    await set(ref(rtdb, `catalogo_dispositivos/${cleanTo}`), JSON.parse(JSON.stringify(updatedTo)));
    if (toResolved.devExists) {
      await update(ref(rtdb, `dispositivos/${cleanTo}`), {
        assignedUserIds: updatedTo.assignedUserIds || null,
        sharedOrganizationIds: updatedTo.sharedOrganizationIds || null,
        sharedWithAllAssignedUsers: Boolean(updatedTo.sharedWithAllAssignedUsers),
        assignmentHistory: JSON.parse(JSON.stringify(updatedTo.assignmentHistory)),
      }).catch(() => {});
    }
    await syncPlatformRegisteredDevicesIfSuperAdmin(updatedTo, actingUser!);
  }

  return {
    fromDevice: updatedFrom,
    toDevice: updatedTo,
    affectedUserIds,
  };
}

export async function updateUserAssignedDeviceInRTDB(
  userId: string,
  nextDeviceId: string | null,
  actingUser: UserProfile | null | undefined
): Promise<string | null> {
  assertActiveSession(actingUser);
  const perm = canBlockOrDeleteIoTDevice(actingUser);
  if (!perm.allowed) {
    throw new Error(perm.reason);
  }
  const cleanUid = String(userId || '').trim();
  if (!cleanUid) {
    throw new Error('Usuario inválido para asignar dispositivo.');
  }
  const cleanNext = nextDeviceId && nextDeviceId.trim() ? sanitizeDeviceHardwareId(nextDeviceId) : null;

  const userSnap = await get(ref(rtdb, `usuarios/${cleanUid}`)).catch(() => null);
  const prevDeviceId: string | null =
    userSnap && userSnap.exists() && typeof userSnap.val()?.assignedDeviceCode === 'string'
      ? userSnap.val().assignedDeviceCode
      : null;

  await update(ref(rtdb, `usuarios/${cleanUid}`), {
    assignedDeviceCode: cleanNext,
  });

  // Sincronizar assignedUserIds en el dispositivo anterior y en el nuevo
  if (prevDeviceId && prevDeviceId !== cleanNext) {
    const prevCatSnap = await get(ref(rtdb, `catalogo_dispositivos/${prevDeviceId}`)).catch(() => null);
    if (prevCatSnap && prevCatSnap.exists()) {
      const prevRec = normalizeCatalogRecord(prevCatSnap.val(), prevDeviceId);
      const filteredUsers = (prevRec.assignedUserIds || []).filter((id) => id !== cleanUid);
      const nextPrev: RegisteredDeviceConfig = {
        ...prevRec,
        assignedUserIds: filteredUsers.length > 0 ? filteredUsers : undefined,
      };
      await set(ref(rtdb, `catalogo_dispositivos/${prevDeviceId}`), JSON.parse(JSON.stringify(nextPrev))).catch(() => {});
      await update(ref(rtdb, `dispositivos/${prevDeviceId}`), {
        assignedUserIds: filteredUsers.length > 0 ? filteredUsers : null,
      }).catch(() => {});
      await syncPlatformRegisteredDevicesIfSuperAdmin(nextPrev, actingUser!);
    }
  }

  if (cleanNext) {
    const { record: nextRec, devExists } = await resolveExistingCatalogRecord(cleanNext);
    const mergedUsers = Array.from(new Set([...(nextRec.assignedUserIds || []), cleanUid]));
    const updatedNext: RegisteredDeviceConfig = {
      ...nextRec,
      assignedUserIds: mergedUsers,
    };
    await set(ref(rtdb, `catalogo_dispositivos/${cleanNext}`), JSON.parse(JSON.stringify(updatedNext))).catch(() => {});
    if (devExists) {
      await update(ref(rtdb, `dispositivos/${cleanNext}`), {
        assignedUserIds: mergedUsers,
      }).catch(() => {});
    }
    await syncPlatformRegisteredDevicesIfSuperAdmin(updatedNext, actingUser!);
  }

  return cleanNext;
}

export async function deleteIoTDeviceFromCatalogInRTDB(
  deviceId: string,
  actingUser: UserProfile | null | undefined,
  usersList?: UserProfile[]
): Promise<string[]> {
  assertActiveSession(actingUser);
  const perm = canBlockOrDeleteIoTDevice(actingUser);
  if (!perm.allowed) {
    throw new Error(perm.reason);
  }
  const cleanId = sanitizeDeviceHardwareId(deviceId);
  await remove(ref(rtdb, `catalogo_dispositivos/${cleanId}`));
  const devSnap = await get(ref(rtdb, `dispositivos/${cleanId}`)).catch(() => null);
  if (devSnap && devSnap.exists()) {
    await update(ref(rtdb, `dispositivos/${cleanId}`), {
      organizationId: UNASSIGNED_DEVICE_ORG_ID,
      organizationName: null,
      siteId: null,
      siteName: null,
      crewId: null,
      crewName: null,
      sectorId: null,
      sectorName: 'En inventario',
      assignmentStatus: 'en_inventario',
      blocked: false,
      enabled: true,
      blockedAt: null,
      blockedBy: null,
      assignedUserIds: null,
      sharedOrganizationIds: null,
      sharedWithAllAssignedUsers: false,
    }).catch(() => {});
  }

  // Limpiar assignedDeviceCode en usuarios que tenían asignado este dispositivo
  const clearedUserIds: string[] = [];
  try {
    const usersSnap = await get(ref(rtdb, 'usuarios')).catch(() => null);
    const rtdbUsersMap: Record<string, any> = usersSnap && usersSnap.exists() ? usersSnap.val() || {} : {};
    const uidsToClear = new Set<string>();
    Object.entries(rtdbUsersMap).forEach(([uid, raw]) => {
      if (raw && typeof raw === 'object' && raw.assignedDeviceCode === cleanId) {
        uidsToClear.add(uid);
      }
    });
    (usersList || []).forEach((u) => {
      if (u.assignedDeviceCode === cleanId) {
        uidsToClear.add(u.id);
      }
    });
    if (uidsToClear.size > 0) {
      const updates: Record<string, any> = {};
      uidsToClear.forEach((uid) => {
        updates[`usuarios/${uid}/assignedDeviceCode`] = null;
        clearedUserIds.push(uid);
      });
      await update(ref(rtdb), updates);
    }
  } catch {
    // Best-effort cleanup of user references
  }

  await syncPlatformRegisteredDevicesIfSuperAdmin(
    { id: cleanId, name: cleanId, category: 'gateway', sectorName: '' },
    actingUser!,
    cleanId
  );
  return clearedUserIds;
}

export async function saveRegisteredDeviceHierarchy(
  device: RegisteredDeviceConfig,
  actingUser: UserProfile | null | undefined,
  organizations?: Organization[]
): Promise<RegisteredDeviceConfig> {
  assertActiveSession(actingUser);
  const targetOrgId = device.organizationId || actingUser!.organizationId || DEFAULT_ORGANIZATION.id;
  const check = canManageOrganizationHierarchy(actingUser, targetOrgId, organizations);
  if (!check.allowed) {
    throw new Error(check.reason || 'Permisos insuficientes para vincular dispositivos en esta empresa.');
  }

  const cleanId = sanitizeDeviceHardwareId(device.id);
  const catalogRef = ref(rtdb, `catalogo_dispositivos/${cleanId}`);
  const devRef = ref(rtdb, `dispositivos/${cleanId}`);
  const [catalogSnap, devSnap] = await Promise.all([
    get(catalogRef).catch(() => null),
    get(devRef).catch(() => null),
  ]);

  const existingCatalog = catalogSnap && catalogSnap.exists() ? normalizeCatalogRecord(catalogSnap.val(), cleanId) : null;
  const existingRTDB = devSnap && devSnap.exists() ? devSnap.val() : null;
  const existingForCheck = existingCatalog
    ? existingCatalog
    : existingRTDB
    ? { id: cleanId, organizationId: existingRTDB.organizationId }
    : null;

  // Admin de Empresa NO puede crear nuevos IDs de hardware ni apropiarse de equipos en inventario/ajenos
  const distCheck = canDistributeDeviceInsideOrg(actingUser, existingForCheck, targetOrgId);
  if (!distCheck.allowed) {
    throw new Error(distCheck.reason);
  }

  const isGlobal = isGlobalMineSafeAdmin(actingUser!.role);
  const existingCategory: DeviceCategory =
    existingCatalog?.category ||
    (existingRTDB?.deviceCategory as DeviceCategory | undefined) ||
    device.category;
  const effectiveCategory: DeviceCategory = isGlobal
    ? device.category === 'nodo' || device.category === 'sensor'
      ? 'nodo'
      : 'gateway'
    : existingCategory;

  const isNodeCategory = effectiveCategory === 'nodo' || effectiveCategory === 'sensor';
  const orgObj = (organizations || []).find((o) => o.id === targetOrgId);
  const now = Date.now();

  const auditEntry: DeviceAssignmentAuditEntry = {
    timestamp: now,
    actorName: actingUser!.name,
    actorRole: actingUser!.role,
    action: 'asignacion_sector',
    fromOrganizationId: existingCatalog?.organizationId || targetOrgId,
    fromOrganizationName: existingCatalog?.organizationName || orgObj?.name || targetOrgId,
    toOrganizationId: targetOrgId,
    toOrganizationName: orgObj?.name || existingCatalog?.organizationName || targetOrgId,
    toSiteId: device.siteId || existingCatalog?.siteId,
    toSiteName: device.siteName || existingCatalog?.siteName,
    note: `Distribución interna en sector "${device.sectorName || 'Sector Operativo'}"${
      device.crewName ? ` (Cuadrilla ${device.crewName})` : ''
    }.`,
  };
  const nextHistory = [auditEntry, ...(existingCatalog?.assignmentHistory || [])].slice(0, 25);

  const normalized: RegisteredDeviceConfig = {
    ...existingCatalog,
    ...device,
    id: cleanId,
    name: device.name.trim() || existingCatalog?.name || cleanId,
    organizationId: targetOrgId,
    organizationName: orgObj?.name || existingCatalog?.organizationName || targetOrgId,
    category: effectiveCategory,
    enabled: device.enabled !== false && device.active !== false,
    active: device.active !== false && device.enabled !== false,
    createdAt: existingCatalog?.createdAt || device.createdAt || now,
    parentGatewayId: isNodeCategory ? device.parentGatewayId || undefined : undefined,
    assignedBy: actingUser!.name,
    assignedAt: now,
    assignmentHistory: nextHistory,
  };
  normalized.assignmentStatus = resolveDeviceAssignmentStatus(normalized);

  // 1) Actualizar/inicializar registro en /dispositivos/{id} con su ubicación jerárquica completa
  const rtdbFields = {
    name: normalized.name,
    organizationId: normalized.organizationId,
    organizationName: normalized.organizationName || null,
    siteId: normalized.siteId || null,
    siteName: normalized.siteName || null,
    crewId: normalized.crewId || null,
    crewName: normalized.crewName || null,
    sectorId: normalized.sectorId || null,
    sectorName: normalized.sectorName || 'Sector Operativo',
    deviceCategory: normalized.category,
    assignmentStatus: normalized.assignmentStatus,
    parentGatewayId: normalized.parentGatewayId || null,
    assignedBy: normalized.assignedBy || null,
    assignedAt: now,
    assignmentHistory: JSON.parse(JSON.stringify(nextHistory)),
  };

  if (existingRTDB) {
    await update(devRef, rtdbFields);
  } else {
    // Solo SuperAdmin / Admin MineSafe llegan aquí (Admin normal fue bloqueado arriba)
    await set(devRef, {
      ...rtdbFields,
      CO: 0,
      PM2_5: 0,
      temperatura: 0,
      humedad: 0,
      alarma_activa: false,
      alarma: false,
      buzzer: false,
      luz: false,
      iluminacion_led: false,
      estado_adquisicion: 'pendiente_hardware',
      origen_alarma: 'NINGUNO',
      descripcion_monitoreo: `Dispositivo ${normalized.name} registrado en jerarquía, en espera de telemetría ESP32.`,
      via: isNodeCategory && normalized.parentGatewayId ? 'ESP_NOW_GATEWAY' : 'WIFI_DIRECTO',
      last_update_server: 0,
    });
  }

  // 2) Sincronizar /catalogo_dispositivos/{id} (Admin cliente solo actualiza existentes de su org)
  try {
    if (isGlobal || existingCatalog) {
      await set(catalogRef, JSON.parse(JSON.stringify(normalized)));
    }
  } catch {
    // Fallback silencioso si /catalogo_dispositivos aún no tenía el registro legacy para Admin de empresa
  }

  // 3) Sincronizar catálogo legacy /configuracion_plataforma/registeredDevices si es SuperAdmin
  await syncPlatformRegisteredDevicesIfSuperAdmin(normalized, actingUser!);

  return normalized;
}

/**
 * ============================================================================
 * CARGA MASIVA DE DATOS POR EMPRESA (ADMIN Y SUPERADMIN)
 * ============================================================================
 */
export interface BulkImportExecutionResult {
  total: number;
  succeeded: number;
  failed: number;
  createdOrganization?: Organization;
  createdUsers: UserProfile[];
  createdSites: MiningSite[];
  createdCrews: MiningCrew[];
  createdDevices: RegisteredDeviceConfig[];
  createdRentals: DeviceRental[];
  createdAssignments: WorkerAssignment[];
  errors: Array<{ section: string; label: string; reason: string }>;
}

export async function executeBulkCompanyImport(params: {
  actingUser: UserProfile;
  targetOrgId: string;
  organizations?: Organization[];
  registeredDevices?: RegisteredDeviceConfig[];
  organizationToCreate?: Omit<Organization, 'createdAt'>;
  users?: BulkUserImportItem[];
  sites?: BulkSiteImportItem[];
  crews?: BulkCrewImportItem[];
  devices?: BulkDeviceImportItem[];
  hierarchy?: BulkHierarchyImportItem[];
  rentals?: BulkRentalImportItem[];
  assignments?: BulkAssignmentImportItem[];
  createAuthAccounts?: boolean;
  defaultAuthPassword?: string;
  sendResetEmail?: boolean;
  onProgress?: (completed: number, total: number, currentLabel: string) => void;
}): Promise<BulkImportExecutionResult> {
  assertActiveSession(params.actingUser);
  if (!isAnyAdminRole(params.actingUser.role)) {
    throw new Error('Solo Administradores o SuperAdministrador pueden ejecutar cargas masivas.');
  }

  let effectiveOrgs = [...(params.organizations || [])];
  let resolvedOrgId = params.targetOrgId;
  let createdOrganization: Organization | undefined;

  if (params.organizationToCreate) {
    const createCheck = canCreateOrEditOrganization(params.actingUser, null);
    if (!createCheck.allowed) {
      throw new Error(
        createCheck.reason || 'Solo SuperAdmin o Admin MineSafe pueden crear nuevas empresas en carga masiva.'
      );
    }
  } else {
    const authOrgs = await resolveAuthorizedOrganizationsForActor(
      params.actingUser,
      resolvedOrgId,
      effectiveOrgs
    );
    if (!isOrgAuthorizedForUser(params.actingUser, resolvedOrgId, authOrgs)) {
      throw new Error(
        `Acción denegada: no tienes permisos para cargar datos masivos en la organización "${resolvedOrgId}".`
      );
    }
    if (authOrgs) effectiveOrgs = authOrgs;
  }

  // Expandir filas de jerarquía completa si vienen en el lote
  const expandedHierarchy =
    params.hierarchy && params.hierarchy.length > 0
      ? expandHierarchyRowsToEntities(params.hierarchy, resolvedOrgId)
      : { sites: [], crews: [], devices: [] };

  const users = params.users || [];
  const sites = [...(params.sites || []), ...expandedHierarchy.sites];
  const crews = [...(params.crews || []), ...expandedHierarchy.crews];
  const devices = [...(params.devices || []), ...expandedHierarchy.devices];
  const rentals = params.rentals || [];
  const assignments = params.assignments || [];
  const total =
    (params.organizationToCreate ? 1 : 0) +
    users.length +
    sites.length +
    crews.length +
    devices.length +
    rentals.length +
    assignments.length;

  let completed = 0;
  const errors: BulkImportExecutionResult['errors'] = [];
  const createdUsers: UserProfile[] = [];
  const createdSites: MiningSite[] = [];
  const createdCrews: MiningCrew[] = [];
  const createdDevices: RegisteredDeviceConfig[] = [];
  const createdRentals: DeviceRental[] = [];
  const createdAssignments: WorkerAssignment[] = [];

  if (params.organizationToCreate) {
    params.onProgress?.(completed, total, `Empresa: ${params.organizationToCreate.name}`);
    createdOrganization = await saveOrganizationToRTDB(
      {
        ...params.organizationToCreate,
        createdAt: Date.now(),
      },
      params.actingUser
    );
    resolvedOrgId = createdOrganization.id;
    effectiveOrgs = [createdOrganization, ...effectiveOrgs.filter((o) => o.id !== createdOrganization!.id)];
    completed += 1;
  }

  for (let i = 0; i < users.length; i++) {
    const item = users[i];
    const label = `${item.name} (${item.email})`;
    params.onProgress?.(completed, total, `Usuario: ${label}`);
    try {
      const authPassword = item.password || params.defaultAuthPassword || '';
      if (params.createAuthAccounts && authPassword.length >= 8) {
        const created = await createUserAccountByAdmin({
          name: item.name,
          email: item.email,
          password: authPassword,
          role: item.role,
          rut: item.rut,
          shift: item.shift,
          assignedSector: item.assignedSector,
          assignedDeviceCode: item.assignedDeviceCode,
          organizationId: resolvedOrgId,
          organizations: effectiveOrgs,
          sendResetEmail: Boolean(params.sendResetEmail),
          actingUser: params.actingUser,
        });
        createdUsers.push(created);
      } else {
        const profile = buildCompanyUserProfile(item, resolvedOrgId, i);
        await addUserToRTDB(profile, params.actingUser, effectiveOrgs);
        createdUsers.push(profile);
      }
    } catch (err: any) {
      errors.push({
        section: 'Usuarios',
        label,
        reason: err?.message || 'Error al registrar usuario en Firebase.',
      });
    }
    completed += 1;
  }

  for (let i = 0; i < sites.length; i++) {
    const item = sites[i];
    const scopedSite: MiningSite = {
      ...item.site,
      organizationId: resolvedOrgId,
    };
    params.onProgress?.(completed, total, `Faena: ${scopedSite.name}`);
    const res = await saveSiteToRTDB(scopedSite);
    if (res.savedToRTDB) {
      createdSites.push(scopedSite);
    } else {
      errors.push({
        section: 'Faenas',
        label: scopedSite.name,
        reason: res.error || 'No se pudo persistir la faena en Firebase RTDB.',
      });
    }
    completed += 1;
  }

  for (let i = 0; i < crews.length; i++) {
    const item = crews[i];
    const scopedCrew: MiningCrew = {
      ...item.crew,
      organizationId: resolvedOrgId,
    };
    params.onProgress?.(completed, total, `Cuadrilla: ${scopedCrew.name}`);
    try {
      const res = await saveCrewToRTDB(scopedCrew, params.actingUser, effectiveOrgs);
      createdCrews.push(res.crew);
    } catch (err: any) {
      errors.push({
        section: 'Cuadrillas',
        label: scopedCrew.name,
        reason: err?.message || 'Error al guardar cuadrilla.',
      });
    }
    completed += 1;
  }

  for (let i = 0; i < devices.length; i++) {
    const item = devices[i];
    const scopedDevice: RegisteredDeviceConfig = {
      ...item.device,
      organizationId: resolvedOrgId,
    };
    params.onProgress?.(completed, total, `Dispositivo: ${scopedDevice.name}`);
    try {
      const savedDev = await saveRegisteredDeviceHierarchy(scopedDevice, params.actingUser, effectiveOrgs);
      createdDevices.push(savedDev);
    } catch (err: any) {
      errors.push({
        section: 'Dispositivos',
        label: scopedDevice.name,
        reason: err?.message || 'Error al vincular dispositivo.',
      });
    }
    completed += 1;
  }

  for (let i = 0; i < rentals.length; i++) {
    const item = rentals[i];
    const rentalPayload: DeviceRental = {
      ...item.rental,
      id: item.rental.contractNumber,
      organizationId: resolvedOrgId,
    };
    params.onProgress?.(completed, total, `Contrato: ${rentalPayload.contractNumber}`);
    try {
      await addRentalContractToRTDB(
        rentalPayload,
        params.actingUser,
        params.registeredDevices,
        effectiveOrgs
      );
      createdRentals.push(rentalPayload);
    } catch (err: any) {
      errors.push({
        section: 'Contratos',
        label: rentalPayload.contractNumber,
        reason: err?.message || 'Error al guardar contrato en RTDB.',
      });
    }
    completed += 1;
  }

  for (let i = 0; i < assignments.length; i++) {
    const item = assignments[i];
    const assignmentPayload: WorkerAssignment = {
      ...item.assignment,
      id: `asg-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      organizationId: resolvedOrgId,
    };
    params.onProgress?.(completed, total, `Asignación: ${assignmentPayload.workerName}`);
    try {
      await saveAssignmentToRTDB(assignmentPayload);
      createdAssignments.push(assignmentPayload);
    } catch (err: any) {
      errors.push({
        section: 'Asignaciones',
        label: assignmentPayload.workerName,
        reason: err?.message || 'Error al guardar asignación en RTDB.',
      });
    }
    completed += 1;
  }

  params.onProgress?.(total, total, 'Finalizado');
  const succeeded =
    (createdOrganization ? 1 : 0) +
    createdUsers.length +
    createdSites.length +
    createdCrews.length +
    createdDevices.length +
    createdRentals.length +
    createdAssignments.length;

  return {
    total,
    succeeded,
    failed: errors.length,
    createdOrganization,
    createdUsers,
    createdSites,
    createdCrews,
    createdDevices,
    createdRentals,
    createdAssignments,
    errors,
  };
}

// ============================================================================
// SEGURIDAD, AUDITORÍA ISO 27001, LEY 19.628 / 21.719 (ARCOP) Y LEY 21.663
// ============================================================================

export async function logSecurityAuditEventInRTDB(
  input: {
    action: SecurityAuditAction;
    severity?: SecurityAuditSeverity;
    summary: string;
    organizationId?: string;
    targetType?: string;
    targetId?: string;
    targetLabel?: string;
    metadata?: Record<string, string | number | boolean>;
    anonymousEmail?: string;
  },
  actingUser?: UserProfile | null
): Promise<SecurityAuditEvent | null> {
  const now = Date.now();
  const eventId = `aud_${now}_${Math.random().toString(36).slice(2, 8)}`;
  const event: SecurityAuditEvent = {
    id: eventId,
    timestamp: now,
    fechaHora: new Date(now).toISOString(),
    action: input.action,
    severity: input.severity || 'info',
    actorId: actingUser?.id || 'anonymous',
    actorName: actingUser?.name || input.anonymousEmail || 'Acceso Público / Sin Sesión',
    actorEmail: actingUser?.email || input.anonymousEmail || 'sin-correo',
    actorRole: actingUser?.role || 'anonimo',
    organizationId: input.organizationId || actingUser?.organizationId || DEFAULT_ORGANIZATION_ID,
    ...(input.targetType ? { targetType: input.targetType } : {}),
    ...(input.targetId ? { targetId: input.targetId } : {}),
    ...(input.targetLabel ? { targetLabel: input.targetLabel } : {}),
    summary: input.summary,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };

  try {
    await set(ref(rtdb, `auditoria_seguridad/${eventId}`), event);
    return event;
  } catch (err) {
    console.warn('[MineSafe][Audit] No se pudo escribir evento de auditoría en RTDB:', err);
    return null;
  }
}

export function subscribeToSecurityAuditEvents(
  callback: (events: SecurityAuditEvent[]) => void,
  actingUser?: UserProfile | null
): () => void {
  if (!canViewSecurityAuditTab(actingUser)) {
    callback([]);
    return () => {};
  }
  const auditQuery = query(ref(rtdb, 'auditoria_seguridad'), orderByKey(), limitToLast(500));
  return onValue(
    auditQuery,
    (snapshot) => {
      const val = snapshot.val();
      if (!val || typeof val !== 'object') {
        callback([]);
        return;
      }
      const list: SecurityAuditEvent[] = Object.entries(val)
        .map(([key, raw]: [string, any]) => ({
          id: raw?.id || key,
          timestamp: typeof raw?.timestamp === 'number' ? raw.timestamp : 0,
          fechaHora: raw?.fechaHora || new Date(typeof raw?.timestamp === 'number' ? raw.timestamp : 0).toISOString(),
          action: raw?.action || 'login_exitoso',
          severity: raw?.severity || 'info',
          actorId: raw?.actorId || 'desconocido',
          actorName: raw?.actorName || 'Sistema',
          actorEmail: raw?.actorEmail || '',
          actorRole: raw?.actorRole || 'anonimo',
          organizationId: raw?.organizationId,
          targetType: raw?.targetType,
          targetId: raw?.targetId,
          targetLabel: raw?.targetLabel,
          summary: raw?.summary || '',
          metadata: raw?.metadata && typeof raw.metadata === 'object' ? raw.metadata : undefined,
        }))
        .sort((a, b) => b.timestamp - a.timestamp);
      callback(list);
    },
    (error) => {
      console.warn('[MineSafe][Audit] Error suscribiendo /auditoria_seguridad:', error);
      callback([]);
    }
  );
}

export async function logCybersecurityIncidentInRTDB(
  input: {
    title: string;
    category: CybersecurityIncidentCategory;
    severity: CybersecurityIncidentSeverity;
    affectedSystem: string;
    description: string;
    organizationId?: string;
    csirtNotified?: boolean;
  },
  actingUser: UserProfile | null
): Promise<CybersecurityIncident> {
  assertActiveSession(actingUser);
  if (!canViewSecurityAuditTab(actingUser)) {
    throw new Error('Solo SuperAdmin o Admin MineSafe pueden registrar incidentes de ciberseguridad.');
  }
  const cleanTitle = input.title.trim();
  const cleanDesc = input.description.trim();
  if (cleanTitle.length < 4 || cleanDesc.length < 10) {
    throw new Error('Completa un título (mín. 4 caracteres) y una descripción técnica detallada (mín. 10 caracteres).');
  }

  const now = Date.now();
  const id = `inc_${now}_${Math.random().toString(36).slice(2, 6)}`;
  const code = `CSIRT-${new Date(now).toISOString().slice(0, 10).replace(/-/g, '')}-${id.slice(-4).toUpperCase()}`;
  // Ley 21.663: Alerta temprana obligatoria dentro de 3 horas para incidentes de impacto significativo (alta/crítica)
  const csirtNotificationDueAt =
    input.severity === 'alta' || input.severity === 'critica' ? now + 3 * 60 * 60 * 1000 : undefined;

  const incident: CybersecurityIncident = {
    id,
    code,
    title: cleanTitle,
    category: input.category,
    severity: input.severity,
    status: 'abierto',
    affectedSystem: input.affectedSystem.trim() || 'Plataforma MineSafe IoT',
    description: cleanDesc,
    organizationId: input.organizationId || actingUser!.organizationId || DEFAULT_ORGANIZATION_ID,
    reportedById: actingUser!.id,
    reportedByName: actingUser!.name,
    reportedAt: now,
    updatedAt: now,
    csirtNotified: Boolean(input.csirtNotified),
    ...(csirtNotificationDueAt ? { csirtNotificationDueAt } : {}),
  };

  await set(ref(rtdb, `incidentes_ciberseguridad/${id}`), incident);
  await logSecurityAuditEventInRTDB(
    {
      action: 'incidente_ciberseguridad',
      severity: input.severity === 'critica' || input.severity === 'alta' ? 'critical' : 'warning',
      summary: `Incidente ${code} registrado: ${cleanTitle} (${input.severity.toUpperCase()})`,
      organizationId: incident.organizationId,
      targetType: 'incidente_ciberseguridad',
      targetId: id,
      targetLabel: code,
      metadata: {
        category: input.category,
        severity: input.severity,
        csirtNotified: Boolean(input.csirtNotified),
      },
    },
    actingUser
  );

  return incident;
}

export async function updateCybersecurityIncidentStatusInRTDB(
  incidentId: string,
  updates: {
    status: CybersecurityIncidentStatus;
    csirtNotified?: boolean;
    resolutionNotes?: string;
  },
  actingUser: UserProfile | null
): Promise<void> {
  assertActiveSession(actingUser);
  if (!canViewSecurityAuditTab(actingUser)) {
    throw new Error('Solo SuperAdmin o Admin MineSafe pueden actualizar incidentes de ciberseguridad.');
  }
  const now = Date.now();
  const patch: Record<string, any> = {
    status: updates.status,
    updatedAt: now,
  };
  if (typeof updates.csirtNotified === 'boolean') {
    patch.csirtNotified = updates.csirtNotified;
  }
  if (typeof updates.resolutionNotes === 'string') {
    patch.resolutionNotes = updates.resolutionNotes.trim();
  }
  if (updates.status === 'cerrado') {
    patch.resolvedBy = actingUser!.name;
  }

  await update(ref(rtdb, `incidentes_ciberseguridad/${incidentId}`), patch);
  await logSecurityAuditEventInRTDB(
    {
      action: 'incidente_ciberseguridad',
      severity: updates.status === 'cerrado' ? 'info' : 'warning',
      summary: `Incidente ${incidentId} actualizado a estado "${updates.status}"${
        updates.csirtNotified ? ' (CSIRT notificado)' : ''
      }`,
      targetType: 'incidente_ciberseguridad',
      targetId: incidentId,
      metadata: {
        status: updates.status,
        csirtNotified: Boolean(updates.csirtNotified),
      },
    },
    actingUser
  );
}

export function subscribeToCybersecurityIncidents(
  callback: (incidents: CybersecurityIncident[]) => void,
  actingUser?: UserProfile | null
): () => void {
  if (!canViewSecurityAuditTab(actingUser)) {
    callback([]);
    return () => {};
  }
  return onValue(
    ref(rtdb, 'incidentes_ciberseguridad'),
    (snapshot) => {
      const val = snapshot.val();
      if (!val || typeof val !== 'object') {
        callback([]);
        return;
      }
      const list: CybersecurityIncident[] = Object.entries(val)
        .map(([key, raw]: [string, any]) => ({
          id: raw?.id || key,
          code: raw?.code || key,
          title: raw?.title || 'Incidente sin título',
          category: raw?.category || 'otro',
          severity: raw?.severity || 'media',
          status: raw?.status || 'abierto',
          affectedSystem: raw?.affectedSystem || 'Plataforma MineSafe IoT',
          description: raw?.description || '',
          organizationId: raw?.organizationId,
          reportedById: raw?.reportedById || '',
          reportedByName: raw?.reportedByName || 'Sistema',
          reportedAt: typeof raw?.reportedAt === 'number' ? raw.reportedAt : 0,
          updatedAt: typeof raw?.updatedAt === 'number' ? raw.updatedAt : 0,
          csirtNotified: Boolean(raw?.csirtNotified),
          csirtNotificationDueAt:
            typeof raw?.csirtNotificationDueAt === 'number' ? raw.csirtNotificationDueAt : undefined,
          resolutionNotes: raw?.resolutionNotes || undefined,
          resolvedBy: raw?.resolvedBy || undefined,
        }))
        .sort((a, b) => b.reportedAt - a.reportedAt);
      callback(list);
    },
    (error) => {
      console.warn('[MineSafe][Incidents] Error suscribiendo /incidentes_ciberseguridad:', error);
      callback([]);
    }
  );
}

export async function recordUserLegalConsentInRTDB(
  user: UserProfile,
  version: string = CURRENT_LEGAL_CONSENT_VERSION
): Promise<UserProfile> {
  const now = Date.now();
  await update(ref(rtdb, `usuarios/${user.id}`), {
    legalConsentVersion: version,
    legalConsentAcceptedAt: now,
  });
  await logSecurityAuditEventInRTDB(
    {
      action: 'consentimiento_legal',
      severity: 'info',
      summary: `Consentimiento informado aceptado (Política de Privacidad y Términos v${version})`,
      organizationId: user.organizationId,
      targetType: 'usuario',
      targetId: user.id,
      targetLabel: user.name,
      metadata: {
        version,
        acceptedAt: now,
      },
    },
    user
  );
  return {
    ...user,
    legalConsentVersion: version,
    legalConsentAcceptedAt: now,
  };
}

export async function anonymizeUserPIIInRTDB(
  targetUser: UserProfile,
  actingUser: UserProfile | null
): Promise<UserProfile> {
  assertActiveSession(actingUser);
  const check = canAnonymizeUserPII(actingUser, targetUser);
  if (!check.allowed) {
    throw new Error(check.reason || 'No autorizado para anonimizar datos personales.');
  }

  const now = Date.now();
  const anonymized = buildAnonymizedUserData(targetUser, actingUser!, now);

  await update(ref(rtdb, `usuarios/${targetUser.id}`), {
    nombre: anonymized.name,
    email: anonymized.email,
    codigoId: anonymized.rut,
    telefono: anonymized.rut,
    isActive: false,
    blockedReason: anonymized.blockedReason,
    blockedAt: now,
    blockedBy: actingUser!.name,
    anonymizedAt: anonymized.anonymizedAt,
    anonymizedBy: anonymized.anonymizedBy,
  });

  await logSecurityAuditEventInRTDB(
    {
      action: 'anonimizacion_arcop',
      severity: 'critical',
      summary: `Anonimización irreversible de PII ejecutada sobre cuenta ${targetUser.id} (derecho ARCOP Ley 19.628 / 21.719)`,
      organizationId: targetUser.organizationId,
      targetType: 'usuario',
      targetId: targetUser.id,
      targetLabel: anonymized.name,
      metadata: {
        previousRole: targetUser.role,
        anonymizedAt: now,
      },
    },
    actingUser
  );

  return {
    ...targetUser,
    name: anonymized.name,
    email: anonymized.email,
    rut: anonymized.rut,
    status: 'inactivo',
    blockedReason: anonymized.blockedReason,
    blockedAt: now,
    blockedBy: actingUser!.name,
    anonymizedAt: anonymized.anonymizedAt,
    anonymizedBy: anonymized.anonymizedBy,
  };
}









