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
  Network,
  Radio,
  Router,
  Link2,
  Search,
  UserCheck,
  EyeOff,
  Unlock,
  Ban,
} from 'lucide-react';
import {
  MiningCrew,
  MiningSite,
  Organization,
  PlatformConfig,
  RegisteredDeviceConfig,
  SensorDevice,
  UserProfile,
} from '../types';
import {
  BulkImportExecutionResult,
  DEFAULT_ORGANIZATION,
  deleteCrewFromRTDB,
  deleteOrganizationFromRTDB,
  deleteSiteFromRTDB,
  executeBulkCompanyImport,
  saveCrewToRTDB,
  saveOrganizationToRTDB,
  saveRegisteredDeviceHierarchy,
  saveSiteToRTDB,
} from '../services/firebase';
import {
  canBlockOrganization,
  canBlockOrDeleteSite,
  canCreateOrEditOrganization,
  canDeleteOrganization,
  canModifyTargetUser,
  DEFAULT_ORGANIZATION_ID,
  getAuthorizedOrganizationIds,
  isAnyAdminRole,
  isGlobalMineSafeAdmin,
  isOrganizationOwner,
  isUnassignedDeviceOrg,
  resolveDeviceAssignmentStatus,
} from '../utils/accessControl';
import { DeviceRegistryAndAssignmentPanel } from './DeviceRegistryAndAssignmentPanel';
import {
  BulkBundleParseResult,
  BulkEntityType,
  BulkParseResult,
  getBulkCsvTemplate,
  getBulkJsonBundleTemplate,
  parseBulkCompanyBundle,
  parseBulkInput,
} from '../utils/bulkCompanyImport';
import { isPlaceholderRut, validateChileanRut } from '../utils/rut';
import { canUnmaskEmail, formatEmailForViewer } from '../utils/privacyMask';
import { validatePasswordPolicy } from '../utils/passwordPolicy';
import { RutInput } from './RutInput';
import { soundAlert } from '../services/audioAlert';

interface CompanyBulkManagementViewProps {
  currentUser: UserProfile;
  organizations: Organization[];
  sites?: MiningSite[];
  crews?: MiningCrew[];
  devices?: SensorDevice[];
  catalogDevices?: RegisteredDeviceConfig[];
  rtdbDevices?: SensorDevice[];
  usersList?: UserProfile[];
  activeOrganizationId: string;
  platformConfig: PlatformConfig;
  onSelectOrganization: (orgId: string) => void;
  onOrganizationsChanged?: (org: Organization, deletedId?: string) => void;
  onSiteSaved?: (site: MiningSite) => void;
  onSiteDeleted?: (siteId: string) => Promise<void> | void;
  onCrewSaved?: (crew: MiningCrew) => void;
  onCrewDeleted?: (crewId: string, organizationId: string) => Promise<void> | void;
  onDeviceHierarchySaved?: (device: RegisteredDeviceConfig) => void;
  onDeviceDeleted?: (deviceId: string) => void;
  onUsersDeviceUpdated?: (updates: Array<{ userId: string; assignedDeviceCode: string | null }>) => void;
  onAssignUserToOrganization?: (userId: string, targetOrgId: string) => Promise<void> | void;
  onBulkImportCompleted?: (result: BulkImportExecutionResult) => void;
}

const ENTITY_OPTIONS: Array<{
  id: BulkEntityType;
  label: string;
  shortDesc: string;
  icon: React.ReactNode;
}> = [
  {
    id: 'hierarchy',
    label: 'Jerarquía Completa (Faena → Dispositivo)',
    shortDesc: 'Faena, Cuadrilla, Sector y Gateway/Nodo en un CSV',
    icon: <Network className="w-4 h-4 text-teal-400" />,
  },
  {
    id: 'devices',
    label: 'Dispositivos (Gateways y Nodos)',
    shortDesc: 'Vincula Gateways y Nodos a Faena, Cuadrilla y Sector',
    icon: <Router className="w-4 h-4 text-sky-400" />,
  },
  {
    id: 'crews',
    label: 'Cuadrillas Operativas',
    shortDesc: 'Cuadrillas asignadas a Faenas y Sectores',
    icon: <HardHat className="w-4 h-4 text-purple-400" />,
  },
  {
    id: 'sites',
    label: 'Faenas y Sectores',
    shortDesc: 'Faenas mineras y niveles operativos',
    icon: <MapPin className="w-4 h-4 text-emerald-400" />,
  },
  {
    id: 'users',
    label: 'Usuarios / Personal',
    shortDesc: 'Operadores, Supervisores y Admins',
    icon: <Users className="w-4 h-4 text-cyan-400" />,
  },
  {
    id: 'rentals',
    label: 'Contratos de Arriendo',
    shortDesc: 'Contratos mensuales de equipos IoT',
    icon: <Cpu className="w-4 h-4 text-amber-400" />,
  },
  {
    id: 'bundle',
    label: 'Paquete JSON Completo',
    shortDesc: 'Faenas, cuadrillas, dispositivos y usuarios en JSON',
    icon: <FileJson className="w-4 h-4 text-indigo-400" />,
  },
];

