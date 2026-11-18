import { CrewMember, MiningCrew, MiningSite, Organization, TelemetryVariable, UserProfile, UserRole } from '../types';

export const DEFAULT_ORGANIZATION_ID = 'org-minesafe-principal';

export function isGlobalMineSafeAdmin(role?: UserRole | null): boolean {
  return role === 'superadmin' || role === 'admin_minesafe';
}

export function isAnyAdminRole(role?: UserRole | null): boolean {
  return role === 'superadmin' || role === 'admin_minesafe' || role === 'admin';
}

export function canViewSystemUsersPanel(
  user?: Pick<UserProfile, 'role' | 'status'> | null
): boolean {
  if (!user || user.status !== 'activo') return false;
  return isAnyAdminRole(user.role);
}

export function isOrganizationOwner(
  actingUser: UserProfile | null | undefined,
  org: Pick<Organization, 'id' | 'ownerId' | 'ownerUid' | 'ownerEmail'> | null | undefined
): boolean {
  if (!actingUser || actingUser.status !== 'activo' || !org) return false;
  if (actingUser.role === 'superadmin') return true;
  if (actingUser.role !== 'admin') return false;
  if (org.ownerUid && org.ownerUid === actingUser.id) return true;
  if (org.ownerId && org.ownerId === actingUser.id) return true;
  if (
    org.ownerEmail &&
    actingUser.email &&
    org.ownerEmail.trim().toLowerCase() === actingUser.email.trim().toLowerCase()
  ) {
    return true;
  }
  return false;
}

export function getAuthorizedOrganizationIds(
  actingUser: UserProfile | null | undefined,
  organizations?: Organization[]
): string[] {
  if (!actingUser || actingUser.status !== 'activo') return [];
  const primaryOrg = actingUser.organizationId || DEFAULT_ORGANIZATION_ID;
  if (isGlobalMineSafeAdmin(actingUser.role)) {
    const allIds = (organizations || []).map((o) => o.id).filter(Boolean);
    return Array.from(new Set([primaryOrg, ...allIds]));
  }
  if (actingUser.role !== 'admin') {
    return [primaryOrg];
  }
  const ownedIds = (organizations || [])
    .filter((org) => isOrganizationOwner(actingUser, org))
    .map((org) => org.id);
  return Array.from(new Set([primaryOrg, ...ownedIds]));
}

export function isOrgAuthorizedForUser(
  actingUser: UserProfile | null | undefined,
  targetOrgId: string | undefined,
  organizations?: Organization[]
): boolean {
  if (!actingUser || actingUser.status !== 'activo') return false;
  if (isGlobalMineSafeAdmin(actingUser.role)) return true;
  const normalizedTarget = targetOrgId || DEFAULT_ORGANIZATION_ID;
  const actorOrg = actingUser.organizationId || DEFAULT_ORGANIZATION_ID;
  if (normalizedTarget === actorOrg) return true;
  if (actingUser.role === 'admin' && Array.isArray(organizations) && organizations.length > 0) {
    return organizations.some(
      (org) => org.id === normalizedTarget && isOrganizationOwner(actingUser, org)
    );
  }
  return false;
}

export function canCreateOrEditOrganization(
  actingUser: UserProfile | null | undefined,
  existingOrg?: Organization | null
): { allowed: boolean; reason?: string } {
  if (!actingUser || actingUser.status !== 'activo') {
    return { allowed: false, reason: 'La sesión actual no está activa o autorizada.' };
  }
  if (actingUser.role === 'superadmin') {
    return { allowed: true };
  }
  if (actingUser.role !== 'admin' && actingUser.role !== 'admin_minesafe') {
    return {
      allowed: false,
      reason: 'Solo Administradores o SuperAdministrador pueden crear o administrar empresas.',
    };
  }
  if (!existingOrg) {
    return { allowed: true };
  }
  if (existingOrg.id === DEFAULT_ORGANIZATION_ID) {
    return {
      allowed: false,
      reason: 'Solo el SuperAdministrador puede modificar los datos de la organización principal.',
    };
  }
  if (actingUser.role === 'admin_minesafe') {
    return { allowed: true };
  }
  if (isOrganizationOwner(actingUser, existingOrg)) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: 'Acción denegada: solo puedes editar empresas creadas por tu cuenta.',
  };
}

