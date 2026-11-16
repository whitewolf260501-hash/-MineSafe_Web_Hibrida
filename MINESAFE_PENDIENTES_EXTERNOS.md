# PENDIENTES EXTERNOS Y ACCIONES FUERA DEL ENTORNO LOCAL — MINESAFE WEB HÍBRIDA

Las siguientes acciones requieren credenciales en la nube, herramientas de sistema ausentes en este contenedor o intervención directa con hardware en terreno, por lo que **no pueden ser ejecutadas ni simuladas** desde este entorno:

---

## 1. Despliegue Efectivo de Reglas Firebase en Producción (`minefase-fc5f5`)
- **Pendiente:** Ejecutar `firebase deploy --only database,storage,firestore:rules`.
- **Motivo:** Este entorno no posee credenciales autenticadas de Firebase CLI hacia `minefase-fc5f5` y no corresponde desplegar cambios a producción sin autorización explícita del propietario.
- **Impacto si se omite:** Las consultas indexadas por `organizationId` y `timestamp` no contarán con los índices `.indexOn` declarados en `database.rules.json`, y Storage podría rechazar cargas según reglas heredadas.

## 2. Pruebas Funcionales con Firebase Emulator Suite (RTDB / Auth / Storage / Firestore)
- **Pendiente:** Instalar Java JDK/JRE (≥ 11) en el entorno local o runner CI y ejecutar las pruebas de reglas reales contra `firebase emulators:exec`.
- **Motivo:** En este contenedor `which java` devolvió vacío (sin JRE instalado), por lo que el emulador RTDB/Firestore no pudo iniciarse.

## 3. Verificación con Hardware Físico ESP32 / ESP-NOW y Persistencia Histórica 24/7
- **Pendiente:**
  1. Validar en faena que el gateway ESP32 escribe telemetría en `/dispositivos/device_38A839E81F84` respetando los rangos de `.validate` (`CO` 0–4095, `PM2_5` 0–4095, `temperatura` -40–100, `humedad` 0–100) y responde a `comando_web` (`ENCENDER`/`APAGAR`) y `silencio_remoto`.
  2. Confirmar la cadencia real de publicación y marcas temporales NTP en el firmware ESP32.
  3. **Registro histórico desatendido (24/7):** Actualmente `/historial_telemetria/{deviceId}/{timestamp}` se alimenta desde clientes web abiertos. Para grabar histórico aunque no exista ningún navegador conectado, se recomienda habilitar escritura directa en `/historial_telemetria` desde el firmware gateway ESP32 o configurar una Cloud Function disparada por `onValueWritten` en `/dispositivos/{deviceId}`.

## 4. Configuración de Canal Público de Contacto (Portada P013)
- **Pendiente:** Configurar `VITE_PUBLIC_CONTACT_EMAIL` y/o `VITE_PUBLIC_CONTACT_ENDPOINT` en las variables del repositorio GitHub (**Settings → Secrets and variables → Actions → Variables**).
- **Motivo:** Sin un buzón o endpoint corporativo confirmado, el repositorio mantiene estas variables vacías por defecto en `.env.example` para evitar exponer correos personales.

## 5. Revisión de Configuración GitHub Pages y Limpieza de Artefactos Históricos del Repo
- **Pendiente en GitHub:** Asegurar en **Settings → Pages** que el origen esté fijado en **GitHub Actions** (y no en rama `main` / `/ (root)` o `/docs`), para que se publique el artefacto compilado por `.github/workflows/deploy-pages.yml`.
- **Artefactos residuales en el repositorio:** Existen directorios y archivos pesados heredados no utilizados por el runtime web actual (`docs/` ~53 MB, `assets/`, `minesafe-ai-actualizado.zip`, `minesafe-web-ia.zip`, `MineSafe_IoT_Mobile_v2.4.apk`, `public/assets/aistudio/`). Se optó por excluir `dist/assets/aistudio` en el build de producción sin eliminar archivos del repositorio por precaución; el propietario puede depurar `docs/` y archivos `.zip` cuando confirme que no forman parte de entregas académicas o móviles externas.

## 6. Entrega de Documentos P023–P027 (Para Trazabilidad Formal Completa)
- **Pendiente:** Si se requiere auditar o firmar los KPIs específicos y cláusulas ISO referidas en los informes `P023`, `P024`, `P025`, `P026` y `P027_Codex_revision_MineSafe_Web_Hibrida.md`, adjuntar esos documentos al repositorio para cruzar sus identificadores exactos con la matriz implementada.
