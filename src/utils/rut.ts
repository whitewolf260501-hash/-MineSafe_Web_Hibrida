export interface RutValidationResult {
  valid: boolean;
  formatted?: string;
  body?: string;
  verifierDigit?: string;
  expectedVerifierDigit?: string;
  error?: string;
}

const PLACEHOLDER_RUTS = new Set(['', 'no registrado', 'sin rut', 'sin registro', 'n/a', 'na', '-']);

export function isPlaceholderRut(rawRut?: string | null): boolean {
  const normalized = String(rawRut ?? '').trim().toLowerCase();
  return PLACEHOLDER_RUTS.has(normalized);
}

/**
 * Calcula el dígito verificador de un RUT chileno usando el algoritmo Módulo 11:
 * 1. Lee los dígitos del cuerpo de derecha a izquierda.
 * 2. Multiplica cada dígito por la serie cíclica 2, 3, 4, 5, 6, 7, 2, 3...
 * 3. Suma todos los productos obtenidos.
 * 4. Calcula resto = suma % 11 y resultado = 11 - resto.
 * 5. Asigna DV: 11 -> '0', 10 -> 'K', 1..9 -> dígito directo.
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
      error: 'Formato de RUT inválido: no uses más de un guion.',
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
        error: 'Formato de RUT inválido: después del guion debe ir exactamente un dígito verificador (0-9 o K).',
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
        error: 'El RUT es demasiado corto. Ingresa el cuerpo numérico y su dígito verificador (ej: 18.321.654-3).',
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
      error: 'El cuerpo del RUT debe tener entre 6 y 9 dígitos numéricos válidos.',
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
      expectedVerifierDigit: expectedDv,
      error: `RUT inválido según Módulo 11: el dígito verificador "${dv}" no coincide con el calculado ("${expectedDv}").`,
    };
  }

  const normalizedBody = cleanBody.replace(/^0+(?=\d)/, '');
  return {
    valid: true,
    body: normalizedBody,
    verifierDigit: dv,
    expectedVerifierDigit: expectedDv,
    formatted: `${formatRutBodyWithDots(normalizedBody)}-${expectedDv}`,
  };
}

export function formatChileanRut(rawRut: string): string {
  const res = validateChileanRut(rawRut);
  return res.valid && res.formatted ? res.formatted : String(rawRut ?? '').trim();
}
