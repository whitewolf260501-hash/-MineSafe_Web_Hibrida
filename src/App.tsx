import React, { useState, useEffect, useCallback, useMemo, Suspense, lazy } from 'react';
import { Navbar } from './components/Navbar';
import { DashboardView } from './components/DashboardView';
import { MonitoringView } from './components/MonitoringView';
import { AlertsView } from './components/AlertsView';
import { DevicesAndRentalsView } from './components/DevicesAndRentalsView';
import { HistoricalReportsView } from './components/HistoricalReportsView';
import { MiningSectorsView } from './components/MiningSectorsView';
import { UsersManagementView } from './components/UsersManagementView';
import { AlertConfigurationView } from './components/AlertConfigurationView';
import { SuperAdminControlView } from './components/SuperAdminControlView';
import { SuperAdminViewsCustomizerView } from './components/SuperAdminViewsCustomizerView';
import { LoginModal } from './components/LoginModal';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { TypographyControlModal } from './components/TypographyControlModal';
import { EmergencyModal, DrillType } from './components/EmergencyModal';
import { alertEngine } from './services/alertEngine';

const Node3DInspectorView = lazy(() => import('./components/Node3DInspectorView'));
const Gateway3DInspectorView = lazy(() => import('./components/Gateway3DInspectorView'));
const SuperAdminDocsView = lazy(() => import('./components/SuperAdminDocsView'));
import { CompanyBulkManagementView } from './components/CompanyBulkManagementView';


import { 
  NavigationTab, 
  ControllableTab,
  TelemetryVariable, 
  SensorDevice, 
  SafetyAlert, 
  DeviceRental, 
  WorkerAssignment, 
  MiningSite, 
  UserProfile,
  UserRole,
  AlertResolutionDetails,
  DrillDebriefRecord,
  PlatformConfig,
  RegisteredDeviceConfig,
  Organization,
  TelemetryHistoryPoint,
  AlertEventRecord,
  MiningCrew,
  TypographySettings
} from './types';
import {
  TelemetryRangeWindow,
  computeTelemetryWindow,
} from './components/HistoricalReportsView';

import { 
  INITIAL_VARIABLES, 
  MINING_SITES, 
  INITIAL_ALERTS, 
  INITIAL_RENTALS, 
  INITIAL_ASSIGNMENTS
} from './data/mockData';

import {
  canControlMineAlarm,
  canModifyTargetUser,
  canProvisionUserInOrganization,
  canManageContractsAndPayments,
  canManageCrews,
  createEmptyTelemetryVariables,
  filterScopedUsers,
  getAuthorizedOrganizationIds,
  isAnyAdminRole,
  isGlobalMineSafeAdmin,
  isOrgAuthorizedForUser,
  isUnassignedDeviceOrg,
  resolveEffectiveOrgId,
  resolveScopedCurrentSite,
  DEFAULT_ORGANIZATION_ID,
  UNASSIGNED_DEVICE_ORG_ID,
} from './utils/accessControl';

export { createEmptyTelemetryVariables, resolveScopedCurrentSite };

import { 
  testConnection, 
  subscribeToRTDBDevicesRaw,
  subscribeToDeviceCatalog,
  forceRefreshDevicesFromRTDB,
  mapRTDBDeviceToSensorDevice,
  subscribeToRTDBUsers, 
  subscribeToRTDBRentals,
  subscribeToRTDBOrganizations,
  subscribeToRTDBAssignments,
  saveAssignmentToRTDB,
  subscribeToAllThresholdConfigs,
  subscribeToAlertEvents,
  recordTelemetryHistoryPoint,
  subscribeToTelemetryHistory,
  fetchPaginatedTelemetryHistory,
  DEFAULT_ORGANIZATION,
  addUserToRTDB,
  updateUserInRTDB,
  addRentalContractToRTDB,
  updateRentalContractInRTDB,
  recordPaymentInRTDB,
  toggleGatewayAlarmInRTDB,
  shutdownAlarmCompletelyInRTDB,
  toggleGatewayLightInRTDB,
  resetGatewayDataInRTDB,
  broadcastDrillToRTDB,
  broadcastAlertToRTDB,
  acknowledgeAlertInRTDB,
  subscribeToRTDBAlerts,
  subscribeToRTDBDrill,
  resolveAlertInRTDB,
  resolveActiveAlertsInRTDB,
  saveDrillDebriefInRTDB,
  DEFAULT_PLATFORM_CONFIG,
  clampTextScalePct,
  clampTitleScalePct,
  clampSubtitleScalePct,
  clampSmallTextScalePct,
  savePlatformConfig,
  subscribeToPlatformConfig,
  isTabVisibleForUser,
  isSectionVisibleForUser,
  verifySuperAdminPrivileges,
  loadCachedSites,
  mergeMiningSites,
  saveSiteToRTDB,
  subscribeToRTDBSites,
  loadCachedCrews,
  mergeMiningCrews,
  saveCrewToRTDB,
  deleteCrewFromRTDB,
  subscribeToRTDBCrews,
  RTDBSubscriptionScope,
  BulkImportExecutionResult
} from './services/firebase';

import { soundAlert } from './services/audioAlert';
import { ShieldAlert, AlertTriangle, X, Megaphone, Lock, CheckCircle2 } from 'lucide-react';

const INITIAL_SINGLE_DEVICE: SensorDevice = {
  id: 'device_38A839E81F84',
  code: 'device_38A839E81F84',
  organizationId: DEFAULT_ORGANIZATION.id,
  name: 'Gateway Principal Sector Rampa',
  type: 'estacion_fija',
  sectorId: 'sec-device_38A839E81F84',
  sectorName: 'Mina Chuquicamata - Rampa Principal',
  batteryPct: 0,
  batteryReported: false,
  signalStrength: 'debil',
  lastPing: 'Conectando...',
  status: 'desconectado',
  assignedTo: '',
  deviceCategory: 'gateway_sensor',
  localIp: '192.168.4.1',
  gatewayOnline: false,
  metrics: {
    temperatura: 0,
    humedad: 0,
    co2: 0,
    co: 0,
    ch4: 0,
    o2: 0,
    flujoAire: 0,
    ruido: 0,
    polvoPM: 0,
  },
};

