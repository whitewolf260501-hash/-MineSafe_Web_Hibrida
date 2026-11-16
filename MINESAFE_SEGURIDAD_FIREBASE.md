# ARQUITECTURA DE SEGURIDAD Y REGLAS FIREBASE — MINESAFE WEB HÍBRIDA (P031)

## 1. Inventario de Proyectos Firebase y Superficie Protegida

La aplicación mantiene dos configuraciones explícitas en el repositorio:
1. **`minefase-fc5f5`** (`src/services/firebase.ts`, `.firebaserc`): Firebase Authentication, Realtime Database (`database.rules.json`) y Cloud Storage (`storage.rules`). Es el backend operativo activo de telemetría, usuarios, contratos, alertas y adjuntos.
2. **`gen-lang-client-0751389499`** (`firebase-applet-config.json`): Definición y reglas endurecidas de Cloud Firestore (`firestore.rules` + `firestore.rules.test.ts` + `security_spec.md`).

---

## 2. Reglas de Realtime Database (`database.rules.json`)

### Principios de Diseño Aplicados
- **Cero lectura/escritura en raíz:** `".read": false`, `".write": false`.
- **Cuenta activa estricta:** Todo usuario operativo debe existir en `/usuarios/{uid}` y cumplir `isActive === true` (reemplazando la validación laxa anterior `!== false`).
- **Aislamiento multiempresa sin bypasses:** Se eliminaron las cláusulas `!data.child('organizationId').exists()` en `/dispositivos/$deviceId/.read` y `/historial_telemetria/$deviceId`. Todo recurso operativo pertenece explícitamente a una organización.
- **Índices obligatorios (`.indexOn`):** Configurados en `dispositivos`, `usuarios` (`organizationId`, `email`), `contratos`, `pagos` (`organizationId`, `idContrato`), `asignaciones`, `alertas` (`organizationId`, `timestamp`), `bitacora_contingencias`, `adjuntos` (`organizationId`, `alertId`), `simulacros_bitacora`, `bitacora_configuracion_umbrales`, `eventos_umbrales`, `faenas` y `historial_telemetria/$deviceId` (`timestamp`).

### Reglas Críticas por Colección
- **`/dispositivos/$deviceId`:**
  - `.write` permite únicamente: SuperAdmin, Admin de la misma organización (manteniendo inmutable o coincidente `organizationId`), o dispositivo IoT autenticado vía Custom Token con `auth.token.deviceId === $deviceId` y `auth.token.organizationId === data.organizationId`.
  - `.validate` exige `CO` (0–4095), `PM2_5` (0–4095), `temperatura` (-40 a 100) y `humedad` (0 a 100).
- **`/usuarios/$userId`:**
  - Lectura de colección completa reservada a SuperAdmin, consulta `orderByChild('organizationId')` de Admin en su organización o lookup exacto por email autenticado `orderByChild('email').equalTo(auth.token.email)`.
  - Un Admin no puede modificarse a sí mismo (`$userId !== auth.uid`), no puede modificar un SuperAdmin ni mover usuarios hacia otra organización.
- **`/pagos/$paymentId`:**
  - `.validate` exige `monto > 0`, existencia real de `contratos/{idContrato}` y coincidencia exacta `contratos/{idContrato}/organizationId === newData.organizationId`.
- **`/simulacro/$orgId` y `/emergencia/$orgId`:**
  - Aislados bajo segmento explícito `$orgId` para impedir que simulacros o emergencias de una faena impacten a otra organización.
- **`/precarga`:**
  - `.write: false` (bloqueada de forma permanente) y `.read` restringido solo a SuperAdmin.

---

## 3. Reglas de Cloud Storage (`storage.rules`)

- **Ruta canónica multiempresa:** `/adjuntos/{organizationId}/{alertId}/{fileName}`.
- **Lectura (`read`):** Usuario autenticado con claim de la misma organización (`request.auth.token.organizationId == organizationId`), propietario según metadato `resource.metadata['organizationId'] == organizationId`, o SuperAdmin primario.
- **Creación (`create`):**
  - Segmentos válidos (`isValidScopeSegment`).
  - Límite estricto `> 0` y `<= 5 * 1024 * 1024` (5 MB).
  - MIME permitido únicamente: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`.
  - Metadatos obligatorios consistentes con la ruta y sesión: `organizationId`, `alertId` y `uploadedByUid == request.auth.uid`.
- **Inmutabilidad (`update`):** `allow update: if false;` (las evidencias no pueden sobrescribirse).
- **Borrado (`delete`):** Limitado al autor original de la misma organización o al SuperAdmin primario. En cliente (`src/services/firebase.ts`), si falla la escritura del metadato en RTDB `/adjuntos`, el archivo recién subido en Storage se elimina automáticamente como rollback.
- **Ruta plana legada (`/adjuntos/{alertId}/{fileName}`):** Bloqueada por la regla final `match /{allPaths=**} { allow read, write: if false; }`.

---

## 4. Reglas de Cloud Firestore (`firestore.rules`)

- Helper `isSameOrgMember(orgId)` añadido para acotar operaciones `get` y transiciones operativas en `/organizations`, `/devices`, `/alerts`, `/rentals` y `/attachments` al miembro activo cuya organización coincida, manteniendo bloqueo de campos fantasma (`hasAll` + `hasOnly`), validación de `createdAt`/`updatedAt == request.time`, y máquina de estados terminales en `/alerts`.
- Suite `firestore.rules.test.ts` ampliada con caso **DD-04B** (lectura cruzada entre organizaciones sobre `/alerts`) y validada sin advertencias mediante `npx eslint firestore.rules`.

---

## 5. Rollback y Consistencia en Flujos Críticos de Cliente

- **Provisión de usuarios (`createUserAccountByAdmin`):** Si la creación del perfil en RTDB `/usuarios/{uid}` falla tras `createUserWithEmailAndPassword`, el cliente ejecuta `createdFbUser.delete()` para evitar cuentas huérfanas en Firebase Auth.
- **Revocación de sesión (`subscribeToCurrentUserStatus` + `RootApp.tsx`):** Ante `isActive === false`, eliminación del perfil (`deleted`) o fallo crítico de permisos (`error`), `RootApp` cierra sesión inmediatamente, limpia claves de sesión en `localStorage`, muestra motivo en `/acceso` y bloquea el panel.
- **Cierre de alertas y registro de pagos:** Ejecutados mediante actualizaciones atómicas multi-path (`update(ref(rtdb), updates)`), garantizando atomicidad entre `/alertas` + `/bitacora_contingencias` + `/eventos_umbrales` y entre `/pagos` + `/contratos`.
