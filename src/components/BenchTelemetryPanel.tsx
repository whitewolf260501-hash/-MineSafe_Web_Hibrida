import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  Droplets,
  FlaskConical,
  Gauge,
  History,
  Info,
  Radio,
  RefreshCw,
  ShieldAlert,
  Terminal,
  Thermometer,
  Wifi,
  WifiOff,
  Wind,
} from 'lucide-react';
import {
  CommunicationLinkMode,
  NavigationTab,
  SensorDevice,
  TelemetryHistoryPoint,
  UserProfile,
} from '../types';
import {
  APP_BUILD_VERSION,
  BENCH_HISTORY_PATH,
  BENCH_TELEMETRY_PATH,
  BenchTelemetryDiagnostics,
  DEFAULT_DEVICE_TIMEOUT_SECONDS,
  DUST_SENSOR_MODEL_LABEL,
  PHYSICAL_NODE_DEVICE_ID,
  classifyCommunicationLink,
  evaluateDeviceConnectivity,
  getBenchDiagnosticSnapshot,
  getEstimatedServerNowMs,
  runSuperAdminBenchProbe,
  subscribeToBenchDiagnostics,
  subscribeToTelemetryHistory,
} from '../services/firebase';

interface BenchTelemetryPanelProps {
  device: SensorDevice;
  isFirebaseConnected: boolean;
  timeoutSeconds?: number;
  onNavigate?: (tab: NavigationTab) => void;
  currentUser?: UserProfile | null;
  onReconnectTelemetry?: () => void;
}

const LINK_BADGE_MAP: Record<
  CommunicationLinkMode,
  { label: string; description: string; className: string }
> = {
  wifi_directo: {
    label: 'Wi-Fi directo',
    description: 'El nodo ESP32 reporta directamente hacia Firebase RTDB vía Wi-Fi.',
    className: 'bg-emerald-950/70 text-emerald-300 border-emerald-700/60',
  },
  espnow_gateway: {
    label: 'ESP-NOW mediante gateway',
    description:
      'Trama marcada vía puente/gateway. El reenvío del gateway con la nueva autenticación requiere validación física en banco.',
    className: 'bg-indigo-950/70 text-indigo-300 border-indigo-700/60',
  },
  desconectado: {
    label: 'Dispositivo desconectado',
    description: 'Sin recepción vigente dentro de la ventana de timeout configurada.',
    className: 'bg-rose-950/70 text-rose-300 border-rose-700/60',
  },
  origen_desconocido: {
    label: 'Origen desconocido',
    description: 'Telemetría recibida sin campo de transporte explícito (via / gateway_id).',
    className: 'bg-amber-950/70 text-amber-300 border-amber-700/60',
  },
};

