import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Clock,
  Cpu,
  Database,
  Droplets,
  FlaskConical,
  Gauge,
  History,
  Info,
  Lock,
  RefreshCw,
  ShieldOff,
  Thermometer,
  Wifi,
  WifiOff,
  Wind,
} from 'lucide-react';
import { TelemetryHistoryPoint, UserProfile } from '../types';
import {
  APP_BUILD_VERSION,
  DEFAULT_DEVICE_TIMEOUT_SECONDS,
  DUST_SENSOR_MODEL_LABEL,
  EXPERIMENTAL_BENCH_V2_DEVICE_ID,
  EXPERIMENTAL_BENCH_V2_HISTORY_PATH,
  EXPERIMENTAL_BENCH_V2_PATH,
  ExperimentalBenchChannelClassification,
  ExperimentalBenchV2State,
  PHYSICAL_NODE_DEVICE_ID,
  canAccessExperimentalBenchDevice,
  classifyExperimentalBenchReadings,
  getEstimatedServerNowMs,
  probeExperimentalBenchV2InRTDB,
  subscribeToExperimentalBenchV2History,
} from '../services/firebase';

interface ExperimentalBenchV2PanelProps {
  state: ExperimentalBenchV2State;
  isFirebaseConnected: boolean;
  timeoutSeconds?: number;
  currentUser?: UserProfile | null;
  onReconnectTelemetry?: () => void;
  onUpdateState?: (next: ExperimentalBenchV2State) => void;
}

function channelVisualClasses(status: ExperimentalBenchChannelClassification['status']): {
  card: string;
  badge: string;
  value: string;
} {
  switch (status) {
    case 'desconectado':
      return {
        card: 'bg-slate-950/70 border-slate-800',
        badge: 'bg-rose-950/80 text-rose-300 border-rose-700/70',
        value: 'text-slate-400',
      };
    case 'saturado_invalido':
      return {
        card: 'bg-amber-950/20 border-amber-700/60',
        badge: 'bg-amber-950/90 text-amber-200 border-amber-600/80',
        value: 'text-amber-300',
      };
    case 'no_disponible':
      return {
        card: 'bg-slate-950/70 border-slate-700/80',
        badge: 'bg-slate-900 text-slate-300 border-slate-600/80',
        value: 'text-slate-300',
      };
    case 'estimado_no_calibrado':
      return {
        card: 'bg-indigo-950/20 border-indigo-700/50',
        badge: 'bg-indigo-950/80 text-indigo-200 border-indigo-600/70',
        value: 'text-indigo-200',
      };
    case 'experimental_raw':
      return {
        card: 'bg-cyan-950/20 border-cyan-800/50',
        badge: 'bg-cyan-950/80 text-cyan-200 border-cyan-700/70',
        value: 'text-cyan-200',
      };
    case 'experimental_ambiental':
    default:
      return {
        card: 'bg-slate-950/75 border-cyan-900/50',
        badge: 'bg-slate-900 text-cyan-200 border-cyan-800/70',
        value: 'text-white',
      };
  }
}