export const CompanyBulkManagementView: React.FC<CompanyBulkManagementViewProps> = ({
  currentUser,
  organizations,
  sites = [],
  crews = [],
  devices = [],
  catalogDevices,
  rtdbDevices,
  usersList = [],
  activeOrganizationId,
  platformConfig,
  onSelectOrganization,
  onOrganizationsChanged,
  onSiteSaved,
  onSiteDeleted,
  onCrewSaved,
  onCrewDeleted,
  onDeviceHierarchySaved,
  onDeviceDeleted,
  onUsersDeviceUpdated,
  onAssignUserToOrganization,
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

  const [section, setSection] = useState<'empresas' | 'jerarquia' | 'dispositivos' | 'carga_masiva'>(
    isGlobalAdmin ? 'dispositivos' : 'jerarquia'
  );
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSavingOrg, setIsSavingOrg] = useState(false);
  const [confirmDeleteOrgId, setConfirmDeleteOrgId] = useState<string | null>(null);
  const [confirmDeleteSiteId, setConfirmDeleteSiteId] = useState<string | null>(null);
  const [confirmDeleteCrewId, setConfirmDeleteCrewId] = useState<string | null>(null);

  // Company create/edit form state (only for SuperAdmin / Admin MineSafe)
  const [editingOrgId, setEditingOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState('');
  const [orgRut, setOrgRut] = useState('');
  const [orgIndustry, setOrgIndustry] = useState('Minería Subterránea & Rajo');
  const [orgStatus, setOrgStatus] = useState<'activa' | 'suspendida'>('activa');

  // Bulk import & Hierarchy target org state
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

  const visibleEntityOptions = useMemo(
    () =>
      isGlobalAdmin
        ? ENTITY_OPTIONS
        : ENTITY_OPTIONS.filter((opt) =>
            opt.id === 'sites' || opt.id === 'crews' || opt.id === 'users' || opt.id === 'rentals'
          ),
    [isGlobalAdmin]
  );

  const [bulkOrgId, setBulkOrgId] = useState<string>(defaultTargetOrg);
  const [entityType, setEntityType] = useState<BulkEntityType>(
    isGlobalAdmin ? 'hierarchy' : 'sites'
  );
  const [rawContent, setRawContent] = useState<string>('');
  const [createAuthAccounts, setCreateAuthAccounts] = useState<boolean>(false);
  const [defaultAuthPassword, setDefaultAuthPassword] = useState<string>('');
  const [sendResetEmail, setSendResetEmail] = useState<boolean>(true);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ completed: number; total: number; label: string } | null>(null);
  const [executionResult, setExecutionResult] = useState<BulkImportExecutionResult | null>(null);

  // Hierarchy linking form state
  const [isSavingLink, setIsSavingLink] = useState(false);
  const [linkSiteIdToOrg, setLinkSiteIdToOrg] = useState('');
  const [linkSiteTargetOrgId, setLinkSiteTargetOrgId] = useState(defaultTargetOrg);
  const [linkUserIdToOrg, setLinkUserIdToOrg] = useState('');
  const [linkUserTargetOrgId, setLinkUserTargetOrgId] = useState(defaultTargetOrg);
  const [linkUserSearch, setLinkUserSearch] = useState('');
  const [revealBulkEmails, setRevealBulkEmails] = useState(false);
  const allowEmailUnmask = canUnmaskEmail(currentUser.role);
  const [linkCrewId, setLinkCrewId] = useState('');
  const [linkCrewSiteId, setLinkCrewSiteId] = useState('');
  const [linkSectorSiteId, setLinkSectorSiteId] = useState('');
  const [linkSectorId, setLinkSectorId] = useState('');
  const [linkSectorCrewId, setLinkSectorCrewId] = useState('');
  const [linkDeviceId, setLinkDeviceId] = useState('');
  const [linkDeviceName, setLinkDeviceName] = useState('');
  const [linkDeviceCategory, setLinkDeviceCategory] = useState<'gateway' | 'nodo'>('gateway');
  const [linkDeviceSiteId, setLinkDeviceSiteId] = useState('');
  const [linkDeviceCrewId, setLinkDeviceCrewId] = useState('');
  const [linkDeviceSectorName, setLinkDeviceSectorName] = useState('');
  const [linkDeviceParentGatewayId, setLinkDeviceParentGatewayId] = useState('');

  useEffect(() => {
    if (!authorizedOrganizations.some((o) => o.id === bulkOrgId)) {
      setBulkOrgId(defaultTargetOrg);
    }
  }, [authorizedOrganizations, bulkOrgId, defaultTargetOrg]);

  useEffect(() => {
    if (bulkOrgId && organizations.some((o) => o.id === bulkOrgId)) {
      setLinkUserTargetOrgId(bulkOrgId);
    }
  }, [bulkOrgId, organizations]);

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

    let formattedOrgRut = '';
    if (!isPlaceholderRut(orgRut)) {
      const rutCheck = validateChileanRut(orgRut);
      if (!rutCheck.valid) {
        showNotice('error', rutCheck.error || 'El RUT de empresa no es válido según Módulo 11.');
        return;
      }
      formattedOrgRut = rutCheck.formatted!;
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
          rut: formattedOrgRut,
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

  const handleToggleOrganizationBlock = async (org: Organization) => {
    const check = canBlockOrganization(currentUser, org);
    if (!check.allowed) {
      showNotice('error', check.reason || 'Acción denegada.');
      return;
    }
    const nextStatus: 'activa' | 'suspendida' = org.status === 'activa' ? 'suspendida' : 'activa';
    setIsSavingOrg(true);
    try {
      const updated = await saveOrganizationToRTDB({ ...org, status: nextStatus }, currentUser);
      onOrganizationsChanged?.(updated);
      soundAlert.playFeedbackBeep();
      showNotice(
        'success',
        nextStatus === 'suspendida'
          ? `Empresa "${org.name}" bloqueada (suspendida).`
          : `Empresa "${org.name}" reactivada correctamente.`
      );
    } catch (err: any) {
      showNotice('error', err?.message || 'No se pudo actualizar el estado de la empresa.');
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
      setConfirmDeleteOrgId(null);
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

  const handleToggleSiteBlock = async (site: MiningSite) => {
    const check = canBlockOrDeleteSite(currentUser, site);
    if (!check.allowed) {
      showNotice('error', check.reason || 'Solo SuperAdmin o Admin MineSafe pueden bloquear faenas.');
      return;
    }
    const nextStatus: 'activa' | 'bloqueada' = site.status === 'bloqueada' ? 'activa' : 'bloqueada';
    const updated: MiningSite = { ...site, status: nextStatus };
    setIsSavingOrg(true);
    try {
      await saveSiteToRTDB(updated);
      onSiteSaved?.(updated);
      soundAlert.playFeedbackBeep();
      showNotice(
        'success',
        nextStatus === 'bloqueada'
          ? `Faena "${site.name}" bloqueada correctamente.`
          : `Faena "${site.name}" desbloqueada y reactivada.`
      );
    } catch (err: any) {
      showNotice('error', err?.message || 'Error al actualizar el estado de la faena.');
    } finally {
      setIsSavingOrg(false);
    }
  };

  const handleDeleteSite = async (site: MiningSite) => {
    const check = canBlockOrDeleteSite(currentUser, site);
    if (!check.allowed) {
      showNotice('error', check.reason || 'Solo SuperAdmin o Admin MineSafe pueden eliminar faenas.');
      return;
    }
    setIsSavingOrg(true);
    try {
      if (onSiteDeleted) {
        await onSiteDeleted(site.id);
      } else {
        await deleteSiteFromRTDB(site.id, currentUser);
      }
      setConfirmDeleteSiteId(null);
      soundAlert.playFeedbackBeep();
      showNotice('success', `Faena "${site.name}" eliminada.`);
    } catch (err: any) {
      showNotice('error', err?.message || 'No se pudo eliminar la faena.');
    } finally {
      setIsSavingOrg(false);
    }
  };

  const handleToggleCrewBlock = async (crew: MiningCrew) => {
    if (!isGlobalAdmin) {
      showNotice('error', 'Solo SuperAdmin o Admin MineSafe pueden bloquear cuadrillas.');
      return;
    }
    const nextStatus: MiningCrew['status'] = crew.status === 'bloqueada' ? 'activa' : 'bloqueada';
    const updated: MiningCrew = { ...crew, status: nextStatus, updatedAt: Date.now() };
    setIsSavingOrg(true);
    try {
      const res = await saveCrewToRTDB(updated, currentUser, organizations);
      onCrewSaved?.(res.crew);
      soundAlert.playFeedbackBeep();
      showNotice(
        'success',
        nextStatus === 'bloqueada'
          ? `Cuadrilla "${crew.name}" bloqueada correctamente.`
          : `Cuadrilla "${crew.name}" desbloqueada y reactivada.`
      );
    } catch (err: any) {
      showNotice('error', err?.message || 'No se pudo cambiar el estado de la cuadrilla.');
    } finally {
      setIsSavingOrg(false);
    }
  };

  const handleDeleteCrew = async (crew: MiningCrew) => {
    if (!isGlobalAdmin) {
      showNotice('error', 'Solo SuperAdmin o Admin MineSafe pueden eliminar cuadrillas desde esta vista.');
      return;
    }
    setIsSavingOrg(true);
    try {
      const orgId = crew.organizationId || selectedBulkOrg.id;
      if (onCrewDeleted) {
        await onCrewDeleted(crew.id, orgId);
      } else {
        await deleteCrewFromRTDB(crew.id, orgId, currentUser, organizations);
      }
      setConfirmDeleteCrewId(null);
      soundAlert.playFeedbackBeep();
      showNotice('success', `Cuadrilla "${crew.name}" eliminada.`);
    } catch (err: any) {
      showNotice('error', err?.message || 'No se pudo eliminar la cuadrilla.');
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
      const orgCount = isGlobalAdmin && bundleParsePreview.organization?.valid ? 1 : 0;
      return (
        orgCount +
        bundleParsePreview.users.validRows.length +
        bundleParsePreview.sites.validRows.length +
        bundleParsePreview.crews.validRows.length +
        bundleParsePreview.devices.validRows.length +
        bundleParsePreview.rentals.validRows.length +
        bundleParsePreview.assignments.validRows.length
      );
    }
    return singleParsePreview?.validRows.length || 0;
  }, [entityType, bundleParsePreview, singleParsePreview, isGlobalAdmin]);

  // Datos filtrados por empresa seleccionada para la pestaña Jerarquía y Vinculación
  const scopedOrgSites = useMemo(
    () => sites.filter((s) => (s.organizationId || DEFAULT_ORGANIZATION.id) === selectedBulkOrg.id),
    [sites, selectedBulkOrg.id]
  );
  const scopedOrgCrews = useMemo(
    () => crews.filter((c) => (c.organizationId || DEFAULT_ORGANIZATION.id) === selectedBulkOrg.id),
    [crews, selectedBulkOrg.id]
  );
  const effectiveCatalogDevices = useMemo<RegisteredDeviceConfig[]>(() => {
    const byId = new Map<string, RegisteredDeviceConfig>();
    (platformConfig.registeredDevices || []).forEach((d) => byId.set(d.id, d));
    (catalogDevices || []).forEach((d) => byId.set(d.id, d));
    return Array.from(byId.values());
  }, [platformConfig.registeredDevices, catalogDevices]);

  const scopedOrgDevices = useMemo(() => {
    const byId = new Map<string, RegisteredDeviceConfig>();
    effectiveCatalogDevices
      .filter((d) => !isUnassignedDeviceOrg(d.organizationId) && d.organizationId === selectedBulkOrg.id)
      .forEach((d) => byId.set(d.id, d));
    devices
      .filter((d) => !isUnassignedDeviceOrg(d.organizationId) && d.organizationId === selectedBulkOrg.id)
      .forEach((d) => {
        const prev = byId.get(d.id);
        byId.set(d.id, {
          ...prev,
          id: d.id,
          name: prev?.name || d.name || d.id,
          organizationId: prev?.organizationId || d.organizationId || selectedBulkOrg.id,
          siteId: prev?.siteId || d.siteId,
          siteName: prev?.siteName || d.siteName,
          crewId: prev?.crewId || d.crewId,
          crewName: prev?.crewName || d.crewName,
          sectorId: prev?.sectorId || d.sectorId,
          sectorName: prev?.sectorName || d.sectorName || 'Pendiente de asignación',
          category: prev?.category || d.deviceCategory || 'gateway',
          parentGatewayId: prev?.parentGatewayId || d.parentGatewayId,
          enabled: true,
          active: true,
          createdAt: prev?.createdAt || Date.now(),
        });
      });
    return Array.from(byId.values());
  }, [effectiveCatalogDevices, devices, selectedBulkOrg.id]);

  const scopedGateways = useMemo(
    () => scopedOrgDevices.filter((d) => d.category !== 'nodo' && d.category !== 'sensor'),
    [scopedOrgDevices]
  );

  const handleAssignSiteToOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isGlobalAdmin) {
      showNotice('error', 'Solo SuperAdmin o Admin MineSafe puede reasignar faenas entre empresas.');
      return;
    }
    const targetSite = sites.find((s) => s.id === linkSiteIdToOrg);
    const targetOrg = organizations.find((o) => o.id === linkSiteTargetOrgId);
    if (!targetSite || !targetOrg) {
      showNotice('error', 'Selecciona una faena y una empresa destino.');
      return;
    }
    setIsSavingLink(true);
    try {
      const updatedSite: MiningSite = {
        ...targetSite,
        organizationId: targetOrg.id,
        company: targetOrg.name,
      };
      await saveSiteToRTDB(updatedSite);
      onSiteSaved?.(updatedSite);
      soundAlert.playFeedbackBeep();
      showNotice('success', `Faena "${updatedSite.name}" asignada a "${targetOrg.name}".`);
    } catch (err: any) {
      showNotice('error', err?.message || 'No se pudo asignar la faena.');
    } finally {
      setIsSavingLink(false);
    }
  };

  const assignableUsers = useMemo(() => {
    const q = linkUserSearch.trim().toLowerCase();
    return usersList.filter((u) => {
      if (!canModifyTargetUser(currentUser, u, undefined, organizations).allowed) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.rut || '').toLowerCase().includes(q)
      );
    });
  }, [usersList, currentUser, organizations, linkUserSearch]);

  const usersInTargetOrgCount = useMemo(() => {
    const targetId = linkUserTargetOrgId || selectedBulkOrg.id;
    return usersList.filter((u) => (u.organizationId || DEFAULT_ORGANIZATION_ID) === targetId).length;
  }, [usersList, linkUserTargetOrgId, selectedBulkOrg.id]);

  const handleAssignUserToOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isGlobalAdmin || !onAssignUserToOrganization) {
      showNotice('error', 'Solo SuperAdmin o Admin MineSafe puede asignar usuarios existentes entre empresas.');
      return;
    }
    const targetUser = usersList.find((u) => u.id === linkUserIdToOrg);
    const targetOrg = organizations.find((o) => o.id === linkUserTargetOrgId);
    if (!targetUser || !targetOrg) {
      showNotice('error', 'Selecciona un usuario existente y una organización destino.');
      return;
    }
    if ((targetUser.organizationId || DEFAULT_ORGANIZATION_ID) === targetOrg.id) {
      showNotice('error', `${targetUser.name} ya pertenece a "${targetOrg.name}".`);
      return;
    }
    setIsSavingLink(true);
    try {
      await onAssignUserToOrganization(targetUser.id, targetOrg.id);
      setLinkUserIdToOrg('');
      showNotice(
        'success',
        `Usuario "${targetUser.name}" asignado a "${targetOrg.name}".`
      );
    } catch (err: any) {
      showNotice('error', err?.message || 'No se pudo asignar el usuario a la empresa.');
    } finally {
      setIsSavingLink(false);
    }
  };

  const handleLinkCrewToSite = async (e: React.FormEvent) => {
    e.preventDefault();
    const crew = scopedOrgCrews.find((c) => c.id === linkCrewId);
    const site = scopedOrgSites.find((s) => s.id === linkCrewSiteId);
    if (!crew || !site) {
      showNotice('error', 'Selecciona una cuadrilla y una faena de tu empresa.');
      return;
    }
    setIsSavingLink(true);
    try {
      const updated: MiningCrew = {
        ...crew,
        organizationId: selectedBulkOrg.id,
        siteId: site.id,
        siteName: site.name,
      };
      const res = await saveCrewToRTDB(updated, currentUser, organizations);
      onCrewSaved?.(res.crew);
      soundAlert.playFeedbackBeep();
      showNotice('success', `Cuadrilla "${crew.name}" vinculada a faena "${site.name}".`);
    } catch (err: any) {
      showNotice('error', err?.message || 'No se pudo vincular la cuadrilla a la faena.');
    } finally {
      setIsSavingLink(false);
    }
  };

  const handleLinkSectorToCrew = async (e: React.FormEvent) => {
    e.preventDefault();
    const site = scopedOrgSites.find((s) => s.id === linkSectorSiteId);
    const crew = scopedOrgCrews.find((c) => c.id === linkSectorCrewId);
    if (!site || !linkSectorId || !crew) {
      showNotice('error', 'Selecciona faena, sector y cuadrilla para vincular.');
      return;
    }
    setIsSavingLink(true);
    try {
      const updatedSectors = site.activeSectors.map((sec) => {
        if (sec.id !== linkSectorId) return sec;
        const crewsList = Array.from(new Set([...(sec.assignedCrews || []), crew.name]));
        return {
          ...sec,
          siteId: site.id,
          crewId: crew.id,
          crewName: crew.name,
          assignedCrews: crewsList,
        };
      });
      const updatedSite: MiningSite = { ...site, activeSectors: updatedSectors };
      await saveSiteToRTDB(updatedSite);
      onSiteSaved?.(updatedSite);
      const secObj = updatedSectors.find((s) => s.id === linkSectorId);
      const updatedCrew: MiningCrew = {
        ...crew,
        siteId: site.id,
        siteName: site.name,
        sectorId: linkSectorId,
        sectorName: secObj?.name || crew.sectorName,
      };
      const crewRes = await saveCrewToRTDB(updatedCrew, currentUser, organizations);
      onCrewSaved?.(crewRes.crew);
      soundAlert.playFeedbackBeep();
      showNotice('success', `Sector "${secObj?.name || linkSectorId}" vinculado a cuadrilla "${crew.name}".`);
    } catch (err: any) {
      showNotice('error', err?.message || 'No se pudo vincular el sector a la cuadrilla.');
    } finally {
      setIsSavingLink(false);
    }
  };

  const handleLinkDeviceToSector = async (e: React.FormEvent) => {
    e.preventDefault();
    const devId = linkDeviceId.trim();
    if (!devId) {
      showNotice('error', 'Indica o selecciona un dispositivo (Gateway o Nodo).');
      return;
    }
    const site = scopedOrgSites.find((s) => s.id === linkDeviceSiteId);
    const crew = scopedOrgCrews.find((c) => c.id === linkDeviceCrewId);
    const matchedSector = site?.activeSectors.find((s) => s.name === linkDeviceSectorName);
    if (!linkDeviceSectorName.trim()) {
      showNotice('error', 'Selecciona o escribe el sector donde operará el dispositivo.');
      return;
    }

    setIsSavingLink(true);
    try {
      const savedDev = await saveRegisteredDeviceHierarchy(
        {
          id: devId,
          name: linkDeviceName.trim() || devId,
          organizationId: selectedBulkOrg.id,
          siteId: site?.id,
          siteName: site?.name,
          crewId: crew?.id,
          crewName: crew?.name,
          sectorId: matchedSector?.id,
          sectorName: linkDeviceSectorName.trim(),
          category: linkDeviceCategory,
          parentGatewayId:
            linkDeviceCategory === 'nodo' ? linkDeviceParentGatewayId || undefined : undefined,
          enabled: true,
          active: true,
          createdAt: Date.now(),
        },
        currentUser,
        organizations
      );
      onDeviceHierarchySaved?.(savedDev);
      soundAlert.playFeedbackBeep();
      showNotice(
        'success',
        `${savedDev.category === 'gateway' ? 'Gateway' : 'Nodo'} "${savedDev.name}" vinculado a ${savedDev.sectorName}.`
      );
    } catch (err: any) {
      showNotice('error', err?.message || 'No se pudo vincular el dispositivo.');
    } finally {
      setIsSavingLink(false);
    }
  };

  const handleExecuteImport = async () => {
    if (validImportCount === 0) {
      showNotice('error', 'No hay registros válidos para importar.');
      return;
    }

    if (
      (entityType === 'users' ||
        (entityType === 'bundle' && (bundleParsePreview?.users.validRows.length || 0) > 0)) &&
      createAuthAccounts
    ) {
      const pwPolicy = validatePasswordPolicy(defaultAuthPassword);
      if (!pwPolicy.valid) {
        showNotice(
          'error',
          `Contraseña inicial por defecto inválida: ${pwPolicy.errors.join(' ')}`
        );
        return;
      }
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
          isGlobalAdmin &&
          entityType === 'bundle' &&
          bundleParsePreview?.organization?.valid &&
          bundleParsePreview.organization.data
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
        crews:
          entityType === 'crews'
            ? (singleParsePreview?.validRows.map((r) => r.data) || [])
            : entityType === 'bundle'
            ? (bundleParsePreview?.crews.validRows.map((r) => r.data!) || [])
            : [],
        devices:
          entityType === 'devices'
            ? (singleParsePreview?.validRows.map((r) => r.data) || [])
            : entityType === 'bundle'
            ? (bundleParsePreview?.devices.validRows.map((r) => r.data!) || [])
            : [],
        hierarchy:
          entityType === 'hierarchy'
            ? (singleParsePreview?.validRows.map((r) => r.data) || [])
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
                  {isGlobalAdmin
                    ? 'Empresas, Jerarquía y Carga Masiva'
                    : 'Mi Organización · Estructura y Carga Masiva'}
                </h1>
                <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-cyan-950 text-cyan-200 border border-cyan-700">
                  {isSuperAdmin
                    ? 'SuperAdmin Global'
                    : isGlobalAdmin
                    ? 'Admin Corporativo MineSafe'
                    : 'Administrador de Empresa'}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 mt-1">
                {isGlobalAdmin
                  ? 'Administra empresas, vincula la cadena completa Empresa → Faena → Cuadrilla → Sector → Dispositivo (Gateway o Nodo) y ejecuta cargas masivas CSV/JSON.'
                  : 'Administra exclusivamente la operación interna de tu empresa: faenas, sectores, cuadrillas, personal y contratos de arriendo.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {isGlobalAdmin && (
              <button
                type="button"
                onClick={() => setSection('dispositivos')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                  section === 'dispositivos'
                    ? 'bg-sky-600 text-white border-sky-400 shadow-md'
                    : 'bg-slate-950/70 text-slate-300 border-slate-700 hover:text-white'
                }`}
              >
                <Router className="w-4 h-4" />
                <span>Registro y Asignación IoT ({effectiveCatalogDevices.length})</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setSection('jerarquia')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                section === 'jerarquia'
                  ? 'bg-teal-600 text-white border-teal-400 shadow-md'
                  : 'bg-slate-950/70 text-slate-300 border-slate-700 hover:text-white'
              }`}
            >
              <Network className="w-4 h-4" />
              <span>Jerarquía y Vinculación</span>
            </button>
            <button
              type="button"
              onClick={() => setSection('empresas')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                section === 'empresas'
                  ? 'bg-cyan-600 text-white border-cyan-400 shadow-md'
                  : 'bg-slate-950/70 text-slate-300 border-slate-700 hover:text-white'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>{isGlobalAdmin ? `Empresas (${authorizedOrganizations.length})` : 'Mi Empresa'}</span>
            </button>
            <button
              type="button"
              onClick={() => setSection('carga_masiva')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
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

      {/* SECCIÓN EXCLUSIVA MINESAFE: REGISTRO, CLASIFICACIÓN Y ASIGNACIÓN DE DISPOSITIVOS IoT */}
      {section === 'dispositivos' && isGlobalAdmin && (
        <DeviceRegistryAndAssignmentPanel
          currentUser={currentUser}
          organizations={organizations}
          sites={sites}
          catalogDevices={effectiveCatalogDevices}
          rtdbDevices={rtdbDevices || devices}
          usersList={usersList}
          onDeviceUpdated={(saved) => onDeviceHierarchySaved?.(saved)}
          onDeviceDeleted={(devId) => onDeviceDeleted?.(devId)}
          onUsersDeviceUpdated={onUsersDeviceUpdated}
        />
      )}

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
      {/* SECCIÓN 0: JERARQUÍA ORGANIZACIONAL Y VINCULACIÓN                    */}
      {/* ==================================================================== */}
      {section === 'jerarquia' && (
        <div className="space-y-6">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Network className="w-4 h-4 text-teal-400" />
                <span>Cadena: Empresa → Faena → Cuadrilla → Sector → Dispositivo (Gateway / Nodo)</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                {isGlobalAdmin
                  ? 'Como administrador global puedes seleccionar cualquier empresa y asignar faenas, cuadrillas, sectores y dispositivos.'
                  : `Tu alcance está acotado exclusivamente a tu empresa: ${selectedBulkOrg.name}.`}
              </p>
            </div>
            <div className="shrink-0 min-w-[230px]">
              <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mb-1">
                Empresa activa
              </label>
              {isGlobalAdmin ? (
                <select
                  value={bulkOrgId}
                  onChange={(e) => setBulkOrgId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white font-semibold"
                >
                  {authorizedOrganizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="px-3 py-2 rounded-lg bg-slate-950 border border-cyan-800/60 text-xs font-bold text-cyan-200">
                  {selectedBulkOrg.name}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 text-xs">
            {/* 1) SuperAdmin/Admin MineSafe: Asignar Faena a Empresa */}
            {isGlobalAdmin && (
              <form
                onSubmit={handleAssignSiteToOrg}
                className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-3"
              >
                <div className="flex items-center gap-2 font-bold text-white text-sm">
                  <Building2 className="w-4 h-4 text-cyan-400" />
                  <span>1. Asignar Faena a Empresa</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Exclusivo de SuperAdmin / Admin MineSafe: vincula una faena minera a su empresa mandante.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <select
                    value={linkSiteIdToOrg}
                    onChange={(e) => setLinkSiteIdToOrg(e.target.value)}
                    className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                  >
                    <option value="">Seleccionar Faena...</option>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.company})
                      </option>
                    ))}
                  </select>
                  <select
                    value={linkSiteTargetOrgId}
                    onChange={(e) => setLinkSiteTargetOrgId(e.target.value)}
                    className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                  >
                    {organizations.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={isSavingLink || !linkSiteIdToOrg}
                  className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  <span>Vincular Faena a Empresa</span>
                </button>
              </form>
            )}

            {/* 2) SuperAdmin/Admin MineSafe: Asignar Usuario Existente a Empresa */}
            {isGlobalAdmin && onAssignUserToOrganization && (
              <form
                onSubmit={handleAssignUserToOrg}
                className="bg-slate-900/80 border border-indigo-800/60 rounded-2xl p-5 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-bold text-white text-sm">
                    <UserCheck className="w-4 h-4 text-indigo-400" />
                    <span>2. Asignar Usuario Existente a Empresa</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {allowEmailUnmask && (
                      <button
                        type="button"
                        onClick={() => setRevealBulkEmails((prev) => !prev)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors ${
                          revealBulkEmails
                            ? 'bg-cyan-950/80 border-cyan-600 text-cyan-200'
                            : 'bg-slate-950 border-slate-700 text-slate-300 hover:border-cyan-500'
                        }`}
                        title="Desbloquear u ocultar correos en el selector"
                      >
                        {revealBulkEmails ? <EyeOff className="w-3 h-3" /> : <Unlock className="w-3 h-3 text-cyan-400" />}
                        <span>{revealBulkEmails ? 'Ocultar correos' : 'Ver correos'}</span>
                      </button>
                    )}
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950 border border-indigo-800 text-indigo-300">
                      {usersInTargetOrgCount} en destino
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400">
                  Exclusivo de SuperAdmin / Admin MineSafe: agrega o traslada un usuario ya creado a una organización existente.
                </p>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Filtrar usuario por nombre, correo o RUT..."
                    value={linkUserSearch}
                    onChange={(e) => setLinkUserSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <select
                    value={linkUserIdToOrg}
                    onChange={(e) => setLinkUserIdToOrg(e.target.value)}
                    aria-label="Seleccionar usuario existente"
                    className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                  >
                    <option value="">Seleccionar Usuario ({assignableUsers.length})...</option>
                    {assignableUsers.map((u) => {
                      const uOrgName =
                        organizations.find(
                          (o) => o.id === (u.organizationId || DEFAULT_ORGANIZATION_ID)
                        )?.name || DEFAULT_ORGANIZATION.name;
                      const displayEmail = formatEmailForViewer(
                        u.email,
                        currentUser.role,
                        revealBulkEmails
                      );
                      return (
                        <option key={u.id} value={u.id}>
                          {u.name} ({displayEmail}) — Actual: {uOrgName}
                        </option>
                      );
                    })}
                  </select>
                  <select
                    value={linkUserTargetOrgId}
                    onChange={(e) => setLinkUserTargetOrgId(e.target.value)}
                    aria-label="Seleccionar organización destino"
                    className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                  >
                    {organizations.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="submit"
                    disabled={isSavingLink || !linkUserIdToOrg || !linkUserTargetOrgId}
                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    <span>Asignar Usuario a Empresa</span>
                  </button>
                  {organizations.length <= 1 && (
                    <button
                      type="button"
                      onClick={() => setSection('empresas')}
                      className="text-[11px] text-cyan-400 hover:text-cyan-300 underline"
                    >
                      + Crear otra organización primero
                    </button>
                  )}
                </div>
              </form>
            )}

            {/* 2) Vincular Cuadrilla a Faena */}
            <form
              onSubmit={handleLinkCrewToSite}
              className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-3"
            >
              <div className="flex items-center gap-2 font-bold text-white text-sm">
                <HardHat className="w-4 h-4 text-purple-400" />
                <span>Vincular Cuadrilla a Faena</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Asigna cuadrillas registradas dentro de {selectedBulkOrg.name} a una faena activa.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <select
                  value={linkCrewId}
                  onChange={(e) => setLinkCrewId(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                >
                  <option value="">Seleccionar Cuadrilla ({scopedOrgCrews.length})...</option>
                  {scopedOrgCrews.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.siteName || 'Sin faena'})
                    </option>
                  ))}
                </select>
                <select
                  value={linkCrewSiteId}
                  onChange={(e) => setLinkCrewSiteId(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                >
                  <option value="">Seleccionar Faena ({scopedOrgSites.length})...</option>
                  {scopedOrgSites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={isSavingLink || !linkCrewId || !linkCrewSiteId}
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>Asignar Cuadrilla a Faena</span>
              </button>
            </form>

            {/* 3) Vincular Sector a Cuadrilla */}
            <form
              onSubmit={handleLinkSectorToCrew}
              className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-3"
            >
              <div className="flex items-center gap-2 font-bold text-white text-sm">
                <MapPin className="w-4 h-4 text-emerald-400" />
                <span>Vincular Sector a Cuadrilla</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Asocia sectores o galerías de una faena directamente a una cuadrilla responsable.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <select
                  value={linkSectorSiteId}
                  onChange={(e) => {
                    setLinkSectorSiteId(e.target.value);
                    setLinkSectorId('');
                  }}
                  className="px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                >
                  <option value="">Faena...</option>
                  {scopedOrgSites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <select
                  value={linkSectorId}
                  onChange={(e) => setLinkSectorId(e.target.value)}
                  className="px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                >
                  <option value="">Sector...</option>
                  {(scopedOrgSites.find((s) => s.id === linkSectorSiteId)?.activeSectors || []).map((sec) => (
                    <option key={sec.id} value={sec.id}>
                      {sec.name}
                    </option>
                  ))}
                </select>
                <select
                  value={linkSectorCrewId}
                  onChange={(e) => setLinkSectorCrewId(e.target.value)}
                  className="px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                >
                  <option value="">Cuadrilla...</option>
                  {scopedOrgCrews.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={isSavingLink || !linkSectorSiteId || !linkSectorId || !linkSectorCrewId}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>Vincular Sector a Cuadrilla</span>
              </button>
            </form>

            {/* 4) Vincular Dispositivo (Gateway o Nodo) a Sector */}
            <form
              onSubmit={handleLinkDeviceToSector}
              className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-bold text-white text-sm">
                  <Router className="w-4 h-4 text-sky-400" />
                  <span>Distribuir Dispositivo (Gateway o Nodo) a Sector</span>
                </div>
                {isGlobalAdmin && (
                  <button
                    type="button"
                    onClick={() => setSection('dispositivos')}
                    className="px-2.5 py-1 rounded-lg bg-sky-950/80 hover:bg-sky-900 border border-sky-700 text-sky-200 text-[11px] font-bold cursor-pointer"
                  >
                    + Registrar / Asignar Nuevo ID
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                {isGlobalAdmin
                  ? 'Selecciona un dispositivo asignado a esta empresa para ubicarlo en su Faena, Cuadrilla y Sector operativo.'
                  : 'Selecciona un dispositivo ya asignado a tu empresa por MineSafe para distribuirlo internamente a una Faena, Cuadrilla y Sector.'}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">
                    Dispositivo asignado a {selectedBulkOrg.name}
                  </label>
                  <select
                    value={linkDeviceId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setLinkDeviceId(val);
                      const found = scopedOrgDevices.find((d) => d.id === val);
                      if (found) {
                        setLinkDeviceName(found.name);
                        setLinkDeviceCategory(
                          found.category === 'nodo' || found.category === 'sensor' ? 'nodo' : 'gateway'
                        );
                        setLinkDeviceSiteId(found.siteId || '');
                        setLinkDeviceCrewId(found.crewId || '');
                        setLinkDeviceSectorName(
                          found.sectorName && found.sectorName !== 'Pendiente de asignación'
                            ? found.sectorName
                            : ''
                        );
                        setLinkDeviceParentGatewayId(found.parentGatewayId || '');
                      }
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono"
                    required
                  >
                    <option value="">
                      {scopedOrgDevices.length > 0
                        ? 'Selecciona un Gateway o Nodo asignado...'
                        : 'Sin dispositivos asignados a esta empresa aún'}
                    </option>
                    {scopedOrgDevices.map((d) => (
                      <option key={d.id} value={d.id}>
                        [{d.category === 'nodo' || d.category === 'sensor' ? 'NODO' : 'GATEWAY'}] {d.name} ({d.id})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Nombre visible</label>
                  <input
                    type="text"
                    value={linkDeviceName}
                    onChange={(e) => setLinkDeviceName(e.target.value)}
                    placeholder="Ej: Gateway Rampa Principal"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <select
                  value={linkDeviceCategory}
                  onChange={(e) => setLinkDeviceCategory(e.target.value as 'gateway' | 'nodo')}
                  disabled={!isGlobalAdmin}
                  title={
                    !isGlobalAdmin
                      ? 'El tipo de hardware (Gateway o Nodo) es definido exclusivamente por MineSafe al registrar el dispositivo.'
                      : undefined
                  }
                  className="px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white font-semibold disabled:opacity-60"
                >
                  <option value="gateway">Tipo: Gateway</option>
                  <option value="nodo">Tipo: Nodo Sensor</option>
                </select>
                <select
                  value={linkDeviceSiteId}
                  onChange={(e) => setLinkDeviceSiteId(e.target.value)}
                  className="px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                >
                  <option value="">Faena...</option>
                  {scopedOrgSites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <select
                  value={linkDeviceCrewId}
                  onChange={(e) => setLinkDeviceCrewId(e.target.value)}
                  className="px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                >
                  <option value="">Cuadrilla...</option>
                  {scopedOrgCrews.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  list="minesafe-site-sectors-list"
                  value={linkDeviceSectorName}
                  onChange={(e) => setLinkDeviceSectorName(e.target.value)}
                  placeholder="Sector asignado (ej: Rampa Principal)"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                />
                <datalist id="minesafe-site-sectors-list">
                  {(scopedOrgSites.find((s) => s.id === linkDeviceSiteId)?.activeSectors || []).map((sec) => (
                    <option key={sec.id} value={sec.name} />
                  ))}
                </datalist>

                {linkDeviceCategory === 'nodo' ? (
                  <select
                    value={linkDeviceParentGatewayId}
                    onChange={(e) => setLinkDeviceParentGatewayId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                  >
                    <option value="">Gateway Padre (opcional)...</option>
                    {scopedGateways.map((gw) => (
                      <option key={gw.id} value={gw.id}>
                        {gw.name} ({gw.sectorName})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400 flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-sky-400" />
                    <span>Actúa como concentrador de sector</span>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={isSavingLink || !linkDeviceId.trim() || !linkDeviceSectorName.trim()}
                className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>Guardar Ubicación del Dispositivo</span>
              </button>
            </form>
          </div>

          {/* Vista de Árbol Jerárquico de la Empresa */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Mapa Jerárquico Actual · {selectedBulkOrg.name}
                </h3>
                <p className="text-[11px] text-slate-400">
                  {scopedOrgSites.length} faena(s) · {scopedOrgCrews.length} cuadrilla(s) · {scopedOrgDevices.length} dispositivo(s) ({scopedGateways.length} Gateways / {scopedOrgDevices.length - scopedGateways.length} Nodos)
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEntityType('hierarchy');
                  setSection('carga_masiva');
                }}
                className="px-3 py-1.5 rounded-lg bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-700 text-emerald-200 text-xs font-bold cursor-pointer"
              >
                Importar Jerarquía Masiva (CSV)
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {scopedOrgDevices.length === 0 ? (
                <p className="text-slate-400 col-span-full py-4 text-center">
                  No hay dispositivos vinculados todavía en esta empresa. Usa el formulario superior o la carga masiva.
                </p>
              ) : (
                scopedOrgDevices.map((dev) => (
                  <div
                    key={dev.id}
                    className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-start justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                            dev.category === 'nodo'
                              ? 'bg-emerald-950/70 text-emerald-300 border-emerald-700'
                              : 'bg-sky-950/70 text-sky-300 border-sky-700'
                          }`}
                        >
                          {dev.category === 'nodo' ? 'Nodo' : 'Gateway'}
                        </span>
                        <span className="font-bold text-white truncate">{dev.name}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 flex flex-wrap gap-x-2 gap-y-0.5">
                        <span>Faena: <strong className="text-slate-200">{dev.siteName || 'General'}</strong></span>
                        <span>·</span>
                        <span>Cuadrilla: <strong className="text-slate-200">{dev.crewName || 'Sin asignar'}</strong></span>
                        <span>·</span>
                        <span>Sector: <strong className="text-cyan-300">{dev.sectorName}</strong></span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {isGlobalAdmin && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-4 border-t border-slate-800">
                {/* Gestión rápida de Faenas (Bloquear / Eliminar) */}
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                      Faenas de {selectedBulkOrg.name} ({scopedOrgSites.length})
                    </h4>
                    <span className="text-[10px] text-slate-400">Bloquear / Eliminar</span>
                  </div>
                  {scopedOrgSites.length === 0 ? (
                    <p className="text-[11px] text-slate-500">No hay faenas registradas en esta empresa.</p>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {scopedOrgSites.map((site) => {
                        const isBlocked = site.status === 'bloqueada';
                        return (
                          <div
                            key={site.id}
                            className={`p-2.5 rounded-lg border flex flex-wrap items-center justify-between gap-2 text-xs ${
                              isBlocked
                                ? 'bg-rose-950/25 border-rose-800/80'
                                : 'bg-slate-900/80 border-slate-800'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-white truncate">{site.name}</span>
                                <span
                                  className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${
                                    isBlocked
                                      ? 'bg-rose-950 text-rose-300 border-rose-700'
                                      : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                                  }`}
                                >
                                  {isBlocked ? 'Bloqueada' : 'Activa'}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-400">
                                {site.region} · {site.activeSectors.length} sector(es)
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleToggleSiteBlock(site)}
                                disabled={isSavingOrg}
                                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold border disabled:opacity-50 ${
                                  isBlocked
                                    ? 'bg-emerald-950/70 hover:bg-emerald-900 text-emerald-200 border-emerald-700'
                                    : 'bg-amber-950/70 hover:bg-amber-900 text-amber-200 border-amber-700'
                                }`}
                              >
                                {isBlocked ? (
                                  <>
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>Activar</span>
                                  </>
                                ) : (
                                  <>
                                    <Ban className="w-3 h-3" />
                                    <span>Bloquear</span>
                                  </>
                                )}
                              </button>
                              {confirmDeleteSiteId === site.id ? (
                                <div className="flex items-center gap-1 bg-rose-950 border border-rose-700 rounded-md px-1.5 py-0.5">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteSite(site)}
                                    disabled={isSavingOrg}
                                    className="text-[10px] font-bold text-rose-300 hover:text-white px-1"
                                  >
                                    Sí
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteSiteId(null)}
                                    className="text-[10px] text-slate-400 hover:text-white px-1"
                                  >
                                    No
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteSiteId(site.id)}
                                  disabled={isSavingOrg}
                                  className="p-1 rounded-md bg-rose-950/70 hover:bg-rose-900 text-rose-300 border border-rose-800 disabled:opacity-50"
                                  title="Eliminar faena"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Gestión rápida de Cuadrillas (Bloquear / Eliminar) */}
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <HardHat className="w-3.5 h-3.5 text-purple-400" />
                      Cuadrillas de {selectedBulkOrg.name} ({scopedOrgCrews.length})
                    </h4>
                    <span className="text-[10px] text-slate-400">Bloquear / Eliminar</span>
                  </div>
                  {scopedOrgCrews.length === 0 ? (
                    <p className="text-[11px] text-slate-500">No hay cuadrillas registradas en esta empresa.</p>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {scopedOrgCrews.map((crew) => {
                        const isBlocked = crew.status === 'bloqueada';
                        return (
                          <div
                            key={crew.id}
                            className={`p-2.5 rounded-lg border flex flex-wrap items-center justify-between gap-2 text-xs ${
                              isBlocked
                                ? 'bg-rose-950/25 border-rose-800/80'
                                : 'bg-slate-900/80 border-slate-800'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono text-[10px] text-cyan-300">{crew.code}</span>
                                <span className="font-bold text-white truncate">{crew.name}</span>
                                <span
                                  className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${
                                    isBlocked
                                      ? 'bg-rose-950 text-rose-300 border-rose-700'
                                      : crew.status === 'activa'
                                      ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                                      : 'bg-slate-900 text-slate-400 border-slate-700'
                                  }`}
                                >
                                  {crew.status}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-400">
                                {crew.siteName || 'Sin faena'} · {(crew.members || []).length} trabajador(es)
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleToggleCrewBlock(crew)}
                                disabled={isSavingOrg}
                                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold border disabled:opacity-50 ${
                                  isBlocked
                                    ? 'bg-emerald-950/70 hover:bg-emerald-900 text-emerald-200 border-emerald-700'
                                    : 'bg-amber-950/70 hover:bg-amber-900 text-amber-200 border-amber-700'
                                }`}
                              >
                                {isBlocked ? (
                                  <>
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>Activar</span>
                                  </>
                                ) : (
                                  <>
                                    <Ban className="w-3 h-3" />
                                    <span>Bloquear</span>
                                  </>
                                )}
                              </button>
                              {confirmDeleteCrewId === crew.id ? (
                                <div className="flex items-center gap-1 bg-rose-950 border border-rose-700 rounded-md px-1.5 py-0.5">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteCrew(crew)}
                                    disabled={isSavingOrg}
                                    className="text-[10px] font-bold text-rose-300 hover:text-white px-1"
                                  >
                                    Sí
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteCrewId(null)}
                                    className="text-[10px] text-slate-400 hover:text-white px-1"
                                  >
                                    No
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteCrewId(crew.id)}
                                  disabled={isSavingOrg}
                                  className="p-1 rounded-md bg-rose-950/70 hover:bg-rose-900 text-rose-300 border border-rose-800 disabled:opacity-50"
                                  title="Eliminar cuadrilla"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SECCIÓN 1: CREACIÓN Y LISTADO DE EMPRESAS                            */}
      {/* ==================================================================== */}
      {section === 'empresas' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {isGlobalAdmin ? (
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
                  <RutInput
                    value={orgRut}
                    onChange={setOrgRut}
                    allowEmpty
                    placeholder="76.543.210-3"
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
          ) : (
            <div className="lg:col-span-5 bg-slate-900/80 border border-cyan-800/40 rounded-2xl p-5 sm:p-6 space-y-3">
              <div className="flex items-center gap-2 text-cyan-300 font-bold text-sm">
                <Building2 className="w-5 h-5" />
                <span>Alcance de Administrador de Empresa</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Tu rol de Administrador está restringido exclusivamente a tu empresa asignada. No puedes crear nuevas organizaciones ni acceder a faenas de otras empresas.
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">
                Utiliza las pestañas <strong className="text-white">Jerarquía y Vinculación</strong> y <strong className="text-white">Carga Masiva</strong> para gestionar tus cuadrillas, sectores y dispositivos (Gateways o Nodos).
              </p>
            </div>
          )}

          <div className="lg:col-span-7 bg-slate-900/80 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="pb-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-cyan-400" />
                  {isGlobalAdmin
                    ? `Empresas Autorizadas (${authorizedOrganizations.length})`
                    : 'Mi Empresa Asignada'}
                </h3>
                <p className="text-[11px] text-slate-400">
                  {isGlobalAdmin
                    ? 'Activa el contexto de cualquier empresa o carga sus datos y jerarquía masivamente.'
                    : 'Información de tu empresa y acceso directo a carga masiva de tu operación.'}
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
                        {canBlockOrganization(currentUser, org).allowed && (
                          <button
                            type="button"
                            onClick={() => handleToggleOrganizationBlock(org)}
                            disabled={isSavingOrg}
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border disabled:opacity-50 ${
                              org.status === 'activa'
                                ? 'bg-amber-950/60 hover:bg-amber-900 text-amber-200 border-amber-700'
                                : 'bg-emerald-950/60 hover:bg-emerald-900 text-emerald-200 border-emerald-700'
                            }`}
                            title={org.status === 'activa' ? 'Bloquear / suspender empresa' : 'Activar empresa'}
                          >
                            {org.status === 'activa' ? (
                              <>
                                <Ban className="w-3.5 h-3.5" />
                                <span>Bloquear</span>
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Activar</span>
                              </>
                            )}
                          </button>
                        )}
                        {canDel && (
                          confirmDeleteOrgId === org.id ? (
                            <div className="flex items-center gap-1 bg-rose-950 border border-rose-700 rounded-lg px-2 py-1">
                              <span className="text-[10px] text-rose-200 font-semibold">¿Eliminar?</span>
                              <button
                                type="button"
                                onClick={() => handleDeleteOrganization(org)}
                                disabled={isSavingOrg}
                                className="text-[10px] font-bold text-rose-300 hover:text-white px-1"
                              >
                                Sí
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteOrgId(null)}
                                className="text-[10px] text-slate-400 hover:text-white px-1"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteOrgId(org.id)}
                              disabled={isSavingOrg}
                              className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800 disabled:opacity-50"
                              title="Eliminar empresa"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )
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
                    {visibleEntityOptions.map((opt) => (
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
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <label className="text-slate-400 text-[11px]">
                              Contraseña temporal segura (si falta columna password)
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
                                const lower = 'abcdefghijkmnopqrstuvwxyz';
                                const nums = '23456789';
                                const syms = '!@#$%&*';
                                const all = upper + lower + nums + syms;
                                const pick = (chars: string) =>
                                  chars[Math.floor(Math.random() * chars.length)];
                                const raw = [
                                  pick(upper),
                                  pick(lower),
                                  pick(nums),
                                  pick(syms),
                                  ...Array.from({ length: 8 }, () => pick(all)),
                                ]
                                  .sort(() => Math.random() - 0.5)
                                  .join('');
                                setDefaultAuthPassword(raw);
                              }}
                              className="text-[10px] font-semibold text-cyan-300 hover:text-cyan-200 underline"
                            >
                              Generar aleatoria
                            </button>
                          </div>
                          <input
                            type="text"
                            minLength={8}
                            placeholder="Define una clave segura temporal..."
                            value={defaultAuthPassword}
                            onChange={(e) => setDefaultAuthPassword(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-white font-mono"
                          />
                          {defaultAuthPassword && !validatePasswordPolicy(defaultAuthPassword).valid && (
                            <p className="text-[10px] text-rose-400 mt-1">
                              {validatePasswordPolicy(defaultAuthPassword).errors.join(' ')}
                            </p>
                          )}
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

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[
                      { label: 'Usuarios', res: bundleParsePreview.users },
                      { label: 'Faenas', res: bundleParsePreview.sites },
                      { label: 'Cuadrillas', res: bundleParsePreview.crews },
                      { label: 'Dispositivos', res: bundleParsePreview.devices },
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
                    {executionResult.createdCrews.length > 0 && (
                      <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700">
                        Cuadrillas: {executionResult.createdCrews.length}
                      </span>
                    )}
                    {executionResult.createdDevices.length > 0 && (
                      <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700">
                        Dispositivos: {executionResult.createdDevices.length}
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
