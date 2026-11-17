# Manuel: AI Studio (la IA que tiene el código de la web)

> **Acceso:** tienes la carpeta `Proyecto Titulo` en Google Drive. Los archivos para subir a tu IA están en `04_Tareas/REPARTO/PAQUETE_MANUEL/`. Donde este archivo dice «mándaselo a Sebastián», mejor guarda el resultado en Drive (capítulos en `07_Redaccion_Capitulos/`; respuestas de tus IA en `07_Redaccion_Capitulos/RESPUESTAS_MANUEL.md`) y avisa en el grupo. No edites archivos de otros.

**Para qué:** confirmar con el código lo que el informe dice de la plataforma. Es un solo mensaje. Las respuestas anteriores que mandaste (niveles, umbrales, PM2.5 sin conversión, batería del visor 3D) ya están anotadas; esto es lo que falta.

## 1. Preguntas (pegar en el proyecto de AI Studio de la web)

```
Necesito documentar la plataforma MineSafe en el informe de título. Responde cada pregunta SOLO con lo que está en el código de este proyecto, indicando el archivo. Si algo no está en el código, escribe "no está en el código". No modifiques nada: solo responde. Responde con el número de cada pregunta.

1. Lista todas las ramas (rutas) de Realtime Database que la aplicación lee o escribe, con una línea que diga para qué sirve cada una.
2. Lista todas las pantallas o vistas de la aplicación, con su nombre, para qué sirve y qué rol puede verla (Operador, Administrador, Superadministrador).
3. ¿Qué campos espera recibir la aplicación de cada dispositivo (nombres exactos y unidad de cada uno)?
4. ¿Con qué criterio marca un dispositivo como desconectado? Indica el valor por defecto y si se puede configurar.
5. ¿Quién escribe el historial de mediciones (la aplicación web abierta u otro componente) y cada cuánto?
6. ¿La aplicación envía los umbrales configurados hacia los dispositivos? ¿En qué ruta los deja?
7. ¿La aplicación lee o muestra algún dato de la batería del gateway fuera del visor 3D?
8. Visor 3D: ¿qué componentes representa en el nodo y en el gateway (placas, sensores, pantalla, batería, antena), con los modelos que tenga escritos?
9. ¿Qué lenguaje y bibliotecas principales usa el proyecto (con versión, según package.json)?
10. ¿En qué lugares de la interfaz todavía aparece "CO", "monóxido" o "µg/m³"?
11. Valores actuales del gas en: el banner de emergencia global, el nivel crítico del motor de alertas y el estado crítico de la tarjeta del dispositivo.
12. ¿Qué pruebas automáticas tiene el proyecto y qué comprueban?
```

Manda la respuesta completa a Sebastián.

## 2. Cambios a la web (opcionales; los decides tú)

Los agentes del informe no piden cambios al código. Estas son solo las tres cosas que aparecieron al revisar el informe, por si quieres hacerlas:

1. Cambiar a ADC las etiquetas «µg/m³» que quedaron (banner de emergencia, simulacro, CSV y visor 3D).
2. Cambiar «CO» por «Gas».
3. Dejar en un mismo valor los tres umbrales del gas (banner en 1000, crítico en 1200 y tarjeta en 500).

Si haces alguno, avísale a Sebastián para que Codex revise la versión nueva.
