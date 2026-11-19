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
  MiningCrew
} from '../types';
import {
  assertActiveSession,
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
  findUserEmailConflictInOrg,
  isAnyAdminRole,
  isGlobalMineSafeAdmin,
  isOrgAuthorizedForUser,
  isUnassignedDeviceOrg,
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

// Connection test for user's Realtime Database (respects org scope for non-superadmin)
export async function testConnection(scope?: RTDBSubscriptionScope): Promise<boolean> {
  try {
    const testQuery = buildOrgScopedQuery('dispositivos', scope);
    const snapshot = await get(testQuery);
    return snapshot.exists();
  } catch (error) {
    console.warn('RTDB connection error:', error);
    return false;
  }
}

// -------------------------------------------------------------
// MAPPER UTILS FOR USER'S RTDB SCHEMA
// -------------------------------------------------------------
// Cache of local reception times per device node to safeguard against NTP clock skew
const lastPacketArrivalMap: Record<string, number> = {};
const lastPacketSignatureMap: Record<string, string> = {};

export function recordDevicePacketArrival(key: string, data?: any) {
  if (!data) {
    if (!lastPacketArrivalMap[key]) {
      lastPacketArrivalMap[key] = Date.now();
    }
    return;
  }
  const signature = JSON.stringify([
    data.CO ?? data.co ?? null,
    data.PM2_5 ?? data.pm25 ?? null,
    data.temperatura ?? data.temp ?? null,
    data.humedad ?? data.hum ?? null,
    data.last_update_server ?? data.timestamp_server ?? null,
    data.alarma_activa ?? data.alarma ?? null,
    data.luz ?? null,
    data.estado_adquisicion ?? null,
  ]);
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
  timeoutSeconds: number = 20
): SensorDevice {
  const coVal = readStrictBoundedNum(data?.CO, data?.co, 0, 4095);
  const pmVal = readStrictBoundedNum(data?.PM2_5, data?.pm25, 0, 4095);
  const tempVal = readStrictBoundedNum(data?.temperatura, data?.temp, -40, 100);
  const humVal = readStrictBoundedNum(data?.humedad, data?.hum, 0, 100);

  const faultFields: ('CO' | 'PM2_5' | 'temperatura' | 'humedad')[] = [];
  if (coVal === null) faultFields.push('CO');
  if (pmVal === null) faultFields.push('PM2_5');
  if (tempVal === null) faultFields.push('temperatura');
  if (humVal === null) faultFields.push('humedad');
  const sensorFault = faultFields.length > 0;

  const effectiveTimeout = Math.max(5, Number(timeoutSeconds) || 20);
  const now = Date.now();
  const lastArrival = lastPacketArrivalMap[key] || 0;
  let serverTime = Number(data?.last_update_server) || Number(data?.timestamp_server) || 0;
  // 10 dígitos Unix epoch (>= año 2001) -> convertir a milisegundos
  if (serverTime >= 1000000000 && serverTime < 100000000000) {
    serverTime = serverTime * 1000;
  } else if (serverTime > 0 && serverTime < 1000000000) {
    // El firmware envió millis() de uptime en vez de época Unix:
    // usar la hora real de llegada del paquete RTDB para evitar fechas de 1970.
    serverTime = lastArrival > 0 ? lastArrival : now;
  }

  const diffSeconds = serverTime > 0 ? Math.floor(Math.abs(now - serverTime) / 1000) : 999999;
  const arrivalDiff = lastArrival > 0 ? Math.floor((now - lastArrival) / 1000) : 999999;

  const isOnline = diffSeconds <= effectiveTimeout || arrivalDiff <= effectiveTimeout;

  const alarmaActiva = Boolean(data?.alarma_activa);
  const origenAlarma = data?.origen_alarma || '';
  const descripcionMonitoreo = data?.descripcion_monitoreo || '';

  let status: AlertSeverity = 'normal';
  if (!isOnline) {
    status = 'desconectado';
  } else if (alarmaActiva || (coVal !== null && coVal >= 500) || (pmVal !== null && pmVal >= 150)) {
    status = 'critico';
  } else if ((coVal !== null && coVal >= 350) || (pmVal !== null && pmVal >= 55)) {
    status = 'advertencia';
  }

  let deviceName = data?.name || key;
  let siteName = data?.siteName || '';
  let crewName = data?.crewName || '';
  let sectorName = data?.sectorName || 'Sector Operativo';

  if (key === 'device_38A839E81F84') {
    deviceName = data?.name || 'Gateway Principal Mina Norte';
    siteName = data?.siteName || 'Faena Chuquicamata';
    crewName = data?.crewName || 'Cuadrilla Alfa';
    sectorName = data?.sectorName || 'Rampa Principal';
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

  const resolvedOrgId =
    data?.organizationId === UNASSIGNED_DEVICE_ORG_ID
      ? UNASSIGNED_DEVICE_ORG_ID
      : data?.organizationId || DEFAULT_ORGANIZATION.id;

  const mappedAssignmentStatus: DeviceAssignmentStatus =
    data?.assignmentStatus &&
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

  return {
    id: key,
    code: key,
    name: deviceName,
    type: key.startsWith('NODO') || data?.deviceCategory === 'nodo' ? 'estacion_fija' : 'multigas_portatil',
    organizationId: resolvedOrgId,
    organizationName: data?.organizationName || undefined,
    siteId: data?.siteId || undefined,
    siteName: siteName || undefined,
    crewId: data?.crewId || undefined,
    crewName: crewName || undefined,
    sectorId: data?.sectorId || `sec-${key}`,
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
    via: data?.via || '',
    localIp: data?.localIp || undefined,
    deviceCategory: data?.deviceCategory || (key.startsWith('NODO') ? 'nodo' : 'gateway'),
    parentGatewayId: data?.parentGatewayId || undefined,
    registroAlarmas: data?.registro_alarmas,
    assignmentStatus: mappedAssignmentStatus,
    assignedBy: data?.assignedBy || undefined,
    assignedAt: typeof data?.assignedAt === 'number' ? data.assignedAt : undefined,
    assignmentHistory: historyList,
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
  if (scope?.role && !isGlobalMineSafeAdmin(scope.role)) {
    const targetOrgId =
      scope.organizationId && scope.organizationId !== 'all'
        ? scope.organizationId
        : DEFAULT_ORGANIZATION_ID;

    let queryDevices: Record<string, any> = {};
    const explicitDevices: Record<string, any> = {};
    const emitScoped = () => {
      const merged: Record<string, any> = {};
      const assignIfMatches = (devId: string, val: any) => {
        if (!val || typeof val !== 'object') return;
        const devOrg = val.organizationId || DEFAULT_ORGANIZATION_ID;
        if (devOrg !== targetOrgId) return;
        merged[devId] = val;
        recordDevicePacketArrival(devId, val);
      };
      Object.entries(queryDevices).forEach(([k, v]) => assignIfMatches(k, v));
      Object.entries(explicitDevices).forEach(([k, v]) => assignIfMatches(k, v));
      callback(merged);
    };

    const unsubs: Array<() => void> = [];
    const scopedRef = buildOrgScopedQuery('dispositivos', scope);
    unsubs.push(
      onValue(
        scopedRef,
        (snapshot) => {
          queryDevices = snapshot.exists() ? snapshot.val() || {} : {};
          emitScoped();
        },
        (err) => {
          console.warn(`Error subscribing to scoped RTDB /dispositivos (${targetOrgId}):`, err?.message || err);
          queryDevices = {};
          emitScoped();
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
    });

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }

  const devicesRef = buildOrgScopedQuery('dispositivos', scope);
  const unsub = onValue(devicesRef, (snapshot) => {
    if (snapshot.exists()) {
      const incoming = snapshot.val() || {};
      Object.keys(incoming).forEach((key) => {
        recordDevicePacketArrival(key, incoming[key]);
      });
      callback(incoming);
    } else {
      callback({});
    }
  }, (err) => {
    console.warn('Error subscribing to RTDB /dispositivos:', err?.message || err);
  });
  return unsub;
}

export function subscribeToRTDBDevices(
  callback: (devices: SensorDevice[]) => void,
  timeoutSeconds: number = 20,
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
  timeoutSeconds: number = 20,
  scope?: RTDBSubscriptionScope
): Promise<{ raw: Record<string, any>; devices: SensorDevice[] }> {
  if (scope?.role && !isGlobalMineSafeAdmin(scope.role)) {
    const targetOrgId =
      scope.organizationId && scope.organizationId !== 'all'
        ? scope.organizationId
        : DEFAULT_ORGANIZATION_ID;
    const raw: Record<string, any> = {};

    const scopedSnap = await get(buildOrgScopedQuery('dispositivos', scope)).catch(() => null);
    if (scopedSnap && scopedSnap.exists()) {
      const val = scopedSnap.val() || {};
      Object.keys(val).forEach((id) => {
        const devOrg = val[id]?.organizationId || DEFAULT_ORGANIZATION_ID;
        if (devOrg === targetOrgId) {
          raw[id] = val[id];
        }
      });
    }

    for (const id of Array.from(new Set((scope.deviceIds || []).filter(Boolean)))) {
      if (raw[id]) continue;
      const snap = await get(ref(rtdb, `dispositivos/${id}`)).catch(() => null);
      if (snap && snap.exists()) {
        const val = snap.val();
        const devOrg = val?.organizationId || DEFAULT_ORGANIZATION_ID;
        if (devOrg === targetOrgId) {
          raw[id] = val;
        }
      }
    }

    const devices = Object.keys(raw).map((id) => {
      recordDevicePacketArrival(id, raw[id]);
      return mapRTDBDeviceToSensorDevice(id, raw[id], timeoutSeconds);
    });
    return { raw, devices };
  }

  const snapshot = await get(ref(rtdb, 'dispositivos'));
  if (!snapshot.exists()) {
    return { raw: {}, devices: [] };
  }
  const incoming = snapshot.val() || {};
  const devices = Object.keys(incoming).map((key) => {
    recordDevicePacketArrival(key, incoming[key]);
    return mapRTDBDeviceToSensorDevice(key, incoming[key], timeoutSeconds);
  });
  return { raw: incoming, devices };
}

export function extractAlarmAuditRecords(devices: SensorDevice[]): AlarmAuditRecord[] {
  const records: AlarmAuditRecord[] = [];

  devices.forEach((dev) => {
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
  const targetOrg = existingData?.organizationId || updates.organizationId || DEFAULT_ORGANIZATION_ID;
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
    // La baliza/luz se activa y apaga automáticamente en conjunto con la alarma
    luz: active,
    iluminacion_led: active,
    origen_alarma: active ? 'ACTIVACION_MANUAL_WEB' : 'NINGUNO',
    last_update_server: now,
  };

  const primaryId = deviceId || 'device_38A839E81F84';
  const targetSet = new Set<string>([primaryId, ...(options?.targetDeviceIds || []).filter(Boolean)]);

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
    descripcion_monitoreo: `Alarma y baliza apagadas por ${actorLabel}.`,
    last_update_server: now,
  };

  if (options?.resetSensorBaselines) {
    devPayload.CO = 45;
    devPayload.PM2_5 = 25;
    devPayload.estado_adquisicion = 'activo';
  }

  const targetSet = new Set<string>([primaryId, ...(options?.targetDeviceIds || []).filter(Boolean)]);
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
    throw new Error('Acceso denegado: Solo Administrador o SuperAdministrador puede controlar la baliza LED del nodo.');
  }
  const now = Date.now();
  const payload = {
    luz: active,
    iluminacion_led: active,
    last_update_server: now,
  };

  const targetId = deviceId || 'device_38A839E81F84';
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
  try {
    const now = Date.now();
    const orgId = (organizationId && organizationId !== 'all' ? organizationId : DEFAULT_ORGANIZATION.id).trim();
    const devIds = [primaryDeviceId || 'device_38A839E81F84'];

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
    label: 'Partículas PM2.5 (Sharp GP2Y1010)',
    descripcion: 'Densidad estimada en µg/m³ por el firmware con conversión lineal genérica. Sin calibración gravimétrica oficial.'
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
      ? raw.registeredDevices
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
      raw?.status === 'inactiva' || raw?.status === 'en_descanso'
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
  nowMs: number = Date.now()
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

function mapTelemetrySnapshotRaw(raw: Record<string, any>, startMs: number, endMs: number): TelemetryHistoryPoint[] {
  return Object.keys(raw || {})
    .map((k) => {
      const item = raw[k];
      const ts = typeof item?.timestamp === 'number' ? item.timestamp : Number(k);
      return {
        timestamp: ts,
        co: typeof item?.co === 'number' ? item.co : null,
        pm25: typeof item?.pm25 === 'number' ? item.pm25 : null,
        temperatura: typeof item?.temperatura === 'number' ? item.temperatura : null,
        humedad: typeof item?.humedad === 'number' ? item.humedad : null,
        ...(typeof item?.originTimestamp === 'number' ? { originTimestamp: item.originTimestamp } : {}),
        ...(typeof item?.serverTimestamp === 'number' ? { serverTimestamp: item.serverTimestamp } : {}),
      };
    })
    .filter((p) => Number.isFinite(p.timestamp) && p.timestamp >= startMs && p.timestamp <= endMs)
    .sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Consulta paginada por cursor (`orderByChild('timestamp') + startAt + limitToFirst`) para evitar
 * truncamiento silencioso en ventanas extensas de telemetría.
 */
export async function fetchPaginatedTelemetryHistory(
  deviceId: string,
  rangeOrOptions: { startMs: number; endMs?: number },
  options?: {
    pageSize?: number;
    maxPages?: number;
    fetchPage?: (cursorTs: number, endMs: number, pageSize: number) => Promise<TelemetryHistoryPoint[]>;
  }
): Promise<TelemetryHistoryPageResult> {
  if (!deviceId) {
    return { points: [], pagesFetched: 0, truncated: false, error: null };
  }
  const { startMs, endMs } = resolveTelemetryWindowMs(rangeOrOptions);
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
          pagePoints = mapTelemetrySnapshotRaw(snap.val() || {}, cursorTs, endMs);
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

    const points = Array.from(collectedMap.values()).sort((a, b) => a.timestamp - b.timestamp);
    return { points, pagesFetched, truncated, error: null };
  } catch (err: any) {
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
  const { startMs, endMs, limit } = resolveTelemetryWindowMs(rangeOrOptions);
  const histQuery = query(
    ref(rtdb, `historial_telemetria/${deviceId}`),
    orderByChild('timestamp'),
    startAt(startMs),
    endAt(endMs),
    limitToLast(limit)
  );
  return onValue(
    histQuery,
    (snapshot) => {
      if (!snapshot.exists()) {
        callback([], { error: null });
        return;
      }
      const points = mapTelemetrySnapshotRaw(snapshot.val() || {}, startMs, endMs);
      callback(points, { error: null });
    },
    (err) => {
      const msg = err?.message || 'Error consultando historial de telemetría.';
      console.warn('Error subscribing to telemetry history:', msg);
      callback([], { error: msg });
    }
  );
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
  const category: DeviceCategory =
    raw?.category === 'gateway' ||
    raw?.category === 'nodo' ||
    raw?.category === 'sensor' ||
    raw?.category === 'gateway_sensor'
      ? raw.category
      : key.startsWith('NODO')
      ? 'nodo'
      : 'gateway';
  const history: DeviceAssignmentAuditEntry[] = Array.isArray(raw?.assignmentHistory)
    ? raw.assignmentHistory
    : raw?.assignmentHistory && typeof raw.assignmentHistory === 'object'
    ? Object.values(raw.assignmentHistory)
    : [];

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
    parentGatewayId: raw?.parentGatewayId || undefined,
    localIp: raw?.localIp || undefined,
    enabled: raw?.enabled !== false && raw?.active !== false,
    active: raw?.active !== false && raw?.enabled !== false,
    createdAt: typeof raw?.createdAt === 'number' ? raw.createdAt : Date.now(),
    assignedBy: raw?.assignedBy || undefined,
    assignedAt: typeof raw?.assignedAt === 'number' ? raw.assignedAt : undefined,
    assignmentHistory: history,
  };
  base.assignmentStatus = resolveDeviceAssignmentStatus(base);
  return base;
}

export function subscribeToDeviceCatalog(
  callback: (devices: RegisteredDeviceConfig[]) => void,
  scope?: RTDBSubscriptionScope
): () => void {
  const targetRef =
    scope?.role && !isGlobalMineSafeAdmin(scope.role)
      ? query(
          ref(rtdb, 'catalogo_dispositivos'),
          orderByChild('organizationId'),
          equalTo(
            scope.organizationId && scope.organizationId !== 'all'
              ? scope.organizationId
              : DEFAULT_ORGANIZATION_ID
          )
        )
      : ref(rtdb, 'catalogo_dispositivos');

  return onValue(
    targetRef,
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
  if (actingUser.role !== 'superadmin') return;
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
    parentGatewayId: cleanCategory === 'nodo' ? params.parentGatewayId?.trim() || undefined : undefined,
    localIp: params.localIp?.trim() || existingCatalog?.localIp || undefined,
    enabled: true,
    active: true,
    createdAt: existingCatalog?.createdAt || now,
    assignmentStatus,
    assignedBy: actingUser!.name,
    assignedAt: now,
    assignmentHistory: nextHistory,
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
  };

  if (devSnap && devSnap.exists()) {
    await update(devRef, rtdbMetadata);
  } else {
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
    assignmentStatus: nextStatus,
    assignedBy: actingUser!.name,
    assignedAt: now,
    assignmentHistory: nextHistory,
  };

  await set(catalogRef, JSON.parse(JSON.stringify(updated)));

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
    assignedBy: updated.assignedBy || null,
    assignedAt: now,
    assignmentHistory: JSON.parse(JSON.stringify(nextHistory)),
  };

  if (devSnap && devSnap.exists()) {
    await update(devRef, rtdbUpdate);
  } else {
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

export async function deleteIoTDeviceFromCatalogInRTDB(
  deviceId: string,
  actingUser: UserProfile | null | undefined
): Promise<void> {
  assertActiveSession(actingUser);
  const perm = canRegisterAndAssignIoTDevices(actingUser);
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
    }).catch(() => {});
  }
  await syncPlatformRegisteredDevicesIfSuperAdmin(
    { id: cleanId, name: cleanId, category: 'gateway', sectorName: '' },
    actingUser!,
    cleanId
  );
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








