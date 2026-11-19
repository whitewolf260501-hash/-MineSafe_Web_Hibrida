import React, { useState } from 'react';
import {
  X,
  Type,
  RotateCcw,
  Globe,
  Monitor,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Heading1,
  Heading2,
  AlignLeft,
  Tag,
} from 'lucide-react';
import { TypographySettings, UserProfile } from '../types';
import {
  clampTextScalePct,
  clampTitleScalePct,
  clampSubtitleScalePct,
  clampSmallTextScalePct,
} from '../services/firebase';
import { soundAlert } from '../services/audioAlert';

interface TypographyControlModalProps {
  currentUser: UserProfile;
  effectiveTypography: TypographySettings;
  globalTypography: TypographySettings;
  hasLocalOverride: boolean;
  onPreviewLive?: (next: TypographySettings | null) => void;
  onChangeLocal: (next: TypographySettings) => void;
  onResetToGlobal: () => void;
  onSaveGlobal?: (next: TypographySettings) => Promise<void>;
  onClose: () => void;
}

const TYPOGRAPHY_PRESETS: Array<{
  id: string;
  label: string;
  desc: string;
  values: TypographySettings;
}> = [
  {
    id: 'compact',
    label: 'Compacto',
    desc: 'Más datos en pantalla',
    values: {
      titleScalePct: 90,
      subtitleScalePct: 90,
      textScalePct: 90,
      smallTextScalePct: 90,
    },
  },
  {
    id: 'normal',
    label: 'Normal',
    desc: 'Escala 100% estándar',
    values: {
      titleScalePct: 100,
      subtitleScalePct: 100,
      textScalePct: 100,
      smallTextScalePct: 100,
    },
  },
  {
    id: 'large',
    label: 'Grande',
    desc: 'Lectura cómoda',
    values: {
      titleScalePct: 118,
      subtitleScalePct: 114,
      textScalePct: 112,
      smallTextScalePct: 114,
    },
  },
  {
    id: 'xlarge',
    label: 'Muy Grande',
    desc: 'Máxima legibilidad',
    values: {
      titleScalePct: 138,
      subtitleScalePct: 128,
      textScalePct: 124,
      smallTextScalePct: 128,
    },
  },
];

