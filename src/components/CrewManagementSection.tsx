import React, { useMemo, useState } from 'react';
import {
  Users,
  Plus,
  HardHat,
  Search,
  UserPlus,
  Edit2,
  Trash2,
  X,
  CheckCircle2,
  AlertCircle,
  Clock,
  MapPin,
  Crown,
  Cpu,
  UserCheck,
  Building2,
} from 'lucide-react';
import {
  CrewMember,
  MiningCrew,
  MiningSite,
  Organization,
  SensorDevice,
  UserProfile,
  WorkerAssignment,
} from '../types';
import {
  assignWorkersToCrew,
  buildCrewMemberFromUser,
  canManageCrews,
  DEFAULT_ORGANIZATION_ID,
} from '../utils/accessControl';
import { soundAlert } from '../services/audioAlert';

interface CrewCandidateWorker {
  key: string;
  userId?: string;
  assignmentId?: string;
  name: string;
  rut: string;
  role: string;
  email?: string;
  assignedDeviceCode?: string;
  emergencyContact?: string;
  source: 'usuario' | 'asignacion' | 'miembro';
  otherCrews: string[];
}

export interface CrewManagementSectionProps {
  crews: MiningCrew[];
  usersList: UserProfile[];
  assignments: WorkerAssignment[];
  allSites: MiningSite[];
  devices: SensorDevice[];
  organizations: Organization[];
  currentUser: UserProfile | null;
  activeOrganizationId?: string;
  onSaveCrew: (crew: MiningCrew) => Promise<void> | void;
  onDeleteCrew: (crewId: string, organizationId: string) => Promise<void> | void;
  onAddAssignment?: (assignment: Omit<WorkerAssignment, 'id'>) => Promise<void> | void;
  compactHeader?: boolean;
  externalOpenCreateTrigger?: number;
}

const SHIFT_OPTIONS = [
  'Turno Mañana (07:00 - 15:30)',
  'Turno Tarde (15:30 - 23:30)',
  'Turno Noche (23:30 - 07:00)',
  'Turno 7x7 Día',
  'Turno 7x7 Noche',
  'Turno Administrativo',
];

function buildCandidateKey(member: {
  userId?: string;
  email?: string;
  rut?: string;
  name: string;
  id?: string;
}): string {
  if (member.userId) return `uid:${member.userId}`;
  if (member.email && member.email.trim()) return `email:${member.email.trim().toLowerCase()}`;
  const cleanRut = (member.rut || '').trim().toLowerCase();
  if (cleanRut && cleanRut !== 'sin rut' && cleanRut !== 'no registrado') {
    return `rut:${cleanRut}`;
  }
  return `name:${member.name.trim().toLowerCase()}`;
}

