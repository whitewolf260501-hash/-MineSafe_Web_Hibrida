import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Sliders, 
  ShieldAlert, 
  AlertTriangle, 
  CheckCircle2, 
  RotateCcw, 
  Save, 
  Info, 
  Lock, 
  Bell, 
  BellOff, 
  Filter, 
  Clock, 
  UserCheck, 
  Thermometer, 
  Droplets, 
  Wind, 
  Flame, 
  ChevronRight, 
  AlertOctagon,
  RefreshCw,
  History
} from 'lucide-react';
import { 
  SensorDevice, 
  UserProfile, 
  DeviceThresholdsConfig, 
  ThresholdVariableConfig, 
  AlertEventRecord,
  AlertThresholdLevel,
  PlatformConfig
} from '../types';
import { 
  saveThresholdConfig, 
  resetThresholdConfigToDefault, 
  subscribeToAllThresholdConfigs, 
  subscribeToAlertEvents,
  DEFAULT_GLOBAL_THRESHOLDS,
  DEFAULT_ORGANIZATION,
  RTDBSubscriptionScope,
  isSectionVisibleForUser
} from '../services/firebase';
import { alertEngine } from '../services/alertEngine';
import { isAnyAdminRole, isGlobalMineSafeAdmin } from '../utils/accessControl';

interface AlertConfigurationViewProps {
  devices: SensorDevice[];
  currentUser: UserProfile;
  platformConfig?: PlatformConfig;
  activeOrganizationId?: string;
}

