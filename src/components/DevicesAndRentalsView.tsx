import React, { useState, useEffect, useMemo } from 'react';
import { 
  Cpu, 
  Users, 
  FileText, 
  CreditCard, 
  Plus, 
  Search, 
  Filter, 
  CheckCircle, 
  AlertCircle, 
  Clock, 
  DollarSign, 
  Calendar, 
  UserCheck, 
  Battery, 
  Phone,
  Shield,
  Download,
  Lock,
  Edit2,
  X,
  Building2
} from 'lucide-react';
import {
  DeviceRental,
  WorkerAssignment,
  SensorDevice,
  UserProfile,
  PlatformConfig,
  EquiposSubTab,
  MiningCrew,
  MiningSite,
  Organization,
  CrewMember,
  RegisteredDeviceConfig
} from '../types';
import { PRELOADED_CREWS } from '../data/chileGeography';
import { soundAlert } from '../services/audioAlert';
import {
  DEFAULT_ORGANIZATION,
  isEquiposSubTabVisibleForUser,
  isSectionVisibleForUser,
} from '../services/firebase';
import {
  assignWorkersToCrew,
  canManageContractsAndPayments,
  isGlobalMineSafeAdmin,
} from '../utils/accessControl';
import { CrewManagementSection } from './CrewManagementSection';
import { DeviceRegistryAndAssignmentPanel } from './DeviceRegistryAndAssignmentPanel';
import { OrganizationsManagerPanel } from './OrganizationsManagerPanel';
import { validateChileanRut, validateEmergencyPhone } from '../utils/rut';
import { RutInput } from './RutInput';

interface DevicesAndRentalsViewProps {
  rentals: DeviceRental[];
  assignments: WorkerAssignment[];
  devices: SensorDevice[];
  catalogDevices?: RegisteredDeviceConfig[];
  rtdbDevices?: SensorDevice[];
  crews?: MiningCrew[];
  usersList?: UserProfile[];
  allSites?: MiningSite[];
  organizations?: Organization[];
  currentUser?: UserProfile | null;
  platformConfig?: PlatformConfig;
  activeOrganizationId?: string;
  onAddAssignment: (assignment: Omit<WorkerAssignment, 'id'>) => Promise<void> | void;
  onAddRentalContract: (contract: Omit<DeviceRental, 'id'>) => Promise<void> | void;
  onUpdateRentalContract?: (contractId: string, updates: Partial<DeviceRental>) => Promise<DeviceRental | void> | void;
  onRecordPayment: (contractId: string) => Promise<void> | void;
  onSaveCrew?: (crew: MiningCrew) => Promise<void> | void;
  onDeleteCrew?: (crewId: string, organizationId: string) => Promise<void> | void;
  onSelectOrganization?: (orgId: string) => void;
  onOrganizationsChanged?: (org: Organization, deletedId?: string) => void;
  onCatalogDeviceUpdated?: (saved: RegisteredDeviceConfig) => void;
  onCatalogDeviceDeleted?: (deviceId: string) => void;
}

const EQUIPOS_SUBTAB_ORDER: EquiposSubTab[] = [
  'asignaciones',
  'arriendos',
  'pagos',
  'inventario',
  'dispositivos',
  'empresas',
];

