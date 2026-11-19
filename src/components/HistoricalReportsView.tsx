import React, { useState, useMemo, useEffect } from 'react';
import {
  BarChart3,
  Download,
  FileSpreadsheet,
  CheckCircle,
  Info,
  Calendar
} from 'lucide-react';
import {
  TelemetryVariable,
  MiningSite,
  TelemetryHistoryPoint,
  AlertEventRecord,
  SafetyAlert,
  TelemetryRangeKey,
  UserProfile,
  PlatformConfig,
} from '../types';
import { soundAlert } from '../services/audioAlert';
import { isSectionVisibleForUser } from '../services/firebase';
import { getTodayIsoDate, validateDateRange } from '../utils/dateRange';

export interface TelemetryRangeWindow {
  key: TelemetryRangeKey;
  startMs: number;
  endMs: number;
}

interface HistoricalReportsViewProps {
  variables: TelemetryVariable[];
  currentSite: MiningSite;
  currentUser?: UserProfile | null;
  platformConfig?: PlatformConfig;
  activeDeviceId?: string;
  activeDeviceName?: string;
  telemetryHistory?: TelemetryHistoryPoint[];
  alertEvents?: AlertEventRecord[];
  alerts?: SafetyAlert[];
  onRangeChange?: (window: TelemetryRangeWindow) => void;
  isHistoryLoading?: boolean;
  historyTruncated?: boolean;
  historyError?: string | null;
}

export const RANGE_HOURS: Record<Exclude<TelemetryRangeKey, 'custom'>, number> = {
  '1h': 1,
  '6h': 6,
  '24h': 24,
  '7d': 24 * 7,
  '30d': 24 * 30,
};

export function computeTelemetryWindow(
  key: TelemetryRangeKey,
  customStartDate?: string,
  customEndDate?: string,
  nowMs: number = Date.now()
): TelemetryRangeWindow {
  if (key === 'custom') {
    const startParsed = customStartDate ? new Date(`${customStartDate}T00:00:00`).getTime() : NaN;
    const endParsed = customEndDate ? new Date(`${customEndDate}T23:59:59.999`).getTime() : NaN;
    const endMs = Number.isFinite(endParsed) ? endParsed : nowMs;
    const startMs = Number.isFinite(startParsed)
      ? Math.min(startParsed, endMs)
      : endMs - 24 * 3600 * 1000;
    return { key: 'custom', startMs, endMs };
  }
  const hours = RANGE_HOURS[key] || 24;
  return {
    key,
    startMs: nowMs - hours * 3600 * 1000,
    endMs: nowMs,
  };
}

