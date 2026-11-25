import React, { useMemo, useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Scale,
  Search,
  Download,
  Plus,
  CheckCircle2,
  Clock,
  Lock,
  FileCheck2,
  AlertTriangle,
  Eye,
} from 'lucide-react';
import {
  CybersecurityIncident,
  CybersecurityIncidentCategory,
  CybersecurityIncidentSeverity,
  CybersecurityIncidentStatus,
  SecurityAuditAction,
  SecurityAuditEvent,
  SecurityAuditSeverity,
  UserProfile,
} from '../types';
import {
  CURRENT_LEGAL_CONSENT_VERSION,
  DATA_RETENTION_POLICY,
  DS132_DS594_NORMATIVE_LIMITS,
  SECURITY_AUDIT_ACTION_LABELS,
  SECURITY_AUDIT_SEVERITY_STYLES,
  signCsvExportWithIntegritySeal,
} from '../utils/securityCompliance';
import {
  logCybersecurityIncidentInRTDB,
  logSecurityAuditEventInRTDB,
  updateCybersecurityIncidentStatusInRTDB,
} from '../services/firebase';
import type { LegalDocumentTab } from './LegalComplianceModal';

interface SecurityAuditViewProps {
  currentUser: UserProfile;
  auditEvents: SecurityAuditEvent[];
  incidents: CybersecurityIncident[];
  users: UserProfile[];
  onOpenLegalModal: (tab: LegalDocumentTab) => void;
}

type SecuritySubTab = 'bitacora' | 'incidentes' | 'cumplimiento';

const INCIDENT_CATEGORY_LABELS: Record<CybersecurityIncidentCategory, string> = {
  acceso_no_autorizado: 'Acceso No Autorizado (Ley 21.459)',
  fuerza_bruta: 'Fuerza Bruta / Credenciales',
  disponibilidad_iot: 'Disponibilidad Gateway / Sensores IoT',
  filtracion_datos: 'Posible Exposición de Datos Personales',
  integridad_telemetria: 'Integridad de Telemetría / Reportes',
  otro: 'Otro Incidente de Seguridad',
};

const INCIDENT_SEVERITY_STYLES: Record<CybersecurityIncidentSeverity, string> = {
  baja: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  media: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  alta: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  critica: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
};

const INCIDENT_STATUS_LABELS: Record<CybersecurityIncidentStatus, string> = {
  abierto: 'Abierto',
  en_investigacion: 'En Investigación',
  contenido: 'Contenido',
  cerrado: 'Cerrado',
};

