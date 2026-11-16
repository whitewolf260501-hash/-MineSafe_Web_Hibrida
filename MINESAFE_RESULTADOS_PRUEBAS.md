# RESULTADOS DE PRUEBAS Y VALIDACIONES — MINESAFE WEB HÍBRIDA (P031)

Este reporte registra únicamente comandos **efectivamente ejecutados y comprobados** en el entorno de trabajo, separando explícitamente las ejecuciones locales verificadas de las pruebas externas pendientes.

---

## 1. Matriz de Pruebas Ejecutadas en Verde

| Suite / Validación | Comando Ejecutado | Resultado | Cobertura Verificada |
|---|---|---|---|
| **Validación Reglas Firebase + Config** | `npm run validate:firebase` (`eslint firestore.rules` + parse `database.rules.json` + parse `firebase.json`) | **PASS (exit code 0)** | 0 errores ESLint de reglas de seguridad Firestore (`@firebase/eslint-plugin-security-rules`) y sintaxis JSON válida para RTDB y configuración Firebase CLI. |
| **Motor de Alertas Dinámicas** | `npm run test:alerts` (`tsx tests/test_alert_engine.ts`) | **PASS (25/25)** | Histéresis anti-flapping, escalamiento preventivo → advertencia → crítico, recuperación (`clearEmergencyIfNone`), hidratación post-recarga y filtrado de `faultFields`. |
| **Portada P013, Rutas, RBAC y Visores 3D** | `npm run test:p013` (`tsx tests/test_p013_access_and_landing.ts`) | **PASS (5 bloques)** | Enrutamiento `/` `/acceso` `/panel` y hash `#/...`, formulario de contacto anti-spam, aislamiento multi-org, privacidad de portada sin Firebase, control de visibilidad `visor_3d` y `gateway_3d`. |
| **Auditoría y Estabilización Previa** | `npm run test:audit` (`tsx tests/test_audit_stabilization.ts`) | **PASS (6 bloques)** | Invariantes `database.rules.json` y `storage.rules`, RBAC de contratos/pagos, `resolveConfiguredRtdbUrl`, paridad de esquemas canónico/legacy, downsampling y exportación CSV sin truncar. |
| **Suite Integral P031** | `npm run test:p031` (`tsx tests/test_p031_comprehensive.ts`) | **PASS (13 bloques)** | Reglas estrictas RTDB/Firestore/Storage, migración multiempresa idempotente, revocación en vivo (`inactivo`/`deleted`), actualizaciones atómicas `/alertas`+`/bitacora_contingencias` y `/pagos`+`/contratos`, validaciones de contrato y compatibilidad de dispositivo, paginación por cursor y detección de truncamiento, CSV asíncrono de 12.050 filas RFC-4180, rutas Storage con `orgId`, colector 24/7 + trigger Cloud Function + retención 90d, estado real vs `--` en Visores 3D, configuración GitHub Pages CI/CD y Centro Documental SuperAdmin (`superadmin_docs` + PKZIP). |
| **Chequeo de Tipos TypeScript** | `npm run lint` (`tsc --noEmit`) | **PASS (exit code 0)** | Verificado mediante `lint_applet` tras el último cambio de código y documentación. |
| **Compilación Producción Vite** | `npm run build` (`vite build && rm -rf dist/assets/aistudio dist/minesafe-web*.zip`) | **PASS (exit code 0)** | Verificado mediante `compile_applet`, generando bundle en `dist/` libre de artefactos `assets/aistudio` y archivos `.zip`. |

---

## 2. Pruebas NO Ejecutadas por Condiciones del Entorno (Declaración Explícita)

| Prueba Pendiente | Estado | Causa Técnica Real | Cómo Ejecutarla |
|---|---|---|---|
| **Firebase Emulator Suite (RTDB, Auth, Storage, Firestore en vivo)** | **NO EJECUTADA** | El contenedor no cuenta con Java JRE/JDK (`which java` ausente), indispensable para arrancar los emuladores JVM locales de Firebase. | Instalar JDK ≥ 11 en entorno local o CI y correr `firebase emulators:exec --only firestore,database,storage "npx tsx firestore.rules.test.ts"`. |
| **Despliegue y Pruebas E2E en Firebase Producción (`minefase-fc5f5` / `gen-lang-client-0751389499`)** | **NO EJECUTADA** | Sin sesión autenticada de Firebase CLI ni autorización de escritura directa en producción. | Ejecutar `firebase deploy --only database,storage,firestore:rules,functions` y correr pruebas post-despliegue con usuario real. |
| **Pruebas en Hardware Físico ESP32 / ESP-NOW** | **NO EJECUTADA** | Sin dispositivos ESP32/Gateway conectados físicamente al contenedor. | Encender nodo y gateway en terreno o laboratorio, verificar escritura `/dispositivos/{deviceId}`, respuesta `comando_web` y desconexión real de sensores. |
