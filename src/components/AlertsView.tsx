import React, { useState } from 'react';
import { 
  AlertTriangle, 
  CheckCircle, 
  ShieldAlert, 
  Bell, 
  Filter, 
  Check, 
  Clock, 
  Wind, 
  Volume2, 
  ArrowRight,
  ExternalLink,
  Search,
  Edit3,
  FileText,
  CheckCircle2,
  Flame,
  Cpu,
  Wrench,
  ShieldCheck,
  Download,
  FileSpreadsheet,
  Printer,
  Calendar,
  Radio,
  FileDown,
  Layers,
  Sparkles,
  HardHat,
  Paperclip,
  X
} from 'lucide-react';
import { 
  SafetyAlert, 
  AlertSeverity, 
  NavigationTab, 
  AlertResolutionDetails, 
  UserProfile, 
  SensorDevice, 
  AlarmAuditRecord,
  PlatformConfig
} from '../types';
import { soundAlert } from '../services/audioAlert';
import {
  extractAlarmAuditRecords,
  buildAuditRecordsFromAlerts,
  isSectionVisibleForUser,
} from '../services/firebase';
import { AlertResolutionModal } from './AlertResolutionModal';

interface AlertsViewProps {
  alerts: SafetyAlert[];
  devices?: SensorDevice[];
  currentUser?: UserProfile | null;
  platformConfig?: PlatformConfig;
  isReadOnly?: boolean;
  onAcknowledgeAlert: (alertId: string) => void;
  onResolveAlert: (alertId: string) => void;
  onResolveAlertWithDetails?: (alertId: string, details: AlertResolutionDetails) => Promise<void> | void;
  onTriggerForcedVentilation: (sectorName: string) => void;
  onNavigateTab: (tab: NavigationTab) => void;
  onSelectSensor: (sensorId: string) => void;
}

