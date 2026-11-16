import { UserProfile, UserRole } from '../types';

export const DEFAULT_ORGANIZATION_ID = 'org-minesafe-principal';

export function resolveEffectiveOrgId(
  actingUser: UserProfile | null,
  selectedOrgId: string
): string {
  if (!actingUser) return DEFAULT_ORGANIZATION_ID;
  if (actingUser.role === 'superadmin') {
    return selectedOrgId || 'all';
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
  requestedRole: UserRole
): { allowed: boolean; reason?: string } {
  if (!actingUser || actingUser.status !== 'activo') {
    return { allowed: false, reason: 'La sesión actual no está activa o autorizada.' };
  }
  if (actingUser.role !== 'superadmin' && actingUser.role !== 'admin') {
    return { allowed: false, reason: 'Solo un responsable autorizado (Admin o SuperAdmin) puede crear cuentas.' };
  }
  if (requestedRole === 'superadmin') {
    return { allowed: false, reason: 'No es posible asignar o crear un segundo SuperAdministrador.' };
  }

  const normalizedTargetOrg = targetOrgId || DEFAULT_ORGANIZATION_ID;
  if (actingUser.role === 'admin') {
    const actorOrg = actingUser.organizationId || DEFAULT_ORGANIZATION_ID;
    if (normalizedTargetOrg !== actorOrg) {
      return {
        allowed: false,
        reason: 'Un Administrador solo puede asociar usuarios a su propia organización.',
      };
    }
  }

  return { allowed: true };
}

export function canModifyTargetUser(
  actingUser: UserProfile | null,
  targetUser: UserProfile,
  nextRole?: UserRole
): { allowed: boolean; reason?: string } {
  if (!actingUser || actingUser.status !== 'activo') {
    return { allowed: false, reason: 'Sesión no autorizada.' };
  }
  if (actingUser.role !== 'superadmin' && actingUser.role !== 'admin') {
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

  if (actingUser.role === 'admin') {
    const actorOrg = actingUser.organizationId || DEFAULT_ORGANIZATION_ID;
    const targetOrg = targetUser.organizationId || DEFAULT_ORGANIZATION_ID;
    if (actorOrg !== targetOrg) {
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
  effectiveOrgId: string
): UserProfile[] {
  if (!actingUser) return [];
  if (actingUser.role === 'superadmin') {
    if (effectiveOrgId === 'all') return usersList;
    return usersList.filter(
      (u) => u.role === 'superadmin' || belongsToOrganization(u.organizationId, effectiveOrgId)
    );
  }
  const actorOrg = actingUser.organizationId || DEFAULT_ORGANIZATION_ID;
  return usersList.filter(
    (u) => u.role !== 'superadmin' && belongsToOrganization(u.organizationId, actorOrg)
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
  targetOrgId?: string
): { allowed: boolean; reason?: string } {
  if (!isUserSessionActive(actingUser)) {
    return { allowed: false, reason: 'La sesión actual está inactiva o cerrada.' };
  }
  if (actingUser!.role !== 'superadmin' && actingUser!.role !== 'admin') {
    return {
      allowed: false,
      reason: 'Permisos insuficientes: solo Administradores o SuperAdministrador pueden gestionar contratos y pagos.',
    };
  }
  if (actingUser!.role === 'admin' && targetOrgId) {
    const actorOrg = actingUser!.organizationId || DEFAULT_ORGANIZATION_ID;
    if ((targetOrgId || DEFAULT_ORGANIZATION_ID) !== actorOrg) {
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
  effectiveOrgId: string
): T[] {
  if (!actingUser) return [];
  const targetOrg =
    actingUser.role === 'superadmin'
      ? effectiveOrgId || 'all'
      : actingUser.organizationId || DEFAULT_ORGANIZATION_ID;
  return items.filter((item) => belongsToOrganization(item.organizationId, targetOrg));
}