function formatServerTs(tsMs: number): string {
  if (!Number.isFinite(tsMs) || tsMs <= 0) return 'Sin marca temporal de servidor';
  try {
    return new Date(tsMs).toLocaleString('es-CL', {
      hour12: false,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return String(tsMs);
  }
}

function formatShortTime(tsMs: number): string {
  if (!Number.isFinite(tsMs) || tsMs <= 0) return 'N/D';
  try {
    return new Date(tsMs).toLocaleTimeString('es-CL', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return String(tsMs);
  }
}

export const ExperimentalBenchV2Panel: React.FC<ExperimentalBenchV2PanelProps> = ({
  state,
  isFirebaseConnected,
  timeoutSeconds = DEFAULT_DEVICE_TIMEOUT_SECONDS,
  currentUser,
  onReconnectTelemetry,
  onUpdateState,
}) => {
  const authorized = canAccessExperimentalBenchDevice(currentUser);
  const [nowTick, setNowTick] = useState<number>(() => getEstimatedServerNowMs());
  const [historyPoints, setHistoryPoints] = useState<TelemetryHistoryPoint[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState<boolean>(true);
  const [probeLoading, setProbeLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!authorized) return;
    const id = window.setInterval(() => setNowTick(getEstimatedServerNowMs()), 1000);
    return () => window.clearInterval(id);
  }, [authorized]);

  useEffect(() => {
    if (!authorized) {
      setHistoryPoints([]);
      setHistoryError(null);
      setHistoryLoading(false);
      return;
    }
    setHistoryLoading(true);
    const unsub = subscribeToExperimentalBenchV2History(
      6,
      (points, meta) => {
        setHistoryPoints(points);
        setHistoryError(meta?.error || null);
        setHistoryLoading(false);
      },
      currentUser
    );
    return () => unsub();
  }, [authorized, currentUser]);

  const classification = useMemo(
    () => classifyExperimentalBenchReadings(state.device, timeoutSeconds, nowTick),
    [state.device, timeoutSeconds, nowTick]
  );

  const chartSeries = useMemo(() => {
    const tail = historyPoints.slice(-36);
    if (tail.length < 2) return null;

    const width = 560;
    const height = 148;
    const padX = 28;
    const padY = 18;
    const innerW = width - padX * 2;
    const innerH = height - padY * 2;

    const pmVals = tail.map((p) =>
      typeof p.pm25 === 'number' && Number.isFinite(p.pm25) ? p.pm25 : null
    );
    const validPm = pmVals.filter((v): v is number => v !== null && v < 4095);
    const maxPm = Math.max(100, ...validPm);

    const coVals = tail.map((p) =>
      typeof p.co === 'number' && Number.isFinite(p.co) ? p.co : null
    );
    const maxCo = 4095;

    const buildPath = (values: Array<number | null>, maxVal: number) => {
      const segments: string[] = [];
      let open = false;
      values.forEach((v, idx) => {
        if (v === null) {
          open = false;
          return;
        }
        const x = padX + (idx / Math.max(1, values.length - 1)) * innerW;
        const clamped = Math.max(0, Math.min(maxVal, v));
        const y = padY + innerH - (clamped / Math.max(1, maxVal)) * innerH;
        segments.push(`${open ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`);
        open = true;
      });
      return segments.join(' ');
    };

    const pmPath = buildPath(pmVals.map((v) => (v !== null && v < 4095 ? v : null)), maxPm);
    const coPath = buildPath(coVals, maxCo);

    return {
      width,
      height,
      pmPath,
      coPath,
      maxPm,
      firstLabel: formatShortTime(tail[0]?.timestamp || 0),
      lastLabel: formatShortTime(tail[tail.length - 1]?.timestamp || 0),
      count: tail.length,
    };
  }, [historyPoints]);

  if (!authorized) {
    return null;
  }

  const handleProbe = async () => {
    setProbeLoading(true);
    try {
      const next = await probeExperimentalBenchV2InRTDB(currentUser, timeoutSeconds);
      onUpdateState?.(next);
    } finally {
      setProbeLoading(false);
    }
  };

  const { connectivity, channels } = classification;
  const mq2Visual = channelVisualClasses(channels.mq2.status);
  const polvoVisual = channelVisualClasses(channels.polvo.status);
  const tempVisual = channelVisualClasses(channels.temperatura.status);
  const humVisual = channelVisualClasses(channels.humedad.status);

  const recentSamples = [...historyPoints].reverse().slice(0, 8);

  return (
    <section
      aria-label="Banco Experimental ESP32 V2"
      className="rounded-2xl border border-indigo-700/50 bg-slate-900/90 p-5 sm:p-6 shadow-xl space-y-5"
    >
      {/* Cabecera explícita de equipo experimental sin asignación */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-950/90 border border-indigo-600/70 text-indigo-200 text-[11px] font-bold uppercase tracking-wider">
              <FlaskConical className="w-3.5 h-3.5" />
              Banco Experimental V2 · Solo Roles Autorizados
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-950 border border-slate-700 text-slate-300 text-[11px] font-mono">
              {EXPERIMENTAL_BENCH_V2_DEVICE_ID}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-950/70 border border-amber-700/70 text-amber-200 text-[11px] font-semibold">
              Sin asignación operativa
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-slate-400 text-[10px] font-mono">
              Build {APP_BUILD_VERSION}
            </span>
          </div>
          <h2 className="text-lg font-extrabold text-white tracking-tight">
            Telemetría Experimental de Banco (Aislada de Operación)
          </h2>
          <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
            Lectura directa y exclusiva de{' '}
            <code className="px-1 py-0.5 rounded bg-slate-950 text-indigo-300 font-mono">
              /{EXPERIMENTAL_BENCH_V2_PATH}
            </code>{' '}
            y su historial separado{' '}
            <code className="px-1 py-0.5 rounded bg-slate-950 text-indigo-300 font-mono">
              /{EXPERIMENTAL_BENCH_V2_HISTORY_PATH}
            </code>
            . Este equipo NO se fusiona con el nodo original{' '}
            <code className="px-1 py-0.5 rounded bg-slate-950 text-slate-300 font-mono">
              {PHYSICAL_NODE_DEVICE_ID}
            </code>
            , NO genera alertas operacionales, NO altera KPIs ni acepta comandos operacionales.
          </p>
        </div>

        {/* Controles únicamente de lectura / sondeo diagnóstico */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleProbe}
            disabled={probeLoading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-950/80 hover:bg-indigo-900/80 text-indigo-200 border border-indigo-700/70 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Database className={`w-3.5 h-3.5 ${probeLoading ? 'animate-spin' : ''}`} />
            <span>{probeLoading ? 'Sondeando RTDB...' : 'Sondear V2 en RTDB'}</span>
          </button>
          {onReconnectTelemetry && (
            <button
              type="button"
              onClick={onReconnectTelemetry}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reconectar</span>
            </button>
          )}
        </div>
      </div>

      {/* Cinta de aislamiento operativo y honestidad metrológica */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div className="p-3 rounded-xl bg-slate-950/75 border border-slate-800 flex items-start gap-2.5">
          {connectivity.isOnline ? (
            <Wifi className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <WifiOff className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-white">Conectividad V2</span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${
                  connectivity.isOnline
                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/70'
                    : 'bg-rose-950/80 text-rose-300 border-rose-700/70'
                }`}
              >
                {connectivity.isOnline ? 'EN LÍNEA' : 'DESCONECTADO'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              {classification.overallLabel}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5 font-mono">
              Timeout: {connectivity.timeoutSeconds}s · RTDB WebSocket:{' '}
              {isFirebaseConnected ? 'conectado' : 'sin conexión'}
            </p>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-950/75 border border-slate-800 flex items-start gap-2.5">
          <Clock className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <span className="font-bold text-white block">Marca Temporal de Servidor</span>
            <span className="text-[11px] text-cyan-200 font-mono block mt-1 truncate">
              {formatServerTs(state.normalizedServerTs || state.device?.lastUpdateServer || 0)}
            </span>
            <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
              last_update_server:{' '}
              {state.normalizedServerTs > 0
                ? `${state.normalizedServerTs} (hace ${connectivity.diffSeconds}s)`
                : 'N/D'}
            </span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-950/75 border border-slate-800 flex items-start gap-2.5">
          <ShieldOff className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <span className="font-bold text-white block">Aislamiento Operacional Estricto</span>
            <p className="text-[11px] text-slate-400 mt-1 leading-snug">
              Alertas operacionales: <strong className="text-slate-200">Desactivadas</strong> ·
              Comandos (<code className="font-mono">ENCENDER/APAGAR</code>):{' '}
              <strong className="text-slate-200">Bloqueados</strong> · Medición certificada:{' '}
              <strong className="text-amber-300">No</strong>.
            </p>
          </div>
        </div>
      </div>

      {/* Errores reales de Firebase RTDB si existen */}
      {(state.error || historyError) && (
        <div className="p-3.5 rounded-xl bg-rose-950/35 border border-rose-700/70 text-xs text-rose-200 space-y-1">
          <div className="flex items-center gap-2 font-bold text-rose-300">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Error real reportado por Firebase RTDB</span>
          </div>
          {state.error && (
            <p className="font-mono text-[11px] break-all">
              Nodo ({state.sourcePath}): {state.errorCode ? `[${state.errorCode}] ` : ''}
              {state.error}
            </p>
          )}
          {historyError && (
            <p className="font-mono text-[11px] break-all">
              Historial ({state.historyPath}): {historyError}
            </p>
          )}
        </div>
      )}

      {/* Estado vacío si aún no existen datos en /dispositivos/device_38A839E81F84_V2 */}
      {state.status === 'empty' && !state.error && (
        <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-300 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-white">
              Sin nodo publicado actualmente en /{EXPERIMENTAL_BENCH_V2_PATH}
            </p>
            <p className="text-slate-400 mt-0.5">
              El panel quedó escuchando en tiempo real sin afectar ni mezclar datos del nodo
              original <code className="font-mono">{PHYSICAL_NODE_DEVICE_ID}</code>. Cuando el
              equipo V2 publique con marca temporal de servidor, sus lecturas aparecerán aquí.
            </p>
          </div>
        </div>
      )}

      {/* Tarjetas de variables con clasificación técnica honesta */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* MQ-2 */}
        <div className={`p-4 rounded-xl border space-y-2 ${mq2Visual.card}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-200">
              <Gauge className="w-4 h-4 text-amber-400" />
              MQ-2 (ADC 12 bits)
            </span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${mq2Visual.badge}`}
            >
              {channels.mq2.badge}
            </span>
          </div>
          <div className={`text-2xl font-extrabold font-mono tabular-nums ${mq2Visual.value}`}>
            {channels.mq2.displayValue}
          </div>
          <p className="text-[11px] text-slate-400 leading-snug">{channels.mq2.detail}</p>
        </div>

        {/* Polvo óptico OPEN-SMART */}
        <div className={`p-4 rounded-xl border space-y-2 ${polvoVisual.card}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-200">
              <Wind className="w-4 h-4 text-indigo-400" />
              Polvo ({DUST_SENSOR_MODEL_LABEL.split(' ')[0]})
            </span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${polvoVisual.badge}`}
            >
              {channels.polvo.badge}
            </span>
          </div>
          <div className={`text-2xl font-extrabold font-mono tabular-nums ${polvoVisual.value}`}>
            {channels.polvo.displayValue}
          </div>
          <p className="text-[11px] text-slate-400 leading-snug">{channels.polvo.detail}</p>
        </div>

        {/* Temperatura DHT */}
        <div className={`p-4 rounded-xl border space-y-2 ${tempVisual.card}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-200">
              <Thermometer className="w-4 h-4 text-cyan-400" />
              Temperatura (DHT)
            </span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${tempVisual.badge}`}
            >
              {channels.temperatura.badge}
            </span>
          </div>
          <div className={`text-2xl font-extrabold font-mono tabular-nums ${tempVisual.value}`}>
            {channels.temperatura.displayValue}
          </div>
          <p className="text-[11px] text-slate-400 leading-snug">{channels.temperatura.detail}</p>
        </div>

        {/* Humedad DHT */}
        <div className={`p-4 rounded-xl border space-y-2 ${humVisual.card}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-200">
              <Droplets className="w-4 h-4 text-sky-400" />
              Humedad (DHT)
            </span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${humVisual.badge}`}
            >
              {channels.humedad.badge}
            </span>
          </div>
          <div className={`text-2xl font-extrabold font-mono tabular-nums ${humVisual.value}`}>
            {channels.humedad.displayValue}
          </div>
          <p className="text-[11px] text-slate-400 leading-snug">{channels.humedad.detail}</p>
        </div>
      </div>

      {/* Historial separado exclusivo de /dispositivos/device_38A839E81F84_V2/historial */}
      <div className="rounded-xl bg-slate-950/75 border border-slate-800 p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-bold text-white">
              Historial Experimental Separado (Últimas 6h)
            </h3>
            <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] font-mono text-indigo-300">
              {historyPoints.length} muestras
            </span>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            Fuente exclusiva: /{EXPERIMENTAL_BENCH_V2_HISTORY_PATH}
          </span>
        </div>

        {historyLoading ? (
          <p className="text-xs text-slate-400 py-3">
            Cargando serie experimental desde /{EXPERIMENTAL_BENCH_V2_HISTORY_PATH}...
          </p>
        ) : historyPoints.length === 0 ? (
          <p className="text-xs text-slate-400 py-2">
            Sin muestras registradas en /{EXPERIMENTAL_BENCH_V2_HISTORY_PATH} dentro de las últimas
            6 horas. El historial del nodo original ({PHYSICAL_NODE_DEVICE_ID}) permanece intacto y
            separado.
          </p>
        ) : (
          <div className="space-y-3">
            {chartSeries && (
              <div className="rounded-lg bg-slate-900/80 border border-slate-800 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 mb-2">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1.5 text-indigo-300 font-semibold">
                      <span className="w-2.5 h-0.5 bg-indigo-400 inline-block" />
                      Polvo estimado OPEN-SMART (sin saturados)
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-amber-300 font-semibold">
                      <span className="w-2.5 h-0.5 bg-amber-400 inline-block" />
                      MQ-2 ADC (0–4095)
                    </span>
                  </div>
                  <span className="font-mono text-[10px]">
                    {chartSeries.firstLabel} → {chartSeries.lastLabel}
                  </span>
                </div>
                <svg
                  viewBox={`0 0 ${chartSeries.width} ${chartSeries.height}`}
                  className="w-full h-36 overflow-visible"
                  role="img"
                  aria-label="Tendencia experimental V2"
                >
                  <line
                    x1="28"
                    y1="18"
                    x2="532"
                    y2="18"
                    stroke="rgba(148,163,184,0.18)"
                    strokeDasharray="3 3"
                  />
                  <line
                    x1="28"
                    y1="74"
                    x2="532"
                    y2="74"
                    stroke="rgba(148,163,184,0.18)"
                    strokeDasharray="3 3"
                  />
                  <line
                    x1="28"
                    y1="130"
                    x2="532"
                    y2="130"
                    stroke="rgba(148,163,184,0.28)"
                  />
                  {chartSeries.coPath && (
                    <path
                      d={chartSeries.coPath}
                      fill="none"
                      stroke="#fbbf24"
                      strokeWidth="1.75"
                      strokeDasharray="4 2"
                    />
                  )}
                  {chartSeries.pmPath && (
                    <path
                      d={chartSeries.pmPath}
                      fill="none"
                      stroke="#818cf8"
                      strokeWidth="2.25"
                    />
                  )}
                </svg>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px] font-mono">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-1.5 pr-3">Hora</th>
                    <th className="py-1.5 pr-3">MQ-2 (ADC)</th>
                    <th className="py-1.5 pr-3">Polvo est.</th>
                    <th className="py-1.5 pr-3">Temp DHT</th>
                    <th className="py-1.5 pr-3">Hum DHT</th>
                    <th className="py-1.5">Origen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 text-slate-200">
                  {recentSamples.map((pt, idx) => {
                    const dhtZero = pt.temperatura === 0 && pt.humedad === 0;
                    const tempStr =
                      !dhtZero && typeof pt.temperatura === 'number' && Number.isFinite(pt.temperatura)
                        ? `${pt.temperatura.toFixed(1)} °C`
                        : 'N/D';
                    const humStr =
                      !dhtZero && typeof pt.humedad === 'number' && Number.isFinite(pt.humedad)
                        ? `${pt.humedad.toFixed(0)} %`
                        : 'N/D';
                    const coStr =
                      typeof pt.co === 'number' && Number.isFinite(pt.co)
                        ? pt.co === 4095
                          ? '4095 (SAT)'
                          : `${pt.co} ADC`
                        : 'N/D';
                    const pmStr =
                      typeof pt.pm25 === 'number' && Number.isFinite(pt.pm25)
                        ? pt.pm25 === 4095
                          ? '4095 (SAT)'
                          : `${pt.pm25.toFixed(1)} est.`
                        : 'N/D';
                    return (
                      <tr key={`${pt.timestamp}-${idx}`}>
                        <td className="py-1.5 pr-3 text-slate-400">
                          {formatShortTime(pt.timestamp)}
                        </td>
                        <td
                          className={`py-1.5 pr-3 ${
                            pt.co === 4095 ? 'text-amber-300 font-bold' : 'text-cyan-200'
                          }`}
                        >
                          {coStr}
                        </td>
                        <td className="py-1.5 pr-3 text-indigo-200">{pmStr}</td>
                        <td className="py-1.5 pr-3">{tempStr}</td>
                        <td className="py-1.5 pr-3">{humStr}</td>
                        <td className="py-1.5 text-slate-400">{pt.source || 'dispositivos_v2_historial'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Pie técnico de trazabilidad y metadatos crudos sin secretos */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <Cpu className="w-3.5 h-3.5 text-indigo-400" />
            Origen reportado: <strong className="text-slate-200">{String(state.rawPayload?.origen ?? 'N/D')}</strong>
          </span>
          <span>•</span>
          <span className="inline-flex items-center gap-1">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            Transporte: <strong className="text-slate-200">{String(state.rawPayload?.via ?? 'N/D')}</strong>
          </span>
          <span>•</span>
          <span>
            Simulado: <strong className="text-slate-200">{state.rawPayload?.simulado === true ? 'Sí' : state.rawPayload?.simulado === false ? 'No' : 'N/D'}</strong>
          </span>
        </div>
        <span className="inline-flex items-center gap-1 text-slate-400">
          <Lock className="w-3 h-3 text-indigo-400" />
          Acceso restringido por rol ({currentUser?.role}) · Sin permisos ampliados
        </span>
      </div>
    </section>
  );
};
