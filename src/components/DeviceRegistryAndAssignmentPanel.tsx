import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRightLeft,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Cpu,
  Edit3,
  History,
  MapPin,
  Package,
  Plus,
  Radio,
  RotateCcw,
  Router,
  Search,
  ShieldAlert,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import {
  DeviceAssignmentStatus,
  MiningSite,
  Organization,
  RegisteredDeviceConfig,
  SensorDevice,
  UserProfile,
} from '../types';
import {
  assignOrTransferIoTDeviceInRTDB,
  deleteIoTDeviceFromCatalogInRTDB,
  registerIoTDeviceInRTDB,
} from '../services/firebase';
import {
  canRegisterAndAssignIoTDevices,
  isUnassignedDeviceOrg,
  resolveDeviceAssignmentStatus,
  UNASSIGNED_DEVICE_ORG_ID,
} from '../utils/accessControl';
import { soundAlert } from '../services/audioAlert';

interface DeviceRegistryAndAssignmentPanelProps {
  currentUser: UserProfile;
  organizations: Organization[];
  sites: MiningSite[];
  catalogDevices: RegisteredDeviceConfig[];
  rtdbDevices: SensorDevice[];
  onDeviceUpdated?: (device: RegisteredDeviceConfig) => void;
  onDeviceDeleted?: (deviceId: string) => void;
}

type InitialAssignMode = 'inventario' | 'empresa' | 'faena';

const STATUS_META: Record<
  DeviceAssignmentStatus,
  { label: string; badgeClass: string }
> = {
  en_inventario: {
    label: 'En Inventario (Sin asignar)',
    badgeClass: 'bg-amber-950/70 text-amber-300 border-amber-700/80',
  },
  asignado_empresa: {
    label: 'Asignado a Empresa',
    badgeClass: 'bg-cyan-950/70 text-cyan-300 border-cyan-700/80',
  },
  asignado_faena: {
    label: 'Asignado a Faena',
    badgeClass: 'bg-indigo-950/70 text-indigo-300 border-indigo-700/80',
  },
  asignado_sector: {
    label: 'Vinculado a Sector',
    badgeClass: 'bg-emerald-950/70 text-emerald-300 border-emerald-700/80',
  },
};

