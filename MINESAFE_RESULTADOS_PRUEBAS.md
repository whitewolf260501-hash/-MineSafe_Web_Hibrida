# RESULTADOS DE PRUEBAS Y VALIDACIONES — MINESAFE WEB HÍBRIDA

Este documento reporta únicamente resultados de comandos **realmente ejecutados y verificados** en el espacio de trabajo actual, separando de forma explícita las pruebas no ejecutadas por limitaciones de entorno o hardware.

---

## 1. Resumen de Ejecuciones Realizadas

| Suite / Herramienta | Comando Ejecutado | Resultado Observado | Detalle Verificado |
|---|---|---|---|
| Motor de Alertas Dinámicas | `npm run test:alerts` (`tsx tests/test_alert_engine.ts`) | **PASS (25/25)** | Histéresis, escalamiento preventivo/advertencia/crítico, recuperación con `clearEmergencyIfNone`, anti-duplicación y filtrado de `faultFields`. |
| Portada P013, Rutas, RBAC e Inspector 3D | `npm run test:p013` (`tsx tests/test_p013_access_and_landing.ts`) | **PASS (5 bloques)** | Parsing de rutas limpias y hash, validación/anti-spam formulario de contacto, aislamiento multiorganización, separación sin Firebase en portada y control de ventana `visor_3d`. |
| Auditoría, Reglas, Pagos y Reportes | `npm run test:audit` (`tsx tests/test_audit_stabilization.ts`) | **PASS (5 bloques)** | Invariantes de `database.rules.json` y `storage.rules`, RBAC de contratos/pagos, `resolveConfiguredRtdbUrl`, paridad de payloads canónicos/legacy, ventanas históricas, downsampling y exportación CSV RFC-4180 completa (120 filas + cabecera sin truncamiento). |
| Chequeo TypeScript | `npm run lint` (`tsc --noEmit`) | **PASS (exit code 0)** | Cero errores de tipos en toda la aplicación y pruebas. |
| Validador Reglas Firestore | `npx eslint firestore.rules` | **PASS (exit code 0)** | Cero errores ni advertencias de sintaxis o reglas de seguridad en `firestore.rules`. |
| Compilación Producción Vite | `npm run build` (`vite build && rm -rf dist/assets/aistudio`) | **PASS (2.01s, 1716 módulos)** | Genera `dist/index.html`, `app-*.js`, `App-*.js` (lazy), `Node3DInspectorView-*.js` (lazy) e `index-*.css`, confirmando ausencia de `dist/assets/aistudio` en `dist/assets/`. |

---

## 2. Detalle de Artefactos Generados en `dist/`

Tras ejecutar `npm run build` y listar `dist/assets`:
- `dist/index.html` (`4.48 kB`)
- `dist/assets/index-XXp7ogyI.css` (`154.66 kB`)
- `dist/assets/Node3DInspectorView-Bv4XJJZS.js` (`631.59 kB`, carga diferida)
- `dist/assets/App-OSs5M9-H.js` (`660.46 kB`, panel privado con carga diferida post-auth)
- `dist/assets/app-DUn5PG_5.js` (`1,195.10 kB`, shell raíz y portada pública)
- Directorio `dist/assets/aistudio`: **No presente (eliminado al finalizar build)**.

---

## 3. Pruebas NO EJECUTADAS (Declaración Explícita)

| Prueba Pendiente | Estado | Motivo Real Técnico | Acción Requerida para Ejecutar |
|---|---|---|---|
| **Firebase Emulator Suite (RTDB, Storage y Firestore Rules en ejecución real)** | **NO EJECUTADA** | `firebase-tools` (`15.34.1`) está presente en `/usr/local/bin/firebase`, pero el entorno carece de Java JRE (`which java` vacío), requisito indispensable para iniciar los emuladores RTDB y Firestore. | Ejecutar `firebase emulators:exec` en una máquina con Java JDK/JRE ≥ 11 instalado. |
| **Pruebas End-to-End contra Proyecto Firebase en Producción (`minefase-fc5f5`)** | **NO EJECUTADA** | No existen credenciales de despliegue Firebase activas en el entorno y no se modificó el proyecto productivo remoto sin autorización explícita. | Ejecutar checklist post-despliegue tras `firebase deploy --only database,storage,firestore:rules`. |
| **Pruebas Físicas de Hardware ESP32 / Gateway ESP-NOW** | **NO EJECUTADA** | No hay nodos físicos ESP32 ni red local/campo conectada al contenedor para verificar tramas en vivo, botones físicos, buzzer o marca temporal NTP del microcontrolador. | Validar en banco de pruebas con gateway ESP32 encendido conectado al nodo `/dispositivos/device_38A839E81F84`. |
