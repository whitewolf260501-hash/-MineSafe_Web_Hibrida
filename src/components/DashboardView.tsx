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
  Users,
  ArrowDownToLine,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  Clock,
  ArrowRight,
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
import { BenchTelemetryPanel } from './BenchTelemetryPanel';
import { ExperimentalBenchV2Panel } from './ExperimentalBenchV2Panel';
import {
  ExperimentalBenchV2State,
  PHYSICAL_NODE_DEVICE_ID,
  canAccessExperimentalBenchDevice,
  createInitialExperimentalBenchV2State,
  isExperimentalBenchDevice,
  isSimulatedDevice,
  isTabVisibleForUser,
  isSectionVisibleForUser,
} from '../services/firebase';

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
  isFirebaseConnected?: boolean;
  onReconnectTelemetry?: () => void;
  experimentalBenchV2?: ExperimentalBenchV2State;
  onUpdateExperimentalBenchV2?: (state: ExperimentalBenchV2State) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  variables = [],
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
  onSelectSensor,
  onAcknowledgeAlert,
  onResetPageLevels,
  isAlarmActive,
  onToggleAlarm,
  onShutdownAlarmCompletely,
  onToggleGatewayAlarm,
  isLightActive,
  onToggleLight,
  currentUser,
  usersList = [],
  onChangeUserModal,
  platformConfig,
  isFirebaseConnected = false,
  onReconnectTelemetry,
  experimentalBenchV2,
  onUpdateExperimentalBenchV2,
}) => {
  const isSuperAdmin = currentUser?.role === 'superadmin';
  const isOperador = currentUser?.role === 'operador';
  const canViewExperimentalBenchV2 = canAccessExperimentalBenchDevice(currentUser);
  const operationalDevices = useMemo(
    () => devices.filter((d) => !isExperimentalBenchDevice(d) && !isSimulatedDevice(d)),
    [devices]
  );

  const { activeDevice, isOperatorUnassigned } = useMemo(() => {
    if (isOperador && currentUser) {
      const cleanUserId = (currentUser.id || '').trim();
      const cleanEmail = (currentUser.email || '').trim().toLowerCase();
      const cleanRut = (currentUser.rut || '').trim().toLowerCase().replace(/[^0-9k]/g, '');
      const userCrews = crews.filter((c) =>
        (c.members || []).some(
          (m) =>
            (cleanUserId && m.userId === cleanUserId) ||
            (cleanEmail && (m.email || '').trim().toLowerCase() === cleanEmail) ||
            (cleanRut && cleanRut.length >= 7 && (m.rut || '').trim().toLowerCase().replace(/[^0-9k]/g, '') === cleanRut)
        )
      );
      const allowedSectors = new Set<string>();
      const sec = (currentUser.assignedSector || '').trim().toLowerCase();
      if (sec && sec !== 'sin asignar' && sec !== 'faena minera central') {
        allowedSectors.add(sec);
      }
      userCrews.forEach((c) => {
        if (c.sectorName?.trim()) allowedSectors.add(c.sectorName.trim().toLowerCase());
      });
      const assignedCode = (currentUser.assignedDeviceCode || '').trim().toLowerCase();
      const crewIds = new Set(userCrews.map((c) => c.id));
      const matched = operationalDevices.filter(
        (d) =>
          (assignedCode &&
            ((d.code || '').trim().toLowerCase() === assignedCode ||
              (d.id || '').trim().toLowerCase() === assignedCode)) ||
          (d.crewId && crewIds.has(d.crewId)) ||
          allowedSectors.has((d.sectorName || '').trim().toLowerCase())
      );
      if (matched.length === 0) {
        return { activeDevice: undefined, isOperatorUnassigned: true };
      }
      const chosen = matched.find((d) => d.id === activeTelemetryDeviceId) || matched[0];
      return { activeDevice: chosen, isOperatorUnassigned: false };
    }
    return {
      activeDevice:
        operationalDevices.find((d) => d.id === activeTelemetryDeviceId) || operationalDevices[0],
      isOperatorUnassigned: false,
    };
  }, [isOperador, currentUser, crews, operationalDevices, activeTelemetryDeviceId]);
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

  const onlineNodesCount = operationalDevices.filter((d) => d.status !== 'desconectado').length;
  const monitoredSectorsCount = useMemo(() => {
    const sectors = new Set<string>();
    operationalDevices.forEach((d) => {
      if (d.sectorName?.trim()) sectors.add(d.sectorName.trim().toLowerCase());
    });
    currentSite.activeSectors.forEach((s) => {
      if (s.name?.trim()) sectors.add(s.name.trim().toLowerCase());
    });
    return sectors.size;
  }, [operationalDevices, currentSite.activeSectors]);

  const totalWorkersOnShift = useMemo(() => {
    const fromSectors = currentSite.activeSectors.reduce(
      (acc, sector) => acc + (Number(sector.activeWorkers) || 0),
      0
    );
    return fromSectors > 0 ? fromSectors : usersList.length;
  }, [currentSite.activeSectors, usersList.length]);

  const maxDepthMeters = useMemo(() => {
    const depths = currentSite.activeSectors
      .map((s) => Number(s.depthMeters) || 0)
      .filter((d) => d > 0);
    return depths.length > 0 ? Math.max(...depths) : 0;
  }, [currentSite.activeSectors]);

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

  const showHeroMetrics = isSectionVisibleForUser('dash_hero_metrics', currentUser, platformConfig);
  const showHeroDiagnostics = isSectionVisibleForUser('dash_hero_diagnostics', currentUser, platformConfig);
  const showWelcomeBanner = isSectionVisibleForUser('dash_welcome_banner', currentUser, platformConfig);
  const showWelcomeStats = isSectionVisibleForUser('dash_welcome_stats', currentUser, platformConfig);
  const showWelcomeDiagnostics = isSectionVisibleForUser('dash_welcome_diagnostics', currentUser, platformConfig);
  const showDualDiagnosticRow = isSectionVisibleForUser('dash_dual_diagnostic_row', currentUser, platformConfig);
  const showDualQuickCore = isSectionVisibleForUser('dash_dual_quick_core', currentUser, platformConfig);
  const showDualBatteryAirflow = isSectionVisibleForUser('dash_dual_battery_airflow', currentUser, platformConfig);
  const showDualO2Noise = isSectionVisibleForUser('dash_dual_o2_noise', currentUser, platformConfig);
  const showSectorChart = isSectionVisibleForUser('dash_sector_chart', currentUser, platformConfig);
  const showSectorChartExtended = isSectionVisibleForUser('dash_sector_chart_extended', currentUser, platformConfig);
  const showDashUsersPanel = isSectionVisibleForUser('dash_users_panel', currentUser, platformConfig);
  const showGatewaySection = isSectionVisibleForUser('dash_gateway_section', currentUser, platformConfig);
  const showGatewayHwControls = isSectionVisibleForUser('dash_gateway_hw_controls', currentUser, platformConfig);
  const showCapabilitiesGrid = isSectionVisibleForUser('dash_capabilities_grid', currentUser, platformConfig);
  const showFooterAlerts = isSectionVisibleForUser('dash_footer_alerts', currentUser, platformConfig);

  const hasAnyDualBlock =
    showDualDiagnosticRow || showDualQuickCore || showDualBatteryAirflow || showDualO2Noise;
  const showDual = (appCfg?.showDualSensorCards ?? true) && Boolean(activeDevice) && hasAnyDualBlock;
  const consolidatedAtmosphericSection = isOperatorUnassigned ? (
    <div className="relative z-10 mb-6 p-6 rounded-2xl bg-slate-900/80 border border-amber-700/60 text-center space-y-2">
      <div className="w-11 h-11 rounded-xl bg-amber-950/70 border border-amber-700/60 text-amber-400 flex items-center justify-center mx-auto">
        <MapPin className="w-5 h-5" />
      </div>
      <h3 className="text-base font-bold text-white">
        Sin faena, sector ni dispositivo IoT asignado
      </h3>
      <p className="text-xs text-slate-300 max-w-lg mx-auto leading-relaxed">
        Tu cuenta está activa, pero aún no estás asignado a una cuadrilla o sector operativo con sensores.
        Contacta al Administrador de tu empresa para que vincule tu turno y sector.
      </p>
    </div>
  ) : showDual && activeDevice ? (
    <div className="relative z-10">
      <DualReadingSensorCards
        device={activeDevice}
        isSuperAdmin={isSuperAdmin}
        quickVariables={variables}
        showDiagnosticRow={showDualDiagnosticRow}
        showQuickCore={showDualQuickCore}
        showBatteryAndAirflow={showDualBatteryAirflow}
        showO2AndNoise={showDualO2Noise}
      />
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

        {/* Operational Summary (Configured via Vistas y Bloques per role/user) */}
        {(showHeroMetrics || showHeroDiagnostics) && (
          <div
            className={`relative z-10 grid grid-cols-1 ${
              showHeroMetrics && showHeroDiagnostics
                ? 'sm:grid-cols-2 lg:grid-cols-5'
                : showHeroMetrics
                ? 'sm:grid-cols-3'
                : 'sm:grid-cols-2'
            } gap-4 mb-8 pt-4 border-t border-slate-800/80 text-xs text-slate-400`}
          >
          {showHeroMetrics && (
            <>
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
                <span className="block text-slate-400">Nodos Activos del Total</span>
                <span className="text-base font-bold text-emerald-400 tabular-nums mt-0.5 block">
                  {onlineNodesCount} / {operationalDevices.length} Nodos Online
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
            </>
          )}
          {showHeroDiagnostics && (
            <>
              <div className="p-3.5 rounded-xl bg-purple-950/25 border border-purple-800/50">
                <span className="flex items-center justify-between text-purple-200">
                  <span>Personal en Turno</span>
                  <Users className="w-3.5 h-3.5 text-purple-400" />
                </span>
                <span className="text-base font-bold text-white tabular-nums mt-0.5 block">
                  {totalWorkersOnShift} Trabajadores
                </span>
                <span className="text-[10px] text-purple-300/80 block mt-0.5">
                  Vista Diagnóstico Avanzado
                </span>
              </div>
              <div className="p-3.5 rounded-xl bg-purple-950/25 border border-purple-800/50">
                <span className="flex items-center justify-between text-purple-200">
                  <span>Profundidad Máxima</span>
                  <ArrowDownToLine className="w-3.5 h-3.5 text-purple-400" />
                </span>
                <span className="text-base font-bold text-cyan-300 tabular-nums mt-0.5 block">
                  {maxDepthMeters > 0 ? `-${maxDepthMeters} m` : 'Superficie / N/D'}
                </span>
                <span className="text-[10px] text-purple-300/80 block mt-0.5">
                  Cota máxima en {currentSite.name}
                </span>
              </div>
            </>
          )}
          </div>
        )}

        {/* ==============================================================
            BIENVENIDA, MONITOREO ATMOSFÉRICO CONSOLIDADO Y GRÁFICO SECTORIAL
           ============================================================== */}
        {(isOperador || (appCfg?.showChartsAndUsers ?? true)) ? (
          <div className={`relative z-10 ${showGatewaySection ? 'mb-8' : ''}`}>
            <InteractiveDeviceChartAndUsers
              currentUser={currentUser}
              usersList={usersList}
              devices={operationalDevices}
              activeDeviceId={activeTelemetryDeviceId || operationalDevices[0]?.id}
              onSelectDevice={(id) => onSelectTelemetryDevice?.(id)}
              onChangeUserModal={onChangeUserModal}
              activeAlertCount={recent24hAlerts.length}
              platformConfig={platformConfig}
              telemetryHistory={telemetryHistory}
              siteName={currentSite.name}
              betweenWelcomeAndChart={consolidatedAtmosphericSection}
              canViewSystemUsers={showDashUsersPanel}
              showWelcomeBanner={showWelcomeBanner}
              showWelcomeStats={showWelcomeStats}
              showWelcomeDiagnostics={showWelcomeDiagnostics}
              showSectorChart={showSectorChart}
              showExtendedChartVars={showSectorChartExtended}
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
            TELEMETRÍA DE BANCO ESP32 (NODO FÍSICO /diagnostico/esp32_p087)
           ============================================================== */}
        {(() => {
          const benchDevice =
            (activeDevice &&
            (activeDevice.id === PHYSICAL_NODE_DEVICE_ID || activeDevice.isBenchTelemetry)
              ? activeDevice
              : operationalDevices.find(
                  (d) => d.id === PHYSICAL_NODE_DEVICE_ID || d.isBenchTelemetry
                )) || null;
          if (!benchDevice || isOperatorUnassigned) return null;
          return (
            <div className="relative z-10 mb-8">
              <BenchTelemetryPanel
                device={benchDevice}
                isFirebaseConnected={isFirebaseConnected}
                timeoutSeconds={metCfg?.gatewayTimeoutSeconds}
                onNavigate={safeNavigate}
                currentUser={currentUser}
                onReconnectTelemetry={onReconnectTelemetry}
              />
            </div>
          );
        })()}

        {/* ==============================================================
            P094: BANCO EXPERIMENTAL V2 (/dispositivos/device_38A839E81F84_V2)
            Exclusivo para roles autorizados (SuperAdmin / Admin MineSafe)
           ============================================================== */}
        {canViewExperimentalBenchV2 && (
          <div className="relative z-10 mb-8">
            <ExperimentalBenchV2Panel
              state={experimentalBenchV2 || createInitialExperimentalBenchV2State(true)}
              isFirebaseConnected={isFirebaseConnected}
              timeoutSeconds={metCfg?.gatewayTimeoutSeconds}
              currentUser={currentUser}
              onReconnectTelemetry={onReconnectTelemetry}
              onUpdateState={onUpdateExperimentalBenchV2}
            />
          </div>
        )}

        {/* ==============================================================
            GATEWAYS POR SECTOR Y CONTROL DE ALARMA
           ============================================================== */}
        {showGatewaySection && (appCfg?.showESP32Section ?? true) && (
          <ESP32GatewaySection
            devices={operationalDevices}
            activeDeviceId={activeTelemetryDeviceId || operationalDevices[0]?.id}
            onSelectDevice={(id) => onSelectTelemetryDevice?.(id)}
            onResetPageLevels={onResetPageLevels}
            isAlarmActive={isAlarmActive}
            onToggleAlarm={onToggleAlarm}
            onShutdownAlarmCompletely={onShutdownAlarmCompletely}
            onToggleGatewayAlarm={onToggleGatewayAlarm}
            isLightActive={isLightActive}
            onToggleLight={onToggleLight}
            isSuperAdmin={isSuperAdmin}
            showHardwareControls={showGatewayHwControls}
            currentUser={currentUser}
            timeoutSeconds={metCfg?.gatewayTimeoutSeconds}
          />
        )}
      </section>

      {/* ==============================================================
          CAPABILITIES GRID (Configurable por rol/usuario en Vistas y Bloques)
         ============================================================== */}
      {showCapabilitiesGrid && (appCfg?.showCapabilitiesGrid ?? true) && (
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
                Señalización mediante Matriz LED MAX7219 (8×32), Audio I2S y Pantalla TFT ST7789 ante superación de umbrales.
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
                Despacho coordinado de alertas y señalización de simulación desde cada Gateway hacia sus nodos subordinados.
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

      {/* ==============================================================
          INCIDENCIAS Y ALERTAS ACTIVAS AL PIE DEL DASHBOARD
         ============================================================== */}
      {showFooterAlerts && (
        <section className="rounded-2xl bg-slate-900/80 border border-purple-800/50 p-5 sm:p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-rose-950/80 border border-rose-800 flex items-center justify-center text-rose-400">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold text-white">
                    Incidencias y Alertas Activas en Faena
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-950 text-purple-200 border border-purple-700/70">
                    Solo SuperAdmin
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-950 text-amber-300 border border-slate-700">
                    {activeAlerts.length} vigentes
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Resumen rápido de contingencias activas detectadas en el sistema con reconocimiento directo.
                </p>
              </div>
            </div>

            {canSeeAlertas && (
              <button
                type="button"
                onClick={() => safeNavigate('alertas')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-xs font-semibold transition-colors self-start sm:self-center cursor-pointer"
              >
                <span>Abrir Centro de Alertas</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {activeAlerts.length === 0 ? (
            <div className="p-6 rounded-xl bg-slate-950/60 border border-slate-800 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
              <CheckCircle2 className="w-7 h-7 text-emerald-400" />
              <span className="font-semibold text-slate-200">
                No existen incidencias ni alertas activas pendientes.
              </span>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
              {activeAlerts.slice(0, 10).map((alert) => (
                <div
                  key={alert.id}
                  className={`p-3.5 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                    alert.severity === 'critico'
                      ? 'bg-rose-950/20 border-rose-800/70'
                      : 'bg-amber-950/20 border-amber-800/60'
                  }`}
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                          alert.severity === 'critico'
                            ? 'bg-rose-950 text-rose-300 border-rose-700'
                            : 'bg-amber-950 text-amber-300 border-amber-700'
                        }`}
                      >
                        <AlertTriangle className="w-3 h-3" />
                        {alert.severity}
                      </span>
                      <span className="text-xs font-bold text-white truncate">{alert.title}</span>
                      <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                        {alert.code}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5 text-[11px] text-slate-400">
                      <span>
                        Sector: <strong className="text-cyan-300">{alert.sectorName}</strong>
                      </span>
                      <span>•</span>
                      <span>
                        Sensor: <strong className="font-mono text-slate-200">{alert.sensorCode}</strong>
                      </span>
                      <span>•</span>
                      <span>
                        Lectura: <strong className="font-mono text-white">{alert.recordedValue}</strong> (Límite:{' '}
                        {alert.safeLimit})
                      </span>
                      <span>•</span>
                      <span className="inline-flex items-center gap-1 font-mono">
                        <Clock className="w-3 h-3" />
                        {alert.timestamp}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {onSelectSensor && (
                      <button
                        type="button"
                        onClick={() => onSelectSensor(alert.sensorCode)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-700 text-[11px] font-semibold cursor-pointer"
                      >
                        Ver Sensor
                      </button>
                    )}
                    {onAcknowledgeAlert && !alert.resolved && (
                      <button
                        type="button"
                        onClick={() => onAcknowledgeAlert(alert.id)}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-[11px] font-bold cursor-pointer"
                        title="Reconocer y quitar esta alarma completamente"
                      >
                        Reconocer
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
