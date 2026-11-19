import React, { useMemo, useState } from 'react';
import {
  Crown,
  Shield,
  HardHat,
  Activity,
  Cpu,
  BarChart3,
  Flame,
  Wind,
  Droplets,
  Thermometer,
  Layers,
  Zap,
  ShieldCheck,
  Eye,
  MapPin,
  Building2,
  IdCard,
  Filter,
  Users,
  Search,
  ChevronRight,
  Bell,
  Volume2,
  HeartPulse,
  X,
  Mail,
  Briefcase,
  Clock,
} from 'lucide-react';
import {
  MiningCrew,
  MiningSite,
  Organization,
  PlatformConfig,
  SensorDevice,
  TelemetryHistoryPoint,
  UserProfile,
  UserRole,
} from '../types';
import { isGlobalMineSafeAdmin } from '../utils/accessControl';

interface InteractiveDeviceChartAndUsersProps {
  currentUser?: UserProfile | null;
  usersList?: UserProfile[];
  devices: SensorDevice[];
  activeDeviceId?: string;
  onSelectDevice?: (deviceId: string) => void;
  onSelectUser?: (user: UserProfile) => void;
  onChangeUserModal?: () => void;
  activeAlertCount?: number;
  platformConfig?: PlatformConfig;
  telemetryHistory?: TelemetryHistoryPoint[];
  siteName?: string;
  betweenWelcomeAndChart?: React.ReactNode;
  canViewSystemUsers?: boolean;
  sites?: MiningSite[];
  crews?: MiningCrew[];
  organizations?: Organization[];
  activeOrganizationId?: string;
  onSelectOrganization?: (orgId: string) => void;
}