export const CrewManagementSection: React.FC<CrewManagementSectionProps> = ({
  crews,
  usersList,
  assignments,
  allSites,
  devices,
  organizations,
  currentUser,
  activeOrganizationId,
  onSaveCrew,
  onDeleteCrew,
  onAddAssignment,
  compactHeader = false,
}) => {
  const canEditCrews = useMemo(
    () => canManageCrews(currentUser, activeOrganizationId === 'all' ? undefined : activeOrganizationId, organizations).allowed,
    [currentUser, activeOrganizationId, organizations]
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [notice, setNotice] = useState<{ text: string; tone: 'success' | 'error' } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Create / Edit Crew Modal State
  const [showCrewModal, setShowCrewModal] = useState(false);
  const [editingCrew, setEditingCrew] = useState<MiningCrew | null>(null);
  const [crewOrgId, setCrewOrgId] = useState<string>(DEFAULT_ORGANIZATION_ID);
  const [crewName, setCrewName] = useState('');
  const [crewCode, setCrewCode] = useState('');
  const [crewShift, setCrewShift] = useState(SHIFT_OPTIONS[0]);
  const [crewStatus, setCrewStatus] = useState<MiningCrew['status']>('activa');
  const [crewSiteId, setCrewSiteId] = useState('');
  const [crewSectorId, setCrewSectorId] = useState('');
  const [crewNotes, setCrewNotes] = useState('');
  const [crewModalError, setCrewModalError] = useState<string | null>(null);
  const [isSavingCrew, setIsSavingCrew] = useState(false);

  // Assign Workers to Crew Modal State
  const [assigningCrew, setAssigningCrew] = useState<MiningCrew | null>(null);
  const [workerSearch, setWorkerSearch] = useState('');
  const [draftMembers, setDraftMembers] = useState<CrewMember[]>([]);
  const [manualName, setManualName] = useState('');
  const [manualRut, setManualRut] = useState('');
  const [manualRole, setManualRole] = useState('Operador Subterráneo');
  const [manualDeviceCode, setManualDeviceCode] = useState('');
  const [manualContact, setManualContact] = useState('');
  const [showManualForm, setShowManualForm] = useState(false);
  const [workersModalError, setWorkersModalError] = useState<string | null>(null);
  const [isSavingWorkers, setIsSavingWorkers] = useState(false);

  const defaultTargetOrgId = useMemo(() => {
    if (activeOrganizationId && activeOrganizationId !== 'all') {
      return activeOrganizationId;
    }
    return currentUser?.organizationId || organizations[0]?.id || DEFAULT_ORGANIZATION_ID;
  }, [activeOrganizationId, currentUser?.organizationId, organizations]);

  const showTempNotice = (text: string, tone: 'success' | 'error') => {
    setNotice({ text, tone });
    setTimeout(() => {
      setNotice((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  };

  const filteredCrews = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return crews;
    return crews.filter((c) => {
      const memberMatch = (c.members || []).some(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          (m.rut || '').toLowerCase().includes(q) ||
          (m.role || '').toLowerCase().includes(q)
      );
      return (
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        (c.shift || '').toLowerCase().includes(q) ||
        (c.sectorName || '').toLowerCase().includes(q) ||
        (c.leaderName || '').toLowerCase().includes(q) ||
        memberMatch
      );
    });
  }, [crews, searchQuery]);

  const totalWorkersAssigned = useMemo(() => {
    const unique = new Set<string>();
    crews.forEach((c) => {
      (c.members || []).forEach((m) => unique.add(buildCandidateKey(m)));
    });
    return unique.size;
  }, [crews]);

  const orgSitesForForm = useMemo(
    () =>
      allSites.filter(
        (s) => (s.organizationId || DEFAULT_ORGANIZATION_ID) === crewOrgId
      ),
    [allSites, crewOrgId]
  );

  const selectedFormSite = useMemo(
    () => orgSitesForForm.find((s) => s.id === crewSiteId) || null,
    [orgSitesForForm, crewSiteId]
  );

  // Build deduplicated org-scoped worker candidates for the Assigning Modal
  const workerCandidates = useMemo<CrewCandidateWorker[]>(() => {
    if (!assigningCrew) return [];
    const targetOrg = assigningCrew.organizationId || DEFAULT_ORGANIZATION_ID;
    const map = new Map<string, CrewCandidateWorker>();

    const findOtherCrews = (candidateKey: string): string[] =>
      crews
        .filter((c) => c.id !== assigningCrew.id && (c.organizationId || DEFAULT_ORGANIZATION_ID) === targetOrg)
        .filter((c) => (c.members || []).some((m) => buildCandidateKey(m) === candidateKey))
        .map((c) => c.name);

    // 1. Registered company users (active, excluding superadmin)
    usersList
      .filter(
        (u) =>
          u.status === 'activo' &&
          u.role !== 'superadmin' &&
          (u.organizationId || DEFAULT_ORGANIZATION_ID) === targetOrg
      )
      .forEach((u) => {
        const key = buildCandidateKey({
          userId: u.id,
          email: u.email,
          rut: u.rut,
          name: u.name,
        });
        map.set(key, {
          key,
          userId: u.id,
          name: u.name,
          rut: u.rut || 'Sin RUT',
          role: u.roleLabel || u.role,
          email: u.email,
          assignedDeviceCode: u.assignedDeviceCode,
          source: 'usuario',
          otherCrews: findOtherCrews(key),
        });
      });

    // 2. Existing worker assignments from same organization
    assignments
      .filter((a) => (a.organizationId || DEFAULT_ORGANIZATION_ID) === targetOrg)
      .forEach((a) => {
        const key = buildCandidateKey({
          userId: a.userId,
          rut: a.workerRut,
          name: a.workerName,
        });
        const existing = map.get(key);
        if (existing) {
          map.set(key, {
            ...existing,
            assignmentId: a.id,
            assignedDeviceCode: existing.assignedDeviceCode || a.assignedDeviceCode,
            emergencyContact: existing.emergencyContact || a.emergencyContact,
          });
        } else {
          map.set(key, {
            key,
            userId: a.userId,
            assignmentId: a.id,
            name: a.workerName,
            rut: a.workerRut || 'Sin RUT',
            role: a.role || 'Operador Subterráneo',
            assignedDeviceCode: a.assignedDeviceCode || undefined,
            emergencyContact: a.emergencyContact || undefined,
            source: 'asignacion',
            otherCrews: findOtherCrews(key),
          });
        }
      });

    // 3. Current draft/existing members of this crew (in case manually added)
    draftMembers.forEach((m) => {
      const key = buildCandidateKey(m);
      if (!map.has(key)) {
        map.set(key, {
          key,
          userId: m.userId,
          assignmentId: m.assignmentId,
          name: m.name,
          rut: m.rut,
          role: m.role,
          email: m.email,
          assignedDeviceCode: m.assignedDeviceCode,
          emergencyContact: m.emergencyContact,
          source: 'miembro',
          otherCrews: findOtherCrews(key),
        });
      }
    });

    const q = workerSearch.trim().toLowerCase();
    const list = Array.from(map.values());
    if (!q) return list;
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.rut.toLowerCase().includes(q) ||
        c.role.toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q)
    );
  }, [assigningCrew, crews, usersList, assignments, draftMembers, workerSearch]);

  const orgDevicesForAssigningCrew = useMemo(() => {
    if (!assigningCrew) return [];
    const targetOrg = assigningCrew.organizationId || DEFAULT_ORGANIZATION_ID;
    return devices.filter(
      (d) => (d.organizationId || DEFAULT_ORGANIZATION_ID) === targetOrg
    );
  }, [assigningCrew, devices]);

  const openCreateCrewModal = () => {
    const nextNum = crews.length + 1;
    setEditingCrew(null);
    setCrewOrgId(defaultTargetOrgId);
    setCrewName('');
    setCrewCode(`CUA-${String(nextNum).padStart(2, '0')}`);
    setCrewShift(SHIFT_OPTIONS[0]);
    setCrewStatus('activa');
    setCrewSiteId('');
    setCrewSectorId('');
    setCrewNotes('');
    setCrewModalError(null);
    setShowCrewModal(true);
  };

  const openEditCrewModal = (crew: MiningCrew) => {
    setEditingCrew(crew);
    setCrewOrgId(crew.organizationId || defaultTargetOrgId);
    setCrewName(crew.name);
    setCrewCode(crew.code);
    setCrewShift(crew.shift || SHIFT_OPTIONS[0]);
    setCrewStatus(crew.status);
    setCrewSiteId(crew.siteId || '');
    setCrewSectorId(crew.sectorId || '');
    setCrewNotes(crew.notes || '');
    setCrewModalError(null);
    setShowCrewModal(true);
  };

  const openAssignWorkersModal = (crew: MiningCrew) => {
    setAssigningCrew(crew);
    setDraftMembers([...(crew.members || [])]);
    setWorkerSearch('');
    setManualName('');
    setManualRut('');
    setManualRole('Operador Subterráneo');
    setManualDeviceCode('');
    setManualContact('');
    setShowManualForm(false);
    setWorkersModalError(null);
  };

  const handleSaveCrewForm = async (e: React.FormEvent, openWorkersAfter: boolean = false) => {
    e.preventDefault();
    const cleanName = crewName.trim();
    const cleanCode = crewCode.trim();
    if (cleanName.length < 2) {
      setCrewModalError('El nombre de la cuadrilla debe tener al menos 2 caracteres.');
      return;
    }
    if (!cleanCode) {
      setCrewModalError('El código identificador de la cuadrilla es obligatorio.');
      return;
    }

    const duplicateName = crews.some(
      (c) =>
        c.id !== editingCrew?.id &&
        (c.organizationId || DEFAULT_ORGANIZATION_ID) === crewOrgId &&
        c.name.trim().toLowerCase() === cleanName.toLowerCase()
    );
    if (duplicateName) {
      setCrewModalError(`Ya existe una cuadrilla llamada "${cleanName}" en esta organización.`);
      return;
    }

    const siteObj = orgSitesForForm.find((s) => s.id === crewSiteId);
    const sectorObj = siteObj?.activeSectors.find((sec) => sec.id === crewSectorId);
    const now = Date.now();

    const payload: MiningCrew = editingCrew
      ? {
          ...editingCrew,
          organizationId: crewOrgId,
          name: cleanName,
          code: cleanCode,
          shift: crewShift.trim() || SHIFT_OPTIONS[0],
          status: crewStatus,
          siteId: siteObj?.id,
          siteName: siteObj?.name,
          sectorId: sectorObj?.id,
          sectorName: sectorObj?.name,
          notes: crewNotes.trim() || undefined,
          updatedAt: now,
        }
      : {
          id: `crew-${now}-${Math.random().toString(36).slice(2, 6)}`,
          organizationId: crewOrgId,
          name: cleanName,
          code: cleanCode,
          shift: crewShift.trim() || SHIFT_OPTIONS[0],
          status: crewStatus,
          siteId: siteObj?.id,
          siteName: siteObj?.name,
          sectorId: sectorObj?.id,
          sectorName: sectorObj?.name,
          notes: crewNotes.trim() || undefined,
          members: [],
          createdBy: currentUser?.name || currentUser?.email,
          createdAt: now,
          updatedAt: now,
        };

    try {
      setIsSavingCrew(true);
      setCrewModalError(null);
      await onSaveCrew(payload);
      soundAlert.playFeedbackBeep();
      setShowCrewModal(false);
      showTempNotice(
        editingCrew
          ? `Cuadrilla "${payload.name}" actualizada.`
          : `Cuadrilla "${payload.name}" creada. Ahora puedes asignarle trabajadores.`,
        'success'
      );
      if (openWorkersAfter) {
        openAssignWorkersModal(payload);
      }
    } catch (err: any) {
      setCrewModalError(err?.message || 'Error al guardar la cuadrilla.');
    } finally {
      setIsSavingCrew(false);
    }
  };

  const toggleWorkerInDraft = (candidate: CrewCandidateWorker) => {
    setDraftMembers((prev) => {
      const exists = prev.some((m) => buildCandidateKey(m) === candidate.key);
      if (exists) {
        return prev.filter((m) => buildCandidateKey(m) !== candidate.key);
      }
      const nextMember: CrewMember = candidate.userId
        ? buildCrewMemberFromUser(
            {
              id: candidate.userId,
              name: candidate.name,
              email: candidate.email || '',
              role: 'operador',
              roleLabel: candidate.role,
              rut: candidate.rut,
              shift: assigningCrew?.shift || '',
              status: 'activo',
              assignedDeviceCode: candidate.assignedDeviceCode,
            },
            { isLeader: prev.length === 0 }
          )
        : {
            id: `mbr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            assignmentId: candidate.assignmentId,
            name: candidate.name,
            rut: candidate.rut,
            role: candidate.role,
            email: candidate.email,
            assignedDeviceCode: candidate.assignedDeviceCode,
            emergencyContact: candidate.emergencyContact,
            isLeader: prev.length === 0,
            addedAt: Date.now(),
          };
      return [...prev, nextMember];
    });
  };

  const toggleLeaderInDraft = (candidateKey: string) => {
    setDraftMembers((prev) =>
      prev.map((m) => ({
        ...m,
        isLeader: buildCandidateKey(m) === candidateKey ? !m.isLeader : false,
      }))
    );
  };

  const handleAddManualWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningCrew) return;
    const cleanName = manualName.trim();
    const cleanRut = manualRut.trim();
    if (!cleanName || !cleanRut) {
      setWorkersModalError('El nombre y RUT del trabajador son obligatorios.');
      return;
    }

    const key = buildCandidateKey({ rut: cleanRut, name: cleanName });
    if (draftMembers.some((m) => buildCandidateKey(m) === key)) {
      setWorkersModalError(`"${cleanName}" ya está incluido en esta cuadrilla.`);
      return;
    }

    const newMember: CrewMember = {
      id: `mbr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: cleanName,
      rut: cleanRut,
      role: manualRole.trim() || 'Operador Subterráneo',
      assignedDeviceCode: manualDeviceCode || undefined,
      emergencyContact: manualContact.trim() || undefined,
      isLeader: draftMembers.length === 0,
      addedAt: Date.now(),
    };

    if (manualDeviceCode && onAddAssignment) {
      const dev = orgDevicesForAssigningCrew.find((d) => d.code === manualDeviceCode);
      if (dev) {
        try {
          await onAddAssignment({
            organizationId: assigningCrew.organizationId,
            crewId: assigningCrew.id,
            workerName: newMember.name,
            workerRut: newMember.rut,
            role: newMember.role,
            crew: assigningCrew.name,
            sectorName: assigningCrew.sectorName || 'Faena Central',
            assignedDeviceId: dev.id,
            assignedDeviceCode: dev.code,
            assignmentDate: new Date().toISOString().split('T')[0],
            deviceBattery: dev.batteryPct,
            emergencyContact: newMember.emergencyContact || 'Sin registro',
          });
        } catch {
          // Proceed adding worker to crew even if sensor assignment fails
        }
      }
    }

    setDraftMembers((prev) => [...prev, newMember]);
    setManualName('');
    setManualRut('');
    setManualDeviceCode('');
    setManualContact('');
    setShowManualForm(false);
    setWorkersModalError(null);
    soundAlert.playFeedbackBeep();
  };

  const handleSaveAssignedWorkers = async () => {
    if (!assigningCrew) return;
    try {
      setIsSavingWorkers(true);
      setWorkersModalError(null);
      const updated = assignWorkersToCrew(assigningCrew, draftMembers);
      await onSaveCrew(updated);
      soundAlert.playFeedbackBeep();
      setAssigningCrew(null);
      showTempNotice(
        `${updated.members.length} trabajador(es) asignado(s) a "${updated.name}".`,
        'success'
      );
    } catch (err: any) {
      setWorkersModalError(err?.message || 'Error al guardar los trabajadores de la cuadrilla.');
    } finally {
      setIsSavingWorkers(false);
    }
  };

  const handleQuickRemoveMember = async (crew: MiningCrew, memberId: string) => {
    if (!canEditCrews) return;
    try {
      const remaining = (crew.members || []).filter((m) => m.id !== memberId);
      const updated = assignWorkersToCrew(crew, remaining);
      await onSaveCrew(updated);
      soundAlert.playFeedbackBeep();
      showTempNotice(`Trabajador desvinculado de "${crew.name}".`, 'success');
    } catch (err: any) {
      showTempNotice(err?.message || 'No se pudo quitar el trabajador.', 'error');
    }
  };

  const handleDeleteCrew = async (crew: MiningCrew) => {
    try {
      await onDeleteCrew(crew.id, crew.organizationId);
      setConfirmDeleteId(null);
      soundAlert.playFeedbackBeep();
      showTempNotice(`Cuadrilla "${crew.name}" eliminada.`, 'success');
    } catch (err: any) {
      showTempNotice(err?.message || 'Error al eliminar la cuadrilla.', 'error');
    }
  };

  const getStatusBadge = (status: MiningCrew['status']) => {
    if (status === 'activa') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-950 text-emerald-300 border border-emerald-800">
          Activa
        </span>
      );
    }
    if (status === 'en_descanso') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-950 text-amber-300 border border-amber-800">
          En Descanso
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-900 text-slate-400 border border-slate-700">
        Inactiva
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className={`${compactHeader ? 'text-sm' : 'text-base'} font-bold text-white flex items-center gap-2`}>
            <HardHat className="w-4 h-4 text-emerald-400" />
            Cuadrillas Operativas y Dotación de Trabajadores ({crews.length})
          </h2>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Crea nuevas cuadrillas por turno o sector y asigna trabajadores de tu organización ·{' '}
            <span className="text-emerald-300 font-semibold">{totalWorkersAssigned} trabajador(es) asignados</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar cuadrilla o trabajador..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-600 w-56"
            />
          </div>

          {canEditCrews && (
            <button
              type="button"
              onClick={openCreateCrewModal}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              Nueva Cuadrilla
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div
          className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
            notice.tone === 'error'
              ? 'bg-rose-950/80 border-rose-800 text-rose-200'
              : 'bg-emerald-950/80 border-emerald-800 text-emerald-200'
          }`}
        >
          {notice.tone === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span>{notice.text}</span>
        </div>
      )}

      {/* Crew Cards Grid */}
      {filteredCrews.length === 0 ? (
        <div className="p-8 rounded-xl bg-slate-900/50 border border-dashed border-slate-800 text-center space-y-2.5">
          <HardHat className="w-9 h-9 text-slate-600 mx-auto" />
          <p className="text-sm font-bold text-white">
            {crews.length === 0
              ? 'Aún no hay cuadrillas registradas para esta empresa'
              : 'Sin cuadrillas que coincidan con la búsqueda'}
          </p>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Crea una nueva cuadrilla para organizar a tus operadores y monitores ambientales por turno, faena y frente de trabajo.
          </p>
          {canEditCrews && crews.length === 0 && (
            <button
              type="button"
              onClick={openCreateCrewModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors mt-1"
            >
              <Plus className="w-4 h-4" />
              Crear Primera Cuadrilla
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredCrews.map((crew) => {
            const members = crew.members || [];
            const orgLabel =
              organizations.find((o) => o.id === crew.organizationId)?.name || crew.organizationId;

            return (
              <div
                key={crew.id}
                className="p-5 rounded-xl bg-slate-900/70 border border-slate-800 hover:border-slate-700 transition-colors flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                          {crew.code}
                        </span>
                        {getStatusBadge(crew.status)}
                      </div>
                      <h3 className="text-sm font-bold text-white truncate" title={crew.name}>
                        {crew.name}
                      </h3>
                    </div>

                    {canEditCrews && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditCrewModal(crew)}
                          title="Editar cuadrilla"
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {confirmDeleteId === crew.id ? (
                          <div className="flex items-center gap-1 bg-rose-950 border border-rose-800 rounded-lg px-1.5 py-0.5">
                            <button
                              type="button"
                              onClick={() => handleDeleteCrew(crew)}
                              className="text-[10px] font-bold text-rose-300 hover:text-white px-1"
                            >
                              Sí
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="text-[10px] text-slate-400 hover:text-white px-1"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(crew.id)}
                            title="Eliminar cuadrilla"
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-300 border border-slate-700"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Metadata */}
                  <div className="space-y-1 text-[11px] text-slate-300 bg-slate-950/60 border border-slate-800/80 rounded-lg p-2.5">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span className="truncate">{crew.shift}</span>
                    </div>
                    {(crew.sectorName || crew.siteName) && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="truncate">
                          {[crew.siteName, crew.sectorName].filter(Boolean).join(' · ')}
                        </span>
                      </div>
                    )}
                    {activeOrganizationId === 'all' && (
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="truncate">{orgLabel}</span>
                      </div>
                    )}
                  </div>

                  {/* Workers Roster */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-cyan-400" />
                        Trabajadores ({members.length})
                      </span>
                    </div>

                    {members.length === 0 ? (
                      <div className="p-3 rounded-lg bg-slate-950/40 border border-dashed border-slate-800 text-[11px] text-slate-500 italic text-center">
                        Sin trabajadores asignados todavía.
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                        {members.map((m) => (
                          <div
                            key={m.id}
                            className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-950/80 border border-slate-800 text-xs"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                {m.isLeader && (
                                  <Crown
                                    className="w-3.5 h-3.5 text-amber-400 shrink-0"
                                    aria-label="Líder de cuadrilla"
                                  />
                                )}
                                <span className="font-semibold text-white truncate">{m.name}</span>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
                                <span className="font-mono">{m.rut}</span>
                                <span>·</span>
                                <span className="truncate">{m.role}</span>
                                {m.assignedDeviceCode && (
                                  <span className="inline-flex items-center gap-0.5 text-cyan-300 font-mono bg-cyan-950/70 px-1.5 py-0.2 rounded border border-cyan-800/70">
                                    <Cpu className="w-2.5 h-2.5" />
                                    {m.assignedDeviceCode}
                                  </span>
                                )}
                              </div>
                            </div>

                            {canEditCrews && (
                              <button
                                type="button"
                                onClick={() => handleQuickRemoveMember(crew, m.id)}
                                title="Quitar trabajador de la cuadrilla"
                                className="text-slate-500 hover:text-rose-400 p-0.5 shrink-0"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Footer */}
                {canEditCrews && (
                  <button
                    type="button"
                    onClick={() => openAssignWorkersModal(crew)}
                    className="w-full py-2 px-3 rounded-lg text-xs font-semibold bg-cyan-600/20 hover:bg-cyan-600 text-cyan-300 hover:text-white border border-cyan-700/70 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    {members.length > 0 ? 'Gestionar / Asignar Trabajadores' : 'Asignar Trabajadores'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 1: CREAR / EDITAR CUADRILLA                                     */}
      {/* ===================================================================== */}
      {showCrewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <HardHat className="w-4 h-4 text-emerald-400" />
                {editingCrew ? `Editar Cuadrilla · ${editingCrew.code}` : 'Crear Nueva Cuadrilla'}
              </h3>
              <button
                type="button"
                onClick={() => setShowCrewModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => handleSaveCrewForm(e, false)}
              className="p-6 space-y-3.5 text-xs overflow-y-auto flex-1"
            >
              {activeOrganizationId === 'all' && organizations.length > 0 && (
                <div>
                  <label className="text-slate-300 block mb-1 font-medium">
                    Empresa / Organización *
                  </label>
                  <select
                    value={crewOrgId}
                    onChange={(e) => {
                      setCrewOrgId(e.target.value);
                      setCrewSiteId('');
                      setCrewSectorId('');
                    }}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  >
                    {organizations.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="sm:col-span-2">
                  <label className="text-slate-300 block mb-1 font-medium">
                    Nombre de la Cuadrilla *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Cuadrilla Delta - Nivel -500"
                    value={crewName}
                    onChange={(e) => setCrewName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-300 block mb-1 font-medium">Código *</label>
                  <input
                    type="text"
                    required
                    placeholder="CUA-04"
                    value={crewCode}
                    onChange={(e) => setCrewCode(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="text-slate-300 block mb-1 font-medium">Turno Operativo *</label>
                  <select
                    value={SHIFT_OPTIONS.includes(crewShift) ? crewShift : '__custom__'}
                    onChange={(e) => {
                      if (e.target.value !== '__custom__') setCrewShift(e.target.value);
                    }}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  >
                    {SHIFT_OPTIONS.map((shift) => (
                      <option key={shift} value={shift}>
                        {shift}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-slate-300 block mb-1 font-medium">Estado</label>
                  <select
                    value={crewStatus}
                    onChange={(e) => setCrewStatus(e.target.value as MiningCrew['status'])}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  >
                    <option value="activa">Activa en Turno</option>
                    <option value="en_descanso">En Descanso / Relevo</option>
                    <option value="inactiva">Inactiva</option>
                  </select>
                </div>
              </div>

              {orgSitesForForm.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-slate-300 block mb-1 font-medium">
                      Faena Asignada (Opcional)
                    </label>
                    <select
                      value={crewSiteId}
                      onChange={(e) => {
                        setCrewSiteId(e.target.value);
                        setCrewSectorId('');
                      }}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                    >
                      <option value="">-- Sin faena fija --</option>
                      {orgSitesForForm.map((site) => (
                        <option key={site.id} value={site.id}>
                          {site.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-300 block mb-1 font-medium">
                      Sector / Galería (Opcional)
                    </label>
                    <select
                      value={crewSectorId}
                      disabled={!selectedFormSite}
                      onChange={(e) => setCrewSectorId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white disabled:opacity-50"
                    >
                      <option value="">-- Todos / Sin sector fijo --</option>
                      {(selectedFormSite?.activeSectors || []).map((sec) => (
                        <option key={sec.id} value={sec.id}>
                          {sec.code} · {sec.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="text-slate-300 block mb-1 font-medium">
                  Especialidad / Observaciones
                </label>
                <textarea
                  rows={2}
                  placeholder="Ej: Frente de perforación jumbo, mantención eléctrica o brigada de rescate..."
                  value={crewNotes}
                  onChange={(e) => setCrewNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                />
              </div>

              {crewModalError && (
                <div className="p-2.5 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-200 text-xs">
                  {crewModalError}
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCrewModal(false)}
                  className="px-4 py-2 text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg"
                >
                  Cancelar
                </button>
                {!editingCrew && (
                  <button
                    type="button"
                    disabled={isSavingCrew}
                    onClick={(e) => handleSaveCrewForm(e, true)}
                    className="px-4 py-2 text-cyan-200 bg-cyan-950 hover:bg-cyan-900 border border-cyan-700 disabled:opacity-50 rounded-lg font-semibold flex items-center gap-1.5"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Guardar y Asignar Trabajadores
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isSavingCrew}
                  className="px-4 py-2 text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg font-semibold"
                >
                  {isSavingCrew ? 'Guardando...' : editingCrew ? 'Guardar Cambios' : 'Crear Cuadrilla'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: ASIGNAR TRABAJADORES A UNA CUADRILLA                         */}
      {/* ===================================================================== */}
      {assigningCrew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-cyan-400" />
                  Asignar Trabajadores · {assigningCrew.name}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {assigningCrew.code} · {assigningCrew.shift} ·{' '}
                  <span className="text-emerald-300 font-semibold">
                    {draftMembers.length} trabajador(es) seleccionados
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAssigningCrew(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs overflow-y-auto flex-1">
              {/* Search & Manual Add Toggle */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Filtrar trabajadores de la empresa por nombre, RUT o cargo..."
                    value={workerSearch}
                    onChange={(e) => setWorkerSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowManualForm((prev) => !prev);
                    setWorkersModalError(null);
                  }}
                  className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-700/60 font-semibold flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {showManualForm ? 'Ocultar Registro Manual' : 'Agregar Trabajador Manual'}
                </button>
              </div>

              {/* Optional Manual Worker Form */}
              {showManualForm && (
                <form
                  onSubmit={handleAddManualWorker}
                  className="p-4 rounded-xl bg-slate-950 border border-emerald-800/70 space-y-3"
                >
                  <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                    <UserPlus className="w-3.5 h-3.5" />
                    Incorporar Trabajador Nuevo a la Cuadrilla
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-slate-300 block mb-1">Nombre Completo *</label>
                      <input
                        type="text"
                        required
                        placeholder="Ej: Jorge Tapia Fuentes"
                        value={manualName}
                        onChange={(e) => setManualName(e.target.value)}
                        className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-white"
                      />
                    </div>
                    <div>
                      <label className="text-slate-300 block mb-1">RUT Trabajador *</label>
                      <input
                        type="text"
                        required
                        placeholder="Ej: 18.234.567-8"
                        value={manualRut}
                        onChange={(e) => setManualRut(e.target.value)}
                        className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-white"
                      />
                    </div>
                    <div>
                      <label className="text-slate-300 block mb-1">Cargo / Especialidad</label>
                      <input
                        type="text"
                        value={manualRole}
                        onChange={(e) => setManualRole(e.target.value)}
                        className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-white"
                      />
                    </div>
                    <div>
                      <label className="text-slate-300 block mb-1">Sensor IoT (Opcional)</label>
                      <select
                        value={manualDeviceCode}
                        onChange={(e) => setManualDeviceCode(e.target.value)}
                        className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-white"
                      >
                        <option value="">-- Sin sensor asignado --</option>
                        {orgDevicesForAssigningCrew.map((d) => (
                          <option key={d.id} value={d.code}>
                            {d.code} - {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="text"
                      placeholder="Contacto emergencia (Opcional: +56 9 ...)"
                      value={manualContact}
                      onChange={(e) => setManualContact(e.target.value)}
                      className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-white"
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                    >
                      Añadir a Lista
                    </button>
                  </div>
                </form>
              )}

              {/* Candidates Selection List */}
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {workerCandidates.length === 0 ? (
                  <div className="p-6 rounded-xl bg-slate-950/60 border border-slate-800 text-center text-slate-400">
                    No hay trabajadores registrados disponibles en esta empresa. Usa{' '}
                    <strong className="text-emerald-300">"Agregar Trabajador Manual"</strong> o crea operadores en Usuarios.
                  </div>
                ) : (
                  workerCandidates.map((cand) => {
                    const matchedMember = draftMembers.find(
                      (m) => buildCandidateKey(m) === cand.key
                    );
                    const isSelected = Boolean(matchedMember);

                    return (
                      <div
                        key={cand.key}
                        className={`p-3 rounded-xl border transition-colors flex items-center justify-between gap-3 ${
                          isSelected
                            ? 'bg-emerald-950/35 border-emerald-600/80'
                            : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <label className="flex items-start gap-3 cursor-pointer flex-1 min-w-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleWorkerInDraft(cand)}
                            className="mt-1 accent-emerald-500 w-4 h-4 rounded"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-bold text-white">{cand.name}</span>
                              <span className="font-mono text-[10px] text-slate-400 bg-slate-900 px-1.5 py-0.2 rounded border border-slate-800">
                                {cand.rut}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-950/70 text-cyan-300 border border-cyan-800/60">
                                {cand.source === 'usuario'
                                  ? 'Usuario'
                                  : cand.source === 'asignacion'
                                  ? 'Asignación'
                                  : 'Manual'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                              {cand.role}
                              {cand.email ? ` · ${cand.email}` : ''}
                              {cand.assignedDeviceCode ? ` · Sensor: ${cand.assignedDeviceCode}` : ''}
                            </p>
                            {cand.otherCrews.length > 0 && (
                              <p className="text-[10px] text-amber-300 mt-0.5">
                                También en: {cand.otherCrews.join(', ')}
                              </p>
                            )}
                          </div>
                        </label>

                        {isSelected && (
                          <button
                            type="button"
                            onClick={() => toggleLeaderInDraft(cand.key)}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors flex items-center gap-1 shrink-0 ${
                              matchedMember?.isLeader
                                ? 'bg-amber-950 text-amber-300 border-amber-600'
                                : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-amber-300'
                            }`}
                            title="Marcar o desmarcar como jefe/líder de la cuadrilla"
                          >
                            <Crown className="w-3 h-3" />
                            {matchedMember?.isLeader ? 'Jefe Cuadrilla' : 'Hacer Jefe'}
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {workersModalError && (
                <div className="p-2.5 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-200 text-xs">
                  {workersModalError}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setAssigningCrew(null)}
                className="px-4 py-2 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSavingWorkers}
                onClick={handleSaveAssignedWorkers}
                className="px-4 py-2 text-xs text-white bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg font-semibold flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {isSavingWorkers
                  ? 'Guardando...'
                  : `Guardar ${draftMembers.length} Trabajador(es) en Cuadrilla`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
