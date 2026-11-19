import React, { useEffect, useMemo, useState } from 'react';
import {
  LayoutGrid,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Search,
  Users,
  Eye,
  EyeOff,
  SlidersHorizontal,
  ShieldAlert,
  RefreshCw,
  Undo2,
  UserCheck,
  Monitor,
} from 'lucide-react';
import {
  ControllableRoleKey,
  PlatformConfig,
  SectionVisibilityKey,
  UserProfile,
  WindowOverrideValue,
} from '../types';
import {
  DEFAULT_PLATFORM_CONFIG,
  isSectionVisibleForUser,
  normalizeEmailOverrideKey,
  savePlatformConfig,
} from '../services/firebase';
import { soundAlert } from '../services/audioAlert';
import {
  PreviewWindowId,
  SuperAdminWindowPreview,
} from './SuperAdminWindowPreview';

interface SuperAdminViewsCustomizerViewProps {
  currentUser: UserProfile;
  platformConfig: PlatformConfig;
  usersList: UserProfile[];
  onConfigSaved: (nextConfig: PlatformConfig) => void;
  currentSiteName?: string;
  activeDeviceName?: string;
  devicesCount?: number;
  activeAlertsCount?: number;
}

type ViewWindowGroup =
  | 'all'
  | 'dashboard'
  | 'monitoreo'
  | 'alertas'
  | 'configuracion_alertas'
  | 'reportes'
  | 'equipos'
  | 'faenas'
  | 'visor_3d';

interface SectionDescriptor {
  key: SectionVisibilityKey;
  windowGroup: Exclude<ViewWindowGroup, 'all'>;
  windowLabel: string;
  label: string;
  description: string;
  tier: 'operativo' | 'avanzado';
}

const WINDOW_GROUPS: { id: ViewWindowGroup; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard Principal' },
  { id: 'monitoreo', label: 'Monitoreo IoT' },
  { id: 'alertas', label: 'Alertas y Auditoría' },
  { id: 'configuracion_alertas', label: 'Config. Umbrales' },
  { id: 'reportes', label: 'Historial y Reportes' },
  { id: 'equipos', label: 'Equipos y Arriendos' },
  { id: 'faenas', label: 'Faenas y Sectores' },
  { id: 'visor_3d', label: 'Visores 3D' },
  { id: 'all', label: 'Todas las Ventanas' },
];

const CONTROLLABLE_ROLES: { key: ControllableRoleKey; label: string; shortLabel: string }[] = [
  { key: 'admin_minesafe', label: 'Admin MineSafe', shortLabel: 'Admin MS' },
  { key: 'admin', label: 'Administrador', shortLabel: 'Admin' },
  { key: 'supervisor', label: 'Supervisor', shortLabel: 'Supervisor' },
  { key: 'operador', label: 'Operador', shortLabel: 'Operador' },
];

