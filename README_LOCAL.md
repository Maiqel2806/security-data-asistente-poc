# Security Data — POC local v0.2

Prototipo independiente para desarrollar un operador digital de persona natural.
No es un producto oficial ni está conectado a Security Data. Solo datos ficticios.

## 1. Primer inicio: sin modelos ni dependencias de Python adicionales

Requiere Python 3.10 o posterior. Abra esta carpeta en VS Code y su terminal.

Windows:

```powershell
py --version
py server.py
```

Linux/macOS:

```bash
python3 --version
python3 server.py
```

Abra http://127.0.0.1:8765 en el navegador de la MISMA máquina donde inició
el servidor. Si utiliza escritorio remoto, abra allí el navegador.
No exponga este servidor de desarrollo a internet ni a la red de la oficina.
Para detener: Ctrl+C. No necesita claves API, npm ni servicios cloud.

El recorrido por tarjetas funciona sin internet, sin Ollama y sin GPU.
Este modo es una demostración determinista, NO una conversación con IA.

## 2. Recorrido de demostración

1. Mueva el mouse o presione Comenzar atención.
2. Obtener mi firma → Mis trámites personales.
3. Usar documento de prueba → confirmar datos ficticios.
4. Escriba `alex@example.com`.
5. Facturación a mi nombre o tercero ficticio.
6. Elija una vigencia. USD 20/35 son valores ILUSTRATIVOS, no tarifas SD.
7. Revise el resumen → pago simulado → biometría simulada → emisión simulada.
8. Lea la explicación de descarga y clave → Finalizar.

Pruebe además pago pendiente, biometría no aprobada, ayuda humana y perfil de
empresa. La cuenta del portal, pago, biometría, consulta de identidad y emisión
NO son reales. No se generan archivos criptográficos ni se envían correos.
El orden toma el recorrido online descrito por el responsable: pago antes de
biometría. La consulta por cédula/código es una propuesta de integración tomada
del proceso presencial. Su incorporación al portal queda pendiente de validar.

## 3. Conectar el modelo local

Instale Ollama desde https://ollama.com/ en su máquina de desarrollo.
La elección y descarga del modelo dependen de RAM, GPU/VRAM y licencia.
No se incluye un modelo en este ZIP. No se instala ni descarga automáticamente.
Utilice un modelo de conversación descargado con soporte de JSON estructurado.

Consulte los modelos instalados:

```text
ollama list
```

Detenga el servidor y configure el nombre EXACTO de un modelo local instalado:

Windows PowerShell (sustituya el texto entre comillas):

```powershell
$env:SD_MODEL="NOMBRE_LOCAL:ETIQUETA"
py server.py
```

Linux/macOS:

```bash
SD_MODEL='NOMBRE_LOCAL:ETIQUETA' python3 server.py
```

En Configuración compruebe que aparezca disponible en Ollama. Esto comprueba
su presencia, no calidad ni rendimiento. Haga luego preguntas como:
"No entiendo la diferencia entre la clave del portal y la de la firma".

El conector llama exclusivamente a http://127.0.0.1:11434, no usa credenciales
externas y no necesita la biblioteca OpenAI. No seleccione modelos cloud.
Compruebe el funcionamiento con internet desconectado una vez descargado todo.
Ollama debe estar configurado para uso exclusivamente local. La política de
red de sus dependencias queda bajo la configuración del equipo anfitrión.

La IA propone acciones de una lista permitida y contesta dudas breves; el código
controla el avance. Las acciones de pago/biometría/emisión requieren tarjetas de
simulación explícitas: un mensaje "ya pagué" nunca aprueba el pago.
Atajos comunes como "quiero una firma" funcionan con reglas sin llamar al LLM.
Si el modelo falla, el recorrido por tarjetas permanece disponible.

Límite v0.1: el LLM recibe el paso y el historial de estados, pero no un historial
completo de conversación. Todavía no extrae múltiples campos de una frase ni
usa una base documental aprobada. Las respuestas generadas requieren evaluación.

## 4. Entrada de voz opcional, exclusivamente local

Se incluye un adaptador de faster-whisper. No utiliza SpeechRecognition del
navegador ni un servicio de dictado online. Requiere instalar paquetes y descargar
un modelo compatible previamente; su elección se hará según el equipo.

```text
python -m pip install faster-whisper
```

