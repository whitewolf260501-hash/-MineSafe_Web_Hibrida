import React, { useEffect, useMemo, useState } from 'react';
import {
  Wifi,
  WifiOff,
  Server,
  Radio,
  BellRing,
  BellOff,
  CheckCircle2,
  MapPin,
  Users,
  Lock,
  Clock,
  Lightbulb,
} from 'lucide-react';
import { SensorDevice, UserProfile } from '../types';
import {
  shutdownAlarmCompletelyInRTDB,
  toggleGatewayAlarmInRTDB,
} from '../services/firebase';
import { soundAlert } from '../services/audioAlert';
import { canControlMineAlarm } from '../utils/accessControl';

interface ESP32GatewaySectionProps {
  devices: SensorDevice[];
  activeDeviceId: string;
  onSelectDevice: (deviceId: string) => void;
  onResetPageLevels?: () => void;
  isAlarmActive?: boolean;
  onToggleAlarm?: () => Promise<void> | void;
  onShutdownAlarmCompletely?: () => Promise<void> | void;
  onToggleGatewayAlarm?: (
    gatewayId: string,
    active: boolean,
    targetDeviceIds: string[]
  ) => Promise<void> | void;
  isLightActive?: boolean;
  onToggleLight?: () => void;
  isSuperAdmin?: boolean;
  currentUser?: UserProfile | null;
  timeoutSeconds?: number;
}

interface SectorGatewayGroup {
  gateway: SensorDevice;
  linkedNodes: SensorDevice[];
  targetDeviceIds: string[];
  sectorLabel: string;
  siteLabel: string;
  crewLabel: string;
  isOnline: boolean;
  lastUpdateServer: number;
  isAlarmActive: boolean;
}