export const InteractiveDeviceChartAndUsers: React.FC<InteractiveDeviceChartAndUsersProps> = ({
  currentUser,
  usersList = [],
  devices,
  activeDeviceId,
  onSelectDevice,
  onSelectUser,
  onChangeUserModal,
  activeAlertCount = 0,
  platformConfig,
  telemetryHistory = [],
  siteName,
  betweenWelcomeAndChart,
  canViewSystemUsers,
  sites = [],
  organizations = [],
  activeOrganizationId = 'all',
  onSelectOrganization,
}) => {
  const [chartViewMode, setChartViewMode] = useState<'all_bars' | 'levels' | 'timeline'>('all_bars');
  const [timelineGroup, setTimelineGroup] = useState<'gases' | 'clima' | 'seguridad' | 'todos'>('gases');
  const [hoveredSensorId, setHoveredSensorId] = useState<string | null>(null);
  const [selectedSiteFilter, setSelectedSiteFilter] = useState<string>('all');
  const [selectedSectorFilter, setSelectedSectorFilter] = useState<string>('all');
  const [superAdminSingleNodeMode, setSuperAdminSingleNodeMode] = useState<boolean>(false);
  const [userSearchQuery, setUserSearchQuery] = useState<string>('');
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | UserRole>('all');
  const [inspectedUser, setInspectedUser] = useState<UserProfile | null>(null);

  const isSuperAdmin = currentUser?.role === 'superadmin';
  const isGlobalAdmin = isGlobalMineSafeAdmin(currentUser?.role);
  const isCompanyAdmin = currentUser?.role === 'admin';
  const isSupervisor = currentUser?.role === 'supervisor';
  const isOperador = currentUser?.role === 'operador';
  const showUsersPanel = isSuperAdmin && (canViewSystemUsers ?? true);

  const getRoleDetails = (role?: UserRole) => {
    switch (role) {
      case 'superadmin':
        return {
          label: 'Superadministrador',
          badgeText: 'ROL: SUPERADMIN',
          bg: 'bg-purple-950/90 border-purple-500/80 text-purple-200 shadow-purple-950/50',
          avatarBg: 'bg-gradient-to-br from-purple-600 to-indigo-800 text-white border-purple-400',
          icon: <Crown className="w-4 h-4 text-purple-300" />,
        };
      case 'admin_minesafe':
        return {
          label: 'Admin Corporativo MineSafe',
          badgeText: 'ROL: ADMIN MINESAFE',
          bg: 'bg-indigo-950/90 border-indigo-500/80 text-indigo-200 shadow-indigo-950/50',
          avatarBg: 'bg-gradient-to-br from-indigo-600 to-violet-800 text-white border-indigo-400',
          icon: <ShieldCheck className="w-4 h-4 text-indigo-300" />,
        };
      case 'admin':
        return {
          label: 'Administrador de Empresa',
          badgeText: 'ROL: ADMIN DE EMPRESA',
          bg: 'bg-cyan-950/90 border-cyan-500/80 text-cyan-200 shadow-cyan-950/50',
          avatarBg: 'bg-gradient-to-br from-cyan-600 to-blue-800 text-white border-cyan-400',
          icon: <Shield className="w-4 h-4 text-cyan-300" />,
        };
      case 'supervisor':
        return {
          label: 'Supervisor de Operaciones',
          badgeText: 'ROL: SUPERVISOR',
          bg: 'bg-emerald-950/90 border-emerald-500/80 text-emerald-200 shadow-emerald-950/50',
          avatarBg: 'bg-gradient-to-br from-emerald-600 to-teal-800 text-white border-emerald-400',
          icon: <Eye className="w-4 h-4 text-emerald-300" />,
        };
      case 'operador':
      default:
        return {
          label: 'Operador de Terreno',
          badgeText: 'ROL: OPERADOR',
          bg: 'bg-amber-950/90 border-amber-500/80 text-amber-200 shadow-amber-950/50',
          avatarBg: 'bg-gradient-to-br from-amber-600 to-orange-700 text-white border-amber-400',
          icon: <HardHat className="w-4 h-4 text-amber-300" />,
        };
    }
  };

  const userRoleInfo = getRoleDetails(currentUser?.role);

  // Derive available Faenas from sites prop + devices
  const availableSites = useMemo(() => {
    const map = new Map<string, string>();
    sites.forEach((s) => {
      if (s.id && s.name) map.set(s.id, s.name);
    });
    devices.forEach((d) => {
      const id = d.siteId || d.siteName;
      const name = d.siteName || d.siteId;
      if (id && name && !map.has(id)) {
        map.set(id, name);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [sites, devices]);

  // Role-filtered device pool before Sector/Faena selection
  const roleScopedDevices = useMemo(() => {
    if (isOperador) {
      const assigned = (currentUser?.assignedSector || '').trim().toLowerCase();
      if (assigned) {
        const matched = devices.filter(
          (d) => (d.sectorName || '').trim().toLowerCase() === assigned
        );
        if (matched.length > 0) return matched;
      }
      return devices.slice(0, 1);
    }

    if (isSupervisor) {
      const allowedSectors = new Set<string>();
      (currentUser?.assignedSectors || []).forEach((s) => {
        if (s.trim()) allowedSectors.add(s.trim().toLowerCase());
      });
      if (currentUser?.assignedSector?.trim()) {
        allowedSectors.add(currentUser.assignedSector.trim().toLowerCase());
      }
      if (allowedSectors.size > 0) {
        const matched = devices.filter((d) =>
          allowedSectors.has((d.sectorName || '').trim().toLowerCase())
        );
        if (matched.length > 0) return matched;
      }
    }

    return devices;
  }, [devices, isOperador, isSupervisor, currentUser]);

  // Available sectors for dropdown (filtered by selected Faena if applicable)
  const availableSectors = useMemo(() => {
    const set = new Set<string>();
    roleScopedDevices.forEach((d) => {
      if (
        selectedSiteFilter !== 'all' &&
        d.siteId !== selectedSiteFilter &&
        d.siteName !== selectedSiteFilter
      ) {
        return;
      }
      if (d.sectorName?.trim()) {
        set.add(d.sectorName.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [roleScopedDevices, selectedSiteFilter]);

  const effectiveSectorFilter =
    isOperador
      ? currentUser?.assignedSector || availableSectors[0] || 'all'
      : selectedSectorFilter !== 'all' && !availableSectors.includes(selectedSectorFilter)
      ? 'all'
      : selectedSectorFilter;

  // Devices contributing to the chart (or single node when SuperAdmin selects individual node mode)
  const activeSelectedDevice = useMemo(
    () => devices.find((d) => d.id === activeDeviceId) || roleScopedDevices[0] || devices[0],
    [devices, activeDeviceId, roleScopedDevices]
  );

  const chartDevices = useMemo(() => {
    if (isSuperAdmin && superAdminSingleNodeMode && activeSelectedDevice) {
      return [activeSelectedDevice];
    }
    return roleScopedDevices.filter((d) => {
      if (
        (isGlobalAdmin || isCompanyAdmin) &&
        selectedSiteFilter !== 'all' &&
        d.siteId !== selectedSiteFilter &&
        d.siteName !== selectedSiteFilter
      ) {
        return false;
      }
      if (
        effectiveSectorFilter !== 'all' &&
        (d.sectorName || '').trim().toLowerCase() !== effectiveSectorFilter.trim().toLowerCase()
      ) {
        return false;
      }
      return true;
    });
  }, [
    roleScopedDevices,
    isSuperAdmin,
    superAdminSingleNodeMode,
    activeSelectedDevice,
    isGlobalAdmin,
    isCompanyAdmin,
    selectedSiteFilter,
    effectiveSectorFilter,
  ]);

  // Node summary stats (real counts only)
  const totalNodesCount = roleScopedDevices.length;
  const onlineNodesCount = roleScopedDevices.filter((d) => d.status !== 'desconectado').length;

  // Aggregate REAL readings across chartDevices (sector/faena average or single node for SuperAdmin)
  const aggregatedMetrics = useMemo(() => {
    const avg = (values: number[]) =>
      values.length > 0 ? values.reduce((acc, v) => acc + v, 0) / values.length : null;

    const temps: number[] = [];
    const hums: number[] = [];
    const cos: number[] = [];
    const co2s: number[] = [];
    const pm25s: number[] = [];
    const ch4s: number[] = [];
    const o2s: number[] = [];
    const airFlows: number[] = [];
    const noises: number[] = [];

    let rawCOCount = 0;
    let rawPMCount = 0;
    let reportingNodes = 0;

    for (const dev of chartDevices) {
      const faults = new Set(dev.faultFields || []);
      let hasAnyReading = false;

      if (!faults.has('temperatura')) {
        const t = typeof dev.rawTemp === 'number' ? dev.rawTemp : dev.metrics?.temperatura;
        if (typeof t === 'number' && Number.isFinite(t)) {
          temps.push(t);
          hasAnyReading = true;
        }
      }
      if (!faults.has('humedad')) {
        const h = typeof dev.rawHum === 'number' ? dev.rawHum : dev.metrics?.humedad;
        if (typeof h === 'number' && Number.isFinite(h)) {
          hums.push(h);
          hasAnyReading = true;
        }
      }
      if (!faults.has('CO')) {
        if (typeof dev.rawCO === 'number' && Number.isFinite(dev.rawCO)) {
          cos.push(dev.rawCO);
          rawCOCount += 1;
          hasAnyReading = true;
        } else if (typeof dev.metrics?.co === 'number' && Number.isFinite(dev.metrics.co)) {
          cos.push(dev.metrics.co);
          hasAnyReading = true;
        }
      }
      if (typeof dev.metrics?.co2 === 'number' && Number.isFinite(dev.metrics.co2)) {
        co2s.push(dev.metrics.co2);
        hasAnyReading = true;
      }
      if (!faults.has('PM2_5')) {
        if (typeof dev.rawPM25 === 'number' && Number.isFinite(dev.rawPM25)) {
          pm25s.push(dev.rawPM25);
          rawPMCount += 1;
          hasAnyReading = true;
        } else if (typeof dev.metrics?.polvoPM === 'number' && Number.isFinite(dev.metrics.polvoPM)) {
          pm25s.push(dev.metrics.polvoPM);
          hasAnyReading = true;
        }
      }
      if (typeof dev.metrics?.ch4 === 'number' && Number.isFinite(dev.metrics.ch4)) {
        ch4s.push(dev.metrics.ch4);
        hasAnyReading = true;
      }
      if (typeof dev.metrics?.o2 === 'number' && Number.isFinite(dev.metrics.o2)) {
        o2s.push(dev.metrics.o2);
        hasAnyReading = true;
      }
      if (typeof dev.metrics?.flujoAire === 'number' && Number.isFinite(dev.metrics.flujoAire)) {
        airFlows.push(dev.metrics.flujoAire);
        hasAnyReading = true;
      }
      if (typeof dev.metrics?.ruido === 'number' && Number.isFinite(dev.metrics.ruido)) {
        noises.push(dev.metrics.ruido);
        hasAnyReading = true;
      }

      if (hasAnyReading) reportingNodes += 1;
    }

    return {
      temp: avg(temps),
      hum: avg(hums),
      co: avg(cos),
      co2: avg(co2s),
      pm25: avg(pm25s),
      ch4: avg(ch4s),
      o2: avg(o2s),
      flujoAire: avg(airFlows),
      ruido: avg(noises),
      isRawCO: rawCOCount > 0,
      isRawPM25: rawPMCount > 0,
      reportingNodes,
    };
  }, [chartDevices]);

  const pm = platformConfig?.metrics;
  const tempSafe = pm?.tempPreventivo ?? 28;
  const tempCrit = pm?.tempCritico ?? 32;
  const humSafe = pm?.humPreventivo ?? 70;
  const humCrit = pm?.humCritico ?? 85;
  const coSafe = aggregatedMetrics.isRawCO ? (pm?.coPreventivo ?? 300) : (pm?.coChartSafeMax ?? 50);
  const coCrit = aggregatedMetrics.isRawCO ? (pm?.coCritico ?? 1200) : coSafe * 2;
  const co2Safe = pm?.co2SafeMax ?? 1000;
  const co2Crit = pm?.co2CriticalMax ?? 2000;
  const pm25Safe = aggregatedMetrics.isRawPM25 ? (pm?.pm25Preventivo ?? 350) : (pm?.pm25ChartSafeMax ?? 50);
  const pm25Crit = aggregatedMetrics.isRawPM25 ? (pm?.pm25Critico ?? 1200) : pm25Safe * 3;
  const ch4Safe = pm?.ch4SafeMax ?? 1.5;
  const ch4Crit = pm?.ch4CriticalMax ?? 5.0;
  const o2MinSafe = pm?.o2MinSafe ?? 19.5;
  const airFlowMin = pm?.airFlowMin ?? 0.5;
  const airFlowMax = pm?.airFlowMax ?? 3.5;
  const noiseSafe = pm?.noiseSafeMax ?? 85;
  const noiseCrit = pm?.noiseCriticalMax ?? 95;

  const tempValue = aggregatedMetrics.temp ?? 0;
  const humValue = aggregatedMetrics.hum ?? 0;
  const coValue = aggregatedMetrics.co ?? 0;
  const co2Value = aggregatedMetrics.co2 ?? 0;
  const pm25Value = aggregatedMetrics.pm25 ?? 0;
  const ch4Value = aggregatedMetrics.ch4 ?? 0;
  const o2Value = aggregatedMetrics.o2 ?? 20.9;
  const airFlowValue = aggregatedMetrics.flujoAire ?? 0;
  const noiseValue = aggregatedMetrics.ruido ?? 0;

  // Strictly core atmospheric telemetry bars (CO, PM2.5, Temperatura, Humedad, CO2, CH4)
  const allSensorBars = [
    {
      id: 'temp',
      name: 'Temperatura',
      shortName: 'Temp',
      unit: '°C',
      hasData: aggregatedMetrics.temp !== null,
      value: Number(tempValue.toFixed(1)),
      safeMax: tempSafe,
      criticalMax: tempCrit,
      scaleMax: Math.max(40, tempCrit + 5),
      icon: <Thermometer className="w-4 h-4 text-cyan-400" />,
      gradient: 'from-cyan-500 to-blue-600',
      glowColor: 'shadow-cyan-500/30',
      badgeColor:
        aggregatedMetrics.temp === null
          ? 'bg-slate-900 text-slate-400 border-slate-700'
          : tempValue > tempCrit
          ? 'bg-rose-950 text-rose-300 border-rose-800'
          : tempValue > tempSafe
          ? 'bg-amber-950 text-amber-300 border-amber-800'
          : 'bg-cyan-950 text-cyan-300 border-cyan-800',
      textColor:
        aggregatedMetrics.temp === null
          ? 'text-slate-400'
          : tempValue > tempCrit
          ? 'text-rose-400'
          : tempValue > tempSafe
          ? 'text-amber-400'
          : 'text-cyan-400',
      status:
        aggregatedMetrics.temp === null
          ? 'Sin dato'
          : tempValue > tempCrit
          ? 'Calor'
          : tempValue > tempSafe
          ? 'Alerta'
          : 'Óptimo',
      norm: `DS 132: ${pm?.tempMin ?? 18}° - ${tempSafe}°C`,
    },
    {
      id: 'hum',
      name: 'Humedad',
      shortName: 'Humedad',
      unit: '%',
      hasData: aggregatedMetrics.hum !== null,
      value: Number(humValue.toFixed(1)),
      safeMax: humSafe,
      criticalMax: humCrit,
      scaleMax: 100,
      icon: <Droplets className="w-4 h-4 text-blue-400" />,
      gradient: 'from-blue-500 to-indigo-600',
      glowColor: 'shadow-blue-500/30',
      badgeColor:
        aggregatedMetrics.hum === null
          ? 'bg-slate-900 text-slate-400 border-slate-700'
          : humValue > humCrit
          ? 'bg-amber-950 text-amber-300 border-amber-800'
          : 'bg-blue-950 text-blue-300 border-blue-800',
      textColor:
        aggregatedMetrics.hum === null
          ? 'text-slate-400'
          : humValue > humCrit
          ? 'text-amber-400'
          : 'text-blue-400',
      status: aggregatedMetrics.hum === null ? 'Sin dato' : humValue > humCrit ? 'Elevada' : 'Normal',
      norm: `DS 132: ${pm?.humMin ?? 40}% - ${humSafe}%`,
    },
    {
      id: 'co',
      name: aggregatedMetrics.isRawCO ? 'Gas MQ-2 (ADC)' : 'Monóxido CO',
      shortName: 'CO (MQ2)',
      unit: aggregatedMetrics.isRawCO ? 'ADC' : 'ppm',
      hasData: aggregatedMetrics.co !== null,
      value: Number(coValue.toFixed(1)),
      safeMax: coSafe,
      criticalMax: coCrit,
      scaleMax: aggregatedMetrics.isRawCO ? Math.max(4095, coCrit) : Math.max(100, coCrit),
      icon: <Flame className="w-4 h-4 text-orange-400" />,
      gradient:
        coValue >= coCrit
          ? 'from-rose-600 to-red-500'
          : coValue >= coSafe
          ? 'from-amber-500 to-orange-500'
          : 'from-emerald-500 to-teal-500',
      glowColor: coValue >= coCrit ? 'shadow-rose-500/40' : 'shadow-orange-500/30',
      badgeColor:
        aggregatedMetrics.co === null
          ? 'bg-slate-900 text-slate-400 border-slate-700'
          : coValue >= coCrit
          ? 'bg-rose-950 text-rose-300 border-rose-800 animate-pulse'
          : coValue >= coSafe
          ? 'bg-amber-950 text-amber-300 border-amber-800'
          : 'bg-emerald-950 text-emerald-300 border-emerald-800',
      textColor:
        aggregatedMetrics.co === null
          ? 'text-slate-400'
          : coValue >= coCrit
          ? 'text-rose-400'
          : coValue >= coSafe
          ? 'text-amber-400'
          : 'text-emerald-400',
      status:
        aggregatedMetrics.co === null
          ? 'Sin dato'
          : coValue >= coCrit
          ? 'Peligro'
          : coValue >= coSafe
          ? 'Alerta'
          : 'Seguro',
      norm: aggregatedMetrics.isRawCO ? `Prev ≤ ${coSafe} ADC` : `DS 132: LPP ≤ ${coSafe} ppm`,
    },
    {
      id: 'co2',
      name: 'Dióxido CO2',
      shortName: 'CO2',
      unit: 'ppm',
      hasData: aggregatedMetrics.co2 !== null,
      value: Number(co2Value.toFixed(0)),
      safeMax: co2Safe,
      criticalMax: co2Crit,
      scaleMax: Math.max(2000, co2Crit),
      icon: <Wind className="w-4 h-4 text-emerald-400" />,
      gradient:
        co2Value > co2Crit * 0.75
          ? 'from-rose-500 to-red-600'
          : co2Value > co2Safe
          ? 'from-amber-500 to-yellow-600'
          : 'from-emerald-500 to-green-600',
      glowColor: 'shadow-emerald-500/30',
      badgeColor:
        aggregatedMetrics.co2 === null
          ? 'bg-slate-900 text-slate-400 border-slate-700'
          : co2Value > co2Crit * 0.75
          ? 'bg-rose-950 text-rose-300 border-rose-800'
          : co2Value > co2Safe
          ? 'bg-amber-950 text-amber-300 border-amber-800'
          : 'bg-emerald-950 text-emerald-300 border-emerald-800',
      textColor:
        aggregatedMetrics.co2 === null
          ? 'text-slate-400'
          : co2Value > co2Crit * 0.75
          ? 'text-rose-400'
          : co2Value > co2Safe
          ? 'text-amber-400'
          : 'text-emerald-400',
      status:
        aggregatedMetrics.co2 === null
          ? 'Sin dato'
          : co2Value > co2Crit * 0.75
          ? 'Elevado'
          : co2Value > co2Safe
          ? 'Atención'
          : 'Seguro',
      norm: `DS 132: LPP ≤ ${co2Safe} ppm`,
    },
    {
      id: 'pm25',
      name: aggregatedMetrics.isRawPM25 ? 'Polvo PM2.5 (ADC)' : 'Polvo en Suspensión',
      shortName: 'PM2.5',
      unit: aggregatedMetrics.isRawPM25 ? 'ADC' : 'µg/m³',
      hasData: aggregatedMetrics.pm25 !== null,
      value: Number(pm25Value.toFixed(1)),
      safeMax: pm25Safe,
      criticalMax: pm25Crit,
      scaleMax: aggregatedMetrics.isRawPM25 ? Math.max(4095, pm25Crit) : Math.max(150, pm25Crit),
      icon: <Layers className="w-4 h-4 text-amber-300" />,
      gradient:
        pm25Value >= pm25Crit
          ? 'from-rose-500 to-red-600'
          : pm25Value >= pm25Safe
          ? 'from-amber-500 to-yellow-500'
          : 'from-cyan-500 to-teal-500',
      glowColor: 'shadow-amber-500/30',
      badgeColor:
        aggregatedMetrics.pm25 === null
          ? 'bg-slate-900 text-slate-400 border-slate-700'
          : pm25Value >= pm25Crit
          ? 'bg-rose-950 text-rose-300 border-rose-800 animate-pulse'
          : pm25Value >= pm25Safe
          ? 'bg-amber-950 text-amber-300 border-amber-800'
          : 'bg-cyan-950 text-cyan-300 border-cyan-800',
      textColor:
        aggregatedMetrics.pm25 === null
          ? 'text-slate-400'
          : pm25Value >= pm25Crit
          ? 'text-rose-400'
          : pm25Value >= pm25Safe
          ? 'text-amber-400'
          : 'text-cyan-400',
      status:
        aggregatedMetrics.pm25 === null
          ? 'Sin dato'
          : pm25Value >= pm25Crit
          ? 'Crítico'
          : pm25Value >= pm25Safe
          ? 'Moderado'
          : 'Óptimo',
      norm: aggregatedMetrics.isRawPM25 ? `Prev ≤ ${pm25Safe} ADC` : `DS 132: LPP ≤ ${pm25Safe} µg/m³`,
    },
    {
      id: 'ch4',
      name: 'Gas Metano (CH4)',
      shortName: 'CH4',
      unit: '% LEL',
      hasData: aggregatedMetrics.ch4 !== null,
      value: Number(ch4Value.toFixed(1)),
      safeMax: ch4Safe,
      criticalMax: ch4Crit,
      scaleMax: Math.max(5.0, ch4Crit),
      icon: <Zap className="w-4 h-4 text-purple-400" />,
      gradient: ch4Value > ch4Safe ? 'from-rose-600 to-red-600' : 'from-purple-500 to-pink-500',
      glowColor: 'shadow-purple-500/30',
      badgeColor:
        aggregatedMetrics.ch4 === null
          ? 'bg-slate-900 text-slate-400 border-slate-700'
          : ch4Value > ch4Safe
          ? 'bg-rose-950 text-rose-300 border-rose-800'
          : 'bg-purple-950 text-purple-300 border-purple-800',
      textColor:
        aggregatedMetrics.ch4 === null
          ? 'text-slate-400'
          : ch4Value > ch4Safe
          ? 'text-rose-400'
          : 'text-purple-400',
      status: aggregatedMetrics.ch4 === null ? 'Sin dato' : ch4Value > ch4Safe ? 'Crítico' : 'Seguro',
      norm: `DS 132: Máx ${ch4Safe}% LEL`,
    },
    ...(isSuperAdmin
      ? [
          {
            id: 'o2',
            name: 'Oxígeno (O₂)',
            shortName: 'O₂',
            unit: '%',
            hasData: aggregatedMetrics.o2 !== null,
            value: Number(o2Value.toFixed(1)),
            safeMax: o2MinSafe,
            criticalMax: 23.5,
            scaleMax: 25,
            icon: <HeartPulse className="w-4 h-4 text-emerald-400" />,
            gradient:
              o2Value < o2MinSafe
                ? 'from-rose-600 to-red-500'
                : 'from-emerald-500 to-teal-500',
            glowColor: 'shadow-emerald-500/30',
            badgeColor:
              aggregatedMetrics.o2 === null
                ? 'bg-slate-900 text-slate-400 border-slate-700'
                : o2Value < o2MinSafe
                ? 'bg-rose-950 text-rose-300 border-rose-800 animate-pulse'
                : 'bg-emerald-950 text-emerald-300 border-emerald-800',
            textColor:
              aggregatedMetrics.o2 === null
                ? 'text-slate-400'
                : o2Value < o2MinSafe
                ? 'text-rose-400'
                : 'text-emerald-400',
            status:
              aggregatedMetrics.o2 === null
                ? 'Sin dato'
                : o2Value < o2MinSafe
                ? 'Bajo O₂'
                : 'Óptimo',
            norm: `DS 132: ≥ ${o2MinSafe}% O₂`,
          },
          {
            id: 'ventilation',
            name: 'Flujo de Ventilación',
            shortName: 'Ventil.',
            unit: 'm/s',
            hasData: aggregatedMetrics.flujoAire !== null,
            value: Number(airFlowValue.toFixed(1)),
            safeMax: airFlowMax,
            criticalMax: airFlowMax + 1,
            scaleMax: Math.max(5, airFlowMax + 1.5),
            icon: <Wind className="w-4 h-4 text-sky-400" />,
            gradient: 'from-sky-500 to-cyan-500',
            glowColor: 'shadow-sky-500/30',
            badgeColor:
              aggregatedMetrics.flujoAire === null
                ? 'bg-slate-900 text-slate-400 border-slate-700'
                : 'bg-sky-950 text-sky-300 border-sky-800',
            textColor:
              aggregatedMetrics.flujoAire === null ? 'text-slate-400' : 'text-sky-400',
            status:
              aggregatedMetrics.flujoAire === null
                ? 'Sin dato'
                : airFlowValue < airFlowMin
                ? 'Bajo Flujo'
                : 'Circ. OK',
            norm: `DS 132: ${airFlowMin} – ${airFlowMax} m/s`,
          },
          {
            id: 'noise',
            name: 'Nivel de Ruido',
            shortName: 'Ruido',
            unit: 'dB',
            hasData: aggregatedMetrics.ruido !== null,
            value: Number(noiseValue.toFixed(0)),
            safeMax: noiseSafe,
            criticalMax: noiseCrit,
            scaleMax: Math.max(110, noiseCrit + 15),
            icon: <Volume2 className="w-4 h-4 text-amber-400" />,
            gradient:
              noiseValue >= noiseCrit
                ? 'from-rose-600 to-red-500'
                : noiseValue >= noiseSafe
                ? 'from-amber-500 to-orange-500'
                : 'from-teal-500 to-emerald-500',
            glowColor: 'shadow-amber-500/30',
            badgeColor:
              aggregatedMetrics.ruido === null
                ? 'bg-slate-900 text-slate-400 border-slate-700'
                : noiseValue >= noiseCrit
                ? 'bg-rose-950 text-rose-300 border-rose-800'
                : noiseValue >= noiseSafe
                ? 'bg-amber-950 text-amber-300 border-amber-800'
                : 'bg-emerald-950 text-emerald-300 border-emerald-800',
            textColor:
              aggregatedMetrics.ruido === null
                ? 'text-slate-400'
                : noiseValue >= noiseCrit
                ? 'text-rose-400'
                : noiseValue >= noiseSafe
                ? 'text-amber-400'
                : 'text-emerald-400',
            status:
              aggregatedMetrics.ruido === null
                ? 'Sin dato'
                : noiseValue >= noiseCrit
                ? 'Crítico'
                : noiseValue >= noiseSafe
                ? 'Alto'
                : 'Normal',
            norm: `DS 594: ≤ ${noiseSafe} dB (8h)`,
          },
        ]
      : []),
  ];

  // Filter timeline points to chartDevices IDs if available
  const chartDeviceIds = useMemo(() => new Set(chartDevices.map((d) => d.id)), [chartDevices]);
  const recentHistory = useMemo(() => {
    const matched = telemetryHistory.filter(
      (pt) => !pt.deviceId || chartDeviceIds.size === 0 || chartDeviceIds.has(pt.deviceId)
    );
    return (matched.length > 0 ? matched : telemetryHistory).slice(-6);
  }, [telemetryHistory, chartDeviceIds]);

  const timelineReadings =
    recentHistory.length > 0
      ? recentHistory.map((pt, idx) => ({
          hour:
            idx === recentHistory.length - 1
              ? 'Última'
              : new Date(pt.timestamp).toLocaleTimeString('es-CL', {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
          temp: typeof pt.temperatura === 'number' ? pt.temperatura : tempValue,
          hum: typeof pt.humedad === 'number' ? pt.humedad : humValue,
          co: typeof pt.co === 'number' ? pt.co : coValue,
          co2: co2Value,
          pm25: typeof pt.pm25 === 'number' ? pt.pm25 : pm25Value,
          ch4: ch4Value,
        }))
      : [
          {
            hour: 'Promedio actual',
            temp: tempValue,
            hum: humValue,
            co: coValue,
            co2: co2Value,
            pm25: pm25Value,
            ch4: ch4Value,
          },
        ];

  const activeScopeLabel =
    isSuperAdmin && superAdminSingleNodeMode && activeSelectedDevice
      ? `Nodo: ${activeSelectedDevice.name}`
      : effectiveSectorFilter !== 'all'
      ? `Sector ${effectiveSectorFilter}`
      : selectedSiteFilter !== 'all'
      ? `Faena ${availableSites.find((s) => s.id === selectedSiteFilter)?.name || selectedSiteFilter}`
      : 'Todos los sectores visibles';

  const filteredSystemUsers = useMemo(() => {
    const q = userSearchQuery.trim().toLowerCase();
    return usersList.filter((u) => {
      const matchesRole = userRoleFilter === 'all' || u.role === userRoleFilter;
      const matchesQuery =
        !q ||
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.rut || '').toLowerCase().includes(q) ||
        (u.role || '').toLowerCase().includes(q) ||
        (u.assignedSector || '').toLowerCase().includes(q) ||
        (u.shift || '').toLowerCase().includes(q);
      return matchesRole && matchesQuery;
    });
  }, [usersList, userSearchQuery, userRoleFilter]);

  const getCompactRoleTag = (role: UserRole) => {
    switch (role) {
      case 'superadmin':
        return {
          text: '(SUPERADMIN)',
          cls: 'bg-purple-950/80 text-purple-200 border-purple-500/70',
          icon: <Crown className="w-3 h-3 text-purple-300" />,
        };
      case 'admin_minesafe':
        return {
          text: '(ADMIN MINESAFE)',
          cls: 'bg-indigo-950/80 text-indigo-200 border-indigo-500/70',
          icon: <ShieldCheck className="w-3 h-3 text-indigo-300" />,
        };
      case 'admin':
        return {
          text: '(ADMIN)',
          cls: 'bg-cyan-950/80 text-cyan-200 border-cyan-500/70',
          icon: <Shield className="w-3 h-3 text-cyan-300" />,
        };
      case 'supervisor':
        return {
          text: '(SUPERVISOR)',
          cls: 'bg-emerald-950/80 text-emerald-200 border-emerald-500/70',
          icon: <Eye className="w-3 h-3 text-emerald-300" />,
        };
      default:
        return {
          text: '(OPERADOR)',
          cls: 'bg-amber-950/80 text-amber-200 border-amber-500/70',
          icon: <HardHat className="w-3 h-3 text-amber-300" />,
        };
    }
  };

  return (
    <div className="space-y-6">
      {/* ==============================================================
          1. WELCOME BANNER WITH PROMINENT ROLE INDICATOR
         ============================================================== */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950/40 border border-slate-800 p-5 sm:p-6 shadow-xl">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-3.5">
            <div
              className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center font-bold text-lg sm:text-xl shadow-lg shrink-0 ${userRoleInfo.avatarBg}`}
            >
              {currentUser?.name?.charAt(0) || 'M'}
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                  Bienvenido, {currentUser?.name || 'Usuario Autenticado'}
                </h2>

                {/* Highlighted Role Pill */}
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider border shadow-md ${userRoleInfo.bg}`}
                >
                  {userRoleInfo.icon}
                  <span>{userRoleInfo.badgeText}</span>
                </span>
              </div>

              <p className="mt-1 text-xs sm:text-sm text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-slate-200 font-semibold">{userRoleInfo.label}</span>
                {isSuperAdmin && (
                  <>
                    <span>•</span>
                    <span className="px-2 py-0.5 rounded bg-purple-950/70 border border-purple-700/60 text-purple-200 text-[11px] font-semibold">
                      Prevencionista / Diagnóstico Avanzado
                    </span>
                  </>
                )}
                <span>•</span>
                <span>{currentUser?.shift || 'Turno Operativo'}</span>
                <span>•</span>
                <span className="text-cyan-400 font-medium">
                  {siteName || currentUser?.assignedSector || 'Operación MineSafe'}
                </span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 self-start md:self-center">
            {onChangeUserModal && (
              <button
                type="button"
                onClick={onChangeUserModal}
                className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 hover:border-cyan-500/50 transition-all flex items-center gap-2 shadow-sm"
              >
                <IdCard className="w-4 h-4 text-cyan-400" />
                <span>Ver Credencial</span>
              </button>
            )}
          </div>
        </div>

        {/* Operational Stat Strip (2 cards standard; + Dispositivo Activo & Alertas de Faena for SuperAdmin) */}
        <div
          className={`grid grid-cols-1 ${
            isSuperAdmin ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2'
          } gap-3 sm:gap-4 mt-5 pt-4 border-t border-slate-800/80 relative z-10`}
        >
          <div className="bg-slate-950/60 rounded-xl p-3.5 border border-slate-800/80 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 font-medium block">Nodos Activos del Total</span>
              <div className="mt-1 text-2xl font-black text-emerald-400 tabular-nums">
                {onlineNodesCount}{' '}
                <span className="text-xs font-normal text-slate-400">/ {totalNodesCount} nodos</span>
              </div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-emerald-950/60 border border-emerald-800/60 flex items-center justify-center text-emerald-400">
              <Cpu className="w-4 h-4" />
            </div>
          </div>

          <div className="bg-slate-950/60 rounded-xl p-3.5 border border-slate-800/80 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 font-medium block">Sectores con Cobertura</span>
              <div className="mt-1 text-2xl font-black text-cyan-300 tabular-nums">
                {availableSectors.length}{' '}
                <span className="text-xs font-normal text-slate-400">
                  {availableSectors.length === 1 ? 'sector monitoreado' : 'sectores monitoreados'}
                </span>
              </div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-cyan-950/60 border border-cyan-800/60 flex items-center justify-center text-cyan-400">
              <MapPin className="w-4 h-4" />
            </div>
          </div>

          {isSuperAdmin && (
            <>
              <div className="bg-purple-950/25 rounded-xl p-3.5 border border-purple-800/50 flex flex-col justify-between gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-purple-200 font-medium">Dispositivo Activo</span>
                  <span className="text-[10px] font-mono text-purple-300 truncate max-w-[120px]">
                    {activeSelectedDevice?.id || 'N/D'}
                  </span>
                </div>
                {devices.length > 0 && onSelectDevice ? (
                  <select
                    value={activeSelectedDevice?.id || ''}
                    onChange={(e) => onSelectDevice(e.target.value)}
                    aria-label="Seleccionar dispositivo activo"
                    className="w-full bg-slate-950 border border-purple-700/60 rounded-lg px-2 py-1 text-xs font-semibold text-cyan-200 focus:outline-none focus:border-cyan-400"
                  >
                    {devices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.sectorName || d.id})
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-sm font-bold text-white truncate">
                    {activeSelectedDevice?.name || 'Sin equipo'}
                  </span>
                )}
              </div>

              <div className="bg-purple-950/25 rounded-xl p-3.5 border border-purple-800/50 flex items-center justify-between">
                <div>
                  <span className="text-xs text-purple-200 font-medium block">Alertas de Faena</span>
                  <div
                    className={`mt-1 text-2xl font-black tabular-nums ${
                      activeAlertCount > 0 ? 'text-amber-400' : 'text-emerald-400'
                    }`}
                  >
                    {activeAlertCount}{' '}
                    <span className="text-xs font-normal text-slate-400">
                      {activeAlertCount === 1 ? 'alerta' : 'alertas'}
                    </span>
                  </div>
                </div>
                <div
                  className={`w-9 h-9 rounded-xl border flex items-center justify-center ${
                    activeAlertCount > 0
                      ? 'bg-amber-950/70 border-amber-700/70 text-amber-400'
                      : 'bg-emerald-950/60 border-emerald-800/60 text-emerald-400'
                  }`}
                >
                  <Bell className="w-4 h-4" />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Consolidated Atmospheric Cards placed between Welcome Banner and Bar Chart */}
      {betweenWelcomeAndChart}

      {/* ==============================================================
          2. SECTOR/NODE TELEMETRY CHART (+ USUARIOS DEL SISTEMA FOR SUPERADMIN)
         ============================================================== */}
      <div className={showUsersPanel ? 'grid grid-cols-1 xl:grid-cols-12 gap-6 items-start' : ''}>
      <div className={`${showUsersPanel ? 'xl:col-span-8 ' : ''}bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl`}>
        {/* Header with Title and Mode Switcher */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-950 text-cyan-400 border border-cyan-800/80">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white flex flex-wrap items-center gap-2">
                <span>
                  {isSuperAdmin && superAdminSingleNodeMode
                    ? 'Monitoreo Atmosférico por Nodo Individual'
                    : 'Monitoreo Atmosférico por Sector'}
                </span>
                <span className="text-xs font-semibold text-cyan-300 bg-cyan-950/60 px-2.5 py-0.5 rounded-lg border border-cyan-800/60">
                  {activeScopeLabel}
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                {isSuperAdmin
                  ? `Lecturas reales de ${aggregatedMetrics.reportingNodes} de ${chartDevices.length} ${
                      chartDevices.length === 1 ? 'nodo' : 'nodos'
                    } (Temp, Hum, CO, CO2, PM2.5, CH4, O₂, Ventilación y Ruido)`
                  : `Promedios reales de ${aggregatedMetrics.reportingNodes} de ${chartDevices.length} ${
                      chartDevices.length === 1 ? 'nodo' : 'nodos'
                    } en el alcance seleccionado (Temperatura, Humedad, CO, CO2, PM2.5 y Metano)`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 self-start lg:self-center shrink-0">
            <button
              type="button"
              onClick={() => setChartViewMode('all_bars')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                chartViewMode === 'all_bars'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Promedio Sectorial
            </button>
            <button
              type="button"
              onClick={() => setChartViewMode('levels')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                chartViewMode === 'levels'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Niveles DS 132
            </button>
            <button
              type="button"
              onClick={() => setChartViewMode('timeline')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                chartViewMode === 'timeline'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Tendencia Temporal
            </button>
          </div>
        </div>

        {/* Role-Based Filter Controls (Organización / Faena / Sector) */}
        <div className="mt-4 flex flex-wrap items-center gap-3 p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
            <Filter className="w-3.5 h-3.5 text-cyan-400" />
            <span>Filtro de Alcance:</span>
          </div>

          {/* SuperAdmin / Admin MineSafe: Organization filter */}
          {isGlobalAdmin && organizations.length > 0 && onSelectOrganization && (
            <div className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={activeOrganizationId}
                onChange={(e) => {
                  onSelectOrganization(e.target.value);
                  setSelectedSiteFilter('all');
                  setSelectedSectorFilter('all');
                }}
                aria-label="Filtrar gráfico por organización"
                className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="all">Todas las Organizaciones</option>
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Admin & Global Admin: Faena selector */}
          {(isGlobalAdmin || isCompanyAdmin) && availableSites.length > 0 && (
            <select
              value={selectedSiteFilter}
              onChange={(e) => {
                setSelectedSiteFilter(e.target.value);
                setSelectedSectorFilter('all');
              }}
              aria-label="Filtrar gráfico por faena"
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="all">Todas las Faenas</option>
              {availableSites.map((s) => (
                <option key={s.id} value={s.id}>
                  Faena: {s.name}
                </option>
              ))}
            </select>
          )}

          {/* Sector filter: Locked badge for Operador, dropdown for Supervisor / Admin / Global Admin */}
          {isOperador ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-950/60 border border-amber-700/60 text-amber-200 text-xs font-semibold">
              <MapPin className="w-3.5 h-3.5" />
              Mi Sector Asignado: {effectiveSectorFilter === 'all' ? 'Sin asignar' : effectiveSectorFilter}
            </span>
          ) : (
            <select
              value={effectiveSectorFilter}
              onChange={(e) => setSelectedSectorFilter(e.target.value)}
              aria-label="Filtrar gráfico por sector"
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="all">Todos los Sectores ({availableSectors.length})</option>
              {availableSectors.map((sec) => (
                <option key={sec} value={sec}>
                  Sector: {sec}
                </option>
              ))}
            </select>
          )}

          {/* SuperAdmin Exclusive: Individual Node Mode Toggle + Node Selector */}
          {isSuperAdmin && (
            <div className="flex flex-wrap items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={() => setSuperAdminSingleNodeMode((prev) => !prev)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                  superAdminSingleNodeMode
                    ? 'bg-purple-700 text-white border-purple-500'
                    : 'bg-slate-900 text-purple-300 border-purple-800/70 hover:bg-purple-950/60'
                }`}
              >
                {superAdminSingleNodeMode ? 'Modo: Nodo Individual' : 'Cambiar a Nodo Individual'}
              </button>
              {superAdminSingleNodeMode && devices.length > 0 && onSelectDevice && (
                <select
                  value={activeSelectedDevice?.id || ''}
                  onChange={(e) => onSelectDevice(e.target.value)}
                  aria-label="Seleccionar nodo individual"
                  className="bg-slate-900 border border-purple-700/70 rounded-lg px-2.5 py-1.5 text-xs text-purple-200 focus:outline-none focus:border-cyan-500"
                >
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.id})
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        {/* CHART MODE 1: VERTICAL SENSOR BARS */}
        {chartViewMode === 'all_bars' && (
          <div className="mt-4 bg-slate-950/80 border border-slate-800/90 rounded-2xl p-4 sm:p-5">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-4 pb-2 border-b border-slate-800">
              <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-cyan-400" />
                {isSuperAdmin && superAdminSingleNodeMode
                  ? `Lectura Individual de Nodo (${allSensorBars.length} Variables)`
                  : `Promedios Atmosféricos Reales (${allSensorBars.length} Variables)`}
              </span>
              <span className="text-[11px] text-slate-400">
                Base: <strong className="text-cyan-300">{aggregatedMetrics.reportingNodes}</strong> nodos reportando
              </span>
            </div>

            {aggregatedMetrics.reportingNodes === 0 ? (
              <div className="py-14 text-center text-xs text-slate-400">
                Sin lecturas reportadas actualmente para el alcance seleccionado.
              </div>
            ) : (
              <div
                className={`grid ${
                  isSuperAdmin
                    ? 'grid-cols-3 sm:grid-cols-5 lg:grid-cols-9'
                    : 'grid-cols-3 sm:grid-cols-6'
                } gap-3 sm:gap-4 items-end pt-6 pb-2 min-h-[260px]`}
              >
                {allSensorBars.map((sensor) => {
                  const pct = sensor.hasData
                    ? Math.min(100, Math.max(14, (sensor.value / sensor.scaleMax) * 100))
                    : 6;
                  const isHovered = hoveredSensorId === sensor.id;

                  return (
                    <div
                      key={sensor.id}
                      className="flex flex-col items-center justify-end h-full group relative cursor-pointer"
                      onMouseEnter={() => setHoveredSensorId(sensor.id)}
                      onMouseLeave={() => setHoveredSensorId(null)}
                    >
                      {isHovered && (
                        <div className="absolute -top-12 z-20 bg-slate-900 border border-cyan-500/80 text-white text-[10px] py-1 px-2.5 rounded-lg shadow-xl whitespace-nowrap pointer-events-none">
                          <p className="font-bold text-cyan-300">{sensor.name}</p>
                          <p className="text-slate-300">
                            {sensor.hasData ? `${sensor.value} ${sensor.unit}` : 'Sin dato'} · {sensor.norm}
                          </p>
                        </div>
                      )}

                      <div className="mb-2 text-center">
                        <span
                          className={`text-xs sm:text-sm font-mono font-black tabular-nums transition-transform duration-200 block ${sensor.textColor} ${
                            isHovered ? 'scale-110' : ''
                          }`}
                        >
                          {sensor.hasData ? sensor.value : '--'}
                        </span>
                        <span className="text-[10px] text-slate-400 block -mt-0.5 font-mono">
                          {sensor.unit}
                        </span>
                      </div>

                      <div className="w-full max-w-[44px] bg-slate-900/90 rounded-t-xl h-36 flex items-end p-1 border border-slate-800 group-hover:border-slate-700 transition-colors relative overflow-hidden">
                        <div
                          className="absolute left-0 right-0 h-0.5 bg-slate-700/60 z-10 pointer-events-none"
                          style={{ bottom: `${Math.min(95, (sensor.safeMax / sensor.scaleMax) * 100)}%` }}
                          title={`Límite seguro: ${sensor.safeMax} ${sensor.unit}`}
                        />
                        <div
                          className={`w-full rounded-t-lg bg-gradient-to-t ${
                            sensor.hasData ? sensor.gradient : 'from-slate-700 to-slate-600'
                          } shadow-lg ${sensor.glowColor} transition-all duration-500 group-hover:brightness-125`}
                          style={{ height: `${pct}%` }}
                        />
                      </div>

                      <div className="mt-2 text-center w-full flex flex-col items-center">
                        <div className="flex items-center justify-center mb-0.5">{sensor.icon}</div>
                        <span className="text-[11px] font-bold text-slate-300 truncate max-w-full">
                          {sensor.shortName}
                        </span>
                        <span
                          className={`mt-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${sensor.badgeColor}`}
                        >
                          {sensor.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between text-[11px] text-slate-400 gap-2">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" /> Seguro
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400" /> Atención
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" /> Crítico
                </span>
              </div>
              <span className="font-mono text-[10px] text-slate-500">
                Línea tenue = Límite normativo seguro DS 132
              </span>
            </div>
          </div>
        )}

        {/* CHART MODE 2: HORIZONTAL LEVELS & DS 132 LIMIT GAUGES */}
        {chartViewMode === 'levels' && (
          <div className="space-y-3 mt-4">
            {allSensorBars.map((metric) => {
              const pct = metric.hasData
                ? Math.min(100, Math.max(5, (metric.value / metric.scaleMax) * 100))
                : 0;

              return (
                <div
                  key={metric.id}
                  className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <div className="flex items-center gap-2">
                      {metric.icon}
                      <span className="font-semibold text-slate-200">{metric.name}</span>
                      <span className="text-[10px] text-slate-400 hidden sm:inline">({metric.norm})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${metric.badgeColor}`}>
                        {metric.status}
                      </span>
                      <span className={`font-mono font-bold text-sm ${metric.textColor}`}>
                        {metric.hasData ? metric.value : '--'}{' '}
                        <span className="text-xs text-slate-400 font-normal">{metric.unit}</span>
                      </span>
                    </div>
                  </div>

                  <div className="relative w-full h-3 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-slate-600 z-10"
                      style={{ left: `${(metric.safeMax / metric.scaleMax) * 100}%` }}
                      title={`Límite seguro: ${metric.safeMax} ${metric.unit}`}
                    />
                    <div
                      className={`h-full rounded-full transition-all duration-500 bg-gradient-to-r ${metric.gradient}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* CHART MODE 3: TIMELINE EVOLUTION */}
        {chartViewMode === 'timeline' && (
          <div className="mt-4 bg-slate-950/80 border border-slate-800 rounded-2xl p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800">
              <span className="font-semibold text-xs sm:text-sm text-slate-200">
                Evolución Temporal Real — {activeScopeLabel}
              </span>

              <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[11px]">
                {(
                  [
                    { id: 'gases', label: 'CO & PM2.5' },
                    { id: 'clima', label: 'Temp & Humedad' },
                    { id: 'seguridad', label: 'CO2 & Metano' },
                    { id: 'todos', label: 'Todos' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setTimelineGroup(tab.id)}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                      timelineGroup === tab.id
                        ? 'bg-cyan-600 text-white'
                        : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {recentHistory.length < 2 && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] text-slate-400">
                Muestras reales registradas: <strong className="text-cyan-300">{recentHistory.length}</strong>. Se muestran únicamente lecturas reales sin interpolación simulada.
              </div>
            )}

            <div className="h-44 w-full flex items-end justify-between gap-2 pt-2 px-1">
              {timelineReadings.map((reading, index) => (
                <div key={index} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                  <div className="w-full flex items-end justify-center gap-1 h-32 px-0.5">
                    {(timelineGroup === 'gases' || timelineGroup === 'todos') && (
                      <>
                        <div
                          className="flex-1 max-w-[14px] bg-gradient-to-t from-orange-600 to-orange-400 rounded-t-sm"
                          style={{ height: `${Math.min(100, Math.max(12, (reading.co / Math.max(50, coSafe)) * 100))}%` }}
                          title={`CO: ${reading.co.toFixed(1)} ${aggregatedMetrics.isRawCO ? 'ADC' : 'ppm'}`}
                        />
                        <div
                          className="flex-1 max-w-[14px] bg-gradient-to-t from-cyan-600 to-cyan-400 rounded-t-sm"
                          style={{ height: `${Math.min(100, Math.max(12, (reading.pm25 / Math.max(100, pm25Safe)) * 100))}%` }}
                          title={`PM2.5: ${reading.pm25.toFixed(1)} ${aggregatedMetrics.isRawPM25 ? 'ADC' : 'µg/m³'}`}
                        />
                      </>
                    )}
                    {(timelineGroup === 'clima' || timelineGroup === 'todos') && (
                      <>
                        <div
                          className="flex-1 max-w-[14px] bg-gradient-to-t from-blue-600 to-blue-400 rounded-t-sm"
                          style={{ height: `${Math.min(100, Math.max(12, (reading.temp / 40) * 100))}%` }}
                          title={`Temp: ${reading.temp.toFixed(1)} °C`}
                        />
                        <div
                          className="flex-1 max-w-[14px] bg-gradient-to-t from-indigo-600 to-indigo-400 rounded-t-sm"
                          style={{ height: `${Math.min(100, Math.max(12, reading.hum))}%` }}
                          title={`Humedad: ${reading.hum.toFixed(1)}%`}
                        />
                      </>
                    )}
                    {(timelineGroup === 'seguridad' || timelineGroup === 'todos') && (
                      <>
                        <div
                          className="flex-1 max-w-[14px] bg-gradient-to-t from-emerald-600 to-emerald-400 rounded-t-sm"
                          style={{ height: `${Math.min(100, Math.max(12, (reading.co2 / Math.max(1000, co2Crit)) * 100))}%` }}
                          title={`CO2: ${reading.co2.toFixed(0)} ppm`}
                        />
                        <div
                          className="flex-1 max-w-[14px] bg-gradient-to-t from-purple-600 to-purple-400 rounded-t-sm"
                          style={{ height: `${Math.min(100, Math.max(12, (reading.ch4 / Math.max(5, ch4Crit)) * 100))}%` }}
                          title={`CH4: ${reading.ch4.toFixed(1)}% LEL`}
                        />
                      </>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">{reading.hour}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ==============================================================
          SUPERADMIN ONLY: BLOQUE "USUARIOS DEL SISTEMA" EN DASHBOARD
         ============================================================== */}
      {showUsersPanel && (
        <aside className="xl:col-span-4 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col">
          {/* Header */}
          <div className="flex items-center gap-3 pb-3.5 border-b border-slate-800">
            <div className="w-10 h-10 rounded-xl bg-purple-950/80 border border-purple-700/70 flex items-center justify-center text-purple-300 shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-white truncate">
                  Usuarios del Sistema
                </h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-purple-950 text-purple-200 border border-purple-700/70 tabular-nums">
                  {usersList.length}
                </span>
              </div>
              <p className="text-xs text-slate-400">Personal autorizado y roles en faena</p>
            </div>
          </div>

          {/* Search Input */}
          <div className="relative mt-3.5">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={userSearchQuery}
              onChange={(e) => setUserSearchQuery(e.target.value)}
              placeholder="Buscar por nombre, RUT o cargo..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Role Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            {(
              [
                { id: 'all', label: 'Todos' },
                { id: 'superadmin', label: 'Superadmin' },
                { id: 'admin_minesafe', label: 'Admin MineSafe' },
                { id: 'admin', label: 'Admin' },
                { id: 'supervisor', label: 'Supervisor' },
                { id: 'operador', label: 'Operadores' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setUserRoleFilter(tab.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                  userRoleFilter === tab.id
                    ? 'bg-cyan-600 text-white border-cyan-500 shadow-sm'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Scrollable User Cards */}
          <div className="mt-3.5 space-y-2.5 max-h-[430px] overflow-y-auto pr-1">
            {filteredSystemUsers.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400 bg-slate-950/60 rounded-xl border border-slate-800">
                No se encontraron usuarios con el filtro aplicado.
              </div>
            ) : (
              filteredSystemUsers.map((user) => {
                const isSelf = Boolean(currentUser && user.id === currentUser.id);
                const roleTag = getCompactRoleTag(user.role);
                const roleVisual = getRoleDetails(user.role);
                return (
                  <div
                    key={user.id}
                    className={`rounded-xl p-3.5 border transition-all ${
                      isSelf
                        ? 'bg-cyan-950/25 border-cyan-500/70 shadow-md shadow-cyan-950/30'
                        : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${roleVisual.avatarBg}`}
                        >
                          {(user.name || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-bold text-white truncate max-w-[160px]">
                              {user.name}
                            </span>
                            {isSelf && (
                              <span className="px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-600/70 text-cyan-300 text-[9px] font-extrabold uppercase">
                                TÚ
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-300 block truncate">
                            {user.email}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 block mt-0.5">
                            RUT: {user.rut || 'No registrado'}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold border uppercase ${roleTag.cls}`}
                        >
                          {roleTag.icon}
                          <span>{roleTag.text}</span>
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          En Línea
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                      <span className="text-slate-400 truncate max-w-[180px]">
                        {user.assignedSector || user.shift || 'Turno Operativo'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setInspectedUser(user);
                          onSelectUser?.(user);
                        }}
                        className="inline-flex items-center gap-0.5 text-cyan-400 hover:text-cyan-300 font-bold cursor-pointer"
                      >
                        <span>Ver perfil</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Hint */}
          <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Usa la barra para desplazar el listado</span>
            <span className="text-cyan-400 font-semibold">Desplazamiento vertical activo</span>
          </div>
        </aside>
      )}
      </div>

      {/* SuperAdmin User Profile Carnet Modal (opened from "Ver perfil") */}
      {inspectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg ${
                    getRoleDetails(inspectedUser.role).avatarBg
                  }`}
                >
                  {(inspectedUser.name || 'U').charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">{inspectedUser.name}</h3>
                  <span className="text-xs text-cyan-300 font-semibold">
                    {getRoleDetails(inspectedUser.role).label}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectedUser(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                aria-label="Cerrar perfil de usuario"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-cyan-400 shrink-0" />
                <div>
                  <span className="text-[10px] text-slate-400 block">Correo Corporativo</span>
                  <span className="font-semibold text-white">{inspectedUser.email}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">RUT</span>
                  <span className="font-mono font-bold text-slate-200">
                    {inspectedUser.rut || 'No registrado'}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Rol en Plataforma</span>
                  <span className="font-bold text-purple-300 uppercase">
                    {inspectedUser.role}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-start gap-2">
                  <Briefcase className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <span className="text-[10px] text-slate-400 block">Sector / Faena</span>
                    <span className="font-semibold text-cyan-300">
                      {inspectedUser.assignedSector ||
                        organizations.find((o) => o.id === inspectedUser.organizationId)?.name ||
                        'Global'}
                    </span>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-start gap-2">
                  <Clock className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <span className="text-[10px] text-slate-400 block">Turno</span>
                    <span className="font-semibold text-slate-200">
                      {inspectedUser.shift || 'Turno Operativo'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setInspectedUser(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white cursor-pointer"
              >
                Cerrar Carnet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
