import React, { useMemo } from 'react';
import {
  Activity,
  ShieldCheck,
  Eye,
  Bell,
  BarChart3,
  Cpu,
  Wrench,
  FileSpreadsheet,
  Layers,
  Radio,
  Zap,
  Wind,
  MapPin,
} from 'lucide-react';
import {
  TelemetryVariable,
  TelemetryHistoryPoint,
  SafetyAlert,
  MiningSite,
  MiningCrew,
  Organization,
  NavigationTab,
  SensorDevice,
  UserProfile,
  PlatformConfig,
} from '../types';
import { ESP32GatewaySection } from './ESP32GatewaySection';
import { DualReadingSensorCards } from './DualReadingSensorCards';
import { InteractiveDeviceChartAndUsers } from './InteractiveDeviceChartAndUsers';
import { isTabVisibleForUser } from '../services/firebase';

interface DashboardViewProps {
  variables?: TelemetryVariable[];
  telemetryHistory?: TelemetryHistoryPoint[];
  activeAlerts: SafetyAlert[];
  currentSite: MiningSite;
  sites?: MiningSite[];
  crews?: MiningCrew[];
  organizations?: Organization[];
  activeOrganizationId?: string;
  onSelectOrganization?: (orgId: string) => void;
  devices: SensorDevice[];
  activeTelemetryDeviceId?: string;
  onSelectTelemetryDevice?: (deviceId: string) => void;
  onNavigateTab: (tab: NavigationTab) => void;
  onSelectSensor?: (sensorId: string) => void;
  onAcknowledgeAlert?: (alertId: string) => void;
  onResetPageLevels?: () => void;
  isAlarmActive?: boolean;
  onToggleAlarm?: () => void;
  onShutdownAlarmCompletely?: () => void;
  onToggleGatewayAlarm?: (
    gatewayId: string,
    active: boolean,
    targetDeviceIds: string[]
  ) => Promise<void> | void;
  isLightActive?: boolean;
  onToggleLight?: () => void;
  currentUser?: UserProfile | null;
  usersList?: UserProfile[];
  onChangeUserModal?: () => void;
  platformConfig?: PlatformConfig;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  telemetryHistory = [],
  activeAlerts,
  currentSite,
  sites = [],
  crews = [],
  organizations = [],
  activeOrganizationId = 'all',
  onSelectOrganization,
  devices,
  activeTelemetryDeviceId,
  onSelectTelemetryDevice,
  onNavigateTab,
  isAlarmActive,
  onToggleAlarm,
  onShutdownAlarmCompletely,
  onToggleGatewayAlarm,
  currentUser,
  usersList = [],
  onChangeUserModal,
  platformConfig,
}) => {
  const activeDevice = devices.find((d) => d.id === activeTelemetryDeviceId) || devices[0];
  const canSeeEquipos = isTabVisibleForUser('equipos', currentUser ?? null, platformConfig);
  const canSeeAlertas = isTabVisibleForUser('alertas', currentUser ?? null, platformConfig);
  const canSeeMonitoreo = isTabVisibleForUser('monitoreo', currentUser ?? null, platformConfig);
  const canSeeReportes = isTabVisibleForUser('reportes', currentUser ?? null, platformConfig);
  const canSeeFaenas = isTabVisibleForUser('faenas', currentUser ?? null, platformConfig);

  const safeNavigate = (tab: NavigationTab) => {
    if (isTabVisibleForUser(tab, currentUser ?? null, platformConfig)) {
      onNavigateTab(tab);
    }
  };

  const appCfg = platformConfig?.appearance;
  const metCfg = platformConfig?.metrics;

  const onlineNodesCount = devices.filter((d) => d.status !== 'desconectado').length;
  const monitoredSectorsCount = useMemo(() => {
    const sectors = new Set<string>();
    devices.forEach((d) => {
      if (d.sectorName?.trim()) sectors.add(d.sectorName.trim().toLowerCase());
    });
    currentSite.activeSectors.forEach((s) => {
      if (s.name?.trim()) sectors.add(s.name.trim().toLowerCase());
    });
    return sectors.size;
  }, [devices, currentSite.activeSectors]);

  // Clarify Active Alerts timeframe: last 24h + timestamp of most recent alert
  const recent24hAlerts = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return activeAlerts.filter((a) => !a.createdAtMs || a.createdAtMs >= cutoff);
  }, [activeAlerts]);

  const latestActiveAlertTimestamp = useMemo(() => {
    if (recent24hAlerts.length === 0) return null;
    const sorted = [...recent24hAlerts].sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
    return sorted[0]?.timestamp || null;
  }, [recent24hAlerts]);

  const heroScale = appCfg?.heroTitleScale || 'normal';
  const titleSizeClass =
    heroScale === 'compact'
      ? 'text-xl sm:text-2xl'
      : heroScale === 'large'
      ? 'text-3xl sm:text-5xl'
      : heroScale === 'xlarge'
      ? 'text-4xl sm:text-6xl'
      : 'text-2xl sm:text-4xl';
  const subtitleSizeClass =
    heroScale === 'compact'
      ? 'text-xs sm:text-sm'
      : heroScale === 'large'
      ? 'text-base sm:text-lg'
      : heroScale === 'xlarge'
      ? 'text-lg sm:text-xl'
      : 'text-sm sm:text-base';

  const showDual = (appCfg?.showDualSensorCards ?? true) && Boolean(activeDevice);
  const consolidatedAtmosphericSection =
    showDual && activeDevice ? (
      <div className="relative z-10">
        <DualReadingSensorCards device={activeDevice} />
      </div>
    ) : null;

  return (
    <div className="space-y-10 pb-16">
      {/* ==============================================================
          HERO & OPERATIONAL BANNER
         ============================================================== */}
      <section className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 tech-grid-pattern p-6 sm:p-8 lg:p-10">
        <div className="tech-radial-glow absolute inset-0 pointer-events-none" />

        {/* Header Title & Subtitle */}
        <div className="relative z-10 max-w-3xl mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-800/60 text-cyan-300 text-xs font-semibold uppercase tracking-wider mb-3">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            Control Operacional en Tiempo Real · {currentSite.name}
          </div>
          <h1 className={`${titleSizeClass} font-extrabold tracking-tight text-white`}>
            {appCfg?.platformTitle || 'MineSafe: Monitoreo IoT y Seguridad Minera'}
          </h1>
          <p className={`mt-2 ${subtitleSizeClass} text-slate-300 max-w-2xl leading-relaxed`}>
            {appCfg?.platformSubtitle ||
              'Supervisión ambiental subterránea continua, control de gases críticos por sector y respuesta temprana ante incidentes.'}
          </p>
        </div>

        {/* Clean Operational Summary (3 cards: Nodos activos, Sectores monitoreados, Alertas activas 24h) */}
        <div className="relative z-10 grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 pt-4 border-t border-slate-800/80 text-xs text-slate-400">
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="block text-slate-400">Nodos Activos del Total</span>
            <span className="text-base font-bold text-emerald-400 tabular-nums mt-0.5 block">
              {onlineNodesCount} / {devices.length} Nodos Online
            </span>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="block text-slate-400">Sectores Monitoreados</span>
            <span className="text-base font-bold text-white tabular-nums mt-0.5 block">
              {monitoredSectorsCount} {monitoredSectorsCount === 1 ? 'Sector Activo' : 'Sectores Activos'}
            </span>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="block text-slate-400">Alertas Activas (Últimas 24h)</span>
            <span
              className={`text-base font-bold tabular-nums mt-0.5 block ${
                recent24hAlerts.length > 0 ? 'text-amber-400' : 'text-emerald-400'
              }`}
            >
              {recent24hAlerts.length} {recent24hAlerts.length === 1 ? 'Alerta Activa' : 'Alertas Activas'}
            </span>
            <span className="text-[11px] text-slate-400 block mt-0.5 truncate">
              {latestActiveAlertTimestamp
                ? `Última registrada: ${latestActiveAlertTimestamp}`
                : 'Sin alertas vigentes en las últimas 24h'}
            </span>
          </div>
        </div>

        {/* ==============================================================
            BIENVENIDA, MONITOREO ATMOSFÉRICO CONSOLIDADO Y GRÁFICO SECTORIAL
           ============================================================== */}
        {(appCfg?.showChartsAndUsers ?? true) ? (
          <div className="relative z-10 mb-8">
            <InteractiveDeviceChartAndUsers
              currentUser={currentUser}
              usersList={usersList}
              devices={devices}
              activeDeviceId={activeTelemetryDeviceId || devices[0]?.id}
              onSelectDevice={(id) => onSelectTelemetryDevice?.(id)}
              onChangeUserModal={onChangeUserModal}
              activeAlertCount={recent24hAlerts.length}
              platformConfig={platformConfig}
              telemetryHistory={telemetryHistory}
              siteName={currentSite.name}
              betweenWelcomeAndChart={consolidatedAtmosphericSection}
              sites={sites}
              crews={crews}
              organizations={organizations}
              activeOrganizationId={activeOrganizationId}
              onSelectOrganization={onSelectOrganization}
            />
          </div>
        ) : (
          consolidatedAtmosphericSection && (
            <div className="mb-8">{consolidatedAtmosphericSection}</div>
          )
        )}

        {/* ==============================================================
            GATEWAYS POR SECTOR Y CONTROL DE ALARMA
           ============================================================== */}
        {(appCfg?.showESP32Section ?? true) && (
          <ESP32GatewaySection
            devices={devices}
            activeDeviceId={activeTelemetryDeviceId || devices[0]?.id}
            onSelectDevice={(id) => onSelectTelemetryDevice?.(id)}
            isAlarmActive={isAlarmActive}
            onToggleAlarm={onToggleAlarm}
            onShutdownAlarmCompletely={onShutdownAlarmCompletely}
            onToggleGatewayAlarm={onToggleGatewayAlarm}
            isSuperAdmin={currentUser?.role === 'superadmin'}
            currentUser={currentUser}
            timeoutSeconds={metCfg?.gatewayTimeoutSeconds}
          />
        )}
      </section>

      {/* ==============================================================
          CAPABILITIES GRID (Optional via Master Control)
         ============================================================== */}
      {(appCfg?.showCapabilitiesGrid ?? true) && (
        <section className="space-y-4">
          <div className="text-center max-w-2xl mx-auto mb-8">
            <span className="text-xs uppercase font-bold tracking-widest text-cyan-400">
              ARQUITECTURA DE CONTROL MINERO INTEGRADO
            </span>
            <h2 className="text-2xl font-extrabold text-white mt-1">
              Capacidades Clave — Seguridad en Faena
            </h2>
            <p className="text-sm text-slate-400 mt-2">
              Ecosistema modular de prevención, telemetría IoT y trazabilidad para faenas subterráneas y rajo abierto.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div
              onClick={() => canSeeMonitoreo && safeNavigate('monitoreo')}
              className={`group p-4 rounded-xl bg-slate-900/60 border border-cyan-900/30 hover:border-cyan-500/50 hover:bg-slate-900/90 transition-all duration-200 shadow-sm ${
                canSeeMonitoreo ? 'cursor-pointer' : 'opacity-75'
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-cyan-950/80 border border-cyan-700/60 flex items-center justify-center text-cyan-400">
                  <Eye className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-white">MONITOREO EN TIEMPO REAL</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Supervisión continua de temperatura, humedad, gases tóxicos y material particulado por sector.
              </p>
            </div>

            <div
              onClick={() => canSeeAlertas && safeNavigate('alertas')}
              className={`group p-4 rounded-xl bg-slate-900/60 border border-amber-900/30 hover:border-amber-500/50 hover:bg-slate-900/90 transition-all duration-200 shadow-sm ${
                canSeeAlertas ? 'cursor-pointer' : 'opacity-75'
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-amber-950/80 border border-amber-700/60 flex items-center justify-center text-amber-400">
                  <Bell className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-white">ALERTAS INSTANTÁNEAS</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Activación automática de sirena y baliza luminosa ante superación de umbrales normativos DS 132.
              </p>
            </div>

            <div
              onClick={() => canSeeReportes && safeNavigate('reportes')}
              className={`group p-4 rounded-xl bg-slate-900/60 border border-blue-900/30 hover:border-blue-500/50 hover:bg-slate-900/90 transition-all duration-200 shadow-sm ${
                canSeeReportes ? 'cursor-pointer' : 'opacity-75'
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-blue-950/80 border border-blue-700/60 flex items-center justify-center text-blue-400">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-white">HISTORIAL Y REPORTES</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Registro histórico real de sensores, resúmenes estadísticos y exportación auditable CSV/PDF.
              </p>
            </div>

            <div
              onClick={() => canSeeFaenas && safeNavigate('faenas')}
              className={`group p-4 rounded-xl bg-slate-900/60 border border-emerald-900/30 hover:border-emerald-500/50 hover:bg-slate-900/90 transition-all duration-200 shadow-sm ${
                canSeeFaenas ? 'cursor-pointer' : 'opacity-75'
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-950/80 border border-emerald-700/60 flex items-center justify-center text-emerald-400">
                  <MapPin className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-white">FAENAS, CUADRILLAS Y SECTORES</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Organización jerárquica completa desde empresa y faena hasta cuadrillas, sectores y nodos IoT.
              </p>
            </div>

            <div
              onClick={() => canSeeMonitoreo && safeNavigate('monitoreo')}
              className={`group p-4 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-cyan-500/50 hover:bg-slate-900/90 transition-all duration-200 shadow-sm ${
                canSeeMonitoreo ? 'cursor-pointer' : 'opacity-75'
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-cyan-300">
                  <Cpu className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-white">PROPAGACIÓN MULTI-NODO</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Despacho coordinado de alarmas y balizas desde cada Gateway hacia todos sus nodos subordinados.
              </p>
            </div>

            <div
              onClick={() => canSeeFaenas && safeNavigate('faenas')}
              className={`group p-4 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-cyan-500/50 hover:bg-slate-900/90 transition-all duration-200 shadow-sm ${
                canSeeFaenas ? 'cursor-pointer' : 'opacity-75'
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-cyan-300">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-white">SEGURIDAD AVANZADA</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Protocolos de evacuación con rutas guiadas, control de refugios mineros y cumplimiento DS 132.
              </p>
            </div>

            <div
              onClick={() => (canSeeEquipos ? safeNavigate('equipos') : canSeeMonitoreo && safeNavigate('monitoreo'))}
              className="group cursor-pointer p-4 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-cyan-500/50 hover:bg-slate-900/90 transition-all duration-200 shadow-sm"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-cyan-300">
                  <Radio className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-white">INTEGRACIÓN INDUSTRIAL</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Compatibilidad con redes LoRaWAN subterráneas, Wi-Fi industrial, LTE privado y cable radiante.
              </p>
            </div>

            <div
              onClick={() => canSeeReportes && safeNavigate('reportes')}
              className={`group p-4 rounded-xl bg-slate-900/60 border border-emerald-900/30 hover:border-emerald-500/50 hover:bg-slate-900/90 transition-all duration-200 shadow-sm ${
                canSeeReportes ? 'cursor-pointer' : 'opacity-75'
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-950/80 border border-emerald-700/60 flex items-center justify-center text-emerald-400">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-white">AUDITORÍA Y TRAZABILIDAD</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Bitácora de contingencias, filtros por rango de fechas y reportes firmados por operación.
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
