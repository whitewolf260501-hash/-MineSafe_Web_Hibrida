import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BatteryCharging,
  Box,
  Cpu,
  Download,
  Eye,
  EyeOff,
  Filter,
  Flame,
  Gauge,
  Layers,
  MapPin,
  Monitor,
  Power,
  Radio,
  RotateCcw,
  Shield,
  SlidersHorizontal,
  Thermometer,
  Users,
  Volume2,
  Wind,
  Wrench,
} from 'lucide-react';
import {
  ControllableRoleKey,
  ControllableTab,
  PlatformConfig,
  SectionVisibilityKey,
  UserProfile,
} from '../types';
import { isSectionVisibleForUser, isTabVisibleForUser } from '../services/firebase';

export type PreviewWindowId =
  | 'dashboard'
  | 'monitoreo'
  | 'alertas'
  | 'configuracion_alertas'
  | 'reportes'
  | 'equipos'
  | 'faenas'
  | 'visor_3d';

export type SectionDiffStatus =
  | 'added'
  | 'removed'
  | 'unchanged_visible'
  | 'unchanged_hidden';

export interface SectionDiffItem {
  key: SectionVisibilityKey;
  visible: boolean;
  savedVisible: boolean;
  status: SectionDiffStatus;
}

export interface SectionPreviewDiffSummary {
  byKey: Record<string, SectionDiffItem>;
  visibleCount: number;
  hiddenCount: number;
  totalCount: number;
  addedKeys: SectionVisibilityKey[];
  removedKeys: SectionVisibilityKey[];
  hiddenKeys: SectionVisibilityKey[];
}

export interface PreviewSectionMeta {
  key: SectionVisibilityKey;
  windowGroup: PreviewWindowId;
  label: string;
  description: string;
}

export function computeSectionPreviewDiff(
  sectionKeys: SectionVisibilityKey[],
  targetUser: UserProfile,
  savedConfig: PlatformConfig,
  draftConfig: PlatformConfig
): SectionPreviewDiffSummary {
  const byKey: Record<string, SectionDiffItem> = {};
  const addedKeys: SectionVisibilityKey[] = [];
  const removedKeys: SectionVisibilityKey[] = [];
  const hiddenKeys: SectionVisibilityKey[] = [];
  let visibleCount = 0;
  let hiddenCount = 0;

  for (const key of sectionKeys) {
    const savedVisible = isSectionVisibleForUser(key, targetUser, savedConfig);
    const visible = isSectionVisibleForUser(key, targetUser, draftConfig);
    let status: SectionDiffStatus;

    if (!savedVisible && visible) {
      status = 'added';
      addedKeys.push(key);
    } else if (savedVisible && !visible) {
      status = 'removed';
      removedKeys.push(key);
    } else if (visible) {
      status = 'unchanged_visible';
    } else {
      status = 'unchanged_hidden';
    }

    if (visible) {
      visibleCount += 1;
    } else {
      hiddenCount += 1;
      hiddenKeys.push(key);
    }

    byKey[key] = { key, visible, savedVisible, status };
  }

  return {
    byKey,
    visibleCount,
    hiddenCount,
    totalCount: sectionKeys.length,
    addedKeys,
    removedKeys,
    hiddenKeys,
  };
}

const PREVIEW_WINDOWS: { id: PreviewWindowId; label: string; tab: ControllableTab }[] = [
  { id: 'dashboard', label: 'Dashboard Principal', tab: 'dashboard' },
  { id: 'monitoreo', label: 'Monitoreo IoT', tab: 'monitoreo' },
  { id: 'alertas', label: 'Alertas y Auditoría', tab: 'alertas' },
  { id: 'configuracion_alertas', label: 'Config. Umbrales', tab: 'configuracion_alertas' },
  { id: 'reportes', label: 'Historial y Reportes', tab: 'reportes' },
  { id: 'equipos', label: 'Equipos y Arriendos', tab: 'equipos' },
  { id: 'faenas', label: 'Faenas y Sectores', tab: 'faenas' },
  { id: 'visor_3d', label: 'Visores 3D', tab: 'visor_3d' },
];

const PREVIEW_ROLE_OPTIONS: { key: ControllableRoleKey; shortLabel: string; label: string }[] = [
  { key: 'admin_minesafe', shortLabel: 'Admin MS', label: 'Admin MineSafe' },
  { key: 'admin', shortLabel: 'Admin', label: 'Administrador' },
  { key: 'supervisor', shortLabel: 'Supervisor', label: 'Supervisor' },
  { key: 'operador', shortLabel: 'Operador', label: 'Operador' },
];

interface SuperAdminWindowPreviewProps {
  activeWindow: PreviewWindowId;
  showWindowSwitcher?: boolean;
  onChangeWindow?: (next: PreviewWindowId) => void;
  previewModeContext: 'role' | 'user';
  previewRole?: ControllableRoleKey;
  onSelectPreviewRole?: (role: ControllableRoleKey) => void;
  previewSubject: UserProfile;
  previewSubjectLabel: string;
  draftConfig: PlatformConfig;
  savedConfig: PlatformConfig;
  onToggleSection: (key: SectionVisibilityKey) => void;
  sectionCatalog: PreviewSectionMeta[];
  siteName?: string;
  deviceName?: string;
  devicesCount?: number;
  alertsCount?: number;
  usersCount?: number;
}

interface PreviewBlockProps {
  sectionKey: SectionVisibilityKey;
  title: string;
  diff: SectionDiffItem | undefined;
  showRemoved: boolean;
  onToggle: (key: SectionVisibilityKey) => void;
  compact?: boolean;
  className?: string;
  children: React.ReactNode;
}

