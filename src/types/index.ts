export type AlertSeverity = 'normal' | 'preventivo' | 'advertencia' | 'critico' | 'desconectado';

export interface Organization {
  id: string;
  name: string;
  rut?: string;
  industry?: string;
  status: 'activa' | 'suspendida';
  createdAt: number;
  updatedAt?: number;
  createdBy?: string;
  ownerId?: string;
  ownerUid?: string;
  ownerEmail?: string;
}

export interface TelemetryHistoryPoint {
  deviceId?: string;
  timestamp: number;
  co: number | null;
  pm25: number | null;
  temperatura: number | null;
  humedad: number | null;
  originTimestamp?: number;
  serverTimestamp?: number;
  source?:
    | 'historial_telemetria'
    | 'dispositivos_historial'
    | 'dispositivos_v2_historial'
    | 'diagnostico_p087'
    | 'diagnostico_nodos_simulados'
    | 'cloud_function'
    | 'collector_api'
    | 'web_client';
}

export type CommunicationLinkMode =
  | 'wifi_directo'
  | 'espnow_gateway'
  | 'desconectado'
  | 'origen_desconocido';

export interface TelemetryHistoryPageResult {
  points: TelemetryHistoryPoint[];
  pagesFetched: number;
  truncated: boolean;
  error: string | null;
}

export type TelemetryRangeKey = '1h' | '6h' | '24h' | '7d' | '30d' | 'all' | 'custom';

export interface AlertAttachment {
  id: string;
  alertId: string;
  organizationId?: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  downloadUrl: string;
  storagePath: string;
  uploadedBy: string;
  uploadedByUid?: string;
  createdAt: number;
}

export interface TelemetryVariable {
  id: string;
  name: string;
  shortName: string;
  value: number;
  unit: string;
  trend: 'estable' | 'leve alza' | 'leve caida' | 'alza critica';
  status: AlertSeverity;
  statusLabel: string;
  thresholdMin?: number;
  thresholdMax?: number;
  lastUpdateSeconds: number;
  isSimulated?: boolean;
  historical: { timestamp: string; value: number }[];
}

export interface SensorDevice {
  id: string;
  code: string;
  name: string;
  type: 'multigas_portatil' | 'estacion_fija' | 'flujo_ventilacion' | 'sensor_geomecanico' | 'camara_termica';
  organizationId?: string;
  siteId?: string;
  siteName?: string;
  crewId?: string;
  crewName?: string;
  sectorId: string;
  sectorName: string;
  batteryPct: number;
  batteryReported?: boolean;
  signalStrength: 'optima' | 'media' | 'debil' | 'sin_conexion';
  lastPing: string;
  status: AlertSeverity;
  assignedTo?: string;
  rawCO?: number;
  rawPM25?: number;
  rawTemp?: number;
  rawHum?: number;
  sensorFault?: boolean;
  faultFields?: ('CO' | 'PM2_5' | 'temperatura' | 'humedad')[];
  lastUpdateServer?: number;
  gatewayOnline?: boolean;
  metrics: {
    temperatura: number;
    humedad: number;
    co2: number;
    co: number;
    ch4: number;
    o2: number;
    flujoAire: number;
    ruido: number;
    polvoPM: number;
  };
  alarmaActiva?: boolean;
  origenAlarma?: string;
  descripcionMonitoreo?: string;
  fecha?: string;
  hora?: string;
  fechaHora?: string;
  timestampUnix?: number;
  via?: string;
  viaPuente?: boolean | string;
  gatewayId?: string;
  saltosEspNow?: number;
  msgId?: string | number;
  isSimulated?: boolean;
  simulado?: boolean;
  modoBanco?: boolean;
  telemetryOrigin?: string;
  isBenchTelemetry?: boolean;
  isExperimentalBench?: boolean;
  sourcePath?: string;
  hasEmbeddedHistory?: boolean;
  embeddedHistoryCount?: number;
  historyPath?: string;
  nodosActivos?: number;
  adcSaturated?: boolean;
  dustSensorModel?: string;
  localIp?: string;
  deviceCategory?: DeviceCategory;
  parentGatewayId?: string;
  registroAlarmas?: Record<string, any>;
  assignmentStatus?: DeviceAssignmentStatus;
  organizationName?: string;
  assignedBy?: string;
  assignedAt?: number;
  assignmentHistory?: DeviceAssignmentAuditEntry[];
  blocked?: boolean;
  blockedAt?: number;
  blockedBy?: string;
  enabled?: boolean;
  assignedUserIds?: string[];
  sharedOrganizationIds?: string[];
  sharedWithAllAssignedUsers?: boolean;
}