export interface MineSafePanelProps {
  authenticatedUser: UserProfile;
  onSessionUserUpdated?: (user: UserProfile) => void;
  onLogoutRequest: () => Promise<void>;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export default function App({
  authenticatedUser,
  onSessionUserUpdated,
  onLogoutRequest,
  theme,
  onToggleTheme,
}: MineSafePanelProps) {
  const initialUserOrgId =
    isGlobalMineSafeAdmin(authenticatedUser.role)
      ? 'all'
      : authenticatedUser.organizationId || DEFAULT_ORGANIZATION_ID;
  const allowInitialPrincipalDefaults =
    isGlobalMineSafeAdmin(authenticatedUser.role) ||
    initialUserOrgId === DEFAULT_ORGANIZATION.id;

  const [currentTab, setCurrentTab] = useState<NavigationTab>(() =>
    authenticatedUser.role === 'operador' ? 'alertas' : 'dashboard'
  );
  const [variables, setVariables] = useState<TelemetryVariable[]>(() => createEmptyTelemetryVariables());
  const [devices, setDevices] = useState<SensorDevice[]>([]);
  const [alerts, setAlerts] = useState<SafetyAlert[]>([]);
  const alertsRef = React.useRef<SafetyAlert[]>([]);
  alertsRef.current = alerts;
  const processedDismissedAlertIdsRef = React.useRef<Set<string>>(new Set());
  const rawDevicesRef = React.useRef<Record<string, any>>({});
  const timeoutSecondsRef = React.useRef<number>(DEFAULT_PLATFORM_CONFIG.metrics.gatewayTimeoutSeconds || 20);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [activeOrganizationId, setActiveOrganizationId] = useState<string>(initialUserOrgId);
  const [telemetryHistory, setTelemetryHistory] = useState<TelemetryHistoryPoint[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState<boolean>(false);
  const [historyTruncated, setHistoryTruncated] = useState<boolean>(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [alertEvents, setAlertEvents] = useState<AlertEventRecord[]>([]);
  const [rentals, setRentals] = useState<DeviceRental[]>([]);
  const [assignments, setAssignments] = useState<WorkerAssignment[]>([]);
  const [sites, setSites] = useState<MiningSite[]>(() => {
    const cachedScoped = loadCachedSites().filter((s) =>
      allowInitialPrincipalDefaults
        ? true
        : (s.organizationId || DEFAULT_ORGANIZATION.id) === initialUserOrgId
    );
    return allowInitialPrincipalDefaults
      ? mergeMiningSites(MINING_SITES, cachedScoped)
      : cachedScoped;
  });
  const [currentSite, setCurrentSite] = useState<MiningSite>(() =>
    resolveScopedCurrentSite(
      sites,
      undefined,
      initialUserOrgId === 'all' ? DEFAULT_ORGANIZATION.id : initialUserOrgId
    )
  );
  const [crews, setCrews] = useState<MiningCrew[]>(() =>
    loadCachedCrews().filter((c) =>
      allowInitialPrincipalDefaults
        ? true
        : (c.organizationId || DEFAULT_ORGANIZATION.id) === initialUserOrgId
    )
  );
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [currentUser, setCurrentUser] = useState<UserProfile>(authenticatedUser);

  const [selectedSensorId, setSelectedSensorId] = useState<string | null>(null);
  const [activeTelemetryDeviceId, setActiveTelemetryDeviceId] = useState<string>(
    allowInitialPrincipalDefaults ? 'device_38A839E81F84' : ''
  );
  const [telemetryWindow, setTelemetryWindow] = useState<TelemetryRangeWindow>(() =>
    computeTelemetryWindow('24h')
  );
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState<boolean>(false);
  const [showTypographyModal, setShowTypographyModal] = useState<boolean>(false);
  const [showEmergencyModal, setShowEmergencyModal] = useState<boolean>(false);
  const [evacuationActive, setEvacuationActive] = useState<boolean>(false);
  const [isFirebaseConnected, setIsFirebaseConnected] = useState<boolean>(false);
  const [isAlarmActive, setIsAlarmActive] = useState<boolean>(false);
  const [isLightActive, setIsLightActive] = useState<boolean>(false);
  const [dismissEmergencyBanner, setDismissEmergencyBanner] = useState<boolean>(false);
  const [isDrillActive, setIsDrillActive] = useState<boolean>(false);
  const [drillType, setDrillType] = useState<DrillType | null>(null);
  const [platformConfig, setPlatformConfig] = useState<PlatformConfig>(DEFAULT_PLATFORM_CONFIG);
  const [catalogDevices, setCatalogDevices] = useState<RegisteredDeviceConfig[]>([]);
  const [previewTextScalePct, setPreviewTextScalePct] = useState<number | null>(null);
  const [previewTypography, setPreviewTypography] = useState<TypographySettings | null>(null);
  const [localTypographyOverride, setLocalTypographyOverride] = useState<TypographySettings | null>(() => {
    try {
      const raw = localStorage.getItem('minesafe_user_typography_v1');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return {
        textScalePct: clampTextScalePct(parsed?.textScalePct),
        titleScalePct: clampTitleScalePct(parsed?.titleScalePct),
        subtitleScalePct: clampSubtitleScalePct(parsed?.subtitleScalePct),
        smallTextScalePct: clampSmallTextScalePct(parsed?.smallTextScalePct),
      };
    } catch {
      return null;
    }
  });
  const [alarmFeedback, setAlarmFeedback] = useState<{ message: string; tone: 'error' | 'success' } | null>(null);

  useEffect(() => {
    setCurrentUser(authenticatedUser);
  }, [authenticatedUser]);

  const handleToggleTheme = onToggleTheme;

  const showAlarmFeedback = useCallback((message: string, tone: 'error' | 'success') => {
    setAlarmFeedback({ message, tone });
    setTimeout(() => {
      setAlarmFeedback((prev) => (prev?.message === message ? null : prev));
    }, 5000);
  }, []);

  // Keep timeout ref synchronized with SuperAdmin platform metrics
  timeoutSecondsRef.current = platformConfig.metrics.gatewayTimeoutSeconds || 20;

  // Escala tipográfica granular (Títulos, Subtítulos, Textos en general y Etiquetas)
  const globalTypography = useMemo<TypographySettings>(
    () => ({
      textScalePct: clampTextScalePct(platformConfig.appearance?.textScalePct),
      titleScalePct: clampTitleScalePct(platformConfig.appearance?.titleScalePct),
      subtitleScalePct: clampSubtitleScalePct(platformConfig.appearance?.subtitleScalePct),
      smallTextScalePct: clampSmallTextScalePct(platformConfig.appearance?.smallTextScalePct),
    }),
    [platformConfig.appearance]
  );

  const effectiveTypography = useMemo<TypographySettings>(() => {
    if (previewTypography) {
      return {
        textScalePct: clampTextScalePct(previewTypography.textScalePct),
        titleScalePct: clampTitleScalePct(previewTypography.titleScalePct),
        subtitleScalePct: clampSubtitleScalePct(previewTypography.subtitleScalePct),
        smallTextScalePct: clampSmallTextScalePct(previewTypography.smallTextScalePct),
      };
    }
    if (previewTextScalePct !== null) {
      return {
        ...globalTypography,
        textScalePct: clampTextScalePct(previewTextScalePct),
      };
    }
    if (localTypographyOverride) {
      return localTypographyOverride;
    }
    return globalTypography;
  }, [previewTypography, previewTextScalePct, localTypographyOverride, globalTypography]);

  const effectiveTextScalePct = effectiveTypography.textScalePct;
  const isCustomTypographyActive =
    effectiveTypography.textScalePct !== 100 ||
    effectiveTypography.titleScalePct !== 100 ||
    effectiveTypography.subtitleScalePct !== 100 ||
    effectiveTypography.smallTextScalePct !== 100;

  const handleLocalTypographyChange = useCallback((next: TypographySettings) => {
    const normalized: TypographySettings = {
      textScalePct: clampTextScalePct(next.textScalePct),
      titleScalePct: clampTitleScalePct(next.titleScalePct),
      subtitleScalePct: clampSubtitleScalePct(next.subtitleScalePct),
      smallTextScalePct: clampSmallTextScalePct(next.smallTextScalePct),
    };
    setLocalTypographyOverride(normalized);
    try {
      localStorage.setItem('minesafe_user_typography_v1', JSON.stringify(normalized));
    } catch {
      // ignore storage quota errors
    }
  }, []);

  const handleResetTypographyToGlobal = useCallback(() => {
    setLocalTypographyOverride(null);
    setPreviewTypography(null);
    setPreviewTextScalePct(null);
    try {
      localStorage.removeItem('minesafe_user_typography_v1');
    } catch {
      // ignore storage errors
    }
  }, []);

  const handleSaveGlobalTypography = useCallback(
    async (next: TypographySettings) => {
      if (currentUser.role !== 'superadmin') return;
      const updatedConfig: PlatformConfig = {
        ...platformConfig,
        appearance: {
          ...platformConfig.appearance,
          textScalePct: clampTextScalePct(next.textScalePct),
          titleScalePct: clampTitleScalePct(next.titleScalePct),
          subtitleScalePct: clampSubtitleScalePct(next.subtitleScalePct),
          smallTextScalePct: clampSmallTextScalePct(next.smallTextScalePct),
        },
      };
      await savePlatformConfig(updatedConfig, currentUser);
      setPlatformConfig(updatedConfig);
      // Clear local override so global config stays the single source of truth
      setLocalTypographyOverride(null);
      setPreviewTypography(null);
      setPreviewTextScalePct(null);
      try {
        localStorage.removeItem('minesafe_user_typography_v1');
      } catch {
        // ignore
      }
    },
    [currentUser, platformConfig]
  );

  useEffect(() => {
    const root = document.documentElement;
    const anyScaled =
      effectiveTypography.textScalePct !== 100 ||
      effectiveTypography.titleScalePct !== 100 ||
      effectiveTypography.subtitleScalePct !== 100 ||
      effectiveTypography.smallTextScalePct !== 100;

    if (!anyScaled) {
      root.style.fontSize = '';
      root.style.removeProperty('--ms-text-scale');
      root.style.removeProperty('--ms-title-scale');
      root.style.removeProperty('--ms-subtitle-scale');
      root.style.removeProperty('--ms-small-scale');
      root.removeAttribute('data-text-scaled');
    } else {
      root.style.fontSize = '';
      root.style.setProperty('--ms-text-scale', (effectiveTypography.textScalePct / 100).toFixed(3));
      root.style.setProperty('--ms-title-scale', (effectiveTypography.titleScalePct / 100).toFixed(3));
      root.style.setProperty('--ms-subtitle-scale', (effectiveTypography.subtitleScalePct / 100).toFixed(3));
      root.style.setProperty('--ms-small-scale', (effectiveTypography.smallTextScalePct / 100).toFixed(3));
      root.setAttribute('data-text-scaled', 'true');
    }
    return () => {
      root.style.fontSize = '';
      root.style.removeProperty('--ms-text-scale');
      root.style.removeProperty('--ms-title-scale');
      root.style.removeProperty('--ms-subtitle-scale');
      root.style.removeProperty('--ms-small-scale');
      root.removeAttribute('data-text-scaled');
    };
  }, [effectiveTypography, effectiveTextScalePct]);

  // Multi-organization scoping: SuperAdmin can switch any org or inspect all ('all');
  // Admins can switch between their primary org and organizations they created/own.
  const effectiveOrgId = resolveEffectiveOrgId(currentUser, activeOrganizationId, organizations);

  const matchesOrg = useCallback(
    (orgId?: string) => {
      if (orgId === UNASSIGNED_DEVICE_ORG_ID) return false;
      return effectiveOrgId === 'all' || (orgId || DEFAULT_ORGANIZATION.id) === effectiveOrgId;
    },
    [effectiveOrgId]
  );

  const mergedRegisteredDevices = useMemo<RegisteredDeviceConfig[]>(() => {
    const byId = new Map<string, RegisteredDeviceConfig>();
    (platformConfig.registeredDevices || DEFAULT_PLATFORM_CONFIG.registeredDevices).forEach((d) =>
      byId.set(d.id, d)
    );
    catalogDevices.forEach((d) => byId.set(d.id, d));
    return Array.from(byId.values());
  }, [platformConfig.registeredDevices, catalogDevices]);

  const scopedDeviceIdsKey = useMemo(() => {
    const regList = mergedRegisteredDevices;
    const ids = regList
      .filter((r) => r.enabled !== false && matchesOrg(r.organizationId))
      .map((r) => r.id);
    if (ids.length === 0 && (effectiveOrgId === 'all' || effectiveOrgId === DEFAULT_ORGANIZATION.id)) {
      ids.push('device_38A839E81F84');
    }
    return Array.from(new Set(ids)).sort().join(',');
  }, [mergedRegisteredDevices, matchesOrg, effectiveOrgId]);

  const subscriptionScope = useMemo<RTDBSubscriptionScope>(
    () => ({
      role: currentUser?.role,
      uid: currentUser?.id,
      organizationId: effectiveOrgId,
      deviceIds: scopedDeviceIdsKey ? scopedDeviceIdsKey.split(',').filter(Boolean) : [],
    }),
    [currentUser?.role, currentUser?.id, effectiveOrgId, scopedDeviceIdsKey]
  );

  const recomputeDevicesFromRaw = useCallback(() => {
    const raw = rawDevicesRef.current || {};
    const keys = Object.keys(raw);
    if (keys.length === 0) {
      setDevices([]);
      return;
    }
    const timeout = timeoutSecondsRef.current || 20;
    const mapped = keys.map((key) => mapRTDBDeviceToSensorDevice(key, raw[key], timeout));
    setDevices(mapped);
    mapped.forEach((dev) => {
      recordTelemetryHistoryPoint(dev).catch(() => {});
    });
  }, []);

  // Suscripción global de plataforma + chequeo periódico de latencia de dispositivos
  useEffect(() => {
    let unsubPlatform: (() => void) | null = null;

    const staleCheckInterval = setInterval(recomputeDevicesFromRaw, 2000);

    unsubPlatform = subscribeToPlatformConfig((cfg) => {
      setPlatformConfig(cfg);
      timeoutSecondsRef.current = cfg.metrics.gatewayTimeoutSeconds || 20;
      recomputeDevicesFromRaw();
    });

    return () => {
      clearInterval(staleCheckInterval);
      if (unsubPlatform) unsubPlatform();
      soundAlert.stopContinuousAlarm();
      rawDevicesRef.current = {};
      alertsRef.current = [];
      alertEngine.clearActiveIncidents();
    };
  }, [recomputeDevicesFromRaw]);

  // Suscripción a umbrales acotada por rol y dispositivos de la organización activa
  useEffect(() => {
    const unsubThresholds = subscribeToAllThresholdConfigs((configs) => {
      if (configs.global) {
        alertEngine.setGlobalConfig(configs.global);
      }
      Object.entries(configs).forEach(([id, cfg]) => {
        if (id !== 'global') {
          alertEngine.setDeviceConfig(id, cfg);
        }
      });
    }, subscriptionScope);

    return () => {
      unsubThresholds();
    };
  }, [subscriptionScope]);

  // Verificación acotada de conexión y suscripción aislada por organización a simulacros
  useEffect(() => {
    let cancelled = false;
    testConnection(subscriptionScope)
      .then((connected) => {
        if (!cancelled) setIsFirebaseConnected(connected);
      })
      .catch(() => {
        if (!cancelled) setIsFirebaseConnected(false);
      });

    const drillOrgId = effectiveOrgId === 'all' ? DEFAULT_ORGANIZATION.id : effectiveOrgId;
    const unsubDrill = subscribeToRTDBDrill((drillState) => {
      if (drillState.active) {
        setIsDrillActive(true);
        setDrillType((drillState.type as DrillType) || 'gas_critico');
        setIsAlarmActive(true);
        setIsLightActive(true);
        setDismissEmergencyBanner(false);
      } else {
        setIsDrillActive(false);
        setDrillType(null);
        setIsAlarmActive(false);
        setIsLightActive(false);
      }
    }, drillOrgId);

    return () => {
      cancelled = true;
      unsubDrill();
    };
  }, [subscriptionScope, effectiveOrgId]);

  // Suscripciones operativas en RTDB estrictamente acotadas por rol y organización activa
  useEffect(() => {
    const unsubDevices = subscribeToRTDBDevicesRaw((incoming) => {
      rawDevicesRef.current = incoming || {};
      setIsFirebaseConnected(true);
      recomputeDevicesFromRaw();
    }, subscriptionScope);

    const unsubAlertEvents = subscribeToAlertEvents((events) => {
      setAlertEvents(events);
    }, subscriptionScope);

    const unsubOrgs = subscribeToRTDBOrganizations((orgs) => {
      setOrganizations(orgs);
    }, subscriptionScope);

    const unsubAssignments = subscribeToRTDBAssignments((remoteAssigns) => {
      if (remoteAssigns && remoteAssigns.length > 0) {
        setAssignments(remoteAssigns);
      } else {
        setAssignments([]);
      }
    }, subscriptionScope);

    const unsubUsers = subscribeToRTDBUsers((remoteUsers) => {
      if (remoteUsers && remoteUsers.length > 0) {
        setUsersList(remoteUsers);
        setCurrentUser((prev) => {
          const updated = remoteUsers.find(
            (u) => u.id === prev.id || u.email.toLowerCase() === prev.email.toLowerCase()
          );
          if (!updated) return prev;
          if (updated.status === 'inactivo') {
            onLogoutRequest().catch(() => {});
            return prev;
          }
          return updated;
        });
      } else if (subscriptionScope.role === 'operador' || subscriptionScope.role === 'supervisor') {
        setUsersList([]);
      }
    }, subscriptionScope);

    const unsubRentals = subscribeToRTDBRentals((remoteRentals) => {
      if (remoteRentals && remoteRentals.length > 0) {
        setRentals(remoteRentals);
      } else {
        setRentals([]);
      }
    }, subscriptionScope);

    const unsubAlerts = subscribeToRTDBAlerts((remoteAlerts) => {
      // MS-09: Never overwrite real RTDB alerts with mock INITIAL_ALERTS data.
      alertEngine.syncExistingActiveAlerts(remoteAlerts);
      setAlerts(remoteAlerts);
    }, subscriptionScope, (dismissedAlerts) => {
      dismissedAlerts.forEach((dismissed) => {
        if (!processedDismissedAlertIdsRef.current.has(dismissed.id)) {
          processedDismissedAlertIdsRef.current.add(dismissed.id);
          alertEngine.markIncidentManuallyResolved(dismissed);
        }
      });
    });

    const unsubSites = subscribeToRTDBSites((remoteSites) => {
      const targetOrgId = subscriptionScope.organizationId || DEFAULT_ORGANIZATION.id;
      const allowPrincipalPresets =
        remoteSites.length === 0 &&
        (targetOrgId === 'all' || targetOrgId === DEFAULT_ORGANIZATION.id);
      setSites((prev) => {
        const otherOrgSites =
          targetOrgId === 'all'
            ? []
            : prev.filter((s) => (s.organizationId || DEFAULT_ORGANIZATION.id) !== targetOrgId);
        const baseCurrent = allowPrincipalPresets ? MINING_SITES : [];
        const currentOrgSites = mergeMiningSites(baseCurrent, remoteSites);
        const merged = [...otherOrgSites, ...currentOrgSites];
        const nextScoped =
          targetOrgId === 'all'
            ? merged
            : merged.filter((s) => (s.organizationId || DEFAULT_ORGANIZATION.id) === targetOrgId);
        setCurrentSite((curr) =>
          resolveScopedCurrentSite(nextScoped, curr.id, targetOrgId)
        );
        return merged;
      });
    }, subscriptionScope);

    const unsubCrews = subscribeToRTDBCrews((remoteCrews) => {
      const targetOrgId = subscriptionScope.organizationId || DEFAULT_ORGANIZATION.id;
      const cachedForScope = loadCachedCrews().filter((c) =>
        targetOrgId === 'all'
          ? true
          : (c.organizationId || DEFAULT_ORGANIZATION.id) === targetOrgId
      );
      setCrews((prev) => {
        const otherOrgCrews =
          targetOrgId === 'all'
            ? []
            : prev.filter((c) => (c.organizationId || DEFAULT_ORGANIZATION.id) !== targetOrgId);
        const mergedCurrent = mergeMiningCrews(cachedForScope, remoteCrews);
        return [...otherOrgCrews, ...mergedCurrent];
      });
    }, subscriptionScope);

    const unsubCatalog = subscribeToDeviceCatalog((remoteCatalog) => {
      setCatalogDevices(remoteCatalog);
    }, subscriptionScope);

    return () => {
      unsubDevices();
      unsubCatalog();
      unsubAlertEvents();
      unsubOrgs();
      unsubAssignments();
      unsubUsers();
      unsubRentals();
      unsubAlerts();
      unsubSites();
      unsubCrews();
    };
  }, [subscriptionScope, recomputeDevicesFromRaw, onLogoutRequest]);

  // Lista controlada de dispositivos visibles (filtrada además por organización activa y excluyendo inventario sin asignar)
  const visibleDevices = useMemo<SensorDevice[]>(() => {
    const rtdbMap = new Map<string, SensorDevice>(devices.map((d) => [d.id, d]));
    const regList = mergedRegisteredDevices;
    const siteById = new Map(sites.map((s) => [s.id, s]));
    const siteByNameNorm = new Map(sites.map((s) => [s.name.trim().toLowerCase(), s]));

    const resolveCanonicalSite = (rawSiteId?: string, rawSiteName?: string) => {
      const cleanId = rawSiteId?.trim();
      const cleanName = rawSiteName?.trim();
      if (cleanId) {
        const found = siteById.get(cleanId);
        return {
          siteId: found?.id || cleanId,
          siteName: cleanName || found?.name,
        };
      }
      if (cleanName) {
        const found = siteByNameNorm.get(cleanName.toLowerCase());
        return {
          siteId: found?.id,
          siteName: found?.name || cleanName,
        };
      }
      return { siteId: undefined, siteName: undefined };
    };

    const buildFromRegistry = (reg: typeof regList[number]): SensorDevice => {
      const existing = rtdbMap.get(reg.id);
      const resolvedOrg = isUnassignedDeviceOrg(reg.organizationId)
        ? UNASSIGNED_DEVICE_ORG_ID
        : reg.organizationId || existing?.organizationId || DEFAULT_ORGANIZATION.id;
      const explicitlyWithoutSite =
        !reg.siteId &&
        !reg.siteName &&
        (reg.assignmentStatus === 'en_inventario' || reg.assignmentStatus === 'asignado_empresa');
      const resolvedSite = explicitlyWithoutSite
        ? { siteId: undefined, siteName: undefined }
        : resolveCanonicalSite(reg.siteId || existing?.siteId, reg.siteName || existing?.siteName);

      if (existing) {
        return {
          ...existing,
          organizationId: resolvedOrg,
          organizationName: reg.organizationName || existing.organizationName,
          assignmentStatus: reg.assignmentStatus || existing.assignmentStatus,
          name: reg.name || existing.name,
          siteId: resolvedSite.siteId,
          siteName: resolvedSite.siteName,
          crewId: reg.crewId || existing.crewId,
          crewName: reg.crewName || existing.crewName,
          sectorId: reg.sectorId || existing.sectorId,
          sectorName: reg.sectorName || existing.sectorName,
          deviceCategory: reg.category,
          parentGatewayId: reg.parentGatewayId || existing.parentGatewayId,
          localIp: reg.localIp || existing.localIp,
          type: reg.category === 'sensor' || reg.category === 'nodo' ? 'multigas_portatil' : 'estacion_fija',
        };
      }
      return {
        id: reg.id,
        code: reg.id,
        organizationId: resolvedOrg,
        organizationName: reg.organizationName,
        assignmentStatus: reg.assignmentStatus,
        name: reg.name,
        type: reg.category === 'sensor' || reg.category === 'nodo' ? 'multigas_portatil' : 'estacion_fija',
        siteId: resolvedSite.siteId,
        siteName: resolvedSite.siteName,
        crewId: reg.crewId,
        crewName: reg.crewName,
        sectorId: reg.sectorId || `sec-${reg.id}`,
        sectorName: reg.sectorName || 'Faena Minera',
        batteryPct: 0,
        batteryReported: false,
        signalStrength: 'debil',
        lastPing: 'En espera de telemetría',
        status: 'desconectado',
        assignedTo: '',
        lastUpdateServer: 0,
        gatewayOnline: false,
        alarmaActiva: false,
        deviceCategory: reg.category,
        parentGatewayId: reg.parentGatewayId,
        localIp: reg.localIp,
        metrics: {
          temperatura: 0,
          humedad: 0,
          co2: 0,
          co: 0,
          ch4: 0,
          o2: 0,
          flujoAire: 0,
          ruido: 0,
          polvoPM: 0,
        },
      };
    };

    if (platformConfig.onlyShowRegisteredDevices) {
      const enabledRegs = regList.filter(
        (r) => r.enabled !== false && !isUnassignedDeviceOrg(r.organizationId) && matchesOrg(r.organizationId)
      );
      const effectiveRegs =
        enabledRegs.length > 0
          ? enabledRegs
          : effectiveOrgId === 'all'
          ? regList.filter((r) => !isUnassignedDeviceOrg(r.organizationId)).slice(0, 1)
          : [];
      const mapped = effectiveRegs.map(buildFromRegistry);
      if (mapped.length > 0) return mapped;
      return effectiveOrgId === 'all' || effectiveOrgId === DEFAULT_ORGANIZATION.id
        ? [INITIAL_SINGLE_DEVICE]
        : [];
    }

    const regMap = new Map(regList.map((r) => [r.id, r]));
    const enrichedRTDB = devices.map((d) => {
      const reg = regMap.get(d.id);
      if (!reg) {
        const resolvedSite = resolveCanonicalSite(d.siteId, d.siteName);
        return {
          ...d,
          siteId: resolvedSite.siteId,
          siteName: resolvedSite.siteName,
        };
      }
      const resolvedOrg = isUnassignedDeviceOrg(reg.organizationId)
        ? UNASSIGNED_DEVICE_ORG_ID
        : reg.organizationId || d.organizationId || DEFAULT_ORGANIZATION.id;
      const explicitlyWithoutSite =
        !reg.siteId &&
        !reg.siteName &&
        (reg.assignmentStatus === 'en_inventario' || reg.assignmentStatus === 'asignado_empresa');
      const resolvedSite = explicitlyWithoutSite
        ? { siteId: undefined, siteName: undefined }
        : resolveCanonicalSite(reg.siteId || d.siteId, reg.siteName || d.siteName);
      return {
        ...d,
        organizationId: resolvedOrg,
        organizationName: reg.organizationName || d.organizationName,
        assignmentStatus: reg.assignmentStatus || d.assignmentStatus,
        name: reg.name || d.name,
        siteId: resolvedSite.siteId,
        siteName: resolvedSite.siteName,
        crewId: reg.crewId || d.crewId,
        crewName: reg.crewName || d.crewName,
        sectorId: reg.sectorId || d.sectorId,
        sectorName: reg.sectorName || d.sectorName,
        deviceCategory: reg.category,
        parentGatewayId: reg.parentGatewayId || d.parentGatewayId,
        localIp: reg.localIp || d.localIp,
      };
    });
    const missingEnabled = regList
      .filter((r) => r.enabled !== false && !isUnassignedDeviceOrg(r.organizationId) && !rtdbMap.has(r.id))
      .map(buildFromRegistry);
    const combined = [...enrichedRTDB, ...missingEnabled].filter(
      (d) => !isUnassignedDeviceOrg(d.organizationId) && matchesOrg(d.organizationId)
    );
    if (combined.length > 0) return combined;
    return effectiveOrgId === 'all' || effectiveOrgId === DEFAULT_ORGANIZATION.id
      ? [INITIAL_SINGLE_DEVICE]
      : [];
  }, [devices, mergedRegisteredDevices, sites, platformConfig.onlyShowRegisteredDevices, matchesOrg, effectiveOrgId]);

  // Mantener siempre un dispositivo activo válido dentro de los dispositivos visibles
  useEffect(() => {
    if (visibleDevices.length === 0) {
      if (activeTelemetryDeviceId !== '') {
        setActiveTelemetryDeviceId('');
      }
      return;
    }
    if (!visibleDevices.some((d) => d.id === activeTelemetryDeviceId)) {
      setActiveTelemetryDeviceId(visibleDevices[0].id);
    }
  }, [visibleDevices, activeTelemetryDeviceId]);

  const handleReportRangeChange = useCallback((nextWindow: TelemetryRangeWindow) => {
    setTelemetryWindow((prev) =>
      prev.key === nextWindow.key &&
      Math.abs(prev.startMs - nextWindow.startMs) < 5000 &&
      Math.abs(prev.endMs - nextWindow.endMs) < 5000
        ? prev
        : nextWindow
    );
  }, []);

  // Paginación completa por cursor + cola viva en tiempo real para historial de telemetría
  useEffect(() => {
    if (!activeTelemetryDeviceId) {
      setTelemetryHistory([]);
      setIsHistoryLoading(false);
      setHistoryTruncated(false);
      setHistoryError(null);
      return;
    }

    let cancelled = false;
    setIsHistoryLoading(true);
    setHistoryError(null);
    setHistoryTruncated(false);

    fetchPaginatedTelemetryHistory(activeTelemetryDeviceId, {
      startMs: telemetryWindow.startMs,
      endMs: telemetryWindow.endMs,
    })
      .then((res) => {
        if (cancelled) return;
        setTelemetryHistory((prev) => {
          const merged = new Map<number, TelemetryHistoryPoint>();
          res.points.forEach((p) => merged.set(p.timestamp, p));
          prev
            .filter((p) => p.timestamp >= telemetryWindow.startMs && p.timestamp <= telemetryWindow.endMs)
            .forEach((p) => {
              if (!merged.has(p.timestamp)) merged.set(p.timestamp, p);
            });
          return Array.from(merged.values()).sort((a, b) => a.timestamp - b.timestamp);
        });
        setHistoryTruncated(res.truncated);
        setHistoryError(res.error);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setHistoryError(err?.message || 'Error cargando historial de telemetría.');
      })
      .finally(() => {
        if (!cancelled) setIsHistoryLoading(false);
      });

    const tailStart = Math.max(telemetryWindow.startMs, Date.now() - 2 * 3600 * 1000);
    const unsubHist = subscribeToTelemetryHistory(
      activeTelemetryDeviceId,
      {
        startMs: tailStart,
        endMs: telemetryWindow.endMs,
        limit: 300,
      },
      (tailPoints, meta) => {
        if (cancelled) return;
        if (meta?.error) {
          setHistoryError(meta.error);
          return;
        }
        setTelemetryHistory((prev) => {
          const map = new Map<number, TelemetryHistoryPoint>();
          prev.forEach((p) => map.set(p.timestamp, p));
          tailPoints.forEach((p) => map.set(p.timestamp, p));
          return Array.from(map.values())
            .filter((p) => p.timestamp >= telemetryWindow.startMs && p.timestamp <= telemetryWindow.endMs)
            .sort((a, b) => a.timestamp - b.timestamp);
        });
      }
    );

    return () => {
      cancelled = true;
      unsubHist();
    };
  }, [activeTelemetryDeviceId, telemetryWindow]);

  // Evaluar mediciones en tiempo real únicamente sobre los dispositivos visibles
  useEffect(() => {
    if (visibleDevices.length > 0) {
      alertEngine.processAllDevices(visibleDevices);
    }
  }, [visibleDevices]);

  // Synchronize dashboard variables directly with the real active device from RTDB + real telemetry history
  useEffect(() => {
    const targetDev = visibleDevices.find(d => d.id === activeTelemetryDeviceId) || visibleDevices[0];
    const m = platformConfig.metrics;
    if (targetDev && targetDev.metrics) {
      const faultSet = new Set(targetDev.faultFields || []);
      const tempVal = faultSet.has('temperatura') ? 0 : targetDev.metrics.temperatura;
      const humVal = faultSet.has('humedad') ? 0 : targetDev.metrics.humedad;
      const coVal = faultSet.has('CO') ? 0 : targetDev.metrics.co;
      const pmVal = faultSet.has('PM2_5') ? 0 : targetDev.metrics.polvoPM;
      const airVal = targetDev.metrics.flujoAire;
      const batVal = targetDev.batteryPct;

      const recentHist = telemetryHistory.slice(-12);
      const formatTime = (ts: number) =>
        new Date(ts).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });

      const buildRealHistory = (
        extractor: (p: TelemetryHistoryPoint) => number | null,
        liveVal: number
      ) => {
        const valid = recentHist
          .map((p) => ({ ts: p.timestamp, v: extractor(p) }))
          .filter((item): item is { ts: number; v: number } => typeof item.v === 'number' && !Number.isNaN(item.v));
        if (valid.length > 0) {
          return valid.map((item) => ({ timestamp: formatTime(item.ts), value: Number(item.v.toFixed(1)) }));
        }
        return [{ timestamp: 'Actual', value: Number((liveVal || 0).toFixed(1)) }];
      };

      setVariables([
        {
          id: 'temp',
          name: 'TEMPERATURA AMBIENTE',
          shortName: 'Temperatura',
          value: tempVal,
          unit: '°C',
          trend: !faultSet.has('temperatura') && tempVal >= m.tempPreventivo ? 'alza critica' : 'estable',
          status: faultSet.has('temperatura')
            ? 'desconectado'
            : tempVal >= m.tempCritico
            ? 'critico'
            : tempVal >= m.tempPreventivo
            ? 'advertencia'
            : 'normal',
          statusLabel: faultSet.has('temperatura')
            ? 'Sensor en Falla'
            : tempVal >= m.tempCritico
            ? 'Crítica'
            : tempVal >= m.tempPreventivo
            ? 'Alerta'
            : 'Estable',
          thresholdMin: m.tempMin,
          thresholdMax: m.tempPreventivo,
          lastUpdateSeconds: 0,
          isSimulated: false,
          historical: buildRealHistory((p) => p.temperatura, tempVal),
        },
        {
          id: 'hum',
          name: 'HUMEDAD RELATIVA',
          shortName: 'Humedad',
          value: humVal,
          unit: '%',
          trend: 'estable',
          status: faultSet.has('humedad')
            ? 'desconectado'
            : humVal >= m.humCritico
            ? 'critico'
            : humVal >= m.humPreventivo
            ? 'advertencia'
            : 'normal',
          statusLabel: faultSet.has('humedad')
            ? 'Sensor en Falla'
            : humVal >= m.humCritico
            ? 'Crítica'
            : humVal >= m.humPreventivo
            ? 'Elevada'
            : 'Normal',
          thresholdMin: m.humMin,
          thresholdMax: m.humCritico,
          lastUpdateSeconds: 0,
          isSimulated: false,
          historical: buildRealHistory((p) => p.humedad, humVal),
        },
        {
          id: 'co2',
          name: 'GASES / CO (MQ-2 ADC)',
          shortName: 'Gas MQ-2',
          value: coVal,
          unit: 'ADC',
          trend: !faultSet.has('CO') && coVal >= m.coPreventivo ? 'alza critica' : 'estable',
          status: faultSet.has('CO')
            ? 'desconectado'
            : coVal >= m.coCritico
            ? 'critico'
            : coVal >= m.coAdvertencia
            ? 'advertencia'
            : coVal >= m.coPreventivo
            ? 'preventivo'
            : 'normal',
          statusLabel: faultSet.has('CO')
            ? 'Sensor en Falla'
            : coVal >= m.coCritico
            ? 'Crítico'
            : coVal >= m.coAdvertencia
            ? 'Advertencia'
            : coVal >= m.coPreventivo
            ? 'Preventivo'
            : 'Seguro',
          thresholdMin: 0,
          thresholdMax: m.coAdvertencia,
          lastUpdateSeconds: 0,
          isSimulated: false,
          historical: buildRealHistory((p) => p.co, coVal),
        },
        {
          id: 'lux',
          name: 'MATERIAL PARTICULADO (PM2.5 ADC)',
          shortName: 'Polvo PM2.5',
          value: pmVal,
          unit: 'ADC',
          trend: !faultSet.has('PM2_5') && pmVal >= m.pm25Preventivo ? 'alza critica' : 'estable',
          status: faultSet.has('PM2_5')
            ? 'desconectado'
            : pmVal >= m.pm25Critico
            ? 'critico'
            : pmVal >= m.pm25Advertencia
            ? 'advertencia'
            : pmVal >= m.pm25Preventivo
            ? 'preventivo'
            : 'normal',
          statusLabel: faultSet.has('PM2_5')
            ? 'Sensor en Falla'
            : pmVal >= m.pm25Critico
            ? 'Polvo Crítico'
            : pmVal >= m.pm25Preventivo
            ? 'Preventivo'
            : 'Norma OK',
          thresholdMin: 0,
          thresholdMax: m.pm25Advertencia,
          lastUpdateSeconds: 0,
          isSimulated: false,
          historical: buildRealHistory((p) => p.pm25, pmVal),
        },
        {
          id: 'kwh',
          name: 'BATERÍA DISPOSITIVO IoT',
          shortName: 'Batería Sensor',
          value: batVal,
          unit: '%',
          trend: 'estable',
          status: batVal < m.batteryMin ? 'advertencia' : 'normal',
          statusLabel: batVal >= m.batteryMin ? 'Óptima' : 'Recargar',
          thresholdMin: m.batteryMin,
          thresholdMax: 100,
          lastUpdateSeconds: 0,
          isSimulated: false,
          historical: [{ timestamp: 'Actual', value: batVal }],
        },
        {
          id: 'air_flow',
          name: 'FLUJO DE VENTILACIÓN',
          shortName: 'Ventilación',
          value: airVal,
          unit: 'm/s',
          trend: 'estable',
          status: airVal > 0 && airVal < m.airFlowMin ? 'critico' : 'normal',
          statusLabel: airVal === 0 ? 'Sin sensor flujo' : airVal < m.airFlowMin ? 'Flujo Insuficiente' : 'Circulación Activa',
          thresholdMin: m.airFlowMin,
          thresholdMax: m.airFlowMax,
          lastUpdateSeconds: 0,
          isSimulated: false,
          historical: [{ timestamp: 'Actual', value: airVal }],
        },
      ]);
    } else {
      setVariables(createEmptyTelemetryVariables());
    }
  }, [visibleDevices, activeTelemetryDeviceId, platformConfig, telemetryHistory]);

  // Second counter for last updated
  useEffect(() => {
    const secTimer = setInterval(() => {
      setVariables((prev) =>
        prev.map((v) => ({
          ...v,
          lastUpdateSeconds: v.lastUpdateSeconds + 1,
        }))
      );
    }, 1000);

    return () => clearInterval(secTimer);
  }, []);

  // Handlers
  const handleRefreshData = useCallback(async () => {
    soundAlert.playFeedbackBeep();
    try {
      const res = await forceRefreshDevicesFromRTDB(timeoutSecondsRef.current || 20, subscriptionScope);
      rawDevicesRef.current = res.raw || {};
      setDevices(res.devices);
      setIsFirebaseConnected(true);
    } catch {
      // Fallback: zero jitter, keep real state and only reset timer indicator
    }
    setVariables((prev) =>
      prev.map((v) => ({
        ...v,
        lastUpdateSeconds: 0,
      }))
    );
  }, [subscriptionScope]);

  const getRelatedActiveAlertIds = useCallback((targetAlert?: SafetyAlert): string[] => {
    if (!targetAlert) return [];
    const sensorKey = (targetAlert.sensorId || '').trim().toLowerCase();
    const varKey = (targetAlert.variableName || '').trim().toLowerCase();
    return alertsRef.current
      .filter(
        (a) =>
          !a.resolved &&
          a.id !== targetAlert.id &&
          (a.sensorId || '').trim().toLowerCase() === sensorKey &&
          (a.variableName || '').trim().toLowerCase() === varKey
      )
      .map((a) => a.id);
  }, []);

  const handleAcknowledgeAlert = useCallback(async (alertId: string) => {
    if (currentUser?.role === 'operador') {
      showAlarmFeedback('Modo solo lectura: el usuario Operador solo puede ver datos y descripciones de alertas.', 'error');
      return;
    }
    soundAlert.playFeedbackBeep();
    const ackBy = currentUser?.name || 'Operador';
    const prevAlerts = alertsRef.current;
    const targetAlert = prevAlerts.find((a) => a.id === alertId);
    const relatedIds = getRelatedActiveAlertIds(targetAlert);
    const affectedIds = new Set([alertId, ...relatedIds]);

    affectedIds.forEach((id) => {
      processedDismissedAlertIdsRef.current.add(id);
      const alertObj = prevAlerts.find((a) => a.id === id);
      if (alertObj) {
        alertEngine.markIncidentManuallyResolved(alertObj);
      }
    });

    const targetOrgId = targetAlert?.organizationId || DEFAULT_ORGANIZATION.id;
    const hasOtherCriticalInOrg = prevAlerts.some(
      (a) =>
        !a.resolved &&
        !affectedIds.has(a.id) &&
        a.severity === 'critico' &&
        (a.organizationId || DEFAULT_ORGANIZATION.id) === targetOrgId
    );

    if (!hasOtherCriticalInOrg) {
      soundAlert.stopContinuousAlarm();
    }

    setAlerts((prev) => prev.filter((a) => !affectedIds.has(a.id)));

    try {
      await acknowledgeAlertInRTDB(targetAlert || alertId, ackBy, relatedIds, {
        clearEmergencyIfNone: !hasOtherCriticalInOrg,
        organizationId: targetOrgId,
      });
      showAlarmFeedback('Alarma reconocida y eliminada completamente.', 'success');
    } catch (err: any) {
      setAlerts(prevAlerts);
      showAlarmFeedback(err?.message || 'Error al reconocer y eliminar la alarma en Firebase RTDB.', 'error');
    }
  }, [currentUser, getRelatedActiveAlertIds, showAlarmFeedback]);

  const handleResolveAlert = useCallback(async (alertId: string) => {
    if (currentUser?.role === 'operador') {
      showAlarmFeedback('Modo solo lectura: el usuario Operador no puede resolver ni modificar alertas.', 'error');
      return;
    }
    soundAlert.playFeedbackBeep();
    const prevAlerts = alertsRef.current;
    const targetAlert = prevAlerts.find((a) => a.id === alertId);
    const relatedIds = getRelatedActiveAlertIds(targetAlert);
    const affectedIds = new Set([alertId, ...relatedIds]);

    const defaultDetails: AlertResolutionDetails = targetAlert?.resolutionDetails || {
      resolutionType: 'prueba_operativa',
      closingTitle: 'Cierre operativo de alerta',
      comment: 'Alerta verificada y marcada como resuelta desde la consola de seguridad.',
      correctiveActions: 'Verificación de condiciones ambientales en rango seguro.',
      resolvedBy: currentUser?.name || 'Supervisor de Turno',
      resolvedAt: new Date().toLocaleString('es-CL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    if (targetAlert) {
      alertEngine.markIncidentManuallyResolved(targetAlert);
    }

    setAlerts((prev) =>
      prev
        .filter((a) => !relatedIds.includes(a.id))
        .map((a) =>
          affectedIds.has(a.id)
            ? { ...a, resolved: true, acknowledged: true, resolutionDetails: defaultDetails }
            : a
        )
    );
    try {
      await resolveAlertInRTDB(targetAlert || alertId, defaultDetails, relatedIds);
    } catch (err: any) {
      setAlerts(prevAlerts);
      showAlarmFeedback(err?.message || 'Error al resolver alerta en Firebase RTDB.', 'error');
      throw err;
    }
  }, [currentUser, getRelatedActiveAlertIds, showAlarmFeedback]);

  const handleResolveAlertWithDetails = useCallback(async (alertId: string, details: AlertResolutionDetails) => {
    if (currentUser?.role === 'operador') {
      showAlarmFeedback('Modo solo lectura: el usuario Operador no puede editar ni cerrar bitácoras de alertas.', 'error');
      return;
    }
    soundAlert.playFeedbackBeep();
    const targetAlert = alertsRef.current.find((a) => a.id === alertId);
    const relatedIds = getRelatedActiveAlertIds(targetAlert);

    if (targetAlert) {
      alertEngine.markIncidentManuallyResolved(targetAlert);
    }

    await resolveAlertInRTDB(targetAlert || alertId, details, relatedIds);
    setAlerts((prev) =>
      prev
        .filter((a) => !relatedIds.includes(a.id))
        .map((a) =>
          a.id === alertId
            ? {
                ...a,
                resolved: true,
                acknowledged: true,
                resolutionDetails: details,
              }
            : a
        )
    );
    showAlarmFeedback('Alerta y bitácora de cierre guardadas sin duplicados.', 'success');
  }, [currentUser, getRelatedActiveAlertIds, showAlarmFeedback]);

  const handleSaveDrillDebrief = useCallback(async (record: DrillDebriefRecord) => {
    const orgId =
      record.organizationId ||
      (effectiveOrgId === 'all' ? DEFAULT_ORGANIZATION.id : effectiveOrgId);
    await saveDrillDebriefInRTDB({
      ...record,
      organizationId: orgId,
    });
  }, [effectiveOrgId]);


  const handleTriggerForcedVentilation = useCallback((sectorName: string) => {
    if (!currentUser || !isAnyAdminRole(currentUser.role)) {
      showAlarmFeedback('Acceso denegado: Solo Administrador o SuperAdmin puede activar ventilación forzada en sectores.', 'error');
      return;
    }
    const targetOrgId = currentSite.organizationId || (effectiveOrgId === 'all' ? DEFAULT_ORGANIZATION.id : effectiveOrgId);
    if (!isOrgAuthorizedForUser(currentUser, targetOrgId, organizations)) {
      showAlarmFeedback('Acceso denegado: No puedes modificar sectores de otra empresa.', 'error');
      return;
    }
    soundAlert.playFeedbackBeep();
    const updatedSite: MiningSite = {
      ...currentSite,
      activeSectors: currentSite.activeSectors.map((s) =>
        s.name.includes(sectorName) || sectorName.includes(s.name)
          ? { ...s, ventilationFanStatus: 'ventilacion_forzada' }
          : s
      ),
    };
    setCurrentSite(updatedSite);
    setSites((prev) => prev.map((site) => (site.id === updatedSite.id ? updatedSite : site)));
    saveSiteToRTDB(updatedSite).catch(() => {});
  }, [currentSite, currentUser, effectiveOrgId, organizations, showAlarmFeedback]);

  const handleSimulateGasSpike = useCallback(async (sensorId: string) => {
    if (!currentUser || !isAnyAdminRole(currentUser.role)) {
      showAlarmFeedback('Acceso denegado: Operadores y Supervisores no pueden simular alzas de gas.', 'error');
      return;
    }
    soundAlert.playCriticalAlert();
    const targetDev = visibleDevices.find(d => d.id === sensorId) || visibleDevices[0];
    if (!targetDev) return;

    const updatedDevice: SensorDevice = {
      ...targetDev,
      status: 'critico',
      rawCO: 1250,
      metrics: {
        ...targetDev.metrics,
        co: 52.8,
        temperatura: 31.4,
      },
    };

    setDevices((prev) =>
      prev.some(d => d.id === sensorId)
        ? prev.map(d => d.id === sensorId ? updatedDevice : d)
        : [...prev, updatedDevice]
    );

    const now = Date.now();
    // Create a new safety alert
    const newAlert: SafetyAlert = {
      id: `alt-${now}`,
      code: `ALT-SIM-${Math.floor(Math.random() * 900 + 100)}`,
      organizationId:
        targetDev.organizationId ||
        (effectiveOrgId === 'all' ? DEFAULT_ORGANIZATION.id : effectiveOrgId),
      title: 'Detección Crítica de Monóxido de Carbono (CO > 50 ppm)',
      severity: 'critico',
      variableName: 'Monóxido de Carbono (CO)',
      sensorId: sensorId,
      sensorCode: targetDev.code,
      sectorName: targetDev.sectorName,
      recordedValue: '52.8 ppm (1250 ADC)',
      safeLimit: '< 25.0 ppm',
      timestamp: new Date(now).toLocaleString('es-CL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      timestampMs: now,
      acknowledged: false,
      resolved: false,
      suggestedAction: 'Evacuar personal inmediatamente hacia zona segura y activar extractores al 100%.',
    };

    setAlerts((prev) => [newAlert, ...prev]);

    // Broadcast alert to Firebase RTDB so hardware ESP32 immediately reacts
    await broadcastAlertToRTDB(newAlert).catch((err: any) => {
      showAlarmFeedback(err?.message || 'Error al emitir alerta crítica hacia Firebase RTDB.', 'error');
    });
  }, [currentUser, visibleDevices, effectiveOrgId, showAlarmFeedback]);

  const handleResetSensor = useCallback(async (sensorId: string) => {
    if (!currentUser || !isAnyAdminRole(currentUser.role)) {
      showAlarmFeedback('Acceso denegado: Operadores y Supervisores no pueden restablecer nodos en RTDB.', 'error');
      return;
    }
    const targetDev = visibleDevices.find(d => d.id === sensorId);
    if (!targetDev) return;

    try {
      await resetGatewayDataInRTDB(sensorId, currentUser);
      soundAlert.playFeedbackBeep();
      const resetDevice: SensorDevice = {
        ...targetDev,
        status: 'normal',
        rawCO: 45,
        metrics: {
          ...targetDev.metrics,
          co: 8.5,
          temperatura: 22.4,
        },
      };

      setDevices((prev) =>
        prev.some(d => d.id === sensorId)
          ? prev.map(d => d.id === sensorId ? resetDevice : d)
          : [...prev, resetDevice]
      );
    } catch (err: any) {
      showAlarmFeedback(err?.message || 'Error al restablecer el nodo en Firebase RTDB.', 'error');
    }
  }, [currentUser, visibleDevices, showAlarmFeedback]);

  const collectPropagationDeviceIds = useCallback(
    (primaryGatewayId: string): string[] => {
      const gw = visibleDevices.find((d) => d.id === primaryGatewayId);
      const ids = new Set<string>([primaryGatewayId]);
      visibleDevices.forEach((d) => {
        if (d.parentGatewayId === primaryGatewayId) {
          ids.add(d.id);
        } else if (
          gw &&
          gw.sectorName &&
          d.sectorName &&
          d.sectorName.trim().toLowerCase() === gw.sectorName.trim().toLowerCase() &&
          (!gw.organizationId || !d.organizationId || gw.organizationId === d.organizationId)
        ) {
          ids.add(d.id);
        }
      });
      return Array.from(ids);
    },
    [visibleDevices]
  );

  const handleToggleGatewayAlarm = useCallback(
    async (gatewayId: string, active: boolean, targetDeviceIds: string[]) => {
      const access = canControlMineAlarm(currentUser);
      if (!access.allowed) {
        showAlarmFeedback(
          access.reason ||
            'Acceso denegado: Solo la Administración de Empresa o MineSafe puede activar o apagar alarmas.',
          'error'
        );
        return;
      }

      const effectiveTargets = Array.from(
        new Set(targetDeviceIds.length > 0 ? targetDeviceIds : collectPropagationDeviceIds(gatewayId))
      );

      try {
        if (active) {
          await toggleGatewayAlarmInRTDB(gatewayId, true, currentUser, {
            targetDeviceIds: effectiveTargets,
          });
          soundAlert.setMuted(false);
          soundAlert.startContinuousAlarm();
          setIsAlarmActive(true);
          setIsLightActive(true);
          setDismissEmergencyBanner(false);
        } else {
          await shutdownAlarmCompletelyInRTDB(gatewayId, currentUser, {
            resetSensorBaselines: isDrillActive,
            organizationId: effectiveOrgId === 'all' ? currentUser.organizationId : effectiveOrgId,
            targetDeviceIds: effectiveTargets,
          });
          soundAlert.stopContinuousAlarm();
          soundAlert.playFeedbackBeep();
          setIsAlarmActive(false);
          setIsLightActive(false);
          setIsDrillActive(false);
          setDrillType(null);
          setEvacuationActive(false);
          setDismissEmergencyBanner(true);
        }

        const targetSet = new Set(effectiveTargets);
        setDevices((prev) =>
          prev.map((d) =>
            targetSet.has(d.id)
              ? { ...d, alarmaActiva: active }
              : d
          )
        );
      } catch (err: any) {
        showAlarmFeedback(err?.message || 'Error al propagar instrucción de alarma a los nodos.', 'error');
        throw err;
      }
    },
    [currentUser, collectPropagationDeviceIds, isDrillActive, effectiveOrgId, showAlarmFeedback]
  );

  const handleShutdownAlarmCompletely = useCallback(async () => {
    const access = canControlMineAlarm(currentUser);
    if (!access.allowed) {
      showAlarmFeedback(
        access.reason ||
          'Acceso denegado: Solo la Administración de Empresa o MineSafe puede apagar la alarma.',
        'error'
      );
      return;
    }

    const wasDrill = isDrillActive;
    const targetId = activeTelemetryDeviceId || visibleDevices[0]?.id || 'device_38A839E81F84';
    const propagationIds = collectPropagationDeviceIds(targetId);

    try {
      await shutdownAlarmCompletelyInRTDB(targetId, currentUser, {
        resetSensorBaselines: wasDrill,
        organizationId: effectiveOrgId === 'all' ? currentUser.organizationId : effectiveOrgId,
        targetDeviceIds: propagationIds,
      });

      soundAlert.stopContinuousAlarm();
      soundAlert.playFeedbackBeep();
      setIsAlarmActive(false);
      setIsLightActive(false);
      setIsDrillActive(false);
      setDrillType(null);
      setEvacuationActive(false);
      setDismissEmergencyBanner(true);

      setAlerts(prev => prev.map(a => (!a.resolved ? { ...a, resolved: true, acknowledged: true } : a)));
      resolveActiveAlertsInRTDB(
        alertsRef.current.filter((a) => !a.resolved && a.id.startsWith('alt-')),
        'Alarma y baliza apagadas desde consola de administración.',
        currentUser.name || 'Administración'
      ).catch(() => {});

      const propSet = new Set(propagationIds);
      setDevices(prev => prev.map(d => (propSet.has(d.id) || d.id === targetId) ? {
        ...d,
        alarmaActiva: false,
        status: wasDrill ? 'normal' : d.status,
        rawCO: wasDrill ? 45 : d.rawCO,
        rawPM25: wasDrill ? 25 : d.rawPM25,
        metrics: wasDrill
          ? { ...d.metrics, co: 8.5, polvoPM: 25 }
          : d.metrics,
      } : d));

      showAlarmFeedback(
        `Alarma y baliza apagadas y propagadas a ${propagationIds.length} ${propagationIds.length === 1 ? 'equipo' : 'equipos'}.`,
        'success'
      );
    } catch (err: any) {
      showAlarmFeedback(err?.message || 'Error al enviar comando de apagado de alarma.', 'error');
    }
  }, [currentUser, isDrillActive, activeTelemetryDeviceId, visibleDevices, collectPropagationDeviceIds, effectiveOrgId, showAlarmFeedback]);

  const handleResetPageLevels = useCallback(async () => {
    if (!currentUser || !isAnyAdminRole(currentUser.role)) {
      showAlarmFeedback('Acceso denegado: Operadores y Supervisores no pueden resetear niveles de página en RTDB.', 'error');
      return;
    }
    const dev = visibleDevices.find(d => d.id === activeTelemetryDeviceId) || visibleDevices[0];
    const hasActiveAlarm = Boolean(isAlarmActive || isDrillActive || dev?.alarmaActiva);
    if (hasActiveAlarm) {
      const isVerifiedSuper = currentUser?.role === 'superadmin' && await verifySuperAdminPrivileges(currentUser);
      if (!isVerifiedSuper) {
        showAlarmFeedback('Acción bloqueada: Solo el SuperAdministrador autenticado puede apagar o resetear una alarma activa.', 'error');
        return;
      }
    }

    try {
      if (dev?.id || activeTelemetryDeviceId) {
        await resetGatewayDataInRTDB(activeTelemetryDeviceId || dev?.id, currentUser);
      }
      soundAlert.playFeedbackBeep();
      soundAlert.stopContinuousAlarm();
      setIsAlarmActive(false);
      setIsLightActive(false);
      setIsDrillActive(false);
      setDrillType(null);
      setEvacuationActive(false);
      setDismissEmergencyBanner(true);

      setAlerts(prev => prev.map(a => (!a.resolved ? { ...a, resolved: true, acknowledged: true } : a)));
      setVariables(createEmptyTelemetryVariables());
      showAlarmFeedback('Niveles basales y comando APAGAR sincronizados en Firebase RTDB.', 'success');
    } catch (err: any) {
      showAlarmFeedback(err?.message || 'No se pudo resetear el nodo en Firebase RTDB.', 'error');
    }
  }, [visibleDevices, activeTelemetryDeviceId, isAlarmActive, isDrillActive, currentUser, showAlarmFeedback]);

  const handleTriggerSimulationEmergency = useCallback(async (type: DrillType) => {
    if (!currentUser || !isAnyAdminRole(currentUser.role)) {
      showAlarmFeedback('Acceso denegado: Solo Administrador o SuperAdmin puede iniciar simulacros de emergencia.', 'error');
      return;
    }
    soundAlert.setMuted(false);
    soundAlert.startContinuousAlarm();
    setIsDrillActive(true);
    setDrillType(type);
    setIsAlarmActive(true);
    setIsLightActive(true);
    setDismissEmergencyBanner(false);

    const dev = visibleDevices.find(d => d.id === activeTelemetryDeviceId) || visibleDevices[0];
    if (dev) {
      if (type === 'gas_critico') {
        setDevices(prev => prev.map(d => d.id === dev.id ? {
          ...d,
          status: 'critico',
          rawCO: 1250,
          metrics: { ...d.metrics, co: 55.4 }
        } : d));
      } else if (type === 'incendio_polvo') {
        setDevices(prev => prev.map(d => d.id === dev.id ? {
          ...d,
          status: 'critico',
          rawPM25: 650,
          metrics: { ...d.metrics, polvoPM: 650 }
        } : d));
      }
    }

    const titleMap: Record<DrillType, string> = {
      gas_critico: '[SIMULACRO DS 132] Fuga Crítica de Monóxido de Carbono (CO > 50 ppm / 1250 ADC)',
      incendio_polvo: '[SIMULACRO DS 132] Principio de Incendio y Humo Denso (PM2.5 > 500 µg/m³)',
      evacuacion_sirena: '[SIMULACRO DS 132] Evacuación Inmediata de Faena por Alarma Sonora y Baliza',
    };

    const now = Date.now();
    const newAlert: SafetyAlert = {
      id: `alt-drill-${now}`,
      code: `SIM-DRILL-${Math.floor(Math.random() * 800 + 100)}`,
      organizationId:
        dev?.organizationId ||
        (effectiveOrgId === 'all' ? DEFAULT_ORGANIZATION.id : effectiveOrgId),
      title: titleMap[type],
      severity: 'critico',
      variableName: type === 'gas_critico' ? 'Monóxido de Carbono (CO)' : type === 'incendio_polvo' ? 'Polvo PM2.5' : 'Alarma General',
      sensorId: dev?.id || 'device_38A839E81F84',
      sensorCode: dev?.code || 'device_38A839E81F84',
      sectorName: dev?.sectorName || 'Mina Chuquicamata - Rampa Principal',
      recordedValue: type === 'gas_critico' ? '1250 ADC (55.4 ppm)' : type === 'incendio_polvo' ? '650 µg/m³' : 'Sirena y Baliza Activas',
      safeLimit: type === 'gas_critico' ? '< 25.0 ppm' : '< 50 µg/m³',
      timestamp: new Date(now).toLocaleString('es-CL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      timestampMs: now,
      acknowledged: false,
      resolved: false,
      suggestedAction: 'Protocolo de entrenamiento: desplazar cuadrilla hacia refugio hermético y activar mangas de ventilación.',
    };

    setAlerts(prev => [newAlert, ...prev]);

    // Broadcast drill and save drill alert to Firebase Realtime Database (/simulacro/{orgId} + /alertas)
    const drillOrgId =
      dev?.organizationId ||
      (effectiveOrgId === 'all' ? DEFAULT_ORGANIZATION.id : effectiveOrgId);
    await broadcastDrillToRTDB(
      true,
      type,
      dev?.id || 'device_38A839E81F84',
      drillOrgId
    ).catch((err: any) => {
      showAlarmFeedback(err?.message || 'Error al activar simulacro en Firebase RTDB.', 'error');
    });
    await broadcastAlertToRTDB(newAlert).catch((err: any) => {
      showAlarmFeedback(err?.message || 'Error al guardar alerta de simulacro en Firebase RTDB.', 'error');
    });
  }, [currentUser, visibleDevices, activeTelemetryDeviceId, effectiveOrgId, showAlarmFeedback]);

  const handleStopDrill = useCallback(async () => {
    const access = canControlMineAlarm(currentUser);
    if (!access.allowed) {
      showAlarmFeedback(
        access.reason || 'Acción bloqueada: Solo Administración de Empresa o MineSafe puede finalizar un simulacro.',
        'error'
      );
      return;
    }

    const dev = visibleDevices.find(d => d.id === activeTelemetryDeviceId) || visibleDevices[0];
    const targetId = dev?.id || 'device_38A839E81F84';
    const propagationIds = collectPropagationDeviceIds(targetId);

    try {
      await shutdownAlarmCompletelyInRTDB(targetId, currentUser, {
        resetSensorBaselines: true,
        organizationId: effectiveOrgId === 'all' ? currentUser.organizationId : effectiveOrgId,
        targetDeviceIds: propagationIds,
      });
      soundAlert.stopContinuousAlarm();
      soundAlert.playFeedbackBeep();
      setIsDrillActive(false);
      setDrillType(null);
      setIsAlarmActive(false);
      setIsLightActive(false);
      setDismissEmergencyBanner(true);

      const propSet = new Set(propagationIds);
      setDevices(prev => prev.map(d => (propSet.has(d.id) || d.id === targetId) ? {
        ...d,
        status: 'normal',
        alarmaActiva: false,
        rawCO: 45,
        rawPM25: 25,
        metrics: { ...d.metrics, co: 8.5, polvoPM: 25 }
      } : d));

      setAlerts(prev => prev.map(a => (a.id.startsWith('alt-drill-') && !a.resolved ? { ...a, resolved: true, acknowledged: true } : a)));
      await resolveActiveAlertsInRTDB(
        alertsRef.current.filter((a) => !a.resolved && a.id.startsWith('alt-drill-')),
        'Simulacro finalizado desde consola central.',
        currentUser.name || 'Administración'
      ).catch(() => {});
      showAlarmFeedback('Simulacro finalizado y alarma apagada en los nodos del sector.', 'success');
    } catch (err: any) {
      showAlarmFeedback(err?.message || 'Error al detener el simulacro.', 'error');
    }
  }, [currentUser, visibleDevices, activeTelemetryDeviceId, collectPropagationDeviceIds, effectiveOrgId, showAlarmFeedback]);

  const handleToggleAlarm = useCallback(async () => {
    const dev = visibleDevices.find(d => d.id === activeTelemetryDeviceId) || visibleDevices[0];
    const targetId = activeTelemetryDeviceId || dev?.id;
    const currentlyActive = Boolean(isAlarmActive || dev?.alarmaActiva);

    if (currentlyActive) {
      await handleShutdownAlarmCompletely();
      return;
    }

    const access = canControlMineAlarm(currentUser);
    if (!access.allowed) {
      showAlarmFeedback(
        access.reason || 'Acceso denegado: Solo la Administración de Empresa o MineSafe puede activar la alarma.',
        'error'
      );
      return;
    }
    if (!targetId) {
      showAlarmFeedback('No hay ningún dispositivo asignado en esta empresa para activar la alarma.', 'error');
      return;
    }

    const propagationIds = collectPropagationDeviceIds(targetId);

    try {
      await toggleGatewayAlarmInRTDB(targetId, true, currentUser, {
        targetDeviceIds: propagationIds,
      });
      soundAlert.setMuted(false);
      soundAlert.startContinuousAlarm();
      setIsAlarmActive(true);
      setIsLightActive(true);
      setDismissEmergencyBanner(false);
      const propSet = new Set(propagationIds);
      setDevices((prev) => prev.map((d) => (propSet.has(d.id) ? { ...d, alarmaActiva: true } : d)));
      showAlarmFeedback(
        `Alarma sonora y baliza luminosa activadas automáticamente en ${propagationIds.length} ${propagationIds.length === 1 ? 'equipo' : 'equipos'}.`,
        'success'
      );
    } catch (err: any) {
      showAlarmFeedback(err?.message || 'Error al activar la alarma en los nodos.', 'error');
    }
  }, [visibleDevices, activeTelemetryDeviceId, isAlarmActive, currentUser, collectPropagationDeviceIds, showAlarmFeedback, handleShutdownAlarmCompletely]);

  const handleToggleLight = useCallback(async () => {
    if (!currentUser || !isAnyAdminRole(currentUser.role)) {
      showAlarmFeedback('Acceso denegado: Operadores y Supervisores no pueden controlar actuadores de luz/baliza.', 'error');
      return;
    }
    if (!activeTelemetryDeviceId) {
      showAlarmFeedback('No hay dispositivo activo en esta empresa para controlar la baliza LED.', 'error');
      return;
    }
    const next = !isLightActive;
    setIsLightActive(next);
    soundAlert.playFeedbackBeep();
    await toggleGatewayLightInRTDB(activeTelemetryDeviceId, next, currentUser).catch((err: any) => {
      showAlarmFeedback(err?.message || 'Error al controlar la luz del nodo en RTDB.', 'error');
    });
  }, [currentUser, isLightActive, activeTelemetryDeviceId, showAlarmFeedback]);

  const handleAddAssignment = useCallback(async (newAsg: Omit<WorkerAssignment, 'id'>) => {
    const fallbackOrg =
      effectiveOrgId === 'all' ? currentSite.organizationId || DEFAULT_ORGANIZATION.id : effectiveOrgId;
    const targetOrg = newAsg.organizationId || fallbackOrg;
    const access = canManageContractsAndPayments(currentUser, targetOrg, organizations);
    if (!access.allowed) {
      throw new Error(access.reason || 'Permisos insuficientes para crear asignaciones.');
    }
    const created: WorkerAssignment = {
      ...newAsg,
      organizationId: targetOrg,
      id: `asg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    };
    await saveAssignmentToRTDB(created);
    setAssignments((prev) => (prev.some((a) => a.id === created.id) ? prev : [created, ...prev]));
    showAlarmFeedback(`Asignación de ${created.workerName} guardada en Firebase RTDB.`, 'success');
  }, [effectiveOrgId, currentSite.organizationId, currentUser, organizations, showAlarmFeedback]);

  const handleAddRentalContract = useCallback(async (newRent: Omit<DeviceRental, 'id'>) => {
    const fallbackOrg =
      effectiveOrgId === 'all' ? currentSite.organizationId || DEFAULT_ORGANIZATION.id : effectiveOrgId;
    const targetOrg = newRent.organizationId || fallbackOrg;
    const access = canManageContractsAndPayments(currentUser, targetOrg, organizations);
    if (!access.allowed) {
      throw new Error(access.reason || 'Permisos insuficientes para registrar contratos.');
    }
    const created: DeviceRental = {
      ...newRent,
      organizationId: targetOrg,
      id: `rent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    };
    await addRentalContractToRTDB(created, currentUser, platformConfig.registeredDevices, organizations);
    setRentals((prev) => (prev.some((r) => r.id === created.id) ? prev : [created, ...prev]));
    showAlarmFeedback(`Contrato ${created.contractNumber} registrado en Firebase RTDB.`, 'success');
  }, [effectiveOrgId, currentSite.organizationId, currentUser, organizations, platformConfig.registeredDevices, showAlarmFeedback]);

  const handleUpdateRentalContract = useCallback(async (contractId: string, updates: Partial<DeviceRental>) => {
    const updated = await updateRentalContractInRTDB(
      contractId,
      updates,
      currentUser,
      platformConfig.registeredDevices,
      organizations
    );
    setRentals((prev) => prev.map((r) => (r.id === contractId ? updated : r)));
    soundAlert.playFeedbackBeep();
    showAlarmFeedback(`Contrato ${updated.contractNumber} actualizado en Firebase RTDB.`, 'success');
  }, [currentUser, organizations, platformConfig.registeredDevices, showAlarmFeedback]);

  const handleRecordPayment = useCallback(async (contractId: string) => {
    const targetRental = rentals.find((r) => r.id === contractId);
    const targetOrg = targetRental?.organizationId || (effectiveOrgId === 'all' ? DEFAULT_ORGANIZATION.id : effectiveOrgId);
    const access = canManageContractsAndPayments(currentUser, targetOrg, organizations);
    if (!access.allowed) {
      showAlarmFeedback(access.reason || 'Permisos insuficientes para registrar pagos.', 'error');
      throw new Error(access.reason || 'Permisos insuficientes para registrar pagos.');
    }
    if (!targetRental || !Number.isFinite(targetRental.monthlyCostClp) || targetRental.monthlyCostClp <= 0) {
      const msg = 'No se puede registrar el pago: el contrato seleccionado no tiene un monto mensual válido (> 0 CLP).';
      showAlarmFeedback(msg, 'error');
      throw new Error(msg);
    }
    const amount = targetRental.monthlyCostClp;
    const res = await recordPaymentInRTDB(contractId, amount, {
      organizationId: targetOrg,
      actingUser: currentUser,
      organizations,
    });
    soundAlert.playFeedbackBeep();
    setRentals((prev) =>
      prev.map((r) =>
        r.id === contractId
          ? { ...r, paymentStatus: 'al_dia', lastPaymentDate: res.fechaPago }
          : r
      )
    );
    showAlarmFeedback(
      `Pago de $${amount.toLocaleString('es-CL')} CLP (${res.pagoId}) registrado en Firebase RTDB.`,
      'success'
    );
  }, [rentals, effectiveOrgId, currentUser, organizations, showAlarmFeedback]);

  const handleAddSite = useCallback((newSite: MiningSite) => {
    if (!currentUser || !isAnyAdminRole(currentUser.role)) {
      showAlarmFeedback('Acceso denegado: Operadores y Supervisores no pueden registrar faenas mineras.', 'error');
      return;
    }
    const fallbackOrg = effectiveOrgId === 'all' ? DEFAULT_ORGANIZATION.id : effectiveOrgId;
    const targetOrg = newSite.organizationId || fallbackOrg;
    if (!isOrgAuthorizedForUser(currentUser, targetOrg, organizations)) {
      showAlarmFeedback('Acceso denegado: No puedes registrar faenas en otra empresa.', 'error');
      return;
    }
    const scopedNewSite: MiningSite = {
      ...newSite,
      organizationId: targetOrg,
    };
    setSites((prev) => mergeMiningSites(prev, [scopedNewSite]));
    setCurrentSite(scopedNewSite);
    saveSiteToRTDB(scopedNewSite).catch((err: any) => {
      showAlarmFeedback(err?.message || 'Error al guardar faena en Firebase RTDB.', 'error');
    });
  }, [currentUser, effectiveOrgId, organizations, showAlarmFeedback]);

  const handleUpdateSite = useCallback((updatedSite: MiningSite) => {
    if (!currentUser || !isAnyAdminRole(currentUser.role)) {
      showAlarmFeedback('Acceso denegado: Operadores y Supervisores no pueden modificar sectores ni cuadrillas.', 'error');
      return;
    }
    const targetOrg = updatedSite.organizationId || (effectiveOrgId === 'all' ? DEFAULT_ORGANIZATION.id : effectiveOrgId);
    if (!isOrgAuthorizedForUser(currentUser, targetOrg, organizations)) {
      showAlarmFeedback('Acceso denegado: No puedes modificar faenas de otra empresa.', 'error');
      return;
    }
    setSites((prev) =>
      prev.map((s) => (s.id === updatedSite.id ? updatedSite : s))
    );
    setCurrentSite((prev) => (prev.id === updatedSite.id ? updatedSite : prev));
    saveSiteToRTDB(updatedSite).catch((err: any) => {
      showAlarmFeedback(err?.message || 'Error al actualizar faena en Firebase RTDB.', 'error');
    });
  }, [currentUser, effectiveOrgId, organizations, showAlarmFeedback]);

  const handleSaveCrew = useCallback(async (crewPayload: MiningCrew) => {
    const fallbackOrg = effectiveOrgId === 'all' ? DEFAULT_ORGANIZATION.id : effectiveOrgId;
    const targetOrg = crewPayload.organizationId || fallbackOrg;
    const access = canManageCrews(currentUser, targetOrg, organizations);
    if (!access.allowed) {
      const msg = access.reason || 'Permisos insuficientes para crear o editar cuadrillas.';
      showAlarmFeedback(msg, 'error');
      throw new Error(msg);
    }

    const res = await saveCrewToRTDB(
      { ...crewPayload, organizationId: targetOrg },
      currentUser,
      organizations
    );
    setCrews((prev) => mergeMiningCrews(prev, [res.crew]));

    // Sincronizar automáticamente la cuadrilla con el sector elegido si aplica
    if (res.crew.siteId && res.crew.sectorId) {
      const targetSite = sites.find((s) => s.id === res.crew.siteId);
      if (targetSite) {
        const targetSector = targetSite.activeSectors.find((sec) => sec.id === res.crew.sectorId);
        if (targetSector && !(targetSector.assignedCrews || []).includes(res.crew.name)) {
          const updatedSite: MiningSite = {
            ...targetSite,
            activeSectors: targetSite.activeSectors.map((sec) =>
              sec.id === res.crew.sectorId
                ? {
                    ...sec,
                    assignedCrews: [...(sec.assignedCrews || []), res.crew.name],
                    activeWorkers:
                      sec.activeWorkers === 0 && res.crew.members.length > 0
                        ? res.crew.members.length
                        : sec.activeWorkers,
                  }
                : sec
            ),
          };
          setSites((prev) => prev.map((s) => (s.id === updatedSite.id ? updatedSite : s)));
          setCurrentSite((prev) => (prev.id === updatedSite.id ? updatedSite : prev));
          saveSiteToRTDB(updatedSite).catch(() => {});
        }
      }
    }

    showAlarmFeedback(
      res.savedToRTDB
        ? `Cuadrilla "${res.crew.name}" guardada en Firebase RTDB.`
        : `Cuadrilla "${res.crew.name}" guardada en respaldo local.`,
      'success'
    );
  }, [currentUser, effectiveOrgId, organizations, sites, showAlarmFeedback]);

  const handleDeleteCrew = useCallback(async (crewId: string, organizationId: string) => {
    const targetOrg =
      organizationId || (effectiveOrgId === 'all' ? DEFAULT_ORGANIZATION.id : effectiveOrgId);
    const access = canManageCrews(currentUser, targetOrg, organizations);
    if (!access.allowed) {
      const msg = access.reason || 'Permisos insuficientes para eliminar cuadrillas.';
      showAlarmFeedback(msg, 'error');
      throw new Error(msg);
    }

    await deleteCrewFromRTDB(crewId, targetOrg, currentUser, organizations);
    setCrews((prev) => prev.filter((c) => c.id !== crewId));
    showAlarmFeedback('Cuadrilla eliminada correctamente.', 'success');
  }, [currentUser, effectiveOrgId, organizations, showAlarmFeedback]);

  // User Management Handlers
  const handleAddUser = useCallback(async (newUser: UserProfile) => {
    // Regla: Solo existe un único SuperAdmin en toda la plataforma y solo él puede crear/otorgar Admin Corporativo MineSafe.
    const safeRole: UserRole =
      newUser.role === 'superadmin'
        ? 'admin'
        : newUser.role === 'admin_minesafe' && currentUser.role !== 'superadmin'
        ? 'admin'
        : newUser.role;
    const requestedOrgId = newUser.organizationId;
    const targetOrgId =
      isGlobalMineSafeAdmin(currentUser.role)
        ? requestedOrgId || DEFAULT_ORGANIZATION.id
        : requestedOrgId && isOrgAuthorizedForUser(currentUser, requestedOrgId, organizations)
        ? requestedOrgId
        : currentUser.organizationId || DEFAULT_ORGANIZATION_ID;

    const provisionCheck = canProvisionUserInOrganization(
      currentUser,
      targetOrgId,
      safeRole,
      organizations
    );
    if (!provisionCheck.allowed) {
      const msg = provisionCheck.reason || 'Permisos insuficientes para crear usuario.';
      showAlarmFeedback(msg, 'error');
      throw new Error(msg);
    }

    const safeUser: UserProfile = {
      ...newUser,
      organizationId: targetOrgId,
      role: safeRole,
      roleLabel:
        safeRole === 'admin_minesafe'
          ? 'Admin Corporativo MineSafe'
          : safeRole === 'admin'
          ? 'Administrador de Empresa'
          : safeRole === 'supervisor'
          ? 'Supervisor Ambiental'
          : 'Usuario Normal / Operador de Faena',
    };
    const prevUsers = usersList;
    setUsersList((prev) => [safeUser, ...prev]);
    try {
      await addUserToRTDB(safeUser, currentUser, organizations);
      showAlarmFeedback(`Usuario ${safeUser.name} registrado en Firebase RTDB.`, 'success');
    } catch (err: any) {
      setUsersList(prevUsers);
      const msg = err?.message || 'Error al registrar usuario en Firebase RTDB.';
      showAlarmFeedback(msg, 'error');
      throw err;
    }
  }, [currentUser, organizations, usersList, showAlarmFeedback]);

  const handleUpdateUserRole = useCallback(async (userId: string, newRole: UserRole) => {
    const targetUser = usersList.find((u) => u.id === userId);
    if (!targetUser) return;

    const check = canModifyTargetUser(currentUser, targetUser, newRole, organizations);
    if (!check.allowed) {
      const msg = check.reason || 'Acción denegada.';
      showAlarmFeedback(msg, 'error');
      throw new Error(msg);
    }

    soundAlert.playFeedbackBeep();
    const roleLabels: Record<UserRole, string> = {
      superadmin: 'Super Administrador de Seguridad Minera',
      admin_minesafe: 'Admin Corporativo MineSafe',
      admin: 'Administrador de Empresa',
      supervisor: 'Supervisor Ambiental',
      operador: 'Usuario Normal / Operador de Faena',
    };

    const prevUsers = usersList;
    const prevCurrentUser = currentUser;

    setUsersList((prev) =>
      prev.map((u) =>
        u.id === userId
          ? { ...u, role: newRole, roleLabel: roleLabels[newRole] }
          : u
      )
    );

    if (currentUser.id === userId) {
      setCurrentUser((prev) => ({
        ...prev,
        role: newRole,
        roleLabel: roleLabels[newRole],
      }));
    }

    try {
      await updateUserInRTDB(
        userId,
        {
          name: targetUser.name,
          email: targetUser.email,
          rut: targetUser.rut,
          role: newRole,
          roleLabel: roleLabels[newRole],
        },
        currentUser,
        organizations
      );
      showAlarmFeedback(`Rol actualizado para ${targetUser.name} en Firebase RTDB.`, 'success');
    } catch (err: any) {
      setUsersList(prevUsers);
      if (prevCurrentUser.id === userId) {
        setCurrentUser(prevCurrentUser);
      }
      const msg = err?.message || 'Error al actualizar el rol del usuario en Firebase RTDB.';
      showAlarmFeedback(msg, 'error');
      throw err;
    }
  }, [currentUser, organizations, usersList, showAlarmFeedback]);

  const handleToggleUserStatus = useCallback(async (userId: string, reason?: string) => {
    const targetUser = usersList.find(u => u.id === userId);
    if (!targetUser) return;

    const check = canModifyTargetUser(currentUser, targetUser, undefined, organizations);
    if (!check.allowed) {
      const msg = check.reason || 'Acción denegada.';
      showAlarmFeedback(msg, 'error');
      throw new Error(msg);
    }

    soundAlert.playFeedbackBeep();
    const nextStatus = targetUser.status === 'activo' ? 'inactivo' : 'activo';
    const cleanReason = (reason || '').trim() || 'Bloqueado por desvinculación empresarial';
    const blockTimestamp = Date.now();
    const blockActor = currentUser.name || currentUser.email || 'Administración';
    const prevUsers = usersList;

    setUsersList((prev) =>
      prev.map((u) =>
        u.id === userId
          ? {
              ...u,
              status: nextStatus,
              blockedReason: nextStatus === 'inactivo' ? cleanReason : undefined,
              blockedAt: nextStatus === 'inactivo' ? blockTimestamp : undefined,
              blockedBy: nextStatus === 'inactivo' ? blockActor : undefined,
            }
          : u
      )
    );

    try {
      await updateUserInRTDB(
        userId,
        {
          name: targetUser.name,
          email: targetUser.email,
          status: nextStatus,
          ...(nextStatus === 'inactivo'
            ? {
                blockedReason: cleanReason,
                blockedAt: blockTimestamp,
                blockedBy: blockActor,
              }
            : {}),
        },
        currentUser,
        organizations
      );
      showAlarmFeedback(
        nextStatus === 'inactivo'
          ? `Usuario ${targetUser.name} bloqueado (${cleanReason}). Su sesión queda revocada en esta empresa.`
          : `Acceso desbloqueado para ${targetUser.name} en Firebase RTDB.`,
        'success'
      );
    } catch (err: any) {
      setUsersList(prevUsers);
      const msg = err?.message || 'Error al actualizar estado del usuario en Firebase RTDB.';
      showAlarmFeedback(msg, 'error');
      throw err;
    }
  }, [currentUser, organizations, usersList, showAlarmFeedback]);

  const handleLogin = useCallback((user: UserProfile) => {
    setCurrentUser(user);
    onSessionUserUpdated?.(user);
    setShowLoginModal(false);
  }, [onSessionUserUpdated]);

  const handleLogout = useCallback(async () => {
    soundAlert.stopContinuousAlarm();
    alertEngine.clearActiveIncidents();
    processedDismissedAlertIdsRef.current.clear();
    rawDevicesRef.current = {};
    setShowLoginModal(false);
    setShowEmergencyModal(false);
    setDevices([]);
    setOrganizations([]);
    setActiveOrganizationId('all');
    setRentals([]);
    setAssignments([]);
    setSites([]);
    setCrews([]);
    setSelectedSensorId(null);
    setActiveTelemetryDeviceId('');
    setVariables(createEmptyTelemetryVariables());
    setAlerts([]);
    setAlertEvents([]);
    setTelemetryHistory([]);
    setUsersList([]);
    await onLogoutRequest();
  }, [onLogoutRequest]);

  const authorizedOrgIds = useMemo(
    () => getAuthorizedOrganizationIds(currentUser, organizations),
    [currentUser, organizations]
  );
  const scopedOrganizations = useMemo(() => {
    if (isGlobalMineSafeAdmin(currentUser?.role)) return organizations;
    const allowedSet = new Set(authorizedOrgIds);
    return organizations.filter((o) => allowedSet.has(o.id));
  }, [currentUser?.role, organizations, authorizedOrgIds]);

  const activeOrgObj = useMemo(
    () => scopedOrganizations.find((o) => o.id === effectiveOrgId) || organizations.find((o) => o.id === effectiveOrgId),
    [scopedOrganizations, organizations, effectiveOrgId]
  );

  const scopedSites = useMemo(
    () => sites.filter((s) => matchesOrg(s.organizationId)),
    [sites, matchesOrg]
  );
  const scopedCurrentSite = useMemo(
    () => resolveScopedCurrentSite(scopedSites, currentSite.id, effectiveOrgId, activeOrgObj?.name),
    [scopedSites, currentSite.id, effectiveOrgId, activeOrgObj?.name]
  );
  const scopedUsers = useMemo(
    () => filterScopedUsers(usersList, currentUser, effectiveOrgId, scopedOrganizations),
    [usersList, currentUser, effectiveOrgId, scopedOrganizations]
  );
  const scopedRentals = useMemo(
    () => rentals.filter((r) => matchesOrg(r.organizationId)),
    [rentals, matchesOrg]
  );
  const scopedAssignments = useMemo(
    () => assignments.filter((a) => matchesOrg(a.organizationId)),
    [assignments, matchesOrg]
  );
  const scopedCrews = useMemo(
    () => crews.filter((c) => matchesOrg(c.organizationId)),
    [crews, matchesOrg]
  );
  const scopedAlerts = useMemo(
    () => alerts.filter((a) => matchesOrg(a.organizationId)),
    [alerts, matchesOrg]
  );
  const scopedAlertEvents = useMemo(
    () => alertEvents.filter((ev) => matchesOrg(ev.organizationId)),
    [alertEvents, matchesOrg]
  );
  const activeAlerts = scopedAlerts.filter(a => !a.resolved);

  // Check if gas or dust in the active device is in critical threshold (Prompt Req 4)
  // An emergency in terrain MUST ONLY trigger if the device is ONLINE and its channels are NOT in sensor fault.
  const activeDevice = visibleDevices.find(d => d.id === activeTelemetryDeviceId) || visibleDevices[0];
  const isDeviceOnline = Boolean(activeDevice?.gatewayOnline);
  const activeFaults = new Set(activeDevice?.faultFields || []);
  const rawGas = activeDevice?.rawCO !== undefined ? activeDevice.rawCO : activeDevice?.metrics?.co || 0;
  const rawDust = activeDevice?.rawPM25 !== undefined ? activeDevice.rawPM25 : activeDevice?.metrics?.polvoPM || 0;

  const isGasCritical = isDeviceOnline && !activeFaults.has('CO') && rawGas >= platformConfig.metrics.emergencyGasThreshold;
  const isDustCritical = isDeviceOnline && !activeFaults.has('PM2_5') && rawDust >= platformConfig.metrics.emergencyDustThreshold;
  const isFieldEmergencyActive = (isGasCritical || isDustCritical || isAlarmActive || isDrillActive) && !dismissEmergencyBanner;

  const CONTROLLABLE_ORDER: ControllableTab[] = [
    'dashboard',
    'monitoreo',
    'alertas',
    'reportes',
    'faenas',
    'configuracion_alertas',
    'equipos',
    'usuarios',
    'empresas',
    'visor_3d',
    'gateway_3d',
  ];

  // Proteger todas las ventanas según las reglas dinámicas del SuperAdministrador
  useEffect(() => {
    if (!currentUser) return;
    if (!isTabVisibleForUser(currentTab, currentUser, platformConfig)) {
      const firstAllowed = CONTROLLABLE_ORDER.find((tab) =>
        isTabVisibleForUser(tab, currentUser, platformConfig)
      );
      if (firstAllowed && firstAllowed !== currentTab) {
        setCurrentTab(firstAllowed);
      }
    }
  }, [currentUser, currentTab, platformConfig]);

  const handleSelectTab = useCallback((tab: NavigationTab) => {
    if (!currentUser) return;
    if (
      (tab === 'superadmin_panel' || tab === 'superadmin_vistas' || tab === 'superadmin_docs') &&
      currentUser.role !== 'superadmin'
    ) {
      return;
    }
    if (!isTabVisibleForUser(tab, currentUser, platformConfig)) {
      const firstAllowed = CONTROLLABLE_ORDER.find((t) =>
        isTabVisibleForUser(t, currentUser, platformConfig)
      );
      if (firstAllowed) {
        setCurrentTab(firstAllowed);
      }
      return;
    }
    setCurrentTab(tab);
  }, [currentUser, platformConfig]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-white">
      
      {/* Top Navbar */}
      <Navbar
        currentTab={currentTab}
        onSelectTab={handleSelectTab}
        activeAlertCount={activeAlerts.length}
        currentUser={currentUser}
        onChangeUser={() => setShowLoginModal(true)}
        onOpenChangePassword={() => setShowChangePasswordModal(true)}
        onLogout={handleLogout}
        onTriggerEmergency={() => {
          if (currentUser?.role !== 'operador') {
            setShowEmergencyModal(true);
          }
        }}
        onRefreshData={handleRefreshData}
        isSimulating={isSimulating}
        onToggleSimulation={() => setIsSimulating(!isSimulating)}
        isFirebaseConnected={isFirebaseConnected}
        onResetPageLevels={handleResetPageLevels}
        isAlarmActive={Boolean(isAlarmActive || activeDevice?.alarmaActiva)}
        onToggleAlarm={handleToggleAlarm}
        isLightActive={isLightActive}
        onToggleLight={handleToggleLight}
        isDrillActive={isDrillActive}
        platformConfig={platformConfig}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onOpenTypography={() => setShowTypographyModal(true)}
        isCustomTypographyActive={isCustomTypographyActive}
        organizations={scopedOrganizations}
        activeOrganizationId={effectiveOrgId}
        onSelectOrganization={setActiveOrganizationId}
        siteBadgeName={
          scopedCurrentSite.name !== 'Sin faena registrada'
            ? scopedCurrentSite.name
            : activeOrgObj?.name
        }
      />

      {/* Feedback de Control de Alarma (Solo SuperAdmin puede apagarla) */}
      {alarmFeedback && (
        <div
          className={`px-4 py-2.5 border-b text-xs sm:text-sm font-semibold ${
            alarmFeedback.tone === 'error'
              ? 'bg-rose-950/95 border-rose-700 text-rose-100'
              : 'bg-emerald-950/95 border-emerald-700 text-emerald-100'
          }`}
        >
          <div className="max-w-[1850px] w-full mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {alarmFeedback.tone === 'error' ? (
                <Lock className="w-4 h-4 text-amber-300 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
              <span>{alarmFeedback.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setAlarmFeedback(null)}
              className="p-1 hover:bg-black/20 rounded text-slate-300 hover:text-white"
              title="Cerrar aviso"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Global Announcement Banner (Configurado por SuperAdministrador) */}
      {platformConfig.appearance.announcementEnabled && platformConfig.appearance.announcementText.trim() !== '' && (
        <div
          className={`px-4 py-2.5 border-b text-xs sm:text-sm font-semibold ${
            platformConfig.appearance.announcementTone === 'critical'
              ? 'bg-red-950/90 border-red-700 text-red-100'
              : platformConfig.appearance.announcementTone === 'warning'
              ? 'bg-amber-950/90 border-amber-700 text-amber-100'
              : 'bg-cyan-950/90 border-cyan-800 text-cyan-100'
          }`}
        >
          <div className="max-w-[1850px] w-full mx-auto flex items-center gap-2.5">
            <Megaphone className="w-4 h-4 shrink-0" />
            <span className="uppercase tracking-wider text-[10px] font-black px-2 py-0.5 rounded bg-black/30 border border-white/15 shrink-0">
              Aviso Dirección
            </span>
            <span>{platformConfig.appearance.announcementText}</span>
          </div>
        </div>
      )}

      {/* Global Emergency Banner (Prompt Req 4) */}
      {isFieldEmergencyActive && (
        <div className={`${
          isDrillActive 
            ? 'bg-amber-600 border-b-2 border-amber-900 shadow-amber-950' 
            : 'bg-red-600 border-b-2 border-red-900 shadow-red-950'
        } text-white font-black px-4 py-3 shadow-2xl animate-pulse`}>
          <div className="max-w-[1850px] w-full mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-3.5 w-3.5 relative shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-90"></span>
                <span className={`relative inline-flex rounded-full h-3.5 w-3.5 ${isDrillActive ? 'bg-amber-300' : 'bg-yellow-300'}`}></span>
              </span>
              <ShieldAlert className="w-5 h-5 text-white shrink-0 animate-bounce" />
              <span className="text-xs sm:text-sm md:text-base tracking-wide uppercase font-black drop-shadow">
                {isDrillActive ? (
                  <>
                    <span className="bg-black/60 px-2.5 py-0.5 rounded mr-2 border-2 border-amber-200 text-amber-200">
                      MODO SIMULACRO ACTIVO · NO ES UNA EMERGENCIA REAL
                    </span>
                    Entrenamiento DS 132: sirenas y lecturas forzadas temporalmente solo para validación operativa
                  </>
                ) : (
                  '¡ALERTA REAL EN TERRENO: Baliza estroboscópica y sirena acústica activadas en el nodo sensor!'
                )}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden md:flex items-center gap-2 text-xs font-mono font-bold bg-black/40 px-2.5 py-1 rounded border border-white/20">
                <span>{activeDevice?.name || activeDevice?.id}:</span>
                {isGasCritical && <span>MQ-2 Crítico ({activeDevice?.rawCO || activeDevice?.metrics?.co} ADC)</span>}
                {isGasCritical && isDustCritical && <span>•</span>}
                {isDustCritical && <span>Polvo PM2.5 ({activeDevice?.rawPM25 || activeDevice?.metrics?.polvoPM} µg/m³)</span>}
                {isDrillActive && <span>• [SIMULACRO OPERATIVO]</span>}
              </div>
              {canControlMineAlarm(currentUser).allowed ? (
                <button
                  type="button"
                  onClick={async () => {
                    await handleShutdownAlarmCompletely();
                  }}
                  className={`px-2.5 py-1 ${
                    isDrillActive ? 'bg-black text-amber-300 hover:bg-slate-900 border border-amber-400' : 'bg-white hover:bg-slate-100 text-red-700'
                  } text-xs font-black uppercase rounded shadow transition-colors whitespace-nowrap`}
                >
                  {isDrillActive ? 'Finalizar y Apagar Todo' : 'Apagar Alarma y Baliza'}
                </button>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-black/50 border border-white/25 text-[11px] font-bold text-amber-200 whitespace-nowrap">
                  <Lock className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                  Control reservado a Administración
                </span>
              )}
              {canControlMineAlarm(currentUser).allowed && (
                <button
                  type="button"
                  onClick={() => setDismissEmergencyBanner(true)}
                  className="p-1 hover:bg-black/20 text-white rounded transition-colors"
                  title="Descartar banner"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Evacuation Alert Banner (if active) */}
      {evacuationActive && (
        <div className="bg-rose-950 border-b border-rose-800 text-rose-200 px-4 py-3 flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-2 max-w-[1850px] w-full mx-auto text-xs sm:text-sm font-bold">
            <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
            <span>ESTADO DE EVACUACIÓN ACTIVO EN FAENA — Todos los operadores deben dirigirse al refugio minero más cercano.</span>
          </div>
          {currentUser.role !== 'operador' && (
            <button 
              onClick={() => setEvacuationActive(false)}
              className="p-1 hover:text-white text-rose-400"
              title="Cancelar estado de evacuación"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-[1850px] w-full mx-auto px-3 sm:px-4 lg:px-6 py-6 sm:py-8">

        {!isTabVisibleForUser(currentTab, currentUser, platformConfig) ? (
          <div className="p-8 text-center bg-slate-900/80 border border-red-900/50 rounded-2xl max-w-xl mx-auto my-12 shadow-xl">
            <Lock className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Ventana Bloqueada por el SuperAdministrador</h2>
            <p className="text-slate-400 text-sm mb-4">
              El SuperAdministrador ha restringido temporalmente el acceso a esta ventana para tu usuario o rol.
            </p>
            <p className="text-xs text-slate-500">
              Si necesitas acceso a este módulo operativo, comunícate con el SuperAdministrador de MineSafe IoT.
            </p>
          </div>
        ) : (
          <>
            {currentTab === 'dashboard' && (
              <DashboardView
                variables={variables}
                telemetryHistory={telemetryHistory}
                activeAlerts={activeAlerts}
                currentSite={scopedCurrentSite}
                sites={scopedSites}
                crews={scopedCrews}
                organizations={scopedOrganizations}
                activeOrganizationId={effectiveOrgId}
                onSelectOrganization={setActiveOrganizationId}
                devices={visibleDevices}
                activeTelemetryDeviceId={activeTelemetryDeviceId}
                onSelectTelemetryDevice={setActiveTelemetryDeviceId}
                onNavigateTab={handleSelectTab}
                onSelectSensor={(sensorId) => {
                  setSelectedSensorId(sensorId);
                  handleSelectTab('monitoreo');
                }}
                onAcknowledgeAlert={handleAcknowledgeAlert}
                onResetPageLevels={handleResetPageLevels}
                isAlarmActive={isAlarmActive}
                onToggleAlarm={handleToggleAlarm}
                onShutdownAlarmCompletely={handleShutdownAlarmCompletely}
                onToggleGatewayAlarm={handleToggleGatewayAlarm}
                isLightActive={isLightActive}
                onToggleLight={handleToggleLight}
                currentUser={currentUser}
                usersList={scopedUsers}
                onChangeUserModal={() => setShowLoginModal(true)}
                platformConfig={platformConfig}
              />
            )}

            {currentTab === 'monitoreo' && (
              <MonitoringView
                devices={visibleDevices}
                currentSite={scopedCurrentSite}
                sites={scopedSites}
                crews={scopedCrews}
                organizations={scopedOrganizations}
                activeOrganizationId={effectiveOrgId}
                onSelectOrganization={setActiveOrganizationId}
                currentUser={currentUser}
                platformConfig={platformConfig}
                selectedSensorId={selectedSensorId}
                onSelectSensor={setSelectedSensorId}
                onSimulateGasSpike={handleSimulateGasSpike}
                onResetSensor={handleResetSensor}
              />
            )}

            {currentTab === 'alertas' && (
              <AlertsView
                alerts={scopedAlerts}
                devices={visibleDevices}
                currentUser={currentUser}
                platformConfig={platformConfig}
                isReadOnly={currentUser.role === 'operador'}
                onAcknowledgeAlert={handleAcknowledgeAlert}
                onResolveAlert={handleResolveAlert}
                onResolveAlertWithDetails={handleResolveAlertWithDetails}
                onTriggerForcedVentilation={handleTriggerForcedVentilation}
                onNavigateTab={handleSelectTab}
                onSelectSensor={(sensorId) => {
                  setSelectedSensorId(sensorId);
                  handleSelectTab('monitoreo');
                }}
              />
            )}

            {currentTab === 'configuracion_alertas' && (
              <AlertConfigurationView
                devices={visibleDevices}
                currentUser={currentUser}
                platformConfig={platformConfig}
                activeOrganizationId={effectiveOrgId}
              />
            )}

            {currentTab === 'equipos' && (
              <DevicesAndRentalsView
                rentals={scopedRentals}
                assignments={scopedAssignments}
                devices={visibleDevices}
                catalogDevices={mergedRegisteredDevices}
                rtdbDevices={devices}
                crews={scopedCrews}
                usersList={scopedUsers}
                allSites={scopedSites}
                organizations={scopedOrganizations}
                currentUser={currentUser}
                platformConfig={platformConfig}
                activeOrganizationId={effectiveOrgId}
                onAddAssignment={handleAddAssignment}
                onAddRentalContract={handleAddRentalContract}
                onUpdateRentalContract={handleUpdateRentalContract}
                onRecordPayment={handleRecordPayment}
                onSaveCrew={handleSaveCrew}
                onDeleteCrew={handleDeleteCrew}
                onSelectOrganization={setActiveOrganizationId}
                onOrganizationsChanged={(changedOrg, deletedId) => {
                  setOrganizations((prev) => {
                    if (deletedId) {
                      return prev.filter((o) => o.id !== deletedId);
                    }
                    const exists = prev.some((o) => o.id === changedOrg.id);
                    return exists
                      ? prev.map((o) => (o.id === changedOrg.id ? changedOrg : o))
                      : [...prev, changedOrg];
                  });
                }}
                onCatalogDeviceUpdated={(savedReg) => {
                  setCatalogDevices((prev) => {
                    const exists = prev.some((d) => d.id === savedReg.id);
                    return exists
                      ? prev.map((d) => (d.id === savedReg.id ? savedReg : d))
                      : [savedReg, ...prev];
                  });
                  setPlatformConfig((prev) => {
                    const list = prev.registeredDevices || [];
                    const exists = list.some((d) => d.id === savedReg.id);
                    return {
                      ...prev,
                      registeredDevices: exists
                        ? list.map((d) => (d.id === savedReg.id ? savedReg : d))
                        : [...list, savedReg],
                    };
                  });
                }}
                onCatalogDeviceDeleted={(devId) => {
                  setCatalogDevices((prev) => prev.filter((d) => d.id !== devId));
                  setPlatformConfig((prev) => ({
                    ...prev,
                    registeredDevices: (prev.registeredDevices || []).filter((d) => d.id !== devId),
                  }));
                }}
              />
            )}

            {currentTab === 'reportes' && (
              <HistoricalReportsView
                variables={variables}
                currentSite={scopedCurrentSite}
                currentUser={currentUser}
                platformConfig={platformConfig}
                activeDeviceId={activeDevice?.id || ''}
                activeDeviceName={activeDevice?.name || 'Sin dispositivo asignado'}
                telemetryHistory={telemetryHistory}
                alertEvents={scopedAlertEvents}
                alerts={scopedAlerts}
                onRangeChange={handleReportRangeChange}
                isHistoryLoading={isHistoryLoading}
                historyTruncated={historyTruncated}
                historyError={historyError}
              />
            )}

            {currentTab === 'faenas' && (
              <MiningSectorsView
                currentSite={scopedCurrentSite}
                allSites={scopedSites}
                assignments={scopedAssignments}
                crews={scopedCrews}
                usersList={scopedUsers}
                organizations={scopedOrganizations}
                currentUser={currentUser}
                platformConfig={platformConfig}
                activeOrganizationId={effectiveOrgId}
                onSelectSite={(siteId) => {
                  const found = scopedSites.find(s => s.id === siteId);
                  if (found) setCurrentSite(found);
                }}
                onAddSite={handleAddSite}
                onUpdateSite={handleUpdateSite}
                onSaveCrew={handleSaveCrew}
                onDeleteCrew={handleDeleteCrew}
                onNavigateTab={handleSelectTab}
              />
            )}

            {currentTab === 'usuarios' && (
              <UsersManagementView
                currentUser={currentUser}
                usersList={scopedUsers}
                organizations={scopedOrganizations}
                activeOrganizationId={effectiveOrgId}
                onAddUser={handleAddUser}
                onUpdateUserRole={handleUpdateUserRole}
                onToggleUserStatus={handleToggleUserStatus}
              />
            )}

            {currentTab === 'empresas' && (
              <CompanyBulkManagementView
                currentUser={currentUser}
                organizations={scopedOrganizations}
                sites={scopedSites}
                crews={scopedCrews}
                devices={visibleDevices}
                catalogDevices={mergedRegisteredDevices}
                rtdbDevices={devices}
                activeOrganizationId={effectiveOrgId}
                platformConfig={platformConfig}
                onSelectOrganization={setActiveOrganizationId}
                onOrganizationsChanged={(changedOrg, deletedId) => {
                  setOrganizations((prev) => {
                    if (deletedId) {
                      return prev.filter((o) => o.id !== deletedId);
                    }
                    const exists = prev.some((o) => o.id === changedOrg.id);
                    return exists
                      ? prev.map((o) => (o.id === changedOrg.id ? changedOrg : o))
                      : [...prev, changedOrg];
                  });
                }}
                onSiteSaved={(savedSite) => {
                  setSites((prev) => mergeMiningSites(prev, [savedSite]));
                  setCurrentSite((prev) => (prev.id === savedSite.id ? savedSite : prev));
                }}
                onCrewSaved={(savedCrew) => {
                  setCrews((prev) => mergeMiningCrews(prev, [savedCrew]));
                }}
                onDeviceHierarchySaved={(savedReg) => {
                  setCatalogDevices((prev) => {
                    const exists = prev.some((d) => d.id === savedReg.id);
                    return exists
                      ? prev.map((d) => (d.id === savedReg.id ? savedReg : d))
                      : [savedReg, ...prev];
                  });
                  setPlatformConfig((prev) => {
                    const list = prev.registeredDevices || [];
                    const exists = list.some((d) => d.id === savedReg.id);
                    return {
                      ...prev,
                      registeredDevices: exists
                        ? list.map((d) => (d.id === savedReg.id ? savedReg : d))
                        : [...list, savedReg],
                    };
                  });
                }}
                onDeviceDeleted={(devId) => {
                  setCatalogDevices((prev) => prev.filter((d) => d.id !== devId));
                  setPlatformConfig((prev) => ({
                    ...prev,
                    registeredDevices: (prev.registeredDevices || []).filter((d) => d.id !== devId),
                  }));
                }}
                onBulkImportCompleted={(result: BulkImportExecutionResult) => {
                  if (result.createdUsers.length > 0) {
                    setUsersList((prev) => {
                      const map = new Map(prev.map((u) => [u.id, u]));
                      result.createdUsers.forEach((u) => map.set(u.id, u));
                      return Array.from(map.values());
                    });
                  }
                  if (result.createdSites.length > 0) {
                    setSites((prev) => mergeMiningSites(prev, result.createdSites));
                  }
                  if (result.createdCrews.length > 0) {
                    setCrews((prev) => mergeMiningCrews(prev, result.createdCrews));
                  }
                  if (result.createdDevices.length > 0) {
                    setPlatformConfig((prev) => {
                      const map = new Map((prev.registeredDevices || []).map((d) => [d.id, d]));
                      result.createdDevices.forEach((d) => map.set(d.id, d));
                      return {
                        ...prev,
                        registeredDevices: Array.from(map.values()),
                      };
                    });
                  }
                  if (result.createdRentals.length > 0) {
                    setRentals((prev) => {
                      const map = new Map(prev.map((r) => [r.id, r]));
                      result.createdRentals.forEach((r) => map.set(r.id, r));
                      return Array.from(map.values());
                    });
                  }
                  if (result.createdAssignments.length > 0) {
                    setAssignments((prev) => {
                      const map = new Map(prev.map((a) => [a.id, a]));
                      result.createdAssignments.forEach((a) => map.set(a.id, a));
                      return Array.from(map.values());
                    });
                  }
                }}
              />
            )}

            {currentTab === 'visor_3d' && (
              <Suspense
                fallback={
                  <div className="p-10 text-center bg-slate-900/80 border border-slate-800 rounded-2xl max-w-xl mx-auto my-12">
                    <div className="w-8 h-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin mx-auto mb-3" />
                    <p className="text-sm font-semibold text-slate-200">Cargando Inspector 3D del Nodo...</p>
                  </div>
                }
              >
                <Node3DInspectorView
                  activeDevice={activeDevice}
                  showTelemetryPanel={isSectionVisibleForUser(
                    'v3d_telemetry_panel',
                    currentUser,
                    platformConfig
                  )}
                />
              </Suspense>
            )}

            {currentTab === 'gateway_3d' && (
              <Suspense
                fallback={
                  <div className="p-10 text-center bg-slate-900/80 border border-slate-800 rounded-2xl max-w-xl mx-auto my-12">
                    <div className="w-8 h-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin mx-auto mb-3" />
                    <p className="text-sm font-semibold text-slate-200">Cargando Inspector 3D del Gateway...</p>
                  </div>
                }
              >
                <Gateway3DInspectorView
                  activeDevice={activeDevice}
                  isFirebaseConnected={isFirebaseConnected}
                  showTelemetryPanel={isSectionVisibleForUser(
                    'v3d_telemetry_panel',
                    currentUser,
                    platformConfig
                  )}
                />
              </Suspense>
            )}

            {currentTab === 'superadmin_panel' && currentUser.role === 'superadmin' && (
              <SuperAdminControlView
                currentUser={currentUser}
                usersList={scopedUsers}
                platformConfig={platformConfig}
                rtdbDevices={devices}
                catalogDevices={mergedRegisteredDevices}
                organizations={organizations}
                sites={sites}
                activeOrganizationId={activeOrganizationId}
                onSelectOrganization={setActiveOrganizationId}
                onUpdateUserRole={handleUpdateUserRole}
                onToggleUserStatus={handleToggleUserStatus}
                onPreviewTextScale={setPreviewTextScalePct}
                onPreviewTypography={setPreviewTypography}
                onCatalogDeviceUpdated={(savedReg) => {
                  setCatalogDevices((prev) => {
                    const exists = prev.some((d) => d.id === savedReg.id);
                    return exists
                      ? prev.map((d) => (d.id === savedReg.id ? savedReg : d))
                      : [savedReg, ...prev];
                  });
                }}
                onCatalogDeviceDeleted={(devId) => {
                  setCatalogDevices((prev) => prev.filter((d) => d.id !== devId));
                }}
              />
            )}

            {currentTab === 'superadmin_vistas' && currentUser.role === 'superadmin' && (
              <SuperAdminViewsCustomizerView
                currentUser={currentUser}
                platformConfig={platformConfig}
                usersList={scopedUsers}
                onConfigSaved={setPlatformConfig}
                currentSiteName={currentSite?.name}
                activeDeviceName={activeDevice?.name || activeDevice?.id}
                devicesCount={visibleDevices.length}
                activeAlertsCount={alerts.filter((a) => !a.resolved).length}
              />
            )}

            {currentTab === 'superadmin_docs' && currentUser.role === 'superadmin' && (
              <Suspense
                fallback={
                  <div className="p-10 text-center bg-slate-900/80 border border-slate-800 rounded-2xl max-w-xl mx-auto my-12">
                    <div className="w-8 h-8 rounded-full border-2 border-purple-500 border-t-transparent animate-spin mx-auto mb-3" />
                    <p className="text-sm font-semibold text-slate-200">Cargando Centro Documental P031...</p>
                  </div>
                }
              >
                <SuperAdminDocsView currentUser={currentUser} />
              </Suspense>
            )}
          </>
        )}

      </main>

      {/* User Credential / Carnet Modal */}
      {showLoginModal && (
        <LoginModal
          currentUser={currentUser}
          organizations={scopedOrganizations}
          sites={scopedSites}
          crews={scopedCrews}
          onLogin={handleLogin}
          onLogout={handleLogout}
          onClose={() => setShowLoginModal(false)}
          theme={theme}
          onToggleTheme={handleToggleTheme}
        />
      )}

      {/* Authenticated Change Password Modal (MS-06) */}
      {showChangePasswordModal && (
        <ChangePasswordModal
          user={currentUser}
          onClose={() => setShowChangePasswordModal(false)}
          onPasswordChanged={(updated) => setCurrentUser(updated)}
        />
      )}

      {/* Granular Typography Control Drawer (Titles, Subtitles, General Text & Small Labels) */}
      {showTypographyModal && (
        <TypographyControlModal
          currentUser={currentUser}
          effectiveTypography={effectiveTypography}
          globalTypography={globalTypography}
          hasLocalOverride={localTypographyOverride !== null}
          onPreviewLive={setPreviewTypography}
          onChangeLocal={handleLocalTypographyChange}
          onResetToGlobal={handleResetTypographyToGlobal}
          onSaveGlobal={currentUser.role === 'superadmin' ? handleSaveGlobalTypography : undefined}
          onClose={() => {
            setPreviewTypography(null);
            setShowTypographyModal(false);
          }}
        />
      )}

      {/* Emergency Evacuation & Drill Modal */}
      {showEmergencyModal && currentUser.role !== 'operador' && (
        <EmergencyModal
          onClose={() => setShowEmergencyModal(false)}
          onConfirmEvacuation={() => {
            setEvacuationActive(true);
            soundAlert.playCriticalAlert();
            setIsAlarmActive(true);
            setDismissEmergencyBanner(false);
            if (activeDevice) {
              toggleGatewayAlarmInRTDB(activeDevice.id, true, currentUser).catch((err: any) => {
                showAlarmFeedback(err?.message || 'Error al activar alarma de evacuación en Firebase RTDB.', 'error');
              });
            }
          }}
          currentUser={currentUser}
          onTriggerSimulationEmergency={handleTriggerSimulationEmergency}
          isSimulatingDrill={isDrillActive}
          onStopDrill={handleStopDrill}
          onSaveDrillDebrief={handleSaveDrillDebrief}
        />
      )}

      {/* Quiet Industrial Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-8 px-4 sm:px-6 lg:px-8 text-center text-xs text-slate-500">
        <div className="max-w-[1850px] w-full mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-400">MineSafe IoT</span>
            <span>·</span>
            <span>Sistema de Monitoreo y Alertas para Seguridad Minera</span>
          </div>
          <div>
            <span>{platformConfig.appearance.footerText}</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
