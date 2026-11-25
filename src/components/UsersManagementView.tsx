import React, { useState } from 'react';
import { 
  Users, 
  UserCheck, 
  Shield, 
  Crown, 
  HardHat, 
  Plus, 
  Search, 
  Filter, 
  Edit2, 
  Check, 
  X, 
  Lock,
  Mail,
  Clock,
  Radio,
  ShieldCheck,
  AlertCircle,
  Eye,
  EyeOff,
  Unlock,
  ArrowRight,
  Building2,
  Download,
  UserX
} from 'lucide-react';
import { Organization, RegisteredDeviceConfig, UserProfile, UserRole } from '../types';
import { soundAlert } from '../services/audioAlert';
import {
  anonymizeUserPIIInRTDB,
  createUserAccountByAdmin,
  logSecurityAuditEventInRTDB,
  sendPasswordResetWithFirebase,
  DEFAULT_ORGANIZATION,
} from '../services/firebase';
import {
  canModifyTargetUser,
  canProvisionUserInOrganization,
  findUserEmailConflictInOrg,
  getAuthorizedOrganizationIds,
  isAnyAdminRole,
  isGlobalMineSafeAdmin,
  DEFAULT_ORGANIZATION_ID,
} from '../utils/accessControl';
import { isPlaceholderRut, validateChileanRut } from '../utils/rut';
import {
  canUnmaskEmail,
  canUnmaskRut,
  formatEmailForViewer,
  formatRutForViewer,
} from '../utils/privacyMask';
import {
  buildUserPersonalDataExportJson,
  canAnonymizeUserPII,
  canExportUserARCOPData,
} from '../utils/securityCompliance';
import { validatePasswordPolicy } from '../utils/passwordPolicy';
import { RutInput } from './RutInput';

interface UsersManagementViewProps {
  currentUser: UserProfile;
  usersList: UserProfile[];
  organizations?: Organization[];
  catalogDevices?: RegisteredDeviceConfig[];
  activeOrganizationId?: string;
  onAddUser: (newUser: UserProfile) => Promise<void> | void;
  onUpdateUserRole: (userId: string, newRole: UserRole) => Promise<void> | void;
  onUpdateUserOrganization?: (userId: string, targetOrgId: string) => Promise<void> | void;
  onUpdateUserDevice?: (userId: string, nextDeviceId: string | null) => Promise<void> | void;
  onToggleUserStatus: (userId: string, reason?: string) => Promise<void> | void;
}