export interface AlarmAuditRecord {
  id: string;
  deviceId: string;
  deviceName: string;
  fecha: string;
  hora: string;
  origen: string;
  descripcion: string;
  co: number;
  pm25: number;
  temperatura: number;
  humedad: number;
  via?: string;
  timestampServer?: number;
  metricSummary?: string;
  correctiveActions?: string;
  resolvedBy?: string;
  sourceKind?: 'esp32' | 'bitacora_web';
  alertTitle?: string;
  closingTitle?: string;
  attachments?: AlertAttachment[];
}

export interface ESP32GatewayData {
  deviceId: string;
  name: string;
  co: number;
  pm25: number;
  temperature: number;
  humidity: number;
  lastUpdateServer: number;
  isOnline: boolean;
  secondsAgo: number;
  localIp: string;
  history?: { timestamp: number; co: number; pm25: number; temp: number; hum: number }[];
}

export interface MiningSector {
  id: string;
  name: string;
  code: string;
  siteId?: string;
  crewId?: string;
  crewName?: string;
  depthMeters: number;
  type: 'socavon' | 'piquepal' | 'galeria_extraccion' | 'taller_mantencion' | 'chimenea_ventilacion';
  activeWorkers: number;
  sensorsCount: number;
  generalStatus: AlertSeverity;
  ventilationFanStatus: 'operativo_normal' | 'ventilacion_forzada' | 'en_mantencion' | 'detenido';
  assignedCrews?: string[];
}

export interface MiningSite {
  id: string;
  organizationId?: string;
  name: string;
  company: string;
  location: string;
  comuna?: string;
  region: string;
  type: 'subterranea' | 'rajo_abierto' | 'mixta';
  elevationMsl: number;
  activeSectors: MiningSector[];
  isPreloaded?: boolean;
  status?: 'activa' | 'bloqueada';
}

export type AlertResolutionType =
  | 'emergencia_real'
  | 'simulacro'
  | 'falsa_alarma_sensor'
  | 'prueba_operativa';

export interface AlertResolutionDetails {
  resolutionType: AlertResolutionType;
  closingTitle?: string;
  comment: string;
  correctiveActions?: string;
  resolvedBy: string;
  resolvedAt: string;
  attachments?: AlertAttachment[];
}

export interface DrillDebriefRecord {
  id: string;
  organizationId?: string;
  drillType: string;
  classification: 'simulacro_exitoso' | 'simulacro_con_observaciones' | 'falsa_alarma' | 'emergencia_real';
  notes: string;
  correctiveActions?: string;
  supervisorName: string;
  timestamp: number;
}

export interface SafetyAlert {
  id: string;
  code: string;
  organizationId?: string;
  title: string;
  severity: AlertSeverity;
  variableName: string;
  sensorId: string;
  sensorCode: string;
  sectorName: string;
  recordedValue: string;
  safeLimit: string;
  timestamp: string;
  timestampMs?: number;
  createdAtMs?: number;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: number;
  resolved: boolean;
  suggestedAction: string;
  resolutionDetails?: AlertResolutionDetails;
}

export interface DeviceRental {
  id: string;
  organizationId?: string;
  contractNumber: string;
  deviceCode: string;
  deviceType: string;
  provider: string;
  startDate: string;
  endDate: string;
  monthlyCostClp: number;
  paymentStatus: 'al_dia' | 'proximo_a_vencer' | 'pago_pendiente' | 'vencido';
  lastPaymentDate: string;
  nextDueDate: string;
  assignedTechnician: string;
  notes: string;
}

export interface CrewMember {
  id: string;
  userId?: string;
  assignmentId?: string;
  name: string;
  rut: string;
  role: string;
  email?: string;
  assignedDeviceCode?: string;
  emergencyContact?: string;
  isLeader?: boolean;
  addedAt: number;
}

export interface MiningCrew {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  shift: string;
  leaderName?: string;
  leaderUserId?: string;
  siteId?: string;
  siteName?: string;
  sectorId?: string;
  sectorName?: string;
  notes?: string;
  status: 'activa' | 'en_descanso' | 'inactiva' | 'bloqueada';
  members: CrewMember[];
  createdBy?: string;
  createdAt: number;
  updatedAt: number;
}

export interface WorkerAssignment {
  id: string;
  organizationId?: string;
  userId?: string;
  crewId?: string;
  workerRut: string;
  workerName: string;
  role: string;
  crew: string;
  sectorName: string;
  assignedDeviceId: string;
  assignedDeviceCode: string;
  assignmentDate: string;
  deviceBattery: number;
  emergencyContact: string;
}

