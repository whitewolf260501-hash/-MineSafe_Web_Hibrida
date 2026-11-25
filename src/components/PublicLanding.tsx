import React, { useState, useEffect, useRef } from 'react';
import {
  Menu,
  X,
  ArrowRight,
  Radio,
  Router,
  Monitor,
  Activity,
  Thermometer,
  Droplets,
  Bell,
  Mail,
  Send,
  CheckCircle2,
  AlertCircle,
  Lock,
  Users,
  Camera,
  ChevronRight,
  LogIn,
  Sun,
  Moon,
  ShieldCheck,
} from 'lucide-react';
import {
  validateContactForm,
  buildContactMailtoHref,
  ContactFormPayload,
} from '../utils/contactValidation';
import nodeSensorsPhoto from '../assets/device-node-sensors.jpg';
import gatewayDevicePhoto from '../assets/device-gateway.jpg';
import mineDeploymentPhoto from '../assets/device-mine-deployment.jpg';
import architecturePlanPhoto from '../assets/device-architecture-plan.jpg';
import { LegalComplianceModal, LegalDocumentTab } from './LegalComplianceModal';

export interface TeamMemberSlot {
  id: string;
  name: string;
  role: string;
  bio?: string;
  photoUrl?: string;
}

/**
 * Fotografías del equipo industrial MineSafe y despliegue en galería incorporadas
 * para exhibición pública oficial en la portada de MineSafe.
 */
export const APPROVED_MEDIA = {
  heroPrototypePhotoUrl: mineDeploymentPhoto as string,
  nodePhotoUrl: nodeSensorsPhoto as string,
  gatewayPhotoUrl: gatewayDevicePhoto as string,
  architecturePlanPhotoUrl: architecturePlanPhoto as string,
};

export const APPROVED_TEAM_MEMBERS: TeamMemberSlot[] = [];

interface PublicLandingProps {
  onGoToLogin: () => void;
  onGoToPanel?: () => void;
  isAuthenticated?: boolean;
  authenticatedUserName?: string;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
}

const OFFICIAL_CONTACT_EMAIL = (import.meta.env.VITE_PUBLIC_CONTACT_EMAIL || 'minesafe99@gmail.com').trim();
const OFFICIAL_CONTACT_ENDPOINT = (import.meta.env.VITE_PUBLIC_CONTACT_ENDPOINT || '').trim();

const NAV_ITEMS = [
  { id: 'inicio', label: 'Inicio' },
  { id: 'producto', label: 'Nuestro producto' },
  { id: 'como-funciona', label: 'Cómo funciona' },
  { id: 'quienes-somos', label: 'Quiénes somos' },
  { id: 'contacto', label: 'Contacto' },
];

