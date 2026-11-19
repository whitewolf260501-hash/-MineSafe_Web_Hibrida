import React from 'react';
import { formatRutLive, isPlaceholderRut, validateChileanRut } from '../utils/rut';

interface RutInputProps {
  value: string;
  onChange: (formattedValue: string) => void;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  allowEmpty?: boolean;
  ariaLabel?: string;
}

/**
 * Campo estandarizado de RUT chileno para toda la plataforma MineSafe.
 * - Formatea en vivo como XX.XXX.XXX-X.
 * - Valida con Módulo 11 sin revelar nunca el dígito verificador calculado.
 */
export const RutInput: React.FC<RutInputProps> = ({
  value,
  onChange,
  id,
  required = false,
  disabled = false,
  placeholder = 'Ej: 18.321.654-3',
  className = '',
  allowEmpty = false,
  ariaLabel = 'RUT chileno',
}) => {
  const trimmed = value.trim();
  const hasContent = trimmed.length > 0 && !(allowEmpty && isPlaceholderRut(trimmed));
  const check = hasContent ? validateChileanRut(trimmed) : null;

  const borderClass = hasContent
    ? check?.valid
      ? 'border-emerald-500/70 focus:border-emerald-400'
      : 'border-rose-500/80 focus:border-rose-400'
    : 'border-slate-700 focus:border-cyan-500';

  return (
    <div>
      <input
        id={id}
        type="text"
        inputMode="text"
        autoComplete="off"
        maxLength={13}
        required={required}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={hasContent && check ? !check.valid : undefined}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(formatRutLive(e.target.value))}
        onBlur={() => {
          if (!value.trim()) return;
          const res = validateChileanRut(value);
          if (res.valid && res.formatted) {
            onChange(res.formatted);
          }
        }}
        className={`w-full px-3 py-2 bg-slate-950 border rounded-lg text-white font-mono focus:outline-none ${borderClass} ${className}`}
      />
      {hasContent && check && (
        <p className={`mt-1 text-[10px] ${check.valid ? 'text-emerald-400' : 'text-rose-400'}`}>
          {check.valid
            ? `✓ RUT válido (${check.formatted})`
            : `✗ ${check.error || 'RUT inválido. Verifica los dígitos y el dígito verificador.'}`}
        </p>
      )}
    </div>
  );
};
