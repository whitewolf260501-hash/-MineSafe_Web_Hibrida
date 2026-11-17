import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  Check,
  CheckCircle2,
  Cpu,
  Download,
  Edit3,
  FileJson,
  FileSpreadsheet,
  HardHat,
  Layers,
  MapPin,
  Plus,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import {
  Organization,
  PlatformConfig,
  UserProfile,
} from '../types';
import {
  BulkImportExecutionResult,
  DEFAULT_ORGANIZATION,
  deleteOrganizationFromRTDB,
  executeBulkCompanyImport,
  saveOrganizationToRTDB,
} from '../services/firebase';
import {
  canCreateOrEditOrganization,
  canDeleteOrganization,
  getAuthorizedOrganizationIds,
  isAnyAdminRole,
  isGlobalMineSafeAdmin,
  isOrganizationOwner,
} from '../utils/accessControl';
import {
  BulkBundleParseResult,
  BulkEntityType,
  BulkParseResult,
  getBulkCsvTemplate,
  getBulkJsonBundleTemplate,
  parseBulkCompanyBundle,
  parseBulkInput,
} from '../utils/bulkCompanyImport';
import { soundAlert } from '../services/audioAlert';

interface CompanyBulkManagementViewProps {
  currentUser: UserProfile;
  organizations: Organization[];
  activeOrganizationId: string;
  platformConfig: PlatformConfig;
  onSelectOrganization: (orgId: string) => void;
  onOrganizationsChanged?: (org: Organization, deletedId?: string) => void;
  onBulkImportCompleted?: (result: BulkImportExecutionResult) => void;
}

const ENTITY_OPTIONS: Array<{
  id: BulkEntityType;
  label: string;
  shortDesc: string;
  icon: React.ReactNode;
}> = [
  {
    id: 'users',
    label: 'Usuarios / Personal',
    shortDesc: 'Operadores, Monotoriadores y Admins',
    icon: <Users className="w-4 h-4 text-cyan-400" />,
  },
  {
    id: 'sites',
    label: 'Faenas y Sectores',
    shortDesc: 'Faenas mineras y niveles operativos',
    icon: <MapPin className="w-4 h-4 text-emerald-400" />,
  },
  {
    id: 'rentals',
    label: 'Contratos de Arriendo',
    shortDesc: 'Contratos mensuales de equipos IoT',
    icon: <Cpu className="w-4 h-4 text-amber-400" />,
  },
  {
    id: 'assignments',
    label: 'Asignaciones',
    shortDesc: 'Cuadrillas y detectores asignados',
    icon: <HardHat className="w-4 h-4 text-purple-400" />,
  },
  {
    id: 'bundle',
    label: 'Paquete JSON Completo',
    shortDesc: 'Empresa + usuarios + faenas + arriendos',
    icon: <FileJson className="w-4 h-4 text-indigo-400" />,
  },
];

