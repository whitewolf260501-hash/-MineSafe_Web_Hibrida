export interface DateRangeValidationResult {
  valid: boolean;
  error?: string;
  daySpan?: number;
}

/**
 * Devuelve la fecha local actual en formato YYYY-MM-DD (sin desfase UTC).
 */
export function getTodayIsoDate(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Valida un rango de fechas YYYY-MM-DD:
 * - No permite fechas futuras (salvo allowFuture: true).
 * - No permite fecha inicio > fecha término.
 * - Opcionalmente limita el máximo de días del rango.
 */
export function validateDateRange(
  startDate: string,
  endDate: string,
  options?: {
    maxDays?: number;
    allowFuture?: boolean;
    requireBoth?: boolean;
    allowEmpty?: boolean;
    todayIso?: string;
  }
): DateRangeValidationResult {
  const todayIso = options?.todayIso || getTodayIsoDate();
  const allowFuture = options?.allowFuture ?? false;
  const start = (startDate || '').trim();
  const end = (endDate || '').trim();

  if (options?.allowEmpty && !start && !end) {
    return { valid: true };
  }

  if ((options?.requireBoth || options?.allowEmpty === false) && (!start || !end)) {
    return {
      valid: false,
      error: 'Debes seleccionar fecha de inicio y fecha de término.',
    };
  }

  const isoRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (start && !isoRegex.test(start)) {
    return { valid: false, error: 'La fecha de inicio tiene un formato inválido.' };
  }
  if (end && !isoRegex.test(end)) {
    return { valid: false, error: 'La fecha de término tiene un formato inválido.' };
  }

  if (!allowFuture) {
    if (start && start > todayIso) {
      return {
        valid: false,
        error: `La fecha de inicio no puede ser futura (máximo hoy: ${todayIso}).`,
      };
    }
    if (end && end > todayIso) {
      return {
        valid: false,
        error: `La fecha de término no puede ser futura (máximo hoy: ${todayIso}).`,
      };
    }
  }

  if (start && end) {
    if (start > end) {
      return {
        valid: false,
        error: 'La fecha de inicio no puede ser posterior a la fecha de término.',
      };
    }
    const startMs = new Date(`${start}T00:00:00`).getTime();
    const endMs = new Date(`${end}T00:00:00`).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      return { valid: false, error: 'El rango de fechas seleccionado no es válido.' };
    }
    const daySpan = Math.floor((endMs - startMs) / (24 * 60 * 60 * 1000)) + 1;
    if (options?.maxDays && daySpan > options.maxDays) {
      return {
        valid: false,
        daySpan,
        error: `El rango seleccionado (${daySpan} días) supera el máximo permitido de ${options.maxDays} días. Acota las fechas para evitar truncamiento.`,
      };
    }
    return { valid: true, daySpan };
  }

  return { valid: true };
}
