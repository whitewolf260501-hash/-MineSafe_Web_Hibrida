import { UserRole } from '../types';
import { isAnyAdminRole, isGlobalMineSafeAdmin } from './accessControl';
import { isPlaceholderRut } from './rut';

/**
 * Permisos de desbloqueo de datos sensibles (PII):
 * - RUT completo: exclusivo de SuperAdmin y Admin Corporativo MineSafe.
 * - Correo completo: SuperAdmin, Admin Corporativo MineSafe y Administrador de Empresa.
 */
export function canUnmaskRut(role?: UserRole | null): boolean {
  return isGlobalMineSafeAdmin(role);
}

export function canUnmaskEmail(role?: UserRole | null): boolean {
  return isAnyAdminRole(role);
}

/**
 * Enmascara un RUT chileno dejando visibles únicamente los últimos 4 dígitos/caracteres
 * (incluyendo el dígito verificador), preservando puntos y guion para lectura clara.
 * Ejemplos:
 *  - "20.776.701-8" -> "**.***.701-8"
 *  - "18.901.234-5" -> "**.***.234-5"
 *  - "7.654.321-K"  -> "*.***.321-K"
 *  - "189012345"    -> "*****2345"
 */
export function maskRut(rawRut?: string | null): string {
  const trimmed = String(rawRut ?? '').trim();
  if (!trimmed || isPlaceholderRut(trimmed)) {
    return trimmed || 'No registrado';
  }

  const chars = Array.from(trimmed);
  const alnumIndices: number[] = [];
  for (let i = 0; i < chars.length; i++) {
    if (/[0-9kK]/.test(chars[i])) {
      alnumIndices.push(i);
    }
  }

  if (alnumIndices.length === 0) {
    return trimmed;
  }

  // Si tiene 4 o menos caracteres alfanuméricos, ocultar todos para no exponer el valor completo
  const visibleCount = alnumIndices.length <= 4 ? 0 : 4;
  const keepFromPosition = alnumIndices.length - visibleCount;

  const masked = [...chars];
  for (let idx = 0; idx < keepFromPosition; idx++) {
    masked[alnumIndices[idx]] = '*';
  }

  return masked.join('');
}

/**
 * Enmascara un correo electrónico mostrando solo el sufijo final del usuario (máx. 4 caracteres
 * cuando el usuario tiene largo suficiente) y ocultando el dominio principal antes del TLD.
 * Ejemplos:
 *  - "manuelcrisostomo2605@gmail.com" -> "******2605@*****.com"
 *  - "lmunoz@empresa.cl"              -> "**unoz@*******.cl"
 *  - "ana@empresa.cl"                 -> "*na@*******.cl"
 *  - "a@aa.cl"                        -> "*@**.cl"
 */
export function maskEmail(rawEmail?: string | null): string {
  const trimmed = String(rawEmail ?? '').trim();
  if (!trimmed) {
    return 'Sin correo';
  }

  const atIndex = trimmed.indexOf('@');
  if (atIndex === -1) {
    if (trimmed.length <= 4) {
      return '*'.repeat(trimmed.length);
    }
    return `${'*'.repeat(Math.min(trimmed.length - 4, 6))}${trimmed.slice(-4)}`;
  }

  const localPart = trimmed.slice(0, atIndex);
  const domainPart = trimmed.slice(atIndex + 1);

  let maskedLocal: string;
  if (localPart.length <= 2) {
    maskedLocal = '*'.repeat(Math.max(localPart.length, 1));
  } else if (localPart.length <= 5) {
    const visibleTail = localPart.slice(-2);
    maskedLocal = `${'*'.repeat(localPart.length - 2)}${visibleTail}`;
  } else {
    const visibleTail = localPart.slice(-4);
    const hiddenStars = Math.min(Math.max(localPart.length - 4, 2), 6);
    maskedLocal = `${'*'.repeat(hiddenStars)}${visibleTail}`;
  }

  const lastDot = domainPart.lastIndexOf('.');
  let maskedDomain: string;
  if (lastDot > 0) {
    const domainName = domainPart.slice(0, lastDot);
    const tld = domainPart.slice(lastDot); // incluye el punto, ej: ".cl" o ".com"
    const domainStars = Math.min(Math.max(domainName.length, 2), 7);
    maskedDomain = `${'*'.repeat(domainStars)}${tld}`;
  } else {
    maskedDomain = '*'.repeat(Math.min(Math.max(domainPart.length, 2), 6));
  }

  return `${maskedLocal}@${maskedDomain}`;
}

/**
 * Devuelve el RUT completo solo si está explícitamente desbloqueado Y el rol tiene permiso
 * (SuperAdmin o Admin Corporativo MineSafe). En caso contrario devuelve siempre el RUT enmascarado.
 */
export function formatRutForViewer(
  rawRut?: string | null,
  viewerRole?: UserRole | null,
  isUnlocked = false
): string {
  const trimmed = String(rawRut ?? '').trim();
  if (!trimmed || isPlaceholderRut(trimmed)) {
    return trimmed || 'No registrado';
  }
  if (isUnlocked && canUnmaskRut(viewerRole)) {
    return trimmed;
  }
  return maskRut(trimmed);
}

/**
 * Devuelve el correo completo solo si está explícitamente desbloqueado Y el rol tiene permiso
 * (SuperAdmin, Admin Corporativo MineSafe o Administrador de Empresa).
 */
export function formatEmailForViewer(
  rawEmail?: string | null,
  viewerRole?: UserRole | null,
  isUnlocked = false
): string {
  const trimmed = String(rawEmail ?? '').trim();
  if (!trimmed) {
    return 'Sin correo';
  }
  if (isUnlocked && canUnmaskEmail(viewerRole)) {
    return trimmed;
  }
  return maskEmail(trimmed);
}