export const SECTION_CATALOG: SectionDescriptor[] = [
  // =========================================================================
  // DASHBOARD PRINCIPAL
  // =========================================================================
  {
    key: 'dash_hero_metrics',
    windowGroup: 'dashboard',
    windowLabel: 'Dashboard Principal',
    label: 'Tarjetas Métricas Superiores',
    description: 'Resumen superior con Nodos Activos del Total, Sectores Monitoreados y Alertas Activas (24h).',
    tier: 'operativo',
  },
  {
    key: 'dash_hero_diagnostics',
    windowGroup: 'dashboard',
    windowLabel: 'Dashboard Principal',
    label: 'Tarjetas Diagnóstico Extra (Personal y Profundidad)',
    description: 'Tarjetas adicionales Personal en Turno y Profundidad Máxima en la cabecera del Dashboard.',
    tier: 'avanzado',
  },
  {
    key: 'dash_welcome_banner',
    windowGroup: 'dashboard',
    windowLabel: 'Dashboard Principal',
    label: 'Banner de Bienvenida y Credencial',
    description: 'Saludo personalizado, etiqueta de rol, faena asignada y botón Ver Credencial.',
    tier: 'operativo',
  },
  {
    key: 'dash_welcome_stats',
    windowGroup: 'dashboard',
    windowLabel: 'Dashboard Principal',
    label: 'Métricas Internas del Banner',
    description: 'Franja con Nodos Activos del Total y Sectores con Cobertura dentro del banner de bienvenida.',
    tier: 'operativo',
  },
  {
    key: 'dash_welcome_diagnostics',
    windowGroup: 'dashboard',
    windowLabel: 'Dashboard Principal',
    label: 'Tarjetas Avanzadas del Banner (Dispositivo Activo y Alertas)',
    description: 'Selector de Dispositivo Activo con ID técnico, badge Prevencionista y contador Alertas de Faena.',
    tier: 'avanzado',
  },
  {
    key: 'dash_dual_diagnostic_row',
    windowGroup: 'dashboard',
    windowLabel: 'Dashboard Principal',
    label: 'Monitoreo Atmosférico — 3 Tarjetas de Diagnóstico',
    description: 'Fila superior con Monóxido/Gases (MQ-2), Polvo PM2.5/Suspensión y Confort Térmico (DHT11).',
    tier: 'operativo',
  },
  {
    key: 'dash_dual_quick_core',
    windowGroup: 'dashboard',
    windowLabel: 'Dashboard Principal',
    label: 'Monitoreo Atmosférico — 4 Tarjetas Rápidas',
    description: 'Tarjetas de lectura rápida: Temperatura Ambiente, Humedad Relativa, Gases/CO y Material Particulado.',
    tier: 'operativo',
  },
  {
    key: 'dash_dual_battery_airflow',
    windowGroup: 'dashboard',
    windowLabel: 'Dashboard Principal',
    label: 'Monitoreo Atmosférico — Batería IoT y Flujo de Ventilación',
    description: 'Tarjetas de Batería Dispositivo IoT, Flujo de Ventilación (m/s) y etiqueta de batería en cabecera.',
    tier: 'avanzado',
  },
  {
    key: 'dash_dual_o2_noise',
    windowGroup: 'dashboard',
    windowLabel: 'Dashboard Principal',
    label: 'Monitoreo Atmosférico — Oxígeno (O₂) y Ruido Acústico',
    description: 'Franja inferior con lectura de Oxígeno en Galería (O₂) y Nivel de Ruido Acústico (dB).',
    tier: 'avanzado',
  },
  {
    key: 'dash_sector_chart',
    windowGroup: 'dashboard',
    windowLabel: 'Dashboard Principal',
    label: 'Gráfico "Monitoreo Atmosférico por Sector"',
    description: 'Gráfico interactivo con vistas Promedio Sectorial, Niveles DS 132 y Tendencia Temporal.',
    tier: 'operativo',
  },
  {
    key: 'dash_sector_chart_extended',
    windowGroup: 'dashboard',
    windowLabel: 'Dashboard Principal',
    label: 'Variables Extendidas del Gráfico y Nodo Individual',
    description: 'Incluye barras de O₂, Ventilación y Ruido en el gráfico y el botón Cambiar a Nodo Individual.',
    tier: 'avanzado',
  },
  {
    key: 'dash_users_panel',
    windowGroup: 'dashboard',
    windowLabel: 'Dashboard Principal',
    label: 'Panel "Usuarios del Sistema" en Dashboard',
    description: 'Directorio desplazable con buscador y filtros por rol junto al gráfico atmosférico.',
    tier: 'avanzado',
  },
  {
    key: 'dash_gateway_section',
    windowGroup: 'dashboard',
    windowLabel: 'Dashboard Principal',
    label: 'Bloque "Gateways por Sector y Control de Alarma"',
    description: 'Listado consolidado de gateways por sector, estado en línea, nodos vinculados y control de alarma.',
    tier: 'operativo',
  },
  {
    key: 'dash_gateway_hw_controls',
    windowGroup: 'dashboard',
    windowLabel: 'Dashboard Principal',
    label: 'Controles Técnicos ESP32 y Metadatos de Hardware',
    description: 'Barra técnica con Encender Luz, Resetear Gateway, Resetear Página, ID de hardware e IP local.',
    tier: 'avanzado',
  },
  {
    key: 'dash_capabilities_grid',
    windowGroup: 'dashboard',
    windowLabel: 'Dashboard Principal',
    label: 'Grilla "Capacidades Clave — Seguridad en Faena"',
    description: 'Accesos rápidos y resumen modular de capacidades al final del Dashboard.',
    tier: 'operativo',
  },
  {
    key: 'dash_footer_alerts',
    windowGroup: 'dashboard',
    windowLabel: 'Dashboard Principal',
    label: 'Listado "Incidencias y Alertas Activas en Faena"',
    description: 'Panel de resumen rápido de incidencias vigentes con reconocimiento directo al pie del Dashboard.',
    tier: 'avanzado',
  },

  // =========================================================================
  // MONITOREO IoT
  // =========================================================================
  {
    key: 'mon_filters_bar',
    windowGroup: 'monitoreo',
    windowLabel: 'Monitoreo IoT',
    label: 'Barra de Filtros Jerárquicos',
    description: 'Buscador y selectores de Organización, Faena, Cuadrilla, Sector, Tipo de equipo y Estado.',
    tier: 'operativo',
  },
  {
    key: 'mon_tech_diagnostics',
    windowGroup: 'monitoreo',
    windowLabel: 'Monitoreo IoT',
    label: 'Diagnóstico Técnico y Metadatos RTDB',
    description: 'Bloque con ID de hardware, IP, O₂, Ventilación, Ruido, fallas ADC y badge de proyecto Firebase RTDB.',
    tier: 'avanzado',
  },
  {
    key: 'mon_simulation_controls',
    windowGroup: 'monitoreo',
    windowLabel: 'Monitoreo IoT',
    label: 'Pruebas de Validación Operativa (Simulación)',
    description: 'Botones Simular Alza de Monóxido y Restablecer a Valores Nominales en el detalle del equipo.',
    tier: 'avanzado',
  },

  // =========================================================================
  // ALERTAS Y AUDITORÍA
  // =========================================================================
  {
    key: 'alerts_summary_cards',
    windowGroup: 'alertas',
    windowLabel: 'Alertas y Auditoría',
    label: 'Tarjetas Resumen de Severidad',
    description: 'Contadores superiores de Total Activas, Riesgo Crítico y Advertencia.',
    tier: 'operativo',
  },
  {
    key: 'alerts_filters_bar',
    windowGroup: 'alertas',
    windowLabel: 'Alertas y Auditoría',
    label: 'Barra de Búsqueda y Filtros de Alertas',
    description: 'Buscador por sector/variable y selectores de rango temporal, severidad y estado.',
    tier: 'operativo',
  },
  {
    key: 'alerts_audit_subtab',
    windowGroup: 'alertas',
    windowLabel: 'Alertas y Auditoría',
    label: 'Pestaña "Auditoría y Registro de Alarmas (RTDB)"',
    description: 'Acceso a la bitácora histórica de alarmas ESP32/web y filtros por rango de fechas.',
    tier: 'operativo',
  },
  {
    key: 'alerts_siren_test',
    windowGroup: 'alertas',
    windowLabel: 'Alertas y Auditoría',
    label: 'Botón "Probar Sirena" Acústica',
    description: 'Control en cabecera de Alertas para ejecutar prueba sonora inmediata de sirena.',
    tier: 'avanzado',
  },

  // =========================================================================
  // CONFIG. UMBRALES
  // =========================================================================
  {
    key: 'cfg_scope_actions',
    windowGroup: 'configuracion_alertas',
    windowLabel: 'Config. Umbrales',
    label: 'Selector de Ámbito y Botones Guardar / Restaurar',
    description: 'Barra para elegir dispositivo objetivo, guardar nuevos umbrales y restaurar valores de fábrica.',
    tier: 'operativo',
  },
  {
    key: 'cfg_events_table',
    windowGroup: 'configuracion_alertas',
    windowLabel: 'Config. Umbrales',
    label: 'Tabla de Eventos de Umbrales Registrados',
    description: 'Bitácora inferior con el historial de superaciones de umbrales y recuperaciones.',
    tier: 'operativo',
  },

  // =========================================================================
  // HISTORIAL Y REPORTES
  // =========================================================================
  {
    key: 'rep_export_csv',
    windowGroup: 'reportes',
    windowLabel: 'Historial y Reportes',
    label: 'Botón "Exportar Datos CSV"',
    description: 'Descarga de series históricas completas en formato CSV normativo DS 132.',
    tier: 'operativo',
  },
  {
    key: 'rep_chart_card',
    windowGroup: 'reportes',
    windowLabel: 'Historial y Reportes',
    label: 'Gráfico de Evolución Temporal y Estadísticas',
    description: 'Curva histórica interactiva con tarjetas de Mínimo, Promedio y Máximo por variable.',
    tier: 'operativo',
  },
  {
    key: 'rep_audit_table',
    windowGroup: 'reportes',
    windowLabel: 'Historial y Reportes',
    label: 'Bitácora de Inspección y Eventos (DS 132)',
    description: 'Tabla inferior de eventos reales trazables con fecha, variable, sector y dictamen.',
    tier: 'operativo',
  },

  // =========================================================================
  // EQUIPOS Y ARRIENDOS
  // =========================================================================
  {
    key: 'eq_header_kpis',
    windowGroup: 'equipos',
    windowLabel: 'Equipos y Arriendos',
    label: 'Cabecera y Resumen Operativo de Equipos',
    description: 'Panel superior descriptivo y métricas rápidas del módulo de Equipos y Arriendos.',
    tier: 'operativo',
  },
  {
    key: 'eq_subtab_bar',
    windowGroup: 'equipos',
    windowLabel: 'Equipos y Arriendos',
    label: 'Selector de Sub-ventanas de Equipos',
    description: 'Barra de pestañas internas (Asignaciones, Arriendos, Pagos, Inventario, Dispositivos, Empresas).',
    tier: 'operativo',
  },

  // =========================================================================
  // FAENAS Y SECTORES
  // =========================================================================
  {
    key: 'faenas_sector_cards',
    windowGroup: 'faenas',
    windowLabel: 'Faenas y Sectores',
    label: 'Tarjetas de Sectores y Ventilación',
    description: 'Listado detallado de sectores subterráneos/rajo, profundidad, sensores y ventilación.',
    tier: 'operativo',
  },
  {
    key: 'faenas_crews_section',
    windowGroup: 'faenas',
    windowLabel: 'Faenas y Sectores',
    label: 'Sección de Cuadrillas y Turnos en Faena',
    description: 'Gestión de cuadrillas mineras, turnos y asignación de personal por faena.',
    tier: 'operativo',
  },

  // =========================================================================
  // VISORES 3D
  // =========================================================================
  {
    key: 'v3d_telemetry_panel',
    windowGroup: 'visor_3d',
    windowLabel: 'Visores 3D',
    label: 'Paneles Laterales de Telemetría e Inspección 3D',
    description: 'Paneles informativos con lecturas en vivo y estado técnico dentro de Inspector 3D y Gateway 3D.',
    tier: 'operativo',
  },
];