export function escapeCsvCell(value: unknown): string {
  const str = String(value ?? '');
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export interface CsvTelemetryRow {
  timestamp: number;
  value: number;
}

export function buildTelemetryCsvContent(params: {
  rows: CsvTelemetryRow[];
  deviceId: string;
  variableName: string;
  unit: string;
  siteName: string;
  sectorName: string;
}): string {
  const sorted = [...params.rows].sort((a, b) => a.timestamp - b.timestamp);
  const headers = [
    'Dispositivo',
    'Marca_Temporal_ISO',
    'Fecha_Hora_Local',
    'Variable',
    'Valor_Registrado',
    'Unidad',
    'Faena',
    'Sector',
  ].join(',');

  const lines = sorted.map((pt) => {
    const validTs = Number.isFinite(pt.timestamp) && pt.timestamp > 0;
    const iso = validTs ? new Date(pt.timestamp).toISOString() : '';
    const localStr = validTs
      ? new Date(pt.timestamp).toLocaleString('es-CL', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      : 'Lectura Actual';
    return [
      escapeCsvCell(params.deviceId),
      escapeCsvCell(iso),
      escapeCsvCell(localStr),
      escapeCsvCell(params.variableName),
      escapeCsvCell(pt.value),
      escapeCsvCell(params.unit),
      escapeCsvCell(params.siteName),
      escapeCsvCell(params.sectorName),
    ].join(',');
  });

  return '\uFEFF' + headers + '\n' + lines.join('\n') + (lines.length > 0 ? '\n' : '');
}

/**
 * Construcción asíncrona de CSV por bloques para evitar congelamiento del hilo principal
 * al exportar ventanas de varios días (> 10.000 registros).
 */
export async function buildTelemetryCsvContentAsync(
  params: {
    rows: CsvTelemetryRow[];
    deviceId: string;
    variableName: string;
    unit: string;
    siteName: string;
    sectorName: string;
  },
  chunkSize: number = 2000
): Promise<string> {
  const sorted = [...params.rows].sort((a, b) => a.timestamp - b.timestamp);
  const headers = [
    'Dispositivo',
    'Marca_Temporal_ISO',
    'Fecha_Hora_Local',
    'Variable',
    'Valor_Registrado',
    'Unidad',
    'Faena',
    'Sector',
  ].join(',');

  const safeChunkSize = Math.max(250, chunkSize);
  const lines: string[] = [];

  for (let i = 0; i < sorted.length; i += safeChunkSize) {
    const slice = sorted.slice(i, i + safeChunkSize);
    for (const pt of slice) {
      const validTs = Number.isFinite(pt.timestamp) && pt.timestamp > 0;
      const iso = validTs ? new Date(pt.timestamp).toISOString() : '';
      const localStr = validTs
        ? new Date(pt.timestamp).toLocaleString('es-CL', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })
        : 'Lectura Actual';
      lines.push(
        [
          escapeCsvCell(params.deviceId),
          escapeCsvCell(iso),
          escapeCsvCell(localStr),
          escapeCsvCell(params.variableName),
          escapeCsvCell(pt.value),
          escapeCsvCell(params.unit),
          escapeCsvCell(params.siteName),
          escapeCsvCell(params.sectorName),
        ].join(',')
      );
    }
    if (i + safeChunkSize < sorted.length) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  return '\uFEFF' + headers + '\n' + lines.join('\n') + (lines.length > 0 ? '\n' : '');
}

export function downsampleChartPoints<T>(items: T[], maxPoints: number = 48): T[] {
  if (items.length <= maxPoints || maxPoints < 2) return items;
  const result: T[] = [];
  const step = (items.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round(i * step);
    result.push(items[Math.min(items.length - 1, idx)]);
  }
  return result;
}

export const HistoricalReportsView: React.FC<HistoricalReportsViewProps> = ({
  variables,
  currentSite,
  currentUser,
  platformConfig,
  activeDeviceId = '',
  activeDeviceName = 'Sin dispositivo asignado',
  telemetryHistory = [],
  alertEvents = [],
  alerts = [],
  onRangeChange,
  isHistoryLoading = false,
  historyTruncated = false,
  historyError = null,
}) => {
  const showExportCsv = isSectionVisibleForUser('rep_export_csv', currentUser, platformConfig);
  const showChartCard = isSectionVisibleForUser('rep_chart_card', currentUser, platformConfig);
  const showAuditTable = isSectionVisibleForUser('rep_audit_table', currentUser, platformConfig);
  const [selectedVarId, setSelectedVarId] = useState<string>('temp');
  const [timeRange, setTimeRange] = useState<TelemetryRangeKey>('24h');
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const d = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    return d.toISOString().split('T')[0];
  });
  const [customEndDate, setCustomEndDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [showExportSuccess, setShowExportSuccess] = useState(false);
  const [isExportingCsv, setIsExportingCsv] = useState(false);

  const currentVar = variables.find((v) => v.id === selectedVarId) || variables[0];
  const todayIso = getTodayIsoDate();

  const customRangeValidation = useMemo(() => {
    if (timeRange !== 'custom') return { valid: true as const };
    return validateDateRange(customStartDate, customEndDate, {
      maxDays: 90,
      allowFuture: false,
      allowEmpty: false,
    });
  }, [timeRange, customStartDate, customEndDate]);

  useEffect(() => {
    if (!onRangeChange) return;
    if (!customRangeValidation.valid) return;
    onRangeChange(computeTelemetryWindow(timeRange, customStartDate, customEndDate));
  }, [timeRange, customStartDate, customEndDate, customRangeValidation.valid, onRangeChange]);

  const fullSeries = useMemo(() => {
    if (!customRangeValidation.valid) return [];
    const windowBounds = computeTelemetryWindow(timeRange, customStartDate, customEndDate);
    const filtered = telemetryHistory
      .filter((pt) => pt.timestamp >= windowBounds.startMs && pt.timestamp <= windowBounds.endMs)
      .sort((a, b) => a.timestamp - b.timestamp);

    const includeDate = timeRange === '7d' || timeRange === '30d' || timeRange === 'custom';

    const mappedFromRTDB = filtered
      .map((pt) => {
        let val: number | null = null;
        if (currentVar?.id === 'temp') val = pt.temperatura;
        else if (currentVar?.id === 'hum') val = pt.humedad;
        else if (currentVar?.id === 'co2' || currentVar?.id === 'co') val = pt.co;
        else if (currentVar?.id === 'lux' || currentVar?.id === 'pm25') val = pt.pm25;

        if (typeof val !== 'number' || !Number.isFinite(val)) return null;
        return {
          timestamp: pt.timestamp,
          label: includeDate
            ? new Date(pt.timestamp).toLocaleString('es-CL', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })
            : new Date(pt.timestamp).toLocaleTimeString('es-CL', {
                hour: '2-digit',
                minute: '2-digit',
              }),
          value: Number(val.toFixed(1)),
        };
      })
      .filter((item): item is { timestamp: number; label: string; value: number } => item !== null);

    if (mappedFromRTDB.length >= 2) {
      return mappedFromRTDB;
    }
    if (currentVar?.historical && currentVar.historical.length >= 2) {
      const now = Date.now();
      return currentVar.historical.map((h, i, arr) => ({
        timestamp: now - (arr.length - 1 - i) * 60000,
        label: h.timestamp,
        value: Number(h.value.toFixed(1)),
      }));
    }
    return [
      {
        timestamp: Date.now(),
        label: 'Actual',
        value: Number((currentVar?.value ?? 0).toFixed(1)),
      },
    ];
  }, [telemetryHistory, timeRange, customStartDate, customEndDate, currentVar, customRangeValidation.valid]);

  // Muestra completa para cálculos estadísticos/CSV; submuestreo equilibrado solo para la curva SVG
  const chartSeries = useMemo(() => downsampleChartPoints(fullSeries, 48), [fullSeries]);

  const isSufficientHistory = fullSeries.length >= 3;
  const values = fullSeries.map((s) => s.value);
  const minVal = values.length > 0 ? Math.min(...values) : 0;
  const maxVal = values.length > 0 ? Math.max(...values) : 0;
  const avgVal =
    values.length > 0 ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) : '0.0';

  const width = 800;
  const height = 260;
  const padding = 40;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const yRange = maxVal - minVal || 1;

  const getCoord = (ptValue: number, index: number) => {
    const ratioX = chartSeries.length > 1 ? index / (chartSeries.length - 1) : 0.5;
    const x = padding + ratioX * chartWidth;
    const y = height - padding - ((ptValue - minVal) / yRange) * chartHeight;
    return { x, y };
  };

  const points = chartSeries
    .map((pt, index) => {
      const { x, y } = getCoord(pt.value, index);
      return `${x},${y}`;
    })
    .join(' ');

  const auditTableRows = useMemo(() => {
    const fromEvents = alertEvents.map((ev) => ({
      id: `ev-${ev.id}`,
      sortTs: ev.timestamp || 0,
      fechaHora: ev.fecha_hora || new Date(ev.timestamp || Date.now()).toLocaleString('es-CL'),
      variable: ev.variable_label,
      sector: ev.sector_nombre || ev.dispositivo_nombre,
      valor: `${ev.valor_detectado} ${ev.unidad}`,
      umbral: `${ev.umbral_superado} ${ev.unidad}`,
      dictamen:
        ev.estado === 'recuperada'
          ? 'Recuperada a rango normal'
          : ev.nivel === 'critico'
          ? 'Crítico Activo'
          : ev.nivel === 'advertencia'
          ? 'Advertencia Activa'
          : 'Preventivo Activo',
      tone:
        ev.estado === 'recuperada'
          ? 'text-emerald-400'
          : ev.nivel === 'critico'
          ? 'text-rose-400'
          : 'text-amber-400',
    }));

    const fromAlerts = alerts.map((al) => ({
      id: `al-${al.id}`,
      sortTs: al.timestampMs || 0,
      fechaHora: al.timestamp,
      variable: al.variableName,
      sector: al.sectorName,
      valor: al.recordedValue,
      umbral: al.safeLimit,
      dictamen: al.resolved
        ? `Resuelta (${al.resolutionDetails?.resolutionType || 'bitácora'})`
        : al.severity === 'critico'
        ? 'Crítica Activa'
        : al.severity === 'desconectado'
        ? 'Nodo Desconectado'
        : 'Observación Activa',
      tone: al.resolved
        ? 'text-emerald-400'
        : al.severity === 'critico'
        ? 'text-rose-400'
        : 'text-amber-400',
    }));

    return [...fromEvents, ...fromAlerts]
      .sort((a, b) => b.sortTs - a.sortTs)
      .slice(0, 50);
  }, [alertEvents, alerts]);

  const handleExportCSV = async () => {
    if (isExportingCsv || !customRangeValidation.valid || fullSeries.length === 0) return;
    setIsExportingCsv(true);
    soundAlert.playFeedbackBeep();
    try {
      const safeDeviceId = activeDeviceId || 'sin_dispositivo';
      const csvContent = await buildTelemetryCsvContentAsync({
        rows: fullSeries.map((pt) => ({ timestamp: pt.timestamp, value: pt.value })),
        deviceId: safeDeviceId,
        variableName: currentVar.name,
        unit: currentVar.unit,
        siteName: currentSite.name,
        sectorName: currentSite.activeSectors?.[0]?.name || activeDeviceName || 'Sector Minero',
      });

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `minesafe_reporte_${safeDeviceId}_${currentVar.id}_${timeRange}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setShowExportSuccess(true);
      setTimeout(() => setShowExportSuccess(false), 3000);
    } finally {
      setIsExportingCsv(false);
    }
  };

  const labelStep = Math.max(1, Math.ceil(chartSeries.length / 8));

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-cyan-400" />
              Historial de Mediciones y Reportes Técnicos
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Serie histórica real persistida en Firebase RTDB (/historial_telemetria/{activeDeviceId}) y auditoría de eventos.
            </p>
          </div>

          {showExportCsv && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleExportCSV}
                disabled={isExportingCsv || !customRangeValidation.valid || fullSeries.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors cursor-pointer"
                title={
                  !customRangeValidation.valid
                    ? customRangeValidation.error
                    : fullSeries.length === 0
                    ? 'Sin muestras para exportar en el rango seleccionado'
                    : 'Exportar serie histórica a CSV'
                }
              >
                <Download className="w-4 h-4" />
                {isExportingCsv
                  ? `Generando CSV (${fullSeries.length} muestras)...`
                  : `Exportar Datos CSV (${fullSeries.length} muestras)`}
              </button>
            </div>
          )}
        </div>

        {historyError && (
          <div className="mt-4 p-3 bg-rose-950/75 border border-rose-800 text-rose-200 rounded-lg text-xs flex items-center gap-2">
            <Info className="w-4 h-4 text-rose-400 shrink-0" />
            <span>Error consultando el historial de telemetría en Firebase RTDB: {historyError}</span>
          </div>
        )}

        {historyTruncated && !historyError && (
          <div className="mt-4 p-3 bg-amber-950/70 border border-amber-800 text-amber-200 rounded-lg text-xs flex items-center gap-2">
            <Info className="w-4 h-4 text-amber-400 shrink-0" />
            <span>La ventana solicitada alcanzó el límite máximo de páginas ({fullSeries.length} muestras cargadas). Reduce el rango para inspeccionar registros anteriores sin truncamiento.</span>
          </div>
        )}

        {isHistoryLoading && (
          <div className="mt-4 p-2.5 bg-cyan-950/40 border border-cyan-800/50 text-cyan-200 rounded-lg text-xs flex items-center gap-2">
            <Info className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>Sincronizando páginas históricas desde Firebase RTDB...</span>
          </div>
        )}

        {showExportSuccess && (
          <div className="mt-4 p-3 bg-emerald-950/80 border border-emerald-800 text-emerald-300 rounded-lg text-xs flex items-center gap-2 animate-in fade-in">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span>Archivo CSV generado exitosamente con marca temporal completa ISO y orden cronológico ({fullSeries.length} muestras).</span>
          </div>
        )}

        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-6 border-t border-slate-800/80 mt-6">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            {variables.slice(0, 6).map((v) => (
              <button
                key={v.id}
                onClick={() => {
                  setSelectedVarId(v.id);
                  soundAlert.playFeedbackBeep();
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  selectedVarId === v.id
                    ? 'bg-slate-800 text-cyan-300 border border-slate-700 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                {v.shortName}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
            <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800">
              {(['1h', '6h', '24h', '7d', '30d', 'custom'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setTimeRange(r)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                    timeRange === r
                      ? 'bg-slate-800 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {r === 'custom' ? 'Rango' : r}
                </button>
              ))}
            </div>

            {timeRange === 'custom' && (
              <div
                className={`flex items-center gap-1.5 text-xs bg-slate-950 px-2.5 py-1 rounded-lg border ${
                  customRangeValidation.valid ? 'border-slate-800' : 'border-rose-600'
                }`}
              >
                <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                <input
                  type="date"
                  value={customStartDate}
                  max={customEndDate && customEndDate <= todayIso ? customEndDate : todayIso}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="bg-transparent text-slate-200 focus:outline-none text-xs"
                  aria-label="Fecha inicio"
                />
                <span className="text-slate-500">a</span>
                <input
                  type="date"
                  value={customEndDate}
                  min={customStartDate || undefined}
                  max={todayIso}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="bg-transparent text-slate-200 focus:outline-none text-xs"
                  aria-label="Fecha término"
                />
              </div>
            )}
          </div>
        </div>

        {!customRangeValidation.valid && customRangeValidation.error && (
          <div className="mt-3 p-2.5 bg-rose-950/80 border border-rose-700 text-rose-200 rounded-lg text-xs flex items-center gap-2">
            <Info className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{customRangeValidation.error}</span>
          </div>
        )}
      </div>

      {showChartCard && (
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div>
            <span className="text-xs uppercase tracking-wider text-slate-400 block font-semibold">
              Evolución Temporal de {currentVar.name} ({fullSeries.length} muestras reales en ventana)
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-extrabold text-white font-mono tabular-nums">
                {currentVar.value} <span className="text-base text-cyan-300 font-sans">{currentVar.unit}</span>
              </span>
              <span className="text-xs text-slate-400 font-medium">Lectura actual en boca de sensor</span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
              <span className="text-slate-400 block text-[10px]">Mínimo</span>
              <span className="font-mono font-bold text-white tabular-nums">{minVal} {currentVar.unit}</span>
            </div>
            <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
              <span className="text-slate-400 block text-[10px]">Promedio</span>
              <span className="font-mono font-bold text-cyan-400 tabular-nums">{avgVal} {currentVar.unit}</span>
            </div>
            <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
              <span className="text-slate-400 block text-[10px]">Máximo</span>
              <span className="font-mono font-bold text-amber-400 tabular-nums">{maxVal} {currentVar.unit}</span>
            </div>
          </div>
        </div>

        <div className="w-full overflow-x-auto">
          <div className="min-w-[650px] relative">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-64 overflow-visible">
              <defs>
                <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
                const y = padding + ratio * chartHeight;
                const val = (maxVal - ratio * yRange).toFixed(1);
                return (
                  <g key={i}>
                    <line
                      x1={padding}
                      y1={y}
                      x2={width - padding}
                      y2={y}
                      stroke="#1e293b"
                      strokeDasharray="4 4"
                    />
                    <text
                      x={padding - 8}
                      y={y + 3}
                      fill="#64748b"
                      fontSize="10"
                      textAnchor="end"
                      fontFamily="JetBrains Mono"
                    >
                      {val}
                    </text>
                  </g>
                );
              })}

              {chartSeries.length >= 2 && (
                <>
                  <polygon
                    points={`${padding},${height - padding} ${points} ${width - padding},${height - padding}`}
                    fill="url(#chartGradient)"
                  />
                  <polyline
                    fill="none"
                    stroke="#06b6d4"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={points}
                  />
                </>
              )}

              {chartSeries.map((pt, i) => {
                const { x, y } = getCoord(pt.value, i);
                const showTickLabel = i % labelStep === 0 || i === chartSeries.length - 1;
                return (
                  <g key={i} className="group">
                    <circle
                      cx={x}
                      cy={y}
                      r={chartSeries.length === 1 ? '5' : '3.5'}
                      fill="#06b6d4"
                      stroke="#0f172a"
                      strokeWidth="2"
                      className="hover:scale-150 transition-transform duration-100"
                    />
                    {showTickLabel && (
                      <text
                        x={x}
                        y={height - padding + 16}
                        fill="#64748b"
                        fontSize="9"
                        textAnchor="middle"
                        fontFamily="JetBrains Mono"
                      >
                        {pt.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          {!isSufficientHistory ? (
            <div className="p-3 bg-slate-950/70 rounded-lg border border-slate-800 text-xs text-slate-400 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>
                  <strong>Aviso Metrológico:</strong> Sin suficiente historial acumulado en RTDB para la ventana{' '}
                  <strong>{timeRange}</strong>. Se muestra únicamente la lectura real actual sin rellenar con curvas ficticias.
                </span>
              </div>
            </div>
          ) : (
            <div className="p-2.5 bg-emerald-950/20 rounded-lg border border-emerald-800/40 text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Registros históricos reales acumulados desde Firebase RTDB (/historial_telemetria) mientras existe sesión activa en plataforma o ingestión directa del nodo.
              </span>
            </div>
          )}
        </div>
      </div>
      )}

      {showAuditTable && (
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-cyan-400" />
            <h3 className="text-base font-bold text-white">
              Bitácora de Inspección y Eventos Registrados (DS 132)
            </h3>
          </div>
          <span className="text-xs text-slate-400">
            {auditTableRows.length} eventos reales trazables
          </span>
        </div>

        {auditTableRows.length === 0 ? (
          <div className="p-6 text-center bg-slate-950/50 rounded-xl border border-slate-800 text-xs text-slate-400">
            No existen eventos en <span className="font-mono text-slate-300">/eventos_umbrales</span> ni alertas emitidas aún en esta sesión/organización.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">Fecha / Hora</th>
                  <th className="px-4 py-3">Variable</th>
                  <th className="px-4 py-3">Punto / Sector</th>
                  <th className="px-4 py-3">Valor Detectado</th>
                  <th className="px-4 py-3">Umbral</th>
                  <th className="px-4 py-3">Estado / Dictamen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {auditTableRows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3 font-mono whitespace-nowrap">{row.fechaHora}</td>
                    <td className="px-4 py-3 font-medium text-white">{row.variable}</td>
                    <td className="px-4 py-3 text-slate-400">{row.sector}</td>
                    <td className="px-4 py-3 font-mono text-cyan-300">{row.valor}</td>
                    <td className="px-4 py-3 font-mono text-slate-400">{row.umbral}</td>
                    <td className={`px-4 py-3 font-semibold ${row.tone}`}>{row.dictamen}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}
    </div>
  );
};
