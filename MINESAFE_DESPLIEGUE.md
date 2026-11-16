# GUÍA DE DESPLIEGUE Y PUBLICACIÓN — MINESAFE WEB HÍBRIDA

**Aplicación Web:** `https://whitewolf260501-hash.github.io/-MineSafe_Web_Hibrida/`  
**Proyecto Firebase:** `minefase-fc5f5`

---

## 1. Variables de Entorno y Secreto Cero

El proyecto utiliza exclusivamente variables públicas `VITE_*` en tiempo de compilación (nunca credenciales administrativas privadas en el frontend):

Ver `.env.example`:
- `VITE_FIREBASE_RTDB_URL`: URL HTTPS de Realtime Database (`https://minefase-fc5f5-default-rtdb.firebaseio.com/`).
- `VITE_PUBLIC_CONTACT_EMAIL` *(opcional)*: correo oficial para el formulario de contacto en la portada pública.
- `VITE_PUBLIC_CONTACT_ENDPOINT` *(opcional)*: endpoint externo HTTPS si se habilita recepción vía formulario HTTP en lugar de `mailto:`.

### Configuración en GitHub Repository Variables
En **GitHub → Settings → Secrets and variables → Actions → Variables**:
1. Definir `VITE_FIREBASE_RTDB_URL` (opcional; tiene fallback seguro en el workflow).
2. Definir `VITE_PUBLIC_CONTACT_EMAIL` y/o `VITE_PUBLIC_CONTACT_ENDPOINT` cuando la organización disponga del canal oficial.

---

## 2. Despliegue de Reglas de Seguridad en Firebase (Obligatorio Antes/Junto al Frontend)

Las modificaciones realizadas sobre las reglas en el repositorio **deben desplegarse** en el proyecto `minefase-fc5f5` desde una máquina con sesión autenticada en Firebase CLI (`firebase login`):

```bash
# 1. Validar sintaxis local antes de publicar
npx eslint firestore.rules

# 2. Verificar proyecto activo
firebase use minefase-fc5f5

# 3. Desplegar reglas de Realtime Database, Storage y Firestore
firebase deploy --only database,storage,firestore:rules
```

> **Nota crítica:** Si la aplicación web actualizada se despliega antes que `database.rules.json` y `storage.rules`:
> - Las consultas optimizadas con `orderByChild('organizationId')` y `orderByChild('timestamp')` requieren los bloques `.indexOn` actualizados para evitar advertencias/rechazos en producción.
> - La subida de adjuntos de contingencia en `AlertResolutionModal.tsx` requiere tener activas las reglas de `storage.rules` para usuarios autenticados (`<= 5 MB`).

---

## 3. Publicación de la Web en GitHub Pages (GitHub Actions)

El flujo `.github/workflows/deploy-pages.yml` está configurado para ejecutarse automáticamente en cada `push` a `main` o manualmente (`workflow_dispatch`):

1. **Verificación previa en GitHub:**
   - Ir a **Settings → Pages → Build and deployment → Source** y confirmar **GitHub Actions** (en lugar de `Deploy from a branch`, que serviría archivos estáticos antiguos de raíz o `docs/`).
2. **Pasos ejecutados por el workflow:**
   - Instalación reproducible (`npm install --no-audit --no-fund --legacy-peer-deps`).
   - Chequeo estático TypeScript (`npm run lint`).
   - Validación de reglas Firestore (`npx eslint firestore.rules`).
   - Ejecución de las tres suites de pruebas (`npm test`).
   - Compilación Vite (`npm run build` con `base: './'`) que genera `dist/` limpio y elimina `dist/assets/aistudio`.
   - Generación de `dist/404.html` (respaldo SPA) y `dist/.nojekyll`.
   - Carga del artefacto `dist/` y despliegue a `github-pages`.

### Compilación Manual Local de Verificación
```bash
npm ci || npm install --legacy-peer-deps
npm run lint
npx eslint firestore.rules
npm test
npm run build
```

---

## 4. Checklist Post-Despliegue

1. Abrir la URL raíz de GitHub Pages y comprobar que carga **PublicLanding** sin errores en consola ni llamadas de red a RTDB previas al login.
2. Navegar a `#/acceso` e iniciar sesión con una cuenta válida:
   - **Operador:** confirmar acceso restringido sin errores de lectura en `/usuarios` ni botones administrativos de contratos/pagos.
   - **Administrador:** confirmar visibilidad acotada únicamente a su `organizationId`.
   - **SuperAdministrador:** confirmar selector de organizaciones, control de ventanas (`visor_3d`) y apagado global de alarmas.
3. Desactivar un usuario de prueba desde otra sesión administrativa y verificar que su sesión activa se cierra automáticamente sin recargar la página.
4. En **Reportes Históricos**, cambiar entre `1h`, `6h`, `24h`, `7d`, `30d` y `Personalizado`, y verificar descarga completa en CSV en Excel (UTF-8 con BOM y delimitador válido).
5. Probar subida de evidencia en el cierre de una alerta (`AlertResolutionModal`) verificando almacenamiento en `/adjuntos/{alertId}/...` tras desplegar `storage.rules`.