export const SuperAdminViewsCustomizerView: React.FC<SuperAdminViewsCustomizerViewProps> = ({
  currentUser,
  platformConfig,
  usersList,
  onConfigSaved,
  currentSiteName,
  activeDeviceName,
  devicesCount,
  activeAlertsCount,
}) => {
  const [draft, setDraft] = useState<PlatformConfig>(platformConfig);
  const [workspaceMode, setWorkspaceMode] = useState<'roles' | 'users'>('roles');
  const [selectedWindow, setSelectedWindow] = useState<ViewWindowGroup>('dashboard');
  const [previewWindowOverride, setPreviewWindowOverride] = useState<PreviewWindowId>('dashboard');
  const [previewRole, setPreviewRole] = useState<ControllableRoleKey>('operador');
  const [showLivePreview, setShowLivePreview] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | ControllableRoleKey>('all');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setDraft(platformConfig);
    setHasUnsavedChanges(false);
  }, [platformConfig]);

  const controllableUsers = useMemo(
    () => usersList.filter((u) => u.role !== 'superadmin'),
    [usersList]
  );

  const filteredUsers = useMemo(() => {
    const q = userSearchQuery.trim().toLowerCase();
    return controllableUsers.filter((u) => {
      const roleMatches = userRoleFilter === 'all' || u.role === userRoleFilter;
      const queryMatches =
        !q ||
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.rut || '').toLowerCase().includes(q) ||
        (u.assignedSector || '').toLowerCase().includes(q);
      return roleMatches && queryMatches;
    });
  }, [controllableUsers, userSearchQuery, userRoleFilter]);

  useEffect(() => {
    if (!selectedUserId && controllableUsers.length > 0) {
      setSelectedUserId(controllableUsers[0].id);
    } else if (selectedUserId && !controllableUsers.some((u) => u.id === selectedUserId)) {
      setSelectedUserId(controllableUsers[0]?.id || '');
    }
  }, [controllableUsers, selectedUserId]);

  const selectedUser = useMemo(
    () => controllableUsers.find((u) => u.id === selectedUserId) || null,
    [controllableUsers, selectedUserId]
  );

  const visibleSections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return SECTION_CATALOG.filter((sec) => {
      if (selectedWindow !== 'all' && sec.windowGroup !== selectedWindow) return false;
      if (!q) return true;
      return (
        sec.label.toLowerCase().includes(q) ||
        sec.description.toLowerCase().includes(q) ||
        sec.windowLabel.toLowerCase().includes(q)
      );
    });
  }, [selectedWindow, searchQuery]);

  const activePreviewWindow: PreviewWindowId =
    selectedWindow === 'all' ? previewWindowOverride : selectedWindow;

  const previewRoleMeta = useMemo(
    () => CONTROLLABLE_ROLES.find((r) => r.key === previewRole) || CONTROLLABLE_ROLES[3],
    [previewRole]
  );

  const previewSubject: UserProfile = useMemo(() => {
    if (workspaceMode === 'users' && selectedUser) {
      return selectedUser;
    }
    return {
      id: '__preview_role__',
      name: previewRoleMeta.label,
      email: '',
      role: previewRole,
      roleLabel: previewRoleMeta.label,
      rut: '',
      shift: 'Turno A',
      status: 'activo',
      organizationId: currentUser.organizationId,
      assignedSector: currentSiteName || 'Faena Activa',
    };
  }, [workspaceMode, selectedUser, previewRole, previewRoleMeta, currentUser.organizationId, currentSiteName]);

  const previewSubjectLabel = useMemo(() => {
    if (workspaceMode === 'users' && selectedUser) {
      return `${selectedUser.name} (${selectedUser.roleLabel || selectedUser.role})`;
    }
    return previewRoleMeta.label;
  }, [workspaceMode, selectedUser, previewRoleMeta]);

  if (currentUser.role !== 'superadmin') {
    return (
      <div className="p-8 rounded-xl bg-slate-900 border border-rose-800/70 text-center space-y-2">
        <ShieldAlert className="w-8 h-8 text-rose-400 mx-auto" />
        <h2 className="text-base font-bold text-white">Acceso restringido a SuperAdmin</h2>
        <p className="text-xs text-slate-400">
          La personalización de bloques y vistas por rol o usuario es exclusiva del rol SuperAdmin.
        </p>
      </div>
    );
  }

  const getRoleSectionValue = (role: ControllableRoleKey, section: SectionVisibilityKey): boolean => {
    const configured = draft.visibility.sectionRolePermissions?.[role]?.[section];
    if (typeof configured === 'boolean') return configured;
    return Boolean(DEFAULT_PLATFORM_CONFIG.visibility.sectionRolePermissions?.[role]?.[section]);
  };

  const handleToggleRoleSection = (role: ControllableRoleKey, section: SectionVisibilityKey) => {
    soundAlert.playFeedbackBeep();
    setPreviewRole(role);
    const current = getRoleSectionValue(role, section);
    setDraft((prev) => ({
      ...prev,
      visibility: {
        ...prev.visibility,
        sectionRolePermissions: {
          ...(prev.visibility.sectionRolePermissions || {}),
          [role]: {
            ...(DEFAULT_PLATFORM_CONFIG.visibility.sectionRolePermissions?.[role] || {}),
            ...(prev.visibility.sectionRolePermissions?.[role] || {}),
            [section]: !current,
          },
        },
      },
    }));
    setHasUnsavedChanges(true);
    setFeedback(null);
  };

  const handleBulkWindowForRole = (role: ControllableRoleKey, value: boolean | 'default') => {
    soundAlert.playFeedbackBeep();
    setPreviewRole(role);
    const targets =
      selectedWindow === 'all'
        ? SECTION_CATALOG
        : SECTION_CATALOG.filter((s) => s.windowGroup === selectedWindow);
    setDraft((prev) => {
      const nextRoleMap: Partial<Record<SectionVisibilityKey, boolean>> = {
        ...(DEFAULT_PLATFORM_CONFIG.visibility.sectionRolePermissions?.[role] || {}),
        ...(prev.visibility.sectionRolePermissions?.[role] || {}),
      };
      targets.forEach((sec) => {
        nextRoleMap[sec.key] =
          value === 'default'
            ? Boolean(DEFAULT_PLATFORM_CONFIG.visibility.sectionRolePermissions?.[role]?.[sec.key])
            : value;
      });
      return {
        ...prev,
        visibility: {
          ...prev.visibility,
          sectionRolePermissions: {
            ...(prev.visibility.sectionRolePermissions || {}),
            [role]: nextRoleMap,
          },
        },
      };
    });
    setHasUnsavedChanges(true);
    setFeedback(null);
  };

  const getUserSectionOverride = (
    user: UserProfile,
    section: SectionVisibilityKey
  ): WindowOverrideValue => {
    const byId = draft.visibility.sectionUserOverrides?.[user.id]?.[section];
    if (byId && byId !== 'inherit') return byId;
    const emailKey = normalizeEmailOverrideKey(user.email);
    const byEmail = emailKey
      ? draft.visibility.sectionUserOverridesByEmail?.[emailKey]?.[section]
      : undefined;
    if (byEmail && byEmail !== 'inherit') return byEmail;
    return 'inherit';
  };

  const countUserOverrides = (user: UserProfile): number => {
    return SECTION_CATALOG.reduce(
      (acc, sec) => acc + (getUserSectionOverride(user, sec.key) !== 'inherit' ? 1 : 0),
      0
    );
  };

  const handleSetUserSectionOverride = (
    user: UserProfile,
    section: SectionVisibilityKey,
    value: WindowOverrideValue
  ) => {
    soundAlert.playFeedbackBeep();
    const emailKey = normalizeEmailOverrideKey(user.email);
    setDraft((prev) => {
      const nextById = { ...(prev.visibility.sectionUserOverrides || {}) };
      const userIdMap = { ...(nextById[user.id] || {}) };
      if (value === 'inherit') {
        delete userIdMap[section];
      } else {
        userIdMap[section] = value;
      }
      if (Object.keys(userIdMap).length === 0) {
        delete nextById[user.id];
      } else {
        nextById[user.id] = userIdMap;
      }

      const nextByEmail = { ...(prev.visibility.sectionUserOverridesByEmail || {}) };
      if (emailKey) {
        const userEmailMap = { ...(nextByEmail[emailKey] || {}) };
        if (value === 'inherit') {
          delete userEmailMap[section];
        } else {
          userEmailMap[section] = value;
        }
        if (Object.keys(userEmailMap).length === 0) {
          delete nextByEmail[emailKey];
        } else {
          nextByEmail[emailKey] = userEmailMap;
        }
      }

      return {
        ...prev,
        visibility: {
          ...prev.visibility,
          sectionUserOverrides: nextById,
          sectionUserOverridesByEmail: nextByEmail,
        },
      };
    });
    setHasUnsavedChanges(true);
    setFeedback(null);
  };

  const handleClearUserOverrides = (user: UserProfile) => {
    soundAlert.playFeedbackBeep();
    const emailKey = normalizeEmailOverrideKey(user.email);
    setDraft((prev) => {
      const nextById = { ...(prev.visibility.sectionUserOverrides || {}) };
      delete nextById[user.id];
      const nextByEmail = { ...(prev.visibility.sectionUserOverridesByEmail || {}) };
      if (emailKey) delete nextByEmail[emailKey];
      return {
        ...prev,
        visibility: {
          ...prev.visibility,
          sectionUserOverrides: nextById,
          sectionUserOverridesByEmail: nextByEmail,
        },
      };
    });
    setHasUnsavedChanges(true);
    setFeedback(null);
  };

  const handlePreviewToggleSection = (section: SectionVisibilityKey) => {
    if (workspaceMode === 'users' && selectedUser) {
      const currentlyVisible = isSectionVisibleForUser(section, selectedUser, draft);
      const nextVisible = !currentlyVisible;
      const roleKey = selectedUser.role as ControllableRoleKey;
      const inheritedValue = getRoleSectionValue(roleKey, section);
      const nextOverride: WindowOverrideValue =
        nextVisible === inheritedValue ? 'inherit' : nextVisible ? 'allow' : 'block';
      handleSetUserSectionOverride(selectedUser, section, nextOverride);
      return;
    }
    handleToggleRoleSection(previewRole, section);
  };

  const handleResetAllSectionsToDefaults = () => {
    soundAlert.playFeedbackBeep();
    setDraft((prev) => ({
      ...prev,
      visibility: {
        ...prev.visibility,
        sectionRolePermissions: {
          admin_minesafe: { ...(DEFAULT_PLATFORM_CONFIG.visibility.sectionRolePermissions?.admin_minesafe || {}) },
          admin: { ...(DEFAULT_PLATFORM_CONFIG.visibility.sectionRolePermissions?.admin || {}) },
          supervisor: { ...(DEFAULT_PLATFORM_CONFIG.visibility.sectionRolePermissions?.supervisor || {}) },
          operador: { ...(DEFAULT_PLATFORM_CONFIG.visibility.sectionRolePermissions?.operador || {}) },
        },
        sectionUserOverrides: {},
        sectionUserOverridesByEmail: {},
      },
    }));
    setHasUnsavedChanges(true);
    setFeedback({
      type: 'success',
      text: 'Valores predeterminados cargados en borrador. Haz clic en "Guardar en Vivo" para aplicarlos a todos los usuarios.',
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    setFeedback(null);
    try {
      const updatedConfig: PlatformConfig = {
        ...draft,
        actualizado_en: Date.now(),
        actualizado_por: currentUser.name,
      };
      await savePlatformConfig(updatedConfig, currentUser);
      onConfigSaved(updatedConfig);
      setHasUnsavedChanges(false);
      soundAlert.playFeedbackBeep();
      setFeedback({
        type: 'success',
        text: 'Configuración de vistas y bloques guardada en tiempo real para toda la plataforma.',
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || 'No se pudo guardar la configuración en Firebase RTDB.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const countWindowSections = (group: ViewWindowGroup) =>
    group === 'all'
      ? SECTION_CATALOG.length
      : SECTION_CATALOG.filter((s) => s.windowGroup === group).length;

  return (
    <div className="space-y-6 pb-12">
      {/* Top Workspace Header */}
      <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-purple-950/80 border border-purple-700/60 flex items-center justify-center text-purple-300 shrink-0">
                <LayoutGrid className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white tracking-tight">
                  Personalización de Vistas y Bloques
                </h1>
                <p className="text-xs text-slate-400">
                  Complemento de Control Maestro · Decide exactamente qué tarjetas, gráficos, controles y paneles ve cada rol o usuario dentro del Dashboard y demás ventanas.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowLivePreview((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                showLivePreview
                  ? 'bg-cyan-950/70 text-cyan-200 border-cyan-700/70 hover:bg-cyan-900/60'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
            >
              <Monitor className="w-3.5 h-3.5 text-cyan-400" />
              <span>{showLivePreview ? 'Ocultar Vista Previa' : 'Mostrar Vista Previa'}</span>
            </button>

            <button
              type="button"
              onClick={handleResetAllSectionsToDefaults}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              <span>Restaurar por Defecto</span>
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 ${
                hasUnsavedChanges
                  ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-sm'
                  : 'bg-purple-700 hover:bg-purple-600 text-white'
              }`}
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>{hasUnsavedChanges ? 'Guardar Cambios en Vivo' : 'Guardar en Vivo'}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Mode Switcher & Metadata Summary */}
        <div className="mt-5 pt-4 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="inline-flex items-center gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800 self-start">
            <button
              type="button"
              onClick={() => setWorkspaceMode('roles')}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                workspaceMode === 'roles'
                  ? 'bg-cyan-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Matriz por Rol</span>
            </button>
            <button
              type="button"
              onClick={() => setWorkspaceMode('users')}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                workspaceMode === 'users'
                  ? 'bg-cyan-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Por Usuario Individual</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 tabular-nums">
            <span>{SECTION_CATALOG.length} bloques configurables</span>
            <span aria-hidden="true">·</span>
            <span>8 ventanas</span>
            <span aria-hidden="true">·</span>
            <span>{controllableUsers.length} usuarios gestionables</span>
            {hasUnsavedChanges && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-amber-300 font-semibold">Cambios sin guardar</span>
              </>
            )}
          </div>
        </div>

        {feedback && (
          <div
            className={`mt-4 p-3 rounded-lg border text-xs font-medium flex items-center gap-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-950/50 border-emerald-700/70 text-emerald-200'
                : 'bg-rose-950/50 border-rose-700/70 text-rose-200'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}
      </div>

      {/* Window Filter Bar + Search */}
      <div className="rounded-xl bg-slate-900/80 border border-slate-800 p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
            {WINDOW_GROUPS.map((wg) => {
              const active = selectedWindow === wg.id;
              return (
                <button
                  key={wg.id}
                  type="button"
                  onClick={() => setSelectedWindow(wg.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-slate-800 text-cyan-300 border border-cyan-600/60'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                  }`}
                >
                  {wg.label}{' '}
                  <span className="text-[11px] font-mono text-slate-500 ml-1 tabular-nums">
                    {countWindowSections(wg.id)}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="relative w-full lg:w-72 shrink-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar tarjeta, gráfico o bloque..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>
      </div>

      {/* ===================================================================
          MODE 1: ROLE MATRIX (+ LIVE PREVIEW)
         =================================================================== */}
      {workspaceMode === 'roles' && (
        <div
          className={
            showLivePreview
              ? 'grid grid-cols-1 xl:grid-cols-12 gap-5 items-start'
              : 'space-y-4'
          }
        >
          <div
            className={`${
              showLivePreview ? 'xl:col-span-7' : ''
            } rounded-xl bg-slate-900/90 border border-slate-800 overflow-hidden`}
          >
            {/* Quick Bulk Actions for Selected Window */}
            <div className="px-5 py-3.5 bg-slate-950/70 border-b border-slate-800 flex flex-col gap-3">
              <div className="text-xs text-slate-300">
                <span className="font-semibold text-white">
                  {WINDOW_GROUPS.find((w) => w.id === selectedWindow)?.label}
                </span>
                <span className="text-slate-500 mx-2">·</span>
                <span className="text-slate-400">
                  SuperAdmin siempre visualiza el 100% de los bloques. Haz clic en cualquier rol para editarlo y previsualizarlo al instante.
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {CONTROLLABLE_ROLES.map((role) => (
                  <div
                    key={role.key}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] transition-colors ${
                      showLivePreview && previewRole === role.key
                        ? 'bg-cyan-950/40 border-cyan-700/60'
                        : 'bg-slate-900 border-slate-800'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setPreviewRole(role.key)}
                      className={`font-semibold pr-1 cursor-pointer ${
                        showLivePreview && previewRole === role.key
                          ? 'text-cyan-300'
                          : 'text-slate-300 hover:text-white'
                      }`}
                      title={`Previsualizar vista de ${role.label}`}
                    >
                      {role.shortLabel}:
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkWindowForRole(role.key, true)}
                      className="px-1.5 py-0.5 rounded text-emerald-300 hover:bg-emerald-950/70 transition-colors cursor-pointer"
                      title={`Mostrar todos los bloques visibles en esta vista para ${role.label}`}
                    >
                      Todo
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkWindowForRole(role.key, false)}
                      className="px-1.5 py-0.5 rounded text-rose-300 hover:bg-rose-950/70 transition-colors cursor-pointer"
                      title={`Ocultar todos los bloques visibles en esta vista para ${role.label}`}
                    >
                      Nada
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkWindowForRole(role.key, 'default')}
                      className="p-0.5 rounded text-slate-400 hover:text-amber-300 transition-colors cursor-pointer"
                      title={`Restaurar valores por defecto de esta vista para ${role.label}`}
                    >
                      <Undo2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className={`py-3 px-4 ${showLivePreview ? 'min-w-[200px]' : 'min-w-[300px]'}`}>
                      Bloque / Elemento de Interfaz
                    </th>
                    {CONTROLLABLE_ROLES.map((role) => {
                      const enabledCount = visibleSections.filter((sec) =>
                        getRoleSectionValue(role.key, sec.key)
                      ).length;
                      const isPreviewed = showLivePreview && previewRole === role.key;
                      return (
                        <th key={role.key} className="py-3 px-2 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setPreviewRole(role.key)}
                            className={`inline-flex flex-col items-center cursor-pointer transition-colors ${
                              isPreviewed ? 'text-cyan-300' : 'text-slate-200 hover:text-white'
                            }`}
                            title={`Ver vista previa como ${role.label}`}
                          >
                            <span>{showLivePreview ? role.shortLabel : role.label}</span>
                            <span
                              className={`text-[10px] font-mono tabular-nums mt-0.5 ${
                                isPreviewed ? 'text-cyan-400' : 'text-slate-500'
                              }`}
                            >
                              {enabledCount} / {visibleSections.length}
                            </span>
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {visibleSections.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-xs text-slate-400">
                        No se encontraron bloques que coincidan con la búsqueda actual.
                      </td>
                    </tr>
                  ) : (
                    visibleSections.map((sec) => (
                      <tr key={sec.key} className="hover:bg-slate-800/25 transition-colors">
                        <td className="py-3 px-4 align-middle">
                          <div className="text-sm font-semibold text-white leading-snug">
                            {sec.label}
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                            {sec.description}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5">
                            <span>{sec.windowLabel}</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {sec.tier === 'avanzado'
                                ? 'Bloque de diagnóstico avanzado'
                                : 'Bloque operativo estándar'}
                            </span>
                          </div>
                        </td>

                        {CONTROLLABLE_ROLES.map((role) => {
                          const visible = getRoleSectionValue(role.key, sec.key);
                          const isPreviewCol = showLivePreview && previewRole === role.key;
                          return (
                            <td
                              key={role.key}
                              className={`py-3 px-2 text-center align-middle ${
                                isPreviewCol ? 'bg-cyan-950/15' : ''
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => handleToggleRoleSection(role.key, sec.key)}
                                className={`inline-flex items-center justify-center gap-1.5 ${
                                  showLivePreview ? 'min-w-[78px] px-2' : 'min-w-[98px] px-3'
                                } py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap cursor-pointer ${
                                  visible
                                    ? 'bg-emerald-950/60 text-emerald-300 border-emerald-700/70 hover:bg-emerald-900/60'
                                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-rose-700/60 hover:text-rose-300'
                                }`}
                              >
                                {visible ? (
                                  <>
                                    <Eye className="w-3.5 h-3.5 shrink-0" />
                                    <span>Visible</span>
                                  </>
                                ) : (
                                  <>
                                    <EyeOff className="w-3.5 h-3.5 shrink-0" />
                                    <span>Oculto</span>
                                  </>
                                )}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {showLivePreview && (
            <div className="xl:col-span-5 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
              <SuperAdminWindowPreview
                activeWindow={activePreviewWindow}
                showWindowSwitcher={selectedWindow === 'all'}
                onChangeWindow={setPreviewWindowOverride}
                previewModeContext="role"
                previewRole={previewRole}
                onSelectPreviewRole={setPreviewRole}
                previewSubject={previewSubject}
                previewSubjectLabel={previewSubjectLabel}
                draftConfig={draft}
                savedConfig={platformConfig}
                onToggleSection={handlePreviewToggleSection}
                sectionCatalog={SECTION_CATALOG}
                siteName={currentSiteName}
                deviceName={activeDeviceName}
                devicesCount={devicesCount}
                alertsCount={activeAlertsCount}
                usersCount={usersList.length}
              />
            </div>
          )}
        </div>
      )}

      {/* ===================================================================
          MODE 2: PER-USER INDIVIDUAL OVERRIDES (+ LIVE PREVIEW)
         =================================================================== */}
      {workspaceMode === 'users' && (
        <div
          className={
            showLivePreview
              ? 'grid grid-cols-1 xl:grid-cols-12 gap-5 items-start'
              : 'grid grid-cols-1 lg:grid-cols-12 gap-5 items-start'
          }
        >
          <div
            className={
              showLivePreview
                ? 'xl:col-span-7 space-y-4'
                : 'lg:col-span-12 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start'
            }
          >
            {/* User Selector */}
            <div
              className={`${
                showLivePreview ? '' : 'lg:col-span-4'
              } rounded-xl bg-slate-900/90 border border-slate-800 p-4 space-y-3`}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-white">Seleccionar Usuario</h2>
                <span className="text-xs font-mono text-slate-400 tabular-nums">
                  {filteredUsers.length} usuarios
                </span>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    placeholder="Buscar por nombre, correo o RUT..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="flex flex-wrap gap-1 items-center">
                  <button
                    type="button"
                    onClick={() => setUserRoleFilter('all')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                      userRoleFilter === 'all'
                        ? 'bg-cyan-600 text-white'
                        : 'bg-slate-950 text-slate-400 hover:text-white'
                    }`}
                  >
                    Todos
                  </button>
                  {CONTROLLABLE_ROLES.map((r) => (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => setUserRoleFilter(r.key)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                        userRoleFilter === r.key
                          ? 'bg-cyan-600 text-white'
                          : 'bg-slate-950 text-slate-400 hover:text-white'
                      }`}
                    >
                      {r.shortLabel}
                    </button>
                  ))}
                </div>
              </div>

              <div
                className={`${
                  showLivePreview
                    ? 'grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-[210px]'
                    : 'space-y-1.5 max-h-[540px]'
                } overflow-y-auto pr-1`}
              >
                {filteredUsers.length === 0 ? (
                  <div className="col-span-full py-6 text-center text-xs text-slate-400">
                    No se encontraron usuarios con esos filtros.
                  </div>
                ) : (
                  filteredUsers.map((u) => {
                    const active = selectedUser?.id === u.id;
                    const customCount = countUserOverrides(u);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => setSelectedUserId(u.id)}
                        className={`w-full text-left p-2.5 rounded-lg border transition-colors cursor-pointer ${
                          active
                            ? 'bg-cyan-950/40 border-cyan-500/70'
                            : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-white truncate">{u.name}</span>
                          {customCount > 0 && (
                            <span className="text-[10px] font-mono font-semibold text-cyan-300 tabular-nums shrink-0">
                              {customCount} ajuste{customCount === 1 ? '' : 's'}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate mt-0.5">{u.email}</div>
                        <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1.5">
                          <span className="uppercase font-semibold text-slate-300">
                            {u.roleLabel || u.role}
                          </span>
                          {u.assignedSector && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="truncate">{u.assignedSector}</span>
                            </>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Per-User Section Overrides */}
            <div
              className={`${
                showLivePreview ? '' : 'lg:col-span-8'
              } rounded-xl bg-slate-900/90 border border-slate-800 overflow-hidden`}
            >
              {!selectedUser ? (
                <div className="p-12 text-center text-xs text-slate-400">
                  Selecciona un usuario de la lista para personalizar exactamente qué bloques puede ver.
                </div>
              ) : (
                <>
                  <div className="px-5 py-4 bg-slate-950/70 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-cyan-950 border border-cyan-800 flex items-center justify-center text-cyan-300 shrink-0">
                        <UserCheck className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white truncate">
                          {selectedUser.name}
                        </div>
                        <div className="text-xs text-slate-400 truncate">
                          {selectedUser.email} · {selectedUser.roleLabel || selectedUser.role}
                        </div>
                      </div>
                    </div>

                    {countUserOverrides(selectedUser) > 0 && (
                      <button
                        type="button"
                        onClick={() => handleClearUserOverrides(selectedUser)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Undo2 className="w-3.5 h-3.5" />
                        <span>Limpiar excepciones ({countUserOverrides(selectedUser)})</span>
                      </button>
                    )}
                  </div>

                  <div className="divide-y divide-slate-800/80">
                    {visibleSections.length === 0 ? (
                      <div className="py-10 text-center text-xs text-slate-400">
                        No hay bloques que coincidan con el filtro seleccionado.
                      </div>
                    ) : (
                      visibleSections.map((sec) => {
                        const override = getUserSectionOverride(selectedUser, sec.key);
                        const effectiveVisible = isSectionVisibleForUser(sec.key, selectedUser, draft);
                        return (
                          <div
                            key={sec.key}
                            className="px-5 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-slate-800/20 transition-colors"
                          >
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-white">{sec.label}</div>
                              <div className="text-xs text-slate-400 mt-0.5">{sec.description}</div>
                              <div className="text-[11px] mt-1 flex items-center gap-1.5">
                                <span className="text-slate-500">{sec.windowLabel}</span>
                                <span aria-hidden="true" className="text-slate-600">·</span>
                                <span
                                  className={
                                    effectiveVisible
                                      ? 'text-emerald-400 font-semibold'
                                      : 'text-rose-400 font-semibold'
                                  }
                                >
                                  Efectivo: {effectiveVisible ? 'Visible' : 'Oculto'}
                                </span>
                              </div>
                            </div>

                            <div className="inline-flex items-center gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800 shrink-0 self-start md:self-center">
                              {(
                                [
                                  { val: 'inherit', label: 'Heredar Rol' },
                                  { val: 'allow', label: 'Visible' },
                                  { val: 'block', label: 'Oculto' },
                                ] as { val: WindowOverrideValue; label: string }[]
                              ).map((opt) => {
                                const isSelected = override === opt.val;
                                const activeStyle =
                                  opt.val === 'allow'
                                    ? 'bg-emerald-700 text-white'
                                    : opt.val === 'block'
                                    ? 'bg-rose-700 text-white'
                                    : 'bg-slate-800 text-slate-100';
                                return (
                                  <button
                                    key={opt.val}
                                    type="button"
                                    onClick={() =>
                                      handleSetUserSectionOverride(selectedUser, sec.key, opt.val)
                                    }
                                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                                      isSelected ? activeStyle : 'text-slate-400 hover:text-white'
                                    }`}
                                  >
                                    {opt.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {showLivePreview && (
            <div className="xl:col-span-5 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
              {selectedUser ? (
                <SuperAdminWindowPreview
                  activeWindow={activePreviewWindow}
                  showWindowSwitcher={selectedWindow === 'all'}
                  onChangeWindow={setPreviewWindowOverride}
                  previewModeContext="user"
                  previewSubject={selectedUser}
                  previewSubjectLabel={`${selectedUser.name} (${selectedUser.roleLabel || selectedUser.role})`}
                  draftConfig={draft}
                  savedConfig={platformConfig}
                  onToggleSection={handlePreviewToggleSection}
                  sectionCatalog={SECTION_CATALOG}
                  siteName={selectedUser.assignedSector || currentSiteName}
                  deviceName={activeDeviceName}
                  devicesCount={devicesCount}
                  alertsCount={activeAlertsCount}
                  usersCount={usersList.length}
                />
              ) : (
                <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-8 text-center space-y-2">
                  <Monitor className="w-7 h-7 text-slate-500 mx-auto" />
                  <div className="text-sm font-semibold text-white">Vista Previa por Usuario</div>
                  <p className="text-xs text-slate-400">
                    Selecciona un usuario de la lista para ver exactamente qué bloques ve y qué bloques le quitaste.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