export type UserRole = 'superadmin' | 'admin_minesafe' | 'admin' | 'operador' | 'supervisor';

export interface UserProfile {
  id: string;
  organizationId?: string;
  name: string;
  email: string;
  role: UserRole;
  roleLabel: string;
  rut: string;
  shift: string;
  avatarUrl?: string;
  status: 'activo' | 'inactivo';
  blockedReason?: string;
  blockedAt?: number;
  blockedBy?: string;
  pendingActivation?: boolean;
  claimedFromKey?: string;
  lastLogin?: string;
  assignedSiteId?: string;
  assignedSiteName?: string;
  assignedCrewId?: string;
  assignedCrewName?: string;
  assignedSector?: string;
  assignedSectors?: string[];
  assignedDeviceCode?: string;
  mustChangePassword?: boolean;
  passwordPolicyVersion?: number;
  passwordUpdatedAt?: number;
  legalConsentVersion?: string;
  legalConsentAcceptedAt?: number;
  anonymizedAt?: number;
  anonymizedBy?: string;
}

export type ControllableTab =
  | 'dashboard'
  | 'monitoreo'
  | 'alertas'
  | 'configuracion_alertas'
  | 'equipos'
  | 'reportes'
  | 'faenas'
  | 'usuarios'
  | 'empresas'
  | 'visor_3d'
  | 'gateway_3d';

export type EquiposSubTab =
  | 'asignaciones'
  | 'arriendos'
  | 'pagos'
  | 'inventario'
  | 'dispositivos'
  | 'empresas';

export type ControllableRoleKey = 'admin_minesafe' | 'admin' | 'operador' | 'supervisor';

export type NavigationTab =
  | ControllableTab
  | 'auditoria_seguridad'
  | 'superadmin_panel'
  | 'superadmin_vistas'
  | 'superadmin_docs';

export type WindowOverrideValue = 'inherit' | 'allow' | 'block';

export type SectionVisibilityKey =
  // Dashboard Principal
  | 'dash_hero_metrics'
  | 'dash_hero_diagnostics'
  | 'dash_welcome_banner'
  | 'dash_welcome_stats'
  | 'dash_welcome_diagnostics'
  | 'dash_dual_diagnostic_row'
  | 'dash_dual_quick_core'
  | 'dash_dual_battery_airflow'
  | 'dash_dual_o2_noise'
  | 'dash_sector_chart'
  | 'dash_sector_chart_extended'
  | 'dash_users_panel'
  | 'dash_gateway_section'
  | 'dash_gateway_hw_controls'
  | 'dash_capabilities_grid'
  | 'dash_footer_alerts'
  // Monitoreo IoT
  | 'mon_filters_bar'
  | 'mon_tech_diagnostics'
  | 'mon_simulation_controls'
  // Alertas y Auditoría
  | 'alerts_summary_cards'
  | 'alerts_filters_bar'
  | 'alerts_audit_subtab'
  | 'alerts_siren_test'
  // Config. Umbrales
  | 'cfg_scope_actions'
  | 'cfg_events_table'
  // Historial y Reportes
  | 'rep_export_csv'
  | 'rep_chart_card'
  | 'rep_audit_table'
  // Equipos y Arriendos
  | 'eq_header_kpis'
  | 'eq_subtab_bar'
  // Faenas y Sectores
  | 'faenas_sector_cards'
  | 'faenas_crews_section'
  // Visores 3D
  | 'v3d_telemetry_panel';

export interface PlatformPolicyLocks {
  /** true (default) = Operador restricted by policy to Alertas read-only; false = unlocked */
  operadorStrictPolicy: boolean;
  /** true (default) = Admin MineSafe blocked by policy on visor_3d & gateway_3d; false = unlocked */
  adminMineSafe3DPolicy: boolean;
  /** Granular per-(role, window) policy lock:
   *  - true  => explicitly locked by policy (overrides rolePermissions AND userOverrides)
   *  - false => explicitly unlocked from default policy for that (role, tab)
   *  - undefined => inherits default role policy
   */
  roleWindowPolicyLocks?: Partial<Record<ControllableRoleKey, Partial<Record<ControllableTab, boolean>>>>;
}