export function canDeleteOrganization(
  actingUser: UserProfile | null | undefined,
  org: Organization | null | undefined
): { allowed: boolean; reason?: string } {
  if (!actingUser || actingUser.status !== 'activo') {
    return { allowed: false, reason: 'Sesión no autorizada.' };
  }
  if (!org) {
    return { allowed: false, reason: 'Organización no encontrada.' };
  }
  if (org.id === DEFAULT_ORGANIZATION_ID) {
    return { allowed: false, reason: 'No se puede eliminar la organización principal por defecto.' };
  }
  if (actingUser.role === 'superadmin') {
    return { allowed: true };
  }
  if (actingUser.role === 'admin_minesafe') {
    return {
      allowed: false,
      reason: 'El rol Admin MineSafe puede suspender o editar empresas cliente, pero solo el SuperAdministrador puede eliminarlas permanentemente.',
    };
  }
  if (actingUser.role === 'admin' && isOrganizationOwner(actingUser, org)) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: 'Solo el SuperAdministrador o el Administrador propietario puede eliminar esta empresa.',
  };
}

export function resolveEffectiveOrgId(
  actingUser: UserProfile | null,
  selectedOrgId: string,
  organizations?: Organization[]
): string {
  if (!actingUser) return DEFAULT_ORGANIZATION_ID;
  if (isGlobalMineSafeAdmin(actingUser.role)) {
    return selectedOrgId || 'all';
  }
  if (
    actingUser.role === 'admin' &&
    selectedOrgId &&
    selectedOrgId !== 'all' &&
    isOrgAuthorizedForUser(actingUser, selectedOrgId, organizations)
  ) {
    return selectedOrgId;
  }
  return actingUser.organizationId || DEFAULT_ORGANIZATION_ID;
}

export function belongsToOrganization(
  entityOrgId: string | undefined,
  effectiveOrgId: string
): boolean {
  if (effectiveOrgId === 'all') return true;
  return (entityOrgId || DEFAULT_ORGANIZATION_ID) === effectiveOrgId;
}

export function canProvisionUserInOrganization(
  actingUser: UserProfile | null,
  targetOrgId: string,
  requestedRole: UserRole,
  organizations?: Organization[]
): { allowed: boolean; reason?: string } {
  if (!actingUser || actingUser.status !== 'activo') {
    return { allowed: false, reason: 'La sesión actual no está activa o autorizada.' };
  }
  if (!isAnyAdminRole(actingUser.role)) {
    return { allowed: false, reason: 'Solo un responsable autorizado (Admin o SuperAdmin) puede crear cuentas.' };
  }
  if (requestedRole === 'superadmin') {
    return { allowed: false, reason: 'No es posible asignar o crear un segundo SuperAdministrador.' };
  }
  if (requestedRole === 'admin_minesafe' && actingUser.role !== 'superadmin') {
    return {
      allowed: false,
      reason: 'Solo el SuperAdministrador puede crear o asignar cuentas de Admin Corporativo MineSafe.',
    };
  }

  const normalizedTargetOrg = targetOrgId || DEFAULT_ORGANIZATION_ID;
  if (actingUser.role === 'admin') {
    if (!isOrgAuthorizedForUser(actingUser, normalizedTargetOrg, organizations)) {
      return {
        allowed: false,
        reason: 'Un Administrador solo puede asociar usuarios a su organización asignada o a empresas creadas por él.',
      };
    }
  }

  return { allowed: true };
}

export function canModifyTargetUser(
  actingUser: UserProfile | null,
  targetUser: UserProfile,
  nextRole?: UserRole,
  organizations?: Organization[]
): { allowed: boolean; reason?: string } {
  if (!actingUser || actingUser.status !== 'activo') {
    return { allowed: false, reason: 'Sesión no autorizada.' };
  }
  if (!isAnyAdminRole(actingUser.role)) {
    return { allowed: false, reason: 'Permisos insuficientes para gestionar usuarios.' };
  }
  if (targetUser.id === actingUser.id) {
    return { allowed: false, reason: 'No puedes modificar ni desactivar tu propia sesión.' };
  }
  if (targetUser.role === 'superadmin') {
    return { allowed: false, reason: 'No se pueden modificar ni desactivar los permisos del SuperAdministrador.' };
  }
  if (nextRole === 'superadmin') {
    return { allowed: false, reason: 'Solo puede existir un único SuperAdministrador en la plataforma.' };
  }
  if (targetUser.role === 'admin_minesafe' && actingUser.role !== 'superadmin') {
    return {
      allowed: false,
      reason: 'Solo el SuperAdministrador puede modificar o desactivar cuentas de Admin Corporativo MineSafe.',
    };
  }
  if (nextRole === 'admin_minesafe' && actingUser.role !== 'superadmin') {
    return {
      allowed: false,
      reason: 'Solo el SuperAdministrador puede otorgar el rol de Admin Corporativo MineSafe.',
    };
  }

  if (actingUser.role === 'admin') {
    const targetOrg = targetUser.organizationId || DEFAULT_ORGANIZATION_ID;
    if (!isOrgAuthorizedForUser(actingUser, targetOrg, organizations)) {
      return {
        allowed: false,
        reason: 'Acción denegada: el usuario pertenece a otra organización.',
      };
    }
  }

  return { allowed: true };
}

