import React, { useState } from 'react';
import {
  X,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  Circle,
  Loader2,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';
import { UserProfile } from '../types';
import { validatePasswordPolicy } from '../utils/passwordPolicy';
import { changeAuthenticatedUserPassword } from '../services/firebase';
import { soundAlert } from '../services/audioAlert';

interface ChangePasswordModalProps {
  user: UserProfile;
  onClose: () => void;
  onPasswordChanged?: (updatedUser: UserProfile) => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  user,
  onClose,
  onPasswordChanged,
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const policy = validatePasswordPolicy(newPassword);
  const rules = [
    { ok: policy.checks.minLength, label: 'Al menos 8 caracteres' },
    { ok: policy.checks.hasUppercase, label: 'Al menos una letra mayúscula (A-Z)' },
    { ok: policy.checks.hasLowercase, label: 'Al menos una letra minúscula (a-z)' },
    { ok: policy.checks.hasNumber, label: 'Al menos un número (0-9)' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!currentPassword) {
      setErrorMessage('Ingresa tu contraseña actual para verificar tu identidad.');
      return;
    }
    if (!policy.valid) {
      setErrorMessage(policy.errors[0] || 'La nueva contraseña no cumple los requisitos mínimos.');
      return;
    }
    if (newPassword === currentPassword) {
      setErrorMessage('La nueva contraseña debe ser diferente a la contraseña actual.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('La nueva contraseña y su confirmación no coinciden.');
      return;
    }

    setIsSubmitting(true);
    try {
      const updated = await changeAuthenticatedUserPassword(currentPassword, newPassword, user);
      soundAlert.playFeedbackBeep();
      setSuccessMessage('Tu contraseña se actualizó correctamente.');
      onPasswordChanged?.(updated);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      soundAlert.playFeedbackBeep();
      setErrorMessage(err?.message || 'No fue posible cambiar tu contraseña.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-950 border border-cyan-700/70 text-cyan-300 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Cambiar mi Contraseña</h2>
              <p className="text-xs text-slate-400">{user.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal"
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-800 text-xs text-rose-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-700 text-xs text-emerald-200 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
            <span>{successMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <label htmlFor="chg-current-pass" className="block font-semibold text-slate-300 mb-1">
              Contraseña actual *
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                id="chg-current-pass"
                type={showCurrent ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Ingresa tu contraseña actual"
                className="w-full pl-9 pr-9 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              />
              <button
                type="button"
                onClick={() => setShowCurrent((prev) => !prev)}
                className="absolute right-2.5 top-2 text-slate-400 hover:text-white"
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="chg-new-pass" className="block font-semibold text-slate-300 mb-1">
              Nueva contraseña *
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                id="chg-new-pass"
                type={showNew ? 'text' : 'password'}
                required
                minLength={8}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Ej: MinaSegura2026"
                className="w-full pl-9 pr-9 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              />
              <button
                type="button"
                onClick={() => setShowNew((prev) => !prev)}
                className="absolute right-2.5 top-2 text-slate-400 hover:text-white"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="chg-confirm-pass" className="block font-semibold text-slate-300 mb-1">
              Confirmar nueva contraseña *
            </label>
            <input
              id="chg-confirm-pass"
              type={showNew ? 'text' : 'password'}
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repite tu nueva contraseña"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
            />
          </div>

          <ul className="space-y-1 bg-slate-950/70 border border-slate-800 rounded-xl p-3 text-[11px]">
            {rules.map((r) => (
              <li
                key={r.label}
                className={`flex items-center gap-2 ${
                  r.ok ? 'text-emerald-400 font-semibold' : 'text-slate-400'
                }`}
              >
                {r.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <Circle className="w-3.5 h-3.5 shrink-0" />}
                <span>{r.label}</span>
              </li>
            ))}
          </ul>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !policy.valid}
              className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{isSubmitting ? 'Actualizando...' : 'Guardar nueva contraseña'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