export const AlertConfigurationView: React.FC<AlertConfigurationViewProps> = ({
  devices,
  currentUser,
  platformConfig,
  activeOrganizationId
}) => {
  const isSuperAdmin = currentUser.role === 'superadmin';
  const showScopeActions = isSectionVisibleForUser(
    'cfg_scope_actions',
    currentUser,
    platformConfig
  );
  const showEventsTable = isSectionVisibleForUser(
    'cfg_events_table',
    currentUser,
    platformConfig
  );
  const effectiveOrgId =
    activeOrganizationId && activeOrganizationId !== 'all'
      ? activeOrganizationId
      : isGlobalMineSafeAdmin(currentUser.role)
      ? 'all'
      : currentUser.organizationId || DEFAULT_ORGANIZATION.id;

  // Dispositivo seleccionado ('global' solo para SuperAdmin; otros roles apuntan a dispositivos de su empresa)
  const [selectedTargetId, setSelectedTargetId] = useState<string>(
    isSuperAdmin ? 'global' : devices[0]?.id || ''
  );
  
  // Mapa de todas las configuraciones cargadas de Firebase
  const [configsMap, setConfigsMap] = useState<Record<string, DeviceThresholdsConfig>>({
    global: DEFAULT_GLOBAL_THRESHOLDS
  });

  // Estado del formulario editable actual
  const [currentConfig, setCurrentConfig] = useState<DeviceThresholdsConfig>(DEFAULT_GLOBAL_THRESHOLDS);
  
  // Lista histórica de eventos de umbral
  const [eventLogs, setEventLogs] = useState<AlertEventRecord[]>([]);

  // Filtros de la tabla de eventos
  const [filterVariable, setFilterVariable] = useState<string>('all');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Estados de interfaz y acción
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [hasRemoteUpdate, setHasRemoteUpdate] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Borrador de texto para inputs numéricos (evita saltos a 0 al borrar y valida rangos extremos)
  type VarKey = 'pm25' | 'mq2' | 'temperatura' | 'humedad';
  type LevelField = 'preventivo' | 'advertencia' | 'critico';
  type NumericDraftMap = Record<VarKey, Record<LevelField, string>>;

  const buildDraftMapFromConfig = (cfg: DeviceThresholdsConfig): NumericDraftMap => ({
    mq2: {
      preventivo: String(cfg.mq2?.preventivo ?? DEFAULT_GLOBAL_THRESHOLDS.mq2.preventivo),
      advertencia: String(cfg.mq2?.advertencia ?? DEFAULT_GLOBAL_THRESHOLDS.mq2.advertencia),
      critico: String(cfg.mq2?.critico ?? DEFAULT_GLOBAL_THRESHOLDS.mq2.critico),
    },
    pm25: {
      preventivo: String(cfg.pm25?.preventivo ?? DEFAULT_GLOBAL_THRESHOLDS.pm25.preventivo),
      advertencia: String(cfg.pm25?.advertencia ?? DEFAULT_GLOBAL_THRESHOLDS.pm25.advertencia),
      critico: String(cfg.pm25?.critico ?? DEFAULT_GLOBAL_THRESHOLDS.pm25.critico),
    },
    temperatura: {
      preventivo: String(cfg.temperatura?.preventivo ?? DEFAULT_GLOBAL_THRESHOLDS.temperatura.preventivo),
      advertencia: String(cfg.temperatura?.advertencia ?? DEFAULT_GLOBAL_THRESHOLDS.temperatura.advertencia),
      critico: String(cfg.temperatura?.critico ?? DEFAULT_GLOBAL_THRESHOLDS.temperatura.critico),
    },
    humedad: {
      preventivo: String(cfg.humedad?.preventivo ?? DEFAULT_GLOBAL_THRESHOLDS.humedad.preventivo),
      advertencia: String(cfg.humedad?.advertencia ?? DEFAULT_GLOBAL_THRESHOLDS.humedad.advertencia),
      critico: String(cfg.humedad?.critico ?? DEFAULT_GLOBAL_THRESHOLDS.humedad.critico),
    },
  });

  const [numericDrafts, setNumericDrafts] = useState<NumericDraftMap>(() =>
    buildDraftMapFromConfig(DEFAULT_GLOBAL_THRESHOLDS)
  );

  // Modal de confirmación auditable al desactivar monitoreo o notificaciones
  const [pendingSilenceAction, setPendingSilenceAction] = useState<{
    variableKey: VarKey;
    variableName: string;
    field: 'activo' | 'notificaciones';
  } | null>(null);
  const [silenceReason, setSilenceReason] = useState('');
  const [silenceDurationHours, setSilenceDurationHours] = useState<number>(4);

  const devicesRef = useRef<SensorDevice[]>(devices);
  useEffect(() => {
    devicesRef.current = devices;
  }, [devices]);

  const lastLoadedTargetRef = useRef<string>('');
  const isDirtyRef = useRef<boolean>(false);
  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  const PHYSICAL_BOUNDS: Record<VarKey, { min: number; max: number }> = {
    mq2: { min: 0, max: 4095 },
    pm25: { min: 0, max: 4095 },
    temperatura: { min: -40, max: 100 },
    humedad: { min: 0, max: 100 },
  };

  // Permisos: Administradores (local o MineSafe) y SuperAdmin pueden guardar/restaurar umbrales por dispositivo
  const isAuthorized = isAnyAdminRole(currentUser.role);

  useEffect(() => {
    if (!isSuperAdmin) {
      if (devices.length > 0 && (!selectedTargetId || selectedTargetId === 'global' || !devices.some(d => d.id === selectedTargetId))) {
        setSelectedTargetId(devices[0].id);
      } else if (devices.length === 0 && selectedTargetId !== '') {
        setSelectedTargetId('');
      }
    }
  }, [isSuperAdmin, devices, selectedTargetId]);

  const deviceIdsKey = useMemo(
    () => devices.map((d) => d.id).sort().join(','),
    [devices]
  );

  const subscriptionScope = useMemo<RTDBSubscriptionScope>(
    () => ({
      role: currentUser.role,
      uid: currentUser.id,
      organizationId: effectiveOrgId,
      deviceIds: deviceIdsKey ? deviceIdsKey.split(',').filter(Boolean) : [],
    }),
    [currentUser.role, currentUser.id, effectiveOrgId, deviceIdsKey]
  );

  // 1. Suscripción en tiempo real acotada a las configuraciones permitidas en Firebase RTDB
  useEffect(() => {
    const unsub = subscribeToAllThresholdConfigs((allConfigs) => {
      setConfigsMap(allConfigs);
      
      // Sincronizar en el motor de alertas en memoria
      Object.keys(allConfigs).forEach((id) => {
        if (id === 'global') {
          alertEngine.setGlobalConfig(allConfigs.global);
        } else {
          alertEngine.setDeviceConfig(id, allConfigs[id]);
        }
      });
    }, subscriptionScope);

    return () => unsub();
  }, [subscriptionScope]);

  // 2. Suscripción a la bitácora de eventos de umbrales acotada a la organización
  useEffect(() => {
    const unsub = subscribeToAlertEvents((events) => {
      setEventLogs(events);
    }, subscriptionScope);
    return () => unsub();
  }, [subscriptionScope]);

  // 3. Hidratar el formulario SOLO cuando cambia el objetivo seleccionado o llega una actualización remota SIN edición local pendiente
  const hydrateFromRemote = (targetId: string, map: Record<string, DeviceThresholdsConfig>) => {
    const targetConfig = map[targetId];
    let resolved: DeviceThresholdsConfig;
    if (targetConfig) {
      resolved = JSON.parse(JSON.stringify(targetConfig));
    } else {
      const baseGlobal = map['global'] || DEFAULT_GLOBAL_THRESHOLDS;
      const deviceObj = devicesRef.current.find((d) => d.id === targetId);
      resolved = {
        ...JSON.parse(JSON.stringify(baseGlobal)),
        dispositivo_id: targetId,
        dispositivo_nombre: deviceObj ? deviceObj.name : `Dispositivo ${targetId}`,
        actualizado_por: 'Heredado de Plantilla Global',
      };
    }
    setCurrentConfig(resolved);
    setNumericDrafts(buildDraftMapFromConfig(resolved));
    setIsDirty(false);
    setHasRemoteUpdate(false);
    setErrorMessage(null);
  };

  useEffect(() => {
    if (!selectedTargetId) return;
    const targetChanged = lastLoadedTargetRef.current !== selectedTargetId;
    if (targetChanged) {
      lastLoadedTargetRef.current = selectedTargetId;
      hydrateFromRemote(selectedTargetId, configsMap);
      setSaveSuccessMessage(null);
      return;
    }
    if (isDirtyRef.current) {
      setHasRemoteUpdate(true);
      return;
    }
    hydrateFromRemote(selectedTargetId, configsMap);
  }, [selectedTargetId, configsMap]);

  // Manejador de cambios numéricos controlados (mantiene borrador de texto para evitar saltos a 0)
  const handleNumericInputChange = (
    variableKey: VarKey,
    field: LevelField,
    rawValue: string
  ) => {
    setNumericDrafts((prev) => ({
      ...prev,
      [variableKey]: {
        ...prev[variableKey],
        [field]: rawValue,
      },
    }));
    const trimmed = rawValue.trim();
    const parsed = trimmed === '' ? NaN : Number(trimmed);
    setCurrentConfig((prev) => ({
      ...prev,
      [variableKey]: {
        ...prev[variableKey],
        [field]: Number.isFinite(parsed) ? parsed : NaN,
      },
    }));
    setIsDirty(true);
    setSaveSuccessMessage(null);
    setErrorMessage(null);
  };

  // Manejador de cambios booleanos en monitoreo/notificaciones con confirmación de seguridad al desactivar
  const handleToggleBoolean = (
    variableKey: VarKey,
    variableName: string,
    field: 'activo' | 'notificaciones',
    nextValue: boolean
  ) => {
    if (!nextValue) {
      setPendingSilenceAction({ variableKey, variableName, field });
      setSilenceReason('');
      setSilenceDurationHours(4);
      return;
    }
    setCurrentConfig((prev) => ({
      ...prev,
      [variableKey]: {
        ...prev[variableKey],
        [field]: true,
        silencedReason: undefined,
        silencedUntilMs: undefined,
        silencedBy: undefined,
      },
    }));
    setIsDirty(true);
    setSaveSuccessMessage(null);
    setErrorMessage(null);
  };

  const handleConfirmSilence = () => {
    if (!pendingSilenceAction) return;
    const cleanReason = silenceReason.trim();
    if (cleanReason.length < 8) return;
    const silencedUntilMs =
      silenceDurationHours > 0 ? Date.now() + silenceDurationHours * 60 * 60 * 1000 : undefined;
    const { variableKey, field } = pendingSilenceAction;
    setCurrentConfig((prev) => ({
      ...prev,
      [variableKey]: {
        ...prev[variableKey],
        [field]: false,
        silencedReason: cleanReason,
        silencedUntilMs,
        silencedBy: currentUser.name || currentUser.email,
      },
    }));
    setIsDirty(true);
    setPendingSilenceAction(null);
    setSaveSuccessMessage(null);
    setErrorMessage(null);
  };

  // Validación estricta de rangos físicos [min, max] y orden matemático preventivo < advertencia < critico
  const validationErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    const vars: VarKey[] = ['pm25', 'mq2', 'temperatura', 'humedad'];

    for (const v of vars) {
      const cfg = currentConfig[v];
      if (!cfg) continue;
      const bounds = PHYSICAL_BOUNDS[v];
      const minAllowed =
        typeof cfg.minVal === 'number' && Number.isFinite(cfg.minVal)
          ? Math.max(bounds.min, cfg.minVal)
          : bounds.min;
      const maxAllowed =
        typeof cfg.maxVal === 'number' && Number.isFinite(cfg.maxVal)
          ? Math.min(bounds.max, cfg.maxVal)
          : bounds.max;

      const checks: Array<{ label: string; value: number }> = [
        { label: 'Preventivo', value: cfg.preventivo },
        { label: 'Advertencia', value: cfg.advertencia },
        { label: 'Crítico', value: cfg.critico },
      ];

      let rangeErr: string | null = null;
      for (const item of checks) {
        if (typeof item.value !== 'number' || !Number.isFinite(item.value)) {
          rangeErr = `Ingresa un valor numérico válido para ${item.label}.`;
          break;
        }
        if (item.value < minAllowed || item.value > maxAllowed) {
          rangeErr = `El umbral ${item.label} (${item.value}) está fuera del rango permitido (${minAllowed} a ${maxAllowed} ${cfg.unidad}).`;
          break;
        }
      }

      if (rangeErr) {
        errors[v] = rangeErr;
      } else if (cfg.preventivo >= cfg.advertencia) {
        errors[v] = `El umbral Preventivo (${cfg.preventivo}) debe ser estrictamente menor que Advertencia (${cfg.advertencia}).`;
      } else if (cfg.advertencia >= cfg.critico) {
        errors[v] = `El umbral Advertencia (${cfg.advertencia}) debe ser estrictamente menor que Crítico (${cfg.critico}).`;
      }
    }
    return errors;
  }, [currentConfig]);

  const hasValidationErrors = Object.keys(validationErrors).length > 0;

  // Guardar configuración en Firebase
  const handleSaveConfig = async () => {
    if (isSaving) return;
    if (!isAuthorized) {
      setErrorMessage('Permisos insuficientes: Requiere rol Administrador o SuperAdmin para aplicar cambios.');
      return;
    }

    if (hasValidationErrors) {
      setErrorMessage('Corrija los rangos inválidos o inconsistencias marcadas en rojo antes de guardar.');
      return;
    }

    if (!selectedTargetId) {
      setErrorMessage('Esta empresa aún no tiene dispositivos registrados para configurar umbrales.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setSaveSuccessMessage(null);

    try {
      const targetDevice = devicesRef.current.find((d) => d.id === selectedTargetId);
      const targetOrgId =
        targetDevice?.organizationId ||
        (effectiveOrgId !== 'all' ? effectiveOrgId : currentUser.organizationId);
      const cleanSnapshot: DeviceThresholdsConfig = JSON.parse(JSON.stringify(currentConfig));
      await saveThresholdConfig(selectedTargetId, cleanSnapshot, currentUser, targetOrgId);
      
      // Actualizar en el motor local inmediatamente
      if (selectedTargetId === 'global') {
        alertEngine.setGlobalConfig(cleanSnapshot);
      } else {
        alertEngine.setDeviceConfig(selectedTargetId, cleanSnapshot);
      }

      setIsDirty(false);
      setHasRemoteUpdate(false);
      setSaveSuccessMessage(`Configuración guardada en Firebase exitosamente para ${selectedTargetId === 'global' ? 'todos los dispositivos (Global)' : cleanSnapshot.dispositivo_nombre || selectedTargetId}.`);
      setTimeout(() => setSaveSuccessMessage(null), 5000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al guardar la configuración en Firebase RTDB.');
    } finally {
      setIsSaving(false);
    }
  };

  // Restaurar valores por defecto de fábrica
  const handleConfirmReset = async () => {
    if (!isAuthorized || !selectedTargetId) return;
    setIsResetting(true);
    setShowResetConfirmModal(false);

    try {
      const restored = await resetThresholdConfigToDefault(selectedTargetId, currentUser);
      setCurrentConfig(restored);
      setNumericDrafts(buildDraftMapFromConfig(restored));
      setIsDirty(false);
      setHasRemoteUpdate(false);
      if (selectedTargetId === 'global') {
        alertEngine.setGlobalConfig(restored);
      } else {
        alertEngine.setDeviceConfig(selectedTargetId, restored);
      }
      setSaveSuccessMessage(`Valores de fábrica de ejemplo restaurados exitosamente.`);
      setTimeout(() => setSaveSuccessMessage(null), 5000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al restaurar los valores predeterminados.');
    } finally {
      setIsResetting(false);
    }
  };

  // Filtrado de eventos de umbral (acotado por organización activa)
  const filteredEvents = useMemo(() => {
    return eventLogs.filter((evt) => {
      if (effectiveOrgId !== 'all' && (evt.organizationId || DEFAULT_ORGANIZATION.id) !== effectiveOrgId) {
        return false;
      }
      if (filterVariable !== 'all' && evt.variable !== filterVariable) return false;
      if (filterSeverity !== 'all' && evt.nivel !== filterSeverity) return false;
      if (filterStatus !== 'all' && evt.estado !== filterStatus) return false;
      return true;
    });
  }, [eventLogs, effectiveOrgId, filterVariable, filterSeverity, filterStatus]);

  // Metadatos de cada variable para el renderizado
  const variablesMetadata: Array<{
    key: 'pm25' | 'mq2' | 'temperatura' | 'humedad';
    name: string;
    icon: React.ReactNode;
    color: string;
    border: string;
    step: number;
    sensorType: string;
    helpText: string;
  }> = [
    {
      key: 'mq2',
      name: 'Gases Combustibles y Humos (MQ-2)',
      icon: <Flame className="w-5 h-5 text-amber-400" />,
      color: 'amber',
      border: 'border-amber-500/20',
      step: 10,
      sensorType: 'Sensor Semiconductor ESP32 ADC (0 - 4095)',
      helpText: 'Lectura bruta de 12 bits. Valores de ejemplo: Preventivo (300 ADC), Advertencia (800 ADC), Crítico (1200 ADC).'
    },
    {
      key: 'pm25',
      name: 'Material Particulado PM2.5 (Óptico)',
      icon: <Wind className="w-5 h-5 text-purple-400" />,
      color: 'purple',
      border: 'border-purple-500/20',
      step: 10,
      sensorType: 'Sensor Óptico de Dispersión ESP32 ADC (0 - 4095)',
      helpText: 'Lectura analógica bruta. Valores de ejemplo: Preventivo (350 ADC), Advertencia (750 ADC), Crítico (1200 ADC).'
    },
    {
      key: 'temperatura',
      name: 'Temperatura Ambiental',
      icon: <Thermometer className="w-5 h-5 text-rose-400" />,
      color: 'rose',
      border: 'border-rose-500/20',
      step: 0.5,
      sensorType: 'Sensor Digital DHT (°C)',
      helpText: 'Monitoreo de estrés térmico laboral. Valores de ejemplo: Preventivo (26°C), Advertencia (32°C), Crítico (38°C).'
    },
    {
      key: 'humedad',
      name: 'Humedad Relativa',
      icon: <Droplets className="w-5 h-5 text-cyan-400" />,
      color: 'cyan',
      border: 'border-cyan-500/20',
      step: 1,
      sensorType: 'Sensor Digital DHT (%)',
      helpText: 'Control de saturación y neblina en interior mina. Valores de ejemplo: Preventivo (70%), Advertencia (80%), Crítico (90%).'
    }
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* HEADER PRINCIPAL */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-lg relative overflow-hidden backdrop-blur-md">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400 shrink-0">
              <Sliders className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-100">
                  Configuración Dinámica de Umbrales de Alerta
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/80 border border-emerald-700 text-emerald-300">
                  Sincronización en Vivo (RTDB)
                </span>
              </div>
              <p className="text-sm text-slate-400 mt-1 max-w-3xl">
                Ajuste los límites preventivos, de advertencia y críticos sin recompilar ni reprogramar el firmware del ESP32.
                Los umbrales se guardan en Firebase Realtime Database y se aplican inmediatamente al motor de evaluación ambiental.
              </p>
            </div>
          </div>

          {/* AUDITORÍA DEL ÚLTIMO CAMBIO */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3 text-xs text-slate-400 shrink-0 min-w-[240px]">
            <div className="flex items-center gap-1.5 text-slate-300 font-medium mb-1">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Última modificación:</span>
            </div>
            <div className="text-slate-200 font-semibold truncate">
              {currentConfig.actualizado_por || 'Valores de Fábrica'}
            </div>
            <div className="text-slate-400">
              {currentConfig.actualizado_en ? new Date(currentConfig.actualizado_en).toLocaleString('es-CL') : 'Por defecto'}
            </div>
          </div>
        </div>

        {/* AVISO DE CONTROL DE ROLES / PERMISOS */}
        {!isAuthorized ? (
          <div className="mt-4 p-3 bg-rose-950/40 border border-rose-800/60 rounded-lg flex items-center gap-3 text-rose-300 text-xs">
            <Lock className="w-4 h-4 shrink-0 text-rose-400" />
            <div>
              <span className="font-semibold">Modo Solo Lectura:</span> Su usuario actual ({currentUser.name}) tiene rol de <span className="underline font-bold">{currentUser.roleLabel || currentUser.role}</span>. Únicamente los roles <strong>Administrador</strong> y <strong>SuperAdmin</strong> están autorizados para alterar los umbrales de seguridad operacional.
            </div>
          </div>
        ) : (
          <div className="mt-4 p-2.5 bg-cyan-950/30 border border-cyan-800/40 rounded-lg flex items-center justify-between text-xs text-cyan-300">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-cyan-400" />
              <span>Autorizado para editar umbrales como: <strong>{currentUser.name}</strong> ({currentUser.roleLabel})</span>
            </div>
            <span className="text-slate-400">Validado en Firebase Realtime Database</span>
          </div>
        )}
      </div>

      {/* SELECTOR DE ÁMBITO (GLOBAL VS DISPOSITIVO ESPECÍFICO) */}
      {showScopeActions && (
      <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <label htmlFor="device-target-select" className="text-sm font-semibold text-slate-200 whitespace-nowrap">
            Ámbito de Configuración:
          </label>
          <select
            id="device-target-select"
            value={selectedTargetId}
            onChange={(e) => setSelectedTargetId(e.target.value)}
            className="w-full md:w-80 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500 font-medium cursor-pointer"
          >
            {isSuperAdmin && (
              <option value="global">🌐 Configuración Global (Todos los Nodos)</option>
            )}
            <optgroup label="Dispositivos de Faena Individuales">
              {devices.length === 0 ? (
                <option value="">Sin dispositivos asignados en esta empresa</option>
              ) : (
                devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.id})
                  </option>
                ))
              )}
            </optgroup>
          </select>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          {/* BOTÓN RESTAURAR VALORES DE FÁBRICA */}
          <button
            type="button"
            disabled={!isAuthorized || !selectedTargetId || isSaving || isResetting}
            onClick={() => setShowResetConfirmModal(true)}
            className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 text-xs font-medium rounded-lg border border-slate-700 transition"
            title="Restaurar a valores predeterminados de ejemplo"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            <span>Restaurar Valores</span>
          </button>

          {/* BOTÓN GUARDAR EN FIREBASE */}
          <button
            type="button"
            disabled={!isAuthorized || !selectedTargetId || isSaving || hasValidationErrors}
            onClick={handleSaveConfig}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold text-xs rounded-lg shadow-md shadow-amber-500/20 transition"
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Guardando en Firebase...</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Guardar Cambios</span>
              </>
            )}
          </button>
        </div>
      </div>
      )}

      {/* AVISO DE EDICIÓN PENDIENTE / ACTUALIZACIÓN REMOTA */}
      {isDirty && (
        <div className="p-3 bg-amber-950/50 border border-amber-700/70 rounded-xl flex flex-wrap items-center justify-between gap-3 text-amber-200 text-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Tienes cambios sin guardar.</strong> La sincronización en vivo de telemetría está pausada sobre este formulario para evitar que tus valores se reviertan.
              {hasRemoteUpdate ? ' Se detectó una actualización remota en otro cliente.' : ''}
            </span>
          </div>
          <button
            type="button"
            onClick={() => hydrateFromRemote(selectedTargetId, configsMap)}
            className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-amber-700/60 text-amber-200 font-semibold cursor-pointer"
          >
            Descartar cambios
          </button>
        </div>
      )}

      {/* FEEDBACK BANNERS */}
      {saveSuccessMessage && (
        <div className="p-3 bg-emerald-950/60 border border-emerald-600/80 rounded-xl flex items-center gap-3 text-emerald-200 text-sm shadow-md animate-fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{saveSuccessMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 bg-rose-950/60 border border-rose-600/80 rounded-xl flex items-center gap-3 text-rose-200 text-sm shadow-md animate-fade-in">
          <AlertOctagon className="w-5 h-5 text-rose-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* TARJETAS DE VARIABLES CONFIGURABLES */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {variablesMetadata.map((vMeta) => {
          const varCfg = currentConfig[vMeta.key] || DEFAULT_GLOBAL_THRESHOLDS[vMeta.key];
          const hasError = !!validationErrors[vMeta.key];

          return (
            <div
              key={vMeta.key}
              className={`bg-slate-900/85 border ${hasError ? 'border-rose-500/80 shadow-rose-950/30' : vMeta.border} rounded-xl p-5 shadow-lg transition-all flex flex-col justify-between`}
            >
              <div>
                {/* CABECERA DE LA VARIABLE */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
                      {vMeta.icon}
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-100">
                        {vMeta.name}
                      </h2>
                      <div className="text-xs text-slate-400">
                        Unidad: <span className="font-semibold text-slate-300">{varCfg.unidad}</span> • {vMeta.sensorType}
                      </div>
                    </div>
                  </div>

                  {/* INTERRUPTOR EVALUACIÓN ACTIVA */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-slate-400 flex items-center gap-1 cursor-pointer">
                      <span>Monitoreo:</span>
                      <input
                        type="checkbox"
                        checked={varCfg.activo}
                        disabled={!isAuthorized}
                        onChange={(e) => handleToggleBoolean(vMeta.key, vMeta.name, 'activo', e.target.checked)}
                        className="w-4 h-4 accent-amber-500 rounded cursor-pointer disabled:cursor-not-allowed"
                      />
                    </label>
                  </div>
                </div>

                {/* INTERRUPTOR DE NOTIFICACIONES */}
                <div className="flex items-center justify-between py-2 px-3 bg-slate-950/60 rounded-lg border border-slate-800/80 mb-3 text-xs">
                  <div className="flex items-center gap-2 text-slate-300">
                    {varCfg.notificaciones ? (
                      <Bell className="w-3.5 h-3.5 text-amber-400" />
                    ) : (
                      <BellOff className="w-3.5 h-3.5 text-rose-400" />
                    )}
                    <span>Notificaciones sonoras y sirena en faena</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={varCfg.notificaciones}
                      disabled={!isAuthorized || !varCfg.activo}
                      onChange={(e) => handleToggleBoolean(vMeta.key, vMeta.name, 'notificaciones', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500 disabled:opacity-40" />
                  </label>
                </div>

                {/* ESTADO DE SILENCIAMIENTO AUDITADO */}
                {(!varCfg.activo || !varCfg.notificaciones) && (
                  <div className="p-2 mb-3 bg-amber-950/50 border border-amber-700/70 rounded-lg text-amber-200 text-[11px] space-y-0.5">
                    <div className="font-bold flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>
                        {!varCfg.activo ? 'Monitoreo pausado' : 'Notificaciones silenciadas'} para{' '}
                        {selectedTargetId === 'global' ? 'Plantilla Global' : `ID ${selectedTargetId}`}
                      </span>
                    </div>
                    {varCfg.silencedReason && (
                      <p className="text-amber-200/90">Motivo: {varCfg.silencedReason}</p>
                    )}
                    {varCfg.silencedUntilMs && (
                      <p className="text-amber-300/80 font-mono text-[10px]">
                        Reactivación automática: {new Date(varCfg.silencedUntilMs).toLocaleString('es-CL')}
                      </p>
                    )}
                  </div>
                )}

                {/* ADVERTENCIA DE ERROR DE VALIDACIÓN */}
                {hasError && (
                  <div className="p-2 mb-3 bg-rose-950/60 border border-rose-800 rounded-lg text-rose-300 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>{validationErrors[vMeta.key]}</span>
                  </div>
                )}

                {/* RANGO FÍSICO PERMITIDO */}
                <div className="text-[10px] text-slate-400 mb-2 flex items-center justify-between">
                  <span>
                    Rango físico permitido:{' '}
                    <strong className="text-slate-200 font-mono">
                      {PHYSICAL_BOUNDS[vMeta.key].min} – {PHYSICAL_BOUNDS[vMeta.key].max} {varCfg.unidad}
                    </strong>
                  </span>
                  <span className="font-mono text-slate-500">Prev &lt; Adv &lt; Crít</span>
                </div>

                {/* INPUTS DE LOS 3 NIVELES DE UMBRAL */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {/* PREVENTIVO */}
                  <div className="bg-slate-950/80 border border-yellow-700/40 rounded-lg p-2.5">
                    <div className="flex items-center justify-between text-xs text-yellow-400 font-semibold mb-1">
                      <span>Preventivo</span>
                      <span className="w-2 h-2 rounded-full bg-yellow-400" />
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        step={vMeta.step}
                        min={PHYSICAL_BOUNDS[vMeta.key].min}
                        max={PHYSICAL_BOUNDS[vMeta.key].max}
                        disabled={!isAuthorized || !varCfg.activo}
                        value={numericDrafts[vMeta.key]?.preventivo ?? ''}
                        onChange={(e) => handleNumericInputChange(vMeta.key, 'preventivo', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-yellow-300 font-mono focus:outline-none focus:border-yellow-500 disabled:opacity-40"
                      />
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">
                      ≥ {Number.isFinite(varCfg.preventivo) ? varCfg.preventivo : '--'} {varCfg.unidad}
                    </div>
                  </div>

                  {/* ADVERTENCIA */}
                  <div className="bg-slate-950/80 border border-orange-700/40 rounded-lg p-2.5">
                    <div className="flex items-center justify-between text-xs text-orange-400 font-semibold mb-1">
                      <span>Advertencia</span>
                      <span className="w-2 h-2 rounded-full bg-orange-400" />
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        step={vMeta.step}
                        min={PHYSICAL_BOUNDS[vMeta.key].min}
                        max={PHYSICAL_BOUNDS[vMeta.key].max}
                        disabled={!isAuthorized || !varCfg.activo}
                        value={numericDrafts[vMeta.key]?.advertencia ?? ''}
                        onChange={(e) => handleNumericInputChange(vMeta.key, 'advertencia', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-orange-300 font-mono focus:outline-none focus:border-orange-500 disabled:opacity-40"
                      />
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">
                      ≥ {Number.isFinite(varCfg.advertencia) ? varCfg.advertencia : '--'} {varCfg.unidad}
                    </div>
                  </div>

                  {/* CRÍTICO */}
                  <div className="bg-slate-950/80 border border-rose-700/40 rounded-lg p-2.5">
                    <div className="flex items-center justify-between text-xs text-rose-400 font-semibold mb-1">
                      <span>Crítico</span>
                      <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        step={vMeta.step}
                        min={PHYSICAL_BOUNDS[vMeta.key].min}
                        max={PHYSICAL_BOUNDS[vMeta.key].max}
                        disabled={!isAuthorized || !varCfg.activo}
                        value={numericDrafts[vMeta.key]?.critico ?? ''}
                        onChange={(e) => handleNumericInputChange(vMeta.key, 'critico', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-rose-300 font-mono focus:outline-none focus:border-rose-500 disabled:opacity-40"
                      />
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">
                      ≥ {Number.isFinite(varCfg.critico) ? varCfg.critico : '--'} {varCfg.unidad}
                    </div>
                  </div>
                </div>

                {/* BARRA VISUAL DE RANGO DE UMBRALES */}
                <div className="space-y-1 mb-2">
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span className="text-emerald-400">Normal (&lt; {varCfg.preventivo})</span>
                    <span className="text-yellow-400">Prev.</span>
                    <span className="text-orange-400">Adv.</span>
                    <span className="text-rose-400">Crítico (≥ {varCfg.critico})</span>
                  </div>
                  <div className="h-3 w-full bg-slate-950 rounded-full flex overflow-hidden border border-slate-800">
                    <div className="h-full bg-emerald-500/80 transition-all" style={{ width: '25%' }} title="Nivel Normal" />
                    <div className="h-full bg-yellow-400/80 transition-all" style={{ width: '25%' }} title="Nivel Preventivo" />
                    <div className="h-full bg-orange-500/80 transition-all" style={{ width: '25%' }} title="Nivel Advertencia" />
                    <div className="h-full bg-rose-600/90 transition-all" style={{ width: '25%' }} title="Nivel Crítico" />
                  </div>
                </div>
              </div>

              {/* NOTA METROLÓGICA Y DESCARGO */}
              <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-start gap-2 text-[11px] text-slate-400">
                <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <span>{vMeta.helpText}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* PRINCIPIO OPERATIVO DE SEGURIDAD MINERA */}
      <div className="bg-slate-900/60 border border-amber-800/40 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-amber-950/80 border border-amber-700/60 rounded-lg text-amber-300 shrink-0">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <span>Principio Operativo: Motor de Umbrales Ambientales Determinísticos para Faena</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1 max-w-4xl">
              <strong>Evaluación Continua:</strong> Las mediciones de cada sensor se evalúan en tiempo real frente a los límites preventivos, de advertencia y críticos estipulados por el supervisor. Toda superación activa los protocolos de ventilación y respuesta en terreno.
            </p>
          </div>
        </div>
      </div>

      {/* TABLA DE EVENTOS DE UMBRAL HISTÓRICOS Y EN VIVO */}
      {showEventsTable && (
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950/40">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-bold text-slate-100">
              Bitácora de Eventos de Umbral en Faena
            </h3>
            <span className="px-2 py-0.5 rounded-full text-xs bg-slate-800 text-slate-300 font-mono">
              {filteredEvents.length} registros
            </span>
          </div>

          {/* FILTROS DE TABLA */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 text-xs text-slate-400">
              <Filter className="w-3.5 h-3.5" />
              <span>Filtros:</span>
            </div>

            {/* VARIABLE */}
            <select
              value={filterVariable}
              onChange={(e) => setFilterVariable(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
            >
              <option value="all">Todas las Variables</option>
              <option value="mq2">MQ-2 (Gases)</option>
              <option value="pm25">PM2.5 (Polvo)</option>
              <option value="temperatura">Temperatura</option>
              <option value="humedad">Humedad</option>
            </select>

            {/* SEVERIDAD */}
            <select
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
            >
              <option value="all">Todas las Severidades</option>
              <option value="preventivo">Preventivo</option>
              <option value="advertencia">Advertencia</option>
              <option value="critico">Crítico</option>
            </select>

            {/* ESTADO */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
            >
              <option value="all">Todos los Estados</option>
              <option value="activa">Condición Activa</option>
              <option value="recuperada">Recuperada (Normal)</option>
            </select>
          </div>
        </div>

        {/* LISTADO DE EVENTOS */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <th className="p-3">Fecha y Hora</th>
                <th className="p-3">Dispositivo / Sector</th>
                <th className="p-3">Variable</th>
                <th className="p-3">Valor Detectado</th>
                <th className="p-3">Umbral Superado</th>
                <th className="p-3">Nivel de Alerta</th>
                <th className="p-3">Estado</th>
                <th className="p-3">Origen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500">
                    <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500/40 mb-2" />
                    No hay eventos de umbral que coincidan con los filtros seleccionados.<br />
                    El sistema se encuentra en condiciones ambientales dentro de los márgenes operacionales.
                  </td>
                </tr>
              ) : (
                filteredEvents.slice(0, 50).map((evt) => {
                  const isCritical = evt.nivel === 'critico';
                  const isWarning = evt.nivel === 'advertencia';
                  const isRecovered = evt.estado === 'recuperada';

                  return (
                    <tr 
                      key={evt.id} 
                      className={`hover:bg-slate-800/40 transition ${!isRecovered && isCritical ? 'bg-rose-950/20' : ''}`}
                    >
                      <td className="p-3 font-mono text-slate-400 whitespace-nowrap">
                        {evt.fecha_hora}
                      </td>
                      <td className="p-3">
                        <div className="font-semibold text-slate-200">
                          {evt.dispositivo_nombre || evt.dispositivo_id}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {evt.sector_nombre}
                        </div>
                      </td>
                      <td className="p-3 font-medium text-slate-300">
                        {evt.variable_label || evt.variable}
                      </td>
                      <td className="p-3 font-mono font-bold text-slate-100">
                        {evt.valor_detectado} <span className="text-[10px] text-slate-400 font-normal">{evt.unidad}</span>
                      </td>
                      <td className="p-3 font-mono text-slate-300">
                        ≥ {evt.umbral_superado} <span className="text-[10px] text-slate-400">{evt.unidad}</span>
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          isCritical
                            ? 'bg-rose-900/80 text-rose-200 border border-rose-700'
                            : isWarning
                            ? 'bg-orange-900/80 text-orange-200 border border-orange-700'
                            : 'bg-yellow-900/80 text-yellow-200 border border-yellow-700'
                        }`}>
                          {evt.nivel}
                        </span>
                      </td>
                      <td className="p-3">
                        {isRecovered ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Recuperada</span>
                            {evt.recuperada_en && (
                              <span className="text-[10px] text-slate-500 font-normal">
                                ({new Date(evt.recuperada_en).toLocaleTimeString('es-CL')})
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-400 font-semibold animate-pulse">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>Condición Activa</span>
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700">
                          Motor Umbrales
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* MODAL DE CONFIRMACIÓN PARA RESTAURAR VALORES */}
      {showResetConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-scale-in">
            <div className="flex items-center gap-3 text-amber-400">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <RotateCcw className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-100">
                Restaurar Umbrales por Defecto
              </h3>
            </div>

            <p className="text-sm text-slate-300">
              ¿Confirma que desea restablecer la configuración de <strong>{selectedTargetId === 'global' ? 'Ámbito Global' : `Dispositivo ${selectedTargetId}`}</strong> a los valores predeterminados de ejemplo de MineSafe?
            </p>

            <div className="bg-amber-950/40 border border-amber-800/60 p-3 rounded-lg text-xs text-amber-300">
              Esta acción sobrescribirá los límites actuales en Firebase Realtime Database y registrará una entrada en la bitácora de auditoría a nombre de <strong>{currentUser.name}</strong>.
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowResetConfirmModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg shadow-md transition"
              >
                Confirmar Restauración
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL DE CONFIRMACIÓN AUDITABLE AL PAUSAR MONITOREO O SILENCIAR NOTIFICACIONES */}
      {pendingSilenceAction && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-700/70 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2 bg-rose-500/10 rounded-lg">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">
                  Confirmar Pausa de Seguridad Operacional
                </h3>
                <p className="text-xs text-slate-400">
                  {pendingSilenceAction.field === 'activo'
                    ? 'Desactivar monitoreo ambiental'
                    : 'Silenciar notificaciones y sirena'}
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-800/70 text-xs text-rose-200 space-y-1">
              <p>
                <strong>Variable:</strong> {pendingSilenceAction.variableName}
              </p>
              <p>
                <strong>Objetivo exacto:</strong>{' '}
                {selectedTargetId === 'global'
                  ? '⚠ PLANTILLA GLOBAL (afecta a todos los dispositivos sin perfil propio)'
                  : `ID único ${selectedTargetId} (${currentConfig.dispositivo_nombre || selectedTargetId})`}
              </p>
              <p className="text-[11px] text-rose-300/90 pt-1">
                Nota: Los pines desconectados (4095 ADC) ya son filtrados automáticamente como falla de sensor; no necesitas silenciar alertas de gas por una falla física.
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Duración máxima de la pausa (reactivación automática)
                </label>
                <select
                  value={silenceDurationHours}
                  onChange={(e) => setSilenceDurationHours(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-500"
                >
                  <option value={1}>1 hora (recomendado para calibración)</option>
                  <option value={4}>4 horas (mantención programada)</option>
                  <option value={8}>8 horas (1 turno completo)</option>
                  <option value={24}>24 horas (reemplazo de sensor)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Motivo operacional auditable * (mínimo 8 caracteres)
                </label>
                <textarea
                  rows={2}
                  value={silenceReason}
                  onChange={(e) => setSilenceReason(e.target.value)}
                  placeholder="Ej: Sensor MQ-2 en calibración técnica programada por mantenimiento..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPendingSilenceAction(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={silenceReason.trim().length < 8}
                onClick={handleConfirmSilence}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-xs font-bold rounded-lg shadow-md transition cursor-pointer"
              >
                Confirmar y aplicar al borrador
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