export const ESP32GatewaySection: React.FC<ESP32GatewaySectionProps> = ({
  devices,
  activeDeviceId,
  onSelectDevice,
  isAlarmActive = false,
  onToggleGatewayAlarm,
  currentUser = null,
  timeoutSeconds = 20,
}) => {
  const [nowTimestamp, setNowTimestamp] = useState(Date.now());
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [busyGatewayId, setBusyGatewayId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowTimestamp(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const effectiveTimeout = Math.max(5, Number(timeoutSeconds) || 20);
  const alarmPermission = canControlMineAlarm(currentUser);
  const canControlAlarm = alarmPermission.allowed;

  const showNotification = (msg: string) => {
    setActionFeedback(msg);
    setTimeout(() => {
      setActionFeedback(null);
    }, 4000);
  };

  const isDeviceOnline = (dev: SensorDevice): boolean => {
    const serverTime = dev.lastUpdateServer || 0;
    const diffSeconds = serverTime > 0 ? Math.floor(Math.abs(nowTimestamp - serverTime) / 1000) : 999;
    return Boolean(dev.gatewayOnline) || (serverTime > 0 && diffSeconds <= effectiveTimeout) || dev.status !== 'desconectado';
  };

  const formatRelativeSync = (timestamp: number): string => {
    if (!timestamp || timestamp <= 0) return 'Sin transmisión reciente';
    const diffSeconds = Math.floor(Math.abs(nowTimestamp - timestamp) / 1000);
    if (diffSeconds < 60) return `Hace ${diffSeconds}s`;
    if (diffSeconds < 3600) return `Hace ${Math.floor(diffSeconds / 60)} min`;
    return new Date(timestamp).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  };

  // Build simplified Gateway-by-Sector list (hiding internal ESP32 IDs & technical paths)
  const gatewayGroups = useMemo<SectorGatewayGroup[]>(() => {
    const gateways = devices.filter((d) => d.deviceCategory !== 'sensor');
    const nodes = devices.filter((d) => d.deviceCategory === 'sensor');

    const groups: SectorGatewayGroup[] = [];
    const assignedNodeIds = new Set<string>();

    for (const gw of gateways) {
      const linked = nodes.filter((node) => {
        if (assignedNodeIds.has(node.id)) return false;
        if (node.parentGatewayId && node.parentGatewayId === gw.id) return true;
        if (
          !node.parentGatewayId &&
          gw.sectorName &&
          node.sectorName &&
          node.sectorName.trim().toLowerCase() === gw.sectorName.trim().toLowerCase() &&
          (!gw.organizationId || !node.organizationId || gw.organizationId === node.organizationId)
        ) {
          return true;
        }
        return false;
      });
      linked.forEach((n) => assignedNodeIds.add(n.id));

      const targetDeviceIds = Array.from(new Set([gw.id, ...linked.map((n) => n.id)]));
      const anyAlarm = Boolean(gw.alarmaActiva) || linked.some((n) => Boolean(n.alarmaActiva)) || (gateways.length === 1 && isAlarmActive);
      const latestTs = Math.max(gw.lastUpdateServer || 0, ...linked.map((n) => n.lastUpdateServer || 0));

      groups.push({
        gateway: gw,
        linkedNodes: linked,
        targetDeviceIds,
        sectorLabel: gw.sectorName || 'Sector Principal',
        siteLabel: gw.siteName || 'Faena Operativa',
        crewLabel: gw.crewName || 'Cuadrilla Asignada',
        isOnline: isDeviceOnline(gw),
        lastUpdateServer: latestTs,
        isAlarmActive: anyAlarm,
      });
    }

    // Group remaining standalone sensor nodes by sector so every sector with nodes appears cleanly
    const orphanNodes = nodes.filter((n) => !assignedNodeIds.has(n.id));
    if (orphanNodes.length > 0) {
      const bySector = new Map<string, SensorDevice[]>();
      for (const n of orphanNodes) {
        const key = (n.sectorName || 'Sector General').trim();
        const list = bySector.get(key) || [];
        list.push(n);
        bySector.set(key, list);
      }

      for (const [sectorLabel, sectorNodes] of bySector.entries()) {
        const primary = sectorNodes[0];
        const targetDeviceIds = sectorNodes.map((n) => n.id);
        const anyAlarm = sectorNodes.some((n) => Boolean(n.alarmaActiva));
        const latestTs = Math.max(...sectorNodes.map((n) => n.lastUpdateServer || 0));

        groups.push({
          gateway: primary,
          linkedNodes: sectorNodes.slice(1),
          targetDeviceIds,
          sectorLabel,
          siteLabel: primary.siteName || 'Faena Operativa',
          crewLabel: primary.crewName || 'Cuadrilla Asignada',
          isOnline: sectorNodes.some((n) => isDeviceOnline(n)),
          lastUpdateServer: latestTs,
          isAlarmActive: anyAlarm,
        });
      }
    }

    return groups;
  }, [devices, isAlarmActive, nowTimestamp, effectiveTimeout]);

  const handleToggleSectorAlarm = async (group: SectorGatewayGroup) => {
    if (!canControlAlarm) {
      showNotification(
        alarmPermission.reason ||
          'Acceso denegado: Solo la Administración de Empresa o MineSafe puede activar o apagar la alarma.'
      );
      return;
    }

    const nextActive = !group.isAlarmActive;
    setBusyGatewayId(group.gateway.id);
    try {
      if (onToggleGatewayAlarm) {
        await onToggleGatewayAlarm(group.gateway.id, nextActive, group.targetDeviceIds);
      } else if (nextActive) {
        await toggleGatewayAlarmInRTDB(group.gateway.id, true, currentUser, {
          targetDeviceIds: group.targetDeviceIds,
        });
        soundAlert.setMuted(false);
        soundAlert.startContinuousAlarm();
      } else {
        await shutdownAlarmCompletelyInRTDB(group.gateway.id, currentUser, {
          targetDeviceIds: group.targetDeviceIds,
        });
        soundAlert.stopContinuousAlarm();
      }

      const nodesLabel =
        group.targetDeviceIds.length > 1
          ? `${group.targetDeviceIds.length} equipos (Gateway y nodos vinculados)`
          : 'el Gateway del sector';

      showNotification(
        nextActive
          ? `Alarma sonora y baliza luminosa activadas automáticamente en ${nodesLabel} (${group.sectorLabel}).`
          : `Alarma y baliza luminosa apagadas en ${nodesLabel} (${group.sectorLabel}).`
      );
    } catch (err: any) {
      showNotification(err?.message || 'No se pudo enviar la instrucción de alarma al Gateway.');
    } finally {
      setBusyGatewayId(null);
    }
  };

  const onlineGatewaysCount = gatewayGroups.filter((g) => g.isOnline).length;
  const activeAlarmsCount = gatewayGroups.filter((g) => g.isAlarmActive).length;

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 mb-8 shadow-xl backdrop-blur-md relative overflow-hidden">
      {/* Subtle status glow */}
      <div
        className={`absolute top-0 right-0 w-72 h-72 rounded-full blur-3xl pointer-events-none transition-colors duration-500 ${
          activeAlarmsCount > 0 ? 'bg-rose-500/15' : 'bg-cyan-500/5'
        }`}
      />

      {/* Action feedback toast */}
      {actionFeedback && (
        <div className="mb-4 p-3 bg-cyan-950/90 border border-cyan-500/60 text-cyan-200 rounded-xl text-xs font-semibold flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>{actionFeedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="text-cyan-400 hover:text-white text-[10px] font-bold"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800/80 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-950 border border-cyan-800 text-cyan-400 flex items-center justify-center shadow-md shadow-cyan-950/50 shrink-0">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-tight">
                Gateways por Sector y Control de Alarma
              </h2>
              <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-950/60 text-emerald-300 border border-emerald-800/60">
                {onlineGatewaysCount} / {gatewayGroups.length} en línea
              </span>
              {activeAlarmsCount > 0 && (
                <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-600 text-white animate-pulse flex items-center gap-1">
                  <BellRing className="w-3 h-3" /> {activeAlarmsCount} Alarma Activa
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Vista consolidada de enlaces por sector. La baliza luminosa se activa y apaga automáticamente junto con la alarma.
            </p>
          </div>
        </div>

        {!canControlAlarm && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] text-slate-400 shrink-0">
            <Lock className="w-3.5 h-3.5 text-amber-400" />
            <span>Control de alarma reservado a Administración</span>
          </div>
        )}
      </div>

      {/* Simplified Gateway Cards List */}
      {gatewayGroups.length === 0 ? (
        <div className="mt-5 p-6 rounded-xl bg-slate-950/70 border border-slate-800 text-center text-xs text-slate-400">
          No hay Gateways ni nodos asignados a los sectores visibles para tu perfil.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-5 relative z-10">
          {gatewayGroups.map((group) => {
            const isSelected = activeDeviceId === group.gateway.id;
            const onlineNodesCount = group.linkedNodes.filter((n) => isDeviceOnline(n)).length;
            const isBusy = busyGatewayId === group.gateway.id;

            return (
              <div
                key={group.gateway.id}
                onClick={() => onSelectDevice(group.gateway.id)}
                className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-4 ${
                  group.isAlarmActive
                    ? 'bg-rose-950/35 border-rose-500/70 shadow-lg shadow-rose-950/30'
                    : isSelected
                    ? 'bg-slate-950/90 border-cyan-500/70 shadow-md shadow-cyan-950/30'
                    : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Top Row: Name + Connection Status */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Radio
                        className={`w-4 h-4 shrink-0 ${
                          group.isAlarmActive
                            ? 'text-rose-400 animate-pulse'
                            : group.isOnline
                            ? 'text-cyan-400'
                            : 'text-slate-500'
                        }`}
                      />
                      <h3 className="text-sm font-bold text-white truncate">
                        {group.gateway.name}
                      </h3>
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                      <span className="inline-flex items-center gap-1 text-cyan-300 font-medium">
                        <MapPin className="w-3 h-3" />
                        {group.sectorLabel}
                      </span>
                      <span>•</span>
                      <span>{group.siteLabel}</span>
                      {group.crewLabel && (
                        <>
                          <span>•</span>
                          <span className="inline-flex items-center gap-1">
                            <Users className="w-3 h-3 text-slate-500" />
                            {group.crewLabel}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Connection Pill */}
                  {group.isOnline ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-[11px] font-bold shrink-0">
                      <Wifi className="w-3 h-3" />
                      En línea
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-950/70 border border-rose-500/50 text-rose-300 text-[11px] font-bold shrink-0">
                      <WifiOff className="w-3 h-3" />
                      Desconectado
                    </span>
                  )}
                </div>

                {/* Middle Info: Subordinate Nodes + Sync + Auto Beacon Status */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-3 border-t border-slate-800/80 text-[11px]">
                  <div className="bg-slate-900/70 rounded-lg px-2.5 py-2 border border-slate-800/70">
                    <span className="text-slate-400 block text-[10px]">Nodos vinculados</span>
                    <span className="font-bold text-white">
                      {group.linkedNodes.length === 0
                        ? 'Gateway directo'
                        : `${onlineNodesCount} / ${group.linkedNodes.length} activos`}
                    </span>
                  </div>
                  <div className="bg-slate-900/70 rounded-lg px-2.5 py-2 border border-slate-800/70">
                    <span className="text-slate-400 block text-[10px]">Última señal</span>
                    <span className="font-semibold text-slate-200 inline-flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      {formatRelativeSync(group.lastUpdateServer)}
                    </span>
                  </div>
                  <div className="col-span-2 sm:col-span-1 bg-slate-900/70 rounded-lg px-2.5 py-2 border border-slate-800/70">
                    <span className="text-slate-400 block text-[10px]">Baliza y sirena</span>
                    <span
                      className={`font-bold inline-flex items-center gap-1 ${
                        group.isAlarmActive ? 'text-rose-300' : 'text-emerald-300'
                      }`}
                    >
                      <Lightbulb className="w-3 h-3" />
                      {group.isAlarmActive ? 'Activas (auto)' : 'En reposo'}
                    </span>
                  </div>
                </div>

                {/* Action Footer: Alarm toggle strictly for authorized mining company Admin / Global Admin */}
                {canControlAlarm && (
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <span className="text-[11px] text-slate-400">
                      Propagación simultánea a{' '}
                      <strong className="text-slate-200">{group.targetDeviceIds.length}</strong>{' '}
                      {group.targetDeviceIds.length === 1 ? 'equipo' : 'equipos'}
                    </span>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleSectorAlarm(group);
                      }}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-sm shrink-0 ${
                        group.isAlarmActive
                          ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/60'
                          : 'bg-slate-800 hover:bg-rose-600/90 text-slate-100 border border-slate-700 hover:border-rose-500'
                      } ${isBusy ? 'opacity-60 cursor-wait' : ''}`}
                    >
                      {group.isAlarmActive ? (
                        <>
                          <BellRing className="w-3.5 h-3.5 animate-bounce" />
                          <span>{isBusy ? 'Enviando...' : 'Apagar Alarma y Baliza'}</span>
                        </>
                      ) : (
                        <>
                          <BellOff className="w-3.5 h-3.5" />
                          <span>{isBusy ? 'Enviando...' : 'Activar Alarma'}</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