export const UsersManagementView: React.FC<UsersManagementViewProps> = ({
  currentUser,
  usersList,
  organizations = [],
  catalogDevices = [],
  activeOrganizationId,
  onAddUser,
  onUpdateUserRole,
  onUpdateUserOrganization,
  onUpdateUserDevice,
  onToggleUserStatus,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [orgFilter, setOrgFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'activo' | 'inactivo' | 'pending'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [userToBlock, setUserToBlock] = useState<UserProfile | null>(null);
  const [blockReason, setBlockReason] = useState('Desvinculación / Despido laboral');
  const [isTogglingBlock, setIsTogglingBlock] = useState(false);
  const [pendingRoleChange, setPendingRoleChange] = useState<{
    user: UserProfile;
    nextRole: UserRole;
  } | null>(null);
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);
  const [pendingOrgChange, setPendingOrgChange] = useState<{
    user: UserProfile;
    targetOrg: Organization;
  } | null>(null);
  const [isUpdatingOrg, setIsUpdatingOrg] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [revealAllRuts, setRevealAllRuts] = useState(false);
  const [revealAllEmails, setRevealAllEmails] = useState(false);
  const [unlockedRutIds, setUnlockedRutIds] = useState<Record<string, boolean>>({});
  const [unlockedEmailIds, setUnlockedEmailIds] = useState<Record<string, boolean>>({});
  const [userToAnonymize, setUserToAnonymize] = useState<UserProfile | null>(null);
  const [isAnonymizing, setIsAnonymizing] = useState(false);

  // New user form state
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRut, setNewRut] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('operador');
  const [newShift, setNewShift] = useState('Turno Mañana (07:00 - 15:30)');
  const [newPassword, setNewPassword] = useState('');
  const [sendResetEmail, setSendResetEmail] = useState(true);
  const [newOrganizationId, setNewOrganizationId] = useState<string>(
    activeOrganizationId && activeOrganizationId !== 'all' ? activeOrganizationId : DEFAULT_ORGANIZATION.id
  );
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const isSuperAdmin = currentUser.role === 'superadmin';
  const isGlobalAdmin = isGlobalMineSafeAdmin(currentUser.role);
  const isAdminOrSuper = isAnyAdminRole(currentUser.role);
  const allowRutUnmask = canUnmaskRut(currentUser.role);
  const allowEmailUnmask = canUnmaskEmail(currentUser.role);
  const authorizedOrgIds = getAuthorizedOrganizationIds(currentUser, organizations);
  const authorizedOrgs = isGlobalAdmin
    ? organizations
    : organizations.filter((o) => authorizedOrgIds.includes(o.id));

  const isUserRutUnlocked = (userId: string) =>
    allowRutUnmask && (revealAllRuts || Boolean(unlockedRutIds[userId]));

  const isUserEmailUnlocked = (userId: string) =>
    allowEmailUnmask && (revealAllEmails || Boolean(unlockedEmailIds[userId]));

  const toggleSingleRut = (userId: string) => {
    if (!allowRutUnmask) return;
    const willUnlock = !isUserRutUnlocked(userId);
    setUnlockedRutIds((prev) => ({ ...prev, [userId]: willUnlock }));
    if (revealAllRuts) setRevealAllRuts(false);
    if (willUnlock) {
      const target = usersList.find((u) => u.id === userId);
      void logSecurityAuditEventInRTDB(
        {
          action: 'acceso_pii_rut',
          severity: 'warning',
          summary: `Desbloqueo individual de RUT para ${target?.name || userId}`,
          organizationId: target?.organizationId,
          targetType: 'usuario',
          targetId: userId,
          targetLabel: target?.name || userId,
        },
        currentUser
      );
    }
  };

  const toggleSingleEmail = (userId: string) => {
    if (!allowEmailUnmask) return;
    const willUnlock = !isUserEmailUnlocked(userId);
    setUnlockedEmailIds((prev) => ({ ...prev, [userId]: willUnlock }));
    if (revealAllEmails) setRevealAllEmails(false);
    if (willUnlock) {
      const target = usersList.find((u) => u.id === userId);
      void logSecurityAuditEventInRTDB(
        {
          action: 'acceso_pii_email',
          severity: 'warning',
          summary: `Desbloqueo individual de correo corporativo para ${target?.name || userId}`,
          organizationId: target?.organizationId,
          targetType: 'usuario',
          targetId: userId,
          targetLabel: target?.name || userId,
        },
        currentUser
      );
    }
  };

  const handleExportARCOP = (targetUser: UserProfile) => {
    const check = canExportUserARCOPData(currentUser, targetUser, organizations);
    if (!check.allowed) {
      showToast('error', check.reason || 'No autorizado para exportar datos ARCOP.');
      return;
    }
    const bundle = buildUserPersonalDataExportJson({
      targetUser,
      actingUser: currentUser,
      organizations,
    });
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `MineSafe_ARCOP_${targetUser.id}_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    soundAlert.playFeedbackBeep();
    void logSecurityAuditEventInRTDB(
      {
        action: 'exportacion_arcop',
        severity: 'warning',
        summary: `Exportación JSON de portabilidad de datos personales (ARCOP) para ${targetUser.name}`,
        organizationId: targetUser.organizationId,
        targetType: 'usuario',
        targetId: targetUser.id,
        targetLabel: targetUser.name,
      },
      currentUser
    );
    showToast('success', `Paquete ARCOP (JSON) de ${targetUser.name} descargado y auditado.`);
  };

  const handleConfirmAnonymize = async () => {
    if (!userToAnonymize) return;
    setIsAnonymizing(true);
    try {
      await anonymizeUserPIIInRTDB(userToAnonymize, currentUser);
      soundAlert.playFeedbackBeep();
      showToast(
        'success',
        `Datos personales de ${userToAnonymize.name} anonimizados irreversiblemente (ARCOP Ley 19.628 / 21.719).`
      );
      setUserToAnonymize(null);
    } catch (err: any) {
      showToast('error', err?.message || 'No se pudo anonimizar el usuario.');
    } finally {
      setIsAnonymizing(false);
    }
  };

  const showToast = (type: 'success' | 'error', text: string) => {
    setFeedbackToast({ type, text });
    setTimeout(() => setFeedbackToast(null), 6000);
  };

  const getOrganizationName = (orgId?: string) => {
    const resolvedId = orgId || DEFAULT_ORGANIZATION_ID;
    return organizations.find((o) => o.id === resolvedId)?.name || DEFAULT_ORGANIZATION.name;
  };

  const filteredUsers = usersList.filter((u) => {
    const q = searchQuery.trim().toLowerCase();
    const visibleEmail = formatEmailForViewer(u.email, currentUser.role, isUserEmailUnlocked(u.id));
    const visibleRut = formatRutForViewer(u.rut, currentUser.role, isUserRutUnlocked(u.id));
    const matchesSearch =
      !q ||
      u.name.toLowerCase().includes(q) ||
      visibleEmail.toLowerCase().includes(q) ||
      visibleRut.toLowerCase().includes(q) ||
      (allowEmailUnmask && u.email.toLowerCase().includes(q)) ||
      (allowRutUnmask && u.rut.toLowerCase().includes(q));
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    const userOrgId = u.organizationId || DEFAULT_ORGANIZATION_ID;
    const matchesOrg = !isGlobalAdmin || orgFilter === 'all' || userOrgId === orgFilter;
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'pending' && Boolean(u.pendingActivation)) ||
      (statusFilter !== 'pending' && u.status === statusFilter);
    return matchesSearch && matchesRole && matchesOrg && matchesStatus;
  });

  const handleOrganizationSelectChange = (targetUser: UserProfile, targetOrgId: string) => {
    const currentOrgId = targetUser.organizationId || DEFAULT_ORGANIZATION_ID;
    if (currentOrgId === targetOrgId) return;
    if (!isGlobalAdmin || !onUpdateUserOrganization) {
      soundAlert.playFeedbackBeep();
      showToast('error', 'Solo SuperAdmin o Admin Corporativo MineSafe puede cambiar la organización de un usuario.');
      return;
    }
    const check = canModifyTargetUser(currentUser, targetUser, undefined, organizations);
    if (!check.allowed) {
      soundAlert.playFeedbackBeep();
      showToast('error', check.reason || 'Acción denegada.');
      return;
    }
    const targetOrg = organizations.find((o) => o.id === targetOrgId);
    if (!targetOrg) {
      showToast('error', 'Organización destino no encontrada.');
      return;
    }
    setPendingOrgChange({ user: targetUser, targetOrg });
  };

  const handleConfirmOrganizationChange = async () => {
    if (!pendingOrgChange || !onUpdateUserOrganization) return;
    const { user: targetUser, targetOrg } = pendingOrgChange;
    setIsUpdatingOrg(true);
    try {
      await onUpdateUserOrganization(targetUser.id, targetOrg.id);
      soundAlert.playFeedbackBeep();
      showToast(
        'success',
        `${targetUser.name} fue asignado a la organización "${targetOrg.name}".`
      );
      setPendingOrgChange(null);
    } catch (err: any) {
      showToast('error', err?.message || 'No se pudo asignar el usuario a la organización.');
    } finally {
      setIsUpdatingOrg(false);
    }
  };

  const handleRoleSelectChange = (targetUser: UserProfile, nextRole: UserRole) => {
    if (targetUser.role === nextRole) return;
    const check = canModifyTargetUser(currentUser, targetUser, nextRole, organizations);
    if (!check.allowed) {
      soundAlert.playFeedbackBeep();
      showToast('error', check.reason || 'Acción denegada.');
      return;
    }

    setPendingRoleChange({ user: targetUser, nextRole });
  };

  const handleConfirmRoleChange = async () => {
    if (!pendingRoleChange) return;
    const { user: targetUser, nextRole } = pendingRoleChange;
    const check = canModifyTargetUser(currentUser, targetUser, nextRole, organizations);
    if (!check.allowed) {
      soundAlert.playFeedbackBeep();
      showToast('error', check.reason || 'Acción denegada.');
      setPendingRoleChange(null);
      return;
    }

    setIsUpdatingRole(true);
    try {
      await onUpdateUserRole(targetUser.id, nextRole);
      soundAlert.playFeedbackBeep();
      showToast(
        'success',
        nextRole === 'admin_minesafe'
          ? `Permisos de Admin Corporativo MineSafe otorgados a ${targetUser.name}.`
          : nextRole === 'admin'
          ? `Permisos de Administrador otorgados a ${targetUser.name}.`
          : nextRole === 'supervisor'
          ? `Rol actualizado a Supervisor Ambiental para ${targetUser.name}.`
          : `Rol actualizado a Operador (Usuario Normal) para ${targetUser.name}.`
      );
      setPendingRoleChange(null);
    } catch (err: any) {
      showToast('error', err?.message || 'No se pudo actualizar el rol en Firebase RTDB.');
    } finally {
      setIsUpdatingRole(false);
    }
  };

  const handleStatusToggleClick = async (targetUser: UserProfile) => {
    const check = canModifyTargetUser(currentUser, targetUser, undefined, organizations);
    if (!check.allowed) {
      soundAlert.playFeedbackBeep();
      showToast('error', check.reason || 'Acción denegada.');
      return;
    }
    if (targetUser.status === 'activo') {
      setBlockReason('Desvinculación / Despido laboral');
      setUserToBlock(targetUser);
      return;
    }
    try {
      await onToggleUserStatus(targetUser.id);
      showToast('success', `Acceso desbloqueado para ${targetUser.name}.`);
    } catch (err: any) {
      showToast('error', err?.message || 'No se pudo desbloquear al usuario en Firebase RTDB.');
    }
  };

  const handleConfirmBlockUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userToBlock) return;
    setIsTogglingBlock(true);
    try {
      await onToggleUserStatus(userToBlock.id, blockReason.trim() || 'Desvinculación / Despido laboral');
      showToast(
        'success',
        `Usuario ${userToBlock.name} bloqueado de esta empresa. Si otra empresa lo contrata, podrá crear una cuenta nueva con su correo anterior.`
      );
      setUserToBlock(null);
    } catch (err: any) {
      showToast('error', err?.message || 'No se pudo bloquear al usuario en Firebase RTDB.');
    } finally {
      setIsTogglingBlock(false);
    }
  };

  const handleSendPasswordReset = async (targetUser: UserProfile) => {
    try {
      await sendPasswordResetWithFirebase(targetUser.email);
      soundAlert.playFeedbackBeep();
      const displayEmail = formatEmailForViewer(
        targetUser.email,
        currentUser.role,
        isUserEmailUnlocked(targetUser.id)
      );
      showToast('success', `Correo de restablecimiento de clave enviado a ${displayEmail}.`);
    } catch (err: any) {
      showToast('error', err?.message || 'No se pudo enviar el correo de restablecimiento.');
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    if (!newName.trim() || !newEmail.trim()) return;

    // Garantizar que nunca se cree un segundo superadmin y solo SuperAdmin pueda crear Admin MineSafe
    const safeRole: 'admin_minesafe' | 'admin' | 'operador' | 'supervisor' =
      newRole === 'admin_minesafe' && isSuperAdmin
        ? 'admin_minesafe'
        : newRole === 'admin_minesafe'
        ? 'admin'
        : newRole === 'admin'
        ? 'admin'
        : newRole === 'supervisor'
        ? 'supervisor'
        : 'operador';
    const targetOrgId =
      isGlobalAdmin || authorizedOrgs.length > 1
        ? newOrganizationId ||
          (activeOrganizationId && activeOrganizationId !== 'all'
            ? activeOrganizationId
            : currentUser.organizationId || DEFAULT_ORGANIZATION.id)
        : currentUser.organizationId || DEFAULT_ORGANIZATION_ID;

    const provisionCheck = canProvisionUserInOrganization(
      currentUser,
      targetOrgId,
      safeRole,
      organizations
    );
    if (!provisionCheck.allowed) {
      setCreateError(provisionCheck.reason || 'Permisos insuficientes para crear el usuario.');
      return;
    }

    const sameOrgConflict = findUserEmailConflictInOrg(usersList, newEmail, targetOrgId);
    if (sameOrgConflict.conflict === 'active_in_same_org') {
      setCreateError(`El correo ${newEmail.trim()} ya tiene una cuenta activa en esta empresa.`);
      return;
    }
    if (sameOrgConflict.conflict === 'blocked_in_same_org') {
      setCreateError(
        `El correo ${newEmail.trim()} está bloqueado en esta empresa. Usa el botón "Desbloquear" en la lista si deseas rehabilitarlo aquí.`
      );
      return;
    }

    let normalizedNewRut = 'No registrado';
    if (!isPlaceholderRut(newRut)) {
      const rutCheck = validateChileanRut(newRut);
      if (!rutCheck.valid) {
        setCreateError(rutCheck.error || 'El RUT ingresado no es válido según Módulo 11.');
        return;
      }
      normalizedNewRut = rutCheck.formatted!;
    }

    const policyCheck = validatePasswordPolicy(newPassword);
    if (!policyCheck.valid) {
      setCreateError(
        `La contraseña inicial no cumple la política de seguridad: ${policyCheck.errors.join(' ')}`
      );
      return;
    }

    setIsCreating(true);
    try {
      const created = await createUserAccountByAdmin({
        name: newName,
        email: newEmail,
        password: newPassword,
        role: safeRole,
        rut: normalizedNewRut,
        shift: newShift,
        assignedSector: '',
        organizationId: targetOrgId,
        sendResetEmail,
        actingUser: currentUser,
        organizations,
        existingUsersInOrg: usersList,
      });
      soundAlert.playFeedbackBeep();
      if (created.pendingActivation) {
        showToast(
          'success',
          `Perfil habilitado para ${created.name} (${created.email}). Como su correo pertenecía a otra empresa, el trabajador debe entrar a Acceso → "Nueva cuenta (correo anterior)" para activar su acceso.`
        );
      } else {
        showToast(
          'success',
          `Cuenta Firebase Auth y perfil RTDB creados para ${created.name} (${safeRole}).`
        );
      }
      setShowAddModal(false);
      setNewName('');
      setNewEmail('');
      setNewRut('');
      setNewPassword('');
      setNewRole('operador');
    } catch (err: any) {
      setCreateError(err?.message || 'Error al crear usuario en Firebase Auth.');
    } finally {
      setIsCreating(false);
    }
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'superadmin':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-300 bg-purple-950 px-2 py-0.5 rounded border border-purple-800">
            <Crown className="w-3.5 h-3.5 text-purple-400" />
            SuperAdmin Único
          </span>
        );
      case 'admin_minesafe':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-300 bg-indigo-950 px-2 py-0.5 rounded border border-indigo-700">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
            Admin MineSafe
          </span>
        );
      case 'admin':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-cyan-300 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-800">
            <Shield className="w-3.5 h-3.5 text-cyan-400" />
            Admin de Empresa
          </span>
        );
      case 'supervisor':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-300 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
            <Eye className="w-3.5 h-3.5 text-emerald-400" />
            Supervisor
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-300 bg-amber-950 px-2 py-0.5 rounded border border-amber-800">
            <HardHat className="w-3.5 h-3.5 text-amber-400" />
            Usuario Normal (Operador)
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-cyan-400" />
              Gestión de Usuarios y Roles (RBAC)
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Administración de cuentas con <span className="text-purple-400 font-semibold">1 Único SuperAdmin Protegido</span>, <span className="text-indigo-400 font-semibold">Admin Corporativo MineSafe</span>, <span className="text-cyan-400 font-semibold">Administradores</span>, <span className="text-emerald-400 font-semibold">Supervisores</span> y <span className="text-amber-400 font-semibold">Usuarios Normales</span>.
            </p>
          </div>

          {isAdminOrSuper && (
            <button
              onClick={() => {
                setCreateError(null);
                setNewOrganizationId(
                  activeOrganizationId &&
                    activeOrganizationId !== 'all' &&
                    (isGlobalAdmin || authorizedOrgs.some((o) => o.id === activeOrganizationId))
                    ? activeOrganizationId
                    : currentUser.organizationId ||
                      authorizedOrgs[0]?.id ||
                      DEFAULT_ORGANIZATION.id
                );
                setShowAddModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nuevo Usuario
            </button>
          )}
        </div>

        {/* Feedback Toast */}
        {feedbackToast && (
          <div className={`mb-4 p-3 rounded-xl border text-xs font-semibold flex items-center justify-between animate-in fade-in ${
            feedbackToast.type === 'error'
              ? 'bg-rose-950/80 border-rose-700 text-rose-200'
              : 'bg-emerald-950/80 border-emerald-700 text-emerald-200'
          }`}>
            <div className="flex items-center gap-2">
              {feedbackToast.type === 'error' ? (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
              <span>{feedbackToast.text}</span>
            </div>
            <button onClick={() => setFeedbackToast(null)} className="text-[10px] underline opacity-80 hover:opacity-100">
              Cerrar
            </button>
          </div>
        )}

        {/* Roles Permission Matrix Card */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 p-4 bg-slate-950/70 rounded-xl border border-slate-800 text-xs">
          
          <div className="p-3 bg-purple-950/20 border border-purple-900/40 rounded-lg space-y-1.5">
            <div className="flex items-center justify-between gap-1.5 text-purple-300 font-bold">
              <span className="flex items-center gap-1.5">
                <Crown className="w-4 h-4" />
                Super Administrador
              </span>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-purple-950 border border-purple-700 text-purple-200">
                1 Único
              </span>
            </div>
            <p className="text-slate-400 text-[11px]">
              Autoridad máxima única e intransferible: controla hardware 3D, Control Maestro, Entregables P031, apagado de alarmas y asignación de Admins MineSafe.
            </p>
          </div>

          <div className="p-3 bg-indigo-950/25 border border-indigo-800/50 rounded-lg space-y-1.5">
            <div className="flex items-center justify-between gap-1.5 text-indigo-300 font-bold">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                Admin MineSafe
              </span>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-950 border border-indigo-700 text-indigo-200">
                Corporativo
              </span>
            </div>
            <p className="text-slate-400 text-[11px]">
              Gestión multi-empresa de MineSafe: empresas, usuarios, cargas masivas y operación. Sin acceso a Visor 3D, Gateway 3D, Control Maestro ni Entregables P031.
            </p>
          </div>

          <div className="p-3 bg-cyan-950/20 border border-cyan-900/40 rounded-lg space-y-1.5">
            <div className="flex items-center gap-1.5 text-cyan-300 font-bold">
              <Shield className="w-4 h-4" />
              Administrador de Empresa
            </div>
            <p className="text-slate-400 text-[11px]">
              Gestión operacional: monitoreo, umbrales, arriendos y gestión de operadores de su organización. No puede modificar al SuperAdmin ni a Admin MineSafe.
            </p>
          </div>

          <div className="p-3 bg-emerald-950/20 border border-emerald-900/40 rounded-lg space-y-1.5">
            <div className="flex items-center gap-1.5 text-emerald-300 font-bold">
              <Eye className="w-4 h-4" />
              Supervisor Ambiental
            </div>
            <p className="text-slate-400 text-[11px]">
              Supervisión continua de telemetría en vivo, alertas e historial ambiental de su organización, sin permisos para editar configuraciones críticas ni gestionar usuarios.
            </p>
          </div>

          <div className="p-3 bg-amber-950/20 border border-amber-900/40 rounded-lg space-y-1.5">
            <div className="flex items-center gap-1.5 text-amber-300 font-bold">
              <HardHat className="w-4 h-4" />
              Usuario Normal / Operador
            </div>
            <p className="text-slate-400 text-[11px]">
              Acceso restringido a lectura de datos y descripciones de alertas de su empresa, sin acceso a configuración ni gestión.
            </p>
          </div>

        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/40 p-4 rounded-xl border border-slate-800">
        <div className="relative flex-1 sm:w-64 w-full">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Buscar por nombre, email o RUT..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
          {allowEmailUnmask && (
            <button
              type="button"
              onClick={() => {
                const next = !revealAllEmails;
                setRevealAllEmails(next);
                if (!next) {
                  setUnlockedEmailIds({});
                } else {
                  void logSecurityAuditEventInRTDB(
                    {
                      action: 'acceso_pii_email',
                      severity: 'warning',
                      summary: `Desbloqueo masivo de correos corporativos en vista de Usuarios (${filteredUsers.length} registros visibles)`,
                      metadata: { count: filteredUsers.length },
                    },
                    currentUser
                  );
                }
              }}
              aria-label={revealAllEmails ? 'Ocultar todos los correos' : 'Desbloquear todos los correos'}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                revealAllEmails
                  ? 'bg-cyan-950/80 border-cyan-600 text-cyan-200 hover:bg-cyan-900/70'
                  : 'bg-slate-950 border-slate-700 text-slate-300 hover:border-cyan-500 hover:text-white'
              }`}
              title="Permitido para SuperAdmin, Admin MineSafe y Administrador de Empresa (auditado)"
            >
              {revealAllEmails ? <EyeOff className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5 text-cyan-400" />}
              <span>{revealAllEmails ? 'Ocultar Correos' : 'Desbloquear Correos'}</span>
            </button>
          )}
          {allowRutUnmask && (
            <button
              type="button"
              onClick={() => {
                const next = !revealAllRuts;
                setRevealAllRuts(next);
                if (!next) {
                  setUnlockedRutIds({});
                } else {
                  void logSecurityAuditEventInRTDB(
                    {
                      action: 'acceso_pii_rut',
                      severity: 'critical',
                      summary: `Desbloqueo masivo de RUTs completos en vista de Usuarios (${filteredUsers.length} registros visibles)`,
                      metadata: { count: filteredUsers.length },
                    },
                    currentUser
                  );
                }
              }}
              aria-label={revealAllRuts ? 'Ocultar todos los RUT' : 'Desbloquear todos los RUT'}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                revealAllRuts
                  ? 'bg-purple-950/80 border-purple-600 text-purple-200 hover:bg-purple-900/70'
                  : 'bg-slate-950 border-slate-700 text-slate-300 hover:border-purple-500 hover:text-white'
              }`}
              title="Exclusivo de SuperAdmin y Admin Corporativo MineSafe (auditado)"
            >
              {revealAllRuts ? <EyeOff className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5 text-purple-400" />}
              <span>{revealAllRuts ? 'Ocultar RUTs' : 'Desbloquear RUTs'}</span>
            </button>
          )}
          {isGlobalAdmin && organizations.length > 0 && (
            <select
              value={orgFilter}
              onChange={(e) => setOrgFilter(e.target.value)}
              aria-label="Filtrar usuarios por organización"
              className="px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="all">Todas las Empresas ({organizations.length})</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          )}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="all">Todos los Roles</option>
            <option value="superadmin">SuperAdmin Único</option>
            <option value="admin_minesafe">Admin Corporativo MineSafe</option>
            <option value="admin">Solo Administradores</option>
            <option value="supervisor">Solo Supervisores</option>
            <option value="operador">Solo Usuarios Normales</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'activo' | 'inactivo' | 'pending')}
            className="px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="all">Todos los Estados</option>
            <option value="activo">Solo Activos</option>
            <option value="inactivo">Solo Bloqueados</option>
            <option value="pending">Pendiente Cuenta Nueva</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Usuario & Nombre</th>
                <th className="px-4 py-3">Email Corporativo</th>
                <th className="px-4 py-3">RUT</th>
                <th className="px-4 py-3">Rol Minero</th>
                <th className="px-4 py-3">Empresa / Organización</th>
                <th className="px-4 py-3">Turno / Sector</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredUsers.map((user) => {
                const isTargetSuperAdmin = user.role === 'superadmin';
                const isTargetMineSafeAdmin = user.role === 'admin_minesafe';
                const isCurrentSession = user.id === currentUser.id;
                const canModifyTarget = canModifyTargetUser(
                  currentUser,
                  user,
                  undefined,
                  organizations
                ).allowed;
                const userOrgId = user.organizationId || DEFAULT_ORGANIZATION_ID;
                const userOrgName = getOrganizationName(userOrgId);
                const emailUnlocked = isUserEmailUnlocked(user.id);
                const rutUnlocked = isUserRutUnlocked(user.id);
                const displayedEmail = formatEmailForViewer(user.email, currentUser.role, emailUnlocked);
                const displayedRut = formatRutForViewer(user.rut, currentUser.role, rutUnlocked);
                const hasMaskableRut = Boolean(user.rut && !isPlaceholderRut(user.rut));

                return (
                  <tr key={user.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs border ${
                          isTargetSuperAdmin
                            ? 'bg-purple-950 text-purple-300 border-purple-700'
                            : isTargetMineSafeAdmin
                            ? 'bg-indigo-950 text-indigo-300 border-indigo-700'
                            : 'bg-cyan-950 text-cyan-300 border-cyan-800'
                        }`}>
                          {user.name.charAt(0)}
                        </div>
                        <div>
                          <span className="font-semibold text-white block">{user.name}</span>
                          <span className="text-[10px] text-slate-400">{user.roleLabel}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-slate-300">
                      <div className="inline-flex items-center gap-1.5">
                        <span className={emailUnlocked ? 'text-cyan-200' : 'text-slate-300'}>
                          {displayedEmail}
                        </span>
                        {user.email && allowEmailUnmask ? (
                          <button
                            type="button"
                            onClick={() => toggleSingleEmail(user.id)}
                            aria-label={emailUnlocked ? `Ocultar correo de ${user.name}` : `Desbloquear correo de ${user.name}`}
                            title={emailUnlocked ? 'Ocultar correo' : 'Desbloquear correo completo'}
                            className={`p-1 rounded border transition-colors cursor-pointer ${
                              emailUnlocked
                                ? 'bg-cyan-950/70 border-cyan-700 text-cyan-300 hover:bg-cyan-900'
                                : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-cyan-300 hover:border-cyan-700'
                            }`}
                          >
                            {emailUnlocked ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          </button>
                        ) : user.email ? (
                          <span
                            title="Correo enmascarado — solo Administradores pueden desbloquearlo"
                            className="text-slate-500"
                          >
                            <Lock className="w-3 h-3" />
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-slate-400">
                      <div className="inline-flex items-center gap-1.5">
                        <span className={rutUnlocked ? 'text-purple-200 font-semibold' : 'text-slate-400'}>
                          {displayedRut}
                        </span>
                        {hasMaskableRut && allowRutUnmask ? (
                          <button
                            type="button"
                            onClick={() => toggleSingleRut(user.id)}
                            aria-label={rutUnlocked ? `Ocultar RUT de ${user.name}` : `Desbloquear RUT de ${user.name}`}
                            title={rutUnlocked ? 'Ocultar RUT (mostrar solo últimos 4 dígitos)' : 'Desbloquear RUT completo (SuperAdmin / Admin MineSafe)'}
                            className={`p-1 rounded border transition-colors cursor-pointer ${
                              rutUnlocked
                                ? 'bg-purple-950/70 border-purple-700 text-purple-300 hover:bg-purple-900'
                                : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-purple-300 hover:border-purple-700'
                            }`}
                          >
                            {rutUnlocked ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          </button>
                        ) : hasMaskableRut ? (
                          <span
                            title="RUT enmascarado (últimos 4 dígitos) — solo SuperAdmin o Admin MineSafe puede desbloquearlo"
                            className="text-slate-500"
                          >
                            <Lock className="w-3 h-3" />
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">{getRoleBadge(user.role)}</td>
                    <td className="px-4 py-3.5">
                      {isGlobalAdmin && canModifyTarget && onUpdateUserOrganization && organizations.length > 0 ? (
                        <div className="space-y-1 min-w-[175px]">
                          <select
                            value={
                              organizations.some((o) => o.id === userOrgId)
                                ? userOrgId
                                : organizations[0]?.id || DEFAULT_ORGANIZATION_ID
                            }
                            onChange={(e) => handleOrganizationSelectChange(user, e.target.value)}
                            aria-label={`Asignar organización a ${user.name}`}
                            className="w-full px-2 py-1 bg-slate-950 border border-indigo-800/70 rounded text-[11px] text-indigo-200 font-medium focus:border-cyan-500"
                          >
                            {organizations.map((org) => (
                              <option key={org.id} value={org.id}>
                                {org.name}
                              </option>
                            ))}
                          </select>
                          {organizations.length <= 1 && (
                            <span className="block text-[10px] text-slate-500">
                              Crea más empresas en Empresas y Carga
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-200 bg-slate-950/70 px-2 py-1 rounded border border-slate-800">
                          <Building2 className="w-3 h-3 text-cyan-400 shrink-0" />
                          <span className="truncate max-w-[160px]" title={userOrgName}>
                            {userOrgName}
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-slate-300">
                      <div>{user.shift}</div>
                      {user.assignedSector && (
                        <div className="text-[10px] text-cyan-400 font-medium">{user.assignedSector}</div>
                      )}
                      {isGlobalAdmin && onUpdateUserDevice && catalogDevices.length > 0 ? (
                        <div className="mt-1.5">
                          <select
                            value={user.assignedDeviceCode || ''}
                            onChange={async (e) => {
                              const nextDev = e.target.value || null;
                              try {
                                await onUpdateUserDevice(user.id, nextDev);
                                soundAlert.playFeedbackBeep();
                                setFeedbackToast({
                                  type: 'success',
                                  text: nextDev
                                    ? `Dispositivo "${nextDev}" asignado a ${user.name}.`
                                    : `Dispositivo desvinculado de ${user.name}.`,
                                });
                              } catch (err: any) {
                                setFeedbackToast({
                                  type: 'error',
                                  text: err?.message || 'No se pudo actualizar el dispositivo del usuario.',
                                });
                              }
                            }}
                            aria-label={`Dispositivo asignado a ${user.name}`}
                            className="w-full max-w-[185px] px-1.5 py-1 bg-slate-950 border border-purple-800/70 rounded text-[10px] font-mono text-purple-200 focus:border-cyan-500"
                          >
                            <option value="">Sin dispositivo asignado</option>
                            {catalogDevices.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.id}{d.blocked || d.enabled === false ? ' (Bloqueado)' : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : user.assignedDeviceCode ? (
                        <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-mono text-purple-300 bg-purple-950/60 border border-purple-800/70 px-1.5 py-0.5 rounded">
                          <Radio className="w-2.5 h-2.5" />
                          <span>{user.assignedDeviceCode}</span>
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="space-y-1">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          user.status === 'activo'
                            ? user.pendingActivation
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : 'bg-rose-950 text-rose-300 border border-rose-800'
                        }`}>
                          {user.status === 'activo'
                            ? user.pendingActivation
                              ? 'Pendiente cuenta nueva'
                              : 'Activo'
                            : 'Bloqueado'}
                        </span>
                        {user.status === 'inactivo' && user.blockedReason && (
                          <div className="text-[10px] text-rose-300/80 max-w-[180px] truncate" title={user.blockedReason}>
                            {user.blockedReason}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      {isTargetSuperAdmin ? (
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-purple-950/70 border border-purple-700/70 text-purple-300 text-[11px] font-semibold"
                          title="El único SuperAdministrador está protegido; ningún Admin puede quitarle permisos ni desactivarlo."
                        >
                          <Lock className="w-3 h-3 text-purple-400" />
                          <span>{isCurrentSession ? 'Sesión actual (Protegida)' : 'SuperAdmin Protegido'}</span>
                        </span>
                      ) : isTargetMineSafeAdmin && !isSuperAdmin ? (
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-950/70 border border-indigo-700/70 text-indigo-300 text-[11px] font-semibold"
                          title="Solo el SuperAdministrador puede modificar o bloquear cuentas Admin Corporativo MineSafe."
                        >
                          <Lock className="w-3 h-3 text-indigo-400" />
                          <span>{isCurrentSession ? 'Sesión actual (Protegida)' : 'Admin MineSafe Protegido'}</span>
                        </span>
                      ) : canModifyTarget ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={user.role}
                            onChange={(e) => handleRoleSelectChange(user, e.target.value as UserRole)}
                            aria-label={`Cambiar rol de ${user.name}`}
                            className="px-2 py-1 bg-slate-950 border border-slate-700 rounded text-[11px] text-cyan-200 font-medium focus:border-cyan-500"
                          >
                            {isSuperAdmin && (
                              <option value="admin_minesafe">Admin MineSafe (Corporativo)</option>
                            )}
                            <option value="admin">Administrador de Empresa</option>
                            <option value="supervisor">Supervisor</option>
                            <option value="operador">Operador (Normal)</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => handleStatusToggleClick(user)}
                            className={`px-2 py-0.5 rounded border text-[10px] font-semibold transition-colors ${
                              user.status === 'activo'
                                ? 'bg-rose-950/70 hover:bg-rose-900 text-rose-200 border-rose-800'
                                : 'bg-emerald-950/70 hover:bg-emerald-900 text-emerald-200 border-emerald-800'
                            }`}
                          >
                            {user.status === 'activo' ? 'Bloquear' : 'Desbloquear'}
                          </button>
                          {user.email && !user.anonymizedAt && (
                            <button
                              type="button"
                              onClick={() => handleSendPasswordReset(user)}
                              title="Enviar correo oficial de restablecimiento de contraseña vía Firebase Auth"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-[10px] font-semibold"
                            >
                              <Mail className="w-3 h-3" />
                              Reset Clave
                            </button>
                          )}
                          {canExportUserARCOPData(currentUser, user, organizations).allowed && (
                            <button
                              type="button"
                              onClick={() => handleExportARCOP(user)}
                              title="Exportar datos personales en JSON (Derecho de Acceso y Portabilidad ARCOP)"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-950/70 hover:bg-sky-900 text-sky-300 border border-sky-800 text-[10px] font-semibold"
                            >
                              <Download className="w-3 h-3" />
                              ARCOP
                            </button>
                          )}
                          {canAnonymizeUserPII(currentUser, user).allowed && (
                            <button
                              type="button"
                              onClick={() => setUserToAnonymize(user)}
                              title="Anonimizar PII irreversiblemente (Derecho de Cancelación Ley 19.628 / 21.719)"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-950/70 hover:bg-amber-900 text-amber-300 border border-amber-800 text-[10px] font-semibold"
                            >
                              <UserX className="w-3 h-3" />
                              Anonimizar PII
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-slate-500 text-[11px]">
                            {isCurrentSession ? 'Sesión actual' : 'Solo lectura'}
                          </span>
                          {canExportUserARCOPData(currentUser, user, organizations).allowed && (
                            <button
                              type="button"
                              onClick={() => handleExportARCOP(user)}
                              title="Descargar copia de mis datos personales (ARCOP)"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-950/70 hover:bg-sky-900 text-sky-300 border border-sky-800 text-[10px] font-semibold"
                            >
                              <Download className="w-3 h-3" />
                              Mis Datos ARCOP
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: NUEVO USUARIO */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-cyan-400" />
                Registrar Nuevo Usuario en MineSafe
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 block mb-1">Nombre Completo</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Claudia Valdés M."
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1">Email Corporativo</label>
                <input
                  type="email"
                  required
                  placeholder="cvaldes@minesafe.cl"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-300 block mb-1">RUT</label>
                  <RutInput
                    value={newRut}
                    onChange={setNewRut}
                    allowEmpty
                    placeholder="18.321.654-K"
                  />
                </div>
                <div>
                  <label className="text-slate-300 block mb-1">Rol en Faena</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  >
                    <option value="operador">Usuario Normal (Operador)</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="admin">Administrador de Empresa</option>
                    {isSuperAdmin && (
                      <option value="admin_minesafe">Admin Corporativo MineSafe</option>
                    )}
                  </select>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-purple-950/30 border border-purple-800/40 text-[11px] text-purple-200/90 flex items-center gap-2">
                <Crown className="w-4 h-4 text-purple-400 shrink-0" />
                <span>
                  Solo existe <strong>1 SuperAdministrador</strong> en toda la plataforma y solo él puede crear o asignar el rol <strong>Admin Corporativo MineSafe</strong>.
                </span>
              </div>

              <div>
                <label className="text-slate-300 block mb-1">Turno de Faena</label>
                <input
                  type="text"
                  value={newShift}
                  onChange={(e) => setNewShift(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                />
              </div>

              {organizations.length > 0 && (
                <div>
                  <label className="text-slate-300 block mb-1">Organización / Empresa</label>
                  {isGlobalAdmin || authorizedOrgs.length > 1 ? (
                    <select
                      value={newOrganizationId}
                      onChange={(e) => setNewOrganizationId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                    >
                      {(authorizedOrgs.length > 0 ? authorizedOrgs : organizations).map((org) => (
                        <option key={org.id} value={org.id}>
                          {org.name} ({org.rut || org.id})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="w-full px-3 py-2 bg-slate-950/70 border border-slate-800 rounded-lg text-slate-300 font-medium">
                      {organizations.find(
                        (org) => org.id === (currentUser.organizationId || DEFAULT_ORGANIZATION_ID)
                      )?.name || DEFAULT_ORGANIZATION.name}{' '}
                      <span className="text-[10px] text-slate-500">(Organización asignada)</span>
                    </div>
                  )}
                </div>
              )}

              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2.5">
                <div className="flex items-center gap-2 text-slate-200 font-semibold">
                  <Lock className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span>Credenciales Reales en Firebase Authentication (Obligatorio)</span>
                </div>

                <div className="space-y-2 pt-0.5">
                  <div>
                    <label className="text-slate-300 block mb-1">Contraseña Inicial Segura *</label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      placeholder="Mín. 8 chars, mayúscula, minúscula y número"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                    />
                  </div>
                  {(() => {
                    const check = validatePasswordPolicy(newPassword);
                    const items = [
                      { label: 'Mín. 8 caracteres', ok: check.checks.minLength },
                      { label: 'Mayúscula', ok: check.checks.hasUppercase },
                      { label: 'Minúscula', ok: check.checks.hasLowercase },
                      { label: 'Número', ok: check.checks.hasNumber },
                    ];
                    return (
                      <div className="grid grid-cols-2 gap-1 pt-0.5">
                        {items.map((item) => (
                          <span
                            key={item.label}
                            className={`text-[10px] flex items-center gap-1 ${
                              item.ok ? 'text-emerald-400' : 'text-slate-500'
                            }`}
                          >
                            <span>{item.ok ? '✓' : '○'}</span>
                            <span>{item.label}</span>
                          </span>
                        ))}
                      </div>
                    );
                  })()}
                  <label className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-400 pt-1">
                    <input
                      type="checkbox"
                      checked={sendResetEmail}
                      onChange={(e) => setSendResetEmail(e.target.checked)}
                      className="rounded border-slate-600 bg-slate-900 text-cyan-500"
                    />
                    <span>Enviar correo automático de activación / cambio de clave</span>
                  </label>
                </div>
              </div>

              {createError && (
                <div className="p-2.5 rounded-lg bg-rose-950/80 border border-rose-700 text-rose-200 text-[11px]">
                  {createError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  disabled={isCreating}
                  className="px-4 py-2 text-slate-300 bg-slate-800 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-4 py-2 text-white bg-cyan-600 hover:bg-cyan-500 rounded-lg font-semibold disabled:opacity-50"
                >
                  {isCreating ? 'Creando en Firebase...' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: BLOQUEAR USUARIO POR DESVINCULACIÓN */}
      {userToBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-rose-800/70 rounded-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Lock className="w-4 h-4 text-rose-400" />
                Bloquear acceso en esta empresa
              </h3>
              <button
                type="button"
                onClick={() => setUserToBlock(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmBlockUser} className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-900/60 text-rose-200 space-y-1">
                <p className="font-semibold">
                  {userToBlock.name} ({formatEmailForViewer(userToBlock.email, currentUser.role, isUserEmailUnlocked(userToBlock.id))})
                </p>
                <p className="text-[11px] text-rose-200/80">
                  Su sesión será revocada de inmediato y no podrá volver a entrar a esta empresa. Si otra empresa distinta lo contrata, podrá crear una cuenta nueva ocupando este mismo correo.
                </p>
              </div>

              <div>
                <label className="text-slate-300 block mb-1">Motivo del bloqueo</label>
                <select
                  value={
                    [
                      'Desvinculación / Despido laboral',
                      'Término de contrato',
                      'Renuncia voluntaria',
                      'Bloqueo preventivo de seguridad',
                    ].includes(blockReason)
                      ? blockReason
                      : '__custom__'
                  }
                  onChange={(e) => {
                    if (e.target.value !== '__custom__') {
                      setBlockReason(e.target.value);
                    } else {
                      setBlockReason('');
                    }
                  }}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white mb-2"
                >
                  <option value="Desvinculación / Despido laboral">Desvinculación / Despido laboral</option>
                  <option value="Término de contrato">Término de contrato</option>
                  <option value="Renuncia voluntaria">Renuncia voluntaria</option>
                  <option value="Bloqueo preventivo de seguridad">Bloqueo preventivo de seguridad</option>
                  <option value="__custom__">Otro motivo...</option>
                </select>
                <input
                  type="text"
                  required
                  placeholder="Describe el motivo de bloqueo..."
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setUserToBlock(null)}
                  disabled={isTogglingBlock}
                  className="px-4 py-2 text-slate-300 bg-slate-800 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isTogglingBlock}
                  className="px-4 py-2 text-white bg-rose-600 hover:bg-rose-500 rounded-lg font-semibold disabled:opacity-50"
                >
                  {isTogglingBlock ? 'Bloqueando...' : 'Confirmar Bloqueo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAR CAMBIO DE ROL */}
      {pendingRoleChange && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-role-change-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
        >
          <div className="bg-slate-900 border border-amber-700/70 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in fade-in">
            <div className="flex items-center justify-between">
              <h3
                id="confirm-role-change-title"
                className="text-base font-bold text-white flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 text-amber-400" />
                Confirmar cambio de rol
              </h3>
              <button
                type="button"
                disabled={isUpdatingRole}
                onClick={() => setPendingRoleChange(null)}
                className="text-slate-400 hover:text-white disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-200 leading-relaxed">
                ¿Estás seguro de que deseas cambiar el rol de{' '}
                <span className="font-bold text-white">{pendingRoleChange.user.name}</span>?
              </p>

              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                <div className="text-[11px] text-slate-400 font-mono truncate">
                  {formatEmailForViewer(pendingRoleChange.user.email, currentUser.role, isUserEmailUnlocked(pendingRoleChange.user.id))}
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {getRoleBadge(pendingRoleChange.user.role)}
                  <ArrowRight className="w-4 h-4 text-amber-400 shrink-0" />
                  {getRoleBadge(pendingRoleChange.nextRole)}
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-800/60 text-amber-200/90 text-[11px]">
                {pendingRoleChange.nextRole === 'admin_minesafe'
                  ? 'Este usuario obtendrá acceso administrativo corporativo multi-empresa en MineSafe.'
                  : pendingRoleChange.nextRole === 'admin'
                  ? 'Este usuario podrá administrar datos, usuarios y cuadrillas dentro de su empresa.'
                  : pendingRoleChange.nextRole === 'supervisor'
                  ? 'Este usuario tendrá acceso de supervisión ambiental sin permisos de administración.'
                  : 'Este usuario quedará restringido a Operador (solo lectura de alertas de su empresa).'}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800 text-xs">
              <button
                type="button"
                disabled={isUpdatingRole}
                onClick={() => setPendingRoleChange(null)}
                className="px-4 py-2 text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isUpdatingRole}
                onClick={handleConfirmRoleChange}
                className="px-4 py-2 text-white bg-amber-600 hover:bg-amber-500 rounded-lg font-semibold disabled:opacity-50"
              >
                {isUpdatingRole ? 'Guardando cambio...' : 'Sí, cambiar rol'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAR ASIGNACIÓN DE ORGANIZACIÓN */}
      {pendingOrgChange && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-org-change-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
        >
          <div className="bg-slate-900 border border-indigo-700/70 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in fade-in">
            <div className="flex items-center justify-between">
              <h3
                id="confirm-org-change-title"
                className="text-base font-bold text-white flex items-center gap-2"
              >
                <Building2 className="w-4 h-4 text-indigo-400" />
                Confirmar asignación a empresa
              </h3>
              <button
                type="button"
                disabled={isUpdatingOrg}
                onClick={() => setPendingOrgChange(null)}
                className="text-slate-400 hover:text-white disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-200 leading-relaxed">
                ¿Deseas asignar al usuario{' '}
                <span className="font-bold text-white">{pendingOrgChange.user.name}</span> a la organización{' '}
                <span className="font-bold text-indigo-300">{pendingOrgChange.targetOrg.name}</span>?
              </p>

              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                <div className="text-[11px] text-slate-400 font-mono truncate">
                  {formatEmailForViewer(pendingOrgChange.user.email, currentUser.role, isUserEmailUnlocked(pendingOrgChange.user.id))}
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 text-[11px] font-semibold">
                    <Building2 className="w-3 h-3 text-slate-400" />
                    {getOrganizationName(pendingOrgChange.user.organizationId)}
                  </span>
                  <ArrowRight className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-950 border border-indigo-700 text-indigo-200 text-[11px] font-bold">
                    <Building2 className="w-3 h-3 text-indigo-400" />
                    {pendingOrgChange.targetOrg.name}
                  </span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-indigo-950/40 border border-indigo-800/60 text-indigo-200/90 text-[11px]">
                Al cambiar de organización se desvincularán automáticamente faenas, cuadrillas o dispositivos de la empresa anterior para mantener el aislamiento de datos.
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800 text-xs">
              <button
                type="button"
                disabled={isUpdatingOrg}
                onClick={() => setPendingOrgChange(null)}
                className="px-4 py-2 text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isUpdatingOrg}
                onClick={handleConfirmOrganizationChange}
                className="px-4 py-2 text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg font-semibold disabled:opacity-50"
              >
                {isUpdatingOrg ? 'Asignando...' : 'Sí, asignar a empresa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAR ANONIMIZACIÓN ARCOP DE PII */}
      {userToAnonymize && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-anonymize-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm"
        >
          <div className="bg-slate-900 border border-amber-700/70 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3
                id="confirm-anonymize-title"
                className="text-base font-bold text-white flex items-center gap-2"
              >
                <UserX className="w-4 h-4 text-amber-400" />
                Confirmar Anonimización ARCOP
              </h3>
              <button
                type="button"
                disabled={isAnonymizing}
                onClick={() => setUserToAnonymize(null)}
                className="text-slate-400 hover:text-white disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
              <p>
                Esta acción cumple con el <strong>derecho de cancelación / supresión (Ley 19.628 y Nueva Ley 21.719)</strong>{' '}
                sobre la cuenta de <strong className="text-white">{userToAnonymize.name}</strong>.
              </p>
              <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-200 text-[11px] space-y-1">
                <p><strong>Acción irreversible:</strong></p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>Se reemplazarán nombre, correo y RUT por identificadores anonimizados.</li>
                  <li>La cuenta quedará permanentemente bloqueada/inactiva.</li>
                  <li>Se conserva la integridad histórica de bitácoras mineras (DS 132) y se registra el evento en Auditoría.</li>
                </ul>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800 text-xs">
              <button
                type="button"
                disabled={isAnonymizing}
                onClick={() => setUserToAnonymize(null)}
                className="px-4 py-2 text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isAnonymizing}
                onClick={handleConfirmAnonymize}
                className="px-4 py-2 text-white bg-amber-600 hover:bg-amber-500 rounded-lg font-semibold disabled:opacity-50"
              >
                {isAnonymizing ? 'Anonimizando...' : 'Sí, anonimizar PII'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
