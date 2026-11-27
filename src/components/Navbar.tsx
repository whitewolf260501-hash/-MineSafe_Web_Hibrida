import React, { useEffect, useState } from 'react';
import { 
  ShieldAlert, 
  Activity, 
  Radio, 
  FileText, 
  MapPin, 
  Cpu, 
  Volume2, 
  VolumeX, 
  AlertTriangle,
  Menu, 
  X, 
  UserCheck, 
  ChevronDown,
  RefreshCw,
  Users,
  Crown,
  Shield,
  HardHat,
  LogOut,
  BellRing,
  BellOff,
  CheckCircle2,
  Loader2,
  Sliders,
  Sun,
  Moon,
  Building2,
  Box,
  Router,
  BookOpen,
  Eye,
  ShieldCheck,
  LayoutGrid,
  KeyRound,
  Type
} from 'lucide-react';
import { NavigationTab, Organization, PlatformConfig, UserProfile } from '../types';
import { soundAlert } from '../services/audioAlert';
import { APP_BUILD_VERSION, isTabVisibleForUser } from '../services/firebase';
import {
  canControlMineAlarm,
  DEFAULT_ORGANIZATION_ID,
  isAnyAdminRole,
  isGlobalMineSafeAdmin,
} from '../utils/accessControl';

interface NavbarProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  activeAlertCount: number;
  currentUser: UserProfile;
  onChangeUser: () => void;
  onOpenChangePassword?: () => void;
  onLogout?: () => void;
  onTriggerEmergency: () => void;
  onRefreshData: () => void;
  isSimulating?: boolean;
  onToggleSimulation?: () => void;
  isFirebaseConnected?: boolean;
  onResetPageLevels?: () => void;
  isAlarmActive?: boolean;
  onToggleAlarm?: () => void;
  onShutdownAlarmCompletely?: () => Promise<boolean | void> | boolean | void;
  onActivateAlarmCompletely?: () => Promise<boolean | void> | boolean | void;
  alarmShutdownState?: 'idle' | 'sending' | 'waiting_ack' | 'confirmed' | 'no_ack';
  isLightActive?: boolean;
  onToggleLight?: () => void;
  isDrillActive?: boolean;
  platformConfig?: PlatformConfig;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
  onOpenTypography?: () => void;
  isCustomTypographyActive?: boolean;
  organizations?: Organization[];
  activeOrganizationId?: string;
  onSelectOrganization?: (orgId: string) => void;
  siteBadgeName?: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onSelectTab,
  activeAlertCount,
  currentUser,
  onChangeUser,
  onOpenChangePassword,
  onLogout,
  onTriggerEmergency,
  onRefreshData,
  isFirebaseConnected = true,
  isAlarmActive = false,
  onToggleAlarm,
  onShutdownAlarmCompletely,
  onActivateAlarmCompletely,
  alarmShutdownState,
  isDrillActive = false,
  platformConfig,
  theme = 'dark',
  onToggleTheme,
  onOpenTypography,
  isCustomTypographyActive = false,
  organizations = [],
  activeOrganizationId = 'all',
  onSelectOrganization,
  siteBadgeName,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(soundAlert.getMutedState());
  const [localAlarmSilenced, setLocalAlarmSilenced] = useState(false);
  const [isShuttingDownAlarm, setIsShuttingDownAlarm] = useState(false);

  const isSuperAdmin = currentUser.role === 'superadmin';
  const isGlobalAdmin = isGlobalMineSafeAdmin(currentUser.role);
  const canControlAlarm = canControlMineAlarm(currentUser).allowed;

  useEffect(() => {
    if (isAlarmActive || isDrillActive) {
      setLocalAlarmSilenced(false);
    }
  }, [isAlarmActive, isDrillActive]);

  const effectiveShutdownState: 'idle' | 'sending' | 'waiting_ack' | 'confirmed' | 'no_ack' =
    isShuttingDownAlarm
      ? 'sending'
      : alarmShutdownState
        ? alarmShutdownState
        : localAlarmSilenced && !isAlarmActive && !isDrillActive
          ? 'confirmed'
          : 'idle';

  const handleAlarmControlClick = async () => {
    if (!canControlAlarm || isShuttingDownAlarm) return;
    setIsShuttingDownAlarm(true);
    try {
      if (effectiveShutdownState === 'confirmed') {
        if (onActivateAlarmCompletely) {
          const ok = await onActivateAlarmCompletely();
          if (ok !== false) {
            setLocalAlarmSilenced(false);
          }
        } else if (onToggleAlarm) {
          await Promise.resolve(onToggleAlarm());
          setLocalAlarmSilenced(false);
        }
      } else if (onShutdownAlarmCompletely) {
        const ok = await onShutdownAlarmCompletely();
        if (ok !== false) {
          setLocalAlarmSilenced(true);
        }
      } else if (onToggleAlarm) {
        await Promise.resolve(onToggleAlarm());
        setLocalAlarmSilenced(true);
      }
    } finally {
      setIsShuttingDownAlarm(false);
    }
  };

  const handleToggleSound = () => {
    if (isAlarmActive && !isMuted && !canControlAlarm) {
      return;
    }
    const muted = soundAlert.toggleMute();
    setIsMuted(muted);
    if (!muted) soundAlert.playFeedbackBeep();
  };
  const isOperador = currentUser.role === 'operador';
  const isSuperOrAdmin = isAnyAdminRole(currentUser.role);
  const showEmergencyButton =
    !isOperador &&
    (isSuperOrAdmin || (platformConfig?.appearance?.allowEmergencyButtonForOperador ?? true));

  const allStandardLinks: { id: NavigationTab; label: string; shortLabel: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'dashboard', label: 'Dashboard', shortLabel: 'Dashboard', icon: <Activity className="w-4 h-4 shrink-0" /> },
    { id: 'monitoreo', label: 'Monitoreo IoT', shortLabel: 'Monitoreo', icon: <Radio className="w-4 h-4 shrink-0" /> },
    { 
      id: 'alertas', 
      label: 'Alertas', 
      shortLabel: 'Alertas',
      icon: <AlertTriangle className="w-4 h-4 shrink-0" />, 
      badge: activeAlertCount > 0 ? activeAlertCount : undefined 
    },
    { 
      id: 'configuracion_alertas', 
      label: 'Config. Umbrales', 
      shortLabel: 'Umbrales', 
      icon: <Sliders className="w-4 h-4 shrink-0 text-amber-400" /> 
    },
    { 
      id: 'equipos', 
      label: 'Equipos y Arriendos', 
      shortLabel: 'Equipos', 
      icon: <Cpu className="w-4 h-4 shrink-0" /> 
    },
    { id: 'reportes', label: 'Historial y Reportes', shortLabel: 'Reportes', icon: <FileText className="w-4 h-4 shrink-0" /> },
    { id: 'faenas', label: 'Faenas y Sectores', shortLabel: 'Sectores', icon: <MapPin className="w-4 h-4 shrink-0" /> },
    { id: 'usuarios', label: 'Usuarios y Roles', shortLabel: 'Usuarios', icon: <Users className="w-4 h-4 shrink-0" /> },
    {
      id: 'empresas',
      label: isGlobalAdmin ? 'Empresas y Carga' : 'Mi Organización',
      shortLabel: isGlobalAdmin ? 'Empresas' : 'Mi Org.',
      icon: <Building2 className="w-4 h-4 shrink-0 text-cyan-400" />,
    },
    {
      id: 'visor_3d',
      label: 'Inspector 3D',
      shortLabel: 'Visor 3D',
      icon: <Box className="w-4 h-4 shrink-0 text-orange-400" />,
    },
    {
      id: 'gateway_3d',
      label: 'Gateway 3D',
      shortLabel: 'Gateway 3D',
      icon: <Router className="w-4 h-4 shrink-0 text-amber-400" />,
    },
  ];

  const navLinks: { id: NavigationTab; label: string; shortLabel: string; icon: React.ReactNode; badge?: number }[] = [
    ...allStandardLinks.filter((item) => isTabVisibleForUser(item.id, currentUser, platformConfig)),
    ...(isGlobalAdmin
      ? [
          {
            id: 'auditoria_seguridad' as NavigationTab,
            label: 'Seguridad y Legal',
            shortLabel: 'Seguridad',
            icon: <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400" />,
          },
        ]
      : []),
    ...(isSuperAdmin
      ? [
          {
            id: 'superadmin_panel' as NavigationTab,
            label: 'Control Maestro',
            shortLabel: 'SuperAdmin',
            icon: <Crown className="w-4 h-4 shrink-0 text-purple-400" />,
          },
          {
            id: 'superadmin_vistas' as NavigationTab,
            label: 'Vistas y Bloques',
            shortLabel: 'Vistas',
            icon: <LayoutGrid className="w-4 h-4 shrink-0 text-purple-400" />,
          },
          {
            id: 'superadmin_docs' as NavigationTab,
            label: 'Entregables P031',
            shortLabel: 'Docs',
            icon: <BookOpen className="w-4 h-4 shrink-0 text-purple-400" />,
          },
        ]
      : []),
  ];

  const getRoleTheme = () => {
    switch (currentUser.role) {
      case 'superadmin':
        return {
          bg: 'bg-purple-950/80 border-purple-800 text-purple-200',
          avatarBg: 'bg-purple-900 text-purple-200 border-purple-700',
          badgeText: 'SuperAdmin',
          icon: <Crown className="w-3 h-3 text-purple-400" />
        };
      case 'admin_minesafe':
        return {
          bg: 'bg-indigo-950/80 border-indigo-700 text-indigo-200',
          avatarBg: 'bg-indigo-900 text-indigo-200 border-indigo-600',
          badgeText: 'Admin MineSafe',
          icon: <ShieldCheck className="w-3 h-3 text-indigo-400" />
        };
      case 'admin':
        return {
          bg: 'bg-cyan-950/80 border-cyan-800 text-cyan-200',
          avatarBg: 'bg-cyan-900 text-cyan-200 border-cyan-700',
          badgeText: 'Admin',
          icon: <Shield className="w-3 h-3 text-cyan-400" />
        };
      case 'supervisor':
        return {
          bg: 'bg-emerald-950/80 border-emerald-800 text-emerald-200',
          avatarBg: 'bg-emerald-900 text-emerald-200 border-emerald-700',
          badgeText: 'Supervisor',
          icon: <Eye className="w-3 h-3 text-emerald-400" />
        };
      default:
        return {
          bg: 'bg-amber-950/80 border-amber-800 text-amber-200',
          avatarBg: 'bg-amber-900 text-amber-200 border-amber-700',
          badgeText: 'Operador',
          icon: <HardHat className="w-3 h-3 text-amber-400" />
        };
    }
  };

  const roleTheme = getRoleTheme();

  return (
    <header className="sticky top-0 z-50 bg-slate-950/95 backdrop-blur-md border-b border-slate-800 shadow-lg shadow-black/40">
      <div className="w-full max-w-[1850px] mx-auto px-3 sm:px-4 lg:px-6">
        
        {/* ROW 1: BRAND, CONNECTION STATUS, ALARM CONTROL, PROFILE & EVACUATION */}
        <div className="flex items-center justify-between h-14 gap-2">
          
          {/* ZONE 1: BRAND WORDMARK & GENERIC CONNECTION STATUS */}
          <div className="flex items-center gap-3 shrink-0">
            <button 
              onClick={() => onSelectTab(isOperador ? 'alertas' : 'dashboard')} 
              className="flex items-center gap-2 text-left group focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 rounded-md"
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-700 flex items-center justify-center text-white shadow-md shadow-cyan-500/20 group-hover:scale-105 transition-transform duration-150 shrink-0">
                <ShieldAlert className="w-5 h-5 text-white" />
              </div>
              <span className="text-lg font-bold tracking-tight text-white flex items-center gap-1.5 whitespace-nowrap">
                Mine<span className="text-cyan-400">Safe</span>
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-cyan-950/70 text-cyan-300 border border-cyan-700/50 font-medium">IoT</span>
                <span
                  title={`Versión compilada ${APP_BUILD_VERSION}`}
                  className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-900 text-emerald-300 border border-emerald-700/60 font-bold"
                >
                  {APP_BUILD_VERSION}
                </span>
              </span>
            </button>

            {/* Generic Real-time Telemetry Status */}
            <div 
              title={isFirebaseConnected ? "Conectado a la red de telemetría en tiempo real" : "Reconectando a la red de telemetría..."}
              className={`hidden sm:flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-medium rounded-lg border shrink-0 ${
                isFirebaseConnected
                  ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                  : 'bg-amber-950/40 border-amber-800/60 text-amber-300'
              }`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${isFirebaseConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span className="font-semibold">
                {isFirebaseConnected ? 'Telemetría en línea' : 'Reconectando...'}
              </span>
            </div>
          </div>

          {/* ZONE 2: DESKTOP CONTROLS, PROFILE & EVACUATION ACTION */}
          <div className="hidden md:flex items-center gap-2 shrink-0">
            
            {/* Quick Controls Group */}
            <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-lg border border-slate-800 shrink-0">
              {/* Manual refresh button */}
              <button
                onClick={onRefreshData}
                title="Actualizar mediciones ahora"
                className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>

              {/* Audio chime mute button */}
              <button
                onClick={handleToggleSound}
                title={isMuted ? 'Activar sirena local de alertas' : 'Silenciar sirena local de alertas'}
                className={`p-1 rounded transition-colors shrink-0 ${
                  isMuted 
                    ? 'text-slate-500 hover:bg-slate-800' 
                    : 'text-cyan-400 bg-cyan-950/60 hover:bg-cyan-900/50'
                }`}
              >
                {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>

              {/* Dedicated Red Shutdown Alarm Button -> Amber while waiting/no ACK -> Emerald Green (click to re-enable ENCENDER) */}
              {canControlAlarm && (onShutdownAlarmCompletely || onToggleAlarm) && (
                <button
                  type="button"
                  onClick={handleAlarmControlClick}
                  disabled={effectiveShutdownState === 'sending'}
                  className={`px-2.5 py-1 rounded text-xs flex items-center gap-1.5 font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                    effectiveShutdownState === 'confirmed'
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-950/40'
                      : effectiveShutdownState === 'waiting_ack' || effectiveShutdownState === 'no_ack'
                        ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-sm shadow-amber-950/40'
                        : isAlarmActive || isDrillActive
                          ? 'bg-red-600 hover:bg-red-500 text-white animate-pulse shadow-md shadow-red-950/60 ring-2 ring-red-400/70'
                          : 'bg-red-600 hover:bg-red-500 text-white shadow-sm shadow-red-950/40'
                  }`}
                  title={
                    effectiveShutdownState === 'confirmed'
                      ? 'Alarma apagada (ESP32 confirmó PROCESADO_OFF) - Clic para volver a ENCENDER la alarma'
                      : effectiveShutdownState === 'waiting_ack'
                        ? 'Comando APAGAR enviado a Firebase - Esperando confirmación PROCESADO_OFF del ESP32'
                        : effectiveShutdownState === 'no_ack'
                          ? 'APAGAR guardado en Firebase, pero el ESP32 no confirmó PROCESADO_OFF - Clic para reintentar'
                          : 'Enviar comando APAGAR a la alarma del dispositivo ESP32'
                  }
                >
                  {effectiveShutdownState === 'sending' || effectiveShutdownState === 'waiting_ack' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  ) : effectiveShutdownState === 'confirmed' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  ) : effectiveShutdownState === 'no_ack' ? (
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  ) : isAlarmActive || isDrillActive ? (
                    <BellRing className="w-3.5 h-3.5 animate-bounce shrink-0" />
                  ) : (
                    <BellOff className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span className="text-[11px] font-bold">
                    {effectiveShutdownState === 'sending'
                      ? 'Procesando...'
                      : effectiveShutdownState === 'waiting_ack'
                        ? 'Esperando ESP32...'
                        : effectiveShutdownState === 'no_ack'
                          ? 'Enviado · Sin ACK'
                          : effectiveShutdownState === 'confirmed'
                            ? 'Encender Alarma'
                            : 'Apagar Alarma'}
                  </span>
                </button>
              )}
            </div>

            {/* Light / Dark Theme Toggle */}
            {onToggleTheme && (
              <button
                type="button"
                onClick={() => {
                  onToggleTheme();
                  soundAlert.playFeedbackBeep();
                }}
                title={theme === 'dark' ? 'Cambiar a Versión Clara' : 'Cambiar a Versión Oscura'}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-800 bg-slate-900/90 hover:bg-slate-800 text-xs font-semibold text-slate-200 transition-colors shrink-0"
              >
                {theme === 'dark' ? (
                  <>
                    <Sun className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-[11px]">Claro</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="text-[11px]">Oscuro</span>
                  </>
                )}
              </button>
            )}

            {/* Quick Typography / Font Size Controls */}
            {onOpenTypography && (
              <button
                type="button"
                onClick={() => {
                  soundAlert.playFeedbackBeep();
                  onOpenTypography();
                }}
                title="Ajustar tamaños de letra (títulos, subtítulos y textos generales)"
                className={`relative flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors shrink-0 cursor-pointer ${
                  isCustomTypographyActive
                    ? 'border-emerald-600/70 bg-emerald-950/60 text-emerald-200 hover:bg-emerald-900/60'
                    : 'border-slate-800 bg-slate-900/90 hover:bg-slate-800 text-slate-200'
                }`}
              >
                <Type className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[11px]">Aa</span>
                {isCustomTypographyActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                )}
              </button>
            )}

            {/* Organization Switcher strictly for SuperAdmin & Admin MineSafe */}
            {isGlobalAdmin &&
              organizations.length > 0 &&
              onSelectOrganization && (
                <div className="hidden xl:flex items-center gap-1.5 px-2 py-1 rounded-lg border border-slate-800 bg-slate-900/90 text-xs shrink-0">
                  <Building2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <select
                    value={activeOrganizationId}
                    onChange={(e) => onSelectOrganization(e.target.value)}
                    aria-label="Seleccionar Organización"
                    className="bg-transparent text-slate-200 text-[11px] font-semibold focus:outline-none max-w-[140px]"
                  >
                    <option value="all" className="bg-slate-950 text-white">Todas las Org.</option>
                    {organizations.map((org) => (
                      <option key={org.id} value={org.id} className="bg-slate-950 text-white">
                        {org.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

            {/* Divider */}
            <div className="h-5 w-px bg-slate-800" />

            {/* User Credential / Profile Carnet button */}
            <button
              onClick={onChangeUser}
              className={`flex items-center gap-2 px-2.5 py-1 rounded-lg border text-xs transition-colors hover:scale-102 shrink-0 ${roleTheme.bg}`}
              title="Ver credencial digital y perfil de sesión"
            >
              <div className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] border shrink-0 ${roleTheme.avatarBg}`}>
                {currentUser.name.charAt(0)}
              </div>
              <div className="text-left">
                <p className="font-semibold text-white truncate max-w-[110px] text-xs leading-tight">{currentUser.name.split(' ')[0]}</p>
                <p className="text-[9px] font-bold flex items-center gap-0.5 uppercase tracking-wider leading-none">
                  {roleTheme.icon}
                  {roleTheme.badgeText}
                </p>
              </div>
              <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
            </button>

            {/* Change Password button (MS-06) */}
            {onOpenChangePassword && (
              <button
                type="button"
                onClick={onOpenChangePassword}
                className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-800 bg-slate-900/80 hover:bg-cyan-950/50 hover:border-cyan-700/60 text-slate-300 hover:text-cyan-200 text-xs transition-colors shrink-0"
                title="Cambiar contraseña de tu cuenta"
              >
                <KeyRound className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-[11px] font-medium">Clave</span>
              </button>
            )}

            {/* Logout button */}
            {onLogout && (
              <button
                onClick={onLogout}
                className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-800 bg-slate-900/80 hover:bg-rose-950/40 hover:border-rose-800/60 text-slate-400 hover:text-rose-300 text-xs transition-colors shrink-0"
                title="Cerrar sesión"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-400" />
                <span className="text-[11px] font-medium">Salir</span>
              </button>
            )}

            {/* Emergency Protocol Trigger */}
            {showEmergencyButton && (
              <button
                onClick={onTriggerEmergency}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg shadow-md transition-all whitespace-nowrap shrink-0 ${
                  isDrillActive
                    ? 'bg-amber-600 hover:bg-amber-500 text-white animate-pulse shadow-amber-950 ring-2 ring-amber-400'
                    : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950 hover:shadow-rose-900'
                }`}
                title="Protocolo de Evacuación y Simulacro DS 132"
              >
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>
                  {isDrillActive 
                    ? 'Simulacro Activo' 
                    : (isSuperOrAdmin ? 'Simulacro / Evacuación' : 'Evacuación')}
                </span>
              </button>
            )}
          </div>

          {/* Mobile menu trigger button */}
          <div className="flex md:hidden items-center gap-1.5">
            {canControlAlarm && (onShutdownAlarmCompletely || onToggleAlarm) && (
              <button
                type="button"
                onClick={handleAlarmControlClick}
                disabled={effectiveShutdownState === 'sending'}
                className={`px-2 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all whitespace-nowrap shrink-0 ${
                  effectiveShutdownState === 'confirmed'
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : effectiveShutdownState === 'waiting_ack' || effectiveShutdownState === 'no_ack'
                      ? 'bg-amber-600 hover:bg-amber-500 text-white'
                      : isAlarmActive || isDrillActive
                        ? 'bg-red-600 hover:bg-red-500 text-white animate-pulse ring-1 ring-red-400'
                        : 'bg-red-600 hover:bg-red-500 text-white'
                }`}
                title={effectiveShutdownState === 'confirmed' ? 'Encender alarma del dispositivo' : 'Apagar alarma del dispositivo'}
              >
                {effectiveShutdownState === 'sending' || effectiveShutdownState === 'waiting_ack' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                ) : effectiveShutdownState === 'confirmed' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                ) : effectiveShutdownState === 'no_ack' ? (
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <BellOff className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>
                  {effectiveShutdownState === 'confirmed'
                    ? 'Encender'
                    : effectiveShutdownState === 'no_ack'
                      ? 'Sin ACK'
                      : effectiveShutdownState === 'waiting_ack'
                        ? 'Enviado'
                        : 'Apagar'}
                </span>
              </button>
            )}
            {onOpenTypography && (
              <button
                type="button"
                onClick={() => {
                  soundAlert.playFeedbackBeep();
                  onOpenTypography();
                }}
                title="Ajustar tamaños de letra"
                className={`p-2 relative ${
                  isCustomTypographyActive ? 'text-emerald-400' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Type className="w-5 h-5" />
                {isCustomTypographyActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 absolute top-1.5 right-1.5" />
                )}
              </button>
            )}
            {onToggleTheme && (
              <button
                type="button"
                onClick={() => {
                  onToggleTheme();
                  soundAlert.playFeedbackBeep();
                }}
                title={theme === 'dark' ? 'Cambiar a Versión Clara' : 'Cambiar a Versión Oscura'}
                className="p-2 text-slate-400 hover:text-white"
              >
                {theme === 'dark' ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5 text-cyan-400" />}
              </button>
            )}
            <button
              onClick={handleToggleSound}
              className="p-2 text-slate-400 hover:text-white"
            >
              {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5 text-cyan-400" />}
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-slate-400 hover:text-white focus:outline-none"
              aria-label="Toggle navigation"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

        </div>

        {/* ROW 2: INDUSTRIAL MODULE NAVIGATION TABS */}
        <div className="hidden md:flex items-center justify-between border-t border-slate-800/80 py-1.5 overflow-x-auto no-scrollbar gap-2">
          <nav className="flex items-center gap-1 sm:gap-1.5">
            {navLinks.map((item) => {
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onSelectTab(item.id);
                    soundAlert.playFeedbackBeep();
                  }}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs lg:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? (item.id === 'superadmin_panel' || item.id === 'superadmin_vistas' || item.id === 'superadmin_docs')
                        ? 'bg-purple-950/90 text-purple-200 border border-purple-500/80 shadow-sm shadow-purple-950/60'
                        : 'bg-cyan-950/80 text-cyan-300 border border-cyan-700/70 shadow-sm shadow-cyan-950/50'
                      : (item.id === 'superadmin_panel' || item.id === 'superadmin_vistas' || item.id === 'superadmin_docs')
                        ? 'text-purple-300 hover:text-purple-100 hover:bg-purple-950/40 border border-purple-900/50'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent'
                  }`}
                  title={item.label}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {item.badge !== undefined && (
                    <span className="ml-1 px-1.5 py-0.2 text-[11px] font-bold rounded-full bg-rose-950 text-rose-300 border border-rose-800/80">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Subterranean shift info status indicator */}
          <div className="hidden lg:flex items-center gap-3 shrink-0 pl-2">
            <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              <span>
                {activeOrganizationId &&
                activeOrganizationId !== 'all' &&
                activeOrganizationId !== DEFAULT_ORGANIZATION_ID
                  ? siteBadgeName ||
                    organizations.find((o) => o.id === activeOrganizationId)?.name ||
                    activeOrganizationId
                  : platformConfig?.appearance?.siteBadgeText ||
                    siteBadgeName ||
                    'Faena El Teniente · Nivel -510m'}
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* Mobile Drawer Navigation */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-slate-900 border-b border-slate-800 px-4 pt-3 pb-5 space-y-3">
          <div className="grid grid-cols-1 gap-1">
            {navLinks.map((item) => {
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onSelectTab(item.id);
                    setMobileMenuOpen(false);
                    soundAlert.playFeedbackBeep();
                  }}
                  className={`flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800/60' : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {item.icon}
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== undefined && (
                    <span className="px-2 py-0.5 text-xs rounded-full bg-rose-950 text-rose-300 border border-rose-800">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="pt-3 border-t border-slate-800 flex flex-col gap-2">
            {isGlobalAdmin &&
              organizations.length > 0 &&
              onSelectOrganization && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/80 border border-slate-700 text-xs">
                  <Building2 className="w-4 h-4 text-cyan-400 shrink-0" />
                  <select
                    value={activeOrganizationId}
                    onChange={(e) => onSelectOrganization(e.target.value)}
                    aria-label="Organización activa"
                    className="w-full bg-transparent text-slate-200 font-semibold focus:outline-none"
                  >
                    <option value="all" className="bg-slate-950 text-white">Todas las Organizaciones</option>
                    {organizations.map((org) => (
                      <option key={org.id} value={org.id} className="bg-slate-950 text-white">
                        {org.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  onChangeUser();
                  setMobileMenuOpen(false);
                }}
                className="flex items-center gap-2 text-xs text-slate-300 bg-slate-800 px-3 py-2 rounded-lg"
              >
                <UserCheck className="w-4 h-4 text-cyan-400" />
                <span>{currentUser.name} ({roleTheme.badgeText})</span>
              </button>
              {showEmergencyButton && (
                <button
                  onClick={() => {
                    onTriggerEmergency();
                    setMobileMenuOpen(false);
                  }}
                  className={`px-3 py-2 text-xs font-semibold rounded-lg text-white ${
                    isDrillActive ? 'bg-amber-600 animate-pulse' : 'bg-rose-600'
                  }`}
                >
                  {isDrillActive ? 'Simulacro Activo' : (isSuperOrAdmin ? 'Simulacro / Evacuación' : 'Evacuación')}
                </button>
              )}
            </div>

            {canControlAlarm && (onShutdownAlarmCompletely || onToggleAlarm) && (
              <button
                type="button"
                onClick={handleAlarmControlClick}
                disabled={effectiveShutdownState === 'sending'}
                className={`w-full flex items-center justify-center gap-2 py-2.5 px-3 text-xs font-bold rounded-lg transition-all text-white ${
                  effectiveShutdownState === 'confirmed'
                    ? 'bg-emerald-600 hover:bg-emerald-500'
                    : effectiveShutdownState === 'waiting_ack' || effectiveShutdownState === 'no_ack'
                      ? 'bg-amber-600 hover:bg-amber-500'
                      : isAlarmActive || isDrillActive
                        ? 'bg-red-600 hover:bg-red-500 animate-pulse'
                        : 'bg-red-600 hover:bg-red-500'
                }`}
              >
                {effectiveShutdownState === 'sending' || effectiveShutdownState === 'waiting_ack' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : effectiveShutdownState === 'confirmed' ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : effectiveShutdownState === 'no_ack' ? (
                  <AlertTriangle className="w-4 h-4" />
                ) : (
                  <BellOff className="w-4 h-4" />
                )}
                <span>
                  {effectiveShutdownState === 'sending'
                    ? 'Procesando Alarma...'
                    : effectiveShutdownState === 'waiting_ack'
                      ? 'Esperando confirmación ESP32...'
                      : effectiveShutdownState === 'no_ack'
                        ? 'APAGAR enviado · Sin ACK del ESP32'
                        : effectiveShutdownState === 'confirmed'
                          ? 'Alarma Apagada · Clic para Encender'
                          : 'Apagar Alarma del Dispositivo'}
                </span>
              </button>
            )}

            {onOpenTypography && (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenTypography();
                }}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold rounded-lg border border-emerald-800 bg-emerald-950/60 text-emerald-200 hover:bg-emerald-900"
              >
                <Type className="w-4 h-4" />
                <span>Ajustar Tamaños de Letra</span>
              </button>
            )}

            {onOpenChangePassword && (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenChangePassword();
                }}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold rounded-lg border border-cyan-800 bg-cyan-950/60 text-cyan-200 hover:bg-cyan-900"
              >
                <KeyRound className="w-4 h-4" />
                <span>Cambiar Contraseña</span>
              </button>
            )}

            {onLogout && (
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onLogout();
                }}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold rounded-lg border border-rose-800 bg-rose-950/60 text-rose-300 hover:bg-rose-900"
              >
                <LogOut className="w-4 h-4" />
                <span>Cerrar Sesión</span>
              </button>
            )}
          </div>
        </div>
      )}

    </header>
  );
};
