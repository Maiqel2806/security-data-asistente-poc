# Asistente digital — POC para Security Data

Prototipo independiente para evaluar la experiencia de atención. No es el portal
oficial de Security Data ni permite contratar o emitir firmas reales.

## Qué se puede probar

- Bienvenida animada y retrato ficticio generado con IA.
- Opciones laterales y chat alternativo sin cubrir a la asesora.
- Recorrido simulado para persona natural, con correo `alex@example.com`.
- Facturación, pago, biometría, emisión y derivación simulados.

La demo pública **no tiene LLM, reconocimiento de voz ni voz de salida**.
Para avanzar use **Ver opciones**. El chat reconoce algunas intenciones simples;
las instrucciones se consultan en el menú izquierdo. No introduzca datos reales.

## Desarrollo local

Python 3.10 o superior. No necesita dependencias para el modo local básico:

```sh
python server.py
```

Abra http://127.0.0.1:8765. La configuración opcional de modelos locales está
en [README_LOCAL.md](README_LOCAL.md). Las funciones de IA locales nunca se
exponen automáticamente en la demo pública.

## Publicación en Render

1. Suba los archivos a la raíz de `Maiqel2806/security-data-asistente-poc`.
2. En Render elija **New > Web Service**, conecte el repositorio y seleccione `main`.
3. Runtime: **Python 3**. Root directory: vacío.
4. Build: `pip install -r requirements.txt`.
5. Start: `gunicorn -c gunicorn.conf.py public_demo:app`.
6. Seleccione el plan **Free**, health check `/healthz` y cree el servicio.

También se incluye `render.yaml` para configurar el servicio mediante Blueprint.
Render proporciona `PORT` y `RENDER_EXTERNAL_HOSTNAME` automáticamente.
No configure claves de proveedores, modelos ni datos personales para esta demo.

Use la URL HTTPS que Render muestre al completar el despliegue, no la URL del
repositorio. El plan gratuito puede dormir tras inactividad; la primera visita
puede tardar alrededor de un minuto. No sirve para medir latencia del piloto local.
Documentación: https://render.com/docs/free

## Pruebas

```sh
python -m unittest test_flow test_public_demo -v
```

Prueba local del modo público: `python public_demo.py`, en el mismo puerto 8765
(detenga primero el servidor local). En Windows se usa este comando para probar;
Gunicorn se ejecuta en el alojamiento Linux de Render.

## Límites de esta publicación

Sesiones en memoria, sin base de datos; se borran al reiniciar o al caducar.
Un solo proceso Gunicorn con cuatro hilos; no aumentar los workers sin cambiar
el almacén de sesiones. Límite de 200 sesiones y cinco por navegador.
Las sesiones se vinculan a una cookie y los cambios exigen un token de navegador.
La aplicación no registra cuerpos de mensajes ni guarda conversaciones en disco.
El proveedor de alojamiento puede conservar sus registros técnicos de acceso.

Las fuentes incluyen su licencia en `web/assets/Montserrat-OFL.txt`. La marca y
el logo identifican el caso de uso; no se concede una licencia sobre ellos.
Este repositorio no representa una aprobación corporativa del prototipo.
