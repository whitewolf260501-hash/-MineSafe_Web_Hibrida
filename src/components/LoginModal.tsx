import React, { useState } from 'react';
import {
  X,
  Sun,
  Moon,
  LogOut,
  ShieldCheck,
  Building2,
  MapPin,
  Users,
  Mail,
  CreditCard,
  Clock,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { MiningCrew, MiningSite, Organization, UserProfile } from '../types';
import { updateCurrentUserPasswordWithPolicy } from '../services/firebase';
import { validatePasswordPolicy } from '../utils/passwordPolicy';
import { soundAlert } from '../services/audioAlert';

interface LoginModalProps {
  currentUser: UserProfile | null;
  organizations?: Organization[];
  sites?: MiningSite[];
  crews?: MiningCrew[];
  onLogin: (user: UserProfile) => void;
  onLogout: () => void;
  onClose: () => void;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  currentUser,
  organizations = [],
  sites = [],
  crews = [],
  onLogin,
  onLogout,
  onClose,
  theme = 'dark',
  onToggleTheme,
}) => {
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  if (!currentUser) {
    return null;
  }

  const org = organizations.find((o) => o.id === currentUser.organizationId);
  const orgName = org?.name || currentUser.organizationId || 'MineSafe Corporativo';

  const userCrew = crews.find(
    (c) =>
      c.id === currentUser.assignedCrewId ||
      c.members.some(
        (m) =>
          m.userId === currentUser.id ||
          (m.email && m.email.toLowerCase() === currentUser.email.toLowerCase())
      )
  );
  const userSite = sites.find(
    (s) => s.id === (currentUser.assignedSiteId || userCrew?.siteId)
  );

  const faenaDisplay =
    currentUser.assignedSiteName || userSite?.name || userCrew?.siteName || 'Faena General';
  const crewDisplay =
    currentUser.assignedCrewName || userCrew?.name || 'Sin cuadrilla específica';
  const sectorDisplay =
    currentUser.assignedSector || userCrew?.sectorName || 'Sector Operativo';

  const roleBadgeConfig = (() => {
    switch (currentUser.role) {
      case 'superadmin':
        return {
          label: 'SUPERADMINISTRADOR',
          sublabel: 'Control Global de Plataforma',
          badgeClass: 'bg-purple-500/20 text-purple-200 border-purple-400/50',
          headerBg: 'from-purple-950/90 via-slate-900 to-slate-900',
        };
      case 'admin_minesafe':
        return {
          label: 'ADMIN CORPORATIVO MINESAFE',
          sublabel: 'Gestión Multiempresa y Despliegue',
          badgeClass: 'bg-indigo-500/20 text-indigo-200 border-indigo-400/50',
          headerBg: 'from-indigo-950/90 via-slate-900 to-slate-900',
        };
      case 'admin':
        return {
          label: 'ADMINISTRADOR DE EMPRESA',
          sublabel: 'Gestión de Faenas, Cuadrillas y Alarmas',
          badgeClass: 'bg-cyan-500/20 text-cyan-200 border-cyan-400/50',
          headerBg: 'from-cyan-950/90 via-slate-900 to-slate-900',
        };
      case 'supervisor':
        return {
          label: 'SUPERVISOR AMBIENTAL',
          sublabel: 'Supervisión de Sectores y Alertas',
          badgeClass: 'bg-amber-500/20 text-amber-200 border-amber-400/50',
          headerBg: 'from-amber-950/80 via-slate-900 to-slate-900',
        };
      default:
        return {
          label: 'OPERADOR DE FAENA',
          sublabel: 'Monitoreo de Sector Asignado',
          badgeClass: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/50',
          headerBg: 'from-emerald-950/80 via-slate-900 to-slate-900',
        };
    }
  })();

  const initials = currentUser.name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    const check = validatePasswordPolicy(newPassword);
    if (!check.valid) {
      setErrorMessage(check.errors[0] || 'La contraseña no cumple la política mínima.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('La nueva contraseña y su confirmación no coinciden.');
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const updatedUser = await updateCurrentUserPasswordWithPolicy(newPassword, currentUser);
      onLogin(updatedUser);
      setNewPassword('');
      setConfirmPassword('');
      setSuccessMessage('Contraseña actualizada correctamente conforme a la política de seguridad.');
      soundAlert.playFeedbackBeep();
    } catch (err: any) {
      setErrorMessage(err?.message || 'No fue posible actualizar tu contraseña.');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-md p-3 sm:p-6 animate-in fade-in"
      onClick={onClose}
    >
      <div className="min-h-full flex items-center justify-center py-4">
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden flex flex-col max-h-[min(90vh,760px)]"
        >
          {/* Franja superior tipo Credencial / Carnet Digital */}
          <div className={`bg-gradient-to-br ${roleBadgeConfig.headerBg} p-5 border-b border-slate-800 relative`}>
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-cyan-300">
                <ShieldCheck className="w-4 h-4" />
                <span>Credencial Digital MineSafe</span>
              </div>

              <div className="flex items-center gap-1.5">
                {onToggleTheme && (
                  <button
                    type="button"
                    onClick={() => {
                      onToggleTheme();
                      soundAlert.playFeedbackBeep();
                    }}
                    title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-950/80 border border-slate-700 hover:bg-slate-800 text-[11px] font-semibold text-slate-200 transition-colors cursor-pointer"
                  >
                    {theme === 'dark' ? (
                      <>
                        <Sun className="w-3.5 h-3.5 text-amber-400" />
                        <span>Claro</span>
                      </>
                    ) : (
                      <>
                        <Moon className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Oscuro</span>
                      </>
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Cerrar credencial"
                  className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800/80 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-slate-950/90 border-2 border-cyan-500/60 flex items-center justify-center text-2xl font-extrabold text-cyan-300 shadow-lg shrink-0">
                {initials || 'U'}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-extrabold text-white tracking-tight truncate">
                  {currentUser.name}
                </h2>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-md border text-[11px] font-extrabold tracking-wide ${roleBadgeConfig.badgeClass}`}
                  >
                    {roleBadgeConfig.label}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-950/80 border border-emerald-700/60 text-emerald-300 text-[10px] font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    {currentUser.status === 'activo' ? 'ACTIVO' : 'INACTIVO'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">{roleBadgeConfig.sublabel}</p>
              </div>
            </div>
          </div>

          {/* Cuerpo de datos del carnet */}
          <div className="p-5 overflow-y-auto space-y-4">
            <div className="grid grid-cols-1 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center gap-3">
                <Building2 className="w-4 h-4 text-cyan-400 shrink-0" />
                <div className="min-w-0">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
                    Empresa / Organización
                  </span>
                  <span className="font-bold text-white truncate block">{orgName}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-start gap-2.5">
                  <CreditCard className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
                      RUT / ID
                    </span>
                    <span className="font-mono font-semibold text-white truncate block">
                      {currentUser.rut || 'No registrado'}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-start gap-2.5">
                  <Clock className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
                      Turno / Cargo
                    </span>
                    <span className="font-semibold text-white truncate block">
                      {currentUser.shift || 'Turno Continuo'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center gap-3">
                <Mail className="w-4 h-4 text-cyan-400 shrink-0" />
                <div className="min-w-0">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
                    Correo Corporativo
                  </span>
                  <span className="font-semibold text-white truncate block">{currentUser.email}</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                  <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Asignación Operativa</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Faena</span>
                    <span className="font-semibold text-white block truncate" title={faenaDisplay}>
                      {faenaDisplay}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Cuadrilla</span>
                    <span className="font-semibold text-white block truncate" title={crewDisplay}>
                      {crewDisplay}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Sector</span>
                    <span className="font-semibold text-white block truncate" title={sectorDisplay}>
                      {sectorDisplay}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Seguridad de contraseña colapsable */}
            <div className="border border-slate-800 rounded-xl bg-slate-950/60 overflow-hidden">
              <button
                type="button"
                onClick={() => {
                  setShowPasswordSection((prev) => !prev);
                  setErrorMessage('');
                  setSuccessMessage('');
                }}
                className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-semibold text-slate-200 hover:bg-slate-900/80 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-cyan-400" />
                  <span>Actualizar mi contraseña</span>
                </span>
                {showPasswordSection ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showPasswordSection && (
                <form onSubmit={handleUpdatePassword} className="p-3.5 pt-2 border-t border-slate-800 space-y-2.5 text-xs">
                  <p className="text-[11px] text-slate-400">
                    Mínimo 8 caracteres, incluyendo mayúscula, minúscula y número.
                  </p>
                  {errorMessage && (
                    <div className="p-2.5 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-200 flex items-start gap-2">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{errorMessage}</span>
                    </div>
                  )}
                  {successMessage && (
                    <div className="p-2.5 rounded-lg bg-emerald-950/80 border border-emerald-800 text-emerald-200 flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{successMessage}</span>
                    </div>
                  )}
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      placeholder="Nueva contraseña segura"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-3 py-2 pr-9 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-2.5 top-2 text-slate-400 hover:text-white"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    placeholder="Confirmar nueva contraseña"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500"
                  />
                  <button
                    type="submit"
                    disabled={isUpdatingPassword}
                    className="w-full py-2 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {isUpdatingPassword && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>{isUpdatingPassword ? 'Guardando...' : 'Guardar nueva contraseña'}</span>
                  </button>
                </form>
              )}
            </div>

            {/* Acciones inferiores del Carnet */}
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
              <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
                <Users className="w-3.5 h-3.5 text-cyan-400" />
                <span>Sesión verificada</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  onLogout();
                  soundAlert.playFeedbackBeep();
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold text-rose-200 bg-rose-950/90 hover:bg-rose-900 border border-rose-700 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Cerrar Sesión</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