export function filterScopedUsers(
  usersList: UserProfile[],
  actingUser: UserProfile | null,
  effectiveOrgId: string,
  organizations?: Organization[]
): UserProfile[] {
  if (!actingUser) return [];
  if (actingUser.role === 'superadmin') {
    if (effectiveOrgId === 'all') return usersList;
    return usersList.filter(
      (u) => u.role === 'superadmin' || belongsToOrganization(u.organizationId, effectiveOrgId)
    );
  }
  if (actingUser.role === 'admin_minesafe') {
    if (effectiveOrgId === 'all') {
      return usersList.filter((u) => u.role !== 'superadmin');
    }
    return usersList.filter(
      (u) => u.role !== 'superadmin' && belongsToOrganization(u.organizationId, effectiveOrgId)
    );
  }
  const resolvedOrg = resolveEffectiveOrgId(actingUser, effectiveOrgId, organizations);
  return usersList.filter(
    (u) => u.role !== 'superadmin' && belongsToOrganization(u.organizationId, resolvedOrg)
  );
}

export function isUserSessionActive(user: UserProfile | null | undefined): boolean {
  return Boolean(user && user.status === 'activo');
}

export function assertActiveSession(user: UserProfile | null | undefined): void {
  if (!isUserSessionActive(user)) {
    throw new Error('Tu sesión se encuentra inactiva o revocada. Inicia sesión nuevamente con una cuenta autorizada.');
  }
}

export function canManageContractsAndPayments(
  actingUser: UserProfile | null | undefined,
  targetOrgId?: string,
  organizations?: Organization[]
): { allowed: boolean; reason?: string } {
  if (!isUserSessionActive(actingUser)) {
    return { allowed: false, reason: 'La sesión actual está inactiva o cerrada.' };
  }
  if (!isAnyAdminRole(actingUser!.role)) {
    return {
      allowed: false,
      reason: 'Permisos insuficientes: solo Administradores o SuperAdministrador pueden gestionar contratos y pagos.',
    };
  }
  if (actingUser!.role === 'admin' && targetOrgId) {
    if (!isOrgAuthorizedForUser(actingUser, targetOrgId, organizations)) {
      return {
        allowed: false,
        reason: 'Acción denegada: no puedes gestionar contratos o pagos de otra organización.',
      };
    }
  }
  return { allowed: true };
}

export function filterScopedEntities<T extends { organizationId?: string }>(
  items: T[],
  actingUser: UserProfile | null,
  effectiveOrgId: string,
  organizations?: Organization[]
): T[] {
  if (!actingUser) return [];
  const targetOrg = isGlobalMineSafeAdmin(actingUser.role)
    ? effectiveOrgId || 'all'
    : resolveEffectiveOrgId(actingUser, effectiveOrgId, organizations);
  return items.filter((item) => belongsToOrganization(item.organizationId, targetOrg));
}

