# Validación de entrega v0.2

- 15 pruebas automatizadas de flujo y HTTP: correctas.
- Sintaxis JavaScript verificada.
- Recorrido completo probado en Chromium: identidad ficticia, correo, facturación,
  vigencia, pago pendiente, confirmación, biometría no aprobada, ayuda, regreso,
  biometría aprobada, emisión simulada, descarga explicada y finalización.
- Sin errores JavaScript en esa prueba y sin solicitudes externas de la interfaz.
- Fuentes Montserrat locales cargadas correctamente.
- Animación flotante, pausa y prefers-reduced-motion verificados.
- Revisión visual en escritorio 1440×900 y 1366×768 y móvil 390×844.
- Sin desbordamiento horizontal en los tamaños probados.
- No se probaron modelos LLM, TTS ni STT; esta entrega se concentra en la interfaz.
- El flujo y las validaciones siguen siendo de demostración, sin servicios SD.

Para informar los recursos del equipo: `py diagnostico.py` en Windows.
