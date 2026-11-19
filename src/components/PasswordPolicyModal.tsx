import React, { useState } from 'react';
import {
  ShieldAlert,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  Circle,
  Loader2,
  AlertCircle,
  LogOut,
  Mail,
} from 'lucide-react';
import { UserProfile } from '../types';
import { validatePasswordPolicy } from '../utils/passwordPolicy';
import {
  updateCurrentUserPasswordWithPolicy,
  sendPasswordResetWithFirebase,
} from '../services/firebase';
import { soundAlert } from '../services/audioAlert';

interface PasswordPolicyModalProps {
  user: UserProfile;
  reason: string;
  onCompleted: (updatedUser: UserProfile) => void;
  onCancelLogout: () => void;
}

export const PasswordPolicyModal: React.FC<PasswordPolicyModalProps> = ({
  user,
  reason,
  onCompleted,
  onCancelLogout,
}) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  const policy = validatePasswordPolicy(newPassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setInfoMessage('');

    if (!policy.valid) {
      setErrorMessage(policy.errors[0] || 'La nueva contraseña no cumple los requisitos mínimos.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('La nueva contraseña y su confirmación no coinciden.');
      return;
    }

    setIsSubmitting(true);
    try {
      const updated = await updateCurrentUserPasswordWithPolicy(newPassword, user);
      soundAlert.playFeedbackBeep();
      onCompleted(updated);
    } catch (err: any) {
      soundAlert.playFeedbackBeep();
      setErrorMessage(err?.message || 'No se pudo actualizar la contraseña.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendResetEmail = async () => {
    setErrorMessage('');
    setInfoMessage('');
    setIsSubmitting(true);
    try {
      await sendPasswordResetWithFirebase(user.email);
      setInfoMessage(
        `Se envió un enlace de restablecimiento a ${user.email}. Actualiza tu clave desde el correo y vuelve a ingresar.`
      );
    } catch (err: any) {
      setErrorMessage(err?.message || 'No se pudo enviar el correo de restablecimiento.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const rules = [
    { ok: policy.checks.minLength, label: 'Al menos 8 caracteres' },
    { ok: policy.checks.hasUppercase, label: 'Al menos una letra mayúscula (A-Z)' },
    { ok: policy.checks.hasLowercase, label: 'Al menos una letra minúscula (a-z)' },
    { ok: policy.checks.hasNumber, label: 'Al menos un número (0-9)' },
  ];

  return (
    <div className="min-h-screen w-full bg-[#F8FAFC] dark:bg-[#060b13] text-[#0F172A] dark:text-slate-100 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-6 sm:p-7 space-y-5">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-700/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
              Actualización Obligatoria de Contraseña
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
              {reason}
            </p>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs">
          <p className="font-bold text-slate-900 dark:text-white">{user.name}</p>
          <p className="text-slate-500 dark:text-slate-400">{user.email}</p>
        </div>

        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/70 border border-rose-300 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {infoMessage && (
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{infoMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="policy-new-pass" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Nueva contraseña segura
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                id="policy-new-pass"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="Ej: MinaSegura2026"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-teal-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2.5 top-2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="policy-confirm-pass" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Confirmar nueva contraseña
            </label>
            <input
              id="policy-confirm-pass"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="Repite tu nueva contraseña"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-teal-500"
            />
          </div>

          <ul className="space-y-1.5 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs">
            {rules.map((r) => (
              <li
                key={r.label}
                className={`flex items-center gap-2 ${
                  r.ok ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {r.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <Circle className="w-3.5 h-3.5 shrink-0" />}
                <span>{r.label}</span>
              </li>
            ))}
          </ul>

          <button
            type="submit"
            disabled={isSubmitting || !policy.valid}
            className="w-full py-2.5 px-4 rounded-lg text-sm font-bold bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{isSubmitting ? 'Actualizando...' : 'Guardar nueva contraseña e ingresar'}</span>
          </button>
        </form>

        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleSendResetEmail}
            className="inline-flex items-center gap-1.5 text-teal-700 dark:text-teal-400 hover:underline font-semibold cursor-pointer"
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Enviar enlace por correo</span>
          </button>
          <button
            type="button"
            onClick={onCancelLogout}
            className="inline-flex items-center gap-1.5 text-rose-600 dark:text-rose-400 hover:underline font-semibold cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </div>
    </div>
  );
};