export function createEmptyTelemetryVariables(): TelemetryVariable[] {
  return [
    {
      id: 'temp',
      name: 'TEMPERATURA AMBIENTE',
      shortName: 'Temperatura',
      value: 0,
      unit: '°C',
      trend: 'estable',
      status: 'desconectado',
      statusLabel: 'Sin dispositivo',
      thresholdMin: 10,
      thresholdMax: 26,
      lastUpdateSeconds: 0,
      isSimulated: false,
      historical: [],
    },
    {
      id: 'hum',
      name: 'HUMEDAD RELATIVA',
      shortName: 'Humedad',
      value: 0,
      unit: '%',
      trend: 'estable',
      status: 'desconectado',
      statusLabel: 'Sin dispositivo',
      thresholdMin: 20,
      thresholdMax: 90,
      lastUpdateSeconds: 0,
      isSimulated: false,
      historical: [],
    },
    {
      id: 'co2',
      name: 'GASES / CO (MQ-2 ADC)',
      shortName: 'Gas MQ-2',
      value: 0,
      unit: 'ADC',
      trend: 'estable',
      status: 'desconectado',
      statusLabel: 'Sin dispositivo',
      thresholdMin: 0,
      thresholdMax: 800,
      lastUpdateSeconds: 0,
      isSimulated: false,
      historical: [],
    },
    {
      id: 'lux',
      name: 'MATERIAL PARTICULADO (PM2.5 ADC)',
      shortName: 'Polvo PM2.5',
      value: 0,
      unit: 'ADC',
      trend: 'estable',
      status: 'desconectado',
      statusLabel: 'Sin dispositivo',
      thresholdMin: 0,
      thresholdMax: 750,
      lastUpdateSeconds: 0,
      isSimulated: false,
      historical: [],
    },
    {
      id: 'kwh',
      name: 'BATERÍA DISPOSITIVO IoT',
      shortName: 'Batería Sensor',
      value: 0,
      unit: '%',
      trend: 'estable',
      status: 'desconectado',
      statusLabel: 'Sin dispositivo',
      thresholdMin: 20,
      thresholdMax: 100,
      lastUpdateSeconds: 0,
      isSimulated: false,
      historical: [],
    },
    {
      id: 'air_flow',
      name: 'FLUJO DE VENTILACIÓN',
      shortName: 'Ventilación',
      value: 0,
      unit: 'm/s',
      trend: 'estable',
      status: 'desconectado',
      statusLabel: 'Sin dispositivo',
      thresholdMin: 0.5,
      thresholdMax: 5,
      lastUpdateSeconds: 0,
      isSimulated: false,
      historical: [],
    },
  ];
}

export function resolveScopedCurrentSite(
  scopedSites: MiningSite[],
  selectedSiteId: string | undefined,
  effectiveOrgId: string,
  orgName?: string
): MiningSite {
  if (scopedSites.length > 0) {
    return scopedSites.find((s) => s.id === selectedSiteId) || scopedSites[0];
  }
  const fallbackOrgId = effectiveOrgId === 'all' ? DEFAULT_ORGANIZATION_ID : effectiveOrgId;
  return {
    id: `site-empty-${fallbackOrgId}`,
    organizationId: fallbackOrgId,
    name: 'Sin faena registrada',
    company:
      orgName ||
      (fallbackOrgId === DEFAULT_ORGANIZATION_ID ? 'MineSafe Principal' : fallbackOrgId),
    location: 'Chile',
    region: 'Sin asignar',
    type: 'subterranea',
    elevationMsl: 0,
    isPreloaded: false,
    activeSectors: [],
  };
}

export type OrgEmailConflictResult =
  | { conflict: 'none' }
  | { conflict: 'active_in_same_org'; existingUser: UserProfile }
  | { conflict: 'blocked_in_same_org'; existingUser: UserProfile };

export function findUserEmailConflictInOrg(
  usersList: UserProfile[],
  email: string,
  targetOrgId: string
): OrgEmailConflictResult {
  const cleanEmail = email.trim().toLowerCase();
  const normalizedTargetOrg = targetOrgId || DEFAULT_ORGANIZATION_ID;
  if (!cleanEmail) return { conflict: 'none' };

  const sameOrgMatch = usersList.find(
    (u) =>
      (u.email || '').trim().toLowerCase() === cleanEmail &&
      (u.organizationId || DEFAULT_ORGANIZATION_ID) === normalizedTargetOrg
  );
  if (!sameOrgMatch) {
    return { conflict: 'none' };
  }
  if (sameOrgMatch.status === 'inactivo') {
    return { conflict: 'blocked_in_same_org', existingUser: sameOrgMatch };
  }
  return { conflict: 'active_in_same_org', existingUser: sameOrgMatch };
}

export interface EmailProfileEntry {
  key: string;
  profile: UserProfile;
}

export type LoginProfileResolution =
  | { resolution: 'active_direct'; entry: EmailProfileEntry }
  | { resolution: 'auto_claim_pending'; entry: EmailProfileEntry }
  | { resolution: 'requires_new_account'; blockedEntry: EmailProfileEntry; pendingEntry: EmailProfileEntry }
  | { resolution: 'blocked'; blockedEntry: EmailProfileEntry }
  | { resolution: 'not_found' };

