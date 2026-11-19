import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { UserProfile } from './types';
import {
  subscribeToFirebaseAuth,
  logoutFromFirebaseAuth,
  subscribeToCurrentUserStatus,
  auth,
} from './services/firebase';
import {
  AppRoute,
  parseAppRoute,
  navigateToAppRoute,
} from './utils/navigation';
import { PublicLanding } from './components/PublicLanding';
import { LoginView } from './components/LoginView';
import { PasswordPolicyModal } from './components/PasswordPolicyModal';

const MineSafePanel = lazy(() => import('./App'));

export const RootApp: React.FC = () => {
  const [routeState, setRouteState] = useState<{ route: AppRoute; sectionId?: string }>(() => {
    if (typeof window === 'undefined') return { route: 'landing' };
    return parseAppRoute(window.location.pathname, window.location.hash);
  });
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [pendingPasswordUpgrade, setPendingPasswordUpgrade] = useState<{
    user: UserProfile;
    reason: string;
  } | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      return localStorage.getItem('minesafe_theme') === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  // Sincroniza cambios de historial del navegador (/acceso, /panel, #/acceso, #/panel)
  useEffect(() => {
    const syncRoute = () => {
      setRouteState(parseAppRoute(window.location.pathname, window.location.hash));
    };
    window.addEventListener('popstate', syncRoute);
    window.addEventListener('hashchange', syncRoute);
    return () => {
      window.removeEventListener('popstate', syncRoute);
      window.removeEventListener('hashchange', syncRoute);
    };
  }, []);

  // Sincroniza modo oscuro / modo claro manualmente en todas las vistas (portada, acceso y panel)
  useEffect(() => {
    try {
      localStorage.setItem('minesafe_theme', theme);
    } catch { /* ignore */ }
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.remove('dark');
      if (routeState.route === 'panel') {
        root.classList.add('theme-light');
      } else {
        root.classList.remove('theme-light');
      }
      root.setAttribute('data-theme', 'light');
    } else {
      root.classList.add('dark');
      root.classList.remove('theme-light');
      root.setAttribute('data-theme', 'dark');
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', theme === 'light' ? '#f1f5f9' : '#060b13');
    }
  }, [theme, routeState.route]);

  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  // Verifica estado real de Firebase Authentication (sin iniciar suscripciones operativas RTDB hasta validar sesión)
  useEffect(() => {
    try {
      localStorage.removeItem('minesafe_active_user');
    } catch { /* ignore */ }

    const unsubAuth = subscribeToFirebaseAuth((user, err) => {
      const activeUser = user && user.status === 'activo' ? user : null;
      setCurrentUser(activeUser);
      if (activeUser?.mustChangePassword) {
        setPendingPasswordUpgrade({
          user: activeUser,
          reason:
            'Tu cuenta tiene marcado un cambio obligatorio de contraseña por política de seguridad MineSafe.',
        });
      }
      setAuthError(err || null);
      setIsAuthChecking(false);
    });

    return () => unsubAuth();
  }, []);

  // Escucha directa sobre el nodo propio /usuarios/{uid} para revocación inmediata (incluso para operadores)
  useEffect(() => {
    if (!currentUser) return;
    const authUid = auth.currentUser?.uid || null;
    const unsubStatus = subscribeToCurrentUserStatus(
      currentUser.id,
      authUid,
      (status, updatedProfile, errorMessage) => {
        if (status === 'inactivo' || status === 'deleted' || status === 'error') {
          logoutFromFirebaseAuth().catch(() => {});
          try {
            localStorage.removeItem('minesafe_active_user');
          } catch { /* ignore */ }
          setCurrentUser(null);
          setAuthError(
            errorMessage ||
              (status === 'deleted'
                ? 'Tu perfil fue eliminado o revocado en Firebase RTDB. La sesión se cerró inmediatamente.'
                : status === 'error'
                ? 'No se pudo validar tu perfil autorizado en Firebase RTDB. La sesión se cerró por seguridad.'
                : 'Tu cuenta fue desactivada por administración. La sesión se cerró inmediatamente.')
          );
          if (routeState.route === 'panel') {
            navigateToAppRoute('login', { replace: true });
            setRouteState({ route: 'login' });
          }
          return;
        }
        if (updatedProfile) {
          setCurrentUser((prev) => (prev ? { ...prev, ...updatedProfile } : updatedProfile));
        }
      }
    );
    return () => unsubStatus();
  }, [currentUser?.id, routeState.route]);

  // Redirecciones de control de ruta:
  // - /panel sin sesión activa -> /acceso
  // - /acceso con sesión activa -> /panel
  useEffect(() => {
    if (isAuthChecking) return;

    if (routeState.route === 'panel' && !currentUser) {
      navigateToAppRoute('login', { replace: true });
      setRouteState({ route: 'login' });
    } else if (routeState.route === 'login' && currentUser) {
      navigateToAppRoute('panel', { replace: true });
      setRouteState({ route: 'panel' });
    }
  }, [isAuthChecking, routeState.route, currentUser]);

  // Si la portada se cargó con ancla (#producto, #como-funciona, etc.), desplazar suavemente al montar
  useEffect(() => {
    if (routeState.route === 'landing' && routeState.sectionId) {
      const target = document.getElementById(routeState.sectionId);
      if (target) {
        setTimeout(() => {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 60);
      }
    }
  }, [routeState.route, routeState.sectionId]);

  const goToLanding = useCallback(() => {
    setAuthError(null);
    navigateToAppRoute('landing');
    setRouteState({ route: 'landing' });
  }, []);

  const goToLogin = useCallback(() => {
    if (currentUser) {
      navigateToAppRoute('panel');
      setRouteState({ route: 'panel' });
      return;
    }
    setAuthError(null);
    navigateToAppRoute('login');
    setRouteState({ route: 'login' });
  }, [currentUser]);

  const goToPanel = useCallback(() => {
    if (!currentUser) {
      navigateToAppRoute('login');
      setRouteState({ route: 'login' });
      return;
    }
    navigateToAppRoute('panel');
    setRouteState({ route: 'panel' });
  }, [currentUser]);

  const handleLoginSuccess = useCallback(
    (user: UserProfile, mustUpdatePasswordReason?: string) => {
      if (user.status !== 'activo') {
        setAuthError('Tu cuenta se encuentra desactivada por administración.');
        return;
      }
      setAuthError(null);
      setCurrentUser(user);
      if (mustUpdatePasswordReason) {
        setPendingPasswordUpgrade({ user, reason: mustUpdatePasswordReason });
        return;
      }
      setPendingPasswordUpgrade(null);
      navigateToAppRoute('panel', { replace: true });
      setRouteState({ route: 'panel' });
    },
    []
  );

  const handleLogout = useCallback(async () => {
    await logoutFromFirebaseAuth().catch(() => {});
    try {
      localStorage.removeItem('minesafe_active_user');
    } catch { /* ignore */ }
    setCurrentUser(null);
    setPendingPasswordUpgrade(null);
    setAuthError(null);
    navigateToAppRoute('landing', { replace: true });
    setRouteState({ route: 'landing' });
  }, []);

  // 1. PORTADA PÚBLICA (/): nunca monta el panel privado ni inicia suscripciones operativas
  if (routeState.route === 'landing') {
    return (
      <PublicLanding
        onGoToLogin={goToLogin}
        onGoToPanel={currentUser ? goToPanel : undefined}
        isAuthenticated={Boolean(currentUser)}
        authenticatedUserName={currentUser?.name}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />
    );
  }

  // 2. ESPERA DE VERIFICACIÓN SOLO EN RUTAS PRIVADAS (/acceso o /panel)
  if (isAuthChecking) {
    return (
      <div className="min-h-screen w-full bg-[#F8FAFC] dark:bg-[#060b13] flex flex-col items-center justify-center p-6 text-[#334155] dark:text-slate-300">
        <div className="w-9 h-9 rounded-full border-2 border-[#0D9488] border-t-transparent animate-spin mb-4" />
        <p className="text-sm font-semibold text-[#0F172A] dark:text-white">
          Verificando sesión autorizada...
        </p>
        <p className="text-xs text-[#64748B] dark:text-slate-400 mt-1">MineSafe · Control de Acceso</p>
      </div>
    );
  }

  // 2.5 ACTUALIZACIÓN OBLIGATORIA DE CONTRASEÑA SI LA CLAVE ACTUAL NO CUMPLE POLÍTICA MÍNIMA
  if (currentUser && pendingPasswordUpgrade) {
    return (
      <PasswordPolicyModal
        user={pendingPasswordUpgrade.user}
        reason={pendingPasswordUpgrade.reason}
        onCompleted={(updatedUser) => {
          setCurrentUser(updatedUser);
          setPendingPasswordUpgrade(null);
          navigateToAppRoute('panel', { replace: true });
          setRouteState({ route: 'panel' });
        }}
        onCancelLogout={handleLogout}
      />
    );
  }

  // 3. ACCESO PRIVADO (/acceso)
  if (routeState.route === 'login' || !currentUser) {
    return (
      <LoginView
        onLoginSuccess={handleLoginSuccess}
        onBackToLanding={goToLanding}
        externalAuthError={authError}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />
    );
  }

  // 4. PANEL OPERATIVO AUTENTICADO (/panel): solo se monta con sesión verificada y cuenta activa
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-300">
          <div className="w-10 h-10 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin mb-4" />
          <p className="text-sm font-semibold text-white">Cargando panel operativo MineSafe...</p>
        </div>
      }
    >
      <MineSafePanel
        key={currentUser.id}
        authenticatedUser={currentUser}
        onSessionUserUpdated={setCurrentUser}
        onLogoutRequest={handleLogout}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />
    </Suspense>
  );
};

export default RootApp;