export const DevicesAndRentalsView: React.FC<DevicesAndRentalsViewProps> = ({
  rentals,
  assignments,
  devices,
  catalogDevices,
  rtdbDevices,
  crews = [],
  usersList = [],
  allSites = [],
  organizations = [],
  currentUser = null,
  platformConfig,
  activeOrganizationId,
  onAddAssignment,
  onAddRentalContract,
  onUpdateRentalContract,
  onRecordPayment,
  onSaveCrew,
  onDeleteCrew,
  onSelectOrganization,
  onOrganizationsChanged,
  onCatalogDeviceUpdated,
  onCatalogDeviceDeleted,
}) => {
  const effectiveCatalogDevices = useMemo<RegisteredDeviceConfig[]>(
    () => catalogDevices || platformConfig?.registeredDevices || [],
    [catalogDevices, platformConfig?.registeredDevices]
  );
  const enabledCatalogCount = useMemo(
    () => effectiveCatalogDevices.filter((d) => d.enabled !== false).length,
    [effectiveCatalogDevices]
  );

  const [activeSubTab, setActiveSubTab] = useState<EquiposSubTab>('asignaciones');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showNewContractModal, setShowNewContractModal] = useState(false);
  const [editingContract, setEditingContract] = useState<DeviceRental | null>(null);

  const isGlobalAdmin = isGlobalMineSafeAdmin(currentUser?.role);

  const allowedSubTabs = useMemo<EquiposSubTab[]>(() => {
    if (!currentUser) return EQUIPOS_SUBTAB_ORDER;
    return EQUIPOS_SUBTAB_ORDER.filter((tab) => {
      // MS-07: Global device catalog & multi-company manager are strictly for MineSafe global admins.
      if ((tab === 'dispositivos' || tab === 'empresas') && !isGlobalAdmin) {
        return false;
      }
      return isEquiposSubTabVisibleForUser(tab, currentUser, platformConfig);
    });
  }, [currentUser, platformConfig, isGlobalAdmin]);

  useEffect(() => {
    if (allowedSubTabs.length > 0 && !allowedSubTabs.includes(activeSubTab)) {
      setActiveSubTab(allowedSubTabs[0]);
    }
  }, [allowedSubTabs, activeSubTab]);

  const canViewSubTab = (subTab: EquiposSubTab) => allowedSubTabs.includes(subTab);
  const showHeaderKpis = isSectionVisibleForUser('eq_header_kpis', currentUser, platformConfig);
  const showSubtabBar = isSectionVisibleForUser('eq_subtab_bar', currentUser, platformConfig);

  // New assignment form state
  const [selectedExistingUserId, setSelectedExistingUserId] = useState('');
  const [newWorkerName, setNewWorkerName] = useState('');
  const [newWorkerRut, setNewWorkerRut] = useState('');
  const [newRole, setNewRole] = useState('Operador Subterráneo');
  const [newCrew, setNewCrew] = useState('Cuadrilla Alfa - Turno A');
  const [newCrewSelectMode, setNewCrewSelectMode] = useState<string>('Cuadrilla Alfa - Turno A');
  const [newSector, setNewSector] = useState('Socavón Norte Frente de Avance');
  const [newSelectedDeviceCode, setNewSelectedDeviceCode] = useState(devices[0]?.code || 'MS-GAS-101');
  const [newEmergencyContactName, setNewEmergencyContactName] = useState('');
  const [newEmergencyContactPhone, setNewEmergencyContactPhone] = useState('');

  const crewSelectOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: Array<{ label: string; value: string; crewObj?: MiningCrew }> = [];
    crews.forEach((c) => {
      const val = c.name.trim();
      if (val && !seen.has(val.toLowerCase())) {
        seen.add(val.toLowerCase());
        options.push({ label: `${c.code} · ${c.name}`, value: val, crewObj: c });
      }
    });
    PRELOADED_CREWS.forEach((cName) => {
      if (!seen.has(cName.toLowerCase())) {
        seen.add(cName.toLowerCase());
        options.push({ label: cName, value: cName });
      }
    });
    return options;
  }, [crews]);

  // New / edit contract form state
  const [newContractNumber, setNewContractNumber] = useState('');
  const [newDeviceCode, setNewDeviceCode] = useState('');
  const [newDeviceType, setNewDeviceType] = useState('Detector Portátil MultiGas 4-Canales');
  const [newProvider, setNewProvider] = useState('Dräger Safety Chile S.A.');
  const [newCostClp, setNewCostClp] = useState(195000);
  const [newStartDate, setNewStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [newEndDate, setNewEndDate] = useState('2026-12-31');
  const [editDeviceCode, setEditDeviceCode] = useState('');
  const [editDeviceType, setEditDeviceType] = useState('');
  const [editProvider, setEditProvider] = useState('');
  const [editCostClp, setEditCostClp] = useState(0);
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editPaymentStatus, setEditPaymentStatus] = useState<DeviceRental['paymentStatus']>('al_dia');
  const [editTechnician, setEditTechnician] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const [actionNotice, setActionNotice] = useState<{ text: string; tone: 'error' | 'success' } | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canManageContracts = useMemo(
    () => canManageContractsAndPayments(currentUser).allowed,
    [currentUser]
  );

  // Filtrar dispositivos deshabilitados en el catálogo maestro para nuevas asignaciones o contratos
  const enabledDeviceIds = useMemo(() => {
    const regList = platformConfig?.registeredDevices || [];
    if (regList.length === 0) return null;
    const disabledSet = new Set(regList.filter((r) => r.enabled === false).map((r) => r.id));
    return disabledSet;
  }, [platformConfig?.registeredDevices]);

  const activeInventoryDevices = useMemo(
    () => (enabledDeviceIds ? devices.filter((d) => !enabledDeviceIds.has(d.id)) : devices),
    [devices, enabledDeviceIds]
  );

  const effectiveOrgId =
    activeOrganizationId && activeOrganizationId !== 'all'
      ? activeOrganizationId
      : DEFAULT_ORGANIZATION.id;

  const orgAssignableUsers = useMemo(
    () =>
      usersList.filter(
        (u) =>
          u.status === 'activo' &&
          u.role !== 'superadmin' &&
          (activeOrganizationId === 'all' ||
            (u.organizationId || DEFAULT_ORGANIZATION.id) === effectiveOrgId)
      ),
    [usersList, activeOrganizationId, effectiveOrgId]
  );

  const assignedDeviceByCode = useMemo(() => {
    const map = new Map<string, WorkerAssignment>();
    assignments.forEach((a) => {
      if (a.assignedDeviceCode) {
        map.set(a.assignedDeviceCode.trim().toLowerCase(), a);
      }
    });
    return map;
  }, [assignments]);

  const showTempNotice = (text: string, tone: 'error' | 'success') => {
    setActionNotice({ text, tone });
    setTimeout(() => {
      setActionNotice((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  };

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkerName.trim() || !newWorkerRut.trim()) {
      setModalError('El nombre completo y RUT del trabajador son obligatorios.');
      return;
    }
    if (!canManageContracts) {
      setModalError('Solo un Administrador o SuperAdministrador autorizado puede asignar equipos.');
      return;
    }

    const selectedDev = activeInventoryDevices.find((d) => d.code === newSelectedDeviceCode) || activeInventoryDevices[0];
    if (!selectedDev) {
      setModalError('No hay dispositivos habilitados disponibles para asignar.');
      return;
    }

    try {
      setIsSubmitting(true);
      setModalError(null);
      const rutCheck = validateChileanRut(newWorkerRut);
      if (!rutCheck.valid) {
        setModalError(rutCheck.error || 'El RUT del operador no es válido según Módulo 11.');
        return;
      }
      const formattedWorkerRut = rutCheck.formatted!;

      const phoneCheck = validateEmergencyPhone(newEmergencyContactPhone);
      if (!phoneCheck.valid) {
        setModalError(phoneCheck.error || 'El teléfono de emergencia debe ser un número válido.');
        return;
      }

      const existingDevHolder = assignedDeviceByCode.get(selectedDev.code.trim().toLowerCase());
      if (
        existingDevHolder &&
        (existingDevHolder.workerRut || '').trim().toLowerCase() !== formattedWorkerRut.toLowerCase()
      ) {
        setModalError(
          `El sensor "${selectedDev.code}" ya se encuentra asignado a ${existingDevHolder.workerName} (${existingDevHolder.workerRut}). Selecciona otro dispositivo libre.`
        );
        return;
      }

      const cleanEmergencyName = newEmergencyContactName.trim();
      const formattedEmergencyContact = cleanEmergencyName
        ? `${cleanEmergencyName} · ${phoneCheck.formatted}`
        : phoneCheck.formatted!;

      const chosenCrewName =
        (newCrewSelectMode === '__custom__' ? newCrew : newCrewSelectMode).trim() ||
        'Cuadrilla General';
      const matchedCrew = crews.find(
        (c) => c.name.trim().toLowerCase() === chosenCrewName.toLowerCase()
      );

      await onAddAssignment({
        organizationId: effectiveOrgId,
        userId: selectedExistingUserId || undefined,
        crewId: matchedCrew?.id,
        workerName: newWorkerName.trim(),
        workerRut: formattedWorkerRut,
        role: newRole.trim(),
        crew: chosenCrewName,
        sectorName: matchedCrew?.sectorName || newSector.trim(),
        assignedDeviceId: selectedDev.id,
        assignedDeviceCode: selectedDev.code,
        assignmentDate: new Date().toISOString().split('T')[0],
        deviceBattery: selectedDev.batteryPct,
        emergencyContact: formattedEmergencyContact,
      });

      if (matchedCrew && onSaveCrew) {
        const cleanRut = formattedWorkerRut.toLowerCase();
        const alreadyMember = (matchedCrew.members || []).some(
          (m) =>
            (selectedExistingUserId && m.userId === selectedExistingUserId) ||
            (cleanRut && (m.rut || '').trim().toLowerCase() === cleanRut) ||
            m.name.trim().toLowerCase() === newWorkerName.trim().toLowerCase()
        );
        if (!alreadyMember) {
          const newMember: CrewMember = {
            id: `mbr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            userId: selectedExistingUserId || undefined,
            name: newWorkerName.trim(),
            rut: formattedWorkerRut,
            role: newRole.trim() || 'Operador Subterráneo',
            assignedDeviceCode: selectedDev.code,
            emergencyContact: formattedEmergencyContact,
            isLeader: false,
            addedAt: Date.now(),
          };
          await onSaveCrew(
            assignWorkersToCrew(matchedCrew, [...(matchedCrew.members || []), newMember])
          );
        }
      }

      soundAlert.playFeedbackBeep();
      setShowAssignModal(false);
      setSelectedExistingUserId('');
      setNewWorkerName('');
      setNewWorkerRut('');
      setNewEmergencyContactName('');
      setNewEmergencyContactPhone('');
      showTempNotice('Asignación de equipo guardada en Firebase RTDB.', 'success');
    } catch (err: any) {
      setModalError(err?.message || 'No se pudo guardar la asignación.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const validateContractDeviceCompat = (cleanDevCode: string, orgId: string): string | null => {
    const matchedReg = (platformConfig?.registeredDevices || []).find(
      (r) => r.id.toLowerCase() === cleanDevCode.toLowerCase() || r.name.toLowerCase() === cleanDevCode.toLowerCase()
    );
    if (matchedReg) {
      if (matchedReg.enabled === false) {
        return `El dispositivo "${cleanDevCode}" se encuentra deshabilitado en la plataforma.`;
      }
      if (matchedReg.organizationId && matchedReg.organizationId !== orgId) {
        return `El dispositivo "${cleanDevCode}" pertenece a otra organización (${matchedReg.organizationId}).`;
      }
    }
    return null;
  };

  const handleCreateContract = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanContractNum = newContractNumber.trim();
    const cleanDevCode = newDeviceCode.trim();
    if (!cleanContractNum || !cleanDevCode) {
      setModalError('Número de contrato y código del dispositivo son obligatorios.');
      return;
    }
    if (!canManageContracts) {
      setModalError('Permisos insuficientes: solo Administradores o SuperAdministrador pueden crear contratos.');
      return;
    }
    if (!Number.isFinite(Number(newCostClp)) || Number(newCostClp) <= 0) {
      setModalError('El costo mensual (CLP) debe ser mayor a 0.');
      return;
    }
    if (newStartDate && newEndDate && newEndDate < newStartDate) {
      setModalError('La fecha de término de vigencia no puede ser anterior a la fecha de inicio.');
      return;
    }
    if (rentals.some((r) => r.contractNumber.toLowerCase() === cleanContractNum.toLowerCase())) {
      setModalError(`Ya existe un contrato activo con el número "${cleanContractNum}".`);
      return;
    }
    const compatErr = validateContractDeviceCompat(cleanDevCode, effectiveOrgId);
    if (compatErr) {
      setModalError(compatErr);
      return;
    }

    try {
      setIsSubmitting(true);
      setModalError(null);
      await onAddRentalContract({
        organizationId: effectiveOrgId,
        contractNumber: cleanContractNum,
        deviceCode: cleanDevCode,
        deviceType: newDeviceType.trim(),
        provider: newProvider.trim(),
        startDate: newStartDate || new Date().toISOString().split('T')[0],
        endDate: newEndDate,
        monthlyCostClp: Number(newCostClp),
        paymentStatus: 'al_dia',
        lastPaymentDate: new Date().toISOString().split('T')[0],
        nextDueDate: newEndDate,
        assignedTechnician: 'Gonzalo Vergara',
        notes: 'Contrato nuevo incorporado al sistema de control MineSafe.',
      });

      soundAlert.playFeedbackBeep();
      setShowNewContractModal(false);
      setNewContractNumber('');
      setNewDeviceCode('');
      showTempNotice(`Contrato ${cleanContractNum} registrado y validado en RTDB.`, 'success');
    } catch (err: any) {
      setModalError(err?.message || 'Error al guardar el contrato en Firebase RTDB.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditContractModal = (rental: DeviceRental) => {
    setModalError(null);
    setEditingContract(rental);
    setEditDeviceCode(rental.deviceCode);
    setEditDeviceType(rental.deviceType);
    setEditProvider(rental.provider);
    setEditCostClp(rental.monthlyCostClp);
    setEditStartDate(rental.startDate);
    setEditEndDate(rental.endDate);
    setEditPaymentStatus(rental.paymentStatus);
    setEditTechnician(rental.assignedTechnician);
    setEditNotes(rental.notes || '');
  };

  const handleSaveEditedContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingContract || !onUpdateRentalContract) return;
    if (!canManageContracts) {
      setModalError('Permisos insuficientes para editar contratos.');
      return;
    }
    const cleanDevCode = editDeviceCode.trim();
    if (!cleanDevCode || !editProvider.trim()) {
      setModalError('El código del dispositivo y el proveedor son obligatorios.');
      return;
    }
    if (!Number.isFinite(Number(editCostClp)) || Number(editCostClp) <= 0) {
      setModalError('El costo mensual (CLP) debe ser mayor a 0.');
      return;
    }
    if (editStartDate && editEndDate && editEndDate < editStartDate) {
      setModalError('La fecha de término de vigencia no puede ser anterior a la fecha de inicio.');
      return;
    }
    const compatErr = validateContractDeviceCompat(
      cleanDevCode,
      editingContract.organizationId || effectiveOrgId
    );
    if (compatErr) {
      setModalError(compatErr);
      return;
    }

    try {
      setIsSubmitting(true);
      setModalError(null);
      await onUpdateRentalContract(editingContract.id, {
        deviceCode: cleanDevCode,
        deviceType: editDeviceType.trim() || editingContract.deviceType,
        provider: editProvider.trim(),
        monthlyCostClp: Number(editCostClp),
        startDate: editStartDate,
        endDate: editEndDate,
        nextDueDate: editEndDate,
        paymentStatus: editPaymentStatus,
        assignedTechnician: editTechnician.trim() || 'Ingeniería MineSafe',
        notes: editNotes.trim(),
      });
      soundAlert.playFeedbackBeep();
      showTempNotice(`Contrato ${editingContract.contractNumber} actualizado en Firebase RTDB.`, 'success');
      setEditingContract(null);
    } catch (err: any) {
      setModalError(err?.message || 'Error al actualizar el contrato en Firebase RTDB.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatClp = (amount: number) => {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(amount);
  };

  const getPaymentStatusBadge = (status: DeviceRental['paymentStatus']) => {
    switch (status) {
      case 'al_dia':
        return (
          <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
            Al Día
          </span>
        );
      case 'proximo_a_vencer':
        return (
          <span className="text-[11px] font-semibold text-amber-300 bg-amber-950 px-2 py-0.5 rounded border border-amber-800">
            Próximo a Vencer
          </span>
        );
      case 'pago_pendiente':
        return (
          <span className="text-[11px] font-semibold text-rose-300 bg-rose-950 px-2 py-0.5 rounded border border-rose-800">
            Pago Pendiente
          </span>
        );
      default:
        return (
          <span className="text-[11px] font-semibold text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-700">
            Vencido
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      {(showHeaderKpis || showSubtabBar || actionNotice) && (
      <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-6">
        {showHeaderKpis && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Cpu className="w-5 h-5 text-cyan-400" />
              Equipos de Seguridad y Gestión de Arriendos
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Control de detectores personales asignados a cuadrillas, contratos de arriendo y pagos con proveedores.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {activeSubTab === 'asignaciones' && canViewSubTab('asignaciones') && canManageContracts && (
              <button
                onClick={() => {
                  setModalError(null);
                  if (crewSelectOptions.length > 0) {
                    setNewCrewSelectMode(crewSelectOptions[0].value);
                    setNewCrew(crewSelectOptions[0].value);
                  }
                  setShowAssignModal(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Asignar Sensor a Operador
              </button>
            )}

            {((activeSubTab === 'arriendos' && canViewSubTab('arriendos')) ||
              (activeSubTab === 'pagos' && canViewSubTab('pagos'))) &&
              canManageContracts && (
              <button
                onClick={() => {
                  setModalError(null);
                  setShowNewContractModal(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Nuevo Contrato
              </button>
            )}
          </div>
        </div>
        )}

        {actionNotice && (
          <div
            className={`mt-4 p-3 rounded-lg border text-xs flex items-center gap-2 ${
              actionNotice.tone === 'error'
                ? 'bg-rose-950/80 border-rose-800 text-rose-200'
                : 'bg-emerald-950/80 border-emerald-800 text-emerald-200'
            }`}
          >
            {actionNotice.tone === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span>{actionNotice.text}</span>
          </div>
        )}

        {/* Sub Navigation Tabs */}
        {showSubtabBar && (
        <div className={`flex flex-wrap items-center gap-2 ${showHeaderKpis ? 'pt-6 border-t border-slate-800/80 mt-6' : ''}`}>
          {canViewSubTab('asignaciones') && (
            <button
              onClick={() => setActiveSubTab('asignaciones')}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeSubTab === 'asignaciones'
                  ? 'bg-slate-800 text-cyan-300 border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Asignaciones a Cuadrillas ({assignments.length})</span>
            </button>
          )}

          {canViewSubTab('arriendos') && (
            <button
              onClick={() => setActiveSubTab('arriendos')}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeSubTab === 'arriendos'
                  ? 'bg-slate-800 text-cyan-300 border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Contratos de Arriendo ({rentals.length})</span>
            </button>
          )}

          {canViewSubTab('pagos') && (
            <button
              onClick={() => setActiveSubTab('pagos')}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeSubTab === 'pagos'
                  ? 'bg-slate-800 text-cyan-300 border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              <span>Estado de Pagos y Facturas</span>
            </button>
          )}

          {canViewSubTab('inventario') && (
            <button
              onClick={() => setActiveSubTab('inventario')}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeSubTab === 'inventario'
                  ? 'bg-slate-800 text-cyan-300 border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Cpu className="w-4 h-4" />
              <span>Stock de Sensores IoT ({devices.length})</span>
            </button>
          )}

          {canViewSubTab('dispositivos') && (
            <button
              type="button"
              onClick={() => setActiveSubTab('dispositivos')}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors border ${
                activeSubTab === 'dispositivos'
                  ? 'bg-amber-950/90 text-amber-200 border-amber-500 shadow-sm'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Cpu className="w-4 h-4 text-amber-400" />
              <span>Dispositivos (Sensores y Gateways)</span>
              <span className="px-1.5 py-0.5 rounded bg-black/40 text-[10px] font-mono">
                {enabledCatalogCount}
              </span>
            </button>
          )}

          {canViewSubTab('empresas') && (
            <button
              type="button"
              onClick={() => setActiveSubTab('empresas')}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors border ${
                activeSubTab === 'empresas'
                  ? 'bg-cyan-950/90 text-cyan-200 border-cyan-500 shadow-sm'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Building2 className="w-4 h-4 text-cyan-400" />
              <span>Empresas / Organizaciones</span>
              <span className="px-1.5 py-0.5 rounded bg-black/40 text-[10px] font-mono">
                {organizations.length}
              </span>
            </button>
          )}
        </div>
        )}
      </div>
      )}

      {allowedSubTabs.length === 0 ? (
        <div className="p-8 text-center bg-slate-900/80 border border-red-900/50 rounded-2xl max-w-xl mx-auto my-8 shadow-xl">
          <Lock className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-white mb-1.5">
            Sub-ventanas Bloqueadas por el SuperAdministrador
          </h2>
          <p className="text-slate-400 text-xs sm:text-sm">
            Todas las secciones de Equipos y Arriendos han sido restringidas para tu usuario o rol.
          </p>
        </div>
      ) : (
        <>
      {/* ==============================================================
          SUBTAB 1: CUADRILLAS OPERATIVAS Y ASIGNACIONES DE SENSORES
         ============================================================== */}
      {activeSubTab === 'asignaciones' && canViewSubTab('asignaciones') && (
        <div className="space-y-6">
          {onSaveCrew && onDeleteCrew && (
            <CrewManagementSection
              crews={crews}
              usersList={usersList}
              assignments={assignments}
              allSites={allSites}
              devices={activeInventoryDevices}
              organizations={organizations}
              currentUser={currentUser}
              activeOrganizationId={activeOrganizationId}
              onSaveCrew={onSaveCrew}
              onDeleteCrew={onDeleteCrew}
              onAddAssignment={onAddAssignment}
            />
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-cyan-400" />
                Sensores IoT Asignados por Trabajador ({assignments.length})
              </h2>
            </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {assignments.map((item) => (
              <div 
                key={item.id}
                className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-colors space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 flex items-center justify-center font-bold text-xs">
                      {item.workerName.charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">{item.workerName}</h3>
                      <span className="text-[11px] font-mono text-slate-400">{item.workerRut}</span>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono font-bold text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800">
                    {item.assignedDeviceCode}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-slate-300 pt-2 border-t border-slate-800/80">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Rol / Cargo:</span>
                    <span className="font-medium text-white">{item.role}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Cuadrilla:</span>
                    <span className="text-slate-200">{item.crew}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Sector:</span>
                    <span className="text-cyan-400">{item.sectorName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Batería Detector:</span>
                    <span className="font-mono text-emerald-400 font-bold flex items-center gap-1">
                      <Battery className="w-3.5 h-3.5" />
                      {item.deviceBattery}%
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Phone className="w-3 h-3 text-slate-500" />
                    {item.emergencyContact}
                  </span>
                  <span>Asignado: {item.assignmentDate}</span>
                </div>
              </div>
            ))}
          </div>
          </div>
        </div>
      )}

      {/* ==============================================================
          SUBTAB 2: CONTRATOS DE ARRIENDO
         ============================================================== */}
      {activeSubTab === 'arriendos' && canViewSubTab('arriendos') && (
        <div className="space-y-4">
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Contrato #</th>
                    <th className="px-4 py-3">Dispositivo</th>
                    <th className="px-4 py-3">Proveedor</th>
                    <th className="px-4 py-3">Costo Mensual</th>
                    <th className="px-4 py-3">Vigencia</th>
                    <th className="px-4 py-3">Estado Pago</th>
                    <th className="px-4 py-3">Técnico Asignado</th>
                    {canManageContracts && onUpdateRentalContract && (
                      <th className="px-4 py-3">Acciones</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {rentals.map((rental) => (
                    <tr key={rental.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3.5 font-mono font-bold text-cyan-300">{rental.contractNumber}</td>
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-white">{rental.deviceCode}</div>
                        <div className="text-[11px] text-slate-400">{rental.deviceType}</div>
                      </td>
                      <td className="px-4 py-3.5 font-medium text-slate-200">{rental.provider}</td>
                      <td className="px-4 py-3.5 font-mono font-semibold text-white">{formatClp(rental.monthlyCostClp)}</td>
                      <td className="px-4 py-3.5 text-slate-400">
                        {rental.startDate} al {rental.endDate}
                      </td>
                      <td className="px-4 py-3.5">{getPaymentStatusBadge(rental.paymentStatus)}</td>
                      <td className="px-4 py-3.5 text-slate-300">{rental.assignedTechnician}</td>
                      {canManageContracts && onUpdateRentalContract && (
                        <td className="px-4 py-3.5">
                          <button
                            type="button"
                            onClick={() => openEditContractModal(rental)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-[11px] font-semibold"
                          >
                            <Edit2 className="w-3 h-3" />
                            Editar
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==============================================================
          SUBTAB 3: PAGOS Y FACTURACIÓN
         ============================================================== */}
      {activeSubTab === 'pagos' && canViewSubTab('pagos') && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rentals.map((rental) => (
              <div 
                key={rental.id}
                className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-mono text-xs font-bold text-cyan-300">{rental.contractNumber}</span>
                    <h3 className="text-sm font-bold text-white mt-0.5">{rental.provider}</h3>
                  </div>
                  <div>{getPaymentStatusBadge(rental.paymentStatus)}</div>
                </div>

                <div className="p-3 bg-slate-950/70 rounded-lg border border-slate-800 text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Equipo Arrendado:</span>
                    <span className="font-medium text-white">{rental.deviceCode} ({rental.deviceType})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Canon Mensual:</span>
                    <span className="font-mono font-bold text-emerald-400 text-sm">{formatClp(rental.monthlyCostClp)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Último Pago Registrado:</span>
                    <span className="text-slate-300 font-mono">{rental.lastPaymentDate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Próximo Vencimiento:</span>
                    <span className="text-amber-400 font-mono font-semibold">{rental.nextDueDate}</span>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 italic">"{rental.notes}"</p>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                  <span className="text-[11px] text-slate-400">Técnico: {rental.assignedTechnician}</span>
                  {rental.paymentStatus !== 'al_dia' ? (
                    canManageContracts ? (
                      <button
                        onClick={async () => {
                          try {
                            await onRecordPayment(rental.id);
                            showTempNotice(`Pago registrado para el contrato ${rental.contractNumber}.`, 'success');
                          } catch (err: any) {
                            showTempNotice(err?.message || 'Error al registrar el pago en RTDB.', 'error');
                          }
                        }}
                        className="px-3 py-1.5 text-xs font-semibold bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg transition-colors"
                      >
                        Registrar Pago
                      </button>
                    ) : (
                      <span className="text-[11px] text-amber-400 flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Solo Admin
                      </span>
                    )
                  ) : (
                    <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" /> Cuota al día
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ==============================================================
          SUBTAB 4: INVENTARIO DE SENSORES
         ============================================================== */}
      {activeSubTab === 'inventario' && canViewSubTab('inventario') && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Modelo & Nombre</th>
                  <th className="px-4 py-3">Sector</th>
                  <th className="px-4 py-3">Asignado a</th>
                  <th className="px-4 py-3">Batería</th>
                  <th className="px-4 py-3">Señal LoRa</th>
                  <th className="px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {devices.map((device) => (
                  <tr key={device.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3.5 font-mono font-bold text-cyan-300">{device.code}</td>
                    <td className="px-4 py-3.5 font-semibold text-white">{device.name}</td>
                    <td className="px-4 py-3.5 text-slate-300">{device.sectorName}</td>
                    <td className="px-4 py-3.5 text-slate-400">{device.assignedTo || 'Sin asignar'}</td>
                    <td className="px-4 py-3.5 font-mono tabular-nums">
                      <span className={device.batteryPct < 25 ? 'text-rose-400 font-bold' : 'text-emerald-400'}>
                        {device.batteryPct}%
                      </span>
                    </td>
                    <td className="px-4 py-3.5 capitalize text-slate-300">{device.signalStrength}</td>
                    <td className="px-4 py-3.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        device.status === 'normal' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' :
                        device.status === 'advertencia' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                        device.status === 'critico' ? 'bg-rose-950 text-rose-300 border border-rose-800' :
                        'bg-slate-900 text-slate-400 border border-slate-700'
                      }`}>
                        {device.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==============================================================
          SUBTAB 5: DISPOSITIVOS (SENSORES Y GATEWAYS)
         ============================================================== */}
      {activeSubTab === 'dispositivos' && canViewSubTab('dispositivos') && currentUser && (
        <DeviceRegistryAndAssignmentPanel
          currentUser={currentUser}
          organizations={organizations}
          sites={allSites}
          catalogDevices={effectiveCatalogDevices}
          rtdbDevices={rtdbDevices || devices}
          onDeviceUpdated={onCatalogDeviceUpdated}
          onDeviceDeleted={onCatalogDeviceDeleted}
        />
      )}

      {/* ==============================================================
          SUBTAB 6: EMPRESAS / ORGANIZACIONES
         ============================================================== */}
      {activeSubTab === 'empresas' && canViewSubTab('empresas') && currentUser && (
        <OrganizationsManagerPanel
          currentUser={currentUser}
          organizations={organizations}
          activeOrganizationId={activeOrganizationId}
          onSelectOrganization={onSelectOrganization}
          onOrganizationsChanged={onOrganizationsChanged}
        />
      )}
        </>
      )}

      {/* MODAL: NUEVA ASIGNACIÓN */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-cyan-400" />
                Asignar Sensor a Trabajador
              </h3>
              <button onClick={() => setShowAssignModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAssignment} className="space-y-3 text-xs">
              {orgAssignableUsers.length > 0 && (
                <div>
                  <label className="text-slate-300 block mb-1">
                    Seleccionar Trabajador Registrado (Recomendado)
                  </label>
                  <select
                    value={selectedExistingUserId}
                    onChange={(e) => {
                      const uid = e.target.value;
                      setSelectedExistingUserId(uid);
                      const matched = orgAssignableUsers.find((u) => u.id === uid);
                      if (matched) {
                        setNewWorkerName(matched.name);
                        setNewWorkerRut(matched.rut || '');
                        setNewRole(matched.roleLabel || matched.role);
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  >
                    <option value="">-- Ingresar o elegir trabajador registrado --</option>
                    {orgAssignableUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} {u.rut ? `(${u.rut})` : ''} · {u.roleLabel || u.role}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="text-slate-300 block mb-1">Nombre Completo del Operador *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Marcelo Castro R."
                  value={newWorkerName}
                  onChange={(e) => setNewWorkerName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1">RUT Operador *</label>
                <RutInput
                  value={newWorkerRut}
                  onChange={setNewWorkerRut}
                  required
                  placeholder="Ej: 17.456.789-K"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-300 block mb-1">Cargo / Rol</label>
                  <input
                    type="text"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-300 block mb-1">Cuadrilla / Turno</label>
                  <select
                    value={newCrewSelectMode}
                    onChange={(e) => {
                      setNewCrewSelectMode(e.target.value);
                      if (e.target.value !== '__custom__') {
                        setNewCrew(e.target.value);
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  >
                    {crewSelectOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                    <option value="__custom__">+ Escribir otra cuadrilla...</option>
                  </select>
                  {newCrewSelectMode === '__custom__' && (
                    <input
                      type="text"
                      required
                      placeholder="Nombre de la cuadrilla..."
                      value={newCrew}
                      onChange={(e) => setNewCrew(e.target.value)}
                      className="w-full mt-2 px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                    />
                  )}
                </div>
              </div>

              <div>
                <label className="text-slate-300 block mb-1">Sensor IoT a Entregar</label>
                <select
                  value={newSelectedDeviceCode}
                  onChange={(e) => setNewSelectedDeviceCode(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                >
                  {activeInventoryDevices.map((d) => {
                    const holder = assignedDeviceByCode.get(d.code.trim().toLowerCase());
                    return (
                      <option key={d.id} value={d.code}>
                        {d.code} - {d.name} ({d.batteryPct}% bat)
                        {holder ? ` [Asignado a ${holder.workerName}]` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-300 block mb-1">Nombre Contacto Emergencia</label>
                  <input
                    type="text"
                    placeholder="Ej: María Castro (Cónyuge)"
                    value={newEmergencyContactName}
                    onChange={(e) => setNewEmergencyContactName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-300 block mb-1">Teléfono Emergencia *</label>
                  <input
                    type="tel"
                    required
                    placeholder="+56 9 8765 4321"
                    value={newEmergencyContactPhone}
                    onChange={(e) => setNewEmergencyContactPhone(e.target.value)}
                    className={`w-full px-3 py-2 bg-slate-950 border rounded-lg text-white font-mono ${
                      newEmergencyContactPhone.trim()
                        ? validateEmergencyPhone(newEmergencyContactPhone).valid
                          ? 'border-emerald-500/70'
                          : 'border-rose-500/80'
                        : 'border-slate-800'
                    }`}
                  />
                  {newEmergencyContactPhone.trim() && (() => {
                    const res = validateEmergencyPhone(newEmergencyContactPhone);
                    return (
                      <p className={`mt-1 text-[10px] ${res.valid ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {res.valid ? `✓ ${res.formatted}` : `✗ ${res.error}`}
                      </p>
                    );
                  })()}
                </div>
              </div>

              {modalError && (
                <div className="p-2.5 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-200 text-xs">
                  {modalError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="px-4 py-2 text-slate-300 bg-slate-800 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-white bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg font-semibold"
                >
                  {isSubmitting ? 'Guardando...' : 'Registrar Asignación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NUEVO CONTRATO DE ARRIENDO */}
      {showNewContractModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-cyan-400" />
                Registrar Contrato de Arriendo
              </h3>
              <button onClick={() => setShowNewContractModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateContract} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 block mb-1">Número de Contrato</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: ARR-2026-150"
                  value={newContractNumber}
                  onChange={(e) => setNewContractNumber(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1">Código del Dispositivo</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: MS-GAS-110"
                  value={newDeviceCode}
                  onChange={(e) => setNewDeviceCode(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1">Proveedor Autorizado</label>
                <select
                  value={newProvider}
                  onChange={(e) => setNewProvider(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                >
                  <option value="Dräger Safety Chile S.A.">Dräger Safety Chile S.A.</option>
                  <option value="Honeywell Mining Solutions">Honeywell Mining Solutions</option>
                  <option value="SICK Chile Instrumentación">SICK Chile Instrumentación</option>
                  <option value="FLIR Systems Industrial">FLIR Systems Industrial</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="text-slate-300 block mb-1">Costo Mensual (CLP)</label>
                  <input
                    type="number"
                    min={1}
                    value={newCostClp}
                    onChange={(e) => setNewCostClp(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-300 block mb-1">Inicio Vigencia</label>
                  <input
                    type="date"
                    value={newStartDate}
                    onChange={(e) => setNewStartDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-300 block mb-1">Término Vigencia</label>
                  <input
                    type="date"
                    value={newEndDate}
                    onChange={(e) => setNewEndDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
              </div>

              {modalError && (
                <div className="p-2.5 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-200 text-xs">
                  {modalError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowNewContractModal(false)}
                  className="px-4 py-2 text-slate-300 bg-slate-800 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-white bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg font-semibold"
                >
                  {isSubmitting ? 'Guardando...' : 'Guardar Contrato'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDITAR CONTRATO DE ARRIENDO */}
      {editingContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-cyan-400" />
                Editar Contrato {editingContract.contractNumber}
              </h3>
              <button onClick={() => setEditingContract(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedContract} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-300 block mb-1">Dispositivo</label>
                  <input
                    type="text"
                    required
                    value={editDeviceCode}
                    onChange={(e) => setEditDeviceCode(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-300 block mb-1">Estado Pago</label>
                  <select
                    value={editPaymentStatus}
                    onChange={(e) => setEditPaymentStatus(e.target.value as DeviceRental['paymentStatus'])}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  >
                    <option value="al_dia">Al Día</option>
                    <option value="proximo_a_vencer">Próximo a Vencer</option>
                    <option value="pago_pendiente">Pago Pendiente</option>
                    <option value="vencido">Vencido</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-slate-300 block mb-1">Proveedor</label>
                <input
                  type="text"
                  required
                  value={editProvider}
                  onChange={(e) => setEditProvider(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-slate-300 block mb-1">Costo (CLP)</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={editCostClp}
                    onChange={(e) => setEditCostClp(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-300 block mb-1">Inicio</label>
                  <input
                    type="date"
                    value={editStartDate}
                    onChange={(e) => setEditStartDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-300 block mb-1">Término</label>
                  <input
                    type="date"
                    value={editEndDate}
                    onChange={(e) => setEditEndDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-300 block mb-1">Técnico Asignado</label>
                <input
                  type="text"
                  value={editTechnician}
                  onChange={(e) => setEditTechnician(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1">Notas</label>
                <textarea
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                />
              </div>

              {modalError && (
                <div className="p-2.5 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-200 text-xs">
                  {modalError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingContract(null)}
                  className="px-4 py-2 text-slate-300 bg-slate-800 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-white bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg font-semibold"
                >
                  {isSubmitting ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