export const TypographyControlModal: React.FC<TypographyControlModalProps> = ({
  currentUser,
  effectiveTypography,
  globalTypography,
  hasLocalOverride,
  onPreviewLive,
  onChangeLocal,
  onResetToGlobal,
  onSaveGlobal,
  onClose,
}) => {
  const isSuperAdmin = currentUser.role === 'superadmin';
  const [draft, setDraft] = useState<TypographySettings>(effectiveTypography);
  const [applyMode, setApplyMode] = useState<'global' | 'local'>(isSuperAdmin ? 'global' : 'local');
  const [isSavingGlobal, setIsSavingGlobal] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const handleClose = () => {
    onPreviewLive?.(null);
    onClose();
  };

  const updateDraft = (patch: Partial<TypographySettings>) => {
    const next: TypographySettings = {
      titleScalePct: clampTitleScalePct(patch.titleScalePct ?? draft.titleScalePct),
      subtitleScalePct: clampSubtitleScalePct(patch.subtitleScalePct ?? draft.subtitleScalePct),
      textScalePct: clampTextScalePct(patch.textScalePct ?? draft.textScalePct),
      smallTextScalePct: clampSmallTextScalePct(patch.smallTextScalePct ?? draft.smallTextScalePct),
    };
    setDraft(next);
    setFeedback(null);
    // In SuperAdmin global mode, preview live without overwriting local browser preference;
    // in local mode (or for regular users), persist immediately in localStorage.
    if (isSuperAdmin && applyMode === 'global' && onPreviewLive) {
      onPreviewLive(next);
    } else {
      onPreviewLive?.(null);
      onChangeLocal(next);
    }
  };

  const handleSaveGlobalClick = async () => {
    if (!onSaveGlobal || !isSuperAdmin) return;
    setIsSavingGlobal(true);
    setFeedback(null);
    try {
      await onSaveGlobal(draft);
      soundAlert.playFeedbackBeep();
      setFeedback({
        tone: 'success',
        text: 'Tamaños de letra guardados globalmente en Firebase para toda la plataforma.',
      });
    } catch (err: any) {
      setFeedback({
        tone: 'error',
        text: err?.message || 'No se pudo guardar la configuración tipográfica global.',
      });
    } finally {
      setIsSavingGlobal(false);
    }
  };

  const handleResetAll = async () => {
    soundAlert.playFeedbackBeep();
    const neutral: TypographySettings = {
      titleScalePct: 100,
      subtitleScalePct: 100,
      textScalePct: 100,
      smallTextScalePct: 100,
    };
    setDraft(neutral);
    if (isSuperAdmin && applyMode === 'global' && onSaveGlobal) {
      onPreviewLive?.(neutral);
      setIsSavingGlobal(true);
      try {
        await onSaveGlobal(neutral);
        setFeedback({ tone: 'success', text: 'Tipografía global restablecida al 100%.' });
      } catch (err: any) {
        setFeedback({ tone: 'error', text: err?.message || 'Error al restablecer.' });
      } finally {
        setIsSavingGlobal(false);
      }
    } else {
      onChangeLocal(neutral);
      setFeedback({ tone: 'success', text: 'Tamaños restablecidos al 100%.' });
    }
  };

  const channels: Array<{
    key: keyof TypographySettings;
    label: string;
    description: string;
    min: number;
    max: number;
    step: number;
    basePx: number;
    accent: string;
    icon: React.ReactNode;
  }> = [
    {
      key: 'titleScalePct',
      label: 'Títulos Principales',
      description: 'Encabezados H1, H2 y títulos principales de cada vista y panel.',
      min: 75,
      max: 160,
      step: 2,
      basePx: 24,
      accent: 'text-cyan-400',
      icon: <Heading1 className="w-4 h-4 text-cyan-400 shrink-0" />,
    },
    {
      key: 'subtitleScalePct',
      label: 'Subtítulos y Secciones',
      description: 'Subtítulos descriptivos bajo encabezados, H3/H4 y títulos de tarjetas.',
      min: 75,
      max: 150,
      step: 2,
      basePx: 16,
      accent: 'text-purple-400',
      icon: <Heading2 className="w-4 h-4 text-purple-400 shrink-0" />,
    },
    {
      key: 'textScalePct',
      label: 'Textos en General',
      description: 'Párrafos, tablas, formularios, menús, botones, alertas y lecturas.',
      min: 85,
      max: 130,
      step: 1,
      basePx: 14,
      accent: 'text-emerald-400',
      icon: <AlignLeft className="w-4 h-4 text-emerald-400 shrink-0" />,
    },
    {
      key: 'smallTextScalePct',
      label: 'Etiquetas y Textos Pequeños',
      description: 'Badges, chips de estado, fechas, metadatos y columnas auxiliares.',
      min: 80,
      max: 140,
      step: 2,
      basePx: 11,
      accent: 'text-amber-400',
      icon: <Tag className="w-4 h-4 text-amber-400 shrink-0" />,
    },
  ];

  const isAllNeutral =
    draft.titleScalePct === 100 &&
    draft.subtitleScalePct === 100 &&
    draft.textScalePct === 100 &&
    draft.smallTextScalePct === 100;

  return (
    <div
      className="fixed inset-0 z-[85] flex justify-end bg-slate-950/50 backdrop-blur-[2px]"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-md h-full bg-slate-900 border-l border-slate-700/90 shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between gap-3 bg-slate-950/70">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-950/80 border border-emerald-700/70 flex items-center justify-center text-emerald-300 shrink-0">
              <Type className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="font-bold text-white block text-sm leading-tight">
                Ajuste de Tamaños de Letra
              </span>
              <span className="text-[11px] text-slate-400 block truncate">
                Títulos, subtítulos, textos generales y etiquetas en vivo
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Cerrar panel de tipografía"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Scope Selector for SuperAdmin */}
          {isSuperAdmin && onSaveGlobal && (
            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
              <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
                Alcance del Ajuste
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setApplyMode('global')}
                  className={`px-2.5 py-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    applyMode === 'global'
                      ? 'bg-emerald-600 text-white border-emerald-400'
                      : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5 shrink-0" />
                  <span>Toda la plataforma</span>
                </button>
                <button
                  type="button"
                  onClick={() => setApplyMode('local')}
                  className={`px-2.5 py-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    applyMode === 'local'
                      ? 'bg-cyan-600 text-white border-cyan-400'
                      : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5 shrink-0" />
                  <span>Solo mi pantalla</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                {applyMode === 'global'
                  ? 'Ves los cambios al instante en tu pantalla y al presionar "Guardar global" se aplican en Firebase a todos los usuarios.'
                  : 'Los cambios se guardan solo en tu navegador actual sin modificar los valores globales.'}
              </p>
            </div>
          )}

          {/* Presets rápidos */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-200 block">
              Presets Rápidos (Ajustan todo en armonía)
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {TYPOGRAPHY_PRESETS.map((preset) => {
                const isActive =
                  draft.titleScalePct === preset.values.titleScalePct &&
                  draft.subtitleScalePct === preset.values.subtitleScalePct &&
                  draft.textScalePct === preset.values.textScalePct &&
                  draft.smallTextScalePct === preset.values.smallTextScalePct;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      soundAlert.playFeedbackBeep();
                      updateDraft(preset.values);
                    }}
                    className={`px-2.5 py-2 rounded-xl border text-center transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-emerald-600 text-white border-emerald-400 shadow-sm'
                        : 'bg-slate-950/70 text-slate-300 border-slate-800 hover:border-emerald-700 hover:text-white'
                    }`}
                  >
                    <span className="block text-xs font-bold">{preset.label}</span>
                    <span className="block text-[10px] opacity-80 mt-0.5">
                      {preset.values.textScalePct}%
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4 Independent Sliders */}
          <div className="space-y-3">
            {channels.map((ch) => {
              const currentVal = draft[ch.key];
              const computedPx = (ch.basePx * (currentVal / 100)).toFixed(1);
              return (
                <div
                  key={ch.key}
                  className="p-3.5 rounded-xl bg-slate-950/75 border border-slate-800 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {ch.icon}
                      <div>
                        <span className="text-xs font-bold text-white block leading-tight">
                          {ch.label}
                        </span>
                        <span className="text-[11px] text-slate-400 block leading-snug mt-0.5">
                          {ch.description}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded bg-slate-900 border border-slate-700 font-mono text-[11px] font-bold shrink-0 ${ch.accent}`}
                    >
                      {currentVal}% ({computedPx}px)
                    </span>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={currentVal <= ch.min}
                      onClick={() => {
                        soundAlert.playFeedbackBeep();
                        updateDraft({ [ch.key]: currentVal - ch.step });
                      }}
                      className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 hover:bg-slate-800 font-bold text-xs disabled:opacity-40 shrink-0 cursor-pointer"
                      title={`Reducir ${ch.label}`}
                    >
                      A-
                    </button>
                    <input
                      type="range"
                      min={ch.min}
                      max={ch.max}
                      step={ch.step}
                      aria-label={`Ajustar tamaño de ${ch.label}`}
                      value={currentVal}
                      onChange={(e) => updateDraft({ [ch.key]: Number(e.target.value) })}
                      className="w-full accent-emerald-500 cursor-pointer"
                    />
                    <button
                      type="button"
                      disabled={currentVal >= ch.max}
                      onClick={() => {
                        soundAlert.playFeedbackBeep();
                        updateDraft({ [ch.key]: currentVal + ch.step });
                      }}
                      className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 hover:bg-slate-800 font-bold text-xs disabled:opacity-40 shrink-0 cursor-pointer"
                      title={`Aumentar ${ch.label}`}
                    >
                      A+
                    </button>
                    {currentVal !== 100 && (
                      <button
                        type="button"
                        onClick={() => {
                          soundAlert.playFeedbackBeep();
                          updateDraft({ [ch.key]: 100 });
                        }}
                        className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-cyan-300 hover:bg-slate-800 text-[10px] font-semibold shrink-0 cursor-pointer"
                      >
                        100%
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Live Typography Preview Card */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block">
              Vista Previa en Vivo
            </span>
            <h2 className="text-xl font-extrabold text-white leading-tight">
              Título de Sección MineSafe
            </h2>
            <p className="text-sm text-cyan-300 font-medium leading-snug">
              Subtítulo descriptivo de monitoreo ambiental y control operacional.
            </p>
            <p className="text-xs text-slate-300 leading-relaxed pt-1">
              Texto general de tablas, reportes, alertas y formularios del sistema de seguridad minera.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="px-2 py-0.5 rounded bg-emerald-950/70 border border-emerald-700/60 text-emerald-300 text-[10px] font-bold">
                ETIQUETA EN LÍNEA
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300 text-[11px] font-mono">
                MQ-2 · 184 ADC
              </span>
            </div>
          </div>

          {/* Feedback banner */}
          {feedback && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                feedback.tone === 'success'
                  ? 'bg-emerald-950/70 border-emerald-700 text-emerald-200'
                  : 'bg-rose-950/70 border-rose-700 text-rose-200'
              }`}
            >
              {feedback.tone === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              )}
              <span>{feedback.text}</span>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-950/80 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {!isAllNeutral && (
              <button
                type="button"
                onClick={handleResetAll}
                disabled={isSavingGlobal}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restablecer 100%</span>
              </button>
            )}
            {hasLocalOverride && !isSuperAdmin && (
              <button
                type="button"
                onClick={() => {
                  soundAlert.playFeedbackBeep();
                  onResetToGlobal();
                  setDraft(globalTypography);
                  setFeedback({
                    tone: 'success',
                    text: 'Se aplicó nuevamente la configuración tipográfica global.',
                  });
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold cursor-pointer"
              >
                Usar global
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {isSuperAdmin && applyMode === 'global' && onSaveGlobal && (
              <button
                type="button"
                onClick={handleSaveGlobalClick}
                disabled={isSavingGlobal}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                {isSavingGlobal && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{isSavingGlobal ? 'Guardando...' : 'Guardar global'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold cursor-pointer"
            >
              Listo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
