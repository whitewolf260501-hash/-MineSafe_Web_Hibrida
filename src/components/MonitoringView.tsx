import React, { useMemo, useState } from 'react';
import {
  Radio,
  Search,
  Battery,
  Wifi,
  Flame,
  RotateCcw,
  Sliders,
  X,
  Building2,
  MapPin,
  Users,
  Server,
  Cpu,
  Database,
  Terminal,
  AlertTriangle,
  Wind,
  Volume2,
  HeartPulse,
} from 'lucide-react';
import {
  SensorDevice,
  MiningSite,
  MiningCrew,
  Organization,
  AlertSeverity,
  UserProfile,
  PlatformConfig,
} from '../types';
import { soundAlert } from '../services/audioAlert';
import { FIREBASE_PROJECT_ID, isSectionVisibleForUser } from '../services/firebase';
import { isAnyAdminRole, isGlobalMineSafeAdmin } from '../utils/accessControl';

interface MonitoringViewProps {
  devices: SensorDevice[];
  currentSite: MiningSite;
  sites?: MiningSite[];
  crews?: MiningCrew[];
  organizations?: Organization[];
  activeOrganizationId?: string;
  onSelectOrganization?: (orgId: string) => void;
  currentUser?: UserProfile | null;
  platformConfig?: PlatformConfig;
  selectedSensorId: string | null;
  onSelectSensor: (sensorId: string | null) => void;
  onSimulateGasSpike: (sensorId: string) => void;
  onResetSensor: (sensorId: string) => void;
}

