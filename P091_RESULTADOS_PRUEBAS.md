# P091 — Resultados de Pruebas Automatizadas y Estado de Validación Física

## 1. Resumen de ejecución local

Todas las suites locales y validaciones estáticas de Firebase fueron ejecutadas directamente en el entorno del repositorio, con resultado **APROBADO** en el 100% de las verificaciones automatizadas:

| Comando / Suite | Resultado | Detalle observado |
| --- | --- | --- |
| `npm run validate:firebase` | **PASS** | `eslint firestore.rules` sin errores; `database.rules.json OK`; `firebase.json OK`. |
| `npm run test:alerts` | **PASS** | 25/25 pruebas del motor de umbrales dinámicos superadas. |
| `npm run test:p013` | **PASS** | 5/5 bloques (enrutamiento, formulario, RBAC, aislamiento y visor 3D). |
| `npm run test:audit` | **PASS** | 6/6 bloques de reglas, multi-tenant, contratos, CSV y visibilidad. |
| `npm run test:p031` | **PASS** | 34/34 bloques de integridad, seguridad, IoT, documentación y cumplimiento. |
| `npm run test:p085` | **PASS** | 8/8 bloques de reglas RTDB, escalamiento de privilegios, ESP32 e higiene de credenciales. |
| `npm run test:p091` | **PASS** | **20/20** casos de prueba P091 superados. |

---

## 2. Detalle de los 20 casos de prueba P091 (`tests/test_p091_esp32_integration.ts`)

| ID | Caso verificado | Estado | Tipo de verificación |
| --- | --- | --- | --- |
| `P091-01` | Reconocimiento del nodo físico existente (`device_38A839E81F84`) fusionando `/diagnostico/esp32_p087` | **PASS** | Automatizada local |
| `P091-02` | Lectura y escritura autenticada del UID `tJgRrlKRwPQOWCkdJiWA54B0JN33` en `/diagnostico/esp32_p087` y `/dispositivos/device_38A839E81F84` | **PASS** | Reglas RTDB deterministas |
| `P091-03` | Actualización en vivo de las 4 variables (`CO`, `PM2_5`, `temperatura`, `humedad`) | **PASS** | Automatizada local |
| `P091-04` | Detección estricta de desconexión tras >20 s sin `last_update_server` (nunca en línea solo por existir en RTDB) | **PASS** | Automatizada local |
| `P091-05` | Reconexión automática al recibir marca temporal `last_update_server` vigente (s o ms) | **PASS** | Automatizada local |
| `P091-06` | Lectura y fusión de `/diagnostico/esp32_p087/historial` junto a `/historial_telemetria` sin sobrescribir legado | **PASS** | Automatizada local |
| `P091-07` | Preparación y submuestreo equilibrado (`downsampleChartPoints`) para gráficos históricos | **PASS** | Automatizada local |
| `P091-08` | Cero duplicación de dispositivos (solo existe `device_38A839E81F84`, sin crear nodo `esp32_p087`) | **PASS** | Automatizada local |
| `P091-09` | Conservación de organización, faena, sector, cuadrilla y estado de asignación | **PASS** | Automatizada local |
| `P091-10` | Conservación de vínculo con empresa, faena y metadatos de asignación/contrato | **PASS** | Automatizada local |
| `P091-11` | Aislamiento entre organizaciones sobre `/diagnostico/esp32_p087`, historial y cliente web | **PASS** | Reglas + lógica cliente |
| `P091-12` | Matriz de permisos para los 5 roles (`superadmin`, `admin_minesafe`, `admin`, `supervisor`, `operador`) | **PASS** | Reglas RTDB deterministas |
| `P091-13` | Bloqueo de escrituras indebidas del UID ESP32 en usuarios, contratos, organizaciones, alertas, config y otros equipos | **PASS** | Reglas RTDB deterministas |
| `P091-14` | Acceso no autenticado denegado en lectura y escritura de `/diagnostico/esp32_p087` e historial | **PASS** | Reglas RTDB deterministas |
| `P091-15` | Historial `append-only` para el ESP32 (permite agregar nuevos puntos; deniega sobrescritura y borrado) | **PASS** | Reglas RTDB deterministas |
| `P091-16` | `CO = 4095` tratado como saturación ADC / medición no válida (sin escalar a estado crítico ni alertas) | **PASS** | Automatizada local |
| `P091-17` | Lecturas DHT11 inválidas / `NaN` / fuera de rango registradas en `faultFields` sin romper el mapeo | **PASS** | Automatizada local |
| `P091-18` | Diferenciación explícita entre nodo físico de banco (`simulado: false`) y nodo simulado (`simulado: true`) | **PASS** | Automatizada local |
| `P091-19` | Telemetría de banco (`isBenchTelemetry: true`) totalmente aislada del motor `alertEngine` | **PASS** | Automatizada local |
| `P091-20` | Clasificación de enlace híbrido (`wifi_directo`, `espnow_gateway`, `desconectado`, `origen_desconocido`) y verificación de ausencia de afirmaciones `Sharp GP2Y10` en módulos clave | **PASS** | Automatizada + auditoría estática |

---

## 3. Separación estricta: qué NO ha sido probado en este entorno

Para mantener total rigor técnico y no presentar como verificado lo que requiere hardware o infraestructura externa:

1. **Firebase Emulator Suite (JVM):** No ejecutado en este contenedor por ausencia de Java JDK 21+. Las reglas RTDB fueron validadas mediante validación sintáctica JSON (`npm run validate:firebase`) y evaluador determinista completo (`test:p085` + `test:p091`).
2. **Proyecto real `minefase-fc5f5`:** Las reglas `database.rules.json` **no fueron publicadas automáticamente**; la validación real en vivo requiere publicación manual (ver `P091_GUIA_DESPLIEGUE.md`).
3. **Pruebas físicas en banco con ESP32 y Gateway:**
   - Emisión en vivo desde el hardware físico `device_38A839E81F84` hacia `/diagnostico/esp32_p087` e historial con navegador cerrado: **PENDIENTE DE PRUEBA EN BANCO**.
   - Reenvío ESP-NOW a través de `gateway_ESP32_DEVKIT_V1` con la nueva autenticación Firebase Auth: **PENDIENTE DE PRUEBA EN BANCO**.
   - Validación física de Matriz LED MAX7219, Audio I2S y Pantalla TFT ST7789 con y sin Wi-Fi: **PENDIENTE DE PRUEBA EN BANCO**.