export const AlertsView: React.FC<AlertsViewProps> = ({
  alerts,
  devices = [],
  currentUser,
  platformConfig,
  isReadOnly = false,
  onAcknowledgeAlert,
  onResolveAlert,
  onResolveAlertWithDetails,
  onTriggerForcedVentilation,
  onNavigateTab,
  onSelectSensor,
}) => {
  const isOperadorReadOnly = Boolean(isReadOnly || currentUser?.role === 'operador');
  const isSuperAdmin = currentUser?.role === 'superadmin';
  const showSummaryCards = isSectionVisibleForUser(
    'alerts_summary_cards',
    currentUser,
    platformConfig
  );
  const showFiltersBar = isSectionVisibleForUser('alerts_filters_bar', currentUser, platformConfig);
  const showAuditSubtab = isSectionVisibleForUser(
    'alerts_audit_subtab',
    currentUser,
    platformConfig
  );
  const showSirenTest = isSectionVisibleForUser('alerts_siren_test', currentUser, platformConfig);

  // Main view switcher: Alertas Activas vs Auditoría Registro de Alarmas (RTDB / ESP32)
  const [subTab, setSubTab] = useState<'alertas_activas' | 'auditoria_rtdb'>('alertas_activas');
  const effectiveSubTab = isOperadorReadOnly || !showAuditSubtab ? 'alertas_activas' : subTab;

  // Active alerts filters (recent window + configurable visible cap)
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'active' | 'resolved' | 'all'>('active');
  const [filterTimeRange, setFilterTimeRange] = useState<'24h' | '7d' | '30d' | 'all'>('24h');
  const [visibleAlertsLimit, setVisibleAlertsLimit] = useState<number>(15);
  const [superAdminUnrestricted, setSuperAdminUnrestricted] = useState<boolean>(false);
  const [isTestingSiren, setIsTestingSiren] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [alertToResolve, setAlertToResolve] = useState<SafetyAlert | null>(null);
  const [alertToInspect, setAlertToInspect] = useState<SafetyAlert | null>(null);

  // Auditoría filters (including Fecha Desde / Fecha Hasta)
  const [filterAuditDevice, setFilterAuditDevice] = useState<string>('all');
  const [filterAuditOrigin, setFilterAuditOrigin] = useState<string>('all');
  const [auditDateFrom, setAuditDateFrom] = useState<string>('');
  const [auditDateTo, setAuditDateTo] = useState<string>('');
  const [searchAudit, setSearchAudit] = useState('');
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [showPrintPreview, setShowPrintPreview] = useState(false);

  const parseRecordDateMs = (rec: AlarmAuditRecord): number => {
    if (rec.timestampServer && rec.timestampServer > 0) return rec.timestampServer;
    const raw = (rec.fecha || '').trim();
    const dmy = raw.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
    if (dmy) {
      return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])).getTime();
    }
    const ymd = raw.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
    if (ymd) {
      return new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])).getTime();
    }
    return 0;
  };

  // Combine hardware alarm records with web-documented alert resolutions
  const esp32AuditRecords: AlarmAuditRecord[] = extractAlarmAuditRecords(devices);
  const webBitacoraAuditRecords: AlarmAuditRecord[] = buildAuditRecordsFromAlerts(alerts);
  const allAuditRecords: AlarmAuditRecord[] = [...webBitacoraAuditRecords, ...esp32AuditRecords].sort(
    (a, b) => (b.timestampServer || 0) - (a.timestampServer || 0)
  );

  // Filter audit records (including Fecha Desde / Fecha Hasta)
  const fromMs = auditDateFrom ? new Date(`${auditDateFrom}T00:00:00`).getTime() : null;
  const toMs = auditDateTo ? new Date(`${auditDateTo}T23:59:59.999`).getTime() : null;

  const filteredAuditRecords = allAuditRecords.filter((rec) => {
    const matchesDevice = filterAuditDevice === 'all' || rec.deviceId === filterAuditDevice;
    const matchesOrigin = filterAuditOrigin === 'all' || rec.origen === filterAuditOrigin;
    const recMs = parseRecordDateMs(rec);
    const matchesDateFrom = fromMs === null || (recMs > 0 && recMs >= fromMs);
    const matchesDateTo = toMs === null || (recMs > 0 && recMs <= toMs);
    const q = searchAudit.toLowerCase();
    const matchesSearch =
      !q ||
      rec.id.toLowerCase().includes(q) ||
      rec.deviceName.toLowerCase().includes(q) ||
      rec.deviceId.toLowerCase().includes(q) ||
      rec.descripcion.toLowerCase().includes(q) ||
      (rec.alertTitle || '').toLowerCase().includes(q) ||
      (rec.correctiveActions || '').toLowerCase().includes(q) ||
      (rec.resolvedBy || '').toLowerCase().includes(q) ||
      rec.fecha.includes(searchAudit) ||
      rec.hora.includes(searchAudit);
    return matchesDevice && matchesOrigin && matchesDateFrom && matchesDateTo && matchesSearch;
  });

  // Recency window for active alerts
  const nowMs = Date.now();
  const rangeCutoffMs =
    filterTimeRange === '24h'
      ? nowMs - 24 * 60 * 60 * 1000
      : filterTimeRange === '7d'
      ? nowMs - 7 * 24 * 60 * 60 * 1000
      : filterTimeRange === '30d'
      ? nowMs - 30 * 24 * 60 * 60 * 1000
      : 0;

  const matchesRecencyWindow = (alert: SafetyAlert) => {
    if (isSuperAdmin && superAdminUnrestricted) return true;
    if (rangeCutoffMs <= 0) return true;
    const ts = alert.createdAtMs || alert.timestampMs || 0;
    return ts === 0 || ts >= rangeCutoffMs;
  };

  // Filter regular alerts
  const filteredAlerts = alerts.filter((alert) => {
    const matchesSeverity = filterSeverity === 'all' || alert.severity === filterSeverity;
    const matchesStatus = 
      filterStatus === 'all' || 
      (filterStatus === 'active' && !alert.resolved) || 
      (filterStatus === 'resolved' && alert.resolved);
    const matchesTime = matchesRecencyWindow(alert);
    const q = searchQuery.toLowerCase();
    const matchesSearch = 
      !q ||
      alert.title.toLowerCase().includes(q) ||
      alert.code.toLowerCase().includes(q) ||
      alert.sectorName.toLowerCase().includes(q) ||
      alert.sensorCode.toLowerCase().includes(q) ||
      alert.variableName.toLowerCase().includes(q) ||
      (alert.resolutionDetails?.comment || '').toLowerCase().includes(q) ||
      (alert.resolutionDetails?.correctiveActions || '').toLowerCase().includes(q);

    return matchesSeverity && matchesStatus && matchesTime && matchesSearch;
  });

  const visibleAlerts =
    isSuperAdmin && superAdminUnrestricted
      ? filteredAlerts
      : filteredAlerts.slice(0, visibleAlertsLimit);
  const recentScopedAlerts = alerts.filter(matchesRecencyWindow);
  const activeAlertsCount = recentScopedAlerts.filter(a => !a.resolved).length;
  const resolvedAlertsCount = recentScopedAlerts.filter(a => a.resolved).length;
  const criticalCount = recentScopedAlerts.filter(a => !a.resolved && a.severity === 'critico').length;
  const warningCount = recentScopedAlerts.filter(a => !a.resolved && a.severity === 'advertencia').length;

  const getResolutionTypeLabel = (type?: string) => {
    switch (type) {
      case 'emergencia_real':
        return { label: 'Emergencia Real / Fuga Verdadera', cls: 'bg-rose-950/90 text-rose-300 border-rose-800' };
      case 'simulacro':
        return { label: 'Simulacro / Entrenamiento', cls: 'bg-amber-950/90 text-amber-300 border-amber-800' };
      case 'falsa_alarma_sensor':
        return { label: 'Falsa Alarma / Falla de Sensor', cls: 'bg-cyan-950/90 text-cyan-300 border-cyan-800' };
      case 'prueba_operativa':
        return { label: 'Prueba Operativa / Mantenimiento', cls: 'bg-emerald-950/90 text-emerald-300 border-emerald-800' };
      default:
        return { label: 'Contingencia Documentada', cls: 'bg-slate-800 text-slate-300 border-slate-700' };
    }
  };

  const showExportToast = (msg: string) => {
    setExportNotice(msg);
    setTimeout(() => setExportNotice(null), 3500);
  };

  // 1. Exportar a Excel (.csv con UTF-8 BOM respetando el rango de fechas y filtros activos)
  const handleExportAuditExcel = () => {
    soundAlert.playFeedbackBeep();
    const rowsToExport = filteredAuditRecords;
    if (rowsToExport.length === 0) {
      showExportToast('No existen registros dentro del rango de fechas y filtros seleccionados para exportar.');
      return;
    }

    // Headers con estándar de auditoría minera DS 132
    const headers = [
      'ID_Registro',
      'ID_Dispositivo',
      'Nombre_Dispositivo',
      'Fecha',
      'Hora',
      'Origen_Alarma',
      'Gas_CO_ADC',
      'Polvo_PM25_ugm3',
      'Temperatura_C',
      'Humedad_Porc',
      'Via_Transmision',
      'Descripcion_Tecnica'
    ];

    const csvRows = [headers.join(';')];

    rowsToExport.forEach((rec) => {
      const cleanDesc = [
        rec.alertTitle ? `[${rec.alertTitle}]` : '',
        rec.descripcion || '',
        rec.correctiveActions ? `Medidas: ${rec.correctiveActions}` : '',
        rec.resolvedBy ? `Responsable: ${rec.resolvedBy}` : '',
      ]
        .filter(Boolean)
        .join(' | ')
        .replace(/[\r\n;]/g, ' ');
      const row = [
        rec.id,
        rec.deviceId,
        `"${rec.deviceName}"`,
        rec.fecha,
        rec.hora,
        rec.origen,
        rec.sourceKind === 'bitacora_web' ? (rec.metricSummary || '-') : rec.co,
        rec.sourceKind === 'bitacora_web' ? '-' : rec.pm25,
        rec.sourceKind === 'bitacora_web' ? '-' : rec.temperatura,
        rec.sourceKind === 'bitacora_web' ? '-' : rec.humedad,
        rec.via || 'WIFI_DIRECTO',
        `"${cleanDesc}"`
      ];
      csvRows.push(row.join(';'));
    });

    // \uFEFF fuerza a Excel a abrir el archivo con codificación UTF-8 correcta (tildes y caracteres especiales)
    const blob = new Blob(['\uFEFF' + csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const nowStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    link.href = url;
    link.setAttribute('download', `Auditoria_Alarmas_ESP32_DS132_${nowStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showExportToast(`Archivo Excel (.csv) generado con ${rowsToExport.length} registros de auditoría.`);
  };

  // 2. Exportar / Imprimir PDF Oficial (Vista Imprimible In-App para compatibilidad iFrame)
  const handleExportAuditPDF = () => {
    soundAlert.playFeedbackBeep();
    setShowPrintPreview(true);
    showExportToast('Vista de impresión preparada. Presiona "Imprimir / Guardar PDF" dentro del reporte.');
  };

  const getSeverityBadge = (severity: AlertSeverity) => {
    switch (severity) {
      case 'critico':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-300 bg-rose-950/90 px-2.5 py-1 rounded border border-rose-800">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            CRÍTICO
          </span>
        );
      case 'advertencia':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-300 bg-amber-950/80 px-2.5 py-1 rounded border border-amber-800">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            ADVERTENCIA
          </span>
        );
      case 'preventivo':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-300 bg-cyan-950/80 px-2.5 py-1 rounded border border-cyan-800">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            PREVENTIVO
          </span>
        );
      case 'desconectado':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-300 bg-slate-900 px-2.5 py-1 rounded border border-slate-700">
            DESCONECTADO
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-300 bg-emerald-950/60 px-2.5 py-1 rounded border border-emerald-800/60">
            NORMAL
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Summary Banner */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-rose-400" />
              {isOperadorReadOnly
                ? 'Consulta de Alertas y Descripciones'
                : 'Gestión, Auditoría y Registro de Alertas de Seguridad'}
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              {isOperadorReadOnly
                ? 'Visualización de datos, niveles detectados y descripciones de alertas de seguridad de tu empresa.'
                : 'Monitoreo centralizado de contingencias y auditoría de hardware ESP32 según normativa DS 132 (Sernageomin).'}
            </p>
          </div>

          {/* SuperAdmin / Configured: Probar Sirena */}
          {showSirenTest && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (isTestingSiren) {
                    soundAlert.stopContinuousAlarm();
                    setIsTestingSiren(false);
                    showExportToast('Prueba acústica de sirena detenida.');
                  } else {
                    soundAlert.setMuted(false);
                    soundAlert.playCriticalAlert();
                    setIsTestingSiren(true);
                    showExportToast('Prueba de sirena acústica ejecutada (modo diagnóstico SuperAdmin).');
                    setTimeout(() => {
                      setIsTestingSiren(false);
                    }, 1800);
                  }
                }}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  isTestingSiren
                    ? 'bg-rose-600 hover:bg-rose-500 text-white border-rose-400 animate-pulse shadow-lg shadow-rose-950/50'
                    : 'bg-purple-950/70 hover:bg-purple-900 text-purple-200 border-purple-700/70'
                }`}
                title="Ejecutar prueba de sirena de seguridad (Solo SuperAdmin)"
              >
                <Volume2 className="w-4 h-4" />
                <span>{isTestingSiren ? 'Probando Sirena...' : 'Probar Sirena'}</span>
              </button>
            </div>
          )}
        </div>

        {isOperadorReadOnly ? (
          <div className="p-3 rounded-xl bg-amber-950/35 border border-amber-800/60 text-xs text-amber-200 flex items-center gap-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Modo Solo Lectura — Operador:</strong> solo puedes visualizar los datos y la descripción de las alertas de tu empresa. No es posible reconocer, editar, resolver alertas ni acceder a otros módulos.
            </span>
          </div>
        ) : (
          /* View Switcher: Alertas Activas vs Auditoría de Alarmas ESP32 */
          <div className="flex flex-wrap items-center gap-2 p-1.5 bg-slate-950 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setSubTab('alertas_activas')}
              className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                effectiveSubTab === 'alertas_activas'
                  ? 'bg-rose-950 text-rose-200 border border-rose-700 shadow-md shadow-rose-950/50'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Bell className="w-4 h-4 text-rose-400" />
              <span>Alertas Activas de Faena</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-900/90 text-rose-200 font-mono font-bold">
                {activeAlertsCount}
              </span>
            </button>

            {showAuditSubtab && (
              <button
                type="button"
                onClick={() => setSubTab('auditoria_rtdb')}
                className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  effectiveSubTab === 'auditoria_rtdb'
                    ? 'bg-cyan-950 text-cyan-200 border border-cyan-700 shadow-md shadow-cyan-950/50'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                <Radio className="w-4 h-4 text-cyan-400" />
                <span>Auditoría y Registro de Alarmas (RTDB / ESP32)</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-cyan-900/90 text-cyan-200 font-mono font-bold">
                  {allAuditRecords.length}
                </span>
              </button>
            )}
          </div>
        )}

        {/* Export / Save Feedback Toast */}
        {exportNotice && (
          <div className="mt-4 p-3 bg-cyan-950/90 border border-cyan-500/60 text-cyan-200 rounded-xl text-xs font-semibold flex flex-wrap items-center justify-between gap-2 shadow-lg animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>{exportNotice}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setSubTab('alertas_activas');
                  setFilterStatus('resolved');
                }}
                className="px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-[11px] font-bold transition-colors"
              >
                Ver Resueltas ({resolvedAlertsCount})
              </button>
              {!isOperadorReadOnly && showAuditSubtab && (
                <button
                  type="button"
                  onClick={() => setSubTab('auditoria_rtdb')}
                  className="px-2.5 py-1 rounded bg-cyan-700 hover:bg-cyan-600 text-white text-[11px] font-bold transition-colors"
                >
                  Ver Auditoría ({allAuditRecords.length})
                </button>
              )}
              <button 
                onClick={() => setExportNotice(null)} 
                className="text-cyan-400 hover:text-white text-[10px] font-bold ml-1"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}

      </div>

      {/* ==============================================================
          SUBTAB 1: ALERTAS ACTIVAS EN TIEMPO REAL
         ============================================================== */}
      {effectiveSubTab === 'alertas_activas' && (
        <div className="space-y-6">
          {/* Severity Count Cards */}
          {showSummaryCards && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-400 block">Total Activas</span>
                <span className="text-2xl font-bold text-white font-mono">{activeAlertsCount}</span>
              </div>
              <div className="w-9 h-9 rounded-lg bg-slate-800/80 flex items-center justify-center text-slate-400">
                <Bell className="w-5 h-5" />
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-950/60 border border-rose-900/40 flex items-center justify-between">
              <div>
                <span className="text-xs text-rose-300 block">Riesgo Crítico</span>
                <span className="text-2xl font-bold text-rose-400 font-mono">{criticalCount}</span>
              </div>
              <div className="w-9 h-9 rounded-lg bg-rose-950 flex items-center justify-center text-rose-400 border border-rose-800">
                <ShieldAlert className="w-5 h-5" />
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-950/60 border border-amber-900/40 flex items-center justify-between">
              <div>
                <span className="text-xs text-amber-300 block">Advertencia</span>
                <span className="text-2xl font-bold text-amber-400 font-mono">{warningCount}</span>
              </div>
              <div className="w-9 h-9 rounded-lg bg-amber-950 flex items-center justify-center text-amber-400 border border-amber-800">
                <AlertTriangle className="w-5 h-5" />
              </div>
            </div>
          </div>
          )}

          {/* Filters Bar */}
          {showFiltersBar && (
          <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar por sector, variable o sensor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={filterTimeRange}
                onChange={(e) => {
                  setFilterTimeRange(e.target.value as '24h' | '7d' | '30d' | 'all');
                  setVisibleAlertsLimit(15);
                }}
                aria-label="Rango de tiempo de alertas"
                className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
              >
                <option value="24h">Últimas 24 horas</option>
                <option value="7d">Últimos 7 días</option>
                <option value="30d">Últimos 30 días</option>
                <option value="all">Todo el historial</option>
              </select>

              <select
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
              >
                <option value="all">Todas las severidades</option>
                <option value="critico">Solo Críticas</option>
                <option value="advertencia">Solo Advertencias</option>
                <option value="preventivo">Solo Preventivas</option>
                <option value="desconectado">Desconectadas</option>
              </select>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
              >
                <option value="active">Solo Activas ({activeAlertsCount})</option>
                <option value="resolved">Solo Resueltas ({resolvedAlertsCount})</option>
                <option value="all">Todas ({recentScopedAlerts.length})</option>
              </select>

              {isSuperAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setSuperAdminUnrestricted((prev) => {
                      const next = !prev;
                      if (next) {
                        setFilterTimeRange('all');
                        setFilterStatus('all');
                      }
                      return next;
                    });
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                    superAdminUnrestricted
                      ? 'bg-purple-700 text-white border-purple-500'
                      : 'bg-slate-950 text-purple-300 border-purple-800/70 hover:bg-purple-950/60'
                  }`}
                  title="Desactivar recorte de 24h y paginación para auditar el historial completo (Solo SuperAdmin)"
                >
                  {superAdminUnrestricted ? `Sin Recortes (${alerts.length})` : 'Ver Todo (SuperAdmin)'}
                </button>
              )}
            </div>
          </div>
          )}

          {/* Active Alerts List */}
          <div className="space-y-3">
            {filteredAlerts.length === 0 ? (
              <div className="text-center py-12 bg-slate-900/40 border border-slate-800 rounded-xl">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2 opacity-80" />
                <p className="text-sm font-semibold text-slate-200">No se encontraron alertas para los filtros seleccionados</p>
                <p className="text-xs text-slate-400 mt-1">Todos los sectores monitoreados operan dentro de los umbrales seguros.</p>
              </div>
            ) : (
              visibleAlerts.map((alert) => {
                const resBadge = alert.resolutionDetails
                  ? getResolutionTypeLabel(alert.resolutionDetails.resolutionType)
                  : null;

                return (
                <div
                  key={alert.id}
                  className={`p-4 rounded-xl border transition-all ${
                    alert.resolved
                      ? 'bg-slate-900/60 border-slate-800/90'
                      : alert.severity === 'critico'
                      ? 'bg-rose-950/20 border-rose-800/70 hover:border-rose-600'
                      : 'bg-amber-950/20 border-amber-800/70 hover:border-amber-600'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {getSeverityBadge(alert.severity)}
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">
                          {alert.code}
                        </span>
                        <span className="text-xs font-bold text-white tracking-wide">{alert.title}</span>
                        {alert.acknowledged && !alert.resolved && (
                          <span className="text-[10px] font-semibold text-cyan-300 bg-cyan-950/70 px-2 py-0.5 rounded border border-cyan-800/70">
                            Reconocida{alert.acknowledgedBy ? `: ${alert.acknowledgedBy}` : ''}
                            {alert.acknowledgedAt ? ` (${new Date(alert.acknowledgedAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })})` : ''}
                          </span>
                        )}
                        {alert.resolved && (
                          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
                            RESUELTA
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-300">
                        {alert.suggestedAction || `${alert.variableName}: ${alert.recordedValue} (Límite seguro: ${alert.safeLimit})`}
                      </p>
                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 pt-0.5">
                        <span>Sector: <strong className="text-slate-200">{alert.sectorName}</strong></span>
                        <span>•</span>
                        <span>Sensor: <strong className="text-cyan-400 font-mono">{alert.sensorCode}</strong></span>
                        <span>•</span>
                        <span>Lectura: <strong className="text-slate-200 font-mono">{alert.recordedValue}</strong></span>
                        <span>•</span>
                        <span className="flex items-center gap-1 font-mono text-slate-400">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {alert.timestamp}
                        </span>
                      </div>

                      {alert.resolutionDetails && (
                        <div className="mt-2.5 p-3 rounded-lg bg-slate-950/85 border border-emerald-900/60 space-y-1.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-300">
                              <FileText className="w-3.5 h-3.5 text-emerald-400" />
                              {alert.resolutionDetails.closingTitle || 'Descripción Guardada en Bitácora'}
                            </span>
                            {resBadge && (
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${resBadge.cls}`}>
                                {resBadge.label}
                              </span>
                            )}
                          </div>
                          {alert.resolutionDetails.comment && (
                            <p className="text-xs text-slate-200 leading-relaxed">
                              {alert.resolutionDetails.comment}
                            </p>
                          )}
                          {alert.resolutionDetails.correctiveActions && (
                            <p className="text-[11px] text-slate-400">
                              <strong className="text-slate-300">Medidas adoptadas:</strong>{' '}
                              {alert.resolutionDetails.correctiveActions}
                            </p>
                          )}
                          {alert.resolutionDetails.attachments && alert.resolutionDetails.attachments.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              {alert.resolutionDetails.attachments.map((att) => (
                                <a
                                  key={att.id}
                                  href={att.downloadUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 border border-cyan-800/60 text-cyan-300 hover:underline text-[10px]"
                                >
                                  <Paperclip className="w-3 h-3" />
                                  <span>{att.fileName}</span>
                                </a>
                              ))}
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400 pt-0.5">
                            <span>
                              Responsable: <strong className="text-cyan-300">{alert.resolutionDetails.resolvedBy}</strong>
                            </span>
                            <span>•</span>
                            <span className="font-mono">{alert.resolutionDetails.resolvedAt}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setAlertToInspect(alert)}
                        className="px-2.5 py-1.5 text-xs font-semibold text-cyan-300 bg-cyan-950/60 hover:bg-cyan-900/70 rounded-lg border border-cyan-800/70 transition-colors flex items-center gap-1.5"
                        title="Ver detalle completo de la alerta sin salir de esta ventana"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Ver Detalle</span>
                      </button>

                      {!isOperadorReadOnly && !alert.acknowledged && (
                        <button
                          type="button"
                          onClick={() => onAcknowledgeAlert(alert.id)}
                          className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition-colors"
                        >
                          Reconocer
                        </button>
                      )}

                      {!isOperadorReadOnly && (!alert.resolved ? (
                        <button
                          type="button"
                          onClick={() => setAlertToResolve(alert)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg transition-colors shadow-sm cursor-pointer"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          Describir y Dar por Resuelta
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setAlertToResolve(alert)}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
                          Editar Bitácora
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                );
              })
            )}

            {!(isSuperAdmin && superAdminUnrestricted) && filteredAlerts.length > visibleAlertsLimit && (
              <div className="flex items-center justify-center pt-2">
                <button
                  type="button"
                  onClick={() => setVisibleAlertsLimit((prev) => prev + 15)}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-cyan-300 transition-colors"
                >
                  Mostrar más alertas ({visibleAlerts.length} de {filteredAlerts.length})
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==============================================================
          SUBTAB 2: AUDITORÍA Y REGISTRO DE ALARMAS (NODO registro_alarmas)
         ============================================================== */}
      {effectiveSubTab === 'auditoria_rtdb' && (
        <div className="space-y-5 animate-in fade-in">
          
          {/* Auditoría Header & Export Bar */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-xl">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Radio className="w-5 h-5 text-cyan-400 animate-pulse" />
                <h2 className="text-base font-bold text-white tracking-wide">
                  Bitácora Consolidada y Auditoría de Alarmas
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
                  Registro Normativo DS 132
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Historial unificado de alarmas detectadas en terreno y bitácoras de cierre documentadas. Filtra por rango de fechas para exportar Excel o PDF.
              </p>
            </div>

            {/* Export Buttons: Excel & PDF */}
            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={handleExportAuditExcel}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors shadow-md shadow-emerald-950 cursor-pointer"
                title="Descargar tabla filtrada en Excel / CSV con formato UTF-8"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-100" />
                <span>Exportar a Excel (.csv)</span>
              </button>

              <button
                type="button"
                onClick={handleExportAuditPDF}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition-colors shadow-md shadow-cyan-950 cursor-pointer"
                title="Generar e imprimir informe oficial en PDF respetando las fechas seleccionadas"
              >
                <Printer className="w-4 h-4 text-cyan-100" />
                <span>Exportar a PDF / Imprimir</span>
              </button>
            </div>
          </div>

          {/* Audit Filters Bar (with Fecha Desde / Fecha Hasta) */}
          <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl space-y-3">
            <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Buscar por ID, equipo, descripción, responsable o fecha..."
                  value={searchAudit}
                  onChange={(e) => setSearchAudit(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={filterAuditDevice}
                  onChange={(e) => setFilterAuditDevice(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
                >
                  <option value="all">Todos los equipos ({allAuditRecords.length})</option>
                  {Array.from(new Set(allAuditRecords.map(r => r.deviceId))).map((devId) => {
                    const label = allAuditRecords.find((r) => r.deviceId === devId)?.deviceName || devId;
                    return (
                      <option key={devId} value={devId}>
                        {label}
                      </option>
                    );
                  })}
                </select>

                <select
                  value={filterAuditOrigin}
                  onChange={(e) => setFilterAuditOrigin(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
                >
                  <option value="all">Todos los orígenes ({allAuditRecords.length})</option>
                  <option value="BITACORA_EMERGENCIA_REAL">Bitácora: Emergencia Real</option>
                  <option value="BITACORA_SIMULACRO">Bitácora: Simulacro</option>
                  <option value="BITACORA_FALSA_ALARMA">Bitácora: Falsa Alarma / Sensor</option>
                  <option value="BITACORA_PRUEBA_OPERATIVA">Bitácora: Prueba Operativa</option>
                  <option value="CAUSA_NATURAL_SENSORES">Terreno: Causa Natural (Sensores)</option>
                  <option value="ACTIVACION_MANUAL_USUARIO">Terreno: Activación Manual</option>
                </select>
              </div>
            </div>

            {/* Date Range Filter Row (Fecha Desde / Fecha Hasta) */}
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-800/80 text-xs">
              <span className="inline-flex items-center gap-1.5 font-semibold text-slate-300">
                <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                Rango de Fechas:
              </span>
              <label className="flex items-center gap-1.5 text-slate-400">
                <span>Desde:</span>
                <input
                  type="date"
                  value={auditDateFrom}
                  onChange={(e) => setAuditDateFrom(e.target.value)}
                  aria-label="Fecha desde"
                  className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </label>
              <label className="flex items-center gap-1.5 text-slate-400">
                <span>Hasta:</span>
                <input
                  type="date"
                  value={auditDateTo}
                  onChange={(e) => setAuditDateTo(e.target.value)}
                  aria-label="Fecha hasta"
                  className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </label>
              {(auditDateFrom || auditDateTo) && (
                <button
                  type="button"
                  onClick={() => {
                    setAuditDateFrom('');
                    setAuditDateTo('');
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold transition-colors"
                >
                  Limpiar fechas
                </button>
              )}
              <span className="ml-auto text-[11px] text-slate-400">
                Mostrando <strong className="text-cyan-300">{filteredAuditRecords.length}</strong> de {allAuditRecords.length} registros
              </span>
            </div>
          </div>

          {/* Audit Records Table */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
            {filteredAuditRecords.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Radio className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-300">No hay registros de alarmas que coincidan con los filtros.</p>
                <p className="text-xs text-slate-400 mt-1">Los disparos de alarma del ESP32 y las alertas descritas en bitácora aparecerán aquí.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-950/90 border-b border-slate-800 text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
                      <th className="py-3 px-4">Fecha / Hora</th>
                      <th className="py-3 px-4">Dispositivo / Sector</th>
                      <th className="py-3 px-4">Origen / Tipo</th>
                      <th className="py-3 px-4">Mediciones / Parámetro</th>
                      <th className="py-3 px-4">Descripción Guardada</th>
                      <th className="py-3 px-4">Vía</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredAuditRecords.map((rec) => {
                      const isNatural = rec.origen.includes('NATURAL') || rec.origen.includes('EMERGENCIA_REAL');
                      const isWeb = rec.sourceKind === 'bitacora_web';
                      return (
                        <tr key={`${rec.sourceKind || 'esp'}-${rec.deviceId}-${rec.id}`} className="hover:bg-slate-800/40 transition-colors align-top">
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="font-bold text-white block">{rec.fecha}</span>
                            <span className="text-[11px] font-mono text-cyan-400">{rec.hora}</span>
                          </td>

                          <td className="py-3 px-4">
                            <span className="font-bold text-slate-200 block truncate max-w-[180px]">{rec.deviceName}</span>
                            <span className="text-[10px] font-mono text-slate-400 block">{rec.deviceId}</span>
                            {isWeb && (
                              <span className="text-[9px] font-mono text-slate-500 block mt-0.5 truncate max-w-[180px]">{rec.id}</span>
                            )}
                          </td>

                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border font-mono ${
                              isNatural 
                                ? 'bg-rose-950 text-rose-300 border-rose-800'
                                : rec.origen.includes('FALSA_ALARMA')
                                ? 'bg-cyan-950 text-cyan-300 border-cyan-800'
                                : rec.origen.includes('PRUEBA')
                                ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                                : 'bg-amber-950 text-amber-300 border-amber-800'
                            }`}>
                              {isNatural ? <Flame className="w-2.5 h-2.5" /> : <HardHat className="w-2.5 h-2.5" />}
                              <span>{rec.origen}</span>
                            </span>
                          </td>

                          <td className="py-3 px-4 font-mono text-[11px]">
                            {isWeb ? (
                              <span className="text-cyan-300 font-semibold block max-w-[200px]">
                                {rec.metricSummary}
                              </span>
                            ) : (
                              <>
                                <div className="flex items-center gap-2 whitespace-nowrap">
                                  <span className="text-amber-300">CO: <strong>{rec.co} ADC</strong></span>
                                  <span className="text-slate-600">|</span>
                                  <span className="text-purple-300">PM2.5: <strong>{rec.pm25} µg/m³</strong></span>
                                </div>
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  {rec.temperatura}°C • {rec.humedad}% Hum
                                </div>
                              </>
                            )}
                          </td>

                          <td className="py-3 px-4">
                            {(rec.closingTitle || rec.alertTitle) && (
                              <span className="text-[11px] font-bold text-white block mb-0.5">
                                {rec.closingTitle ? `${rec.closingTitle}${rec.alertTitle ? ` — ${rec.alertTitle}` : ''}` : rec.alertTitle}
                              </span>
                            )}
                            <p className="text-slate-300 text-[11px] leading-relaxed max-w-md">
                              {rec.descripcion}
                            </p>
                            {rec.correctiveActions && (
                              <p className="text-[10px] text-slate-400 mt-1 max-w-md">
                                <strong className="text-slate-300">Medidas:</strong> {rec.correctiveActions}
                              </p>
                            )}
                            {rec.attachments && rec.attachments.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                {rec.attachments.map((att) => (
                                  <a
                                    key={att.id}
                                    href={att.downloadUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-900 border border-cyan-800/60 text-cyan-300 hover:underline text-[10px]"
                                  >
                                    <Paperclip className="w-2.5 h-2.5" />
                                    <span>{att.fileName}</span>
                                  </a>
                                ))}
                              </div>
                            )}
                            {rec.resolvedBy && (
                              <span className="text-[10px] text-cyan-300 block mt-0.5">
                                Responsable: {rec.resolvedBy}
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono border ${
                              isWeb
                                ? 'bg-emerald-950/70 text-emerald-300 border-emerald-800'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}>
                              {rec.via || 'WIFI_DIRECTO'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      )}

      {/* Modal para Clasificar y Describir la Alerta */}
      {alertToResolve && !isOperadorReadOnly && (
        <AlertResolutionModal
          alert={alertToResolve}
          currentUser={currentUser}
          onClose={() => setAlertToResolve(null)}
          onConfirmResolution={async (alertId, details) => {
            if (onResolveAlertWithDetails) {
              await onResolveAlertWithDetails(alertId, details);
            } else {
              onResolveAlert(alertId);
            }
            soundAlert.playFeedbackBeep();
            showExportToast('Alerta y descripción guardadas en Firebase RTDB (ver en "Solo Resueltas" o "Todas").');
          }}
        />
      )}

      {/* Modal In-Place de Detalle de Alerta (sin redirección, destacando variable disparadora) */}
      {alertToInspect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  {getSeverityBadge(alertToInspect.severity)}
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800">
                    {alertToInspect.code}
                  </span>
                  {alertToInspect.resolved ? (
                    <span className="text-[10px] font-bold text-emerald-300 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
                      RESUELTA
                    </span>
                  ) : alertToInspect.acknowledged ? (
                    <span className="text-[10px] font-bold text-cyan-300 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-800">
                      RECONOCIDA
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-amber-300 bg-amber-950 px-2 py-0.5 rounded border border-amber-800">
                      ACTIVA
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold text-white">{alertToInspect.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setAlertToInspect(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                aria-label="Cerrar detalle de alerta"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Highlighted Triggering Variable Card */}
            <div className={`p-4 rounded-xl border ${
              alertToInspect.severity === 'critico'
                ? 'bg-rose-950/50 border-rose-500/70'
                : 'bg-amber-950/40 border-amber-500/60'
            }`}>
              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-300 block mb-1">
                Variable que disparó la alarma
              </span>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-lg font-extrabold text-white">
                  {alertToInspect.variableName}
                </span>
                <span className={`text-xl font-mono font-black ${
                  alertToInspect.severity === 'critico' ? 'text-rose-300' : 'text-amber-300'
                }`}>
                  {alertToInspect.recordedValue}
                </span>
              </div>
              <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between text-xs">
                <span className="text-slate-300">Umbral seguro configurado:</span>
                <span className="font-mono font-bold text-emerald-300">{alertToInspect.safeLimit}</span>
              </div>
            </div>

            {/* Full Alert Metadata Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase block">Sector afectado</span>
                <span className="font-bold text-cyan-300">{alertToInspect.sectorName}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase block">Fecha y hora de registro</span>
                <span className="font-mono font-semibold text-white">{alertToInspect.timestamp}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase block">Equipo / Nodo origen</span>
                <span className="font-semibold text-slate-200">{alertToInspect.sensorCode}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase block">Estado de atención</span>
                <span className="font-semibold text-slate-200">
                  {alertToInspect.resolved
                    ? `Resuelta por ${alertToInspect.resolutionDetails?.resolvedBy || 'Operación'}`
                    : alertToInspect.acknowledged
                    ? `Reconocida por ${alertToInspect.acknowledgedBy || 'Operación'}`
                    : 'Pendiente de reconocimiento'}
                </span>
              </div>
            </div>

            {alertToInspect.suggestedAction && (
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-xs">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  Protocolo y acción recomendada
                </span>
                <p className="text-slate-200 leading-relaxed">{alertToInspect.suggestedAction}</p>
              </div>
            )}

            {alertToInspect.resolutionDetails && (
              <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-800/70 text-xs space-y-1">
                <span className="text-[10px] uppercase font-bold text-emerald-300 block">
                  Bitácora de cierre registrada
                </span>
                {alertToInspect.resolutionDetails.closingTitle && (
                  <p className="font-bold text-white">{alertToInspect.resolutionDetails.closingTitle}</p>
                )}
                <p className="text-slate-200">{alertToInspect.resolutionDetails.comment}</p>
                {alertToInspect.resolutionDetails.correctiveActions && (
                  <p className="text-slate-300 text-[11px]">
                    <strong>Medidas:</strong> {alertToInspect.resolutionDetails.correctiveActions}
                  </p>
                )}
              </div>
            )}

            {isSuperAdmin && (
              <div className="p-3 rounded-xl bg-purple-950/25 border border-purple-800/50 text-[11px] font-mono space-y-1">
                <span className="text-[10px] font-sans uppercase font-bold text-purple-300 block">
                  Metadatos Técnicos Crudos (SuperAdmin)
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-slate-300">
                  <span className="truncate">ID Alerta: <strong className="text-cyan-300">{alertToInspect.id}</strong></span>
                  <span className="truncate">Org ID: <strong>{alertToInspect.organizationId || 'global'}</strong></span>
                  <span>createdAtMs: <strong>{alertToInspect.createdAtMs || alertToInspect.timestampMs || 'N/D'}</strong></span>
                  <span>Sensor/Code: <strong>{alertToInspect.sensorCode} / {alertToInspect.code}</strong></span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              {!isOperadorReadOnly && !alertToInspect.acknowledged && (
                <button
                  type="button"
                  onClick={() => {
                    onAcknowledgeAlert(alertToInspect.id);
                    setAlertToInspect((prev) =>
                      prev ? { ...prev, acknowledged: true, acknowledgedBy: currentUser?.name || 'Operación' } : null
                    );
                  }}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700"
                >
                  Reconocer
                </button>
              )}
              {!isOperadorReadOnly && !alertToInspect.resolved && (
                <button
                  type="button"
                  onClick={() => {
                    const target = alertToInspect;
                    setAlertToInspect(null);
                    setAlertToResolve(target);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                >
                  Describir y Dar por Resuelta
                </button>
              )}
              <button
                type="button"
                onClick={() => setAlertToInspect(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Imprimible In-App PDF (sin window.open, respetando rango de fechas) */}
      {showPrintPreview && !isOperadorReadOnly && (() => {
        const rowsToExport = filteredAuditRecords;
        const rangeLabel =
          auditDateFrom || auditDateTo
            ? `Rango: ${auditDateFrom || 'Inicio'} a ${auditDateTo || 'Hoy'}`
            : 'Rango: Todo el historial';
        return (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/90 backdrop-blur-md p-3 sm:p-6 flex items-start justify-center">
            <div className="printable-audit-report bg-white text-slate-900 rounded-2xl max-w-4xl w-full p-6 sm:p-8 shadow-2xl space-y-5 my-4">
              <div className="no-print flex items-center justify-between gap-2 pb-4 border-b border-slate-200">
                <span className="text-xs font-semibold text-slate-600">
                  Vista Previa de Auditoría Oficial DS 132 ({rowsToExport.length} registros · {rangeLabel})
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Imprimir / Guardar PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPrintPreview(false)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-semibold cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    Cerrar
                  </button>
                </div>
              </div>

              <div className="border-b-2 border-sky-600 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-extrabold text-slate-900 uppercase">
                    MINESAFE IOT • AUDITORÍA OFICIAL DE ALARMAS
                  </h2>
                  <p className="text-xs text-slate-600">
                    Cumplimiento Normativo Sernageomin DS 132 — Seguridad Minera
                  </p>
                </div>
                <div className="text-right text-[11px] text-slate-600">
                  <div>Fecha Emisión: {new Date().toLocaleDateString('es-CL')} {new Date().toLocaleTimeString('es-CL')}</div>
                  <div>Auditor: {currentUser?.name || 'Administrador de Faena'}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
                <div>
                  <span className="text-[10px] uppercase text-slate-500 block">Total Registros</span>
                  <strong className="text-sm text-slate-900">{rowsToExport.length}</strong>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-slate-500 block">Causa Natural</span>
                  <strong className="text-sm text-slate-900">{rowsToExport.filter(r => r.origen.includes('NATURAL') || r.origen.includes('EMERGENCIA')).length}</strong>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-slate-500 block">Manual / Simulacro</span>
                  <strong className="text-sm text-slate-900">{rowsToExport.filter(r => r.origen.includes('MANUAL') || r.origen.includes('SIMULACRO')).length}</strong>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-slate-500 block">Nodos Únicos</span>
                  <strong className="text-sm text-slate-900">{new Set(rowsToExport.map(r => r.deviceId)).size}</strong>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-slate-900 text-white text-[10px] uppercase">
                      <th className="p-2">Fecha / Hora</th>
                      <th className="p-2">Dispositivo</th>
                      <th className="p-2">Origen</th>
                      <th className="p-2">Mediciones</th>
                      <th className="p-2">Descripción Técnica</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {rowsToExport.map((r, idx) => (
                      <tr key={`print-${r.id}-${idx}`} className="even:bg-slate-50 align-top">
                        <td className="p-2 whitespace-nowrap">
                          <strong>{r.fecha}</strong>
                          <div className="text-[10px] text-slate-500">{r.hora}</div>
                        </td>
                        <td className="p-2">
                          <strong>{r.deviceName}</strong>
                          <div className="text-[9px] font-mono text-slate-500">{r.deviceId}</div>
                        </td>
                        <td className="p-2 font-mono text-[10px]">{r.origen}</td>
                        <td className="p-2 font-mono text-[10px]">
                          {r.sourceKind === 'bitacora_web'
                            ? r.metricSummary || '-'
                            : `CO: ${r.co} ADC | PM2.5: ${r.pm25} ADC | ${r.temperatura}°C | ${r.humedad}%`}
                        </td>
                        <td className="p-2 text-slate-700">
                          {(r.closingTitle || r.alertTitle) && (
                            <strong className="block text-slate-900">{r.closingTitle || r.alertTitle}</strong>
                          )}
                          <span>{r.descripcion}</span>
                          {r.correctiveActions && (
                            <div className="text-[10px] text-slate-600 mt-0.5">
                              <strong>Medidas:</strong> {r.correctiveActions}
                            </div>
                          )}
                          {r.resolvedBy && (
                            <div className="text-[10px] text-sky-700">
                              <strong>Responsable:</strong> {r.resolvedBy}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
};