export const MonitoringView: React.FC<MonitoringViewProps> = ({
  devices,
  currentSite,
  sites = [],
  crews = [],
  organizations = [],
  activeOrganizationId = 'all',
  onSelectOrganization,
  currentUser,
  platformConfig,
  selectedSensorId,
  onSelectSensor,
  onSimulateGasSpike,
  onResetSensor,
}) => {
  const canSimulateEvents = isAnyAdminRole(currentUser?.role);
  const isGlobalAdmin = isGlobalMineSafeAdmin(currentUser?.role);
  const isSuperAdmin = currentUser?.role === 'superadmin';
  const isCompanyAdmin = currentUser?.role === 'admin';
  const showFiltersBar = isSectionVisibleForUser('mon_filters_bar', currentUser, platformConfig);
  const showTechDiagnostics = isSectionVisibleForUser(
    'mon_tech_diagnostics',
    currentUser,
    platformConfig
  );
  const showSimulationControls = isSectionVisibleForUser(
    'mon_simulation_controls',
    currentUser,
    platformConfig
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSiteFilter, setSelectedSiteFilter] = useState<string>('all');
  const [selectedCrewFilter, setSelectedCrewFilter] = useState<string>('all');
  const [selectedSector, setSelectedSector] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'gateway' | 'nodo'>('all');
  const [showSuperAdminTechView, setShowSuperAdminTechView] = useState<boolean>(true);

  const selectedDevice = devices.find((d) => d.id === selectedSensorId);
  const isNodeDevice = (d: SensorDevice) =>
    d.deviceCategory === 'sensor' || d.deviceCategory === 'nodo';

  const normalizeLabel = (val?: string | null) => (val || '').trim().toLowerCase();

  // Resolve canonical site (id + name) from device fields + known sites list (never falls back to currentSite)
  const resolveDeviceSite = useMemo(() => {
    const byId = new Map<string, { id: string; name: string }>();
    const byNormName = new Map<string, { id: string; name: string }>();
    sites.forEach((s) => {
      if (s.id && s.name) {
        const entry = { id: s.id, name: s.name };
        byId.set(s.id, entry);
        byNormName.set(normalizeLabel(s.name), entry);
      }
    });

    return (d: SensorDevice): { id: string; name: string } | null => {
      const rawId = d.siteId?.trim();
      const rawName = d.siteName?.trim();
      if (rawId) {
        const found = byId.get(rawId);
        return {
          id: found?.id || rawId,
          name: found?.name || rawName || rawId,
        };
      }
      if (rawName) {
        const found = byNormName.get(normalizeLabel(rawName));
        if (found) return found;
        return { id: rawName, name: rawName };
      }
      return null;
    };
  }, [sites]);

  // Resolve canonical crew (id + name) from device fields + known crews list
  const resolveDeviceCrew = useMemo(() => {
    const byId = new Map<string, { id: string; name: string }>();
    const byNormName = new Map<string, { id: string; name: string }>();
    crews.forEach((c) => {
      if (c.id && c.name) {
        const entry = { id: c.id, name: c.name };
        byId.set(c.id, entry);
        byNormName.set(normalizeLabel(c.name), entry);
      }
    });

    return (d: SensorDevice): { id: string; name: string } | null => {
      const rawId = d.crewId?.trim();
      const rawName = d.crewName?.trim();
      if (rawId) {
        const found = byId.get(rawId);
        return {
          id: found?.id || rawId,
          name: found?.name || rawName || rawId,
        };
      }
      if (rawName) {
        const found = byNormName.get(normalizeLabel(rawName));
        if (found) return found;
        return { id: rawName, name: rawName };
      }
      return null;
    };
  }, [crews]);

  // Build available hierarchy options from props + live devices (deduplicated by ID and normalized name)
  const availableSites = useMemo(() => {
    const map = new Map<string, string>();
    const seenNormNames = new Set<string>();
    sites.forEach((s) => {
      if (s.id && s.name) {
        map.set(s.id, s.name);
        seenNormNames.add(normalizeLabel(s.name));
      }
    });
    devices.forEach((d) => {
      const resolved = resolveDeviceSite(d);
      if (!resolved) return;
      const normName = normalizeLabel(resolved.name);
      if (!map.has(resolved.id) && !seenNormNames.has(normName)) {
        map.set(resolved.id, resolved.name);
        seenNormNames.add(normName);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [sites, devices, resolveDeviceSite]);

  const hasUnassignedSiteDevices = useMemo(
    () => devices.some((d) => resolveDeviceSite(d) === null),
    [devices, resolveDeviceSite]
  );

  const selectedSiteOption = useMemo(
    () => availableSites.find((s) => s.id === selectedSiteFilter) || null,
    [availableSites, selectedSiteFilter]
  );

  const deviceMatchesSiteFilter = useMemo(() => {
    const selectedNormName = selectedSiteOption ? normalizeLabel(selectedSiteOption.name) : '';
    return (device: SensorDevice): boolean => {
      if (selectedSiteFilter === 'all') return true;
      const resolved = resolveDeviceSite(device);
      if (selectedSiteFilter === '__unassigned__') {
        return resolved === null;
      }
      if (!resolved) return false;
      if (resolved.id === selectedSiteFilter || device.siteId === selectedSiteFilter) {
        return true;
      }
      if (selectedNormName) {
        if (
          normalizeLabel(resolved.name) === selectedNormName ||
          normalizeLabel(device.siteName) === selectedNormName
        ) {
          return true;
        }
      }
      return false;
    };
  }, [selectedSiteFilter, selectedSiteOption, resolveDeviceSite]);

  const availableCrews = useMemo(() => {
    const map = new Map<string, string>();
    const seenNormNames = new Set<string>();
    crews.forEach((c) => {
      if (selectedSiteFilter !== 'all') {
        if (selectedSiteFilter === '__unassigned__') return;
        if (c.siteId && c.siteId !== selectedSiteFilter) return;
      }
      if (c.id && c.name) {
        map.set(c.id, c.name);
        seenNormNames.add(normalizeLabel(c.name));
      }
    });
    devices.forEach((d) => {
      if (!deviceMatchesSiteFilter(d)) return;
      const resolved = resolveDeviceCrew(d);
      if (!resolved) return;
      const normName = normalizeLabel(resolved.name);
      if (!map.has(resolved.id) && !seenNormNames.has(normName)) {
        map.set(resolved.id, resolved.name);
        seenNormNames.add(normName);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [crews, devices, selectedSiteFilter, deviceMatchesSiteFilter, resolveDeviceCrew]);

  const selectedCrewOption = useMemo(
    () => availableCrews.find((c) => c.id === selectedCrewFilter) || null,
    [availableCrews, selectedCrewFilter]
  );

  const deviceMatchesCrewFilter = useMemo(() => {
    const selectedNormName = selectedCrewOption ? normalizeLabel(selectedCrewOption.name) : '';
    return (device: SensorDevice): boolean => {
      if (selectedCrewFilter === 'all') return true;
      const resolved = resolveDeviceCrew(device);
      if (!resolved) return false;
      if (resolved.id === selectedCrewFilter || device.crewId === selectedCrewFilter) {
        return true;
      }
      if (selectedNormName) {
        if (
          normalizeLabel(resolved.name) === selectedNormName ||
          normalizeLabel(device.crewName) === selectedNormName
        ) {
          return true;
        }
      }
      return false;
    };
  }, [selectedCrewFilter, selectedCrewOption, resolveDeviceCrew]);

  const availableSectors = useMemo(() => {
    const set = new Set<string>();
    devices.forEach((d) => {
      if (!deviceMatchesSiteFilter(d)) return;
      if (!deviceMatchesCrewFilter(d)) return;
      if (d.sectorName?.trim()) set.add(d.sectorName.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [devices, deviceMatchesSiteFilter, deviceMatchesCrewFilter]);

  // Filter devices (by hierarchy & status — never by worker name)
  const filteredDevices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return devices.filter((device) => {
      const resolvedSite = resolveDeviceSite(device);
      const resolvedCrew = resolveDeviceCrew(device);
      const matchesSearch =
        !q ||
        device.name.toLowerCase().includes(q) ||
        (device.sectorName || '').toLowerCase().includes(q) ||
        (resolvedSite?.name || 'sin faena asignada').toLowerCase().includes(q) ||
        (resolvedCrew?.name || '').toLowerCase().includes(q) ||
        (isSuperAdmin &&
          (device.id.toLowerCase().includes(q) ||
            (device.localIp || '').toLowerCase().includes(q) ||
            (device.via || '').toLowerCase().includes(q)));

      const matchesSite = deviceMatchesSiteFilter(device);
      const matchesCrew = deviceMatchesCrewFilter(device);

      const matchesSector =
        selectedSector === 'all' ||
        device.sectorId === selectedSector ||
        device.sectorName === selectedSector;

      const matchesStatus = selectedStatus === 'all' || device.status === selectedStatus;

      const isGateway = !isNodeDevice(device);
      const matchesCategory =
        selectedCategory === 'all' ||
        (selectedCategory === 'gateway' && isGateway) ||
        (selectedCategory === 'nodo' && !isGateway);

      return (
        matchesSearch &&
        matchesSite &&
        matchesCrew &&
        matchesSector &&
        matchesStatus &&
        matchesCategory
      );
    });
  }, [
    devices,
    searchQuery,
    isSuperAdmin,
    resolveDeviceSite,
    resolveDeviceCrew,
    deviceMatchesSiteFilter,
    deviceMatchesCrewFilter,
    selectedSector,
    selectedStatus,
    selectedCategory,
  ]);

  const getStatusBadge = (status: AlertSeverity) => {
    switch (status) {
      case 'critico':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-300 bg-rose-950/80 px-2 py-0.5 rounded border border-rose-800">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
            CRÍTICO
          </span>
        );
      case 'advertencia':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-800">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            ADVERTENCIA
          </span>
        );
      case 'desconectado':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-700">
            DESCONECTADO
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-300 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            NORMAL
          </span>
        );
    }
  };

  const getDeviceCategoryLabel = (device: SensorDevice) => {
    if (device.deviceCategory === 'gateway') return 'Gateway';
    if (isNodeDevice(device)) return 'Nodo Sensor';
    return 'Gateway + Nodo';
  };

  return (
    <div className="space-y-6">
      {/* Top Banner and Role-Based Filter Bar */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Radio className="w-5 h-5 text-cyan-400" />
              Monitoreo de Telemetría IoT en Vivo
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Red de Gateways y Nodos ambientales desplegados por faena, cuadrilla y sector en{' '}
              <span className="text-slate-200 font-medium">{currentSite.name}</span>.
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-medium bg-emerald-950/70 border border-emerald-700/60 text-emerald-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Telemetría en tiempo real activa</span>
              </span>
              {showTechDiagnostics && (
                <>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-mono font-semibold bg-purple-950/70 border border-purple-700/60 text-purple-200">
                    <Database className="w-3 h-3 text-purple-400" />
                    <span>Firebase RTDB: {FIREBASE_PROJECT_ID}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowSuperAdminTechView((prev) => !prev)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold border transition-colors cursor-pointer ${
                      showSuperAdminTechView
                        ? 'bg-cyan-950/80 border-cyan-500/70 text-cyan-200'
                        : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Terminal className="w-3 h-3" />
                    <span>
                      {showSuperAdminTechView ? 'Diagnóstico Técnico: Activo' : 'Activar Diagnóstico Técnico'}
                    </span>
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">Equipos visibles:</span>
            <span className="px-2.5 py-1 rounded bg-slate-800 text-white font-mono font-bold">
              {filteredDevices.length} / {devices.length}
            </span>
          </div>
        </div>

        {/* Role-based hierarchy filter bar */}
        {showFiltersBar && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {/* Search */}
          <div className="relative xl:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar por nombre, faena, cuadrilla o sector..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* SuperAdmin / Admin MineSafe: Organization selector */}
          {isGlobalAdmin && organizations.length > 0 && onSelectOrganization && (
            <div className="relative">
              <select
                value={activeOrganizationId}
                onChange={(e) => {
                  onSelectOrganization(e.target.value);
                  setSelectedSiteFilter('all');
                  setSelectedCrewFilter('all');
                  setSelectedSector('all');
                }}
                aria-label="Filtrar por organización"
                className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="all">Todas las Organizaciones</option>
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    Org: {org.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Admin & Global Admin: Faena selector */}
          {(isGlobalAdmin || isCompanyAdmin) && (
            <div className="relative">
              <select
                value={selectedSiteFilter}
                onChange={(e) => {
                  setSelectedSiteFilter(e.target.value);
                  setSelectedCrewFilter('all');
                  setSelectedSector('all');
                }}
                aria-label="Filtrar por faena"
                className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="all">Todas las Faenas</option>
                {availableSites.map((s) => (
                  <option key={s.id} value={s.id}>
                    Faena: {s.name}
                  </option>
                ))}
                {hasUnassignedSiteDevices && (
                  <option value="__unassigned__">Sin faena asignada</option>
                )}
              </select>
            </div>
          )}

          {/* Admin & Global Admin: Cuadrilla selector */}
          {(isGlobalAdmin || isCompanyAdmin) && (
            <div className="relative">
              <select
                value={selectedCrewFilter}
                onChange={(e) => {
                  setSelectedCrewFilter(e.target.value);
                  setSelectedSector('all');
                }}
                aria-label="Filtrar por cuadrilla"
                className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="all">Todas las Cuadrillas</option>
                {availableCrews.map((c) => (
                  <option key={c.id} value={c.id}>
                    Cuadrilla: {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Sector selector */}
          <div className="relative">
            <select
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              aria-label="Filtrar por sector"
              className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="all">Todos los Sectores</option>
              {availableSectors.map((sectorName) => (
                <option key={sectorName} value={sectorName}>
                  Sector: {sectorName}
                </option>
              ))}
            </select>
          </div>

          {/* Category (Gateway / Nodo) */}
          <div className="relative">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as 'all' | 'gateway' | 'nodo')}
              aria-label="Filtrar por tipo de dispositivo"
              className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="all">Gateways y Nodos</option>
              <option value="gateway">Solo Gateways</option>
              <option value="nodo">Solo Nodos Sensores</option>
            </select>
          </div>

          {/* Status selector */}
          <div className="relative">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              aria-label="Filtrar por estado"
              className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="all">Todos los Estados</option>
              <option value="normal">Normal</option>
              <option value="advertencia">Advertencia</option>
              <option value="critico">Crítico</option>
              <option value="desconectado">Desconectado</option>
            </select>
          </div>
        </div>
        )}
      </div>

      {/* Grid of Gateways & Nodes */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredDevices.map((device) => {
          const isSelected = selectedSensorId === device.id;
          const isGateway = !isNodeDevice(device);
          const coDisplay =
            device.status === 'desconectado'
              ? '--'
              : device.rawCO !== undefined
              ? `${device.rawCO} ADC`
              : `${device.metrics.co} ppm`;
          const pmDisplay =
            device.status === 'desconectado'
              ? '--'
              : device.rawPM25 !== undefined
              ? `${device.rawPM25} ADC`
              : `${device.metrics.polvoPM} µg/m³`;

          return (
            <div
              key={device.id}
              onClick={() => {
                onSelectSensor(device.id);
                soundAlert.playFeedbackBeep();
              }}
              className={`cursor-pointer rounded-xl p-4 bg-slate-900/60 border transition-all duration-150 flex flex-col justify-between ${
                isSelected
                  ? 'border-cyan-500 shadow-md shadow-cyan-950 bg-slate-900/90 ring-1 ring-cyan-500/50'
                  : 'border-slate-800 hover:border-slate-700 hover:bg-slate-900/80'
              }`}
            >
              <div>
                {/* Header: Category Badge & Status */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span
                    className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded border ${
                      isGateway
                        ? 'bg-cyan-950/70 text-cyan-300 border-cyan-800/60'
                        : 'bg-indigo-950/70 text-indigo-300 border-indigo-800/60'
                    }`}
                  >
                    {isGateway ? <Server className="w-3 h-3" /> : <Cpu className="w-3 h-3" />}
                    {getDeviceCategoryLabel(device)}
                  </span>
                  <div>{getStatusBadge(device.status)}</div>
                </div>

                {/* Friendly Device Title */}
                <h3 className="text-sm font-semibold text-white mb-2 truncate">{device.name}</h3>

                {/* Operational Hierarchy Assignment (Mina / Cuadrilla / Sector — NO worker assignment) */}
                {(() => {
                  const resolvedSite = resolveDeviceSite(device);
                  const resolvedCrew = resolveDeviceCrew(device);
                  return (
                    <div className="space-y-1 text-xs text-slate-400 mb-3 bg-slate-950/50 rounded-lg p-2.5 border border-slate-800/70">
                      <div className="flex items-center gap-1.5 truncate">
                        <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="text-slate-400">Faena:</span>
                        <span
                          className={`font-medium truncate ${
                            resolvedSite ? 'text-slate-200' : 'text-amber-300/90 italic'
                          }`}
                        >
                          {resolvedSite ? resolvedSite.name : 'Sin faena asignada'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 truncate">
                        <Users className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="text-slate-400">Cuadrilla:</span>
                        <span className="text-slate-200 font-medium truncate">
                          {resolvedCrew ? resolvedCrew.name : 'Sin cuadrilla asignada'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 truncate">
                        <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span className="text-slate-400">Sector:</span>
                        <span className="text-cyan-300 font-semibold truncate">
                          {device.sectorName || 'Sector General'}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* Live Key Metrics Mini-Grid */}
                <div className="grid grid-cols-3 gap-2 p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 text-xs mb-3">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Temp.</span>
                    <span className="font-mono font-bold text-white tabular-nums">
                      {device.status === 'desconectado' ? '--' : `${device.metrics.temperatura}°C`}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">CO / Gas</span>
                    <span
                      className={`font-mono font-bold tabular-nums ${
                        device.metrics.co > 25 ? 'text-rose-400' : 'text-slate-200'
                      }`}
                    >
                      {coDisplay}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Polvo PM2.5</span>
                    <span className="font-mono font-bold text-slate-200 tabular-nums">
                      {pmDisplay}
                    </span>
                  </div>
                </div>

                {/* SuperAdmin / Authorized Extended Technical Diagnostic Block */}
                {showTechDiagnostics && showSuperAdminTechView && (
                  <div className="mb-3 p-2.5 rounded-lg bg-purple-950/20 border border-purple-800/40 space-y-2 text-[11px]">
                    <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] font-mono">
                      <span className="text-purple-300 font-bold truncate">ID: {device.id}</span>
                      <span className="text-slate-400">
                        {device.via || 'WIFI_DIRECTO'}
                        {device.localIp ? ` · ${device.localIp}` : ''}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 pt-1.5 border-t border-purple-900/40 font-mono text-[10px]">
                      <div>
                        <span className="text-slate-400 block">O₂</span>
                        <span className="text-emerald-300 font-bold">
                          {device.metrics.o2 ?? 20.9}%
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Ventilación</span>
                        <span className="text-cyan-300 font-bold">
                          {device.metrics.flujoAire ?? 0} m/s
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Ruido</span>
                        <span className="text-amber-300 font-bold">
                          {device.metrics.ruido ?? 0} dB
                        </span>
                      </div>
                    </div>
                    {(device.parentGatewayId || (device.faultFields && device.faultFields.length > 0)) && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-purple-900/40 text-[10px]">
                        {device.parentGatewayId && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 font-mono text-slate-300">
                            GW Padre: {device.parentGatewayId}
                          </span>
                        )}
                        {device.faultFields && device.faultFields.length > 0 && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-700/70 text-amber-300 font-mono">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            Falla ADC: {device.faultFields.join(', ')}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer: Real Battery Status, Signal & Last Ping */}
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Battery
                      className={`w-3.5 h-3.5 ${
                        !device.batteryReported
                          ? 'text-slate-500'
                          : device.batteryPct < 25
                          ? 'text-rose-400'
                          : 'text-emerald-400'
                      }`}
                    />
                    <span className="tabular-nums">
                      {device.batteryReported ? `${device.batteryPct}%` : 'Sin reporte'}
                    </span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Wifi className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="capitalize">{device.signalStrength}</span>
                  </span>
                </div>
                <span>{device.lastPing}</span>
              </div>
            </div>
          );
        })}
      </div>

      {filteredDevices.length === 0 && (
        <div className="p-12 text-center bg-slate-900/40 rounded-xl border border-slate-800 text-slate-400 text-sm">
          {devices.length === 0
            ? 'Esta empresa aún no tiene dispositivos IoT asignados o activos.'
            : 'No se encontraron dispositivos que coincidan con los filtros aplicados.'}
        </div>
      )}

      {/* Node Telemetry Detail Modal */}
      {selectedDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-cyan-300 bg-cyan-950 px-2.5 py-0.5 rounded border border-cyan-800">
                    {getDeviceCategoryLabel(selectedDevice)}
                  </span>
                  {getStatusBadge(selectedDevice.status)}
                </div>
                <h2 className="text-lg font-bold text-white">{selectedDevice.name}</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Faena:{' '}
                  <strong className={resolveDeviceSite(selectedDevice) ? 'text-slate-200' : 'text-amber-300'}>
                    {resolveDeviceSite(selectedDevice)?.name || 'Sin faena asignada'}
                  </strong>{' '}
                  · Cuadrilla:{' '}
                  <strong className="text-slate-200">
                    {resolveDeviceCrew(selectedDevice)?.name || 'Sin cuadrilla'}
                  </strong>{' '}
                  · Sector: <strong className="text-cyan-400">{selectedDevice.sectorName}</strong>
                </p>
              </div>

              <button
                type="button"
                onClick={() => onSelectSensor(null)}
                className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Atmospheric Metrics Breakdown (strictly real active variables: Temp, Hum, CO2, CO, CH4, PM2.5) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                <span className="text-[11px] text-slate-400 block">Temperatura</span>
                <span className="text-lg font-bold text-white font-mono tabular-nums">
                  {selectedDevice.metrics.temperatura} °C
                </span>
                <span className="text-[10px] text-slate-400 block">Límite: &lt; 28.0 °C</span>
              </div>
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                <span className="text-[11px] text-slate-400 block">Humedad Relativa</span>
                <span className="text-lg font-bold text-white font-mono tabular-nums">
                  {selectedDevice.metrics.humedad} %
                </span>
                <span className="text-[10px] text-slate-400 block">Rango: 30 - 75 %</span>
              </div>
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                <span className="text-[11px] text-slate-400 block">CO2 (Dióxido)</span>
                <span className="text-lg font-bold text-white font-mono tabular-nums">
                  {selectedDevice.metrics.co2} ppm
                </span>
                <span className="text-[10px] text-slate-400 block">Límite: &lt; 1000 ppm</span>
              </div>
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                <span className="text-[11px] text-slate-400 block">
                  {selectedDevice.rawCO !== undefined ? 'CO / Gas (MQ-2 ADC)' : 'CO (Monóxido)'}
                </span>
                <span
                  className={`text-lg font-bold font-mono tabular-nums ${
                    selectedDevice.metrics.co > 25 ? 'text-rose-400' : 'text-white'
                  }`}
                >
                  {selectedDevice.rawCO !== undefined
                    ? `${selectedDevice.rawCO} ADC`
                    : `${selectedDevice.metrics.co} ppm`}
                </span>
                <span className="text-[10px] text-slate-400 block">
                  {selectedDevice.rawCO !== undefined ? 'Prev: < 300 ADC' : 'Límite: < 25 ppm'}
                </span>
              </div>
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                <span className="text-[11px] text-slate-400 block">CH4 (Metano)</span>
                <span className="text-lg font-bold text-white font-mono tabular-nums">
                  {selectedDevice.metrics.ch4} % LEL
                </span>
                <span className="text-[10px] text-slate-400 block">Límite: &lt; 1.5 %</span>
              </div>
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                <span className="text-[11px] text-slate-400 block">
                  {selectedDevice.rawPM25 !== undefined ? 'Polvo PM2.5 (ADC)' : 'Polvo (PM2.5)'}
                </span>
                <span className="text-lg font-bold text-white font-mono tabular-nums">
                  {selectedDevice.rawPM25 !== undefined
                    ? `${selectedDevice.rawPM25} ADC`
                    : `${selectedDevice.metrics.polvoPM} µg/m³`}
                </span>
                <span className="text-[10px] text-slate-400 block">
                  {selectedDevice.rawPM25 !== undefined ? 'Prev: < 350 ADC' : 'Límite: 50 µg/m³'}
                </span>
              </div>
              {showTechDiagnostics && (
                <>
                  <div className="p-3 bg-purple-950/20 rounded-lg border border-purple-800/50">
                    <span className="text-[11px] text-purple-300 flex items-center gap-1">
                      <HeartPulse className="w-3 h-3" /> Oxígeno (O₂)
                    </span>
                    <span className="text-lg font-bold text-emerald-300 font-mono tabular-nums">
                      {selectedDevice.metrics.o2 ?? 20.9} %
                    </span>
                    <span className="text-[10px] text-slate-400 block">Mín seguro: ≥ 19.5 %</span>
                  </div>
                  <div className="p-3 bg-purple-950/20 rounded-lg border border-purple-800/50">
                    <span className="text-[11px] text-purple-300 flex items-center gap-1">
                      <Wind className="w-3 h-3" /> Flujo de Ventilación
                    </span>
                    <span className="text-lg font-bold text-cyan-300 font-mono tabular-nums">
                      {selectedDevice.metrics.flujoAire ?? 0} m/s
                    </span>
                    <span className="text-[10px] text-slate-400 block">Rango DS 132: 0.5 – 3.5 m/s</span>
                  </div>
                  <div className="p-3 bg-purple-950/20 rounded-lg border border-purple-800/50">
                    <span className="text-[11px] text-purple-300 flex items-center gap-1">
                      <Volume2 className="w-3 h-3" /> Nivel de Ruido
                    </span>
                    <span className="text-lg font-bold text-amber-300 font-mono tabular-nums">
                      {selectedDevice.metrics.ruido ?? 0} dB
                    </span>
                    <span className="text-[10px] text-slate-400 block">Límite 8h: &lt; 85 dB</span>
                  </div>
                </>
              )}
            </div>

            {/* Technical Hardware & RTDB Diagnostics */}
            {showTechDiagnostics && (
              <div className="p-3.5 rounded-xl bg-purple-950/25 border border-purple-800/50 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold uppercase tracking-wider text-[11px] text-purple-300 flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5" />
                    Diagnóstico Técnico de Hardware &amp; RTDB (SuperAdmin)
                  </span>
                  <span className="font-mono text-[10px] text-purple-200 bg-purple-950 px-2 py-0.5 rounded border border-purple-800">
                    {FIREBASE_PROJECT_ID}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-[11px]">
                  <div className="bg-slate-950/70 p-2 rounded border border-slate-800">
                    <span className="text-[10px] text-slate-400 block font-sans">ID Hardware</span>
                    <span className="text-cyan-300 break-all">{selectedDevice.id}</span>
                  </div>
                  <div className="bg-slate-950/70 p-2 rounded border border-slate-800">
                    <span className="text-[10px] text-slate-400 block font-sans">IP Local / Vía</span>
                    <span className="text-slate-200">
                      {selectedDevice.localIp || 'N/D'} · {selectedDevice.via || 'WIFI_DIRECTO'}
                    </span>
                  </div>
                  <div className="bg-slate-950/70 p-2 rounded border border-slate-800">
                    <span className="text-[10px] text-slate-400 block font-sans">Estado / GW Padre</span>
                    <span className="text-slate-200">
                      {selectedDevice.assignmentStatus || 'asignado'}
                      {selectedDevice.parentGatewayId ? ` · ${selectedDevice.parentGatewayId}` : ''}
                    </span>
                  </div>
                </div>
                {selectedDevice.faultFields && selectedDevice.faultFields.length > 0 && (
                  <div className="text-[11px] text-amber-300 font-mono">
                    Canales ADC en falla detectados: {selectedDevice.faultFields.join(', ')}
                  </div>
                )}
              </div>
            )}

            {/* Test Simulation Controls (Solo SuperAdmin / Admin habilitado) */}
            {canSimulateEvents && showSimulationControls && (
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-cyan-400" />
                  Pruebas de Validación Operativa
                </h4>
                <p className="text-xs text-slate-400">
                  Permite validar la respuesta del sistema de alertas ante condiciones ambientales anómalas en este sector.
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => onSimulateGasSpike(selectedDevice.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-500 text-white transition-colors"
                  >
                    <Flame className="w-3.5 h-3.5" />
                    Simular Alza de Monóxido (CO 52 ppm)
                  </button>
                  <button
                    type="button"
                    onClick={() => onResetSensor(selectedDevice.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Restablecer a Valores Nominales
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => onSelectSensor(null)}
                className="px-4 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors"
              >
                Cerrar Detalle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