export const CompanyBulkManagementView: React.FC<CompanyBulkManagementViewProps> = ({
  currentUser,
  organizations,
  activeOrganizationId,
  platformConfig,
  onSelectOrganization,
  onOrganizationsChanged,
  onBulkImportCompleted,
}) => {
  const isSuperAdmin = currentUser.role === 'superadmin';
  const isGlobalAdmin = isGlobalMineSafeAdmin(currentUser.role);
  const isAdminOrSuper = isAnyAdminRole(currentUser.role);

  const authorizedOrganizations = useMemo(() => {
    if (isGlobalAdmin) return organizations;
    const allowedIds = new Set(getAuthorizedOrganizationIds(currentUser, organizations));
    return organizations.filter((o) => allowedIds.has(o.id));
  }, [isGlobalAdmin, currentUser, organizations]);

  const [section, setSection] = useState<'empresas' | 'carga_masiva'>('empresas');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSavingOrg, setIsSavingOrg] = useState(false);

  // Company create/edit form state
  const [editingOrgId, setEditingOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState('');
  const [orgRut, setOrgRut] = useState('');
  const [orgIndustry, setOrgIndustry] = useState('Minería Subterránea & Rajo');
  const [orgStatus, setOrgStatus] = useState<'activa' | 'suspendida'>('activa');

  // Bulk import state
  const defaultTargetOrg = useMemo(() => {
    if (
      activeOrganizationId &&
      activeOrganizationId !== 'all' &&
      authorizedOrganizations.some((o) => o.id === activeOrganizationId)
    ) {
      return activeOrganizationId;
    }
    return authorizedOrganizations[0]?.id || currentUser.organizationId || DEFAULT_ORGANIZATION.id;
  }, [activeOrganizationId, authorizedOrganizations, currentUser.organizationId]);

  const [bulkOrgId, setBulkOrgId] = useState<string>(defaultTargetOrg);
  const [entityType, setEntityType] = useState<BulkEntityType>('users');
  const [rawContent, setRawContent] = useState<string>('');
  const [createAuthAccounts, setCreateAuthAccounts] = useState<boolean>(false);
  const [defaultAuthPassword, setDefaultAuthPassword] = useState<string>('MineSafe2026*');
  const [sendResetEmail, setSendResetEmail] = useState<boolean>(true);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ completed: number; total: number; label: string } | null>(null);
  const [executionResult, setExecutionResult] = useState<BulkImportExecutionResult | null>(null);

  useEffect(() => {
    if (!authorizedOrganizations.some((o) => o.id === bulkOrgId)) {
      setBulkOrgId(defaultTargetOrg);
    }
  }, [authorizedOrganizations, bulkOrgId, defaultTargetOrg]);

  const showNotice = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => {
      setFeedback((prev) => (prev?.text === text ? null : prev));
    }, 6000);
  };

  if (!isAdminOrSuper) {
    return (
      <div className="p-8 text-center bg-slate-900/80 border border-rose-800/60 rounded-2xl max-w-xl mx-auto my-12 shadow-xl">
        <ShieldAlert className="w-12 h-12 text-rose-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Acceso Restringido</h2>
        <p className="text-slate-400 text-sm">
          Solo Administradores o el SuperAdministrador pueden crear empresas y realizar cargas masivas de datos.
        </p>
      </div>
    );
  }

  const selectedBulkOrg =
    authorizedOrganizations.find((o) => o.id === bulkOrgId) ||
    authorizedOrganizations[0] ||
    DEFAULT_ORGANIZATION;

  // Live parsed preview
  const singleParsePreview: BulkParseResult<any> | null = useMemo(() => {
    if (entityType === 'bundle' || !rawContent.trim()) return null;
    return parseBulkInput(entityType, rawContent, {
      organizationId: selectedBulkOrg.id,
      defaultCompanyName: selectedBulkOrg.name,
    });
  }, [entityType, rawContent, selectedBulkOrg.id, selectedBulkOrg.name]);

  const bundleParsePreview: BulkBundleParseResult | null = useMemo(() => {
    if (entityType !== 'bundle' || !rawContent.trim()) return null;
    return parseBulkCompanyBundle(rawContent, selectedBulkOrg.id);
  }, [entityType, rawContent, selectedBulkOrg.id]);

  const handleSaveOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim()) {
      showNotice('error', 'El nombre comercial de la empresa es obligatorio.');
      return;
    }

    const existing = editingOrgId ? organizations.find((o) => o.id === editingOrgId) || null : null;
    const perm = canCreateOrEditOrganization(currentUser, existing);
    if (!perm.allowed) {
      showNotice('error', perm.reason || 'No tienes permisos para modificar esta empresa.');
      return;
    }

    setIsSavingOrg(true);
    try {
      const cleanId =
        editingOrgId ||
        `org-${orgName
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')}-${Date.now().toString().slice(-4)}`;

      const saved = await saveOrganizationToRTDB(
        {
          id: cleanId,
          name: orgName.trim(),
          rut: orgRut.trim(),
          industry: orgIndustry.trim() || 'Minería Subterránea & Rajo',
          status: orgStatus,
          createdAt: existing?.createdAt || Date.now(),
          ownerId: existing?.ownerId || currentUser.id,
          ownerUid: existing?.ownerUid || currentUser.id,
          ownerEmail: existing?.ownerEmail || currentUser.email,
        },
        currentUser
      );

      onOrganizationsChanged?.(saved);
      setBulkOrgId(saved.id);
      if (!editingOrgId) {
        onSelectOrganization(saved.id);
      }

      soundAlert.playFeedbackBeep();
      showNotice(
        'success',
        editingOrgId
          ? `Empresa "${saved.name}" actualizada correctamente en Firebase RTDB.`
          : `Empresa "${saved.name}" creada y activada en tu contexto multi-empresa.`
      );
      setEditingOrgId(null);
      setOrgName('');
      setOrgRut('');
      setOrgIndustry('Minería Subterránea & Rajo');
      setOrgStatus('activa');
    } catch (err: any) {
      showNotice('error', err?.message || 'Error al guardar la empresa en Firebase RTDB.');
    } finally {
      setIsSavingOrg(false);
    }
  };

  const handleDeleteOrganization = async (org: Organization) => {
    const check = canDeleteOrganization(currentUser, org);
    if (!check.allowed) {
      showNotice('error', check.reason || 'Acción denegada.');
      return;
    }
    setIsSavingOrg(true);
    try {
      await deleteOrganizationFromRTDB(org.id, currentUser);
      onOrganizationsChanged?.(org, org.id);
      if (activeOrganizationId === org.id) {
        onSelectOrganization(currentUser.organizationId || DEFAULT_ORGANIZATION.id);
      }
      soundAlert.playFeedbackBeep();
      showNotice('success', `Empresa "${org.name}" eliminada.`);
    } catch (err: any) {
      showNotice('error', err?.message || 'No se pudo eliminar la empresa.');
    } finally {
      setIsSavingOrg(false);
    }
  };

  const handleDownloadTemplate = () => {
    const isBundle = entityType === 'bundle';
    const content = isBundle
      ? getBulkJsonBundleTemplate()
      : `\uFEFF${getBulkCsvTemplate(entityType)}`;
    const blob = new Blob([content], {
      type: isBundle ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = isBundle
      ? `plantilla_empresa_completa_minesafe.json`
      : `plantilla_${entityType}_minesafe.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    soundAlert.playFeedbackBeep();
  };

  const handleLoadSampleInEditor = () => {
    setExecutionResult(null);
    setRawContent(
      entityType === 'bundle'
        ? getBulkJsonBundleTemplate()
        : getBulkCsvTemplate(entityType)
    );
    soundAlert.playFeedbackBeep();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setExecutionResult(null);
      setRawContent(String(reader.result || ''));
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  const validImportCount = useMemo(() => {
    if (entityType === 'bundle') {
      if (!bundleParsePreview || bundleParsePreview.formatError) return 0;
      const orgCount = bundleParsePreview.organization?.valid ? 1 : 0;
      return (
        orgCount +
        bundleParsePreview.users.validRows.length +
        bundleParsePreview.sites.validRows.length +
        bundleParsePreview.rentals.validRows.length +
        bundleParsePreview.assignments.validRows.length
      );
    }
    return singleParsePreview?.validRows.length || 0;
  }, [entityType, bundleParsePreview, singleParsePreview]);

  const handleExecuteImport = async () => {
    if (validImportCount === 0) {
      showNotice('error', 'No hay registros válidos para importar.');
      return;
    }

    if (
      (entityType === 'users' ||
        (entityType === 'bundle' && (bundleParsePreview?.users.validRows.length || 0) > 0)) &&
      createAuthAccounts &&
      defaultAuthPassword.length < 6
    ) {
      showNotice(
        'error',
        'Si activas la creación en Firebase Auth, la contraseña inicial por defecto debe tener mínimo 6 caracteres.'
      );
      return;
    }

    setIsExecuting(true);
    setExecutionResult(null);
    setProgress({ completed: 0, total: validImportCount, label: 'Iniciando carga masiva...' });

    try {
      const result = await executeBulkCompanyImport({
        actingUser: currentUser,
        targetOrgId: selectedBulkOrg.id,
        organizations,
        registeredDevices: platformConfig.registeredDevices,
        organizationToCreate:
          entityType === 'bundle' && bundleParsePreview?.organization?.valid && bundleParsePreview.organization.data
            ? {
                id:
                  bundleParsePreview.organization.data.id ||
                  `org-${Date.now()}`,
                name: bundleParsePreview.organization.data.name,
                rut: bundleParsePreview.organization.data.rut,
                industry: bundleParsePreview.organization.data.industry,
                status: bundleParsePreview.organization.data.status,
              }
            : undefined,
        users:
          entityType === 'users'
            ? (singleParsePreview?.validRows.map((r) => r.data) || [])
            : entityType === 'bundle'
            ? (bundleParsePreview?.users.validRows.map((r) => r.data!) || [])
            : [],
        sites:
          entityType === 'sites'
            ? (singleParsePreview?.validRows.map((r) => r.data) || [])
            : entityType === 'bundle'
            ? (bundleParsePreview?.sites.validRows.map((r) => r.data!) || [])
            : [],
        rentals:
          entityType === 'rentals'
            ? (singleParsePreview?.validRows.map((r) => r.data) || [])
            : entityType === 'bundle'
            ? (bundleParsePreview?.rentals.validRows.map((r) => r.data!) || [])
            : [],
        assignments:
          entityType === 'assignments'
            ? (singleParsePreview?.validRows.map((r) => r.data) || [])
            : entityType === 'bundle'
            ? (bundleParsePreview?.assignments.validRows.map((r) => r.data!) || [])
            : [],
        createAuthAccounts,
        defaultAuthPassword,
        sendResetEmail,
        onProgress: (completed, total, label) => {
          setProgress({ completed, total, label });
        },
      });

      setExecutionResult(result);
      onBulkImportCompleted?.(result);
      if (result.createdOrganization) {
        onOrganizationsChanged?.(result.createdOrganization);
        setBulkOrgId(result.createdOrganization.id);
        onSelectOrganization(result.createdOrganization.id);
      }

      soundAlert.playFeedbackBeep();
      if (result.failed === 0) {
        showNotice(
          'success',
          `Carga masiva completada: ${result.succeeded} registro(s) guardados en Firebase RTDB.`
        );
      } else {
        showNotice(
          'error',
          `Carga completada con observaciones: ${result.succeeded} guardados y ${result.failed} con error.`
        );
      }
    } catch (err: any) {
      showNotice('error', err?.message || 'Error ejecutando la carga masiva en Firebase.');
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="space-y-6 pb-10">
      {/* HEADER */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950/40 border border-cyan-800/40 rounded-2xl p-5 sm:p-6 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-cyan-950 border border-cyan-600/60 flex items-center justify-center text-cyan-300 shrink-0">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  Gestión de Empresas y Carga Masiva
                </h1>
                <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-cyan-950 text-cyan-200 border border-cyan-700">
                  {isSuperAdmin
                    ? 'SuperAdmin Global'
                    : isGlobalAdmin
                    ? 'Admin Corporativo MineSafe'
                    : 'Administrador Multi-Empresa'}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 mt-1">
                Crea y administra empresas autorizadas, cambia tu contexto operativo e importa masivamente usuarios, faenas, contratos y asignaciones desde CSV o JSON.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setSection('empresas')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-colors ${
                section === 'empresas'
                  ? 'bg-cyan-600 text-white border-cyan-400 shadow-md'
                  : 'bg-slate-950/70 text-slate-300 border-slate-700 hover:text-white'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>Empresas ({authorizedOrganizations.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setSection('carga_masiva')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-colors ${
                section === 'carga_masiva'
                  ? 'bg-emerald-600 text-white border-emerald-400 shadow-md'
                  : 'bg-slate-950/70 text-slate-300 border-slate-700 hover:text-white'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Carga Masiva CSV / JSON</span>
            </button>
          </div>
        </div>
      </div>

      {/* FEEDBACK BANNER */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between ${
            feedback.type === 'error'
              ? 'bg-rose-950/80 border-rose-700 text-rose-200'
              : 'bg-emerald-950/80 border-emerald-700 text-emerald-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-[11px] underline opacity-80 hover:opacity-100"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SECCIÓN 1: CREACIÓN Y LISTADO DE EMPRESAS                            */}
      {/* ==================================================================== */}
      {section === 'empresas' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-slate-900/80 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="pb-3 border-b border-slate-800 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Plus className="w-4 h-4 text-cyan-400" />
                  {editingOrgId ? 'Editar Empresa' : 'Crear Nueva Empresa'}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Registra una empresa mandante o división en Firebase RTDB manteniendo el aislamiento multiempresa.
                </p>
              </div>
              {editingOrgId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingOrgId(null);
                    setOrgName('');
                    setOrgRut('');
                    setOrgIndustry('Minería Subterránea & Rajo');
                    setOrgStatus('activa');
                  }}
                  className="text-[11px] text-slate-400 hover:text-white underline"
                >
                  Cancelar edición
                </button>
              )}
            </div>

            <form onSubmit={handleSaveOrganization} className="space-y-3.5 text-xs">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">
                  Nombre Comercial / Razón Social
                </label>
                <input
                  type="text"
                  required
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Ej: Minera Cordillera Norte SpA"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">RUT Empresa</label>
                  <input
                    type="text"
                    value={orgRut}
                    onChange={(e) => setOrgRut(e.target.value)}
                    placeholder="76.543.210-8"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Estado Operativo</label>
                  <select
                    value={orgStatus}
                    onChange={(e) => setOrgStatus(e.target.value as 'activa' | 'suspendida')}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                  >
                    <option value="activa">Activa</option>
                    <option value="suspendida">Suspendida</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Rubro / Operación</label>
                <input
                  type="text"
                  value={orgIndustry}
                  onChange={(e) => setOrgIndustry(e.target.value)}
                  placeholder="Minería Subterránea & Rajo"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                />
              </div>

              <button
                type="submit"
                disabled={isSavingOrg}
                className="w-full py-2.5 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                {editingOrgId ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                <span>
                  {isSavingOrg
                    ? 'Guardando en Firebase...'
                    : editingOrgId
                    ? 'Guardar Cambios'
                    : 'Crear Empresa en Firebase'}
                </span>
              </button>
            </form>
          </div>

          <div className="lg:col-span-7 bg-slate-900/80 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="pb-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-cyan-400" />
                  Empresas Autorizadas ({authorizedOrganizations.length})
                </h3>
                <p className="text-[11px] text-slate-400">
                  Puedes activar el contexto de tu empresa principal o de cualquier empresa creada por ti, y cargar sus datos masivamente.
                </p>
              </div>
              {isGlobalAdmin && (
                <button
                  type="button"
                  onClick={() => onSelectOrganization('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                    activeOrganizationId === 'all'
                      ? 'bg-cyan-600 text-white border-cyan-400'
                      : 'bg-slate-950 text-slate-300 border-slate-700 hover:border-cyan-500'
                  }`}
                >
                  Ver Todas
                </button>
              )}
            </div>

            <div className="space-y-3">
              {authorizedOrganizations.map((org) => {
                const isSelected = activeOrganizationId === org.id;
                const isDefaultOrg = org.id === DEFAULT_ORGANIZATION.id;
                const isOwnedByActor = !isGlobalAdmin && isOrganizationOwner(currentUser, org);
                const canEdit = canCreateOrEditOrganization(currentUser, org).allowed;
                const canDel = canDeleteOrganization(currentUser, org).allowed;

                return (
                  <div
                    key={org.id}
                    className={`p-4 rounded-xl border transition-colors ${
                      isSelected
                        ? 'bg-cyan-950/40 border-cyan-500'
                        : 'bg-slate-950/70 border-slate-800'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-sm text-white">{org.name}</span>
                          {isDefaultOrg && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-700">
                              Principal
                            </span>
                          )}
                          {isOwnedByActor && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-700">
                              Creada por ti
                            </span>
                          )}
                          <span
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                              org.status === 'activa'
                                ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                                : 'bg-rose-950 text-rose-300 border-rose-700'
                            }`}
                          >
                            {org.status}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono mt-1 flex flex-wrap gap-3">
                          <span>ID: {org.id}</span>
                          {org.rut && <span>RUT: {org.rut}</span>}
                          {org.industry && <span>Rubro: {org.industry}</span>}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => onSelectOrganization(org.id)}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border ${
                            isSelected
                              ? 'bg-cyan-600 text-white border-cyan-400'
                              : 'bg-slate-900 hover:bg-slate-800 text-cyan-300 border-slate-700'
                          }`}
                        >
                          {isSelected ? 'Contexto Activo' : 'Activar Contexto'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setBulkOrgId(org.id);
                            setSection('carga_masiva');
                          }}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-950/70 hover:bg-emerald-900 text-emerald-200 border border-emerald-700"
                        >
                          Cargar Datos
                        </button>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingOrgId(org.id);
                              setOrgName(org.name);
                              setOrgRut(org.rut || '');
                              setOrgIndustry(org.industry || 'Minería');
                              setOrgStatus(org.status || 'activa');
                            }}
                            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700"
                            title="Editar empresa"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canDel && (
                          <button
                            type="button"
                            onClick={() => handleDeleteOrganization(org)}
                            disabled={isSavingOrg}
                            className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800 disabled:opacity-50"
                            title="Eliminar empresa"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SECCIÓN 2: CARGA MASIVA DE DATOS DE EMPRESA                          */}
      {/* ==================================================================== */}
      {section === 'carga_masiva' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Panel izquierdo: configuración de carga */}
            <div className="lg:col-span-5 bg-slate-900/80 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="pb-3 border-b border-slate-800">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                  Configurar Carga Masiva
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Selecciona la empresa destino, descarga la plantilla CSV o JSON, y revisa la vista previa antes de guardar en Firebase.
                </p>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">
                    1. Empresa Destino
                  </label>
                  <select
                    value={bulkOrgId}
                    onChange={(e) => {
                      setBulkOrgId(e.target.value);
                      setExecutionResult(null);
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                  >
                    {authorizedOrganizations.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name} ({org.rut || org.id})
                      </option>
                    ))}
                  </select>
                  {entityType === 'bundle' && (
                    <p className="text-[11px] text-indigo-300 mt-1">
                      Nota: Si el JSON incluye el bloque <span className="font-mono">"organization"</span>, se creará esa nueva empresa y todos los registros se asociarán a ella automáticamente.
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-slate-300 font-semibold block mb-1.5">
                    2. Tipo de Datos a Importar
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    {ENTITY_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setEntityType(opt.id);
                          setRawContent('');
                          setExecutionResult(null);
                        }}
                        className={`flex items-center justify-between p-2.5 rounded-xl border text-left transition-colors ${
                          entityType === opt.id
                            ? 'bg-cyan-950/50 border-cyan-500 text-white'
                            : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          {opt.icon}
                          <div>
                            <div className="font-bold text-xs">{opt.label}</div>
                            <div className="text-[10px] text-slate-400">{opt.shortDesc}</div>
                          </div>
                        </div>
                        {entityType === opt.id && <Check className="w-4 h-4 text-cyan-400" />}
                      </button>
                    ))}
                  </div>
                </div>

                {(entityType === 'users' || entityType === 'bundle') && (
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2.5">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-200 font-semibold">
                      <input
                        type="checkbox"
                        checked={createAuthAccounts}
                        onChange={(e) => setCreateAuthAccounts(e.target.checked)}
                        className="rounded border-slate-600 bg-slate-900 text-cyan-500"
                      />
                      <span>Crear credenciales reales en Firebase Auth</span>
                    </label>
                    {createAuthAccounts ? (
                      <div className="space-y-2 pl-1">
                        <div>
                          <label className="text-slate-400 block mb-1 text-[11px]">
                            Contraseña inicial por defecto (si falta columna password)
                          </label>
                          <input
                            type="text"
                            value={defaultAuthPassword}
                            onChange={(e) => setDefaultAuthPassword(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-white font-mono"
                          />
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-400">
                          <input
                            type="checkbox"
                            checked={sendResetEmail}
                            onChange={(e) => setSendResetEmail(e.target.checked)}
                            className="rounded border-slate-600 bg-slate-900 text-cyan-500"
                          />
                          <span>Enviar correo de activación / cambio de clave</span>
                        </label>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400">
                        Modo rápido RTDB: pre-registra los perfiles autorizados en <span className="font-mono">/usuarios</span> (nunca permite rol SuperAdmin).
                      </p>
                    )}
                  </div>
                )}

                <div className="pt-1 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadTemplate}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-200 border border-slate-700 font-semibold"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Descargar Plantilla</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleLoadSampleInEditor}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-200 border border-slate-700 font-semibold"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Cargar Ejemplo</span>
                  </button>
                </div>

                <div>
                  <label className="flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-xl border border-dashed border-cyan-700/70 bg-cyan-950/20 hover:bg-cyan-950/40 text-cyan-200 font-bold cursor-pointer transition-colors">
                    <Upload className="w-4 h-4" />
                    <span>
                      Subir Archivo ({entityType === 'bundle' ? '.json' : '.csv / .txt / .json'})
                    </span>
                    <input
                      type="file"
                      accept={entityType === 'bundle' ? '.json' : '.csv,.txt,.json'}
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Panel derecho: Editor + Previsualización */}
            <div className="lg:col-span-7 bg-slate-900/80 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800">
                <div>
                  <h3 className="text-base font-bold text-white">
                    3. Editor y Vista Previa de Validación
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Soporta CSV con coma (,) o punto y coma (;) desde Excel, o arreglos/paquetes JSON.
                  </p>
                </div>
                {rawContent && (
                  <button
                    type="button"
                    onClick={() => {
                      setRawContent('');
                      setExecutionResult(null);
                    }}
                    className="text-[11px] text-slate-400 hover:text-white underline"
                  >
                    Limpiar editor
                  </button>
                )}
              </div>

              <textarea
                rows={7}
                value={rawContent}
                onChange={(e) => {
                  setRawContent(e.target.value);
                  setExecutionResult(null);
                }}
                placeholder={
                  entityType === 'bundle'
                    ? 'Pega aquí un paquete JSON con { "organization": {...}, "users": [...], "sites": [...], "rentals": [...], "assignments": [...] } o pulsa Cargar Ejemplo...'
                    : 'Pega aquí filas CSV (con encabezados) o un arreglo JSON [...], o sube un archivo desde tu equipo...'
                }
                className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
              />

              {/* Errores de formato */}
              {(singleParsePreview?.formatError || bundleParsePreview?.formatError) && (
                <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-700 text-rose-200 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{singleParsePreview?.formatError || bundleParsePreview?.formatError}</span>
                </div>
              )}

              {/* Vista previa CSV / JSON simple */}
              {singleParsePreview && !singleParsePreview.formatError && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 font-semibold">
                      Total: {singleParsePreview.totalRows}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-950/70 border border-emerald-700 text-emerald-200 font-semibold">
                      Válidos: {singleParsePreview.validRows.length}
                    </span>
                    {singleParsePreview.invalidRows.length > 0 && (
                      <span className="px-2.5 py-1 rounded-lg bg-rose-950/70 border border-rose-700 text-rose-200 font-semibold">
                        Con errores (se omiten): {singleParsePreview.invalidRows.length}
                      </span>
                    )}
                  </div>

                  <div className="max-h-60 overflow-y-auto border border-slate-800 rounded-xl bg-slate-950/80 divide-y divide-slate-800/80 text-xs">
                    {singleParsePreview.allRows.map((row, idx) => (
                      <div key={idx} className="p-2.5 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-200 truncate">
                            Fila {row.rowNumber}: {row.rawLabel}
                          </div>
                          {!row.valid && (
                            <div className="text-[11px] text-rose-300 mt-0.5">
                              {row.errors.join(' · ')}
                            </div>
                          )}
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                            row.valid
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : 'bg-rose-950 text-rose-300 border border-rose-800'
                          }`}
                        >
                          {row.valid ? 'OK' : 'Error'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Vista previa Paquete JSON Completo */}
              {bundleParsePreview && !bundleParsePreview.formatError && (
                <div className="space-y-3 text-xs">
                  {bundleParsePreview.organization && (
                    <div
                      className={`p-3 rounded-xl border ${
                        bundleParsePreview.organization.valid
                          ? 'bg-cyan-950/30 border-cyan-800 text-cyan-200'
                          : 'bg-rose-950/60 border-rose-700 text-rose-200'
                      }`}
                    >
                      {bundleParsePreview.organization.valid
                        ? `Nueva empresa a crear: ${bundleParsePreview.organization.data?.name} (${bundleParsePreview.organization.data?.rut || 'sin RUT'})`
                        : `Empresa inválida: ${bundleParsePreview.organization.errors.join(', ')}`}
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { label: 'Usuarios', res: bundleParsePreview.users },
                      { label: 'Faenas', res: bundleParsePreview.sites },
                      { label: 'Contratos', res: bundleParsePreview.rentals },
                      { label: 'Asignaciones', res: bundleParsePreview.assignments },
                    ].map((blk) => (
                      <div
                        key={blk.label}
                        className="p-2.5 rounded-xl bg-slate-950 border border-slate-800"
                      >
                        <div className="text-[11px] text-slate-400">{blk.label}</div>
                        <div className="text-sm font-bold text-white mt-0.5">
                          {blk.res.validRows.length}{' '}
                          <span className="text-[11px] font-normal text-slate-400">
                            / {blk.res.totalRows} válidos
                          </span>
                        </div>
                        {blk.res.invalidRows.length > 0 && (
                          <div className="text-[10px] text-rose-400 mt-0.5">
                            {blk.res.invalidRows.length} con error
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Progreso de ejecución */}
              {isExecuting && progress && (
                <div className="p-3.5 rounded-xl bg-slate-950 border border-cyan-800/70 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-cyan-200 font-semibold">
                    <span>{progress.label}</span>
                    <span>
                      {progress.completed} / {progress.total}
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-cyan-500 transition-all duration-150"
                      style={{
                        width: `${progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Resultado de ejecución */}
              {executionResult && (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5 text-xs">
                  <div className="font-bold text-white flex items-center justify-between">
                    <span>Resultado de la Carga Masiva</span>
                    <span className="text-emerald-300">
                      {executionResult.succeeded} guardados · {executionResult.failed} con error
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px] text-slate-300">
                    {executionResult.createdOrganization && (
                      <span className="px-2 py-0.5 rounded bg-cyan-950 border border-cyan-800 text-cyan-200">
                        Empresa: {executionResult.createdOrganization.name}
                      </span>
                    )}
                    {executionResult.createdUsers.length > 0 && (
                      <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700">
                        Usuarios: {executionResult.createdUsers.length}
                      </span>
                    )}
                    {executionResult.createdUsers.some((u) => u.pendingActivation) && (
                      <span className="px-2 py-0.5 rounded bg-amber-950/70 border border-amber-700 text-amber-200">
                        Pendientes cuenta nueva (/acceso):{' '}
                        {executionResult.createdUsers.filter((u) => u.pendingActivation).length}
                      </span>
                    )}
                    {executionResult.createdSites.length > 0 && (
                      <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700">
                        Faenas: {executionResult.createdSites.length}
                      </span>
                    )}
                    {executionResult.createdRentals.length > 0 && (
                      <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700">
                        Contratos: {executionResult.createdRentals.length}
                      </span>
                    )}
                    {executionResult.createdAssignments.length > 0 && (
                      <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700">
                        Asignaciones: {executionResult.createdAssignments.length}
                      </span>
                    )}
                  </div>
                  {executionResult.createdUsers.some((u) => u.pendingActivation) && (
                    <p className="text-[11px] text-amber-200/90 leading-relaxed">
                      Nota: Los usuarios marcados como pendientes cuyo correo ya existía en otra empresa deberán ingresar a <span className="font-mono">/acceso</span> y usar <span className="font-semibold">“Crear nueva cuenta con correo anterior”</span> para generar sus nuevas credenciales en esta empresa.
                    </p>
                  )}
                  {executionResult.errors.length > 0 && (
                    <div className="max-h-36 overflow-y-auto space-y-1 pt-2 border-t border-slate-800 text-[11px] text-rose-300">
                      {executionResult.errors.map((err, i) => (
                        <div key={i}>
                          • [{err.section}] {err.label}: {err.reason}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  disabled={isExecuting || validImportCount === 0}
                  onClick={handleExecuteImport}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                  <Upload className="w-4 h-4" />
                  <span>
                    {isExecuting
                      ? 'Importando en Firebase RTDB...'
                      : `Ejecutar Carga Masiva (${validImportCount} válidos)`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