export interface PlatformVisibilityConfig {
  rolePermissions: {
    admin_minesafe?: Record<ControllableTab, boolean>;
    admin: Record<ControllableTab, boolean>;
    operador: Record<ControllableTab, boolean>;
    supervisor: Record<ControllableTab, boolean>;
  };
  userOverrides: Record<string, Partial<Record<ControllableTab, WindowOverrideValue>>>;
  userOverridesByEmail?: Record<string, Partial<Record<ControllableTab, WindowOverrideValue>>>;
  equiposSubTabRolePermissions?: {
    admin_minesafe?: Record<EquiposSubTab, boolean>;
    admin: Record<EquiposSubTab, boolean>;
    operador: Record<EquiposSubTab, boolean>;
    supervisor: Record<EquiposSubTab, boolean>;
  };
  equiposSubTabUserOverrides?: Record<string, Partial<Record<EquiposSubTab, WindowOverrideValue>>>;
  equiposSubTabUserOverridesByEmail?: Record<string, Partial<Record<EquiposSubTab, WindowOverrideValue>>>;
  policyLocks?: PlatformPolicyLocks;
  sectionRolePermissions?: {
    admin_minesafe?: Partial<Record<SectionVisibilityKey, boolean>>;
    admin?: Partial<Record<SectionVisibilityKey, boolean>>;
    operador?: Partial<Record<SectionVisibilityKey, boolean>>;
    supervisor?: Partial<Record<SectionVisibilityKey, boolean>>;
  };
  sectionUserOverrides?: Record<string, Partial<Record<SectionVisibilityKey, WindowOverrideValue>>>;
  sectionUserOverridesByEmail?: Record<string, Partial<Record<SectionVisibilityKey, WindowOverrideValue>>>;
}

export interface PlatformMetricsConfig {
  coPreventivo: number;
  coAdvertencia: number;
  coCritico: number;
  coChartSafeMax: number;
  pm25Preventivo: number;
  pm25Advertencia: number;
  pm25Critico: number;
  pm25ChartSafeMax: number;
  tempMin: number;
  tempPreventivo: number;
  tempAdvertencia: number;
  tempCritico: number;
  humMin: number;
  humPreventivo: number;
  humAdvertencia: number;
  humCritico: number;
  airFlowMin: number;
  airFlowMax: number;
  batteryMin: number;
  co2SafeMax: number;
  co2CriticalMax: number;
  ch4SafeMax: number;
  ch4CriticalMax: number;
  o2MinSafe: number;
  noiseSafeMax: number;
  noiseCriticalMax: number;
  gatewayTimeoutSeconds: number;
  emergencyGasThreshold: number;
  emergencyDustThreshold: number;
}

export type HeroTitleScale = 'compact' | 'normal' | 'large' | 'xlarge';

export interface TypographySettings {
  textScalePct: number;
  titleScalePct: number;
  subtitleScalePct: number;
  smallTextScalePct: number;
}

export interface PlatformAppearanceConfig {
  platformTitle: string;
  platformSubtitle: string;
  siteBadgeText: string;
  footerText: string;
  textScalePct?: number;
  titleScalePct?: number;
  subtitleScalePct?: number;
  smallTextScalePct?: number;
  heroTitleScale?: HeroTitleScale;
  announcementEnabled: boolean;
  announcementText: string;
  announcementTone: 'info' | 'warning' | 'critical';
  showChartsAndUsers: boolean;
  showESP32Section: boolean;
  showDualSensorCards: boolean;
  showHeroMetricCards: boolean;
  showCapabilitiesGrid: boolean;
  showAdditionalGasesRow: boolean;
  allowHardwareControlsForNonSuperAdmin: boolean;
  allowEmergencyButtonForOperador: boolean;
}

export type DeviceCategory = 'sensor' | 'nodo' | 'gateway' | 'gateway_sensor';

export type DeviceAssignmentStatus =
  | 'en_inventario'
  | 'asignado_empresa'
  | 'asignado_faena'
  | 'asignado_sector';

export interface DeviceAssignmentAuditEntry {
  timestamp: number;
  actorName: string;
  actorRole: UserRole;
  action:
    | 'registro'
    | 'asignacion_empresa'
    | 'asignacion_faena'
    | 'asignacion_sector'
    | 'reasignacion'
    | 'desasignacion'
    | 'bloqueo'
    | 'desbloqueo'
    | 'asignacion_usuarios'
    | 'cambio_dispositivo';
  fromOrganizationId?: string;
  fromOrganizationName?: string;
  toOrganizationId?: string;
  toOrganizationName?: string;
  toSiteId?: string;
  toSiteName?: string;
  note?: string;
}