export const PublicLanding: React.FC<PublicLandingProps> = ({
  onGoToLogin,
  onGoToPanel,
  isAuthenticated = false,
  authenticatedUserName,
  theme = 'dark',
  onToggleTheme,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [legalModalTab, setLegalModalTab] = useState<LegalDocumentTab | null>(null);
  const [formState, setFormState] = useState<ContactFormPayload>({
    name: '',
    organization: '',
    email: '',
    message: '',
    website: '',
  });
  const [formErrors, setFormErrors] = useState<
    Partial<Record<'name' | 'organization' | 'email' | 'message' | 'form', string>>
  >({});
  const [submitStatus, setSubmitStatus] = useState<{
    type: 'success' | 'info' | 'error';
    text: string;
  } | null>(null);
  const [isSendingContact, setIsSendingContact] = useState(false);
  const [lightboxMedia, setLightboxMedia] = useState<{ src: string; alt: string; caption: string } | null>(null);
  const lastSentRef = useRef<number>(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (lightboxMedia) {
          setLightboxMedia(null);
        } else if (mobileMenuOpen) {
          setMobileMenuOpen(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen, lightboxMedia]);

  const scrollToSection = (sectionId: string) => {
    setMobileMenuOpen(false);
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const hasOfficialChannel = Boolean(OFFICIAL_CONTACT_EMAIL || OFFICIAL_CONTACT_ENDPOINT);
  const directMailtoHref = OFFICIAL_CONTACT_EMAIL
    ? buildContactMailtoHref(OFFICIAL_CONTACT_EMAIL)
    : '';

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitStatus(null);

    const validation = validateContactForm(formState, lastSentRef.current);
    setFormErrors(validation.errors);
    if (!validation.valid) return;

    if (!hasOfficialChannel) {
      setSubmitStatus({
        type: 'info',
        text: 'El correo oficial de contacto aún está pendiente de confirmación por el equipo. No se registró ningún envío.',
      });
      return;
    }

    if (OFFICIAL_CONTACT_ENDPOINT) {
      setIsSendingContact(true);
      try {
        const response = await fetch(OFFICIAL_CONTACT_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            name: formState.name.trim(),
            organization: formState.organization.trim(),
            email: formState.email.trim(),
            message: formState.message.trim(),
          }),
        });
        if (!response.ok) {
          throw new Error('No fue posible entregar la solicitud al canal configurado.');
        }
        lastSentRef.current = Date.now();
        setFormState({ name: '', organization: '', email: '', message: '', website: '' });
        setFormErrors({});
        setSubmitStatus({
          type: 'success',
          text: 'Consulta enviada correctamente al equipo de MineSafe.',
        });
      } catch (err: any) {
        setSubmitStatus({
          type: 'error',
          text:
            err?.message ||
            'Ocurrió un error al enviar el mensaje. Intenta nuevamente o utiliza el enlace de correo directo.',
        });
      } finally {
        setIsSendingContact(false);
      }
      return;
    }

    const composedHref = buildContactMailtoHref(OFFICIAL_CONTACT_EMAIL, formState);
    if (composedHref) {
      lastSentRef.current = Date.now();
      window.location.href = composedHref;
      setSubmitStatus({
        type: 'info',
        text: `Se abrirá tu cliente de correo para enviar la consulta a ${OFFICIAL_CONTACT_EMAIL}.`,
      });
    }
  };

  const focusRing =
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#14B8A6] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0F172A]';
  const lightFocusRing =
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488] focus-visible:ring-offset-2 focus-visible:ring-offset-white';

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#090f1d] text-[#0F172A] dark:text-slate-100 flex flex-col font-sans selection:bg-[#0D9488] selection:text-[#FFFFFF] transition-colors">
      {/* Saltar al contenido principal (accesibilidad teclado) */}
      <a
        href="#inicio"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-[#0F172A] focus:text-[#FFFFFF] focus:ring-2 focus:ring-[#14B8A6] text-sm font-semibold"
      >
        Ir al contenido principal
      </a>

      {/* ================================================================
          ENCABEZADO (AZUL GRAFITO + ACENTO TURQUESA)
         ================================================================ */}
      <header className="sticky top-0 z-50 bg-[#131E31]/95 backdrop-blur-md border-b border-[#253349] text-[#F8FAFC] shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="h-16 flex items-center justify-between gap-4">
            {/* Logotipo MineSafe */}
            <a
              href="#inicio"
              onClick={(e) => {
                e.preventDefault();
                scrollToSection('inicio');
              }}
              className={`flex items-center gap-2.5 rounded-lg py-1 pr-2 ${focusRing}`}
            >
              <span
                aria-hidden="true"
                className="w-9 h-9 rounded-lg bg-[#0D9488] flex items-center justify-center text-[#FFFFFF] shadow-sm shrink-0"
              >
                <Radio className="w-5 h-5" />
              </span>
              <span className="text-lg font-extrabold tracking-tight text-[#F8FAFC]">
                Mine<span className="text-[#2DD4BF]">Safe</span>
              </span>
            </a>

            {/* Navegación Desktop */}
            <nav aria-label="Navegación principal" className="hidden lg:flex items-center gap-1">
              {NAV_ITEMS.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection(item.id);
                  }}
                  className={`px-3 py-2 text-sm font-medium text-[#CBD5E1] hover:text-[#FFFFFF] hover:bg-[#1E293B] rounded-lg transition-colors whitespace-nowrap ${focusRing}`}
                >
                  {item.label}
                </a>
              ))}
            </nav>

            {/* Acciones Desktop */}
            <div className="hidden md:flex items-center gap-2.5 shrink-0">
              {onToggleTheme && (
                <button
                  type="button"
                  onClick={onToggleTheme}
                  title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                  aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-[#334155] bg-[#1E293B] hover:bg-[#334155] text-[#E2E8F0] transition-colors cursor-pointer ${focusRing}`}
                >
                  {theme === 'dark' ? (
                    <>
                      <Sun className="w-4 h-4 text-amber-400" />
                      <span>Claro</span>
                    </>
                  ) : (
                    <>
                      <Moon className="w-4 h-4 text-[#2DD4BF]" />
                      <span>Oscuro</span>
                    </>
                  )}
                </button>
              )}
              {isAuthenticated && onGoToPanel ? (
                <button
                  type="button"
                  onClick={onGoToPanel}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-[#0D9488] hover:bg-[#0F766E] text-[#FFFFFF] transition-colors cursor-pointer ${focusRing}`}
                >
                  <LogIn className="w-4 h-4" />
                  <span>Ir al panel{authenticatedUserName ? ` (${authenticatedUserName.split(' ')[0]})` : ''}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onGoToLogin}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-[#0D9488] hover:bg-[#0F766E] text-[#FFFFFF] transition-colors shadow-sm cursor-pointer ${focusRing}`}
                >
                  <Lock className="w-4 h-4" />
                  <span>Iniciar sesión</span>
                </button>
              )}
            </div>

            {/* Botones Móvil */}
            <div className="flex md:hidden items-center gap-2">
              {onToggleTheme && (
                <button
                  type="button"
                  onClick={onToggleTheme}
                  aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                  className={`p-2 rounded-lg text-[#CBD5E1] hover:text-[#FFFFFF] hover:bg-[#1E293B] border border-[#334155] ${focusRing}`}
                >
                  {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-[#2DD4BF]" />}
                </button>
              )}
              <button
                type="button"
                onClick={isAuthenticated && onGoToPanel ? onGoToPanel : onGoToLogin}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#0D9488] hover:bg-[#0F766E] text-[#FFFFFF] transition-colors ${focusRing}`}
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{isAuthenticated && onGoToPanel ? 'Ir al panel' : 'Iniciar sesión'}</span>
              </button>
              <button
                type="button"
                aria-expanded={mobileMenuOpen}
                aria-controls="public-mobile-nav"
                aria-label={mobileMenuOpen ? 'Cerrar menú de navegación' : 'Abrir menú de navegación'}
                onClick={() => setMobileMenuOpen((prev) => !prev)}
                className={`p-2 rounded-lg text-[#CBD5E1] hover:text-[#FFFFFF] hover:bg-[#1E293B] ${focusRing}`}
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Menú Móvil Desplegable */}
        {mobileMenuOpen && (
          <nav
            id="public-mobile-nav"
            aria-label="Navegación móvil"
            className="lg:hidden bg-[#0F172A] border-t border-[#253349] px-4 py-3 space-y-1"
          >
            {NAV_ITEMS.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  scrollToSection(item.id);
                }}
                className={`block px-3 py-2.5 rounded-lg text-sm font-medium text-[#E2E8F0] hover:bg-[#1E293B] hover:text-[#2DD4BF] transition-colors ${focusRing}`}
              >
                {item.label}
              </a>
            ))}
          </nav>
        )}
      </header>

      <main className="flex-1">
        {/* ================================================================
            SECCIÓN PRINCIPAL (HERO)
           ================================================================ */}
        <section
          id="inicio"
          className="bg-gradient-to-b from-[#131E31] via-[#17253B] to-[#1E2E46] text-[#F8FAFC] border-b border-[#253349]"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 lg:py-24">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
              {/* Mensaje principal y acciones (primero en móvil y columna izquierda en escritorio) */}
              <div className="lg:col-span-6 space-y-6">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2DD4BF]">
                  Seguridad Minera Industrial · Chile
                </p>

                <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-extrabold tracking-tight leading-[1.12] text-[#FFFFFF]">
                  MineSafe — Monitoreo ambiental IoT para operaciones mineras
                </h1>

                <p className="text-base sm:text-lg text-[#CBD5E1] leading-relaxed max-w-xl">
                  MineSafe integra equipamiento industrial de telemetría ambiental, umbrales configurables y gestión centralizada de alertas en una plataforma empresarial para equipos de faena.
                </p>

                <div className="flex flex-col sm:flex-row sm:items-center gap-3.5 pt-2">
                  <button
                    type="button"
                    onClick={() => scrollToSection('contacto')}
                    className={`inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold bg-[#0D9488] hover:bg-[#0F766E] text-[#FFFFFF] transition-colors shadow-sm cursor-pointer ${focusRing}`}
                  >
                    <span>Contactar a MineSafe</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <a
                    href="#producto"
                    onClick={(e) => {
                      e.preventDefault();
                      scrollToSection('producto');
                    }}
                    className={`inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-sm font-semibold border border-[#334155] bg-[#1E293B]/60 hover:bg-[#1E293B] text-[#E2E8F0] transition-colors ${focusRing}`}
                  >
                    <span>Conocer el producto</span>
                  </a>
                </div>
              </div>

              {/* Espacio visual del equipamiento industrial (debajo en móvil, derecha en escritorio) */}
              <div className="lg:col-span-6">
                <div className="rounded-2xl border border-[#2C3E57] bg-[#0F172A]/90 p-5 sm:p-6 shadow-xl space-y-4">
                  {APPROVED_MEDIA.heroPrototypePhotoUrl ? (
                    <figure className="space-y-2.5">
                      <button
                        type="button"
                        onClick={() =>
                          setLightboxMedia({
                            src: APPROVED_MEDIA.heroPrototypePhotoUrl,
                            alt: 'Despliegue del equipo MineSafe en galería subterránea con nodos a 0 m, 50 m y 100 m y gateway con antena',
                            caption: 'Despliegue subterráneo de nodos ambientales y gateway MineSafe en galería (puntos a 0 m, 50 m y 100 m).',
                          })
                        }
                        className={`block w-full text-left rounded-xl overflow-hidden border border-[#253349] hover:border-[#2DD4BF]/60 transition-colors cursor-zoom-in ${focusRing}`}
                        title="Ampliar fotografía del despliegue"
                      >
                        <img
                          src={APPROVED_MEDIA.heroPrototypePhotoUrl}
                          alt="Despliegue del equipo MineSafe en galería subterránea con nodos a 0 m, 50 m y 100 m y gateway con antena"
                          className="w-full aspect-[16/10] object-cover"
                        />
                      </button>
                      <figcaption className="text-xs text-[#94A3B8]">
                        Despliegue en galería subterránea: estación de monitoreo y gateway con antena en cabecera (0 m) y nodos distribuidos a 50 m y 100 m.
                      </figcaption>
                    </figure>
                  ) : (
                    <div className="rounded-xl border border-dashed border-[#334155] bg-[#131E31] aspect-[16/10] flex flex-col items-center justify-center p-6 text-center">
                      <div className="w-12 h-12 rounded-xl bg-[#0D9488]/15 border border-[#0D9488]/40 text-[#2DD4BF] flex items-center justify-center mb-3">
                        <Camera className="w-6 h-6" />
                      </div>
                      <p className="text-sm font-semibold text-[#F8FAFC]">
                        Equipamiento industrial MineSafe
                      </p>
                      <p className="text-xs text-[#94A3B8] mt-1.5 max-w-sm leading-relaxed">
                        Fotografía oficial del equipo ambiental y gateway en operación minera.
                      </p>
                    </div>
                  )}

                  {/* Resumen de demostración ilustrativo (sin identificadores ni faenas reales) */}
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="rounded-xl bg-[#162235] border border-[#253349] p-3.5">
                      <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                        <span>Temperatura (demo)</span>
                        <Thermometer className="w-4 h-4 text-[#2DD4BF]" />
                      </div>
                      <p className="mt-1.5 text-xl font-bold font-mono text-[#FFFFFF] tabular-nums">
                        22.4 °C
                      </p>
                    </div>
                    <div className="rounded-xl bg-[#162235] border border-[#253349] p-3.5">
                      <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                        <span>Humedad relativa (demo)</span>
                        <Droplets className="w-4 h-4 text-[#2DD4BF]" />
                      </div>
                      <p className="mt-1.5 text-xl font-bold font-mono text-[#FFFFFF] tabular-nums">
                        48 %
                      </p>
                    </div>
                  </div>
                  <p className="text-[11px] text-[#94A3B8]">
                    Valores ilustrativos de demostración para mostrar el formato de lectura ambiental.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================================================================
            NUESTRO PRODUCTO
           ================================================================ */}
        <section id="producto" className="py-16 sm:py-20 bg-[#F8FAFC] dark:bg-[#0b1220] border-b border-[#E2E8F0] dark:border-slate-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl mb-12">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0F766E] dark:text-[#2DD4BF]">
                Nuestro producto
              </p>
              <h2 className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-[#0F172A] dark:text-white">
                Solución integral de hardware industrial y plataforma web
              </h2>
              <p className="mt-3 text-base text-[#475569] dark:text-slate-300 leading-relaxed">
                Cada componente cumple una función clave dentro del sistema MineSafe: capturar variables del entorno en galería, concentrar su transmisión y habilitar el monitoreo continuo para los equipos autorizados.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* 01. Nodo ambiental */}
              <article className="lg:col-span-6 bg-[#FFFFFF] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-6 sm:p-7 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-4 mb-5">
                    <span className="text-xs font-mono font-bold text-[#0F766E] dark:text-[#2DD4BF] tracking-widest">
                      01 · CAPTURA EN TERRENO
                    </span>
                    <div className="w-10 h-10 rounded-xl bg-[#F0FDFA] dark:bg-teal-950/60 border border-[#99F6E4] dark:border-teal-800 text-[#0F766E] dark:text-[#2DD4BF] flex items-center justify-center">
                      <Radio className="w-5 h-5" />
                    </div>
                  </div>
                  <h3 className="text-xl font-bold text-[#0F172A] dark:text-white">Nodo Ambiental MineSafe</h3>
                  <p className="mt-2.5 text-sm sm:text-base text-[#475569] dark:text-slate-300 leading-relaxed">
                    Equipo compacto de monitoreo ambiental diseñado para medir gases, material particulado, temperatura y humedad directamente en frentes de trabajo.
                  </p>
                </div>

                <div className="mt-6">
                  {APPROVED_MEDIA.nodePhotoUrl ? (
                    <figure className="space-y-2">
                      <button
                        type="button"
                        onClick={() =>
                          setLightboxMedia({
                            src: APPROVED_MEDIA.nodePhotoUrl,
                            alt: 'Nodo ambiental MineSafe montado en roca con pantalla TFT, sensor de gas MQ-2, módulo PM2.5 y sensor DHT11',
                            caption: 'Nodo ambiental MineSafe: pantalla TFT 1.8", sensor de gases MQ-2 (superior), cámara óptica de polvo PM2.5 (centro) y módulo de temperatura/humedad DHT11 (inferior).',
                          })
                        }
                        className={`block w-full text-left rounded-xl overflow-hidden border border-[#E2E8F0] hover:border-[#0D9488] transition-colors cursor-zoom-in ${lightFocusRing}`}
                        title="Ampliar fotografía del nodo y sus sensores"
                      >
                        <img
                          src={APPROVED_MEDIA.nodePhotoUrl}
                          alt="Nodo ambiental MineSafe montado en roca con pantalla TFT, sensor de gas MQ-2, módulo PM2.5 y sensor DHT11"
                          className="w-full h-60 object-cover object-center"
                        />
                      </button>
                      <figcaption className="text-xs text-[#64748B] leading-relaxed">
                        Carcasa con pantalla TFT 1.8&quot; y sensores integrados en el lateral: gas MQ-2 (superior), polvo óptico PM2.5 (centro) y temperatura/humedad DHT11 (inferior).
                      </figcaption>
                    </figure>
                  ) : (
                    <div className="rounded-xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-4 flex items-center gap-3 text-xs text-[#64748B]">
                      <Camera className="w-4 h-4 text-[#0F766E] shrink-0" />
                      <span>Espacio preparado para fotografía autorizada del nodo sensor físico.</span>
                    </div>
                  )}
                </div>
              </article>

              {/* 02. Gateway */}
              <article className="lg:col-span-6 bg-[#FFFFFF] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-6 sm:p-7 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-4 mb-5">
                    <span className="text-xs font-mono font-bold text-[#0F766E] dark:text-[#2DD4BF] tracking-widest">
                      02 · CONCENTRACIÓN Y ENVÍO
                    </span>
                    <div className="w-10 h-10 rounded-xl bg-[#F0FDFA] dark:bg-teal-950/60 border border-[#99F6E4] dark:border-teal-800 text-[#0F766E] dark:text-[#2DD4BF] flex items-center justify-center">
                      <Router className="w-5 h-5" />
                    </div>
                  </div>
                  <h3 className="text-xl font-bold text-[#0F172A] dark:text-white">Gateway Concentrador</h3>
                  <p className="mt-2.5 text-sm sm:text-base text-[#475569] dark:text-slate-300 leading-relaxed">
                    Unidad concentradora encargada de enlazar múltiples nodos de sector, transmitir telemetría hacia la nube y propagar comandos de alarma sonora y lumínica en terreno.
                  </p>
                </div>

                <div className="mt-6">
                  {APPROVED_MEDIA.gatewayPhotoUrl ? (
                    <figure className="space-y-2">
                      <button
                        type="button"
                        onClick={() =>
                          setLightboxMedia({
                            src: APPROVED_MEDIA.gatewayPhotoUrl,
                            alt: 'Gateway concentrador MineSafe con antena externa, pantalla TFT y módulo ESP32-C3 montado en galería subterránea',
                            caption: 'Gateway MineSafe (ESP32-C3 + ESP-NOW) con antena externa, pantalla TFT de estado, puerto de programación e interruptor lateral montado en galería.',
                          })
                        }
                        className={`block w-full text-left rounded-xl overflow-hidden border border-[#E2E8F0] hover:border-[#0D9488] transition-colors cursor-zoom-in ${lightFocusRing}`}
                        title="Ampliar fotografía del gateway MineSafe"
                      >
                        <img
                          src={APPROVED_MEDIA.gatewayPhotoUrl}
                          alt="Gateway concentrador MineSafe con antena externa, pantalla TFT y módulo ESP32-C3 montado en galería subterránea"
                          className="w-full h-60 object-cover object-center"
                        />
                      </button>
                      <figcaption className="text-xs text-[#64748B] leading-relaxed">
                        Carcasa física del Gateway (ESP32-C3 / ESP-NOW) con antena superior, pantalla TFT de estado, puerto lateral e interruptor de encendido.
                      </figcaption>
                    </figure>
                  ) : (
                    <div className="rounded-xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-4 flex items-center gap-3 text-xs text-[#64748B]">
                      <Camera className="w-4 h-4 text-[#0F766E] shrink-0" />
                      <span>Espacio preparado para fotografía autorizada del gateway de enlace.</span>
                    </div>
                  )}
                </div>
              </article>

              {/* 03. Plataforma web */}
              <article className="lg:col-span-12 bg-[#FFFFFF] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                <div className="lg:col-span-5 space-y-3">
                  <span className="text-xs font-mono font-bold text-[#0F766E] dark:text-[#2DD4BF] tracking-widest block">
                    03 · CONSULTA Y SEGUIMIENTO
                  </span>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#F0FDFA] dark:bg-teal-950/60 border border-[#99F6E4] dark:border-teal-800 text-[#0F766E] dark:text-[#2DD4BF] flex items-center justify-center shrink-0">
                      <Monitor className="w-5 h-5" />
                    </div>
                    <h3 className="text-xl font-bold text-[#0F172A] dark:text-white">Plataforma Web Empresarial</h3>
                  </div>
                  <p className="text-sm sm:text-base text-[#475569] dark:text-slate-300 leading-relaxed">
                    Sistema centralizado para supervisar sectores, gestionar cuadrillas, configurar umbrales críticos y auditar cada evento de seguridad con trazabilidad completa.
                  </p>
                  <ul className="pt-2 space-y-2 text-sm text-[#334155] dark:text-slate-300">
                    <li className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-[#0D9488] dark:text-[#2DD4BF] shrink-0" />
                      <span>Visualización en tiempo real de variables ambientales por sector</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-[#0D9488] dark:text-[#2DD4BF] shrink-0" />
                      <span>Configuración de umbrales, alertas tempranas y bitácora auditable</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Lock className="w-4 h-4 text-[#0D9488] dark:text-[#2DD4BF] shrink-0" />
                      <span>Control de acceso multiempresa por rol operativo y jerarquía</span>
                    </li>
                  </ul>
                </div>

                {/* Captura de demostración explícitamente identificada (Temperatura y Humedad, sin PII/IPs) */}
                <div className="lg:col-span-7">
                  <div className="rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-950 p-4 sm:p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] dark:border-slate-800 pb-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-[#0F766E] dark:text-[#2DD4BF]">
                          Vista de demostración · Temperatura y Humedad
                        </p>
                        <p className="text-[11px] text-[#64748B] dark:text-slate-400">
                          Datos ilustrativos de ejemplo (sin nombres personales, faenas reales ni identificadores internos)
                        </p>
                      </div>
                      <span className="text-xs font-mono font-semibold text-[#0F766E] dark:text-teal-300 bg-[#CCFBF1] dark:bg-teal-950/70 px-2.5 py-1 rounded-md">
                        Estado de ejemplo: Estable
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div className="bg-[#FFFFFF] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-xl p-4">
                        <div className="flex items-center justify-between text-xs font-semibold text-[#475569] dark:text-slate-300">
                          <span>Temperatura ambiente</span>
                          <Thermometer className="w-4 h-4 text-[#0D9488] dark:text-[#2DD4BF]" />
                        </div>
                        <p className="mt-2 text-2xl font-extrabold font-mono text-[#0F172A] dark:text-white tabular-nums">
                          22.4 °C
                        </p>
                        <p className="mt-1 text-xs text-[#64748B] dark:text-slate-400">
                          Umbral preventivo de ejemplo: 28.0 °C
                        </p>
                      </div>

                      <div className="bg-[#FFFFFF] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-xl p-4">
                        <div className="flex items-center justify-between text-xs font-semibold text-[#475569] dark:text-slate-300">
                          <span>Humedad relativa</span>
                          <Droplets className="w-4 h-4 text-[#0D9488] dark:text-[#2DD4BF]" />
                        </div>
                        <p className="mt-2 text-2xl font-extrabold font-mono text-[#0F172A] dark:text-white tabular-nums">
                          48 %
                        </p>
                        <p className="mt-1 text-xs text-[#64748B] dark:text-slate-400">
                          Umbral preventivo de ejemplo: 75 %
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* ================================================================
            CÓMO FUNCIONA
           ================================================================ */}
        <section id="como-funciona" className="py-16 sm:py-20 bg-[#FFFFFF] dark:bg-[#090f1d] border-b border-[#E2E8F0] dark:border-slate-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl mb-12">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0F766E] dark:text-[#2DD4BF]">
                Cómo funciona
              </p>
              <h2 className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-[#0F172A] dark:text-white">
                Recorrido de la lectura desde el nodo hasta la consulta web
              </h2>
              <p className="mt-3 text-base text-[#475569] dark:text-slate-300 leading-relaxed">
                El nodo toma la lectura. El gateway la envía. La plataforma muestra el estado del sector y permite coordinar alertas en tiempo real.
              </p>
            </div>

            <ol
              aria-label="Flujo de arquitectura MineSafe"
              className="grid grid-cols-1 md:grid-cols-4 gap-4 relative"
            >
              {[
                {
                  step: '01',
                  title: 'Nodo ambiental',
                  desc: 'Captura las señales ambientales en el punto de monitoreo mediante sus sensores.',
                  icon: <Radio className="w-5 h-5" />,
                },
                {
                  step: '02',
                  title: 'Gateway',
                  desc: 'Concentra las lecturas recibidas desde el nodo y las transmite hacia el servicio en la nube.',
                  icon: <Router className="w-5 h-5" />,
                },
                {
                  step: '03',
                  title: 'Plataforma web',
                  desc: 'Recibe la información de forma autenticada, evalúa umbrales y actualiza el estado operativo.',
                  icon: <Monitor className="w-5 h-5" />,
                },
                {
                  step: '04',
                  title: 'Consulta de lecturas y eventos',
                  desc: 'El equipo autorizado revisa valores recientes, eventos registrados y estado del dispositivo.',
                  icon: <Activity className="w-5 h-5" />,
                },
              ].map((item, idx, arr) => (
                <li
                  key={item.step}
                  className="relative bg-[#F8FAFC] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-xs font-mono font-bold text-[#0F766E] dark:text-[#2DD4BF]">{item.step}</span>
                      <span className="w-9 h-9 rounded-lg bg-[#FFFFFF] dark:bg-slate-950 border border-[#E2E8F0] dark:border-slate-800 text-[#0D9488] dark:text-[#2DD4BF] flex items-center justify-center">
                        {item.icon}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-[#0F172A] dark:text-white">{item.title}</h3>
                    <p className="mt-2 text-sm text-[#475569] dark:text-slate-300 leading-relaxed">{item.desc}</p>
                  </div>

                  {idx < arr.length - 1 && (
                    <div
                      aria-hidden="true"
                      className="hidden md:flex items-center justify-center absolute -right-3 top-1/2 -translate-y-1/2 z-10 w-6 h-6 rounded-full bg-[#FFFFFF] dark:bg-slate-800 border border-[#CBD5E1] dark:border-slate-700 text-[#0D9488] dark:text-[#2DD4BF]"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  )}
                </li>
              ))}
            </ol>

            {/* Plan operativo y despliegue en todos los sectores (superficie y subterráneo) */}
            {APPROVED_MEDIA.architecturePlanPhotoUrl && (
              <div className="mt-10 rounded-2xl border border-[#E2E8F0] bg-[#0F172A] p-5 sm:p-7 shadow-lg text-[#F8FAFC]">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-5">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#2DD4BF]">
                      Plan operativo en faena
                    </p>
                    <h3 className="mt-1 text-xl sm:text-2xl font-bold text-[#FFFFFF]">
                      Arquitectura de cobertura integral en superficie y sectores subterráneos
                    </h3>
                    <p className="mt-1.5 text-sm text-[#CBD5E1] max-w-3xl leading-relaxed">
                      Despliegue proyectado en malla inalámbrica ESP-NOW cada 50 metros conectando los nodos ambientales de superficie y galerías con gateways hacia la plataforma web y sistema de alertas.
                    </p>
                  </div>
                  <span className="text-xs font-mono font-semibold text-[#2DD4BF] bg-[#131E31] border border-[#253349] px-3 py-1.5 rounded-lg self-start md:self-auto shrink-0">
                    Clic en la imagen para ampliar
                  </span>
                </div>

                <figure className="space-y-3">
                  <button
                    type="button"
                    onClick={() =>
                      setLightboxMedia({
                        src: APPROVED_MEDIA.architecturePlanPhotoUrl,
                        alt: 'Arquitectura general y plan operativo MineSafe con despliegue de nodos cada 50 metros en superficie y sectores subterráneos conectados a gateways, Firebase y plataforma web',
                        caption: 'MineSafe — Arquitectura general y plan operativo: red en malla ESP-NOW entre nodos cada 50 m en superficie y niveles subterráneos, gateways, Firebase y plataforma de alertas.',
                      })
                    }
                    className={`block w-full text-left rounded-xl overflow-hidden border border-[#253349] hover:border-[#2DD4BF]/60 transition-colors cursor-zoom-in ${focusRing}`}
                    title="Ampliar diagrama de arquitectura y plan operativo"
                  >
                    <img
                      src={APPROVED_MEDIA.architecturePlanPhotoUrl}
                      alt="Arquitectura general y plan operativo MineSafe con despliegue de nodos cada 50 metros en superficie y sectores subterráneos conectados a gateways, Firebase y plataforma web"
                      className="w-full h-auto object-cover"
                    />
                  </button>
                  <figcaption className="text-xs text-[#94A3B8] leading-relaxed">
                    Esquema operativo multisector: nodos ambientales interconectados (~50 m) con enrutamiento redundante hacia gateways en superficie y niveles subterráneos, transmisión en tiempo real y alertas tempranas.
                  </figcaption>
                </figure>
              </div>
            )}
          </div>
        </section>

        {/* ================================================================
            QUIÉNES SOMOS
           ================================================================ */}
        <section id="quienes-somos" className="py-16 sm:py-20 bg-[#F8FAFC] dark:bg-[#0b1220] border-b border-[#E2E8F0] dark:border-slate-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
              <div className="lg:col-span-6 space-y-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0F766E] dark:text-[#2DD4BF]">
                  Quiénes somos
                </p>
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#0F172A] dark:text-white">
                  Tecnología chilena especializada en seguridad ambiental minera
                </h2>
                <p className="text-base text-[#334155] dark:text-slate-300 leading-relaxed">
                  MineSafe es una empresa de tecnología industrial enfocada en elevar los estándares de seguridad operacional en la minería chilena. Diseñamos e integramos equipamiento IoT robusto y software de monitoreo continuo para proteger cuadrillas en superficie y galerías subterráneas.
                </p>
              </div>

              <div className="lg:col-span-6">
                {APPROVED_TEAM_MEMBERS.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {APPROVED_TEAM_MEMBERS.map((member) => (
                      <div
                        key={member.id}
                        className="bg-[#FFFFFF] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-xl p-4 flex items-start gap-3"
                      >
                        {member.photoUrl ? (
                          <img
                            src={member.photoUrl}
                            alt={member.name}
                            className="w-12 h-12 rounded-lg object-cover shrink-0 border border-[#E2E8F0] dark:border-slate-700"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-[#F0FDFA] dark:bg-teal-950 text-[#0F766E] dark:text-[#2DD4BF] flex items-center justify-center font-bold shrink-0">
                            {member.name.charAt(0)}
                          </div>
                        )}
                        <div>
                          <h3 className="text-sm font-bold text-[#0F172A] dark:text-white">{member.name}</h3>
                          <p className="text-xs font-semibold text-[#0F766E] dark:text-[#2DD4BF]">{member.role}</p>
                          {member.bio && <p className="text-xs text-[#475569] dark:text-slate-400 mt-1">{member.bio}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-[#FFFFFF] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-6 space-y-4">
                    <div className="flex items-center gap-2.5 text-[#0F172A] dark:text-white font-bold text-sm">
                      <ShieldCheck className="w-5 h-5 text-[#0D9488] dark:text-[#2DD4BF]" />
                      <span>Compromiso operacional en faena</span>
                    </div>
                    <p className="text-sm text-[#475569] dark:text-slate-300 leading-relaxed">
                      Acompañamos a empresas mineras en todo el ciclo de implementación: despliegue de hardware en terreno, configuración de jerarquías de faena y cuadrillas, soporte técnico continuo y trazabilidad auditable de incidentes ambientales.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs">
                      <div className="p-3 rounded-xl bg-[#F8FAFC] dark:bg-slate-950 border border-[#E2E8F0] dark:border-slate-800">
                        <p className="font-bold text-[#0F172A] dark:text-white">Despliegue en terreno</p>
                        <p className="text-[#64748B] dark:text-slate-400 mt-0.5">Nodos y gateways listos para galerías y superficie.</p>
                      </div>
                      <div className="p-3 rounded-xl bg-[#F8FAFC] dark:bg-slate-950 border border-[#E2E8F0] dark:border-slate-800">
                        <p className="font-bold text-[#0F172A] dark:text-white">Soporte corporativo</p>
                        <p className="text-[#64748B] dark:text-slate-400 mt-0.5">Gestión multiempresa con control de acceso por rol.</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ================================================================
            CONTACTO
           ================================================================ */}
        <section id="contacto" className="py-16 sm:py-20 bg-[#FFFFFF] dark:bg-[#090f1d]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
              <div className="lg:col-span-5 space-y-5">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0F766E] dark:text-[#2DD4BF]">
                  Contacto
                </p>
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#0F172A] dark:text-white">
                  Conversa con el equipo comercial y técnico de MineSafe
                </h2>
                <p className="text-base text-[#475569] dark:text-slate-300 leading-relaxed">
                  ¿Deseas implementar monitoreo ambiental continuo o evaluar el equipamiento MineSafe para tu operación? Escríbenos directamente.
                </p>

                {OFFICIAL_CONTACT_EMAIL ? (
                  <div className="p-4 rounded-xl bg-[#F0FDFA] dark:bg-teal-950/40 border border-[#99F6E4] dark:border-teal-800/70 space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#0F766E] dark:text-[#2DD4BF]">
                      Correo oficial de contacto MineSafe
                    </p>
                    <a
                      href={directMailtoHref}
                      className={`inline-flex items-center gap-2 text-sm font-bold text-[#0F172A] dark:text-white hover:text-[#0F766E] dark:hover:text-[#2DD4BF] underline underline-offset-4 ${lightFocusRing}`}
                    >
                      <Mail className="w-4 h-4 text-[#0D9488] dark:text-[#2DD4BF]" />
                      <span>{OFFICIAL_CONTACT_EMAIL}</span>
                    </a>
                    <p className="text-xs text-[#475569] dark:text-slate-300">
                      Atención directa para cotizaciones, despliegues en faena y soporte corporativo.
                    </p>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-[#F8FAFC] dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 space-y-1.5">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#334155] dark:text-slate-200">
                      Canal de correo oficial MineSafe
                    </p>
                    <p className="text-sm text-[#475569] dark:text-slate-300">
                      Configuración pendiente en el entorno de despliegue.
                    </p>
                  </div>
                )}

                <div className="p-4 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-900 text-xs text-[#475569] dark:text-slate-300 space-y-1.5">
                  <p className="font-semibold text-[#0F172A] dark:text-white">Acceso para organizaciones habilitadas</p>
                  <p>
                    El ingreso al panel de monitoreo utiliza cuentas creadas por un responsable autorizado. La consulta pública no crea cuentas ni entrega acceso a telemetría privada.
                  </p>
                </div>
              </div>

              {/* Formulario de contacto acotado a 4 campos (Nombre, Empresa o Institución, Correo, Mensaje) */}
              <div className="lg:col-span-7">
                <form
                  onSubmit={handleContactSubmit}
                  noValidate
                  className="bg-[#F8FAFC] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-6 sm:p-8 space-y-4"
                >
                  {/* Campo trampa anti-spam oculto para lectores humanos */}
                  <div className="hidden" aria-hidden="true">
                    <label htmlFor="contact-website">Sitio web</label>
                    <input
                      id="contact-website"
                      type="text"
                      tabIndex={-1}
                      autoComplete="off"
                      value={formState.website}
                      onChange={(e) => setFormState((prev) => ({ ...prev, website: e.target.value }))}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="contact-name" className="block text-xs font-semibold text-[#334155] dark:text-slate-200 mb-1.5">
                        Nombre
                      </label>
                      <input
                        id="contact-name"
                        type="text"
                        required
                        placeholder="Tu nombre completo"
                        value={formState.name}
                        onChange={(e) => setFormState((prev) => ({ ...prev, name: e.target.value }))}
                        className={`w-full px-3.5 py-2.5 text-sm bg-[#FFFFFF] dark:bg-slate-950 border rounded-lg text-[#0F172A] dark:text-white placeholder-[#94A3B8] ${
                          formErrors.name ? 'border-[#E11D48]' : 'border-[#CBD5E1] dark:border-slate-700'
                        } ${lightFocusRing}`}
                      />
                      {formErrors.name && (
                        <p className="mt-1 text-xs text-[#BE123C] dark:text-rose-400">{formErrors.name}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="contact-org" className="block text-xs font-semibold text-[#334155] dark:text-slate-200 mb-1.5">
                        Empresa o Institución
                      </label>
                      <input
                        id="contact-org"
                        type="text"
                        required
                        placeholder="Nombre de tu empresa o institución"
                        value={formState.organization}
                        onChange={(e) =>
                          setFormState((prev) => ({ ...prev, organization: e.target.value }))
                        }
                        className={`w-full px-3.5 py-2.5 text-sm bg-[#FFFFFF] dark:bg-slate-950 border rounded-lg text-[#0F172A] dark:text-white placeholder-[#94A3B8] ${
                          formErrors.organization ? 'border-[#E11D48]' : 'border-[#CBD5E1] dark:border-slate-700'
                        } ${lightFocusRing}`}
                      />
                      {formErrors.organization && (
                        <p className="mt-1 text-xs text-[#BE123C] dark:text-rose-400">{formErrors.organization}</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="contact-email" className="block text-xs font-semibold text-[#334155] dark:text-slate-200 mb-1.5">
                      Correo electrónico
                    </label>
                    <input
                      id="contact-email"
                      type="email"
                      required
                      placeholder="nombre@empresa.cl"
                      value={formState.email}
                      onChange={(e) => setFormState((prev) => ({ ...prev, email: e.target.value }))}
                      className={`w-full px-3.5 py-2.5 text-sm bg-[#FFFFFF] dark:bg-slate-950 border rounded-lg text-[#0F172A] dark:text-white placeholder-[#94A3B8] ${
                        formErrors.email ? 'border-[#E11D48]' : 'border-[#CBD5E1] dark:border-slate-700'
                      } ${lightFocusRing}`}
                    />
                    {formErrors.email && (
                      <p className="mt-1 text-xs text-[#BE123C] dark:text-rose-400">{formErrors.email}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="contact-message" className="block text-xs font-semibold text-[#334155] dark:text-slate-200 mb-1.5">
                      Mensaje
                    </label>
                    <textarea
                      id="contact-message"
                      rows={4}
                      required
                      placeholder="Cuéntanos sobre tu empresa, tus requerimientos de monitoreo ambiental o solicita una demostración comercial."
                      value={formState.message}
                      onChange={(e) => setFormState((prev) => ({ ...prev, message: e.target.value }))}
                      className={`w-full px-3.5 py-2.5 text-sm bg-[#FFFFFF] dark:bg-slate-950 border rounded-lg text-[#0F172A] dark:text-white placeholder-[#94A3B8] resize-y ${
                        formErrors.message ? 'border-[#E11D48]' : 'border-[#CBD5E1] dark:border-slate-700'
                      } ${lightFocusRing}`}
                    />
                    {formErrors.message && (
                      <p className="mt-1 text-xs text-[#BE123C] dark:text-rose-400">{formErrors.message}</p>
                    )}
                  </div>

                  {formErrors.form && (
                    <div className="p-3 rounded-lg bg-[#FFF1F2] border border-[#FECDD3] text-xs text-[#BE123C] flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{formErrors.form}</span>
                    </div>
                  )}

                  {submitStatus && (
                    <div
                      role="status"
                      className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                        submitStatus.type === 'success'
                          ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#047857]'
                          : submitStatus.type === 'error'
                          ? 'bg-[#FFF1F2] border-[#FECDD3] text-[#BE123C]'
                          : 'bg-[#F0FDFA] border-[#99F6E4] text-[#0F766E]'
                      }`}
                    >
                      {submitStatus.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 shrink-0" />
                      )}
                      <span>{submitStatus.text}</span>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                    <p className="text-[11px] text-[#64748B]">
                      {hasOfficialChannel
                        ? 'Los datos ingresados se utilizarán solo para responder tu consulta.'
                        : 'El envío permanecerá deshabilitado hasta confirmar el correo oficial de recepción.'}
                    </p>
                    <button
                      type="submit"
                      disabled={isSendingContact || !hasOfficialChannel}
                      className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-[#0D9488] hover:bg-[#0F766E] disabled:bg-[#CBD5E1] disabled:text-[#475569] disabled:cursor-not-allowed text-[#FFFFFF] transition-colors cursor-pointer shrink-0 ${lightFocusRing}`}
                    >
                      <Send className="w-4 h-4" />
                      <span>
                        {isSendingContact
                          ? 'Enviando...'
                          : OFFICIAL_CONTACT_ENDPOINT
                          ? 'Enviar consulta'
                          : OFFICIAL_CONTACT_EMAIL
                          ? 'Preparar correo'
                          : 'Canal pendiente'}
                      </span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ================================================================
          PIE DE PÁGINA
         ================================================================ */}
      <footer className="bg-[#0F172A] border-t border-[#1E293B] text-[#CBD5E1] py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-bold text-[#F8FAFC]">
              <span>MineSafe</span>
              <span className="text-[#475569]">·</span>
              <span className="font-medium text-[#94A3B8]">Seguridad y Telemetría Ambiental Minera</span>
            </div>
            <p className="text-xs text-[#94A3B8] max-w-xl">
              Privacidad: esta portada pública no recopila telemetría operativa ni expone datos de faenas. Los datos enviados mediante el formulario de contacto se utilizan únicamente para responder consultas comerciales y técnicas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setLegalModalTab('privacidad')}
              className={`text-[#CBD5E1] hover:text-[#2DD4BF] transition-colors cursor-pointer ${focusRing}`}
            >
              Política de Privacidad
            </button>
            <button
              type="button"
              onClick={() => setLegalModalTab('terminos')}
              className={`text-[#CBD5E1] hover:text-[#2DD4BF] transition-colors cursor-pointer ${focusRing}`}
            >
              Términos de Uso
            </button>
            <button
              type="button"
              onClick={() => setLegalModalTab('ciberseguridad')}
              className={`text-[#CBD5E1] hover:text-[#2DD4BF] transition-colors cursor-pointer ${focusRing}`}
            >
              Aviso Ley 21.663 / 21.459
            </button>
            <a
              href="#contacto"
              onClick={(e) => {
                e.preventDefault();
                scrollToSection('contacto');
              }}
              className={`text-[#CBD5E1] hover:text-[#2DD4BF] transition-colors ${focusRing}`}
            >
              Contacto
            </a>
            <button
              type="button"
              onClick={isAuthenticated && onGoToPanel ? onGoToPanel : onGoToLogin}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1E293B] hover:bg-[#334155] text-[#F8FAFC] border border-[#334155] transition-colors cursor-pointer ${focusRing}`}
            >
              <Lock className="w-3.5 h-3.5 text-[#2DD4BF]" />
              <span>{isAuthenticated && onGoToPanel ? 'Ir al panel' : 'Iniciar sesión'}</span>
            </button>
          </div>
        </div>
      </footer>

      <LegalComplianceModal
        isOpen={Boolean(legalModalTab)}
        initialTab={legalModalTab || 'privacidad'}
        onClose={() => setLegalModalTab(null)}
        theme={theme}
      />

      {/* Lightbox accesible para inspeccionar las fotografías del dispositivo y sensores */}
      {lightboxMedia && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Vista ampliada de fotografía del equipamiento MineSafe"
          onClick={() => setLightboxMedia(null)}
          className="fixed inset-0 z-[70] bg-[#020617]/90 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-4xl w-full bg-[#0F172A] border border-[#334155] rounded-2xl overflow-hidden shadow-2xl"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#1E293B]">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#2DD4BF]">
                Equipamiento Industrial MineSafe
              </span>
              <button
                type="button"
                onClick={() => setLightboxMedia(null)}
                aria-label="Cerrar vista ampliada"
                className={`p-1.5 rounded-lg text-[#CBD5E1] hover:text-[#FFFFFF] hover:bg-[#1E293B] cursor-pointer ${focusRing}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-[#020617] flex items-center justify-center p-2 sm:p-4">
              <img
                src={lightboxMedia.src}
                alt={lightboxMedia.alt}
                className="max-h-[75vh] w-auto object-contain rounded-lg"
              />
            </div>
            <div className="px-4 py-3 border-t border-[#1E293B] text-xs sm:text-sm text-[#CBD5E1]">
              {lightboxMedia.caption}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