export const BenchTelemetryPanel: React.FC<BenchTelemetryPanelProps> = ({
  device,
  isFirebaseConnected,
  timeoutSeconds = DEFAULT_DEVICE_TIMEOUT_SECONDS,
  onNavigate,
  currentUser,
  onReconnectTelemetry,
}) => {
  const isSuperAdmin = currentUser?.role === 'superadmin';
  const [nowTick, setNowTick] = useState<number>(() => getEstimatedServerNowMs());
  const [historyPoints, setHistoryPoints] = useState<TelemetryHistoryPoint[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState<boolean>(true);
  const [diagnostics, setDiagnostics] = useState<BenchTelemetryDiagnostics>(() =>
    getBenchDiagnosticSnapshot()
  );
  const [probeLoading, setProbeLoading] = useState<boolean>(false);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(getEstimatedServerNowMs()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) return;
    return subscribeToBenchDiagnostics(setDiagnostics);
  }, [isSuperAdmin]);

  useEffect(() => {
    setHistoryLoading(true);
    const unsub = subscribeToTelemetryHistory(
      device.id,
      6,
      (points, meta) => {
        setHistoryPoints(points);
        setHistoryError(meta?.error || null);
        setHistoryLoading(false);
      }
    );
    return () => unsub();
  }, [device.id]);

  const handleRunProbe = async () => {
    if (!isSuperAdmin) return;
    setProbeLoading(true);
    try {
      const result = await runSuperAdminBenchProbe(currentUser);
      setDiagnostics(result);
    } finally {
      setProbeLoading(false);
    }
  };

  const connectivity = useMemo(
    () => evaluateDeviceConnectivity(device.lastUpdateServer || 0, timeoutSeconds, nowTick),
    [device.lastUpdateServer, timeoutSeconds, nowTick]
  );

  const linkMode = useMemo(
    () => classifyCommunicationLink(device, connectivity.isOnline),
    [device, connectivity.isOnline]
  );
  const linkMeta = LINK_BADGE_MAP[linkMode];

  const isPhysicalBenchNode =
    device.id === PHYSICAL_NODE_DEVICE_ID || device.isBenchTelemetry === true;
  const isSimulated = device.isSimulated === true;

  const coRaw = typeof device.rawCO === 'number' && Number.isFinite(device.rawCO) ? device.rawCO : null;
  const coSaturated = coRaw === 4095;
  const pmRaw =
    typeof device.rawPM25 === 'number' && Number.isFinite(device.rawPM25) ? device.rawPM25 : null;
  const pmSaturated = pmRaw === 4095;
  const tempRaw =
    typeof device.rawTemp === 'number' && Number.isFinite(device.rawTemp) ? device.rawTemp : null;
  const humRaw =
    typeof device.rawHum === 'number' && Number.isFinite(device.rawHum) ? device.rawHum : null;

  const chartData = useMemo(() => {
    const slice = historyPoints.slice(-30);
    return slice.map((pt) => {
      const d = new Date(pt.timestamp);
      const label = d.toLocaleTimeString('es-CL', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      return {
        label,
        timestamp: pt.timestamp,
        co: pt.co === 4095 ? null : pt.co,
        pm25: pt.pm25 === 4095 ? null : pt.pm25,
        temperatura: pt.temperatura,
        humedad: pt.humedad,
        source: pt.source || 'historial_telemetria',
      };
    });
  }, [historyPoints]);

  const benchPointsCount = useMemo(
    () => historyPoints.filter((p) => p.source === 'diagnostico_p087').length,
    [historyPoints]
  );

  const formattedLastUpdate = useMemo(() => {
    if (!device.lastUpdateServer || device.lastUpdateServer <= 0) {
      return 'Sin marca temporal de servidor';
    }
    try {
      return new Date(device.lastUpdateServer).toLocaleString('es-CL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return String(device.lastUpdateServer);
    }
  }, [device.lastUpdateServer]);

  return (
    <section
      aria-label="Telemetría de Banco ESP32"
      className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-lg"
    >
      {/* Banner explícito de separación entre telemetría de banco / prototipo académico y operación certificada */}
      <div className="bg-amber-950/35 border border-amber-700/50 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <FlaskConical className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-200">
              Telemetría de Banco · Prototipo Académico No Certificado para Seguridad Minera
            </p>
            <p className="text-[11px] text-amber-200/85 leading-relaxed">
              Las lecturas provenientes de{' '}
              <span className="font-mono text-amber-100">/{BENCH_TELEMETRY_PATH}</span> se muestran
              integradas sobre el nodo existente{' '}
              <span className="font-mono text-amber-100">{device.id}</span> sin duplicar equipos y
              permanecen estrictamente separadas de las alertas operacionales de seguridad minera.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <span className="text-[10px] font-mono font-bold px-2 py-1 rounded-full border bg-slate-950/80 text-cyan-300 border-cyan-700/60">
            Build {APP_BUILD_VERSION}
          </span>
          <span
            className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
              isSimulated
                ? 'bg-purple-950/70 text-purple-300 border-purple-700/60'
                : 'bg-cyan-950/70 text-cyan-300 border-cyan-700/60'
            }`}
          >
            {isSimulated ? 'Nodo simulado (simulado: true)' : 'Nodo físico de banco (simulado: false)'}
          </span>
          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${linkMeta.className}`}>
            {linkMeta.label}
          </span>
        </div>
      </div>

      {/* Cabecera: Estado dual de conectividad (Firebase RTDB vs Telemetría reciente del ESP32) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center border shrink-0 ${
                isFirebaseConnected
                  ? 'bg-emerald-950/70 border-emerald-700/60 text-emerald-400'
                  : 'bg-rose-950/70 border-rose-700/60 text-rose-400'
              }`}
            >
              <Database className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                Conexión Firebase RTDB
              </p>
              <p
                className={`text-xs font-bold ${
                  isFirebaseConnected ? 'text-emerald-300' : 'text-rose-300'
                }`}
              >
                {isFirebaseConnected ? 'WebSocket Activo (.info/connected)' : 'Sin conexión RTDB'}
              </p>
            </div>
          </div>
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              isFirebaseConnected ? 'bg-emerald-400' : 'bg-rose-500'
            }`}
          />
        </div>

        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center border shrink-0 ${
                connectivity.isOnline
                  ? 'bg-emerald-950/70 border-emerald-700/60 text-emerald-400'
                  : 'bg-rose-950/70 border-rose-700/60 text-rose-400'
              }`}
            >
              {connectivity.isOnline ? (
                <Wifi className="w-4 h-4" />
              ) : (
                <WifiOff className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                Recepción Telemetría ESP32 (Timeout {connectivity.timeoutSeconds}s)
              </p>
              <p
                className={`text-xs font-bold ${
                  connectivity.isOnline ? 'text-emerald-300' : 'text-rose-300'
                }`}
              >
                {connectivity.isOnline
                  ? `En línea · hace ${connectivity.diffSeconds}s`
                  : device.lastUpdateServer
                  ? `Desconectado / dato expirado (hace ${
                      connectivity.diffSeconds < 120
                        ? `${connectivity.diffSeconds}s`
                        : `${Math.floor(connectivity.diffSeconds / 60)}m`
                    })`
                  : 'Desconectado · sin marca temporal'}
              </p>
            </div>
          </div>
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              connectivity.isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
            }`}
          />
        </div>

        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-slate-900 border border-slate-700 text-cyan-400 flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
              Última Marca Servidor (last_update_server)
            </p>
            <p className="text-xs font-mono text-slate-200 truncate">{formattedLastUpdate}</p>
            <p className="text-[10px] text-slate-500 font-mono truncate">
              Fuente: {device.sourcePath || `/dispositivos/${device.id}`}
              {device.telemetryOrigin ? ` · origen: ${device.telemetryOrigin}` : ''}
            </p>
          </div>
        </div>
      </div>

      {/* 4 Tarjetas de Variables con honestidad científica */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* MQ-2 */}
        <div
          className={`rounded-xl p-3.5 border ${
            !connectivity.isOnline
              ? 'bg-slate-950/60 border-slate-800 opacity-80'
              : coSaturated
              ? 'bg-amber-950/25 border-amber-700/60'
              : 'bg-slate-950/80 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-amber-400" />
              MQ-2 (ADC 12 bits)
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
              0–4095 raw
            </span>
          </div>
          {!connectivity.isOnline ? (
            <p className="text-lg font-mono font-bold text-slate-500">Sin datos vigentes</p>
          ) : coRaw === null ? (
            <p className="text-lg font-mono font-bold text-amber-400">Lectura inválida</p>
          ) : coSaturated ? (
            <div>
              <p className="text-lg font-mono font-bold text-amber-300">4095 · Saturación ADC</p>
              <p className="text-[10px] text-amber-200/90 mt-1 flex items-start gap-1">
                <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                Medición no válida por tope de escala ADC 12 bits (no equivale a CO en ppm ni
                demuestra por sí sola desconexión).
              </p>
            </div>
          ) : (
            <div>
              <p className="text-2xl font-mono font-black text-white">
                {coRaw} <span className="text-xs font-normal text-slate-400">ADC raw</span>
              </p>
              <p className="text-[10px] text-slate-400 mt-1">
                Valor analógico bruto (no corresponde a concentración certificada de CO en ppm).
              </p>
            </div>
          )}
        </div>

        {/* PM2.5 OPEN-SMART */}
        <div
          className={`rounded-xl p-3.5 border ${
            !connectivity.isOnline
              ? 'bg-slate-950/60 border-slate-800 opacity-80'
              : pmSaturated
              ? 'bg-amber-950/25 border-amber-700/60'
              : 'bg-slate-950/80 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
              <Wind className="w-3.5 h-3.5 text-cyan-400" />
              Polvo Óptico (PM2.5 est.)
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
              OPEN-SMART
            </span>
          </div>
          {!connectivity.isOnline ? (
            <p className="text-lg font-mono font-bold text-slate-500">Sin datos vigentes</p>
          ) : pmRaw === null ? (
            <p className="text-lg font-mono font-bold text-amber-400">Lectura inválida</p>
          ) : pmSaturated ? (
            <div>
              <p className="text-lg font-mono font-bold text-amber-300">4095 · Saturación ADC</p>
              <p className="text-[10px] text-amber-200/90 mt-1">
                Medición no válida por saturación ADC. {DUST_SENSOR_MODEL_LABEL}.
              </p>
            </div>
          ) : (
            <div>
              <p className="text-2xl font-mono font-black text-white">
                {Number.isInteger(pmRaw) ? pmRaw : pmRaw.toFixed(1)}{' '}
                <span className="text-xs font-normal text-slate-400">µg/m³ est.</span>
              </p>
              <p className="text-[10px] text-slate-400 mt-1">{DUST_SENSOR_MODEL_LABEL}.</p>
            </div>
          )}
        </div>

        {/* Temperatura DHT11 */}
        <div
          className={`rounded-xl p-3.5 border ${
            !connectivity.isOnline
              ? 'bg-slate-950/60 border-slate-800 opacity-80'
              : 'bg-slate-950/80 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
              <Thermometer className="w-3.5 h-3.5 text-orange-400" />
              Temperatura (DHT11)
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
              °C
            </span>
          </div>
          {!connectivity.isOnline ? (
            <p className="text-lg font-mono font-bold text-slate-500">Sin datos vigentes</p>
          ) : tempRaw === null ? (
            <div>
              <p className="text-lg font-mono font-bold text-amber-400">Sin lectura válida</p>
              <p className="text-[10px] text-slate-400 mt-1">
                Valor DHT11 ausente, NaN o fuera de rango (-40 °C a 100 °C).
              </p>
            </div>
          ) : (
            <div>
              <p className="text-2xl font-mono font-black text-white">
                {tempRaw.toFixed(1)} <span className="text-xs font-normal text-slate-400">°C</span>
              </p>
              <p className="text-[10px] text-slate-400 mt-1">Sensor ambiental DHT11 en banco.</p>
            </div>
          )}
        </div>

        {/* Humedad DHT11 */}
        <div
          className={`rounded-xl p-3.5 border ${
            !connectivity.isOnline
              ? 'bg-slate-950/60 border-slate-800 opacity-80'
              : 'bg-slate-950/80 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
              <Droplets className="w-3.5 h-3.5 text-sky-400" />
              Humedad Relativa (DHT11)
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
              % HR
            </span>
          </div>
          {!connectivity.isOnline ? (
            <p className="text-lg font-mono font-bold text-slate-500">Sin datos vigentes</p>
          ) : humRaw === null ? (
            <div>
              <p className="text-lg font-mono font-bold text-amber-400">Sin lectura válida</p>
              <p className="text-[10px] text-slate-400 mt-1">
                Valor DHT11 ausente, NaN o fuera de rango (0% a 100%).
              </p>
            </div>
          ) : (
            <div>
              <p className="text-2xl font-mono font-black text-white">
                {humRaw.toFixed(0)} <span className="text-xs font-normal text-slate-400">%</span>
              </p>
              <p className="text-[10px] text-slate-400 mt-1">Humedad relativa medida por DHT11.</p>
            </div>
          )}
        </div>
      </div>

      {/* Metadatos híbridos, alcance físico real y vínculo organizacional conservado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-[11px]">
        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
          <p className="font-bold text-slate-200 flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-cyan-400" />
            Enlace Híbrido y Vínculo Existente Conservado
          </p>
          <p className="text-slate-400">{linkMeta.description}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-mono text-slate-300 pt-1">
            <span>Nodo: {device.id}</span>
            <span>Org: {device.organizationName || device.organizationId || 'Sin asignar'}</span>
            <span>Faena: {device.siteName || 'No asignada'}</span>
            <span>Sector: {device.sectorName || 'No asignado'}</span>
            {device.via && <span>via: {device.via}</span>}
            {device.gatewayId && <span>gateway_id: {device.gatewayId}</span>}
            {device.viaPuente !== undefined && (
              <span>via_puente: {device.viaPuente ? 'true' : 'false'}</span>
            )}
            {device.saltosEspNow !== undefined && (
              <span>saltos_espnow: {device.saltosEspNow}</span>
            )}
            {device.msgId !== undefined && <span>msgId: {String(device.msgId)}</span>}
          </div>
        </div>

        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
          <p className="font-bold text-slate-200 flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-emerald-400" />
            Alcance de Señalización Física del Prototipo
          </p>
          <p className="text-slate-400 leading-relaxed">
            Señalización física contemplada en el nodo:{' '}
            <strong className="text-slate-200">Matriz LED MAX7219 (8×32)</strong>,{' '}
            <strong className="text-slate-200">Audio I2S</strong> y{' '}
            <strong className="text-slate-200">Pantalla TFT ST7789</strong>. La baliza de 12 V y el
            botón BOOT fueron retirados del alcance; los controles remotos de la web aplican solo a
            simulaciones.
          </p>
        </div>
      </div>

      {/* Historial integrado (/diagnostico/esp32_p087/historial + /historial_telemetria) */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-cyan-400" />
            <div>
              <h3 className="text-xs font-bold text-white">
                Historial Integrado del Nodo (Últimas 6 horas)
              </h3>
              <p className="text-[10px] text-slate-400 font-mono">
                {isPhysicalBenchNode
                  ? `Fusiona /${BENCH_HISTORY_PATH} (${benchPointsCount} muestras) + /historial_telemetria/${device.id}`
                  : `Fuente: /historial_telemetria/${device.id}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-slate-400 bg-slate-900 border border-slate-800 px-2 py-1 rounded">
              {historyPoints.length} muestras
            </span>
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('reportes')}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 transition-colors"
              >
                Abrir Historial Completo
              </button>
            )}
          </div>
        </div>

        {historyLoading ? (
          <div className="text-xs text-slate-400 py-4 text-center flex items-center justify-center gap-2">
            <Activity className="w-4 h-4 animate-spin text-cyan-400" />
            Consultando historial en Firebase RTDB...
          </div>
        ) : historyError ? (
          <div className="text-xs text-amber-300 bg-amber-950/30 border border-amber-800/50 rounded-lg px-3 py-2 flex items-center gap-2">
            <Info className="w-4 h-4 shrink-0" />
            {historyError}
          </div>
        ) : chartData.length === 0 ? (
          <div className="text-xs text-slate-400 py-4 text-center">
            Aún no hay muestras registradas en las últimas 6 horas para{' '}
            <span className="font-mono text-slate-300">{device.id}</span>.
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 items-center">
            <div className="xl:col-span-3 bg-slate-900/60 border border-slate-800/80 rounded-xl p-3">
              {(() => {
                const svgW = 520;
                const svgH = 148;
                const padX = 28;
                const padY = 16;
                const innerW = svgW - padX * 2;
                const innerH = svgH - padY * 2;
                const buildPath = (getter: (d: (typeof chartData)[number]) => number | null) => {
                  const vals = chartData
                    .map(getter)
                    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
                  if (vals.length < 2) return '';
                  const minV = Math.min(...vals);
                  const maxV = Math.max(...vals);
                  const span = maxV - minV || 1;
                  const pts: string[] = [];
                  chartData.forEach((d, idx) => {
                    const v = getter(d);
                    if (typeof v !== 'number' || !Number.isFinite(v)) return;
                    const x = padX + (chartData.length > 1 ? (idx / (chartData.length - 1)) * innerW : innerW / 2);
                    const y = svgH - padY - ((v - minV) / span) * innerH;
                    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
                  });
                  return pts.join(' ');
                };
                const coLine = buildPath((d) => d.co);
                const pmLine = buildPath((d) => d.pm25);
                const tempLine = buildPath((d) => d.temperatura);
                const firstLbl = chartData[0]?.label || '';
                const lastLbl = chartData[chartData.length - 1]?.label || '';
                return (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex items-center gap-1 text-amber-300">
                          <span className="w-2 h-2 rounded-full bg-amber-400" /> MQ-2 (ADC raw)
                        </span>
                        <span className="inline-flex items-center gap-1 text-cyan-300">
                          <span className="w-2 h-2 rounded-full bg-cyan-400" /> Polvo OPEN-SMART
                        </span>
                        <span className="inline-flex items-center gap-1 text-orange-300">
                          <span className="w-2 h-2 rounded-full bg-orange-400" /> Temp (°C)
                        </span>
                      </div>
                      <span className="text-slate-500">Escala normalizada por serie</span>
                    </div>
                    <svg
                      viewBox={`0 0 ${svgW} ${svgH}`}
                      className="w-full h-36 overflow-visible"
                      role="img"
                      aria-label="Tendencia histórica fusionada del nodo ESP32"
                    >
                      <line x1={padX} y1={padY} x2={svgW - padX} y2={padY} stroke="#1e293b" strokeDasharray="3 3" />
                      <line x1={padX} y1={svgH / 2} x2={svgW - padX} y2={svgH / 2} stroke="#1e293b" strokeDasharray="3 3" />
                      <line x1={padX} y1={svgH - padY} x2={svgW - padX} y2={svgH - padY} stroke="#1e293b" />
                      {coLine && (
                        <polyline fill="none" stroke="#f59e0b" strokeWidth="2" points={coLine} />
                      )}
                      {pmLine && (
                        <polyline fill="none" stroke="#22d3ee" strokeWidth="2" points={pmLine} />
                      )}
                      {tempLine && (
                        <polyline fill="none" stroke="#fb923c" strokeWidth="1.5" points={tempLine} />
                      )}
                    </svg>
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 px-1">
                      <span>{firstLbl}</span>
                      <span>{lastLbl}</span>
                    </div>
                  </div>
                );
              })()}
            </div>
            <div className="xl:col-span-2 overflow-x-auto">
              <table className="w-full text-[10px] font-mono text-left">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-800">
                    <th className="py-1 pr-2">Hora</th>
                    <th className="py-1 px-1.5">MQ-2</th>
                    <th className="py-1 px-1.5">PM2.5</th>
                    <th className="py-1 px-1.5">Temp</th>
                    <th className="py-1 pl-1.5">Hum</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {historyPoints
                    .slice(-5)
                    .reverse()
                    .map((pt) => (
                      <tr key={`${pt.timestamp}-${pt.source || 'p'}`} className="text-slate-200">
                        <td className="py-1 pr-2 text-slate-400">
                          {new Date(pt.timestamp).toLocaleTimeString('es-CL', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </td>
                        <td className="py-1 px-1.5">
                          {pt.co === 4095 ? (
                            <span className="text-amber-300">SAT(4095)</span>
                          ) : pt.co !== null ? (
                            pt.co
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-1 px-1.5">{pt.pm25 !== null ? pt.pm25 : '—'}</td>
                        <td className="py-1 px-1.5">
                          {pt.temperatura !== null ? `${pt.temperatura}°` : '—'}
                        </td>
                        <td className="py-1 pl-1.5">
                          {pt.humedad !== null ? `${pt.humedad}%` : '—'}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Diagnóstico Real de Firebase Auth y RTDB — Exclusivo SuperAdministrador (P092) */}
      {isSuperAdmin && (
        <div
          aria-label="Diagnóstico Técnico Firebase SuperAdmin"
          className="bg-slate-950/90 border border-purple-700/50 rounded-xl p-4 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-purple-400 shrink-0" />
              <div>
                <h3 className="text-xs font-bold text-purple-200 uppercase tracking-wider">
                  Diagnóstico Real Firebase RTDB &amp; Permisos (Exclusivo SuperAdmin · {APP_BUILD_VERSION})
                </h3>
                <p className="text-[10px] text-slate-400 font-mono">
                  Proyecto: {diagnostics.projectId} · RTDB: {diagnostics.rtdbUrl} · Desfase reloj servidor:{' '}
                  {diagnostics.serverTimeOffsetMs >= 0
                    ? `+${diagnostics.serverTimeOffsetMs}`
                    : diagnostics.serverTimeOffsetMs}{' '}
                  ms
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {onReconnectTelemetry && (
                <button
                  type="button"
                  onClick={onReconnectTelemetry}
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reconectar Listeners
                </button>
              )}
              <button
                type="button"
                onClick={handleRunProbe}
                disabled={probeLoading}
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-purple-900/70 hover:bg-purple-800/80 text-purple-100 border border-purple-600/70 transition-colors disabled:opacity-60 cursor-pointer"
              >
                <Activity className={`w-3.5 h-3.5 ${probeLoading ? 'animate-spin' : ''}`} />
                {probeLoading ? 'Sondeando RTDB...' : 'Ejecutar Sonda Diagnóstica RTDB'}
              </button>
            </div>
          </div>

          {/* Alertas de errores reales detectados */}
          {(diagnostics.benchListener.error ||
            diagnostics.devicesListener.error ||
            diagnostics.historyListener.lastError ||
            diagnostics.auth.profileReadError ||
            (diagnostics.auth.authenticated && !diagnostics.auth.emailVerified)) && (
            <div className="space-y-2">
              {diagnostics.auth.authenticated && !diagnostics.auth.emailVerified && (
                <div className="text-[11px] bg-amber-950/50 border border-amber-700/60 text-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-bold">email_verified = false en Firebase Auth:</strong> Si el
                    perfil <span className="font-mono">/usuarios/{diagnostics.auth.uid}</span> no existe con{' '}
                    <span className="font-mono">isActive: true</span> y{' '}
                    <span className="font-mono">isSuperUser: true</span>, las reglas{' '}
                    <span className="font-mono">database.rules.json</span> rechazarán la lectura con{' '}
                    <span className="font-mono">PERMISSION_DENIED</span>.
                  </div>
                </div>
              )}
              {diagnostics.benchListener.error && (
                <div className="text-[11px] bg-rose-950/50 border border-rose-700/60 text-rose-200 rounded-lg px-3 py-2 font-mono break-all">
                  <strong className="text-rose-300">Error /{BENCH_TELEMETRY_PATH}:</strong>{' '}
                  {diagnostics.benchListener.errorCode ? `[${diagnostics.benchListener.errorCode}] ` : ''}
                  {diagnostics.benchListener.error}
                </div>
              )}
              {diagnostics.devicesListener.error && (
                <div className="text-[11px] bg-rose-950/50 border border-rose-700/60 text-rose-200 rounded-lg px-3 py-2 font-mono break-all">
                  <strong className="text-rose-300">Error /dispositivos:</strong>{' '}
                  {diagnostics.devicesListener.error}
                </div>
              )}
              {diagnostics.historyListener.lastError && (
                <div className="text-[11px] bg-rose-950/50 border border-rose-700/60 text-rose-200 rounded-lg px-3 py-2 font-mono break-all">
                  <strong className="text-rose-300">Error /{BENCH_HISTORY_PATH}:</strong>{' '}
                  {diagnostics.historyListener.lastError}
                </div>
              )}
              {diagnostics.auth.profileReadError && (
                <div className="text-[11px] bg-amber-950/40 border border-amber-700/50 text-amber-200 rounded-lg px-3 py-2 font-mono break-all">
                  <strong className="text-amber-300">Perfil /usuarios/&#123;uid&#125;:</strong>{' '}
                  {diagnostics.auth.profileReadError}
                </div>
              )}
            </div>
          )}

          {/* Grid de estado de sesión Auth, suscripción /diagnostico/esp32_p087 y decisión de fusión */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] font-mono">
            <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 space-y-1">
              <p className="text-[10px] font-bold uppercase text-purple-300 mb-1">
                1. Sesión Firebase Auth &amp; Rol
              </p>
              <p className="text-slate-300 truncate">
                UID: <span className="text-white">{diagnostics.auth.uid || 'Sin sesión Auth'}</span>
              </p>
              <p className="text-slate-300 truncate">
                Email: <span className="text-white">{diagnostics.auth.email || '—'}</span>
              </p>
              <p className="text-slate-300">
                email_verified:{' '}
                <span className={diagnostics.auth.emailVerified ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                  {String(diagnostics.auth.emailVerified)}
                </span>
              </p>
              <p className="text-slate-300">
                Rol UI: <span className="text-purple-300">{currentUser?.role}</span>
                {diagnostics.auth.profileNodeExists !== null && (
                  <span className="text-slate-400">
                    {' '}
                    · /usuarios/&#123;uid&#125;: {diagnostics.auth.profileNodeExists ? 'OK' : 'NO EXISTE'}
                  </span>
                )}
              </p>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 space-y-1">
              <p className="text-[10px] font-bold uppercase text-cyan-300 mb-1">
                2. Listener /{BENCH_TELEMETRY_PATH}
              </p>
              <p className="text-slate-300 flex items-center gap-1.5">
                Estado:{' '}
                <span
                  className={
                    diagnostics.benchListener.status === 'ok'
                      ? 'text-emerald-400 font-bold'
                      : diagnostics.benchListener.status === 'error'
                      ? 'text-rose-400 font-bold'
                      : 'text-amber-300 font-bold'
                  }
                >
                  {diagnostics.benchListener.status.toUpperCase()}
                </span>
                {diagnostics.benchListener.status === 'ok' && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                )}
              </p>
              <p className="text-slate-300">
                last_update_server:{' '}
                <span className="text-white">
                  {diagnostics.benchListener.normalizedServerTs || '—'}
                </span>
              </p>
              {diagnostics.benchListener.rawPayload ? (
                <p className="text-slate-400 text-[10px] leading-snug">
                  CO={String(diagnostics.benchListener.rawPayload.CO ?? '—')} · PM2_5=
                  {String(diagnostics.benchListener.rawPayload.PM2_5 ?? '—')} · T=
                  {String(diagnostics.benchListener.rawPayload.temperatura ?? '—')} · H=
                  {String(diagnostics.benchListener.rawPayload.humedad ?? '—')} · origen=
                  {String(diagnostics.benchListener.rawPayload.origen ?? '—')}
                </p>
              ) : (
                <p className="text-slate-500 text-[10px]">Sin payload recibido en memoria.</p>
              )}
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 space-y-1">
              <p className="text-[10px] font-bold uppercase text-emerald-300 mb-1">
                3. Fusión sobre {PHYSICAL_NODE_DEVICE_ID}
              </p>
              <p className="text-slate-300">
                Fusión aplicada:{' '}
                <span className={diagnostics.mergeDecision.applied ? 'text-emerald-400 font-bold' : 'text-amber-300 font-bold'}>
                  {diagnostics.mergeDecision.applied ? 'SÍ (Banco activo)' : 'NO'}
                </span>
              </p>
              <p className="text-slate-300">
                Conectividad:{' '}
                <span className={connectivity.isOnline ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                  {connectivity.isOnline ? 'ONLINE' : 'OFFLINE'}
                </span>{' '}
                (Δ={connectivity.diffSeconds}s / límite {connectivity.timeoutSeconds}s)
              </p>
              <p className="text-slate-400 text-[10px] leading-snug">
                Motivo: {diagnostics.mergeDecision.reason}
              </p>
              <p className="text-slate-500 text-[10px]">
                Historial banco: {diagnostics.historyListener.benchPointsCount} · Legado:{' '}
                {diagnostics.historyListener.legacyPointsCount}
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
