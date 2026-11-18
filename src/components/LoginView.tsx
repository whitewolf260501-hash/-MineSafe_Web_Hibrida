import React, { useState, useRef } from 'react';
import {
  Lock,
  Mail,
  KeyRound,
  Eye,
  EyeOff,
  ArrowLeft,
  Radio,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Fingerprint,
  UserPlus,
} from 'lucide-react';
import { UserProfile } from '../types';
import {
  createNewCompanyAccountWithPreviousEmail,
  loginWithFirebaseAuth,
  sendPasswordResetWithFirebase,
} from '../services/firebase';
import { soundAlert } from '../services/audioAlert';

interface LoginViewProps {
  onLoginSuccess: (user: UserProfile) => void;
  onBackToLanding: () => void;
  externalAuthError?: string | null;
}

export const LoginView: React.FC<LoginViewProps> = ({
  onLoginSuccess,
  onBackToLanding,
  externalAuthError,
}) => {
  const [mode, setMode] = useState<'login' | 'recover' | 'recreate'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [previousPassword, setPreviousPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPrevPassword, setShowPrevPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const passwordInputRef = useRef<HTMLInputElement>(null);

  const visibleError = errorMessage || externalAuthError || '';

  const handleSubmitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMessage('Ingresa tu correo electrónico autorizado.');
      return;
    }
    if (!password) {
      setErrorMessage('Ingresa tu contraseña.');
      passwordInputRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    try {
      const authenticatedUser = await loginWithFirebaseAuth(cleanEmail, password, rememberMe);
      soundAlert.playFeedbackBeep();
      onLoginSuccess(authenticatedUser);
    } catch (err: any) {
      soundAlert.playFeedbackBeep();
      if (err?.code === 'auth/account-recreation-required') {
        setPreviousPassword(password);
        setMode('recreate');
        setSuccessMessage(
          'Tu nueva empresa ya autorizó este correo. Define tu nueva contraseña para crear tu cuenta nueva conservando tu correo anterior.'
        );
        return;
      }
      setErrorMessage(
        err?.message || 'No fue posible iniciar sesión. Verifica tus credenciales.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitRecreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMessage('Ingresa tu correo electrónico anterior autorizado por la nueva empresa.');
      return;
    }
    if (!previousPassword) {
      setErrorMessage('Ingresa tu contraseña anterior para validar tu identidad.');
      return;
    }
    if (newPassword.length < 8) {
      setErrorMessage('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setErrorMessage('La nueva contraseña y su confirmación no coinciden.');
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
      onLoginSuccess(activatedUser);
    } catch (err: any) {
      soundAlert.playFeedbackBeep();
      setErrorMessage(
        err?.message || 'No se pudo crear la nueva cuenta con tu correo anterior.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMessage('Ingresa el correo electrónico registrado para enviar el enlace de recuperación.');
      return;
    }

    setIsSubmitting(true);
    try {
      await sendPasswordResetWithFirebase(cleanEmail);
      soundAlert.playFeedbackBeep();
      setSuccessMessage(
        `Si el correo ${cleanEmail} corresponde a una cuenta activa, recibirás un enlace para restablecer tu contraseña.`
      );
    } catch (err: any) {
      soundAlert.playFeedbackBeep();
      setErrorMessage(err?.message || 'No se pudo enviar el correo de recuperación.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const focusRing =
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488] focus-visible:ring-offset-2 focus-visible:ring-offset-white';

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col font-sans selection:bg-[#0D9488] selection:text-[#FFFFFF]">
      {/* Barra superior azul grafito coherente con la portada */}
      <header className="bg-[#131E31] border-b border-[#253349] text-[#F8FAFC]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onBackToLanding}
            className="flex items-center gap-2.5 text-left rounded-lg py-1 pr-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#14B8A6] cursor-pointer"
          >
            <span className="w-8 h-8 rounded-lg bg-[#0D9488] flex items-center justify-center text-[#FFFFFF] shrink-0">
              <Radio className="w-4 h-4" />
            </span>
            <span className="text-lg font-extrabold tracking-tight text-[#F8FAFC]">
              Mine<span className="text-[#2DD4BF]">Safe</span>
            </span>
          </button>

          <button
            type="button"
            onClick={onBackToLanding}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold text-[#E2E8F0] bg-[#1E293B] hover:bg-[#334155] border border-[#334155] transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#14B8A6]"
          >
            <ArrowLeft className="w-4 h-4 text-[#2DD4BF]" />
            <span>Volver a la portada</span>
          </button>
        </div>
      </header>

      {/* Contenedor central de acceso */}
      <main className="flex-1 flex items-center justify-center px-4 py-10 sm:py-14">
        <div className="w-full max-w-md space-y-5">
          <div className="bg-[#FFFFFF] border border-[#E2E8F0] rounded-2xl shadow-sm p-6 sm:p-8 space-y-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#F0FDFA] border border-[#99F6E4] text-[#0F766E] flex items-center justify-center shrink-0">
                {mode === 'recreate' ? (
                  <UserPlus className="w-5 h-5" />
                ) : (
                  <Lock className="w-5 h-5" />
                )}
              </div>
              <div>
                <h1 className="text-xl font-extrabold tracking-tight text-[#0F172A]">
                  {mode === 'login'
                    ? 'Acceso al panel MineSafe'
                    : mode === 'recreate'
                    ? 'Nueva cuenta con correo anterior'
                    : 'Recuperar contraseña'}
                </h1>
                <p className="text-xs sm:text-sm text-[#475569] mt-0.5">
                  {mode === 'login'
                    ? 'Ingresa con la cuenta asignada por el responsable de tu organización.'
                    : mode === 'recreate'
                    ? 'Si cambiaste de empresa y fuiste registrado con tu correo anterior, crea tu nueva cuenta de acceso aquí.'
                    : 'Solicita un enlace de restablecimiento mediante Firebase Authentication.'}
                </p>
              </div>
            </div>

            {visibleError && (
              <div
                role="alert"
                className="p-3.5 rounded-xl bg-[#FFF1F2] border border-[#FECDD3] text-xs sm:text-sm text-[#BE123C] flex items-start gap-2.5"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{visibleError}</span>
              </div>
            )}

            {successMessage && (
              <div
                role="status"
                className="p-3.5 rounded-xl bg-[#ECFDF5] border border-[#A7F3D0] text-xs sm:text-sm text-[#047857] flex items-start gap-2.5"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{successMessage}</span>
              </div>
            )}

            {mode === 'login' ? (
              <form onSubmit={handleSubmitLogin} className="space-y-4">
                <div>
                  <label htmlFor="login-email" className="block text-xs font-semibold text-[#334155] mb-1.5">
                    Correo electrónico
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-[#64748B] absolute left-3.5 top-3" />
                    <input
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      required
                      placeholder="usuario@organizacion.cl"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={`w-full pl-10 pr-3.5 py-2.5 text-sm bg-[#FFFFFF] border border-[#CBD5E1] rounded-lg text-[#0F172A] placeholder-[#94A3B8] ${focusRing}`}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="login-password" className="block text-xs font-semibold text-[#334155] mb-1.5">
                    Contraseña
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-[#64748B] absolute left-3.5 top-3" />
                    <input
                      ref={passwordInputRef}
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      placeholder="Ingresa tu contraseña"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`w-full pl-10 pr-10 py-2.5 text-sm bg-[#FFFFFF] border border-[#CBD5E1] rounded-lg text-[#0F172A] placeholder-[#94A3B8] ${focusRing}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      className={`absolute right-2.5 top-2 p-1 rounded text-[#64748B] hover:text-[#0F172A] ${focusRing}`}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-0.5">
                  <label className="flex items-center gap-2 text-[#475569] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="rounded border-[#CBD5E1] text-[#0D9488] focus:ring-[#0D9488]"
                    />
                    <span>Mantener sesión</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      setMode('recover');
                      setErrorMessage('');
                      setSuccessMessage('');
                    }}
                    className={`font-semibold text-[#0F766E] hover:underline cursor-pointer rounded ${focusRing}`}
                  >
                    Recuperar contraseña
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`w-full py-2.5 px-4 rounded-lg text-sm font-semibold bg-[#0D9488] hover:bg-[#0F766E] disabled:bg-[#99F6E4] disabled:text-[#115E59] text-[#FFFFFF] transition-colors flex items-center justify-center gap-2 cursor-pointer ${focusRing}`}
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Fingerprint className="w-4 h-4" />
                  )}
                  <span>{isSubmitting ? 'Verificando acceso...' : 'Iniciar sesión'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMode('recreate');
                    setErrorMessage('');
                    setSuccessMessage('');
                  }}
                  className={`w-full py-2 px-3 rounded-lg text-xs font-semibold text-[#0F766E] bg-[#F0FDFA] hover:bg-[#CCFBF1] border border-[#99F6E4] transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${focusRing}`}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>¿Te contrataron en otra empresa? Crear nueva cuenta con tu correo anterior</span>
                </button>
              </form>
            ) : mode === 'recreate' ? (
              <form onSubmit={handleSubmitRecreateAccount} className="space-y-3.5">
                <div className="p-3 rounded-xl bg-[#F0FDFA] border border-[#99F6E4] text-xs text-[#115E59] leading-relaxed">
                  Requisito: la nueva empresa debe haber habilitado previamente tu correo en su nómina de usuarios. Tu cuenta bloqueada en la empresa anterior permanecerá bloqueada.
                </div>

                <div>
                  <label htmlFor="recreate-email" className="block text-xs font-semibold text-[#334155] mb-1">
                    Correo electrónico anterior (autorizado en la nueva empresa)
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-[#64748B] absolute left-3.5 top-3" />
                    <input
                      id="recreate-email"
                      type="email"
                      autoComplete="email"
                      required
                      placeholder="correo@ejemplo.cl"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={`w-full pl-10 pr-3.5 py-2.5 text-sm bg-[#FFFFFF] border border-[#CBD5E1] rounded-lg text-[#0F172A] placeholder-[#94A3B8] ${focusRing}`}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="recreate-prev-password" className="block text-xs font-semibold text-[#334155]">
                      Contraseña de tu cuenta anterior
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('recover');
                        setErrorMessage('');
                        setSuccessMessage('');
                      }}
                      className="text-[11px] font-semibold text-[#0F766E] hover:underline cursor-pointer"
                    >
                      ¿La olvidaste?
                    </button>
                  </div>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-[#64748B] absolute left-3.5 top-3" />
                    <input
                      id="recreate-prev-password"
                      type={showPrevPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      placeholder="Contraseña anterior para validar identidad"
                      value={previousPassword}
                      onChange={(e) => setPreviousPassword(e.target.value)}
                      className={`w-full pl-10 pr-10 py-2.5 text-sm bg-[#FFFFFF] border border-[#CBD5E1] rounded-lg text-[#0F172A] placeholder-[#94A3B8] ${focusRing}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPrevPassword((prev) => !prev)}
                      aria-label={showPrevPassword ? 'Ocultar contraseña anterior' : 'Mostrar contraseña anterior'}
                      className={`absolute right-2.5 top-2 p-1 rounded text-[#64748B] hover:text-[#0F172A] ${focusRing}`}
                    >
                      {showPrevPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="recreate-new-password" className="block text-xs font-semibold text-[#334155] mb-1">
                    Nueva contraseña para esta empresa (mín. 8 caracteres)
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[#64748B] absolute left-3.5 top-3" />
                    <input
                      id="recreate-new-password"
                      type={showNewPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      minLength={8}
                      placeholder="Define una nueva contraseña"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className={`w-full pl-10 pr-10 py-2.5 text-sm bg-[#FFFFFF] border border-[#CBD5E1] rounded-lg text-[#0F172A] placeholder-[#94A3B8] ${focusRing}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((prev) => !prev)}
                      aria-label={showNewPassword ? 'Ocultar nueva contraseña' : 'Mostrar nueva contraseña'}
                      className={`absolute right-2.5 top-2 p-1 rounded text-[#64748B] hover:text-[#0F172A] ${focusRing}`}
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="recreate-confirm-password" className="block text-xs font-semibold text-[#334155] mb-1">
                    Confirmar nueva contraseña
                  </label>
                  <input
                    id="recreate-confirm-password"
                    type={showNewPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    placeholder="Repite tu nueva contraseña"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    className={`w-full px-3.5 py-2.5 text-sm bg-[#FFFFFF] border border-[#CBD5E1] rounded-lg text-[#0F172A] placeholder-[#94A3B8] ${focusRing}`}
                  />
                </div>

                <label className="flex items-center gap-2 text-xs text-[#475569] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded border-[#CBD5E1] text-[#0D9488] focus:ring-[#0D9488]"
                  />
                  <span>Mantener sesión iniciada</span>
                </label>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`w-full py-2.5 px-4 rounded-lg text-sm font-semibold bg-[#0D9488] hover:bg-[#0F766E] disabled:bg-[#99F6E4] disabled:text-[#115E59] text-[#FFFFFF] transition-colors flex items-center justify-center gap-2 cursor-pointer ${focusRing}`}
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <UserPlus className="w-4 h-4" />
                  )}
                  <span>{isSubmitting ? 'Creando nueva cuenta...' : 'Crear nueva cuenta y acceder'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setErrorMessage('');
                    setSuccessMessage('');
                  }}
                  className={`w-full py-2 text-xs font-semibold text-[#475569] hover:text-[#0F172A] cursor-pointer rounded ${focusRing}`}
                >
                  Volver a iniciar sesión
                </button>
              </form>
            ) : (
              <form onSubmit={handleSubmitRecover} className="space-y-4">
                <div>
                  <label htmlFor="recover-email" className="block text-xs font-semibold text-[#334155] mb-1.5">
                    Correo electrónico registrado
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-[#64748B] absolute left-3.5 top-3" />
                    <input
                      id="recover-email"
                      type="email"
                      autoComplete="email"
                      required
                      placeholder="usuario@organizacion.cl"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={`w-full pl-10 pr-3.5 py-2.5 text-sm bg-[#FFFFFF] border border-[#CBD5E1] rounded-lg text-[#0F172A] placeholder-[#94A3B8] ${focusRing}`}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`w-full py-2.5 px-4 rounded-lg text-sm font-semibold bg-[#0D9488] hover:bg-[#0F766E] disabled:bg-[#99F6E4] text-[#FFFFFF] transition-colors flex items-center justify-center gap-2 cursor-pointer ${focusRing}`}
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{isSubmitting ? 'Enviando enlace...' : 'Enviar enlace de recuperación'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setErrorMessage('');
                    setSuccessMessage('');
                  }}
                  className={`w-full py-2 text-xs font-semibold text-[#475569] hover:text-[#0F172A] cursor-pointer rounded ${focusRing}`}
                >
                  Volver a iniciar sesión
                </button>
              </form>
            )}

            <div className="pt-4 border-t border-[#E2E8F0] text-xs text-[#64748B] leading-relaxed">
              Las cuentas de acceso son habilitadas únicamente por un responsable autorizado de cada organización. Si fuiste desvinculado de una empresa anterior y te contrataron en una nueva, solicita que registren tu correo para crear tu nueva cuenta.
            </div>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={onBackToLanding}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#475569] hover:text-[#0F766E] transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Regresar a la portada de MineSafe</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};
