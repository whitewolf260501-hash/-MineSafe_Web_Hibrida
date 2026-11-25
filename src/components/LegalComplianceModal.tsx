import React, { useState } from 'react';
import {
  Shield,
  Scale,
  FileText,
  AlertTriangle,
  CheckCircle2,
  X,
  Lock,
  Clock,
  LogOut,
  RefreshCw,
} from 'lucide-react';
import {
  CURRENT_LEGAL_CONSENT_VERSION,
  DATA_RETENTION_POLICY,
  DS132_DS594_NORMATIVE_LIMITS,
} from '../utils/securityCompliance';

export type LegalDocumentTab = 'privacidad' | 'terminos' | 'ciberseguridad' | 'normativa_minera';

interface LegalComplianceModalProps {
  isOpen: boolean;
  initialTab?: LegalDocumentTab;
  onClose: () => void;
  theme?: 'dark' | 'light';
}

export const LegalComplianceModal: React.FC<LegalComplianceModalProps> = ({
  isOpen,
  initialTab = 'privacidad',
  onClose,
  theme = 'dark',
}) => {
  const [activeTab, setActiveTab] = useState<LegalDocumentTab>(initialTab);
  const isLight = theme === 'light';

  React.useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const tabs: { id: LegalDocumentTab; label: string; icon: React.ReactNode }[] = [
    { id: 'privacidad', label: 'Privacidad (Ley 19.628 / 21.719)', icon: <Lock className="w-4 h-4" /> },
    { id: 'terminos', label: 'Términos de Uso', icon: <FileText className="w-4 h-4" /> },
    { id: 'ciberseguridad', label: 'Ciberseguridad (Ley 21.663 / 21.459)', icon: <Shield className="w-4 h-4" /> },
    { id: 'normativa_minera', label: 'DS 132 / DS 594', icon: <Scale className="w-4 h-4" /> },
  ];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-modal-title"
    >
      <div
        className={`w-full max-w-4xl max-h-[88vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${
          isLight
            ? 'bg-white border-slate-200 text-slate-900'
            : 'bg-slate-900 border-slate-700/80 text-slate-100'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-b ${
            isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950/60'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h2 id="legal-modal-title" className="text-lg font-bold">
                Marco Legal, Privacidad y Cumplimiento Normativo
              </h2>
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                MineSafe IoT · Versión vigente v{CURRENT_LEGAL_CONSENT_VERSION} · Legislación de la República de Chile
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ventana legal"
            className={`p-2 rounded-lg transition-colors ${
              isLight ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-slate-800 text-slate-400'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div
          className={`flex flex-wrap gap-1.5 px-6 py-3 border-b ${
            isLight ? 'border-slate-200 bg-white' : 'border-slate-800 bg-slate-900'
          }`}
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all border ${
                activeTab === t.id
                  ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/40'
                  : isLight
                  ? 'bg-slate-100 text-slate-600 border-transparent hover:bg-slate-200'
                  : 'bg-slate-800/70 text-slate-300 border-slate-700/60 hover:bg-slate-800'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 text-sm leading-relaxed">
          {activeTab === 'privacidad' && (
            <>
              <div>
                <h3 className="text-base font-bold mb-2">
                  Política de Privacidad y Tratamiento de Datos Personales
                </h3>
                <p className={isLight ? 'text-slate-600' : 'text-slate-300'}>
                  MineSafe IoT trata los datos personales de trabajadores, supervisores y administradores en
                  estricto cumplimiento de la <strong>Ley N° 19.628</strong> sobre Protección de la Vida Privada y
                  las disposiciones de la <strong>Nueva Ley N° 21.719</strong> de Protección de Datos Personales de
                  Chile, aplicando principios de licitud, finalidad específica, proporcionalidad, seguridad y
                  responsabilidad proactiva.
                </p>
              </div>

              <div
                className={`p-4 rounded-xl border space-y-2 ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/50 border-slate-700/70'
                }`}
              >
                <h4 className="font-bold text-cyan-400 text-xs uppercase tracking-wider">
                  1. Datos Recopilados y Finalidad Exclusiva
                </h4>
                <ul className="list-disc pl-5 space-y-1 text-xs">
                  <li>
                    <strong>Identificación operacional:</strong> nombre completo, correo corporativo, RUT chileno,
                    rol, turno, faena, cuadrilla y dispositivo IoT asignado.
                  </li>
                  <li>
                    <strong>Finalidad:</strong> gestionar la seguridad laboral minera, emitir alertas ambientales
                    en tiempo real, documentar emergencias y cumplir fiscalizaciones de Sernageomin y MINSAL. No
                    se comercializan ni ceden datos a terceros ajenos a la operación.
                  </li>
                  <li>
                    <strong>Minimización y enmascaramiento:</strong> el RUT y el correo electrónico se muestran
                    enmascarados por defecto; su desbloqueo está restringido por rol y queda registrado en la
                    bitácora inmutable de auditoría.
                  </li>
                </ul>
              </div>

              <div
                className={`p-4 rounded-xl border space-y-2 ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/50 border-slate-700/70'
                }`}
              >
                <h4 className="font-bold text-cyan-400 text-xs uppercase tracking-wider">
                  2. Derechos ARCOP de los Titulares
                </h4>
                <p className="text-xs">
                  Todo titular puede ejercer sus derechos de <strong>Acceso, Rectificación, Cancelación
                  (Supresión/Anonimización), Oposición y Portabilidad</strong> directamente desde su sesión
                  (descarga JSON de portabilidad) o solicitándolo al Administrador de Empresa / Delegado de
                  Protección de Datos en <strong>minesafe99@gmail.com</strong>. Al ejecutar una cancelación,
                  los identificadores personales se anonimizan de forma irreversible preservando la trazabilidad
                  obligatoria de seguridad minera (DS 132).
                </p>
              </div>

              <div>
                <h4 className="font-bold text-xs uppercase tracking-wider text-cyan-400 mb-2">
                  3. Tabla de Plazos de Retención Diferenciada
                </h4>
                <div className="overflow-x-auto rounded-xl border border-slate-700/60">
                  <table className="w-full text-left text-xs">
                    <thead className={isLight ? 'bg-slate-100 text-slate-700' : 'bg-slate-800 text-slate-300'}>
                      <tr>
                        <th className="px-3 py-2 font-semibold">Categoría de Dato</th>
                        <th className="px-3 py-2 font-semibold">Base Normativa</th>
                        <th className="px-3 py-2 font-semibold">Retención</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/40">
                      {DATA_RETENTION_POLICY.map((item) => (
                        <tr key={item.category}>
                          <td className="px-3 py-2 font-medium">{item.category}</td>
                          <td className="px-3 py-2 opacity-80">{item.legalBasis}</td>
                          <td className="px-3 py-2 opacity-90">{item.retentionPeriod}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {activeTab === 'terminos' && (
            <>
              <div>
                <h3 className="text-base font-bold mb-2">Términos y Condiciones de Uso de la Plataforma</h3>
                <p className={isLight ? 'text-slate-600' : 'text-slate-300'}>
                  El acceso y operación de MineSafe IoT está destinado exclusivamente a empresas mineras,
                  contratistas y personal debidamente autorizado para el monitoreo ambiental subterráneo y gestión
                  de seguridad industrial.
                </p>
              </div>
              <ul className="list-disc pl-5 space-y-2 text-xs">
                <li>
                  <strong>Cuentas personales e intransferibles:</strong> cada usuario es responsable de resguardar
                  sus credenciales y cumplir la política de contraseñas robustas. Queda prohibido compartir cuentas.
                </li>
                <li>
                  <strong>Cierre automático por inactividad:</strong> por seguridad operacional (ISO/IEC 27001),
                  toda sesión inactiva durante 15 minutos se cerrará automáticamente previa alerta de 60 segundos.
                </li>
                <li>
                  <strong>Soporte a la decisión operacional:</strong> la plataforma complementa, y en ningún caso
                  reemplaza, los instrumentos personales certificados de medición de gases, los planes de
                  emergencia ni los protocolos presenciales exigidos por Sernageomin.
                </li>
                <li>
                  <strong>Integridad de reportes:</strong> los reportes exportados incluyen folio único y sello
                  criptográfico SHA-256 para acreditar que no fueron alterados tras su emisión.
                </li>
              </ul>
            </>
          )}

          {activeTab === 'ciberseguridad' && (
            <>
              <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-bold text-amber-300">
                    Aviso Legal de Sistema Monitoreado y Acceso Restringido
                  </p>
                  <p className={isLight ? 'text-slate-700' : 'text-slate-200'}>
                    Este sistema es de uso estrictamente autorizado. Todo acceso, desbloqueo de datos sensibles,
                    modificación de umbrales o comando de alarma queda registrado en bitácora inmutable. El acceso
                    ilícito, interferencia o sabotaje informático constituye delito sancionado por la{' '}
                    <strong>Ley N° 21.459</strong> sobre Delitos Informáticos.
                  </p>
                </div>
              </div>

              <div className="space-y-3 text-xs">
                <h4 className="font-bold text-cyan-400 uppercase tracking-wider">
                  Alineación con Ley Marco de Ciberseguridad (Ley N° 21.663) e ISO/IEC 27001
                </h4>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>
                    <strong>Control de acceso y defensa contra fuerza bruta:</strong> bloqueo progresivo tras
                    intentos fallidos consecutivos, autenticación verificada, segregación multi-empresa y cierre
                    por inactividad.
                  </li>
                  <li>
                    <strong>Protección de ingesta IoT (IEC 62443 / OWASP ASVS):</strong> el endpoint de ingesta
                    exige token de dispositivo verificado en tiempo constante, validación estricta de rangos y
                    limitación de tasa (rate limiting) por dispositivo e IP.
                  </li>
                  <li>
                    <strong>Gestión de incidentes y alerta temprana CSIRT (3 horas):</strong> los administradores
                    cuentan con módulo dedicado para documentar incidentes de ciberseguridad, clasificar su impacto
                    y controlar el plazo legal de notificación temprana al CSIRT Nacional de Chile.
                  </li>
                </ul>
              </div>
            </>
          )}

          {activeTab === 'normativa_minera' && (
            <>
              <div>
                <h3 className="text-base font-bold mb-2">
                  Referencia Normativa Minera y Ambiental (DS 132 y DS 594)
                </h3>
                <p className={`text-xs ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                  Los umbrales de referencia y reportes de MineSafe IoT se estructuran en apoyo al cumplimiento del{' '}
                  <strong>Decreto Supremo N° 132</strong> (Reglamento de Seguridad Minera, Sernageomin) y del{' '}
                  <strong>Decreto Supremo N° 594</strong> (Condiciones Sanitarias y Ambientales Básicas en los
                  Lugares de Trabajo, MINSAL).
                </p>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-700/60">
                <table className="w-full text-left text-xs">
                  <thead className={isLight ? 'bg-slate-100 text-slate-700' : 'bg-slate-800 text-slate-300'}>
                    <tr>
                      <th className="px-3 py-2 font-semibold">Variable</th>
                      <th className="px-3 py-2 font-semibold">Referencia DS 594</th>
                      <th className="px-3 py-2 font-semibold">Contexto DS 132</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/40">
                    {DS132_DS594_NORMATIVE_LIMITS.map((row) => (
                      <tr key={row.variable}>
                        <td className="px-3 py-2 font-semibold whitespace-nowrap">{row.variable}</td>
                        <td className="px-3 py-2">{row.ds594Limit}</td>
                        <td className="px-3 py-2 opacity-85">{row.ds132Context}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div
          className={`flex items-center justify-between px-6 py-3.5 border-t text-xs ${
            isLight ? 'border-slate-200 bg-slate-50 text-slate-500' : 'border-slate-800 bg-slate-950/60 text-slate-400'
          }`}
        >
          <span>Contacto de Privacidad y Seguridad: minesafe99@gmail.com</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold transition-colors"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};

interface LegalConsentGateModalProps {
  isOpen: boolean;
  userName: string;
  userEmail: string;
  submitting: boolean;
  error?: string | null;
  onAccept: () => void;
  onOpenLegalDoc: (tab: LegalDocumentTab) => void;
  onLogout: () => void;
}

export const LegalConsentGateModal: React.FC<LegalConsentGateModalProps> = ({
  isOpen,
  userName,
  userEmail,
  submitting,
  error,
  onAccept,
  onOpenLegalDoc,
  onLogout,
}) => {
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [acceptedSecurity, setAcceptedSecurity] = useState(false);

  if (!isOpen) return null;

  const canSubmit = acceptedPrivacy && acceptedSecurity && !submitting;

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-gate-title"
    >
      <div className="w-full max-w-xl rounded-2xl border border-cyan-500/30 bg-slate-900 text-slate-100 shadow-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-800 bg-slate-950/70 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
            <Scale className="w-6 h-6" />
          </div>
          <div>
            <h2 id="consent-gate-title" className="text-lg font-bold">
              Consentimiento Informado y Uso Autorizado
            </h2>
            <p className="text-xs text-slate-400">
              Versión legal v{CURRENT_LEGAL_CONSENT_VERSION} · Ley 19.628 / Ley 21.719 / Ley 21.663
            </p>
          </div>
        </div>

        <div className="p-6 space-y-4 text-sm">
          <p className="text-slate-300 text-xs leading-relaxed">
            Hola <strong className="text-white">{userName}</strong> ({userEmail}). Antes de ingresar al panel
            operacional de MineSafe IoT, confirma tu conocimiento y aceptación de nuestras políticas vigentes de
            protección de datos personales y seguridad informática.
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onOpenLegalDoc('privacidad')}
              className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 font-medium"
            >
              Leer Política de Privacidad
            </button>
            <button
              type="button"
              onClick={() => onOpenLegalDoc('terminos')}
              className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 font-medium"
            >
              Leer Términos de Uso
            </button>
            <button
              type="button"
              onClick={() => onOpenLegalDoc('ciberseguridad')}
              className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 font-medium"
            >
              Aviso Ley 21.459 / 21.663
            </button>
          </div>

          <div className="space-y-3 pt-1">
            <label className="flex items-start gap-3 p-3 rounded-xl bg-slate-800/60 border border-slate-700/70 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptedPrivacy}
                onChange={(e) => setAcceptedPrivacy(e.target.checked)}
                className="mt-0.5 rounded border-slate-600 text-cyan-500 focus:ring-cyan-500"
              />
              <span className="text-xs text-slate-200 leading-relaxed">
                He leído y acepto la <strong>Política de Privacidad</strong> y los{' '}
                <strong>Términos y Condiciones</strong> (Ley 19.628 y Nueva Ley 21.719), incluyendo el tratamiento
                de mis datos operacionales para seguridad minera y mis derechos ARCOP.
              </span>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-xl bg-slate-800/60 border border-slate-700/70 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptedSecurity}
                onChange={(e) => setAcceptedSecurity(e.target.checked)}
                className="mt-0.5 rounded border-slate-600 text-cyan-500 focus:ring-cyan-500"
              />
              <span className="text-xs text-slate-200 leading-relaxed">
                Comprendo que este es un <strong>sistema monitoreado y auditado</strong> bajo la Ley 21.459 y Ley
                21.663, con cierre automático tras 15 minutos de inactividad y registro inmutable de acciones
                críticas.
              </span>
            </label>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700"
            >
              <LogOut className="w-4 h-4" />
              Cerrar Sesión
            </button>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={onAccept}
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                canSubmit
                  ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-500/20'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              {submitting ? 'Registrando aceptación...' : 'Aceptar y Continuar al Panel'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface InactivityWarningModalProps {
  isOpen: boolean;
  secondsRemaining: number;
  onStayActive: () => void;
  onLogoutNow: () => void;
}

export const InactivityWarningModal: React.FC<InactivityWarningModalProps> = ({
  isOpen,
  secondsRemaining,
  onStayActive,
  onLogoutNow,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="inactivity-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-amber-500/40 bg-slate-900 text-slate-100 shadow-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <h2 id="inactivity-modal-title" className="text-base font-bold text-white">
              Sesión por expirar por inactividad
            </h2>
            <p className="text-xs text-slate-400">Política de seguridad ISO/IEC 27001 (15 min)</p>
          </div>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          No se ha detectado actividad reciente en el panel. Para proteger los datos operacionales y personales, tu
          sesión se cerrará automáticamente en:
        </p>

        <div className="text-center py-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
          <span className="text-3xl font-black font-mono text-amber-400">
            {Math.max(0, secondsRemaining)}s
          </span>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-1">
          <button
            type="button"
            onClick={onLogoutNow}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700"
          >
            <LogOut className="w-3.5 h-3.5" />
            Cerrar sesión ahora
          </button>
          <button
            type="button"
            onClick={onStayActive}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-lg shadow-cyan-500/20"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Mantener sesión activa
          </button>
        </div>
      </div>
    </div>
  );
};
