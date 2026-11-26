# P091 — Contrato de Datos ESP32 ↔ Firebase RTDB ↔ MineSafe Web

## 1. Proyecto y rutas RTDB

- **Proyecto Firebase:** `minefase-fc5f5`
- **URL RTDB:** `https://minefase-fc5f5-default-rtdb.firebaseio.com`
- **Identidad Auth del nodo físico:**
  - Correo: `esp32-nodo-fisico@minesafe.example`
  - UID: `tJgRrlKRwPQOWCkdJiWA54B0JN33`
- **Identificadores de dispositivos:**
  - Nodo físico: `device_38A839E81F84`
  - Nodo simulado: `device_9F4C2A7E1B08`
  - Gateway ESP-NOW: `gateway_ESP32_DEVKIT_V1`

---

## 2. Ruta activa de banco: `/diagnostico/esp32_p087`

### 2.1 Telemetría en vivo (método recomendado: `PATCH`)

- **Endpoint REST:** `PATCH https://minefase-fc5f5-default-rtdb.firebaseio.com/diagnostico/esp32_p087.json?auth=<ID_TOKEN>`
- **Frecuencia recomendada:** cada **2 segundos** (la web marca desconexión si `now - last_update_server > 20000 ms`, timeout configurable).
- **Importante:** utilizar `PATCH` (nunca `PUT` sobre `/diagnostico/esp32_p087.json`), ya que un `PUT` sobre el nodo padre intentaría sobrescribir la subruta `/diagnostico/esp32_p087/historial`, operación bloqueada por las reglas de seguridad.

```json
{
  "CO": 245,
  "PM2_5": 32,
  "temperatura": 24.4,
  "humedad": 51,
  "simulado": false,
  "origen": "esp32_p087_banco",
  "via": "WIFI_DIRECTO",
  "via_puente": false,
  "gateway_id": "",
  "saltos_espnow": 0,
  "msgId": 1042,
  "fecha": "25/11/2026",
  "hora": "16:20:00",
  "fecha_hora": "2026-11-25 16:20:00",
  "timestamp_unix": 1765000000,
  "last_update_server": { ".sv": "timestamp" }
}
```

### 2.2 Validaciones exigidas en `database.rules.json`

| Campo | Tipo | Rango / Restricción | Significado técnico |
| --- | --- | --- | --- |
| `CO` | `number` | `0 .. 4095` | Lectura analógica bruta ADC 12 bits del sensor MQ-2. `4095` = saturación ADC / medición no válida (no equivale a ppm). |
| `PM2_5` | `number` | `0 .. 4095` | Estimación de polvo del sensor óptico OPEN-SMART (sin calibración gravimétrica oficial). |
| `temperatura` | `number` | `-40 .. 100` | Temperatura en °C (DHT11). |
| `humedad` | `number` | `0 .. 100` | Humedad relativa en % (DHT11). |
| `simulado` | `boolean` | `true \| false` | `false` para nodo físico en banco; `true` para simulador. |
| `origen` | `string` | `1 .. 120` chars | Identificador de origen del firmware (ej. `esp32_p087_banco`). |
| `last_update_server` | `number` | `> 0` (`{ ".sv": "timestamp" }`) | Marca temporal de servidor RTDB en milisegundos (fuente de verdad para conectividad). |
| `via` | `string` | `0 .. 60` chars | Medio de transporte (`WIFI_DIRECTO`, `ESP_NOW`, `GATEWAY_ISOLATED`, etc.). |
| `via_puente` | `boolean` | `true \| false` | Indica si la trama fue reenviada por puente/gateway. |
| `gateway_id` | `string` | `0 .. 80` chars | ID del gateway receptor cuando aplica (`gateway_ESP32_DEVKIT_V1`). |
| `saltos_espnow` | `number` | `0 .. 16` | Conteo de saltos ESP-NOW. |
| `msgId` | `number \| string` | `>= 0` o `<= 64` chars | Identificador de secuencia del mensaje. |
| `fecha`, `hora`, `fecha_hora` | `string` | `<= 64` chars | Sellos legibles opcionales. |
| `timestamp_unix` | `number` | `>= 0` | Época Unix en segundos o milisegundos. |

---

## 3. Historial de banco (append-only): `/diagnostico/esp32_p087/historial`

- **Endpoint REST:** `POST https://minefase-fc5f5-default-rtdb.firebaseio.com/diagnostico/esp32_p087/historial.json?auth=<ID_TOKEN>`
- **Frecuencia recomendada:** cada **60 segundos** (o al superar variación significativa).
- **Índice RTDB definido:** `".indexOn": ["timestamp"]`.
- **Política de seguridad:** el UID `tJgRrlKRwPQOWCkdJiWA54B0JN33` solo puede **agregar** entradas nuevas (`!data.exists() && newData.exists()`). No puede modificar ni eliminar muestras existentes.

```json
{
  "co": 245,
  "pm25": 32,
  "temperatura": 24.4,
  "humedad": 51,
  "timestamp": { ".sv": "timestamp" }
}
```

---

## 4. Ruta operacional estándar (compatibilidad directa y transición futura)

La cuenta autenticada `tJgRrlKRwPQOWCkdJiWA54B0JN33` también queda autorizada con mínimo privilegio en:
- `/dispositivos/device_38A839E81F84`: `PATCH` de telemetría (sin permiso para borrar el nodo ni alterar `organizationId`).
- `/historial_telemetria/device_38A839E81F84/$sampleTs`: inserción `append-only` (`!data.exists() && newData.exists()`).

De este modo, la plataforma funciona hoy mismo leyendo `/diagnostico/esp32_p087` + `/diagnostico/esp32_p087/historial` y quedará inmediatamente compatible si en una iteración futura el firmware migra a escribir directamente en `/dispositivos/device_38A839E81F84`.

---

## 5. Alcance de permisos del nodo físico (principio de mínimo privilegio)

- **Permitido para UID `tJgRrlKRwPQOWCkdJiWA54B0JN33`:**
  - Leer y hacer `PATCH` de campos de telemetría en `/diagnostico/esp32_p087`.
  - Agregar (append-only) muestras en `/diagnostico/esp32_p087/historial/$histId`.
  - Leer y actualizar telemetría en `/dispositivos/device_38A839E81F84` (sin borrar ni cambiar `organizationId`).
  - Agregar (append-only) muestras en `/historial_telemetria/device_38A839E81F84/$sampleTs`.
- **Explícitamente denegado para UID `tJgRrlKRwPQOWCkdJiWA54B0JN33`:**
  - Lectura o escritura en `/usuarios`, `/organizaciones`, `/contratos`, `/asignaciones`, `/alertas`, `/configuracion_plataforma`, `/auditoria_seguridad`, `/dispositivos/device_9F4C2A7E1B08` o cualquier otro dispositivo.
  - Eliminación o sobrescritura de registros históricos previos.

---

## 6. Nota sobre reenvío ESP-NOW mediante Gateway

Los campos `via`, `via_puente`, `gateway_id`, `saltos_espnow` y `msgId` ya están soportados en las reglas, el mapeador y la interfaz visual. Sin embargo, el reenvío real del gateway `gateway_ESP32_DEVKIT_V1` utilizando la nueva autenticación por cuenta Firebase Auth **no ha sido probado físicamente** y permanece como pendiente externo.