export interface RegisteredDeviceConfig {
  id: string;
  organizationId?: string;
  organizationName?: string;
  siteId?: string;
  siteName?: string;
  crewId?: string;
  crewName?: string;
  sectorId?: string;
  name: string;
  category: DeviceCategory;
  sectorName: string;
  parentGatewayId?: string;
  localIp?: string;
  enabled?: boolean;
  active?: boolean;
  blocked?: boolean;
  blockedAt?: number;
  blockedBy?: string;
  assignedUserIds?: string[];
  sharedOrganizationIds?: string[];
  sharedWithAllAssignedUsers?: boolean;
  createdAt?: number;
  assignmentStatus?: DeviceAssignmentStatus;
  assignedBy?: string;
  assignedAt?: number;
  assignmentHistory?: DeviceAssignmentAuditEntry[];
  simulado?: boolean;
  modo_banco?: boolean;
  sourcePath?: string;
  telemetryOrigin?: string;
  gatewayId?: string;
}

export interface PlatformConfig {
  visibility: PlatformVisibilityConfig;
  metrics: PlatformMetricsConfig;
  appearance: PlatformAppearanceConfig;
  registeredDevices: RegisteredDeviceConfig[];
  onlyShowRegisteredDevices: boolean;
  actualizado_en: number;
  actualizado_por: string;
}

export type AlertThresholdLevel = 'normal' | 'preventivo' | 'advertencia' | 'critico';

export interface ThresholdVariableConfig {
  activo: boolean;
  notificaciones: boolean;
  preventivo: number;
  advertencia: number;
  critico: number;
  unidad: string;
  minVal: number;
  maxVal: number;
  label: string;
  descripcion?: string;
  silencedReason?: string;
  silencedUntilMs?: number;
  silencedBy?: string;
}

export interface DeviceThresholdsConfig {
  dispositivo_id: string;
  dispositivo_nombre?: string;
  pm25: ThresholdVariableConfig;
  mq2: ThresholdVariableConfig;
  temperatura: ThresholdVariableConfig;
  humedad: ThresholdVariableConfig;
  actualizado_en: number;
  actualizado_por: string;
  notas?: string;
}

export interface AlertEventRecord {
  id: string;
  organizationId?: string;
  dispositivo_id: string;
  dispositivo_nombre: string;
  sector_nombre: string;
  variable: 'pm25' | 'mq2' | 'temperatura' | 'humedad';
  variable_label: string;
  valor_detectado: number;
  umbral_superado: number;
  nivel: 'preventivo' | 'advertencia' | 'critico';
  unidad: string;
  timestamp: number;
  fecha_hora: string;
  estado: 'activa' | 'recuperada';
  recuperada_en?: number;
  origen: 'motor_umbrales';
}

export type SecurityAuditAction =
  | 'login_exitoso'
  | 'intento_login_fallido'
  | 'bloqueo_login_temporal'
  | 'cierre_sesion'
  | 'cierre_inactividad'
  | 'consentimiento_legal'
  | 'acceso_pii_rut'
  | 'acceso_pii_email'
  | 'exportacion_arcop'
  | 'anonimizacion_arcop'
  | 'cambio_rol_usuario'
  | 'cambio_estado_usuario'
  | 'gestion_empresa'
  | 'gestion_faena_cuadrilla'
  | 'gestion_dispositivo_iot'
  | 'control_alarma_emergencia'
  | 'cambio_umbral'
  | 'exportacion_reporte_sellado'
  | 'incidente_ciberseguridad';

export type SecurityAuditSeverity = 'info' | 'warning' | 'critical';

export interface SecurityAuditEvent {
  id: string;
  timestamp: number;
  fechaHora: string;
  action: SecurityAuditAction;
  severity: SecurityAuditSeverity;
  actorId: string;
  actorName: string;
  actorEmail: string;
  actorRole: UserRole | 'anonimo';
  organizationId?: string;
  targetType?: string;
  targetId?: string;
  targetLabel?: string;
  summary: string;
  metadata?: Record<string, string | number | boolean>;
}

export type CybersecurityIncidentSeverity = 'baja' | 'media' | 'alta' | 'critica';
export type CybersecurityIncidentStatus = 'abierto' | 'en_investigacion' | 'contenido' | 'cerrado';
export type CybersecurityIncidentCategory =
  | 'acceso_no_autorizado'
  | 'fuerza_bruta'
  | 'disponibilidad_iot'
  | 'filtracion_datos'
  | 'integridad_telemetria'
  | 'otro';

export interface CybersecurityIncident {
  id: string;
  code: string;
  title: string;
  category: CybersecurityIncidentCategory;
  severity: CybersecurityIncidentSeverity;
  status: CybersecurityIncidentStatus;
  affectedSystem: string;
  description: string;
  organizationId?: string;
  reportedById: string;
  reportedByName: string;
  reportedAt: number;
  updatedAt: number;
  csirtNotified?: boolean;
  csirtNotificationDueAt?: number;
  resolutionNotes?: string;
  resolvedBy?: string;
}