const PreviewBlock: React.FC<PreviewBlockProps> = ({
  sectionKey,
  title,
  diff,
  showRemoved,
  onToggle,
  compact = false,
  className = '',
  children,
}) => {
  const visible = diff ? diff.visible : true;
  const status = diff?.status || 'unchanged_visible';

  if (!visible) {
    if (!showRemoved) return null;
    const isNewlyRemoved = status === 'removed';
    return (
      <div
        className={`rounded-lg border border-dashed transition-colors ${
          isNewlyRemoved
            ? 'border-rose-500/60 bg-rose-950/20'
            : 'border-slate-700/80 bg-slate-900/40'
        } ${compact ? 'px-2.5 py-2' : 'px-3 py-2.5'} ${className}`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex items-center gap-2">
            <EyeOff
              className={`w-3.5 h-3.5 shrink-0 ${
                isNewlyRemoved ? 'text-rose-400' : 'text-slate-500'
              }`}
            />
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-slate-400 line-through truncate">
                {title}
              </div>
              <div
                className={`text-[10px] ${
                  isNewlyRemoved ? 'text-rose-300 font-medium' : 'text-slate-500'
                }`}
              >
                {isNewlyRemoved ? 'Quitado en este borrador' : 'Oculto para esta vista'}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onToggle(sectionKey)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold bg-slate-800 hover:bg-emerald-900/60 text-emerald-300 border border-slate-700 hover:border-emerald-600/70 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title={`Mostrar "${title}" en esta vista`}
          >
            <Eye className="w-3 h-3" />
            <span>Restaurar</span>
          </button>
        </div>
      </div>
    );
  }

  const isNewlyAdded = status === 'added';

  return (
    <div
      className={`group relative rounded-lg border transition-colors ${
        isNewlyAdded
          ? 'border-emerald-500/70 bg-emerald-950/15'
          : 'border-slate-800 bg-slate-900/80 hover:border-cyan-700/60'
      } ${compact ? 'p-2.5' : 'p-3'} ${className}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 truncate">
            {title}
          </span>
          {isNewlyAdded && (
            <span className="text-[10px] font-semibold text-emerald-300 shrink-0">
              · + Agregado
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => onToggle(sectionKey)}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-slate-400 hover:text-rose-300 hover:bg-rose-950/60 border border-transparent hover:border-rose-800/60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          title={`Quitar "${title}" de esta vista`}
        >
          <EyeOff className="w-3 h-3" />
          <span>Quitar</span>
        </button>
      </div>
      {children}
    </div>
  );
};

export const SuperAdminWindowPreview: React.FC<SuperAdminWindowPreviewProps> = ({
  activeWindow,
  showWindowSwitcher = false,
  onChangeWindow,
  previewModeContext,
  previewRole = 'operador',
  onSelectPreviewRole,
  previewSubject,
  previewSubjectLabel,
  draftConfig,
  savedConfig,
  onToggleSection,
  sectionCatalog,
  siteName = 'Faena El Teniente - Nivel Subterráneo 6',
  deviceName = 'Gateway Principal Sector Rampa',
  devicesCount = 1,
  alertsCount = 4,
  usersCount = 12,
}) => {
  const [previewDisplayMode, setPreviewDisplayMode] = useState<'compare' | 'final'>('compare');
  const showRemoved = previewDisplayMode === 'compare';

  const windowMeta = useMemo(
    () => PREVIEW_WINDOWS.find((w) => w.id === activeWindow) || PREVIEW_WINDOWS[0],
    [activeWindow]
  );

  const windowSections = useMemo(
    () => sectionCatalog.filter((s) => s.windowGroup === activeWindow),
    [sectionCatalog, activeWindow]
  );

  const sectionLabelByKey = useMemo(() => {
    const map: Record<string, string> = {};
    for (const sec of sectionCatalog) {
      map[sec.key] = sec.label;
    }
    return map;
  }, [sectionCatalog]);

  const diffSummary = useMemo(
    () =>
      computeSectionPreviewDiff(
        windowSections.map((s) => s.key),
        previewSubject,
        savedConfig,
        draftConfig
      ),
    [windowSections, previewSubject, savedConfig, draftConfig]
  );

  const isParentWindowAccessible = useMemo(() => {
    if (activeWindow === 'visor_3d') {
      return (
        isTabVisibleForUser('visor_3d', previewSubject, draftConfig) ||
        isTabVisibleForUser('gateway_3d', previewSubject, draftConfig)
      );
    }
    return isTabVisibleForUser(windowMeta.tab, previewSubject, draftConfig);
  }, [activeWindow, windowMeta.tab, previewSubject, draftConfig]);

  const getDiff = (key: SectionVisibilityKey) => diffSummary.byKey[key];
  const isVis = (key: SectionVisibilityKey) => Boolean(diffSummary.byKey[key]?.visible);

  // =========================================================================
  // WINDOW SCHEMATICS
  // =========================================================================
  const renderDashboardPreview = () => {
    const showDualContainer =
      showRemoved ||
      isVis('dash_dual_diagnostic_row') ||
      isVis('dash_dual_quick_core') ||
      isVis('dash_dual_battery_airflow') ||
      isVis('dash_dual_o2_noise');

    const showSectorAndUsersRow =
      showRemoved || isVis('dash_sector_chart') || isVis('dash_users_panel');

    const chartExpanded = !isVis('dash_users_panel') && !showRemoved;
    const extendedVars = isVis('dash_sector_chart_extended');
    const welcomeVisible = isVis('dash_welcome_banner');
    const gatewayVisible = isVis('dash_gateway_section');

    const baseBars = [
      { label: 'Temp', val: '21°', pct: '45%', color: 'bg-sky-400' },
      { label: 'Hum', val: '48%', pct: '52%', color: 'bg-indigo-400' },
      { label: 'CO', val: '12', pct: '28%', color: 'bg-emerald-400' },
      { label: 'CO2', val: '410', pct: '36%', color: 'bg-emerald-400' },
      { label: 'PM2.5', val: '18', pct: '32%', color: 'bg-teal-400' },
    ];
    const extraBars = [
      { label: 'CH4', val: '0.1', pct: '20%', color: 'bg-fuchsia-400' },
      { label: 'O₂', val: '20.8', pct: '78%', color: 'bg-cyan-400' },
      { label: 'Vent', val: '1.8', pct: '58%', color: 'bg-sky-400' },
      { label: 'Ruido', val: '74dB', pct: '64%', color: 'bg-emerald-400' },
    ];
    const barsToRender = extendedVars ? [...baseBars, ...extraBars] : baseBars;

    return (
      <div className="space-y-2.5">
        {/* Base Hero Title (always visible on Dashboard) */}
        <div className="rounded-lg border border-slate-800/90 bg-slate-900/50 px-3 py-2.5">
          <div className="text-[10px] font-medium uppercase tracking-wider text-cyan-400 truncate">
            Control Operacional en Tiempo Real · {siteName}
          </div>
          <div className="text-xs font-bold text-white mt-0.5">
            MineSafe: Monitoreo IoT y Seguridad Minera
          </div>
          <div className="text-[10px] text-slate-400">
            Cabecera fija del Dashboard (siempre visible)
          </div>
        </div>

        {/* Hero KPI Metrics + Extra Diagnostics */}
        <div className="grid grid-cols-1 gap-2">
          <PreviewBlock
            sectionKey="dash_hero_metrics"
            title="Tarjetas Métricas Superiores"
            diff={getDiff('dash_hero_metrics')}
            showRemoved={showRemoved}
            onToggle={onToggleSection}
            compact
          >
            <div className="grid grid-cols-3 gap-1.5 tabular-nums">
              <div className="rounded bg-slate-950/80 border border-slate-800 px-2 py-1.5">
                <div className="text-[9px] text-slate-400 truncate">Nodos Activos</div>
                <div className="text-xs font-bold text-emerald-400">{devicesCount} / {devicesCount}</div>
              </div>
              <div className="rounded bg-slate-950/80 border border-slate-800 px-2 py-1.5">
                <div className="text-[9px] text-slate-400 truncate">Sectores</div>
                <div className="text-xs font-bold text-cyan-300">3</div>
              </div>
              <div className="rounded bg-slate-950/80 border border-slate-800 px-2 py-1.5">
                <div className="text-[9px] text-slate-400 truncate">Alertas 24h</div>
                <div className="text-xs font-bold text-amber-400">{alertsCount}</div>
              </div>
            </div>
          </PreviewBlock>

          <PreviewBlock
            sectionKey="dash_hero_diagnostics"
            title="Tarjetas Diagnóstico Extra (Personal y Profundidad)"
            diff={getDiff('dash_hero_diagnostics')}
            showRemoved={showRemoved}
            onToggle={onToggleSection}
            compact
          >
            <div className="grid grid-cols-2 gap-1.5 tabular-nums">
              <div className="rounded bg-slate-950/80 border border-slate-800 px-2 py-1.5">
                <div className="text-[9px] text-slate-400 truncate">Personal en Turno</div>
                <div className="text-xs font-bold text-slate-200">{usersCount} operarios</div>
              </div>
              <div className="rounded bg-slate-950/80 border border-slate-800 px-2 py-1.5">
                <div className="text-[9px] text-slate-400 truncate">Profundidad Máxima</div>
                <div className="text-xs font-bold text-slate-200">-420 m</div>
              </div>
            </div>
          </PreviewBlock>
        </div>

        {/* Welcome Banner + Internal Stats + Diagnostics */}
        <PreviewBlock
          sectionKey="dash_welcome_banner"
          title="Banner de Bienvenida y Credencial"
          diff={getDiff('dash_welcome_banner')}
          showRemoved={showRemoved}
          onToggle={onToggleSection}
          compact
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 rounded bg-slate-950/80 border border-slate-800 px-2.5 py-2">
              <div className="min-w-0">
                <div className="text-xs font-bold text-white truncate">
                  Bienvenido, {previewSubject.name || previewSubjectLabel}
                </div>
                <div className="text-[10px] text-slate-400 truncate">
                  {previewSubject.roleLabel || previewSubject.role} · {siteName}
                </div>
              </div>
              <span className="text-[10px] font-medium text-cyan-300 border border-slate-700 rounded px-2 py-0.5 whitespace-nowrap shrink-0">
                Ver Credencial
              </span>
            </div>

            <div className="grid grid-cols-1 gap-1.5">
              <PreviewBlock
                sectionKey="dash_welcome_stats"
                title="Métricas Internas del Banner"
                diff={getDiff('dash_welcome_stats')}
                showRemoved={showRemoved}
                onToggle={onToggleSection}
                compact
              >
                <div className="flex items-center justify-between text-[10px] text-slate-300 tabular-nums">
                  <span>Nodos Activos: <strong className="text-emerald-400">{devicesCount}</strong></span>
                  <span>Sectores con Cobertura: <strong className="text-cyan-300">100%</strong></span>
                </div>
              </PreviewBlock>

              <PreviewBlock
                sectionKey="dash_welcome_diagnostics"
                title="Tarjetas Avanzadas del Banner (Dispositivo y Alertas)"
                diff={getDiff('dash_welcome_diagnostics')}
                showRemoved={showRemoved}
                onToggle={onToggleSection}
                compact
              >
                <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                  <div className="rounded bg-slate-950/70 border border-slate-800 px-2 py-1 truncate text-slate-300">
                    Equipo: <span className="text-cyan-300 font-medium">{deviceName}</span>
                  </div>
                  <div className="rounded bg-slate-950/70 border border-slate-800 px-2 py-1 text-slate-300 tabular-nums">
                    Alertas Faena: <span className="text-amber-300 font-semibold">{alertsCount}</span>
                  </div>
                </div>
              </PreviewBlock>
            </div>
          </div>
        </PreviewBlock>

        {/* Note when welcome banner is hidden but internal stats exist in compare mode */}
        {!welcomeVisible && showRemoved && (
          <div className="text-[10px] text-slate-500 px-1">
            Al ocultar el Banner de Bienvenida también se ocultan sus métricas internas y tarjetas avanzadas.
          </div>
        )}

        {/* Monitoreo Atmosférico Dual Cards */}
        {showDualContainer && (
          <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-300">
                <Gauge className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="truncate">Monitoreo Atmosférico: Lectura Rápida</span>
              </div>
              <span className="text-[10px] text-slate-500 truncate max-w-[140px]">
                {deviceName}
              </span>
            </div>

            <PreviewBlock
              sectionKey="dash_dual_diagnostic_row"
              title="3 Tarjetas de Diagnóstico"
              diff={getDiff('dash_dual_diagnostic_row')}
              showRemoved={showRemoved}
              onToggle={onToggleSection}
              compact
            >
              <div className="grid grid-cols-3 gap-1.5">
                <div className="rounded bg-amber-950/30 border border-amber-800/50 p-1.5">
                  <div className="flex items-center gap-1 text-[9px] font-semibold text-amber-300">
                    <Flame className="w-2.5 h-2.5 shrink-0" />
                    <span className="truncate">Gases MQ-2</span>
                  </div>
                  <div className="text-[10px] font-bold text-white mt-0.5 truncate">Seguro</div>
                </div>
                <div className="rounded bg-amber-950/30 border border-amber-800/50 p-1.5">
                  <div className="flex items-center gap-1 text-[9px] font-semibold text-amber-300">
                    <Wind className="w-2.5 h-2.5 shrink-0" />
                    <span className="truncate">Polvo PM2.5</span>
                  </div>
                  <div className="text-[10px] font-bold text-white mt-0.5 truncate">Norma OK</div>
                </div>
                <div className="rounded bg-emerald-950/30 border border-emerald-800/50 p-1.5">
                  <div className="flex items-center gap-1 text-[9px] font-semibold text-emerald-300">
                    <Thermometer className="w-2.5 h-2.5 shrink-0" />
                    <span className="truncate">Térmico</span>
                  </div>
                  <div className="text-[10px] font-bold text-white mt-0.5 truncate">Óptimo</div>
                </div>
              </div>
            </PreviewBlock>

            <div className="grid grid-cols-1 gap-1.5">
              <PreviewBlock
                sectionKey="dash_dual_quick_core"
                title="4 Tarjetas Rápidas (Temp, Hum, CO, PM2.5)"
                diff={getDiff('dash_dual_quick_core')}
                showRemoved={showRemoved}
                onToggle={onToggleSection}
                compact
              >
                <div className="grid grid-cols-4 gap-1 tabular-nums">
                  {[
                    { k: 'Temp', v: '21 °C' },
                    { k: 'Hum', v: '48 %' },
                    { k: 'CO', v: '12 ADC' },
                    { k: 'PM2.5', v: '18 µg/m³' },
                  ].map((item) => (
                    <div
                      key={item.k}
                      className="rounded bg-slate-950/90 border border-slate-800 px-1.5 py-1 text-center"
                    >
                      <div className="text-[9px] text-slate-400">{item.k}</div>
                      <div className="text-[10px] font-bold text-slate-100">{item.v}</div>
                    </div>
                  ))}
                </div>
              </PreviewBlock>

              <PreviewBlock
                sectionKey="dash_dual_battery_airflow"
                title="Batería IoT y Flujo de Ventilación"
                diff={getDiff('dash_dual_battery_airflow')}
                showRemoved={showRemoved}
                onToggle={onToggleSection}
                compact
              >
                <div className="grid grid-cols-2 gap-1.5 tabular-nums">
                  <div className="rounded bg-slate-950/90 border border-slate-800 px-2 py-1 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                      <BatteryCharging className="w-3 h-3 text-emerald-400" />
                      Batería IoT
                    </span>
                    <span className="text-[10px] font-bold text-emerald-300">94 %</span>
                  </div>
                  <div className="rounded bg-slate-950/90 border border-slate-800 px-2 py-1 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                      <Wind className="w-3 h-3 text-cyan-400" />
                      Ventilación
                    </span>
                    <span className="text-[10px] font-bold text-cyan-300">1.8 m/s</span>
                  </div>
                </div>
              </PreviewBlock>

              <PreviewBlock
                sectionKey="dash_dual_o2_noise"
                title="Oxígeno (O₂) y Ruido Acústico (dB)"
                diff={getDiff('dash_dual_o2_noise')}
                showRemoved={showRemoved}
                onToggle={onToggleSection}
                compact
              >
                <div className="grid grid-cols-2 gap-1.5 tabular-nums">
                  <div className="rounded bg-slate-950/90 border border-slate-800 px-2 py-1 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">Oxígeno O₂</span>
                    <span className="text-[10px] font-bold text-emerald-300">20.8 %</span>
                  </div>
                  <div className="rounded bg-slate-950/90 border border-slate-800 px-2 py-1 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                      <Volume2 className="w-3 h-3 text-slate-400" />
                      Ruido
                    </span>
                    <span className="text-[10px] font-bold text-slate-200">74 dB</span>
                  </div>
                </div>
              </PreviewBlock>
            </div>
          </div>
        )}

        {/* Sector Chart + Users Panel */}
        {showSectorAndUsersRow && (
          <div className={`grid gap-2 ${chartExpanded ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-12'}`}>
            <div className={chartExpanded ? '' : 'sm:col-span-7'}>
              <PreviewBlock
                sectionKey="dash_sector_chart"
                title="Gráfico Atmosférico por Sector"
                diff={getDiff('dash_sector_chart')}
                showRemoved={showRemoved}
                onToggle={onToggleSection}
                compact
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span className="inline-flex items-center gap-1 font-medium text-slate-200">
                      <BarChart3 className="w-3 h-3 text-cyan-400" />
                      Promedios ({barsToRender.length} variables)
                    </span>
                    <span className="text-[9px] text-slate-500">DS 132</span>
                  </div>

                  <div
                    className={`grid gap-1 items-end h-14 px-1.5 py-1 rounded bg-slate-950/90 border border-slate-800/80 ${
                      extendedVars ? 'grid-cols-9' : 'grid-cols-5'
                    }`}
                  >
                    {barsToRender.map((b) => (
                      <div key={b.label} className="flex flex-col items-center justify-end h-full gap-0.5">
                        <div className="w-full max-w-[14px] flex-1 bg-slate-900 rounded-sm overflow-hidden flex items-end">
                          <div className={`w-full ${b.color} rounded-t-sm`} style={{ height: b.pct }} />
                        </div>
                        <span className="text-[8px] text-slate-400 truncate max-w-full">
                          {b.label}
                        </span>
                      </div>
                    ))}
                  </div>

                  <PreviewBlock
                    sectionKey="dash_sector_chart_extended"
                    title="Variables Extendidas (O₂, Vent, Ruido) y Nodo Individual"
                    diff={getDiff('dash_sector_chart_extended')}
                    showRemoved={showRemoved}
                    onToggle={onToggleSection}
                    compact
                  >
                    <div className="flex items-center justify-between text-[10px] text-slate-300">
                      <span>CH4 · O₂ · Ventilación · Ruido</span>
                      <span className="text-purple-300 font-medium">Nodo Individual</span>
                    </div>
                  </PreviewBlock>
                </div>
              </PreviewBlock>
            </div>

            {(!chartExpanded || showRemoved) && (
              <div className={chartExpanded ? '' : 'sm:col-span-5'}>
                <PreviewBlock
                  sectionKey="dash_users_panel"
                  title="Panel Usuarios del Sistema"
                  diff={getDiff('dash_users_panel')}
                  showRemoved={showRemoved}
                  onToggle={onToggleSection}
                  compact
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] text-slate-300 tabular-nums">
                      <span className="inline-flex items-center gap-1 font-medium">
                        <Users className="w-3 h-3 text-purple-400" />
                        Directorio
                      </span>
                      <span className="text-slate-400">{usersCount}</span>
                    </div>
                    <div className="space-y-1">
                      {['Supervisor Turno A', 'Operador Galería 6'].map((u) => (
                        <div
                          key={u}
                          className="rounded bg-slate-950/80 border border-slate-800 px-2 py-1 text-[10px] text-slate-300 truncate"
                        >
                          {u}
                        </div>
                      ))}
                    </div>
                  </div>
                </PreviewBlock>
              </div>
            )}
          </div>
        )}

        {/* Gateways ESP32 + Hardware Controls */}
        <PreviewBlock
          sectionKey="dash_gateway_section"
          title="Gateways por Sector y Control de Alarma"
          diff={getDiff('dash_gateway_section')}
          showRemoved={showRemoved}
          onToggle={onToggleSection}
          compact
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded bg-slate-950/80 border border-slate-800 px-2.5 py-1.5 text-[10px]">
              <span className="inline-flex items-center gap-1.5 text-slate-200 font-medium truncate">
                <Radio className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="truncate">{deviceName}</span>
              </span>
              <span className="text-emerald-400 font-semibold shrink-0">En línea</span>
            </div>

            <PreviewBlock
              sectionKey="dash_gateway_hw_controls"
              title="Controles Técnicos ESP32 e IP Hardware"
              diff={getDiff('dash_gateway_hw_controls')}
              showRemoved={showRemoved}
              onToggle={onToggleSection}
              compact
            >
              <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10px] text-slate-300">
                <span className="inline-flex items-center gap-1 font-mono text-slate-400">
                  <Power className="w-3 h-3 text-amber-400" />
                  Luz · Reset GW · IP local
                </span>
                <span className="font-mono text-[9px] text-slate-500">192.168.1.40</span>
              </div>
            </PreviewBlock>
          </div>
        </PreviewBlock>
        {!gatewayVisible && showRemoved && (
          <div className="text-[10px] text-slate-500 px-1">
            Al ocultar Gateways por Sector también se ocultan sus controles técnicos ESP32.
          </div>
        )}

        {/* Capabilities Grid */}
        <PreviewBlock
          sectionKey="dash_capabilities_grid"
          title="Grilla Capacidades Clave — Seguridad en Faena"
          diff={getDiff('dash_capabilities_grid')}
          showRemoved={showRemoved}
          onToggle={onToggleSection}
          compact
        >
          <div className="grid grid-cols-4 gap-1 text-center text-[9px] text-slate-300">
            {['Gases', 'Alertas', 'Reportes', '3D IoT'].map((cap) => (
              <div
                key={cap}
                className="rounded bg-slate-950/80 border border-slate-800 py-1.5 px-1 truncate"
              >
                {cap}
              </div>
            ))}
          </div>
        </PreviewBlock>

        {/* Footer Alerts */}
        <PreviewBlock
          sectionKey="dash_footer_alerts"
          title="Listado Incidencias y Alertas Activas al Pie"
          diff={getDiff('dash_footer_alerts')}
          showRemoved={showRemoved}
          onToggle={onToggleSection}
          compact
        >
          <div className="flex items-center justify-between rounded bg-slate-950/80 border border-slate-800 px-2.5 py-1.5 text-[10px]">
            <span className="inline-flex items-center gap-1.5 text-amber-300 truncate">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              <span className="truncate">Incidencias activas en faena ({alertsCount})</span>
            </span>
            <span className="text-slate-400 shrink-0">Reconocer</span>
          </div>
        </PreviewBlock>
      </div>
    );
  };

  const renderMonitoreoPreview = () => (
    <div className="space-y-2.5">
      <PreviewBlock
        sectionKey="mon_filters_bar"
        title="Barra de Filtros Jerárquicos"
        diff={getDiff('mon_filters_bar')}
        showRemoved={showRemoved}
        onToggle={onToggleSection}
        compact
      >
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
          <Filter className="w-3 h-3 text-cyan-400 shrink-0" />
          <span>Organización · Faena · Cuadrilla · Sector · Estado</span>
        </div>
      </PreviewBlock>

      {/* Base Always-Visible Sensor Grid */}
      <div className="rounded-lg border border-slate-800/90 bg-slate-900/50 p-2.5 space-y-1.5">
        <div className="flex items-center justify-between text-[10px]">
          <span className="font-semibold text-slate-200 inline-flex items-center gap-1.5">
            <Activity className="w-3 h-3 text-emerald-400" />
            Lecturas en Vivo por Sensor (base fija)
          </span>
          <span className="text-slate-500 font-mono">{deviceName}</span>
        </div>
        <div className="grid grid-cols-4 gap-1.5 tabular-nums">
          {[
            { k: 'Temp', v: '21 °C' },
            { k: 'Humedad', v: '48 %' },
            { k: 'CO MQ-2', v: '12 ADC' },
            { k: 'PM2.5', v: '18 µg/m³' },
          ].map((s) => (
            <div key={s.k} className="rounded bg-slate-950 border border-slate-800 p-1.5 text-center">
              <div className="text-[9px] text-slate-400">{s.k}</div>
              <div className="text-[10px] font-bold text-white">{s.v}</div>
            </div>
          ))}
        </div>
      </div>

      <PreviewBlock
        sectionKey="mon_tech_diagnostics"
        title="Diagnóstico Técnico y Metadatos RTDB"
        diff={getDiff('mon_tech_diagnostics')}
        showRemoved={showRemoved}
        onToggle={onToggleSection}
        compact
      >
        <div className="grid grid-cols-3 gap-1.5 text-[10px] text-slate-300 tabular-nums">
          <div className="rounded bg-slate-950 border border-slate-800 px-2 py-1 truncate">
            ID: <span className="font-mono text-cyan-300">ESP32-F84</span>
          </div>
          <div className="rounded bg-slate-950 border border-slate-800 px-2 py-1">O₂: 20.8%</div>
          <div className="rounded bg-slate-950 border border-slate-800 px-2 py-1">Ruido: 74 dB</div>
        </div>
      </PreviewBlock>

      <PreviewBlock
        sectionKey="mon_simulation_controls"
        title="Pruebas de Validación Operativa (Simulación)"
        diff={getDiff('mon_simulation_controls')}
        showRemoved={showRemoved}
        onToggle={onToggleSection}
        compact
      >
        <div className="flex items-center gap-2 text-[10px]">
          <span className="rounded bg-amber-950/60 border border-amber-800/60 px-2 py-1 text-amber-300 font-medium">
            Simular Alza CO
          </span>
          <span className="rounded bg-slate-950 border border-slate-700 px-2 py-1 text-slate-300">
            Restablecer Nominales
          </span>
        </div>
      </PreviewBlock>
    </div>
  );

  const renderAlertasPreview = () => (
    <div className="space-y-2.5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <PreviewBlock
          sectionKey="alerts_audit_subtab"
          title="Pestaña Auditoría y Registro RTDB"
          diff={getDiff('alerts_audit_subtab')}
          showRemoved={showRemoved}
          onToggle={onToggleSection}
          compact
        >
          <div className="text-[10px] text-cyan-300 font-medium">
            Incidencias Activas · Auditoría /registro_alarmas
          </div>
        </PreviewBlock>

        <PreviewBlock
          sectionKey="alerts_siren_test"
          title="Botón Probar Sirena Acústica"
          diff={getDiff('alerts_siren_test')}
          showRemoved={showRemoved}
          onToggle={onToggleSection}
          compact
        >
          <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-rose-300">
            <Volume2 className="w-3 h-3" />
            <span>Probar Sirena</span>
          </div>
        </PreviewBlock>
      </div>

      <PreviewBlock
        sectionKey="alerts_summary_cards"
        title="Tarjetas Resumen de Severidad"
        diff={getDiff('alerts_summary_cards')}
        showRemoved={showRemoved}
        onToggle={onToggleSection}
        compact
      >
        <div className="grid grid-cols-3 gap-1.5 tabular-nums text-center">
          <div className="rounded bg-slate-950 border border-slate-800 py-1.5">
            <div className="text-[9px] text-slate-400">Activas</div>
            <div className="text-xs font-bold text-white">{alertsCount}</div>
          </div>
          <div className="rounded bg-rose-950/30 border border-rose-800/50 py-1.5">
            <div className="text-[9px] text-rose-300">Críticas</div>
            <div className="text-xs font-bold text-rose-400">1</div>
          </div>
          <div className="rounded bg-amber-950/30 border border-amber-800/50 py-1.5">
            <div className="text-[9px] text-amber-300">Advertencia</div>
            <div className="text-xs font-bold text-amber-400">3</div>
          </div>
        </div>
      </PreviewBlock>

      <PreviewBlock
        sectionKey="alerts_filters_bar"
        title="Barra de Búsqueda y Filtros"
        diff={getDiff('alerts_filters_bar')}
        showRemoved={showRemoved}
        onToggle={onToggleSection}
        compact
      >
        <div className="text-[10px] text-slate-400">
          Buscar sector/variable · Rango temporal · Severidad · Estado
        </div>
      </PreviewBlock>

      <div className="rounded-lg border border-slate-800/90 bg-slate-900/50 p-2.5 space-y-1">
        <div className="text-[10px] font-semibold text-slate-200">
          Listado de Alertas Activas (base fija)
        </div>
        <div className="text-[10px] text-slate-400">
          Muestra incidencias vigentes según el rol ({previewSubject.role === 'operador' ? 'solo lectura' : 'con reconocimiento y cierre'}).
        </div>
      </div>
    </div>
  );

  const renderConfigUmbralesPreview = () => (
    <div className="space-y-2.5">
      <PreviewBlock
        sectionKey="cfg_scope_actions"
        title="Selector de Ámbito y Botones Guardar / Restaurar"
        diff={getDiff('cfg_scope_actions')}
        showRemoved={showRemoved}
        onToggle={onToggleSection}
        compact
      >
        <div className="flex items-center justify-between gap-2 text-[10px]">
          <span className="text-slate-300 truncate">Equipo: {deviceName}</span>
          <span className="inline-flex items-center gap-1.5 text-cyan-300 font-semibold shrink-0">
            <SlidersHorizontal className="w-3 h-3" />
            Guardar · Fábrica
          </span>
        </div>
      </PreviewBlock>

      <div className="rounded-lg border border-slate-800/90 bg-slate-900/50 p-2.5 space-y-1.5">
        <div className="text-[10px] font-semibold text-slate-200">
          Tarjetas de Umbrales Normativos DS 132 (base fija)
        </div>
        <div className="grid grid-cols-3 gap-1.5 text-[10px] tabular-nums text-slate-300">
          <div className="rounded bg-slate-950 border border-slate-800 px-2 py-1">CO · 25 / 50</div>
          <div className="rounded bg-slate-950 border border-slate-800 px-2 py-1">PM2.5 · 50 / 150</div>
          <div className="rounded bg-slate-950 border border-slate-800 px-2 py-1">O₂ · mín 19.5%</div>
        </div>
      </div>

      <PreviewBlock
        sectionKey="cfg_events_table"
        title="Tabla de Eventos de Umbrales Registrados"
        diff={getDiff('cfg_events_table')}
        showRemoved={showRemoved}
        onToggle={onToggleSection}
        compact
      >
        <div className="text-[10px] text-slate-400">
          Bitácora histórica de superaciones y recuperaciones de umbrales.
        </div>
      </PreviewBlock>
    </div>
  );

  const renderReportesPreview = () => (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between rounded-lg border border-slate-800/90 bg-slate-900/50 px-3 py-2">
        <div className="text-[11px] font-semibold text-white">
          Historial y Reportes Normativos (base fija)
        </div>
        <span className="text-[10px] text-slate-400">DS 132</span>
      </div>

      <PreviewBlock
        sectionKey="rep_export_csv"
        title='Botón "Exportar Datos CSV"'
        diff={getDiff('rep_export_csv')}
        showRemoved={showRemoved}
        onToggle={onToggleSection}
        compact
      >
        <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-emerald-300">
          <Download className="w-3 h-3" />
          <span>Exportar Datos CSV (series históricas DS 132)</span>
        </div>
      </PreviewBlock>

      <PreviewBlock
        sectionKey="rep_chart_card"
        title="Gráfico de Evolución Temporal y Estadísticas"
        diff={getDiff('rep_chart_card')}
        showRemoved={showRemoved}
        onToggle={onToggleSection}
        compact
      >
        <div className="space-y-1.5">
          <div className="grid grid-cols-3 gap-1.5 text-[10px] tabular-nums text-center">
            <div className="rounded bg-slate-950 border border-slate-800 py-1 text-slate-300">Mín: 18</div>
            <div className="rounded bg-slate-950 border border-slate-800 py-1 text-cyan-300">Prom: 22</div>
            <div className="rounded bg-slate-950 border border-slate-800 py-1 text-amber-300">Máx: 31</div>
          </div>
          <div className="h-8 rounded bg-slate-950 border border-slate-800/80 flex items-end gap-1 px-2 py-1">
            {[30, 45, 40, 62, 55, 70, 52, 48].map((h, i) => (
              <div key={i} className="flex-1 bg-cyan-500/70 rounded-t-sm" style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
      </PreviewBlock>

      <PreviewBlock
        sectionKey="rep_audit_table"
        title="Bitácora de Inspección y Eventos (DS 132)"
        diff={getDiff('rep_audit_table')}
        showRemoved={showRemoved}
        onToggle={onToggleSection}
        compact
      >
        <div className="text-[10px] text-slate-400">
          Fecha · Variable · Sector · Valor medido · Dictamen normativo
        </div>
      </PreviewBlock>
    </div>
  );

  const renderEquiposPreview = () => (
    <div className="space-y-2.5">
      <PreviewBlock
        sectionKey="eq_header_kpis"
        title="Cabecera y Resumen Operativo de Equipos"
        diff={getDiff('eq_header_kpis')}
        showRemoved={showRemoved}
        onToggle={onToggleSection}
        compact
      >
        <div className="flex items-center justify-between text-[10px] tabular-nums">
          <span className="inline-flex items-center gap-1.5 text-slate-200 font-medium">
            <Wrench className="w-3 h-3 text-cyan-400" />
            Equipos y Arriendos
          </span>
          <span className="text-slate-400">{devicesCount} equipos registrados</span>
        </div>
      </PreviewBlock>

      <PreviewBlock
        sectionKey="eq_subtab_bar"
        title="Selector de Sub-ventanas de Equipos"
        diff={getDiff('eq_subtab_bar')}
        showRemoved={showRemoved}
        onToggle={onToggleSection}
        compact
      >
        <div className="flex flex-wrap gap-1 text-[9px] text-slate-300">
          {['Asignaciones', 'Arriendos', 'Pagos', 'Inventario', 'Dispositivos', 'Empresas'].map(
            (t) => (
              <span key={t} className="rounded bg-slate-950 border border-slate-800 px-1.5 py-0.5">
                {t}
              </span>
            )
          )}
        </div>
      </PreviewBlock>

      <div className="rounded-lg border border-slate-800/90 bg-slate-900/50 p-2.5 text-[10px] text-slate-400">
        Contenido principal de la sub-ventana activa (tabla de inventario, contratos o dispositivos).
      </div>
    </div>
  );

  const renderFaenasPreview = () => (
    <div className="space-y-2.5">
      <div className="rounded-lg border border-slate-800/90 bg-slate-900/50 px-3 py-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white truncate">
          <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="truncate">{siteName}</span>
        </span>
        <span className="text-[10px] text-slate-400 shrink-0">Ficha base</span>
      </div>

      <PreviewBlock
        sectionKey="faenas_sector_cards"
        title="Tarjetas de Sectores y Ventilación"
        diff={getDiff('faenas_sector_cards')}
        showRemoved={showRemoved}
        onToggle={onToggleSection}
        compact
      >
        <div className="grid grid-cols-2 gap-1.5 text-[10px] text-slate-300">
          <div className="rounded bg-slate-950 border border-slate-800 px-2 py-1.5">
            <div className="font-semibold text-white">Rampa Principal</div>
            <div className="text-[9px] text-slate-400">Prof. -320m · Vent. Activa</div>
          </div>
          <div className="rounded bg-slate-950 border border-slate-800 px-2 py-1.5">
            <div className="font-semibold text-white">Nivel Subterráneo 6</div>
            <div className="text-[9px] text-slate-400">Prof. -420m · Sensores OK</div>
          </div>
        </div>
      </PreviewBlock>

      <PreviewBlock
        sectionKey="faenas_crews_section"
        title="Sección de Cuadrillas y Turnos en Faena"
        diff={getDiff('faenas_crews_section')}
        showRemoved={showRemoved}
        onToggle={onToggleSection}
        compact
      >
        <div className="flex items-center justify-between text-[10px] text-slate-300">
          <span className="inline-flex items-center gap-1.5">
            <Layers className="w-3 h-3 text-purple-400" />
            Cuadrilla Turno A · Turno B
          </span>
          <span className="text-slate-400 tabular-nums">{usersCount} operarios</span>
        </div>
      </PreviewBlock>
    </div>
  );

  const renderVisor3DPreview = () => {
    const panelVisible = isVis('v3d_telemetry_panel');
    const canvasFull = !panelVisible && !showRemoved;
    return (
      <div className={`grid gap-2 ${canvasFull ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-12'}`}>
        <div
          className={`${
            canvasFull ? '' : 'sm:col-span-7'
          } rounded-lg border border-slate-800 bg-slate-950 p-4 flex flex-col items-center justify-center text-center min-h-[140px]`}
        >
          <Box className="w-7 h-7 text-orange-400 mb-1.5" />
          <div className="text-xs font-semibold text-white">Lienzo 3D Interactivo</div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            Modelo 3D del Nodo / Gateway ESP32 (siempre visible)
          </div>
        </div>

        {(!canvasFull || showRemoved) && (
          <div className={canvasFull ? '' : 'sm:col-span-5'}>
            <PreviewBlock
              sectionKey="v3d_telemetry_panel"
              title="Panel Lateral de Telemetría 3D"
              diff={getDiff('v3d_telemetry_panel')}
              showRemoved={showRemoved}
              onToggle={onToggleSection}
              compact
              className="h-full"
            >
              <div className="space-y-1.5 text-[10px] text-slate-300 tabular-nums">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 text-slate-400">
                    <Cpu className="w-3 h-3 text-cyan-400" />
                    ESP32
                  </span>
                  <span className="text-emerald-400 font-semibold">Activo</span>
                </div>
                <div className="rounded bg-slate-950 border border-slate-800 px-2 py-1">
                  CO: 12 ADC · PM2.5: 18
                </div>
                <div className="rounded bg-slate-950 border border-slate-800 px-2 py-1">
                  Temp: 21°C · Hum: 48%
                </div>
              </div>
            </PreviewBlock>
          </div>
        )}
      </div>
    );
  };

  const renderWindowBody = () => {
    switch (activeWindow) {
      case 'dashboard':
        return renderDashboardPreview();
      case 'monitoreo':
        return renderMonitoreoPreview();
      case 'alertas':
        return renderAlertasPreview();
      case 'configuracion_alertas':
        return renderConfigUmbralesPreview();
      case 'reportes':
        return renderReportesPreview();
      case 'equipos':
        return renderEquiposPreview();
      case 'faenas':
        return renderFaenasPreview();
      case 'visor_3d':
        return renderVisor3DPreview();
      default:
        return renderDashboardPreview();
    }
  };

  return (
    <div className="rounded-xl bg-slate-900/95 border border-slate-800 overflow-hidden flex flex-col">
      {/* Preview Top Bar */}
      <div className="px-4 py-3.5 bg-slate-950/90 border-b border-slate-800 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-800/70 flex items-center justify-center text-cyan-300 shrink-0">
              <Monitor className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-white leading-tight">
                Vista Previa en Vivo
              </h2>
              <p className="text-[11px] text-slate-400 truncate mt-0.5">
                {previewModeContext === 'role'
                  ? `Vista general · Rol: ${previewSubjectLabel}`
                  : `Usuario: ${previewSubjectLabel}`}
              </p>
            </div>
          </div>

          {/* Toggle Final vs Compare (Show Removed) */}
          <div className="inline-flex items-center gap-1 p-0.5 bg-slate-900 rounded-lg border border-slate-800 shrink-0">
            <button
              type="button"
              onClick={() => setPreviewDisplayMode('compare')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                previewDisplayMode === 'compare'
                  ? 'bg-cyan-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Muestra bloques visibles y los bloques quitados/ocultos para restaurarlos fácilmente"
            >
              Ver quitados
            </button>
            <button
              type="button"
              onClick={() => setPreviewDisplayMode('final')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                previewDisplayMode === 'final'
                  ? 'bg-cyan-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Muestra exactamente cómo verá la pantalla el usuario final"
            >
              Vista final
            </button>
          </div>
        </div>

        {/* Role Selector (only in general / role mode) */}
        {previewModeContext === 'role' && onSelectPreviewRole && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
            <span className="text-[11px] text-slate-400 font-medium">Previsualizar rol:</span>
            <div className="inline-flex items-center gap-1 p-0.5 bg-slate-900 rounded-lg border border-slate-800">
              {PREVIEW_ROLE_OPTIONS.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => onSelectPreviewRole(r.key)}
                  className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    previewRole === r.key
                      ? 'bg-slate-800 text-cyan-300 border border-cyan-700/60'
                      : 'text-slate-400 hover:text-white border border-transparent'
                  }`}
                >
                  {r.shortLabel}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Window Switcher inside Preview when parent filter is "Todas las Ventanas" */}
        {showWindowSwitcher && onChangeWindow && (
          <div className="flex items-center gap-1 overflow-x-auto pt-2 border-t border-slate-800/80 pb-0.5">
            {PREVIEW_WINDOWS.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => onChangeWindow(w.id)}
                className={`px-2 py-1 rounded-md text-[10px] font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  activeWindow === w.id
                    ? 'bg-slate-800 text-cyan-300 border border-cyan-700/60'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
        )}

        {/* Live Counters & Diff Summary (Tabular Numerals, Unboxed) */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400 tabular-nums pt-1">
          <span className="text-emerald-300 font-semibold">
            {diffSummary.visibleCount} / {diffSummary.totalCount} visibles
          </span>
          <span aria-hidden="true">·</span>
          <span className={diffSummary.hiddenCount > 0 ? 'text-slate-300' : 'text-slate-500'}>
            {diffSummary.hiddenCount} oculto{diffSummary.hiddenCount === 1 ? '' : 's'}
          </span>
          {diffSummary.addedKeys.length > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-emerald-400 font-semibold">
                +{diffSummary.addedKeys.length} agregado{diffSummary.addedKeys.length === 1 ? '' : 's'}
              </span>
            </>
          )}
          {diffSummary.removedKeys.length > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-rose-400 font-semibold">
                -{diffSummary.removedKeys.length} quitado{diffSummary.removedKeys.length === 1 ? '' : 's'}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Control Maestro Window-Level Access Warning */}
      {!isParentWindowAccessible && (
        <div className="px-4 py-2.5 bg-amber-950/40 border-b border-amber-800/60 flex items-start gap-2 text-[11px] text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            La ventana <strong>{windowMeta.label}</strong> está bloqueada actualmente en{' '}
            <strong>Control Maestro</strong> para este{' '}
            {previewModeContext === 'role' ? 'rol' : 'usuario'}. Esta vista previa muestra cómo se
            verá una vez que la habilites.
          </span>
        </div>
      )}

      {/* Simulated MineSafe Viewport */}
      <div className="p-3.5 bg-slate-950/70 space-y-3">
        {/* Mini App Header Chrome */}
        <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Shield className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="text-[11px] font-bold text-white truncate">
              MineSafe · {windowMeta.label}
            </span>
          </div>
          <span className="text-[10px] font-mono text-slate-400 truncate max-w-[160px]">
            {previewSubject.roleLabel || previewSubject.role}
          </span>
        </div>

        {/* Empty state when everything configurable is hidden in Vista Final */}
        {!showRemoved && diffSummary.visibleCount === 0 && (
          <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/50 p-4 text-center space-y-2">
            <EyeOff className="w-5 h-5 text-slate-500 mx-auto" />
            <div className="text-xs font-semibold text-slate-300">
              Todos los bloques opcionales están ocultos
            </div>
            <p className="text-[11px] text-slate-400">
              El usuario solo verá la estructura base de {windowMeta.label}. Cambia a "Ver quitados"
              para inspeccionar y restaurar bloques.
            </p>
          </div>
        )}

        {/* Window Schematic Content */}
        {renderWindowBody()}
      </div>

      {/* Bottom Interactive Audit Strip: Removed / Added / Hidden Quick Restore */}
      {(diffSummary.removedKeys.length > 0 ||
        diffSummary.addedKeys.length > 0 ||
        diffSummary.hiddenKeys.length > 0) && (
        <div className="px-4 py-3 bg-slate-950/90 border-t border-slate-800 space-y-2.5">
          {diffSummary.removedKeys.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-rose-400">
                Quitados en este borrador ({diffSummary.removedKeys.length})
              </div>
              <div className="space-y-1">
                {diffSummary.removedKeys.map((key) => (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-2 text-[11px] text-slate-300"
                  >
                    <span className="truncate line-through text-rose-200/80">
                      {sectionLabelByKey[key] || key}
                    </span>
                    <button
                      type="button"
                      onClick={() => onToggleSection(key)}
                      className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-300 hover:text-emerald-200 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Deshacer</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {diffSummary.addedKeys.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                Agregados en este borrador ({diffSummary.addedKeys.length})
              </div>
              <div className="space-y-1">
                {diffSummary.addedKeys.map((key) => (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-2 text-[11px] text-emerald-200"
                  >
                    <span className="truncate">+ {sectionLabelByKey[key] || key}</span>
                    <button
                      type="button"
                      onClick={() => onToggleSection(key)}
                      className="text-[10px] font-semibold text-slate-400 hover:text-rose-300 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Quitar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {diffSummary.removedKeys.length === 0 && diffSummary.hiddenKeys.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Bloques ocultos en {windowMeta.label} ({diffSummary.hiddenKeys.length})
              </div>
              <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                {diffSummary.hiddenKeys.map((key) => (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-2 text-[11px] text-slate-400"
                  >
                    <span className="truncate">{sectionLabelByKey[key] || key}</span>
                    <button
                      type="button"
                      onClick={() => onToggleSection(key)}
                      className="text-[10px] font-semibold text-cyan-300 hover:text-cyan-200 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Mostrar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
