import React, { useState, useRef } from 'react';
import {
  Lock,
  Mail,
  KeyRound,
  CheckCircle,
  AlertCircle,
  X,
  Eye,
  EyeOff,
  Fingerprint,
  Loader2,
  Sun,
  Moon,
  UserPlus,
} from 'lucide-react';
import { UserProfile } from '../types';
import {
  createNewCompanyAccountWithPreviousEmail,
  loginWithFirebaseAuth,
  sendPasswordResetWithFirebase,
} from '../services/firebase';
import { soundAlert } from '../services/audioAlert';

interface LoginModalProps {
  currentUser: UserProfile | null;
  onLogin: (user: UserProfile) => void;
  onLogout: () => void;
  onClose: () => void;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  currentUser,
  onLogin,
  onLogout,
  onClose,
  theme = 'dark',
  onToggleTheme,
}) => {
  const [activeTab, setActiveTab] = useState<'login' | 'recreate' | 'recover'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [previousPassword, setPreviousPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  const handleSubmitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMessage('Ingresa tu correo electrónico corporativo.');
      return;
    }
    if (!password) {
      soundAlert.playFeedbackBeep();
      setErrorMessage('Ingresa tu contraseña de Firebase Auth.');
      passwordInputRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    try {
      const authenticatedUser = await loginWithFirebaseAuth(cleanEmail, password, rememberMe);
      soundAlert.playFeedbackBeep();
      onLogin(authenticatedUser);
      onClose();
    } catch (err: any) {
      soundAlert.playFeedbackBeep();
      if (err?.code === 'auth/account-recreation-required') {
        setPreviousPassword(password);
        setActiveTab('recreate');
        setSuccessMessage(
          'Una nueva empresa ya habilitó tu correo anterior. Define una nueva contraseña para crear tu cuenta nueva.'
        );
        return;
      }
      setErrorMessage(
        err?.message || 'Credenciales inválidas en Firebase Authentication. Acceso denegado.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitRecreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMessage('Ingresa el correo autorizado por la nueva empresa.');
      return;
    }
    if (!previousPassword) {
      setErrorMessage('Ingresa tu contraseña anterior.');
      return;
    }
    if (newPassword.length < 6) {
      setErrorMessage('La nueva contraseña debe tener mínimo 6 caracteres.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setErrorMessage('Las contraseñas nuevas no coinciden.');
      return;
    }

    setIsSubmitting(true);
    try {
      const activatedUser = await createNewCompanyAccountWithPreviousEmail({
        email: cleanEmail,
        previousPassword,
        newPassword,
        rememberMe,
      });
      soundAlert.playFeedbackBeep();
      onLogin(activatedUser);
      onClose();
    } catch (err: any) {
      soundAlert.playFeedbackBeep();
      setErrorMessage(
        err?.message || 'No fue posible activar tu nueva cuenta con el correo anterior.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    if (!email.trim()) {
      setErrorMessage('Ingresa el correo registrado en Firebase Auth.');
      return;
    }

    setIsSubmitting(true);
    try {
      await sendPasswordResetWithFirebase(email);
      soundAlert.playFeedbackBeep();
      setSuccessMessage(
        `Si ${email.trim()} corresponde a una cuenta habilitada, recibirás un enlace para restablecer tu contraseña.`
      );
    } catch (err: any) {
      soundAlert.playFeedbackBeep();
      setErrorMessage(err?.message || 'No se pudo enviar el correo de recuperación.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-md p-3 sm:p-6 animate-in fade-in">
      <div className="min-h-full flex items-center justify-center py-4">
        <div className="bg-slate-900/95 border border-slate-700/80 rounded-2xl max-w-md w-full shadow-2xl backdrop-blur-md relative z-10 flex flex-col max-h-[min(88vh,720px)]">
          {/* Header */}
          <div className="flex items-start justify-between p-5 pb-4 border-b border-slate-800/80 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-950 text-cyan-400 border border-cyan-800 flex items-center justify-center shrink-0">
                {activeTab === 'recreate' ? (
                  <UserPlus className="w-5 h-5 text-cyan-400" />
                ) : (
                  <Lock className="w-5 h-5 text-cyan-400" />
                )}
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  Sesión de Usuario MineSafe
                </h2>
                <p className="text-xs text-slate-400">
                  Cambiar cuenta, activar nueva empresa o recuperar clave
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0 -mr-1 -mt-1">
              {onToggleTheme && (
                <button
                  type="button"
                  onClick={() => {
                    onToggleTheme();
                    soundAlert.playFeedbackBeep();
                  }}
                  title={theme === 'dark' ? 'Cambiar a Versión Clara' : 'Cambiar a Versión Oscura'}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:bg-slate-800 text-[11px] font-semibold text-slate-200 transition-colors"
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
                aria-label="Cerrar modal"
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-5 overflow-y-auto space-y-4">
            {currentUser && (
              <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 flex items-center justify-center font-bold">
                    {currentUser.name.charAt(0)}
                  </div>
                  <div>
                    <span className="font-bold text-white block">{currentUser.name}</span>
                    <span className="text-[10px] text-cyan-400 uppercase font-semibold">
                      {currentUser.role === 'superadmin'
                        ? 'SuperAdmin'
                        : currentUser.role === 'admin_minesafe'
                        ? 'Admin Corporativo MineSafe'
                        : currentUser.role === 'admin'
                        ? 'Admin'
                        : currentUser.role === 'monotoriador'
                        ? 'Monotoriador'
                        : 'Operador'}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onLogout();
                    soundAlert.playFeedbackBeep();
                  }}
                  className="px-2.5 py-1 text-xs font-semibold text-rose-300 bg-rose-950/80 hover:bg-rose-900 rounded border border-rose-800 transition-colors"
                >
                  Cerrar Sesión
                </button>
              </div>
            )}

            <div className="flex items-center p-1 bg-slate-950 rounded-lg border border-slate-800 text-[11px] sm:text-xs">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('login');
                  setErrorMessage('');
                  setSuccessMessage('');
                }}
                className={`flex-1 py-1.5 font-semibold rounded-md transition-colors ${
                  activeTab === 'login' ? 'bg-slate-800 text-cyan-300 shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Cambiar Cuenta
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('recreate');
                  setErrorMessage('');
                  setSuccessMessage('');
                }}
                className={`flex-1 py-1.5 font-semibold rounded-md transition-colors ${
                  activeTab === 'recreate' ? 'bg-slate-800 text-cyan-300 shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Nueva Empresa
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('recover');
                  setErrorMessage('');
                  setSuccessMessage('');
                }}
                className={`flex-1 py-1.5 font-semibold rounded-md transition-colors ${
                  activeTab === 'recover' ? 'bg-slate-800 text-cyan-300 shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Recuperar Clave
              </button>
            </div>

            {errorMessage && (
              <div className="p-3 bg-rose-950/80 border border-rose-800 text-rose-200 rounded-lg text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                <span>{errorMessage}</span>
              </div>
            )}

            {successMessage && (
              <div className="p-3 bg-emerald-950/80 border border-emerald-800 text-emerald-300 rounded-lg text-xs flex items-start gap-2">
                <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{successMessage}</span>
              </div>
            )}

            {activeTab === 'login' ? (
              <form onSubmit={handleSubmitLogin} className="space-y-3.5 text-xs">
                <div>
                  <label className="text-slate-300 font-medium block mb-1">
                    Correo Electrónico Corporativo
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      type="email"
                      required
                      placeholder="usuario@organizacion.cl"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-slate-300 font-medium block mb-1">
                    Contraseña
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      ref={passwordInputRef}
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="Ingresa tu contraseña"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-9 pr-9 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] text-slate-400 pt-1">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-700 text-cyan-600 focus:ring-0 w-3.5 h-3.5"
                  />
                  <span>Recordar sesión en este equipo</span>
                </label>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 px-4 text-xs font-bold bg-cyan-600 hover:bg-cyan-500 disabled:bg-cyan-900 text-white rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4" />}
                  <span>{isSubmitting ? 'Validando...' : 'Iniciar Sesión'}</span>
                </button>
              </form>
            ) : activeTab === 'recreate' ? (
              <form onSubmit={handleSubmitRecreate} className="space-y-3 text-xs">
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Si fuiste bloqueado en una empresa anterior y otra empresa te registró con tu mismo correo, valida tu clave anterior y define una nueva contraseña para crear tu nueva cuenta.
                </p>

                <div>
                  <label className="text-slate-300 font-medium block mb-1">Correo Anterior</label>
                  <input
                    type="email"
                    required
                    placeholder="correo@ejemplo.cl"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500"
                  />
                </div>

                <div>
                  <label className="text-slate-300 font-medium block mb-1">Contraseña Anterior</label>
                  <input
                    type="password"
                    required
                    placeholder="Contraseña de tu cuenta anterior"
                    value={previousPassword}
                    onChange={(e) => setPreviousPassword(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-slate-300 font-medium block mb-1">Nueva Contraseña</label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      placeholder="Mín. 6 caracteres"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500"
                    />
                  </div>
                  <div>
                    <label className="text-slate-300 font-medium block mb-1">Confirmar Clave</label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      placeholder="Repite nueva clave"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 px-4 text-xs font-bold bg-cyan-600 hover:bg-cyan-500 disabled:bg-cyan-900 text-white rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  <span>{isSubmitting ? 'Creando Cuenta...' : 'Crear Nueva Cuenta y Acceder'}</span>
                </button>
              </form>
            ) : (
              <form onSubmit={handleSubmitRecover} className="space-y-3 text-xs">
                <p className="text-slate-400">
                  Ingresa tu correo registrado para recibir el enlace de restablecimiento de contraseña.
                </p>
                <div>
                  <label className="text-slate-300 block mb-1">Correo Electrónico</label>
                  <input
                    type="email"
                    required
                    placeholder="usuario@organizacion.cl"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 px-3 text-xs font-bold bg-cyan-600 hover:bg-cyan-500 disabled:bg-cyan-900 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{isSubmitting ? 'Enviando enlace...' : 'Enviar Enlace de Recuperación'}</span>
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