function escapeCsvCell(value: unknown): string {
  const raw = String(value ?? '');
  if (raw.includes(',') || raw.includes('"') || raw.includes('\n') || raw.includes('\r')) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

export const SecurityAuditView: React.FC<SecurityAuditViewProps> = ({
  currentUser,
  auditEvents,
  incidents,
  users,
  onOpenLegalModal,
}) => {
  const [subTab, setSubTab] = useState<SecuritySubTab>('bitacora');
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'all' | SecurityAuditSeverity>('all');
  const [actionFilter, setActionFilter] = useState<'all' | SecurityAuditAction>('all');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Nuevo incidente ciberseguridad
  const [incTitle, setIncTitle] = useState('');
  const [incCategory, setIncCategory] = useState<CybersecurityIncidentCategory>('acceso_no_autorizado');
  const [incSeverity, setIncSeverity] = useState<CybersecurityIncidentSeverity>('alta');
  const [incSystem, setIncSystem] = useState('Panel Web MineSafe IoT / RTDB');
  const [incDescription, setIncDescription] = useState('');
  const [incCsirtNotified, setIncCsirtNotified] = useState(false);
  const [savingIncident, setSavingIncident] = useState(false);
  const [updatingIncidentId, setUpdatingIncidentId] = useState<string | null>(null);
  const [resolutionDrafts, setResolutionDrafts] = useState<Record<string, string>>({});

  const filteredEvents = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return auditEvents.filter((ev) => {
      if (severityFilter !== 'all' && ev.severity !== severityFilter) return false;
      if (actionFilter !== 'all' && ev.action !== actionFilter) return false;
      if (!q) return true;
      return (
        ev.summary.toLowerCase().includes(q) ||
        ev.actorName.toLowerCase().includes(q) ||
        ev.actorEmail.toLowerCase().includes(q) ||
        (ev.targetLabel || '').toLowerCase().includes(q) ||
        (SECURITY_AUDIT_ACTION_LABELS[ev.action] || ev.action).toLowerCase().includes(q)
      );
    });
  }, [auditEvents, searchTerm, severityFilter, actionFilter]);

  const complianceMetrics = useMemo(() => {
    const activeUsers = users.filter((u) => u.status === 'activo' && !u.anonymizedAt);
    const consentedUsers = activeUsers.filter(
      (u) => u.legalConsentVersion === CURRENT_LEGAL_CONSENT_VERSION
    );
    const anonymizedUsers = users.filter((u) => Boolean(u.anonymizedAt));
    const openIncidents = incidents.filter((i) => i.status !== 'cerrado');
    const criticalAuditCount = auditEvents.filter((e) => e.severity === 'critical').length;
    return {
      activeCount: activeUsers.length,
      consentedCount: consentedUsers.length,
      consentPct:
        activeUsers.length > 0 ? Math.round((consentedUsers.length / activeUsers.length) * 100) : 100,
      anonymizedCount: anonymizedUsers.length,
      openIncidentsCount: openIncidents.length,
      criticalAuditCount,
    };
  }, [users, incidents, auditEvents]);

  const handleExportAuditCsv = async () => {
    try {
      const headers = [
        'ID',
        'Fecha UTC',
        'Acción',
        'Severidad',
        'Actor',
        'Email Actor',
        'Rol',
        'Organización',
        'Objetivo',
        'Detalle',
      ];
      const rows = filteredEvents.map((ev) => [
        ev.id,
        ev.fechaHora,
        SECURITY_AUDIT_ACTION_LABELS[ev.action] || ev.action,
        ev.severity,
        ev.actorName,
        ev.actorEmail,
        ev.actorRole,
        ev.organizationId || 'global',
        ev.targetLabel || ev.targetId || '-',
        ev.summary,
      ]);
      const rawCsv = `\uFEFF${[headers, ...rows]
        .map((r) => r.map(escapeCsvCell).join(','))
        .join('\n')}`;

      const { signedCsv, seal } = await signCsvExportWithIntegritySeal({
        csvContent: rawCsv,
        reportType: 'Bitácora de Auditoría de Seguridad ISO 27001',
        actorName: currentUser.name,
        actorRole: currentUser.role,
        normativeRef: 'ISO/IEC 27001 A.8.15 · Ley 21.663 · Ley 19.628 / 21.719',
        rowCount: filteredEvents.length,
      });

      const blob = new Blob([signedCsv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `MineSafe_Auditoria_Seguridad_${seal.folio}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      await logSecurityAuditEventInRTDB(
        {
          action: 'exportacion_reporte_sellado',
          severity: 'info',
          summary: `Exportación CSV de bitácora de seguridad (${filteredEvents.length} registros) con Folio ${seal.folio} y SHA-256 ${seal.shortHash}`,
          metadata: {
            folio: seal.folio,
            sha256Short: seal.shortHash,
            rows: filteredEvents.length,
          },
        },
        currentUser
      );

      setFeedback({
        type: 'success',
        text: `Bitácora exportada con sello verificable SHA-256 · Folio ${seal.folio} (${seal.shortHash})`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || 'No se pudo exportar la bitácora.',
      });
    }
  };

  const handleCreateIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingIncident(true);
    setFeedback(null);
    try {
      const created = await logCybersecurityIncidentInRTDB(
        {
          title: incTitle,
          category: incCategory,
          severity: incSeverity,
          affectedSystem: incSystem,
          description: incDescription,
          csirtNotified: incCsirtNotified,
        },
        currentUser
      );
      setIncTitle('');
      setIncDescription('');
      setIncCsirtNotified(false);
      setFeedback({
        type: 'success',
        text: `Incidente ${created.code} registrado en bitácora Ley 21.663.`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || 'Error al registrar incidente.',
      });
    } finally {
      setSavingIncident(false);
    }
  };

  const handleUpdateIncident = async (
    incident: CybersecurityIncident,
    nextStatus: CybersecurityIncidentStatus,
    nextCsirtNotified?: boolean
  ) => {
    setUpdatingIncidentId(incident.id);
    setFeedback(null);
    try {
      await updateCybersecurityIncidentStatusInRTDB(
        incident.id,
        {
          status: nextStatus,
          csirtNotified: nextCsirtNotified ?? incident.csirtNotified,
          resolutionNotes: resolutionDrafts[incident.id] ?? incident.resolutionNotes,
        },
        currentUser
      );
      setFeedback({
        type: 'success',
        text: `Incidente ${incident.code} actualizado a "${INCIDENT_STATUS_LABELS[nextStatus]}".`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || 'Error al actualizar el incidente.',
      });
    } finally {
      setUpdatingIncidentId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Encabezado Principal */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-3 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">
                Centro de Seguridad, Auditoría y Cumplimiento Legal
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Trazabilidad inmutable ISO/IEC 27001 · Protección de Datos Ley 19.628 / 21.719 (ARCOP) ·
                Ciberseguridad Ley 21.663 / 21.459 · DS 132 / DS 594
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSubTab('bitacora')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-all ${
                subTab === 'bitacora'
                  ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
                  : 'bg-slate-800/70 text-slate-300 border-slate-700 hover:bg-slate-800'
              }`}
            >
              <Eye className="w-4 h-4" />
              Bitácora ISO 27001 ({auditEvents.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('incidentes')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-all ${
                subTab === 'incidentes'
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                  : 'bg-slate-800/70 text-slate-300 border-slate-700 hover:bg-slate-800'
              }`}
            >
              <ShieldAlert className="w-4 h-4" />
              Incidentes Ley 21.663 ({complianceMetrics.openIncidentsCount} activos)
            </button>
            <button
              type="button"
              onClick={() => setSubTab('cumplimiento')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-all ${
                subTab === 'cumplimiento'
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                  : 'bg-slate-800/70 text-slate-300 border-slate-700 hover:bg-slate-800'
              }`}
            >
              <Scale className="w-4 h-4" />
              Cumplimiento y Privacidad
            </button>
          </div>
        </div>

        {/* KPIs rápidos */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
          <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-3.5">
            <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
              Eventos Auditados
            </p>
            <p className="text-2xl font-black text-white mt-1">{auditEvents.length}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {complianceMetrics.criticalAuditCount} críticos registrados
            </p>
          </div>
          <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-3.5">
            <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
              Consentimiento v{CURRENT_LEGAL_CONSENT_VERSION}
            </p>
            <p className="text-2xl font-black text-emerald-400 mt-1">{complianceMetrics.consentPct}%</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {complianceMetrics.consentedCount} de {complianceMetrics.activeCount} usuarios activos
            </p>
          </div>
          <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-3.5">
            <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
              Incidentes Abiertos
            </p>
            <p
              className={`text-2xl font-black mt-1 ${
                complianceMetrics.openIncidentsCount > 0 ? 'text-amber-400' : 'text-cyan-400'
              }`}
            >
              {complianceMetrics.openIncidentsCount}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">{incidents.length} totales históricos</p>
          </div>
          <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-3.5">
            <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
              Cuentas Anonimizadas ARCOP
            </p>
            <p className="text-2xl font-black text-sky-400 mt-1">{complianceMetrics.anonymizedCount}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">PII purgado sin perder DS 132</p>
          </div>
        </div>

        {feedback && (
          <div
            className={`mt-4 px-4 py-3 rounded-xl border text-xs font-medium flex items-center justify-between gap-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
            }`}
          >
            <span>{feedback.text}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="underline opacity-80 hover:opacity-100"
            >
              Cerrar
            </button>
          </div>
        )}
      </div>

      {/* SUB-TAB 1: BITÁCORA INMUTABLE */}
      {subTab === 'bitacora' && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-4">
          <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2 flex-1">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar por usuario, acción, RUT/correo desbloqueado, folio..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:border-cyan-500 outline-none"
                />
              </div>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value as any)}
                className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-200"
              >
                <option value="all">Todas las severidades</option>
                <option value="info">Informativo</option>
                <option value="warning">Sensible</option>
                <option value="critical">Crítico</option>
              </select>
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value as any)}
                className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-200"
              >
                <option value="all">Todas las acciones</option>
                {Object.entries(SECURITY_AUDIT_ACTION_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleExportAuditCsv}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-colors shrink-0"
            >
              <Download className="w-4 h-4" />
              Exportar CSV con Sello SHA-256
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/90 text-slate-400 uppercase text-[11px]">
                <tr>
                  <th className="px-3.5 py-2.5">Fecha / Hora</th>
                  <th className="px-3.5 py-2.5">Evento</th>
                  <th className="px-3.5 py-2.5">Nivel</th>
                  <th className="px-3.5 py-2.5">Responsable</th>
                  <th className="px-3.5 py-2.5">Detalle Auditado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredEvents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                      No hay eventos de auditoría que coincidan con los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  filteredEvents.slice(0, 150).map((ev) => {
                    const sevStyle =
                      SECURITY_AUDIT_SEVERITY_STYLES[ev.severity] ||
                      SECURITY_AUDIT_SEVERITY_STYLES.info;
                    return (
                      <tr key={ev.id} className="hover:bg-slate-800/40">
                        <td className="px-3.5 py-2.5 whitespace-nowrap font-mono text-[11px] text-slate-300">
                          {ev.timestamp
                            ? new Date(ev.timestamp).toLocaleString('es-CL')
                            : ev.fechaHora}
                        </td>
                        <td className="px-3.5 py-2.5 font-semibold text-white">
                          {SECURITY_AUDIT_ACTION_LABELS[ev.action] || ev.action}
                        </td>
                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-md border text-[10px] font-bold ${sevStyle.badgeClass}`}
                          >
                            {sevStyle.label}
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5">
                          <div className="font-medium text-slate-200">{ev.actorName}</div>
                          <div className="text-[10px] text-slate-400">{ev.actorRole}</div>
                        </td>
                        <td className="px-3.5 py-2.5 text-slate-300 max-w-md">{ev.summary}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: INCIDENTES DE CIBERSEGURIDAD */}
      {subTab === 'incidentes' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* Formulario Registro */}
          <form
            onSubmit={handleCreateIncident}
            className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-3.5 h-fit"
          >
            <div className="flex items-center gap-2 text-amber-400">
              <Plus className="w-4 h-4" />
              <h3 className="font-bold text-sm text-white">Registrar Incidente de Ciberseguridad</h3>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Conforme a la <strong>Ley 21.663</strong>, los incidentes de severidad Alta o Crítica activan
              automáticamente la ventana de alerta temprana de <strong>3 horas</strong> hacia el CSIRT Nacional.
            </p>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Título del Incidente
              </label>
              <input
                type="text"
                required
                minLength={4}
                value={incTitle}
                onChange={(e) => setIncTitle(e.target.value)}
                placeholder="Ej: Múltiples intentos fallidos desde IP externa"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Categoría</label>
                <select
                  value={incCategory}
                  onChange={(e) => setIncCategory(e.target.value as CybersecurityIncidentCategory)}
                  className="w-full px-2.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-200"
                >
                  {Object.entries(INCIDENT_CATEGORY_LABELS).map(([k, lbl]) => (
                    <option key={k} value={k}>
                      {lbl}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Severidad</label>
                <select
                  value={incSeverity}
                  onChange={(e) => setIncSeverity(e.target.value as CybersecurityIncidentSeverity)}
                  className="w-full px-2.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-200"
                >
                  <option value="baja">Baja</option>
                  <option value="media">Media</option>
                  <option value="alta">Alta (CSIRT 3h)</option>
                  <option value="critica">Crítica (CSIRT 3h)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Sistema / Activo Afectado
              </label>
              <input
                type="text"
                value={incSystem}
                onChange={(e) => setIncSystem(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Descripción Técnica y Evidencia
              </label>
              <textarea
                rows={4}
                required
                minLength={10}
                value={incDescription}
                onChange={(e) => setIncDescription(e.target.value)}
                placeholder="Detalle vectores detectados, cuentas o dispositivos afectados y acciones iniciales..."
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white resize-none"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={incCsirtNotified}
                onChange={(e) => setIncCsirtNotified(e.target.checked)}
                className="rounded border-slate-600 text-cyan-500"
              />
              Alerta temprana enviada al CSIRT Chile
            </label>

            <button
              type="submit"
              disabled={savingIncident}
              className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-colors disabled:opacity-50"
            >
              {savingIncident ? 'Registrando...' : 'Registrar Incidente'}
            </button>
          </form>

          {/* Listado de Incidentes */}
          <div className="xl:col-span-2 space-y-3">
            {incidents.length === 0 ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-10 text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <p className="text-sm font-bold text-white">Sin incidentes de ciberseguridad registrados</p>
                <p className="text-xs text-slate-400">
                  Los eventos sospechosos, bloqueos de seguridad o contingencias Ley 21.663 aparecerán aquí.
                </p>
              </div>
            ) : (
              incidents.map((inc) => (
                <div
                  key={inc.id}
                  className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-cyan-400">{inc.code}</span>
                        <span
                          className={`px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase ${
                            INCIDENT_SEVERITY_STYLES[inc.severity]
                          }`}
                        >
                          {inc.severity}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-[10px] font-semibold text-slate-300">
                          {INCIDENT_STATUS_LABELS[inc.status]}
                        </span>
                        {inc.csirtNotified ? (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-bold text-emerald-300">
                            CSIRT Notificado
                          </span>
                        ) : inc.csirtNotificationDueAt ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/15 border border-rose-500/30 text-[10px] font-bold text-rose-300">
                            <Clock className="w-3 h-3" />
                            Plazo CSIRT 3h:{' '}
                            {new Date(inc.csirtNotificationDueAt).toLocaleTimeString('es-CL')}
                          </span>
                        ) : null}
                      </div>
                      <h4 className="text-sm font-bold text-white mt-1">{inc.title}</h4>
                      <p className="text-[11px] text-slate-400">
                        {INCIDENT_CATEGORY_LABELS[inc.category]} · Activo: {inc.affectedSystem} · Reportado
                        por {inc.reportedByName} ({new Date(inc.reportedAt).toLocaleString('es-CL')})
                      </p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                    {inc.description}
                  </p>

                  <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                    <input
                      type="text"
                      value={resolutionDrafts[inc.id] ?? inc.resolutionNotes ?? ''}
                      onChange={(e) =>
                        setResolutionDrafts((prev) => ({ ...prev, [inc.id]: e.target.value }))
                      }
                      placeholder="Notas de contención, remediación o folio CSIRT..."
                      className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-200"
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {!inc.csirtNotified && (
                        <button
                          type="button"
                          disabled={updatingIncidentId === inc.id}
                          onClick={() => handleUpdateIncident(inc, inc.status, true)}
                          className="px-2.5 py-1.5 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/30 text-[11px] font-semibold"
                        >
                          Marcar CSIRT
                        </button>
                      )}
                      {inc.status !== 'contenido' && inc.status !== 'cerrado' && (
                        <button
                          type="button"
                          disabled={updatingIncidentId === inc.id}
                          onClick={() => handleUpdateIncident(inc, 'contenido')}
                          className="px-2.5 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 text-[11px] font-semibold"
                        >
                          Contener
                        </button>
                      )}
                      {inc.status !== 'cerrado' && (
                        <button
                          type="button"
                          disabled={updatingIncidentId === inc.id}
                          onClick={() => handleUpdateIncident(inc, 'cerrado')}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold"
                        >
                          Cerrar Incidente
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 3: CUMPLIMIENTO LEGAL & PRIVACIDAD */}
      {subTab === 'cumplimiento' && (
        <div className="space-y-5">
          {/* Salvaguardas Activas */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                title: 'Endurecimiento Servidor & API IoT',
                std: 'OWASP ASVS · IEC 62443',
                desc: 'Cabeceras HTTP de seguridad, validación de rangos, token de dispositivo en tiempo constante y rate limiting en ingesta.',
              },
              {
                title: 'Sesión Protegida y Anti-Fuerza Bruta',
                std: 'ISO/IEC 27001 A.8.5',
                desc: 'Cierre automático a los 15 minutos de inactividad con alerta de 60s y bloqueo progresivo ante intentos fallidos.',
              },
              {
                title: 'Enmascaramiento PII y Derechos ARCOP',
                std: 'Ley 19.628 · Nueva Ley 21.719',
                desc: 'RUT y correo ocultos por defecto con auditoría de desbloqueo, exportación JSON de portabilidad y anonimización irreversible.',
              },
              {
                title: 'Sello Criptográfico SHA-256',
                std: 'DS 132 (Sernageomin) · DS 594',
                desc: 'Todos los reportes CSV de historial, alertas y auditoría incluyen folio único y huella verificable SHA-256.',
              },
              {
                title: 'Consentimiento Informado Versionado',
                std: `Versión v${CURRENT_LEGAL_CONSENT_VERSION}`,
                desc: 'Aceptación explícita obligatoria al ingresar al panel con registro de fecha y versión en RTDB.',
              },
              {
                title: 'Gestión de Incidentes y CSIRT 3h',
                std: 'Ley 21.663 · Ley 21.459',
                desc: 'Aviso legal de acceso monitoreado y bitácora de incidentes con seguimiento de alerta temprana al CSIRT Nacional.',
              },
            ].map((card) => (
              <div
                key={card.title}
                className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-400">
                    <FileCheck2 className="w-3.5 h-3.5" />
                    ACTIVO
                  </span>
                  <span className="text-[10px] font-semibold text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-md">
                    {card.std}
                  </span>
                </div>
                <h4 className="text-sm font-bold text-white">{card.title}</h4>
                <p className="text-xs text-slate-400 leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>

          {/* Retención + Documentos */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-white">
                  Política de Retención de Datos y Textos Legales Vigentes
                </h3>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onOpenLegalModal('privacidad')}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold border border-slate-700"
                >
                  Ver Política de Privacidad
                </button>
                <button
                  type="button"
                  onClick={() => onOpenLegalModal('terminos')}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold border border-slate-700"
                >
                  Ver Términos de Uso
                </button>
                <button
                  type="button"
                  onClick={() => onOpenLegalModal('ciberseguridad')}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold border border-slate-700"
                >
                  Ver Aviso Ley 21.663 / 21.459
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400">
                  <tr>
                    <th className="px-3.5 py-2.5">Categoría</th>
                    <th className="px-3.5 py-2.5">Fundamento Legal</th>
                    <th className="px-3.5 py-2.5">Plazo de Retención</th>
                    <th className="px-3.5 py-2.5">Disposición Final</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {DATA_RETENTION_POLICY.map((row) => (
                    <tr key={row.category}>
                      <td className="px-3.5 py-2.5 font-semibold text-white">{row.category}</td>
                      <td className="px-3.5 py-2.5 text-slate-300">{row.legalBasis}</td>
                      <td className="px-3.5 py-2.5 text-cyan-300">{row.retentionPeriod}</td>
                      <td className="px-3.5 py-2.5 text-slate-400">{row.disposalMethod}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Matriz DS 132 / DS 594 */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-bold text-white">
                Límites Referenciales DS 132 (Sernageomin) y DS 594 (MINSAL)
              </h3>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400">
                  <tr>
                    <th className="px-3.5 py-2.5">Variable</th>
                    <th className="px-3.5 py-2.5">Límite DS 594</th>
                    <th className="px-3.5 py-2.5">Reglamento DS 132</th>
                    <th className="px-3.5 py-2.5">Protocolo Requerido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {DS132_DS594_NORMATIVE_LIMITS.map((item) => (
                    <tr key={item.variable}>
                      <td className="px-3.5 py-2.5 font-semibold text-white whitespace-nowrap">
                        {item.variable}
                      </td>
                      <td className="px-3.5 py-2.5 text-amber-300">{item.ds594Limit}</td>
                      <td className="px-3.5 py-2.5 text-slate-300">{item.ds132Context}</td>
                      <td className="px-3.5 py-2.5 text-slate-400">{item.actionRequired}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