Configure `SD_WHISPER_PATH` con una carpeta EXISTENTE que contenga un modelo
CTranslate2 de Whisper (no una ruta inventada ni simplemente un archivo .pt).
El servidor carga con `local_files_only=True`, CPU e int8; no descarga modelos
durante la atención. Ejemplo PowerShell tras descargar el modelo:

```powershell
$env:SD_WHISPER_PATH="C:\modelos\whisper-local"
py server.py
```

Pulse Hablar, permita el micrófono, grabe (máximo 30 segundos), termine y revise
la transcripción antes de Enviar. Esta primera implementación es por turnos,
no conversación de voz en tiempo real. No se incluye voz de salida/TTS.
Si accede por escritorio remoto, el micrófono debe estar redirigido a esa sesión.

## 5. Qué está implementado y qué queda pendiente

Implementado: UI adaptativa en español, bienvenida, tarjetas y teclado, sesiones
independientes en memoria, reinicio y borrado, ayuda simulada, ruta de tercero,
plan/precio de prueba, estados de espera/fallo, guardas de emisión, protección
contra dobles solicitudes con revisión de estado, conector Ollama y adaptador
opcional de voz local, reloj de sesión e indicador de inactividad.

Pendiente antes de un piloto con público: avatar fotorrealista y sincronización,
voz sintetizada local, escucha interrumpible, rendimiento con el hardware real,
información SD aprobada, integración real y control de errores de proveedores,
acceso/cuenta del portal, correo verificable, OCR, medidas de producción,
pruebas de accesibilidad y usabilidad, concurrencia real y recuperación ante
reinicios. La captura y validez de cédula, los seis dígitos dactilares y los
pasaportes NO están implementados: se usan fixtures ficticios.

La cabecera utiliza el logo publicado en la web de Security Data como referencia
de marca para esta POC independiente. La esfera SD del panel de atención sigue
siendo un marcador visual; no es un avatar humano. No se usan fotos de personas.

No hay base de datos ni analítica persistente. Los datos desaparecen al finalizar
o reiniciar. El cliente ofrece continuar tras 4 minutos inactivo y cierra al quinto;
el servidor expira sesiones sin solicitudes tras 15 minutos, limpiándolas en la
siguiente petición. No deje el prototipo abierto con datos reales.

## 6. Verificación

```text
python -m unittest -v test_flow.py
```

Pruebas de flujo, aislamiento de estados, pagos pendientes, bloqueo de emisión,
correos ficticios, derivaciones, doble envío y fallo del modelo. Los tests del
modelo usan dobles de prueba; NO demuestran calidad de un LLM ni rendimiento de
Whisper. La prueba funcional real de ambos se hará en su servidor.

Antes de presentar: probar el recorrido completo con y sin internet, las tres
rutas de falla, reset entre clientes, lector/teclado, zoom 200%, micrófono y
latencia. El tiempo de simulación no sirve para prometer el tiempo de emisión real.

## Fuentes técnicas

- https://docs.ollama.com/api/chat
- https://github.com/SYSTRAN/faster-whisper

## Próximo paso

Enviar sistema operativo, RAM, GPU/VRAM, espacio libre y forma de acceso al
servidor para seleccionar modelos y cerrar la instalación de voz + LLM.

## Actualización visual v0.2

- Pantalla DISPONIBLE centrada, flotación continua suave y aros orbitales.
- Colores extraídos del CSS público de SD: #0f2840, #1a5472, #95bd1e.
- Montserrat en pesos 400–800 incluida localmente; licencia OFL en web/assets.
- Logo obtenido de la cabecera de https://www.securitydata.net.ec/.
- Sin recursos remotos durante la ejecución de la interfaz.
- Botón para pausar animaciones y respeto de prefers-reduced-motion.
- Tarjetas grandes, controles legibles y diseño adaptativo.
- Mover el mouse sobre la barra superior no inicia accidentalmente la atención.

Para actualizar desde v0.1: detenga el servidor con Ctrl+C, descomprima esta
versión en otra carpeta y ejecute `py server.py` desde ella. Abra de nuevo
http://127.0.0.1:8765. Si ve el diseño anterior, recargue con Ctrl+F5.
También puede reemplazar la carpeta web completa y server.py en una copia
de su proyecto anterior. No es necesario instalar nuevas dependencias.
