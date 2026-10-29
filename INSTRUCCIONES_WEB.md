# Actualización de la demo existente en Render

Extraiga este ZIP dentro del proyecto actual, junto a public_demo.py. No es un proyecto independiente: utiliza el HTML, estilos, logo y avatar ya existentes. El arranque local `local_server.py` sigue disponible.

## Publicar

En la terminal del proyecto:

```powershell
git add .gitignore .python-version public_demo.py web_services.py preparar_web.py requirements-web.txt local_engine.py gunicorn.conf.py render.yaml web/local-app.js web/local.css INSTRUCCIONES_WEB.md
git commit -m "Habilitar flujo web con microfono y camara del cliente"
git push origin main
```

En Render, abra el servicio existente y vaya a Settings / Build & Deploy. Configure:

- Build Command: `pip install -r requirements-web.txt && python preparar_web.py`
- Start Command: `gunicorn -c gunicorn.conf.py public_demo:app`

Guarde los cambios. Si no empieza un despliegue con esos comandos, seleccione Manual Deploy / Deploy latest commit. El archivo render.yaml incluye estos valores, pero un servicio creado manualmente puede requerir cambiarlos en el panel. Si existe una variable PYTHON_VERSION, use 3.11.18 para que coincida con .python-version.

La preparación descarga Whisper tiny multilingüe. No suba models/, .venv/, .env ni local_data/ a GitHub. El ZIP no contiene modelos, credenciales ni datos de usuarios. No cambie a un plan pagado para ejecutar estas instrucciones.

## Probar desde el celular

Cuando Render indique Live, abra su URL HTTPS directamente en Chrome o Safari (no dentro de WhatsApp). Recargue, pulse Comenzar atención y permita el micrófono. Diga «quiero obtener mi firma electrónica», después «solo para firmar documentos». Abra la cámara desde las opciones del documento y otorgue su permiso. La cámara preferida es la trasera.

La cámara y el micrófono son los del celular. Las capturas y el audio se envían al servidor Render para OCR y transcripción, respectivamente; no se guardan como archivos. Use documentos ficticios para la prueba pública. El servidor no necesita periféricos físicos, y puede apagar el servidor Windows y Cloudflare después de que Render esté disponible.

La voz de salida sigue usando una voz LOCAL en español del dispositivo, cuando esté disponible. Si no existe, las preguntas aparecen por escrito y el micrófono puede funcionar igualmente. No se activa reconocimiento remoto del navegador ni se contratan APIs de voz. El avatar continúa siendo una imagen estática.

## Recursos y límites

Se usa Whisper tiny INT8, un solo modelo residente (OCR o voz) y una sola inferencia simultánea para reducir memoria. La primera captura después de cambiar de tarea puede tardar mientras se carga el modelo. Esto no garantiza tiempos rápidos ni que el plan gratuito soporte cualquier carga; las pruebas reales de latencia y memoria quedan pendientes en Render. Una captura no debe superar 35 segundos de audio o 4 millones de píxeles para OCR. La cámara del cliente limita su captura a 1280 píxeles de ancho.

Registro Civil, SRI, pagos, biometría y emisión siguen simulados. Las aprobaciones de prueba requieren sus botones explícitos. El texto «ya pagué» no aprueba un pago. La lectura OCR no valida identidad ni vigencia documental. Las solicitudes derivadas guardadas en el disco temporal de Render pueden perderse al reiniciar o desplegar; no es una cola de atención productiva.

Se conservan cookies de sesión, validación de origen y token; las rutas de cámara/voz requieren una atención activa. El paquete fue comprobado con pruebas del servidor para permisos, sesiones, acceso a OCR y flujo hasta el correo. Las pruebas de OCR/voz con dispositivos físicos y el build final deben completarse en el despliegue.
