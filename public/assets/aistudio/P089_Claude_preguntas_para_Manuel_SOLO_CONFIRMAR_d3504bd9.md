# P089 · Preguntas para Manuel (solo confirmar)

- **Para:** Manuel
- **De:** Carva / Claude
- **Fecha:** 26-11-2026
- **Reemplaza:** las secciones 2 y 3 de P078 (que estaban mal redactadas: parecían tareas)

## ⚠️ Lee esto primero (y pásaselo también a tu ChatGPT)

**NO HAY QUE CAMBIAR CÓDIGO.** Ni la web, ni el firmware, ni las reglas de Firebase, ni las credenciales.

Este documento es **solo para el informe**. Necesitamos saber **cómo está el sistema hoy**, tal como funciona. Si algo no está hecho, la respuesta correcta es **"No"** y en el informe lo dejamos como pendiente o mejora futura. Un "No" está bien; un cambio de código a última hora puede romper la demo del 9-12.

Instrucción para la IA que use Manuel:
> Tu tarea es solo leer y responder. No propongas ni apliques cambios en el código, en Firebase ni en las placas. Si algo no existe, responde "No" y explica en una línea cómo está hoy.

Si ya cambiaste algo por la P078, **avísale a Carva qué cambiaste** (archivos, fecha y si lo subiste al repositorio) antes de seguir.

---

## 1. Lo que cambiaste hoy (lo más urgente)

| # | Pregunta | Respuesta |
|---|---|---|
| 1.1 | ¿Cambiaste código por la P078? Sí / No | |
| 1.2 | Si fue Sí: ¿qué archivos o qué partes? | |
| 1.3 | ¿Lo subiste al repositorio? ¿En qué commit? | |
| 1.4 | ¿Cambiaste credenciales o reglas en la consola de Firebase? | |
| 1.5 | ¿La aplicación y las placas siguen funcionando igual que antes? Sí / No / No sé | |

## 2. Confirmar datos (responder Sí / No / el dato)

| # | Pregunta | Respuesta |
|---|---|---|
| 2.1 | ¿Qué versión está cargada hoy en el nodo y en el gateway? (commit o fecha) | |
| 2.2 | ¿El sensor de temperatura y humedad es DHT11 o DHT22? | |
| 2.3 | El sensor de polvo: ¿el elemento interior es Sharp GP2Y1010? ¿De dónde salió la fórmula (Vprom − 0,66) × 588,2? | |
| 2.4 | ¿Las credenciales de Firebase siguen escritas dentro del firmware? Sí / No | |
| 2.5 | ¿Las reglas de seguridad que están en el repositorio son las mismas publicadas en la consola de Firebase? Sí / No / No sé | |
| 2.6 | ¿El correo del Superadministrador está verificado en Firebase? Sí / No | |
| 2.7 | Si se apaga la alarma desde la web durante un crítico, ¿vuelve a sonar sola? Sí / No | |
| 2.8 | Los umbrales que se cambian en la web, ¿llegan al nodo? (según P084, no: el firmware tiene umbrales fijos) Confirmar Sí / No | |

## 3. Evidencias que ya tengas (no hacer pruebas nuevas que requieran cambiar código)

Si ya tienes alguna de estas cosas, mándalas. Si no la tienes, escribe "No tengo".

| # | Evidencia | ¿La tienes? |
|---|---|---|
| 3.1 | Video o captura de una lectura que pasó por el gateway hasta el panel web | |
| 3.2 | Video de la alarma sonando en crítico con Wi-Fi | |
| 3.3 | CSV o capturas del MQ-2 (lecturas en 4095) | |
| 3.4 | Captura de la consola Firebase **sin tu correo personal** (la de image7 lo muestra) | |
| 3.5 | Salida del monitor serie con fecha y hora | |

---

Cuando termines, devuélvele este mismo archivo a Carva con la columna «Respuesta» llena.
