export interface RutValidationResult {
  valid: boolean;
  formatted?: string;
  body?: string;
  verifierDigit?: string;
  error?: string;
}

const PLACEHOLDER_RUTS = new Set([
  '',
  'no registrado',
  'sin rut',
  'sin registro',
  'n/a',
  'na',
  '-',
]);

export function isPlaceholderRut(rawRut?: string | null): boolean {
  const normalized = String(rawRut ?? '').trim().toLowerCase();
  return PLACEHOLDER_RUTS.has(normalized);
}

/**
 * Calcula el dígito verificador de un RUT chileno usando el algoritmo Módulo 11.
 * Uso estrictamente interno para validación — nunca exponer el DV calculado al usuario final.
 */
export function computeRutVerifierDigit(bodyDigits: string): string {
  const cleanDigits = bodyDigits.replace(/\D/g, '');
  if (!cleanDigits) {
    throw new Error('El cuerpo del RUT debe contener al menos un dígito.');
  }

  let sum = 0;
  let multiplier = 2;

  for (let i = cleanDigits.length - 1; i >= 0; i--) {
    const digit = Number(cleanDigits[i]);
    sum += digit * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const remainder = sum % 11;
  const result = 11 - remainder;

  if (result === 11) return '0';
  if (result === 10) return 'K';
  return String(result);
}

export function formatRutBodyWithDots(bodyDigits: string): string {
  const clean = bodyDigits.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  return clean.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Formatea un RUT en tiempo real mientras el usuario escribe (ej: 12.345.678-9).
 * Elimina caracteres inválidos y limita el largo a 9 dígitos de cuerpo + 1 DV.
 */
export function formatRutLive(rawInput: string): string {
  const cleaned = String(rawInput ?? '')
    .toUpperCase()
    .replace(/[^0-9K]/g, '');

  if (!cleaned) return '';
  if (cleaned.length === 1) return cleaned;

  const limited = cleaned.slice(0, 10);
  const bodyRaw = limited.slice(0, -1).replace(/K/g, '');
  const dvRaw = limited.slice(-1);

  if (!bodyRaw) return dvRaw;
  return `${formatRutBodyWithDots(bodyRaw)}-${dvRaw}`;
}

export function validateChileanRut(rawRut: string): RutValidationResult {
  const trimmed = String(rawRut ?? '').trim();
  if (!trimmed) {
    return { valid: false, error: 'El RUT es obligatorio.' };
  }

  if (/[^0-9kK.\-\s]/.test(trimmed)) {
    return {
      valid: false,
      error: 'El RUT solo puede contener dígitos, puntos, guion y dígito verificador (0-9 o K).',
    };
  }

  const withoutSpaces = trimmed.replace(/\s+/g, '');
  const hyphenCount = (withoutSpaces.match(/-/g) || []).length;
  if (hyphenCount > 1) {
    return {
      valid: false,
      error: 'Formato de RUT inválido: utiliza solo un guion antes del dígito verificador.',
    };
  }

  let bodyRaw = '';
  let dvRaw = '';

  if (hyphenCount === 1) {
    const parts = withoutSpaces.split('-');
    bodyRaw = parts[0];
    dvRaw = parts[1];
    if (!dvRaw || dvRaw.length !== 1) {
      return {
        valid: false,
        error: 'Formato de RUT inválido: ingresa el formato XX.XXX.XXX-X.',
      };
    }
    if (/[kK]/.test(bodyRaw)) {
      return {
        valid: false,
        error: 'La letra K solo puede aparecer como dígito verificador al final del RUT.',
      };
    }
  } else {
    const compact = withoutSpaces.replace(/\./g, '');
    if (compact.length < 2) {
      return {
        valid: false,
        error: 'El RUT está incompleto. Ingresa el número completo con su dígito verificador (ej: 18.321.654-3).',
      };
    }
    bodyRaw = compact.slice(0, -1);
    dvRaw = compact.slice(-1);
  }

  const cleanBody = bodyRaw.replace(/\./g, '');
  const dv = dvRaw.toUpperCase();

  if (!/^\d{6,9}$/.test(cleanBody) || Number(cleanBody) <= 0) {
    return {
      valid: false,
      error: 'El RUT debe contener entre 6 y 9 dígitos numéricos antes del dígito verificador.',
    };
  }

  // Rechazar secuencias repetidas artificiales (ej: 11.111.111-1, 22.222.222-2)
  if (/^(\d)\1+$/.test(cleanBody)) {
    return {
      valid: false,
      error: 'El RUT ingresado no es válido. Verifica los dígitos ingresados.',
    };
  }

  if (!/^[0-9K]$/.test(dv)) {
    return {
      valid: false,
      error: 'El dígito verificador debe ser un número del 0 al 9 o la letra K.',
    };
  }

  const expectedDv = computeRutVerifierDigit(cleanBody);
  if (dv !== expectedDv) {
    return {
      valid: false,
      body: cleanBody,
      verifierDigit: dv,
      error: 'El RUT ingresado no es válido según validación Módulo 11. Verifica los dígitos ingresados.',
    };
  }

  const normalizedBody = cleanBody.replace(/^0+(?=\d)/, '');
  return {
    valid: true,
    body: normalizedBody,
    verifierDigit: dv,
    formatted: `${formatRutBodyWithDots(normalizedBody)}-${dv}`,
  };
}

export function formatChileanRut(rawRut: string): string {
  const res = validateChileanRut(rawRut);
  return res.valid && res.formatted ? res.formatted : String(rawRut ?? '').trim();
}

export interface EmergencyPhoneValidationResult {
  valid: boolean;
  formatted?: string;
  error?: string;
}

/**
 * Valida un número telefónico de emergencia (chileno +56 9 XXXX XXXX o internacional 8-15 dígitos).
 * Rechaza nombres o texto arbitrario en el campo telefónico.
 */
export function validateEmergencyPhone(rawPhone: string): EmergencyPhoneValidationResult {
  const trimmed = String(rawPhone ?? '').trim();
  if (!trimmed) {
    return { valid: false, error: 'El teléfono de emergencia es obligatorio.' };
  }
  if (/[a-zA-Z]/.test(trimmed)) {
    return {
      valid: false,
      error: 'Ingresa solo el número telefónico (sin letras ni nombres). Ej: +56 9 8765 4321.',
    };
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) {
    return {
      valid: false,
      error: 'El teléfono debe tener entre 8 y 15 dígitos (ej: +56 9 8765 4321).',
    };
  }

  // Formato chileno estándar: +56 9 XXXX XXXX o 9 XXXX XXXX
  if (digits.length === 9 && digits.startsWith('9')) {
    return {
      valid: true,
      formatted: `+56 ${digits[0]} ${digits.slice(1, 5)} ${digits.slice(5)}`,
    };
  }
  if (digits.length === 11 && digits.startsWith('569')) {
    return {
      valid: true,
      formatted: `+56 9 ${digits.slice(3, 7)} ${digits.slice(7)}`,
    };
  }
  if (digits.length === 10 && digits.startsWith('56')) {
    return {
      valid: true,
      formatted: `+56 ${digits.slice(2, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`,
    };
  }

  return {
    valid: true,
    formatted: trimmed.startsWith('+') ? `+${digits}` : `+${digits}`,
  };
}
