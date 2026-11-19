export const CURRENT_PASSWORD_POLICY_VERSION = 2;
export const MIN_PASSWORD_LENGTH = 8;

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
  checks: {
    minLength: boolean;
    hasUppercase: boolean;
    hasLowercase: boolean;
    hasNumber: boolean;
  };
}

export function validatePasswordPolicy(password: string): PasswordValidationResult {
  const value = password || '';
  const checks = {
    minLength: value.length >= MIN_PASSWORD_LENGTH,
    hasUppercase: /[A-ZÁÉÍÓÚÑ]/.test(value),
    hasLowercase: /[a-záéíóúñ]/.test(value),
    hasNumber: /\d/.test(value),
  };

  const errors: string[] = [];
  if (!checks.minLength) {
    errors.push(`Debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  if (!checks.hasUppercase) {
    errors.push('Debe incluir al menos una letra mayúscula.');
  }
  if (!checks.hasLowercase) {
    errors.push('Debe incluir al menos una letra minúscula.');
  }
  if (!checks.hasNumber) {
    errors.push('Debe incluir al menos un número.');
  }

  return {
    valid: errors.length === 0,
    errors,
    checks,
  };
}

export function requiresPasswordResetForAccount(
  enteredPassword: string | null | undefined,
  profile?: { mustChangePassword?: boolean; passwordPolicyVersion?: number } | null
): { required: boolean; reason?: string } {
  if (profile?.mustChangePassword) {
    return {
      required: true,
      reason: 'Tu cuenta requiere restablecer su contraseña antes de continuar.',
    };
  }
  if (typeof enteredPassword === 'string' && enteredPassword.length > 0) {
    const check = validatePasswordPolicy(enteredPassword);
    if (!check.valid) {
      return {
        required: true,
        reason:
          'Tu contraseña actual no cumple la política de seguridad vigente (mínimo 8 caracteres, mayúscula, minúscula y número). Debes actualizarla ahora.',
      };
    }
  }
  return { required: false };
}
