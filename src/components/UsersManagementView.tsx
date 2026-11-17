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
  ArrowRight
} from 'lucide-react';
import { Organization, UserProfile, UserRole } from '../types';
import { soundAlert } from '../services/audioAlert';
import {
  createUserAccountByAdmin,
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

interface UsersManagementViewProps {
  currentUser: UserProfile;
  usersList: UserProfile[];
  organizations?: Organization[];
  activeOrganizationId?: string;
  onAddUser: (newUser: UserProfile) => Promise<void> | void;
  onUpdateUserRole: (userId: string, newRole: UserRole) => Promise<void> | void;
  onToggleUserStatus: (userId: string, reason?: string) => Promise<void> | void;
}

export const UsersManagementView: React.FC<UsersManagementViewProps> = ({
  currentUser,
  usersList,
  organizations = [],
  activeOrganizationId,
  onAddUser,
  onUpdateUserRole,
  onToggleUserStatus,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
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
  const [feedbackToast, setFeedbackToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // New user form state
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRut, setNewRut] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('operador');
  const [newShift, setNewShift] = useState('Turno Mañana (07:00 - 15:30)');
  const [createRealAuth, setCreateRealAuth] = useState(true);
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
  const authorizedOrgIds = getAuthorizedOrganizationIds(currentUser, organizations);
  const authorizedOrgs = isGlobalAdmin
    ? organizations
    : organizations.filter((o) => authorizedOrgIds.includes(o.id));

  const showToast = (type: 'success' | 'error', text: string) => {
    setFeedbackToast({ type, text });
    setTimeout(() => setFeedbackToast(null), 6000);
  };

  const filteredUsers = usersList.filter((u) => {
    const matchesSearch = 
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.rut.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'pending' && Boolean(u.pendingActivation)) ||
      (statusFilter !== 'pending' && u.status === statusFilter);
    return matchesSearch && matchesRole && matchesStatus;
  });

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
          : nextRole === 'monotoriador'
          ? `Rol actualizado a Monotoriador Ambiental para ${targetUser.name}.`
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
      showToast('success', `Correo de restablecimiento de clave enviado a ${targetUser.email}.`);
    } catch (err: any) {
      showToast('error', err?.message || 'No se pudo enviar el correo de restablecimiento.');
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    if (!newName.trim() || !newEmail.trim()) return;

    // Garantizar que nunca se cree un segundo superadmin y solo SuperAdmin pueda crear Admin MineSafe
    const safeRole: 'admin_minesafe' | 'admin' | 'operador' | 'monotoriador' =
      newRole === 'admin_minesafe' && isSuperAdmin
        ? 'admin_minesafe'
        : newRole === 'admin_minesafe'
        ? 'admin'
        : newRole === 'admin'
        ? 'admin'
        : newRole === 'monotoriador'
        ? 'monotoriador'
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

    if (createRealAuth) {
      if (newPassword.length < 6) {
        setCreateError('La contraseña inicial debe tener al menos 6 caracteres.');
        return;
      }
      setIsCreating(true);
      try {
        const created = await createUserAccountByAdmin({
          name: newName,
          email: newEmail,
          password: newPassword,
          role: safeRole,
          rut: newRut,
          shift: newShift,
          assignedSector: 'Faena Minera Central',
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
            `Perfil habilitado para ${created.name} (${created.email}). Como su correo pertenecía a otra empresa, el trabajador debe entrar a Acceso → "Nueva cuenta (correo anterior)" para crear su nueva cuenta con ese correo.`
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
      return;
    }

    const roleLabels: Record<UserRole, string> = {
      superadmin: 'Super Administrador de Seguridad Minera',
      admin_minesafe: 'Admin Corporativo MineSafe',
      admin: 'Administrador / Prevencionista Sernageomin',
      monotoriador: 'Monotoriador Ambiental',
      operador: 'Usuario Normal / Operador de Faena',
    };

    const created: UserProfile = {
      id: `usr-${Date.now()}`,
      organizationId: targetOrgId,
      name: newName.trim(),
      email: newEmail.trim().toLowerCase(),
      role: safeRole,
      roleLabel: roleLabels[safeRole],
      rut: newRut.trim() || 'No registrado',
      shift: newShift,
      status: 'activo',
      pendingActivation: true,
      lastLogin: 'Pendiente crear nueva cuenta (/acceso)',
    };

    setIsCreating(true);
    try {
      await onAddUser(created);
      soundAlert.playFeedbackBeep();
      showToast(
        'success',
        `Ficha creada para ${created.name} (${safeRole}). El trabajador puede activar su cuenta nueva en /acceso usando su correo.`
      );
      setShowAddModal(false);
      setNewName('');
      setNewEmail('');
      setNewRut('');
      setNewPassword('');
      setNewRole('operador');
    } catch (err: any) {
      setCreateError(err?.message || 'Error al registrar perfil en Firebase RTDB.');
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
            Admin / Prevencionista
          </span>
        );
      case 'monotoriador':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-300 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
            <Eye className="w-3.5 h-3.5 text-emerald-400" />
            Monotoriador
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
              Administración de cuentas con <span className="text-purple-400 font-semibold">1 Único SuperAdmin Protegido</span>, <span className="text-indigo-400 font-semibold">Admin Corporativo MineSafe</span>, <span className="text-cyan-400 font-semibold">Administradores</span>, <span className="text-emerald-400 font-semibold">Monotoriadores</span> y <span className="text-amber-400 font-semibold">Usuarios Normales</span>.
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
              Administrador / Prevencionista
            </div>
            <p className="text-slate-400 text-[11px]">
              Gestión operacional: monitoreo, umbrales, arriendos y gestión de operadores de su organización. No puede modificar al SuperAdmin ni a Admin MineSafe.
            </p>
          </div>

          <div className="p-3 bg-emerald-950/20 border border-emerald-900/40 rounded-lg space-y-1.5">
            <div className="flex items-center gap-1.5 text-emerald-300 font-bold">
              <Eye className="w-4 h-4" />
              Monotoriador Ambiental
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
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="all">Todos los Roles</option>
            <option value="superadmin">SuperAdmin Único</option>
            <option value="admin_minesafe">Admin Corporativo MineSafe</option>
            <option value="admin">Solo Administradores</option>
            <option value="monotoriador">Solo Monotoriadores</option>
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
                    <td className="px-4 py-3.5 font-mono text-slate-300">{user.email}</td>
                    <td className="px-4 py-3.5 font-mono text-slate-400">{user.rut}</td>
                    <td className="px-4 py-3.5">{getRoleBadge(user.role)}</td>
                    <td className="px-4 py-3.5 text-slate-300">
                      <div>{user.shift}</div>
                      {user.assignedSector && (
                        <div className="text-[10px] text-cyan-400 font-medium">{user.assignedSector}</div>
                      )}
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
                            <option value="admin">Admin (Prevencionista)</option>
                            <option value="monotoriador">Monotoriador</option>
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
                          {user.email && (
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
                        </div>
                      ) : (
                        <span className="text-slate-500 text-[11px]">
                          {isCurrentSession ? 'Sesión actual' : 'Solo lectura'}
                        </span>
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
                  <input
                    type="text"
                    placeholder="18.321.654-3"
                    value={newRut}
                    onChange={(e) => setNewRut(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
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
                    <option value="monotoriador">Monotoriador</option>
                    <option value="admin">Administrador (Prevencionista)</option>
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
                <label className="flex items-center gap-2 cursor-pointer text-slate-200 font-semibold">
                  <input
                    type="checkbox"
                    checked={createRealAuth}
                    onChange={(e) => setCreateRealAuth(e.target.checked)}
                    className="rounded border-slate-600 bg-slate-900 text-cyan-500"
                  />
                  <span>Crear credenciales reales en Firebase Authentication</span>
                </label>

                {createRealAuth ? (
                  <div className="space-y-2 pt-1">
                    <div>
                      <label className="text-slate-300 block mb-1">Contraseña Inicial (mín. 6 caracteres)</label>
                      <input
                        type="password"
                        required
                        minLength={6}
                        placeholder="••••••••"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                      />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-400">
                      <input
                        type="checkbox"
                        checked={sendResetEmail}
                        onChange={(e) => setSendResetEmail(e.target.checked)}
                        className="rounded border-slate-600 bg-slate-900 text-cyan-500"
                      />
                      <span>Enviar correo automático de activación / cambio de clave</span>
                    </label>
                  </div>
                ) : (
                  <p className="text-[11px] text-amber-300">
                    Modo solo perfil RTDB: el usuario requerirá alta de credenciales en Firebase Authentication por parte del administrador antes de poder iniciar sesión.
                  </p>
                )}
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
                  {userToBlock.name} ({userToBlock.email})
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
                  {pendingRoleChange.user.email}
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
                  : pendingRoleChange.nextRole === 'monotoriador'
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

    </div>
  );
};