export function selectBestLoginProfileForEmail(
  entries: EmailProfileEntry[],
  authUid: string
): LoginProfileResolution {
  if (!entries || entries.length === 0) {
    return { resolution: 'not_found' };
  }

  const byUid = entries.find((e) => e.key === authUid);
  if (byUid && byUid.profile.status === 'activo') {
    return { resolution: 'active_direct', entry: byUid };
  }

  const byUidOrg = byUid ? (byUid.profile.organizationId || DEFAULT_ORGANIZATION_ID) : null;

  const activePendingOtherOrg = entries.find((e) => {
    if (e.key === authUid) return false;
    if (e.profile.status !== 'activo') return false;
    const isPendingKey =
      Boolean(e.profile.pendingActivation) ||
      e.key.startsWith('pend_') ||
      e.key.startsWith('usr-') ||
      e.key.startsWith('usr0');
    if (!isPendingKey) return false;
    if (!byUid) return true;
    const entryOrg = e.profile.organizationId || DEFAULT_ORGANIZATION_ID;
    return entryOrg !== byUidOrg;
  });

  if (activePendingOtherOrg) {
    if (!byUid) {
      return { resolution: 'auto_claim_pending', entry: activePendingOtherOrg };
    }
    return {
      resolution: 'requires_new_account',
      blockedEntry: byUid,
      pendingEntry: activePendingOtherOrg,
    };
  }

  if (!byUid) {
    const activeLegacy = entries.find((e) => e.profile.status === 'activo');
    if (activeLegacy) {
      return { resolution: 'active_direct', entry: activeLegacy };
    }
  }

  const blocked = byUid || entries.find((e) => e.profile.status === 'inactivo');
  if (blocked) {
    return { resolution: 'blocked', blockedEntry: blocked };
  }

  return { resolution: 'not_found' };
}

export function canManageCrews(
  actingUser: UserProfile | null | undefined,
  targetOrgId?: string,
  organizations?: Organization[]
): { allowed: boolean; reason?: string } {
  if (!isUserSessionActive(actingUser)) {
    return { allowed: false, reason: 'La sesión actual está inactiva o cerrada.' };
  }
  if (!isAnyAdminRole(actingUser!.role)) {
    return {
      allowed: false,
      reason: 'Permisos insuficientes: Operadores y Monotoriadores no pueden crear ni modificar cuadrillas.',
    };
  }
  if (actingUser!.role === 'admin' && targetOrgId) {
    if (!isOrgAuthorizedForUser(actingUser, targetOrgId, organizations)) {
      return {
        allowed: false,
        reason: 'Acción denegada: no puedes gestionar cuadrillas de otra organización.',
      };
    }
  }
  return { allowed: true };
}

export function buildCrewMemberFromUser(
  user: UserProfile,
  options?: { isLeader?: boolean; nowMs?: number }
): CrewMember {
  return {
    id: `mbr-usr-${user.id}`,
    userId: user.id,
    name: user.name,
    rut: user.rut || 'Sin RUT',
    role: user.roleLabel || (user.role === 'monotoriador' ? 'Monotoriador Ambiental' : 'Operador de Faena'),
    email: user.email,
    assignedDeviceCode: user.assignedDeviceCode || undefined,
    isLeader: Boolean(options?.isLeader),
    addedAt: options?.nowMs ?? Date.now(),
  };
}

export function assignWorkersToCrew(
  crew: MiningCrew,
  members: CrewMember[],
  nowMs: number = Date.now()
): MiningCrew {
  const dedupedMap = new Map<string, CrewMember>();
  let designatedLeaderKey: string | null = null;

  members.forEach((member) => {
    const key = member.userId
      ? `uid:${member.userId}`
      : member.email
      ? `email:${member.email.trim().toLowerCase()}`
      : `id:${member.id}`;
    const prev = dedupedMap.get(key);
    const mergedLeader = Boolean(member.isLeader || prev?.isLeader);
    if (member.isLeader) {
      designatedLeaderKey = key;
    } else if (!designatedLeaderKey && prev?.isLeader) {
      designatedLeaderKey = key;
    }
    dedupedMap.set(key, prev ? { ...prev, ...member, isLeader: mergedLeader } : member);
  });

  const nextMembers = Array.from(dedupedMap.entries()).map(([key, member]) => ({
    ...member,
    isLeader: designatedLeaderKey ? key === designatedLeaderKey : false,
  }));
  const leader = nextMembers.find((m) => m.isLeader);

  return {
    ...crew,
    members: nextMembers,
    leaderName: leader ? leader.name : undefined,
    leaderUserId: leader?.userId,
    updatedAt: nowMs,
  };
}