function formatShortDateTime(ts?: number): string {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString('es-CL', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export const DeviceRegistryAndAssignmentPanel: React.FC<
  DeviceRegistryAndAssignmentPanelProps
> = ({
  currentUser,
  organizations,
  sites,
  catalogDevices,
  rtdbDevices,
  onDeviceUpdated,
  onDeviceDeleted,
}) => {
  const permission = canRegisterAndAssignIoTDevices(currentUser);

  // Form state (Alta / Edición de dispositivo)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [attachingRTDB, setAttachingRTDB] = useState<boolean>(false);
  const [hardwareId, setHardwareId] = useState<string>('');
  const [deviceName, setDeviceName] = useState<string>('');
  const [deviceCategory, setDeviceCategory] = useState<'gateway' | 'nodo'>('gateway');
  const [parentGatewayId, setParentGatewayId] = useState<string>('');
  const [localIp, setLocalIp] = useState<string>('');
  const [initialMode, setInitialMode] = useState<InitialAssignMode>('inventario');
  const [formOrgId, setFormOrgId] = useState<string>('');
  const [formSiteId, setFormSiteId] = useState<string>('');
  const [formNote, setFormNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Filters & search state
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<'todos' | DeviceAssignmentStatus>('todos');
  const [filterCategory, setFilterCategory] = useState<'todos' | 'gateway' | 'nodo'>('todos');
  const [filterOrgId, setFilterOrgId] = useState<string>('todos');
  const [filterSiteId, setFilterSiteId] = useState<string>('todos');

  // Inline transfer / reassignment modal state
  const [transferDeviceId, setTransferDeviceId] = useState<string | null>(null);
  const [transferOrgId, setTransferOrgId] = useState<string>('');
  const [transferSiteId, setTransferSiteId] = useState<string>('');
  const [transferNote, setTransferNote] = useState<string>('');
  const [busyDeviceId, setBusyDeviceId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  const showNotice = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => {
      setFeedback((prev) => (prev?.text === text ? null : prev));
    }, 6500);
  };

  const orgMap = useMemo(
    () => new Map(organizations.map((o) => [o.id, o])),
    [organizations]
  );

  const rtdbMap = useMemo(
    () => new Map(rtdbDevices.map((d) => [d.id, d])),
    [rtdbDevices]
  );

  const normalizedCatalog = useMemo<RegisteredDeviceConfig[]>(() => {
    return catalogDevices.map((dev) => {
      const live = rtdbMap.get(dev.id);
      const mergedOrgId = dev.organizationId || live?.organizationId || UNASSIGNED_DEVICE_ORG_ID;
      const orgName = isUnassignedDeviceOrg(mergedOrgId)
        ? undefined
        : dev.organizationName || orgMap.get(mergedOrgId)?.name || mergedOrgId;
      const status = resolveDeviceAssignmentStatus({
        ...dev,
        organizationId: mergedOrgId,
      });
      return {
        ...dev,
        organizationId: mergedOrgId,
        organizationName: orgName,
        assignmentStatus: status,
      };
    });
  }, [catalogDevices, rtdbMap, orgMap]);

  const catalogIdsSet = useMemo(
    () => new Set(normalizedCatalog.map((d) => d.id.toLowerCase())),
    [normalizedCatalog]
  );

  const detectedUnregisteredRTDB = useMemo(
    () => rtdbDevices.filter((rt) => !catalogIdsSet.has(rt.id.toLowerCase())),
    [rtdbDevices, catalogIdsSet]
  );

  const cleanPreviewId = useMemo(
    () => hardwareId.trim().replace(/\s+/g, '_').replace(/[.#$/[\]]/g, '_'),
    [hardwareId]
  );

  const isDuplicateId = useMemo(() => {
    if (editingId || !cleanPreviewId) return false;
    return catalogIdsSet.has(cleanPreviewId.toLowerCase());
  }, [editingId, cleanPreviewId, catalogIdsSet]);

  const existsOnlyInRTDB = useMemo(() => {
    if (editingId || !cleanPreviewId || isDuplicateId) return false;
    return rtdbDevices.some((d) => d.id.toLowerCase() === cleanPreviewId.toLowerCase());
  }, [editingId, cleanPreviewId, isDuplicateId, rtdbDevices]);

  const formSites = useMemo(
    () =>
      sites.filter(
        (s) => formOrgId && (s.organizationId || '') === formOrgId
      ),
    [sites, formOrgId]
  );

  const transferSites = useMemo(
    () =>
      sites.filter(
        (s) => transferOrgId && (s.organizationId || '') === transferOrgId
      ),
    [sites, transferOrgId]
  );

  const filterSites = useMemo(() => {
    if (filterOrgId === 'todos' || filterOrgId === UNASSIGNED_DEVICE_ORG_ID) {
      return sites;
    }
    return sites.filter((s) => (s.organizationId || '') === filterOrgId);
  }, [sites, filterOrgId]);

  const gatewayOptions = useMemo(
    () =>
      normalizedCatalog.filter((d) => {
        const isGw = d.category === 'gateway' || d.category === 'gateway_sensor';
        if (!isGw) return false;
        if (initialMode === 'inventario' || !formOrgId) return true;
        return d.organizationId === formOrgId;
      }),
    [normalizedCatalog, initialMode, formOrgId]
  );

  const kpis = useMemo(() => {
    let enInventario = 0;
    let asignadoEmpresa = 0;
    let asignadoFaenaOSector = 0;
    let enLinea = 0;
    normalizedCatalog.forEach((d) => {
      const st = d.assignmentStatus || resolveDeviceAssignmentStatus(d);
      if (st === 'en_inventario') enInventario += 1;
      else if (st === 'asignado_empresa') asignadoEmpresa += 1;
      else asignadoFaenaOSector += 1;
      if (rtdbMap.get(d.id)?.gatewayOnline) enLinea += 1;
    });
    return {
      total: normalizedCatalog.length,
      enInventario,
      asignadoEmpresa,
      asignadoFaenaOSector,
      enLinea,
    };
  }, [normalizedCatalog, rtdbMap]);

  const filteredDevices = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return normalizedCatalog.filter((dev) => {
      const st = dev.assignmentStatus || resolveDeviceAssignmentStatus(dev);
      const isNode = dev.category === 'nodo' || dev.category === 'sensor';
      if (filterStatus !== 'todos' && st !== filterStatus) return false;
      if (filterCategory === 'gateway' && isNode) return false;
      if (filterCategory === 'nodo' && !isNode) return false;
      if (filterOrgId === UNASSIGNED_DEVICE_ORG_ID) {
        if (!isUnassignedDeviceOrg(dev.organizationId)) return false;
      } else if (filterOrgId !== 'todos') {
        if (dev.organizationId !== filterOrgId) return false;
      }
      if (filterSiteId !== 'todos') {
        if (dev.siteId !== filterSiteId) return false;
      }
      if (q) {
        const hay = `${dev.id} ${dev.name} ${dev.organizationName || ''} ${dev.siteName || ''} ${dev.sectorName || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [normalizedCatalog, searchTerm, filterStatus, filterCategory, filterOrgId, filterSiteId]);

  const resetForm = () => {
    setEditingId(null);
    setAttachingRTDB(false);
    setHardwareId('');
    setDeviceName('');
    setDeviceCategory('gateway');
    setParentGatewayId('');
    setLocalIp('');
    setInitialMode('inventario');
    setFormOrgId('');
    setFormSiteId('');
    setFormNote('');
  };

  const handleStartEdit = (dev: RegisteredDeviceConfig) => {
    setEditingId(dev.id);
    setAttachingRTDB(false);
    setHardwareId(dev.id);
    setDeviceName(dev.name);
    setDeviceCategory(dev.category === 'nodo' || dev.category === 'sensor' ? 'nodo' : 'gateway');
    setParentGatewayId(dev.parentGatewayId || '');
    setLocalIp(dev.localIp || '');
    if (isUnassignedDeviceOrg(dev.organizationId)) {
      setInitialMode('inventario');
      setFormOrgId('');
      setFormSiteId('');
    } else if (dev.siteId) {
      setInitialMode('faena');
      setFormOrgId(dev.organizationId || '');
      setFormSiteId(dev.siteId);
    } else {
      setInitialMode('empresa');
      setFormOrgId(dev.organizationId || '');
      setFormSiteId('');
    }
    setFormNote('');
  };

  const handlePrefillDetectedRTDB = (rtDev: SensorDevice, cat: 'gateway' | 'nodo') => {
    setEditingId(null);
    setAttachingRTDB(true);
    setHardwareId(rtDev.id);
    setDeviceName(rtDev.name || rtDev.id);
    setDeviceCategory(cat);
    setParentGatewayId(rtDev.parentGatewayId || '');
    setLocalIp(rtDev.localIp || '');
    if (!isUnassignedDeviceOrg(rtDev.organizationId) && orgMap.has(rtDev.organizationId || '')) {
      setInitialMode(rtDev.siteId ? 'faena' : 'empresa');
      setFormOrgId(rtDev.organizationId || '');
      setFormSiteId(rtDev.siteId || '');
    } else {
      setInitialMode('inventario');
      setFormOrgId('');
      setFormSiteId('');
    }
    setFormNote(`Vinculación inicial desde nodo RTDB detectado (${cat.toUpperCase()}).`);
    soundAlert.playFeedbackBeep();
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!permission.allowed) {
      showNotice('error', permission.reason || 'Sin permisos para registrar dispositivos.');
      return;
    }
    if (!cleanPreviewId || cleanPreviewId.length < 3) {
      showNotice('error', 'Ingresa un ID único de hardware válido (mínimo 3 caracteres).');
      return;
    }
    if (isDuplicateId) {
      showNotice(
        'error',
        `El ID "${cleanPreviewId}" ya existe en el catálogo. Usa Editar o Reasignar para evitar duplicados.`
      );
      return;
    }
    if ((initialMode === 'empresa' || initialMode === 'faena') && !formOrgId) {
      showNotice('error', 'Selecciona la Empresa destino o cambia el estado inicial a "En inventario".');
      return;
    }
    if (initialMode === 'faena' && !formSiteId) {
      showNotice('error', 'Selecciona la Faena destino para la asignación directa.');
      return;
    }

    const selectedOrg = formOrgId ? orgMap.get(formOrgId) : undefined;
    const selectedSite = formSiteId ? sites.find((s) => s.id === formSiteId) : undefined;

    setIsSubmitting(true);
    try {
      const saved = await registerIoTDeviceInRTDB(
        {
          id: cleanPreviewId,
          name: deviceName.trim() || cleanPreviewId,
          category: deviceCategory,
          parentGatewayId: deviceCategory === 'nodo' ? parentGatewayId || undefined : undefined,
          localIp: localIp.trim() || undefined,
          organizationId: initialMode === 'inventario' ? UNASSIGNED_DEVICE_ORG_ID : formOrgId,
          organizationName: initialMode === 'inventario' ? undefined : selectedOrg?.name,
          siteId: initialMode === 'faena' ? selectedSite?.id : undefined,
          siteName: initialMode === 'faena' ? selectedSite?.name : undefined,
          note: formNote.trim() || undefined,
          isEdit: Boolean(editingId),
          allowAttachExistingRTDB: attachingRTDB || existsOnlyInRTDB,
        },
        currentUser
      );
      onDeviceUpdated?.(saved);
      soundAlert.playFeedbackBeep();
      showNotice(
        'success',
        editingId
          ? `Dispositivo "${saved.id}" (${saved.category.toUpperCase()}) actualizado correctamente.`
          : initialMode === 'inventario'
          ? `Dispositivo "${saved.id}" (${saved.category.toUpperCase()}) registrado en Inventario Global (sin asignar).`
          : initialMode === 'faena'
          ? `Dispositivo "${saved.id}" registrado y asignado a ${selectedOrg?.name} → ${selectedSite?.name}.`
          : `Dispositivo "${saved.id}" registrado y asignado a ${selectedOrg?.name}.`
      );
      resetForm();
    } catch (err: any) {
      showNotice('error', err?.message || 'No se pudo guardar el dispositivo en Firebase RTDB.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenTransfer = (dev: RegisteredDeviceConfig) => {
    setTransferDeviceId(dev.id);
    setTransferOrgId(isUnassignedDeviceOrg(dev.organizationId) ? '' : dev.organizationId || '');
    setTransferSiteId(isUnassignedDeviceOrg(dev.organizationId) ? '' : dev.siteId || '');
    setTransferNote('');
  };

  const handleConfirmTransfer = async (dev: RegisteredDeviceConfig) => {
    if (!transferOrgId) {
      showNotice('error', 'Selecciona una Empresa destino o usa "Devolver a Inventario" para desasignar.');
      return;
    }
    const targetOrg = orgMap.get(transferOrgId);
    const targetSite = transferSiteId ? sites.find((s) => s.id === transferSiteId) : undefined;
    setBusyDeviceId(dev.id);
    try {
      const updated = await assignOrTransferIoTDeviceInRTDB(
        {
          deviceId: dev.id,
          targetOrganizationId: transferOrgId,
          targetOrganizationName: targetOrg?.name || transferOrgId,
          targetSiteId: targetSite?.id || null,
          targetSiteName: targetSite?.name || undefined,
          note: transferNote.trim() || undefined,
          fallbackDevice: dev,
        },
        currentUser
      );
      onDeviceUpdated?.(updated);
      setTransferDeviceId(null);
      soundAlert.playFeedbackBeep();
      showNotice(
        'success',
        `Dispositivo "${dev.id}" asignado a ${targetOrg?.name || transferOrgId}${
          targetSite ? ` · Faena ${targetSite.name}` : ' (para distribución interna)'
        }.`
      );
    } catch (err: any) {
      showNotice('error', err?.message || 'Error al asignar o trasladar el dispositivo.');
    } finally {
      setBusyDeviceId(null);
    }
  };

  const handleUnassignToInventory = async (dev: RegisteredDeviceConfig) => {
    setBusyDeviceId(dev.id);
    try {
      const updated = await assignOrTransferIoTDeviceInRTDB(
        {
          deviceId: dev.id,
          targetOrganizationId: null,
          note: 'Desasignación manual desde panel MineSafe (devuelto a inventario disponible).',
          fallbackDevice: dev,
        },
        currentUser
      );
      onDeviceUpdated?.(updated);
      if (transferDeviceId === dev.id) setTransferDeviceId(null);
      soundAlert.playFeedbackBeep();
      showNotice(
        'success',
        `Dispositivo "${dev.id}" desasignado y devuelto a Inventario Global disponible.`
      );
    } catch (err: any) {
      showNotice('error', err?.message || 'No se pudo devolver el dispositivo a inventario.');
    } finally {
      setBusyDeviceId(null);
    }
  };

  const handleDeleteFromCatalog = async (devId: string) => {
    setBusyDeviceId(devId);
    try {
      await deleteIoTDeviceFromCatalogInRTDB(devId, currentUser);
      onDeviceDeleted?.(devId);
      setConfirmDeleteId(null);
      soundAlert.playFeedbackBeep();
      showNotice('success', `Dispositivo "${devId}" eliminado del catálogo registrado.`);
    } catch (err: any) {
      showNotice('error', err?.message || 'No se pudo eliminar el dispositivo del catálogo.');
    } finally {
      setBusyDeviceId(null);
    }
  };

  if (!permission.allowed) {
    return (
      <div className="p-8 text-center bg-slate-900/80 border border-rose-800/60 rounded-2xl max-w-2xl mx-auto">
        <ShieldAlert className="w-10 h-10 text-rose-400 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-white mb-1">
          Registro y Asignación IoT Reservado a MineSafe
        </h3>
        <p className="text-xs text-slate-400">{permission.reason}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between gap-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-950/70 border-emerald-700 text-emerald-200'
              : 'bg-rose-950/70 border-rose-700 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-300 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Total Registrados
          </div>
          <div className="text-2xl font-black text-white mt-1 font-mono">{kpis.total}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Gateways y Nodos en catálogo
          </div>
        </div>
        <div className="bg-slate-900/80 border border-amber-800/40 rounded-2xl p-4">
          <div className="text-[11px] font-semibold text-amber-300 uppercase tracking-wider">
            En Inventario (Sin asignar)
          </div>
          <div className="text-2xl font-black text-amber-300 mt-1 font-mono">
            {kpis.enInventario}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Disponibles para asignar a clientes
          </div>
        </div>
        <div className="bg-slate-900/80 border border-cyan-800/40 rounded-2xl p-4">
          <div className="text-[11px] font-semibold text-cyan-300 uppercase tracking-wider">
            Asignados a Clientes
          </div>
          <div className="text-2xl font-black text-cyan-300 mt-1 font-mono">
            {kpis.asignadoEmpresa + kpis.asignadoFaenaOSector}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {kpis.asignadoEmpresa} en empresa · {kpis.asignadoFaenaOSector} en faena/sector
          </div>
        </div>
        <div className="bg-slate-900/80 border border-emerald-800/40 rounded-2xl p-4">
          <div className="text-[11px] font-semibold text-emerald-300 uppercase tracking-wider">
            Conectados en Vivo
          </div>
          <div className="text-2xl font-black text-emerald-300 mt-1 font-mono">
            {kpis.enLinea}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Reportando telemetría RTDB ahora
          </div>
        </div>
      </div>

      {/* Hardware detectado en RTDB sin registrar */}
      {detectedUnregisteredRTDB.length > 0 && (
        <div className="bg-amber-950/25 border border-amber-700/60 rounded-2xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-amber-200 font-bold text-sm">
              <Cpu className="w-4 h-4 text-amber-400" />
              <span>
                Hardware Detectado en Firebase RTDB sin Clasificar ({detectedUnregisteredRTDB.length})
              </span>
            </div>
            <span className="text-[11px] text-amber-300/80">
              Regístralos como Gateway o Nodo para gestionarlos y asignarlos a empresas o faenas.
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {detectedUnregisteredRTDB.map((rt) => (
              <div
                key={rt.id}
                className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-white">{rt.id}</span>
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        rt.gatewayOnline
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                          : 'bg-slate-900 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {rt.gatewayOnline ? 'En línea' : 'Sin señal'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 truncate mt-0.5">
                    {rt.name} · {rt.sectorName}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handlePrefillDetectedRTDB(rt, 'gateway')}
                    className="px-2.5 py-1.5 rounded-lg bg-sky-950/80 hover:bg-sky-900 border border-sky-700 text-sky-200 font-bold text-[11px] cursor-pointer"
                  >
                    + Gateway
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePrefillDetectedRTDB(rt, 'nodo')}
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700 text-emerald-200 font-bold text-[11px] cursor-pointer"
                  >
                    + Nodo
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main 2-column Grid: Alta/Edición (Left) + Inventario & Trazabilidad (Right) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* LEFT COLUMN: Formulario de Alta y Clasificación */}
        <form
          onSubmit={handleSubmitForm}
          className="xl:col-span-4 bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4 h-fit"
        >
          <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-800">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                {editingId ? (
                  <Edit3 className="w-4 h-4 text-cyan-400" />
                ) : (
                  <Plus className="w-4 h-4 text-emerald-400" />
                )}
                <span>
                  {editingId
                    ? 'Editar Dispositivo Registrado'
                    : 'Registrar Nuevo Dispositivo IoT'}
                </span>
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Exclusivo SuperAdmin y Admin MineSafe. Clasifica el ID único de hardware como Gateway o Nodo.
              </p>
            </div>
            {(editingId || attachingRTDB) && (
              <button
                type="button"
                onClick={resetForm}
                className="text-[11px] text-slate-400 hover:text-white underline shrink-0 cursor-pointer"
              >
                Cancelar
              </button>
            )}
          </div>

          <div className="space-y-3 text-xs">
            {/* ID de Hardware */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-slate-300 font-semibold">
                  ID Único de Hardware (ESP32 / MAC / RTDB) *
                </label>
                {!editingId && cleanPreviewId.length >= 3 && (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                      isDuplicateId
                        ? 'bg-rose-950 text-rose-300 border-rose-700'
                        : existsOnlyInRTDB
                        ? 'bg-amber-950 text-amber-300 border-amber-700'
                        : 'bg-emerald-950 text-emerald-300 border-emerald-700'
                    }`}
                  >
                    {isDuplicateId
                      ? 'ID duplicado'
                      : existsOnlyInRTDB
                      ? 'Detectado en RTDB'
                      : 'ID disponible'}
                  </span>
                )}
              </div>
              <input
                type="text"
                value={hardwareId}
                onChange={(e) => setHardwareId(e.target.value)}
                disabled={Boolean(editingId)}
                placeholder="Ej: device_38A839E81F84 o NODO_U-05"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono disabled:opacity-60"
                required
              />
            </div>

            {/* Tipo obligatorio: Gateway o Nodo */}
            <div>
              <label className="text-slate-300 font-semibold block mb-1.5">
                Rol en la Red (Obligatorio) *
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDeviceCategory('gateway')}
                  className={`p-2.5 rounded-xl border font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                    deviceCategory === 'gateway'
                      ? 'bg-sky-950/90 border-sky-500 text-sky-200'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <Router className="w-4 h-4" />
                  <span>Gateway</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDeviceCategory('nodo')}
                  className={`p-2.5 rounded-xl border font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                    deviceCategory === 'nodo'
                      ? 'bg-emerald-950/90 border-emerald-500 text-emerald-200'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <Radio className="w-4 h-4" />
                  <span>Nodo Sensor</span>
                </button>
              </div>
            </div>

            {/* Nombre descriptivo */}
            <div>
              <label className="text-slate-300 font-semibold block mb-1">
                Nombre / Etiqueta del Equipo *
              </label>
              <input
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder={
                  deviceCategory === 'gateway'
                    ? 'Ej: Gateway Concentrador Norte 01'
                    : 'Ej: Nodo Ambiental Galería Sur 04'
                }
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                required
              />
            </div>

            {/* Estado Inicial / Asignación */}
            <div className="pt-2 border-t border-slate-800 space-y-2.5">
              <label className="text-slate-300 font-semibold block">
                Estado Inicial / Destino de Asignación
              </label>
              <div className="grid grid-cols-1 gap-1.5">
                {(
                  [
                    {
                      id: 'inventario',
                      title: 'Dejar en Inventario (Sin asignar)',
                      desc: 'Disponible en bodega MineSafe hasta su asignación a cliente.',
                    },
                    {
                      id: 'empresa',
                      title: 'Asignar a Empresa',
                      desc: 'El Admin de la empresa luego lo distribuye a sus faenas y sectores.',
                    },
                    {
                      id: 'faena',
                      title: 'Asignar directamente a Empresa + Faena',
                      desc: 'Vincula inmediatamente el equipo a una faena operativa específica.',
                    },
                  ] as Array<{ id: InitialAssignMode; title: string; desc: string }>
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setInitialMode(opt.id);
                      if (opt.id === 'inventario') {
                        setFormOrgId('');
                        setFormSiteId('');
                      } else if (opt.id === 'empresa') {
                        setFormSiteId('');
                      }
                    }}
                    className={`text-left p-2.5 rounded-xl border transition-colors cursor-pointer ${
                      initialMode === opt.id
                        ? 'bg-cyan-950/60 border-cyan-500/80 text-white'
                        : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="font-bold text-xs">{opt.title}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>

              {initialMode !== 'inventario' && (
                <div className="space-y-2.5 pt-1">
                  <div>
                    <label className="text-[11px] text-slate-300 font-semibold block mb-1">
                      Empresa Destino *
                    </label>
                    <select
                      value={formOrgId}
                      onChange={(e) => {
                        setFormOrgId(e.target.value);
                        setFormSiteId('');
                      }}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                      required
                    >
                      <option value="">Selecciona una empresa...</option>
                      {organizations.map((org) => (
                        <option key={org.id} value={org.id}>
                          {org.name} ({org.rut || org.id})
                        </option>
                      ))}
                    </select>
                  </div>

                  {initialMode === 'faena' && (
                    <div>
                      <label className="text-[11px] text-slate-300 font-semibold block mb-1">
                        Faena Destino *
                      </label>
                      <select
                        value={formSiteId}
                        onChange={(e) => setFormSiteId(e.target.value)}
                        disabled={!formOrgId}
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white disabled:opacity-50"
                        required
                      >
                        <option value="">
                          {formOrgId
                            ? formSites.length > 0
                              ? 'Selecciona una faena...'
                              : 'Esta empresa no tiene faenas creadas aún'
                            : 'Primero selecciona una empresa'}
                        </option>
                        {formSites.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.region || s.location})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>

            {deviceCategory === 'nodo' && (
              <div>
                <label className="text-slate-300 font-semibold block mb-1">
                  Gateway Padre ESP-NOW (Opcional)
                </label>
                <select
                  value={parentGatewayId}
                  onChange={(e) => setParentGatewayId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                >
                  <option value="">Sin Gateway Padre asignado todavía</option>
                  {gatewayOptions.map((gw) => (
                    <option key={gw.id} value={gw.id}>
                      {gw.name} ({gw.id})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">
                  IP Local (Opcional)
                </label>
                <input
                  type="text"
                  value={localIp}
                  onChange={(e) => setLocalIp(e.target.value)}
                  placeholder="192.168.4.1"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-cyan-300 font-mono"
                />
              </div>
              <div>
                <label className="text-slate-300 font-semibold block mb-1">
                  Nota de Trazabilidad
                </label>
                <input
                  type="text"
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                  placeholder="Ej: Lote Q2 / Contrato #45"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || isDuplicateId || !cleanPreviewId}
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              {editingId ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              <span>
                {isSubmitting
                  ? 'Guardando en Firebase RTDB...'
                  : editingId
                  ? 'Guardar Cambios del Dispositivo'
                  : 'Registrar Dispositivo IoT'}
              </span>
            </button>
          </div>
        </form>

        {/* RIGHT COLUMN: Inventario, Filtros, Trazabilidad y Traslados */}
        <div className="xl:col-span-8 bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Package className="w-4 h-4 text-cyan-400" />
                <span>
                  Catálogo Global, Asignaciones y Trazabilidad ({filteredDevices.length} de{' '}
                  {normalizedCatalog.length})
                </span>
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Visualiza a qué Empresa o Faena pertenece cada Gateway/Nodo, verifica su estado en vivo y realiza traslados o devoluciones a inventario.
              </p>
            </div>
          </div>

          {/* Filter Toolbar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 text-xs">
            <div className="relative lg:col-span-2">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por ID, nombre, empresa o faena..."
                className="w-full pl-8 pr-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
              />
            </div>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
            >
              <option value="todos">Estado: Todos</option>
              <option value="en_inventario">En Inventario (Sin asignar)</option>
              <option value="asignado_empresa">Asignado a Empresa</option>
              <option value="asignado_faena">Asignado a Faena</option>
              <option value="asignado_sector">Vinculado a Sector</option>
            </select>

            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value as any)}
              className="px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
            >
              <option value="todos">Tipo: Todos</option>
              <option value="gateway">Solo Gateways</option>
              <option value="nodo">Solo Nodos</option>
            </select>

            <select
              value={filterOrgId}
              onChange={(e) => {
                setFilterOrgId(e.target.value);
                setFilterSiteId('todos');
              }}
              className="px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
            >
              <option value="todos">Empresa: Todas</option>
              <option value={UNASSIGNED_DEVICE_ORG_ID}>Sin asignar (Inventario)</option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>

          {filterSites.length > 0 && filterOrgId !== UNASSIGNED_DEVICE_ORG_ID && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[11px] text-slate-400">Filtrar por Faena:</span>
              <select
                value={filterSiteId}
                onChange={(e) => setFilterSiteId(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs"
              >
                <option value="todos">Todas las faenas</option>
                {filterSites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Devices List */}
          <div className="space-y-3 max-h-[720px] overflow-y-auto pr-1">
            {filteredDevices.length === 0 ? (
              <div className="p-8 text-center rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400">
                No se encontraron dispositivos con los filtros seleccionados.
              </div>
            ) : (
              filteredDevices.map((dev) => {
                const live = rtdbMap.get(dev.id);
                const isOnline = Boolean(live?.gatewayOnline);
                const isNode = dev.category === 'nodo' || dev.category === 'sensor';
                const status = dev.assignmentStatus || resolveDeviceAssignmentStatus(dev);
                const statusMeta = STATUS_META[status];
                const isUnassigned = isUnassignedDeviceOrg(dev.organizationId);
                const isTransferOpen = transferDeviceId === dev.id;
                const isHistoryOpen = expandedHistoryId === dev.id;
                const historyEntries = dev.assignmentHistory || [];

                return (
                  <div
                    key={dev.id}
                    className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3"
                  >
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                              isNode
                                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700'
                                : 'bg-sky-950/80 text-sky-300 border-sky-700'
                            }`}
                          >
                            {isNode ? 'Nodo' : 'Gateway'}
                          </span>
                          <span className="font-bold text-sm text-white truncate">
                            {dev.name}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${statusMeta.badgeClass}`}
                          >
                            {statusMeta.label}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                              isOnline
                                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700'
                                : live && (live.lastUpdateServer || 0) > 0
                                ? 'bg-slate-900 text-slate-400 border-slate-700'
                                : 'bg-slate-900/70 text-slate-500 border-slate-800'
                            }`}
                          >
                            {isOnline ? (
                              <Wifi className="w-3 h-3" />
                            ) : (
                              <WifiOff className="w-3 h-3" />
                            )}
                            <span>
                              {isOnline
                                ? 'En línea'
                                : live && (live.lastUpdateServer || 0) > 0
                                ? 'Desconectado'
                                : 'Pendiente hardware'}
                            </span>
                          </span>
                        </div>

                        <div className="text-[11px] font-mono text-cyan-300/90 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                          <span>ID: {dev.id}</span>
                          {dev.parentGatewayId && (
                            <span className="text-slate-400">
                              Gateway Padre: <strong className="text-slate-200">{dev.parentGatewayId}</strong>
                            </span>
                          )}
                          {dev.localIp && (
                            <span className="text-slate-500">IP: {dev.localIp}</span>
                          )}
                        </div>

                        <div className="text-[11px] text-slate-300 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="inline-flex items-center gap-1">
                            <Building2 className="w-3 h-3 text-slate-500" />
                            <span>Empresa:</span>
                            <strong className={isUnassigned ? 'text-amber-300' : 'text-white'}>
                              {isUnassigned
                                ? 'Sin asignar (Inventario Global)'
                                : dev.organizationName || dev.organizationId}
                            </strong>
                          </span>
                          {!isUnassigned && (
                            <>
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-slate-500" />
                                <span>Faena:</span>
                                <strong className="text-indigo-200">
                                  {dev.siteName || 'Sin faena específica'}
                                </strong>
                              </span>
                              <span>
                                Sector:{' '}
                                <strong className="text-emerald-300">
                                  {dev.sectorName || 'Pendiente'}
                                </strong>
                              </span>
                            </>
                          )}
                        </div>

                        {(dev.assignedBy || dev.assignedAt) && (
                          <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                            <Clock className="w-3 h-3" />
                            <span>
                              Última actualización: {formatShortDateTime(dev.assignedAt)} por{' '}
                              {dev.assignedBy || 'Sistema'}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={busyDeviceId === dev.id}
                          onClick={() =>
                            isTransferOpen ? setTransferDeviceId(null) : handleOpenTransfer(dev)
                          }
                          className="px-2.5 py-1.5 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-700 text-cyan-200 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                          <span>{isUnassigned ? 'Asignar' : 'Trasladar'}</span>
                        </button>

                        {!isUnassigned && (
                          <button
                            type="button"
                            disabled={busyDeviceId === dev.id}
                            onClick={() => handleUnassignToInventory(dev)}
                            className="px-2.5 py-1.5 rounded-lg bg-amber-950/70 hover:bg-amber-900 border border-amber-700/80 text-amber-200 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                            title="Desasignar y devolver al inventario global sin borrar el equipo"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>A Inventario</span>
                          </button>
                        )}

                        {historyEntries.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedHistoryId(isHistoryOpen ? null : dev.id)
                            }
                            className="px-2 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                            title="Ver trazabilidad de asignaciones y traslados"
                          >
                            <History className="w-3.5 h-3.5" />
                            <span>{historyEntries.length}</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleStartEdit(dev)}
                          className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 cursor-pointer"
                          title="Editar ficha del dispositivo"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        {confirmDeleteId === dev.id ? (
                          <div className="inline-flex items-center gap-1 bg-rose-950/90 border border-rose-700 rounded-lg px-2 py-1">
                            <button
                              type="button"
                              onClick={() => handleDeleteFromCatalog(dev.id)}
                              className="text-[10px] font-bold text-rose-200 hover:text-white cursor-pointer"
                            >
                              Confirmar
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="text-[10px] text-slate-400 hover:text-white cursor-pointer"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(dev.id)}
                            className="p-1.5 rounded-lg bg-rose-950/50 hover:bg-rose-900 border border-rose-800/70 text-rose-300 cursor-pointer"
                            title="Quitar del catálogo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Inline Transfer / Assignment Drawer */}
                    {isTransferOpen && (
                      <div className="p-3.5 rounded-xl bg-slate-900/95 border border-cyan-700/70 space-y-3 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-cyan-200">
                            {isUnassigned
                              ? `Asignar ${dev.id} a Empresa o Faena`
                              : `Reasignar / Trasladar ${dev.id}`}
                          </span>
                          <button
                            type="button"
                            onClick={() => setTransferDeviceId(null)}
                            className="text-slate-400 hover:text-white cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          Al cambiar de empresa o faena, se limpiarán automáticamente los vínculos anteriores de cuadrilla y sector para evitar datos huérfanos.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <select
                            value={transferOrgId}
                            onChange={(e) => {
                              setTransferOrgId(e.target.value);
                              setTransferSiteId('');
                            }}
                            className="px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                          >
                            <option value="">Selecciona Empresa destino...</option>
                            {organizations.map((org) => (
                              <option key={org.id} value={org.id}>
                                {org.name}
                              </option>
                            ))}
                          </select>
                          <select
                            value={transferSiteId}
                            onChange={(e) => setTransferSiteId(e.target.value)}
                            disabled={!transferOrgId}
                            className="px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white disabled:opacity-50"
                          >
                            <option value="">Solo a Empresa (Admin distribuye luego)</option>
                            {transferSites.map((s) => (
                              <option key={s.id} value={s.id}>
                                Faena: {s.name}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={transferNote}
                            onChange={(e) => setTransferNote(e.target.value)}
                            placeholder="Motivo de traslado / contrato (opcional)"
                            className="px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                          />
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setTransferDeviceId(null)}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold cursor-pointer"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            disabled={busyDeviceId === dev.id || !transferOrgId}
                            onClick={() => handleConfirmTransfer(dev)}
                            className="px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>
                              {busyDeviceId === dev.id
                                ? 'Aplicando...'
                                : 'Confirmar Asignación / Traslado'}
                            </span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Expandable Traceability History */}
                    {isHistoryOpen && historyEntries.length > 0 && (
                      <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2 text-[11px]">
                        <div className="font-bold text-slate-300 flex items-center gap-1.5">
                          <History className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Historial de Trazabilidad del Equipo</span>
                        </div>
                        <div className="space-y-1.5 max-h-44 overflow-y-auto">
                          {historyEntries.map((h, idx) => (
                            <div
                              key={`${h.timestamp}-${idx}`}
                              className="p-2 rounded-lg bg-slate-950/70 border border-slate-800/80 flex flex-wrap items-center justify-between gap-2"
                            >
                              <div className="space-y-0.5">
                                <div className="text-slate-200 font-semibold">
                                  <span className="uppercase text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 mr-1.5">
                                    {h.action}
                                  </span>
                                  {h.note || `${h.toOrganizationName || 'Inventario'}`}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  Por {h.actorName} ({h.actorRole})
                                  {h.toOrganizationName ? ` · Destino: ${h.toOrganizationName}` : ''}
                                  {h.toSiteName ? ` / ${h.toSiteName}` : ''}
                                </div>
                              </div>
                              <span className="text-[10px] font-mono text-slate-500">
                                {formatShortDateTime(h.timestamp)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
