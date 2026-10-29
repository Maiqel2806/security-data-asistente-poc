'use strict';
const $=id=>document.getElementById(id);
let config={},session=null,state=null,busy=false,startedAt=0,lastActivity=Date.now(),idleArmed=Date.now()+1800;
let recorder=null,stream=null,recordTimer=null,recordingSession=null;
const stages={welcome:0,purpose:0,confirm_person:0,identity:1,review_identity:1,email:1,billing:1,third:1,plan:1,summary:1,payment:2,payment_pending:2,biometric:3,issue:4,issued:4,download:4,handoff:-1};
function notice(text){$('message').textContent=text;$('message').hidden=!text;}
function lock(on){busy=on;document.querySelectorAll('#active button,#active input').forEach(e=>e.disabled=on);$('mic').disabled=on||!config.voice;$('presenceState').textContent=on?'Estoy preparando el siguiente paso…':(config.voice?'Puede hablar, escribir o elegir una opción.':'Puede escribir o elegir una opción.');}
async function api(path,payload){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-SD-Token':config.token},body:JSON.stringify(payload)});const data=await r.json();if(!r.ok)throw new Error(data.error||'No se pudo completar la solicitud.');return data;}
function paint(s){state=s;$('title').textContent=s.title;$('description').textContent=s.description;$('stepLabel').textContent=s.step==='welcome'?'BIENVENIDO':'SU SOLICITUD · PERSONA NATURAL';$('back').hidden=!s.can_back;$('choices').replaceChildren();for(const c of s.choices){const b=document.createElement('button');b.className='card';b.append(document.createTextNode(c.label));const arrow=document.createElement('span');arrow.textContent='↗';b.append(arrow);b.onclick=()=>act(c.id);$('choices').append(b);}notice(s.note);$('input').value='';$('inputLabel').textContent=s.step==='email'?'Correo ficticio de la demostración':'Escriba su solicitud o pregunta';$('input').placeholder=s.step==='email'?'alex@example.com':'Por ejemplo: necesito una firma electrónica';$('input').type=s.step==='email'?'email':'text';$('summary').replaceChildren();$('summary').hidden=!['summary','handoff','issued','download'].includes(s.step);if(!$('summary').hidden){for(const [k,label] of Object.entries({name:'Solicitante',email:'Correo',billing:'Factura',plan:'Vigencia',price:'USD de prueba',derivation:'Motivo'})){if(s.data[k]!==undefined){const p=document.createElement('p'),strong=document.createElement('strong');strong.textContent=label+': ';p.append(strong,document.createTextNode(String(s.data[k])));$('summary').append(p);}}}document.querySelectorAll('.progress span').forEach((e,i)=>e.classList.toggle('current',i===stages[s.step]));$('title').focus({preventScroll:true});}
async function start(){if(!config.token||session||busy||$('settings').open||Date.now()<idleArmed)return;lock(true);try{const data=await api('/api/start',{});session=data.session;startedAt=Date.now();lastActivity=Date.now();$('idle').hidden=true;$('active').hidden=false;paint(data.state);}catch(e){alert(e.message);}finally{lock(false);}}
async function act(action,value=''){if(busy||!session)return;stopRecording(true);lock(true);lastActivity=Date.now();try{const result=await api('/api/action',{session,revision:state.revision,action,value});if(result.finished){reset();return;}paint(result);}catch(e){notice(e.message);}finally{lock(false);}}
function reset(){stopRecording(true);session=null;state=null;document.querySelectorAll('dialog').forEach(d=>d.close());$('input').value='';$('summary').replaceChildren();$('choices').replaceChildren();$('title').textContent='';$('description').textContent='';notice('');$('active').hidden=true;$('idle').hidden=false;idleArmed=Date.now()+1800;}
async function end(){if(busy)return;lock(true);try{if(session)await api('/api/end',{session});reset();}catch(e){notice(e.message);$('finishDialog').close();}finally{lock(false);}}
function stopRecording(discard=false){if(discard)recordingSession=null;clearTimeout(recordTimer);if(recorder&&recorder.state==='recording')recorder.stop();if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;$('mic').textContent='Hablar';$('mic').classList.remove('recording');}
async function mic(){if(recorder&&recorder.state==='recording'){stopRecording();return;}if(!config.voice)return;try{stream=await navigator.mediaDevices.getUserMedia({audio:true});const chunks=[];recorder=new MediaRecorder(stream);recordingSession=session;recorder.ondataavailable=e=>chunks.push(e.data);recorder.onstop=async()=>{const sid=recordingSession;if(!sid||sid!==session)return;lock(true);try{const r=await fetch('/api/transcribe',{method:'POST',headers:{'X-SD-Token':config.token},body:new Blob(chunks,{type:recorder.mimeType})});const d=await r.json();if(!r.ok)throw new Error(d.error);if(session===sid){$('input').value=d.text;notice(d.text?'Revise lo que escuché y presione Enviar.':'No se escuchó una frase. Puede reintentar o escribir.');$('input').focus();}}catch(e){notice(e.message);}finally{lock(false);}};recorder.start();$('mic').textContent='Terminar grabación';$('mic').classList.add('recording');notice('Estoy escuchando. La grabación se detendrá a los 30 segundos.');recordTimer=setTimeout(()=>stopRecording(),30000);}catch(e){stopRecording(true);notice('No se pudo abrir el micrófono. Revise el permiso del navegador o escriba su respuesta.');}}
$('start').onclick=()=>{idleArmed=0;start();};$('back').onclick=()=>act('back');$('human').onclick=()=>act('help');$('chat').onsubmit=e=>{e.preventDefault();const value=$('input').value.trim();if(value)act('text',value);};$('end').onclick=()=>$('finishDialog').showModal();$('confirmEnd').onclick=end;$('keepSession').onclick=()=>$('finishDialog').close();$('moreTime').onclick=()=>{lastActivity=Date.now();$('idleWarning').close();};$('mic').onclick=mic;
let motionPaused=false;
try{motionPaused=localStorage.getItem('sd-motion-paused')==='true';}catch{}
function applyMotion(){document.body.classList.toggle('motion-paused',motionPaused);$('motionButton').textContent=motionPaused?'Activar animación':'Pausar animación';$('motionButton').setAttribute('aria-pressed',String(motionPaused));}
$('motionButton').onclick=()=>{motionPaused=!motionPaused;try{localStorage.setItem('sd-motion-paused',String(motionPaused));}catch{}applyMotion();idleArmed=Date.now()+1800;};
applyMotion();
$('settingsButton').onclick=()=>$('settings').showModal();$('closeSettings').onclick=()=>{$('settings').close();idleArmed=Date.now()+1800;};
setInterval(()=>{if(!session)return;const seconds=Math.floor((Date.now()-startedAt)/1000);$('elapsed').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0')+' · sesión de prueba';if(busy)return;const idle=(Date.now()-lastActivity)/1000;if(idle>240&&!$('idleWarning').open)$('idleWarning').showModal();if($('idleWarning').open){$('countdown').textContent=String(Math.max(0,Math.ceil(300-idle)));if(idle>=300)end();}},1000);
async function init(){try{const r=await fetch('/api/config');config=await r.json();if(config.public_demo)publicDemoLabels();$('mode').textContent=config.model_available?'Modelo local configurado':'Modo guiado · sin LLM activo';$('mic').disabled=!config.voice;for(const [label,value] of [['Modelo configurado',config.model||'Ninguno'],['Disponible en Ollama',config.model_available?'Sí':'No'],['Modelos locales detectados',config.installed.join(', ')||'Ninguno'],['Entrada de voz',config.voice?'Whisper local cargado':config.voice_error||'No configurada']]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;$('configInfo').append(dt,dd);}}catch(e){$('start').disabled=true;$('start').textContent='No se pudo conectar al servidor';}}
init();
// Orbe visual. Esta prueba no abre el micrófono.
(() => {
  const orb = document.querySelector(".orb");
  const mode = document.getElementById("mode");

  if (!orb || !mode || document.getElementById("orbPreview")) return;

  let frame = 0;

  const note = document.createElement("p");
  note.className = "orb-preview-note";
  note.setAttribute("role", "status");

  const button = document.createElement("button");
  button.id = "orbPreview";
  button.type = "button";
  button.className = "human orb-preview";
  button.textContent = "Probar animación del orbe";

  mode.after(button, note);

  // Se conectará al volumen real cuando implementemos la escucha.
  window.sdOrb = {
    set(state = "idle", volume = 0) {
      orb.dataset.state = state;
      const level = Math.min(1, Math.max(0, Number(volume) || 0));
      orb.style.setProperty("--voice", String(level));
    }
  };

  button.onclick = () => {
    cancelAnimationFrame(frame);
    const start = performance.now();

    note.textContent = "Vista previa de 5 segundos · sin micrófono";

    function animate(now) {
      const finished = now - start >= 5000;
      const closed = document.getElementById("active").hidden;

      if (finished || closed) {
        window.sdOrb.set("idle");
        note.textContent = "";
        return;
      }

      const simulatedVolume = .45 + .4 * Math.sin(now / 140);
      window.sdOrb.set("listening", simulatedVolume);
      frame = requestAnimationFrame(animate);
    }

    frame = requestAnimationFrame(animate);
  };
})();

/* === SD: avatar, opciones voluntarias y fondo animado === */
(() => {
  if (document.getElementById('sdLens')) return;

  const idle = document.getElementById('idle');
  const active = document.getElementById('active');
  const choices = document.getElementById('choices');
  const presence = document.querySelector('.presence');

  if (!idle || !active || !choices || !presence) return;

  // Avatar local: permanece durante toda la atención.
  const portrait = document.createElement('img');
  portrait.src = '/assets/asistente.png';
  portrait.alt =
    'Asesora virtual de Security Data, imagen generada con IA';
  portrait.className = 'sd-portrait';
  presence.append(portrait);

  document.querySelector('.assistant .eyebrow').textContent =
    'ASESORA VIRTUAL · IA';

  document.querySelector('.assistant-bottom p').textContent =
    'Escriba su solicitud o pulse Ver opciones. Puede pedir ayuda en cualquier momento.';

  // Las tarjetas aparecen solo cuando el cliente lo solicita.
  const toggle = document.createElement('button');
  toggle.id = 'sdOptions';
  toggle.type = 'button';
  toggle.className = 'primary';
  toggle.setAttribute('aria-controls', 'choices');

  function setOptions(open) {
    choices.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? 'Ocultar opciones' : 'Ver opciones';
  }

  choices.before(toggle);
  setOptions(false);

  toggle.onclick = () => setOptions(choices.hidden);

  // Cada nuevo cliente comienza con las tarjetas ocultas.
  new MutationObserver(() => {
    if (active.hidden) setOptions(false);
  }).observe(active, {
    attributes: true,
    attributeFilter: ['hidden']
  });

  // Fondo de lente: tres anillos con arcos y puntos luminosos.
  const canvas = document.createElement('canvas');
  canvas.id = 'sdLens';
  canvas.setAttribute('aria-hidden', 'true');
  idle.prepend(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let width = 0;
  let height = 0;
  let time = 0;
  let previous = 0;

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = idle.clientWidth;
    height = idle.clientHeight;

    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw();
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);

    const base = Math.min(width * 0.44, height * 0.62);

    ctx.save();
    ctx.translate(width / 2, height / 2);

    for (let i = 0; i < 3; i++) {
      const radius = base * (1 - i * 0.19);
      const angle = time * (i % 2 ? -0.55 : 0.38) + i * 1.8;

      ctx.save();
      ctx.rotate(angle + Math.sin(time * 0.45) * 0.25);
      ctx.strokeStyle = i === 1 ? '#95bd1e' : '#58c5e2';
      ctx.globalAlpha = 0.48;
      ctx.lineWidth = i === 1 ? 2 : 3;

      for (let j = 0; j < 3; j++) {
        ctx.beginPath();
        ctx.arc(
          0, 0, radius,
          j * 2.094,
          j * 2.094 + 1.2
        );
        ctx.stroke();
      }

      ctx.globalAlpha = 0.95;
      ctx.fillStyle = i === 1 ? '#b3db47' : '#a1ebff';
      ctx.beginPath();
      ctx.arc(radius, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  function frame(now) {
    const delta = Math.min((now - previous) / 1000 || 0, 0.05);
    previous = now;

    const paused =
      document.body.classList.contains('motion-paused');

    if (!idle.hidden && !document.hidden && !paused) {
      time += delta;
      draw();
    }

    requestAnimationFrame(frame);
  }

  new ResizeObserver(resize).observe(idle);
  requestAnimationFrame(frame);
})();

/* === SD: escenario de videoconferencia === */
(() => {
  const active = document.getElementById('active');
  const toggle = document.getElementById('sdOptions');
  const choices = document.getElementById('choices');
  const portrait = document.querySelector('.sd-portrait');
  const task = document.querySelector('#active .task');

  if (!active || !toggle || !choices || !portrait || !task) return;
  if (document.getElementById('sdDrawer')) return;

  // Usamos la misma imagen, ampliada al escenario completo.
  const stage = document.createElement('div');
  stage.className = 'sd-stage';
  stage.append(portrait);
  active.prepend(stage);

  // Barra superior flotante.
  const toolbar = document.createElement('nav');
  toolbar.className = 'sd-toolbar';
  toolbar.setAttribute('aria-label', 'Controles de atención');

  const label = document.createElement('span');
  label.className = 'sd-call-label sd-glass';
  label.textContent = 'SECURITY DATA · ASESORA VIRTUAL · POC';

  const human = document.getElementById('human');
  const end = document.getElementById('end');

  human.textContent = 'Ayuda humana';
  human.title = 'Solicitar ayuda de una persona · simulación';

  for (const button of [toggle, human, end]) {
    button.classList.add('sd-glass');
  }

  toolbar.append(toggle, label, human, end);
  active.append(toolbar);

  // Panel lateral: cerrado al iniciar la atención.
  const drawer = document.createElement('aside');
  drawer.id = 'sdDrawer';
  drawer.className = 'sd-drawer sd-glass';
  drawer.hidden = true;
  drawer.setAttribute('aria-labelledby', 'sdDrawerTitle');

  const heading = document.createElement('div');
  heading.className = 'sd-drawer-heading';

  const title = document.createElement('h2');
  title.id = 'sdDrawerTitle';
  title.textContent = 'Opciones';

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Cerrar ✕';
  close.setAttribute('aria-label', 'Cerrar menú de opciones');

  heading.append(title, close);
  drawer.append(heading, choices);
  active.append(drawer);

  toggle.setAttribute('aria-controls', 'sdDrawer');

  function setMenu(open, restoreFocus = false) {
    drawer.hidden = !open;
    choices.hidden = !open;
    active.classList.toggle('sd-menu-open', open);

    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? '☰ Ocultar opciones' : '☰ Ver opciones';

    if (restoreFocus) toggle.focus();
  }

  toggle.onclick = () => {
    const opening = drawer.hidden;
    setMenu(opening);
    if (opening) close.focus();
  };

  close.onclick = () => setMenu(false, true);

  // Al seleccionar una tarjeta, regresamos a la conversación.
  choices.addEventListener('click', event => {
    const card = event.target.closest('button');
    if (card && !card.disabled) setMenu(false);
  });

  document.addEventListener('keydown', event => {
    if (
      event.key === 'Escape' &&
      !active.hidden &&
      !drawer.hidden &&
      !document.querySelector('dialog[open]')
    ) {
      setMenu(false, true);
    }
  });

  // Conservamos "Volver" dentro de la conversación.
  task.append(document.getElementById('back'));

  // Restablecemos la vista para cada nuevo cliente.
  function syncSession() {
    document.body.classList.toggle('sd-call', !active.hidden);
    setMenu(false);
  }

  new MutationObserver(syncSession).observe(active, {
    attributes: true,
    attributeFilter: ['hidden']
  });

  syncSession();
})();

/* === SD: chat opcional y centro despejado === */
(() => {
  const active = document.getElementById('active');
  const drawer = document.getElementById('sdDrawer');
  const form = document.getElementById('chat');
  const portrait = document.querySelector('.sd-stage .sd-portrait');

  if (!active || !drawer || !form || !portrait) return;
  if (document.getElementById('sdChatPanel')) return;

  portrait.src = '/assets/asistente-transparente.png';

  // Instrucciones, datos y navegación pasan al costado izquierdo.
  const choices = document.getElementById('choices');

  for (const id of ['title', 'description', 'summary', 'back']) {
    const element = document.getElementById(id);
    if (element) drawer.insertBefore(element, choices);
  }

  // Los errores y avisos nunca quedan ocultos dentro del menú.
  active.append(document.getElementById('message'));

  // Panel de chat.
  const panel = document.createElement('section');
  panel.id = 'sdChatPanel';
  panel.className = 'sd-glass';
  panel.hidden = true;
  panel.setAttribute('aria-labelledby', 'sdChatTitle');

  const heading = document.createElement('div');
  heading.className = 'sd-chat-heading';

  const title = document.createElement('h2');
  title.id = 'sdChatTitle';
  title.textContent = 'Su mensaje';

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Cerrar ✕';
  close.setAttribute('aria-label', 'Cerrar chat');

  heading.append(title, close);

  const log = document.createElement('div');
  log.id = 'sdChatLog';
  log.setAttribute('role', 'log');
  log.setAttribute('aria-label', 'Mensajes enviados');
  log.setAttribute('aria-live', 'polite');

  panel.append(heading, log, form);
  active.append(panel);

  // Invitación discreta para usar el canal alternativo.
  const toggle = document.createElement('button');
  toggle.id = 'sdChatToggle';
  toggle.type = 'button';
  toggle.className = 'sd-glass';
  toggle.setAttribute('aria-controls', panel.id);

  const prompt = document.createElement('span');
  prompt.textContent = '¿Problemas con el audio?';

  const action = document.createElement('strong');
  action.textContent = 'Podemos chatear. Presione aquí';

  toggle.append(prompt, action);
  active.append(toggle);

  function setChat(open, restoreFocus = false) {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));

    action.textContent = open
      ? 'Ocultar chat'
      : 'Podemos chatear. Presione aquí';

    if (open) document.getElementById('input').focus();
    if (restoreFocus) toggle.focus();
  }

  toggle.onclick = () => setChat(panel.hidden);
  close.onclick = () => setChat(false, true);

  document.addEventListener('keydown', event => {
    if (
      event.key === 'Escape' &&
      !active.hidden &&
      !panel.hidden &&
      !document.querySelector('dialog[open]')
    ) {
      setChat(false, true);
    }
  });

  // Reutiliza el procesamiento existente.
  // No genera respuestas ficticias ni reproduce audio todavía.
  form.onsubmit = async event => {
    event.preventDefault();

    const input = document.getElementById('input');
    const value = input.value.trim();

    if (!value || busy || !session || !form.reportValidity()) return;

    const currentSession = session;
    const previousRevision = state.revision;

    const bubble = document.createElement('div');
    bubble.className = 'sd-outgoing';

    const text = document.createElement('span');
    text.textContent = value;

    const status = document.createElement('small');
    status.textContent = 'Enviando…';

    bubble.append(text, status);
    log.append(bubble);
    log.scrollTop = log.scrollHeight;

    await act('text', value);

    if (session !== currentSession) return;

    status.textContent = state.revision !== previousRevision
      ? 'Procesado'
      : 'No se pudo procesar. Revise el aviso e intente nuevamente.';

    log.scrollTop = log.scrollHeight;
  };

  // Limpieza entre clientes; no se guarda el historial.
  new MutationObserver(() => {
    setChat(false);
    if (active.hidden) log.replaceChildren();
  }).observe(active, {
    attributes: true,
    attributeFilter: ['hidden']
  });

  setChat(false);
})();
// Public review mode: make pending voice integration explicit.
function publicDemoLabels(){
  const label=document.querySelector('.sd-call-label');
  if(label)label.textContent='DEMO WEB · SERVICIOS SD SIMULADOS';
  const settings=document.querySelectorAll('#settings > p');
  if(settings[0])settings[0].textContent='Cámara y micrófono de este dispositivo. Reconocimiento en el servidor de la demo. Use documentos ficticios.';
  if(settings[1])settings[1].textContent='Registro Civil, SRI, pagos y emisión simulados. Las solicitudes de prueba pueden perderse al reiniciar el alojamiento.';
}



/* === SD: comportamiento adaptable === */
(() => {
  const active = document.getElementById('active');
  const drawer = document.getElementById('sdDrawer');
  const chat = document.getElementById('sdChatPanel');
  const optionsButton = document.getElementById('sdOptions');
  const chatButton = document.getElementById('sdChatToggle');

  if (!active || !drawer || !chat || active.dataset.responsiveReady) {
    return;
  }

  active.dataset.responsiveReady = 'true';

  const compact = matchMedia(
    '(max-width: 1100px), (orientation: portrait)'
  );

  function closeOptions() {
    drawer.hidden = true;
    document.getElementById('choices').hidden = true;
    active.classList.remove('sd-menu-open');
    optionsButton.setAttribute('aria-expanded', 'false');
    optionsButton.textContent = '☰ Ver opciones';
  }

  function closeChat() {
    chat.hidden = true;
    chatButton.setAttribute('aria-expanded', 'false');
    chatButton.querySelector('strong').textContent =
      'Podemos chatear. Presione aquí';
  }

  optionsButton.addEventListener('click', () => {
    if (compact.matches && !drawer.hidden) closeChat();
  });

  chatButton.addEventListener('click', () => {
    if (compact.matches && !chat.hidden) closeOptions();
  });

  compact.addEventListener('change', () => {
    if (compact.matches && !drawer.hidden && !chat.hidden) {
      closeOptions();
    }
  });

  function resize() {
    const height =
      window.visualViewport?.height || window.innerHeight;

    active.style.setProperty(
      '--sd-visible-height',
      Math.round(height) + 'px'
    );
  }

  window.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('resize', resize);
  resize();
})();


/* Local pilot: one controller for speaking, listening, forms and camera. */
(() => {
  const active=$('active'), drawer=$('sdDrawer'), chat=$('sdChatPanel');
  const synth=window.speechSynthesis;
  let voiceMode=false, autoListen=false, epoch=0, resources=()=>{}, pending=null, starting=false;
  let utterances=[], audioContext=null, cameraStream=null, cameraTimer=null;
  const button=document.createElement('button');button.id='sdConversation';button.type='button';button.className='sd-glass';button.textContent='Activar conversación';
  document.querySelector('.sd-toolbar').append(button);
  document.querySelector('.sd-call-label').textContent='PILOTO LOCAL · SERVICIOS SIMULADOS';
  const hud=document.createElement('div');hud.id='sdListening';hud.dataset.status='idle';hud.setAttribute('role','status');hud.setAttribute('aria-live','polite');
  const sphere=document.createElement('span');sphere.className='sd-listening-orb';sphere.setAttribute('aria-hidden','true');const status=document.createElement('span');status.textContent='Conversación en pausa';hud.append(sphere,status);document.querySelector('.sd-stage').append(hud);
  const fields=document.createElement('form');fields.id='sdFields';drawer.insertBefore(fields,$('choices'));
  fields.onsubmit=e=>{e.preventDefault();if(fields.reportValidity())act('form',JSON.stringify(Object.fromEntries(new FormData(fields))));};
  $('input').maxLength=1200;
  $('start').textContent='Comenzar atención';
  document.querySelector('#idle .hint').textContent='Pulse Comenzar atención para habilitar la conversación por voz.';
  const settingsParagraphs=document.querySelectorAll('#settings > p');
  settingsParagraphs[0].textContent='Piloto local: Whisper para escuchar, voz del dispositivo para hablar y OCR local para leer documentos.';
  settingsParagraphs[1].textContent='Registro Civil, SRI, pagos, biometría y emisión están simulados. Las solicitudes derivadas se guardan en local_data.';

  function showStatus(kind,text){hud.dataset.status=kind;status.textContent=text;button.textContent=voiceMode&&autoListen?'Pausar conversación':(voiceMode?'Reactivar micrófono':'Activar conversación');button.setAttribute('aria-pressed',String(voiceMode));}
  function openOptions(){drawer.hidden=false;$('choices').hidden=false;active.classList.add('sd-menu-open');$('sdOptions').textContent='☰ Ocultar opciones';$('sdOptions').setAttribute('aria-expanded','true');if(matchMedia('(max-width:1100px), (orientation:portrait)').matches){chat.hidden=true;$('sdChatToggle').setAttribute('aria-expanded','false');}}
  function stop(){epoch++;resources();resources=()=>{};pending?.abort();pending=null;synth?.cancel();utterances=[];}
  function pause(message='Conversación en pausa'){voiceMode=false;autoListen=false;stop();showStatus('idle',message);}
  function localVoice(){const voices=synth?.getVoices().filter(v=>v.localService&&/^es([-_]|$)/i.test(v.lang))||[];return voices.find(v=>/sabina|helena|paulina|monica|mónica/i.test(v.name))||voices[0];}
  function fallback(text){pause('Use las opciones o el chat');notice(text);openOptions();}
  function microphoneFailure(text){autoListen=false;stop();showStatus('idle','Micrófono en pausa · use el chat');notice(text);openOptions();}
  function speakStep(){
    stop();const own=epoch, sid=session;
    if(!state||active.hidden)return;
    if(!voiceMode){showStatus('idle','Modo escrito');openOptions();if(state.step==='farewell')setTimeout(()=>{if(session===sid&&state?.step==='farewell')act('finish');},2500);return;}
    const voice=localVoice();if(!voice){
      notice('Este dispositivo no ofrece una voz local en español. Puede hablar; las preguntas se muestran por escrito.');openOptions();
      if(state.step==='farewell'){setTimeout(()=>{if(session===sid&&state?.step==='farewell')act('finish');},3500);}
      else if(state.listen&&autoListen)listen(own);
      else showStatus('waiting','Consulte la indicación en pantalla');
      return;
    }
    showStatus('speaking','La asesora está hablando');
    const chunks=[];for(const word of (state.speech||state.description).split(/\s+/)){if(!chunks.length||chunks.at(-1).length+word.length>170)chunks.push(word);else chunks[chunks.length-1]+=' '+word;}
    utterances=chunks.map(text=>{const u=new SpeechSynthesisUtterance(text);u.voice=voice;u.lang=voice.lang;u.rate=.96;u.onerror=e=>{if(own===epoch&&!['canceled','interrupted'].includes(e.error))fallback('No se pudo reproducir la voz. Pulse Activar conversación para reintentar.');};return u;});
    const last=utterances.at(-1);if(!last)return;
    last.onend=()=>{if(own!==epoch||session!==sid)return;utterances=[];if(state.step==='farewell'){act('finish');return;}if(state.listen&&autoListen)listen(own);else{showStatus('waiting',state.listen?'Use el chat o reactive el micrófono':'Esperando una acción de prueba');openOptions();}};
    for(const u of utterances)synth.speak(u);
  }
  async function listen(own=epoch){
    if(!voiceMode||!autoListen||!config.voice||!session||active.hidden||document.hidden)return;
    let media;
    try{
      media=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      if(own!==epoch){media.getTracks().forEach(t=>t.stop());return;}
      audioContext=audioContext||new AudioContext();await audioContext.resume();
      if(own!==epoch){media.getTracks().forEach(t=>t.stop());return;}
      const source=audioContext.createMediaStreamSource(media),analyser=audioContext.createAnalyser();analyser.fftSize=1024;source.connect(analyser);
      const rec=new MediaRecorder(media),chunks=[],samples=new Float32Array(analyser.fftSize);
      const sid=session,revision=state.revision,begin=performance.now();let lastSound=begin,heard=false,timer;
      function cleanup(){clearInterval(timer);media.getTracks().forEach(t=>t.stop());source.disconnect();analyser.disconnect();}
      resources=()=>{if(rec.state!=='inactive')rec.stop();cleanup();};
      rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      rec.onerror=()=>{if(own===epoch)microphoneFailure('El micrófono dejó de responder. Puede continuar escribiendo.');};
      rec.onstop=async()=>{
        cleanup();resources=()=>{};
        if(own!==epoch||sid!==session)return;
        if(!heard){microphoneFailure('No escuché una respuesta. Puede activar de nuevo la conversación o usar el chat.');return;}
        showStatus('processing','Procesando su respuesta…');
        pending=new AbortController();
        try{
          const r=await fetch('/api/transcribe',{method:'POST',headers:{'X-SD-Token':config.token},body:new Blob(chunks,{type:rec.mimeType}),signal:pending.signal});const data=await r.json();
          if(own!==epoch||sid!==session||state.revision!==revision)return;
          if(!r.ok)throw Error(data.error||'No se pudo transcribir.');
          const text=(data.text||'').trim();if(!text){microphoneFailure('No pude entender el audio. Repita o escriba su respuesta.');return;}
          lastActivity=Date.now();await act('text',text);
        }catch(e){if(e.name!=='AbortError'&&own===epoch)microphoneFailure(e.message);}
      };
      rec.start();showStatus('listening','Escuchando…');
      timer=setInterval(()=>{
        analyser.getFloatTimeDomainData(samples);let sum=0;for(const x of samples)sum+=x*x;const rms=Math.sqrt(sum/samples.length);
        sphere.style.setProperty('--level',String(Math.min(rms*12,.35)));
        const now=performance.now();if(rms>.018){heard=true;lastSound=now;lastActivity=Date.now();}
        if((heard&&now-lastSound>1800)||now-begin>30000||(!heard&&now-begin>20000)){clearInterval(timer);if(rec.state==='recording')rec.stop();}
      },100);
    }catch(e){media?.getTracks().forEach(t=>t.stop());if(own===epoch)microphoneFailure('No se pudo abrir el micrófono. Revise el permiso del navegador o continúe por escrito.');}
  }
  async function enable(){
    if(!localVoice())notice('No se encontró una voz local en español; mostraremos las preguntas por escrito y probaremos el micrófono.');
    voiceMode=true;autoListen=!!config.voice;
    if(!autoListen){notice('Falta Whisper local. La asesora puede hablar; use el chat mientras lo instala.');return true;}
    try{audioContext=audioContext||new AudioContext();await audioContext.resume();const media=await navigator.mediaDevices.getUserMedia({audio:true});media.getTracks().forEach(t=>t.stop());voiceMode=true;return true;}
    catch{microphoneFailure('Permiso de micrófono denegado o dispositivo no disponible. Puede continuar por escrito.');return true;}
  }
  button.onclick=async()=>{if(voiceMode&&(autoListen||synth?.speaking))pause();else if(await enable())speakStep();};
  const basePaint=paint;
  paint=function(s){
    basePaint(s);fields.replaceChildren();
    for(const f of s.fields||[]){const label=document.createElement('label');label.htmlFor='field_'+f.name;label.textContent=f.label;const input=document.createElement('input');input.id=label.htmlFor;input.name=f.name;input.type=f.type;input.value=f.value||'';input.required=true;input.maxLength=f.type==='email'?254:200;input.autocomplete='off';if(['document','billing_id'].includes(f.name))input.inputMode='numeric';fields.append(label,input);}
    fields.hidden=!s.fields?.length;
    if(!fields.hidden){const submit=document.createElement('button');submit.className='primary';submit.type='submit';submit.textContent='Confirmar dato';fields.append(submit);}
    $('input').type='text';$('inputLabel').textContent='Escriba lo que desea decir a la asesora';$('input').placeholder=s.step==='email'?'Su correo electrónico':'Su respuesta…';
    $('voiceHint').textContent='Prueba local. No se realizan pagos ni se emiten certificados reales.';
    queueMicrotask(speakStep);
  };
  const baseAct=act;
  act=async function(action,value=''){
    if(busy||!session)return;
    if(action==='camera'||(action==='text'&&['front','back_id'].includes(state.step)&&/c[aá]mara/i.test(value))){openCamera();return;}
    stop();showStatus('processing','Procesando…');await baseAct(action,value);
  };
  const baseStart=start;
  let fromButton=false;
  start=async function(){
    if(starting||session||!config.token||$('settings').open||Date.now()<idleArmed)return;
    starting=true;
    try{if(fromButton)await enable();await baseStart();if(!voiceMode&&session)openOptions();}
    finally{starting=false;fromButton=false;}
  };
  $('start').onclick=()=>{fromButton=true;idleArmed=0;start();};
  document.addEventListener('pointerdown',()=>{if(session)lastActivity=Date.now();});
  document.addEventListener('keydown',e=>{lastActivity=Date.now();if(!session&&e.key==='Enter'&&!e.target.closest('button,input,textarea,dialog')){fromButton=true;idleArmed=0;start();}});
  // Do not initiate audio or permission requests from incidental mouse motion.
  $('mic').onclick=async()=>{if(await enable())speakStep();};
  const baseReset=reset;
  reset=function(){pause();closeCamera();baseReset();fields.replaceChildren();};
  $('end').addEventListener('click',()=>pause());
  $('keepSession').addEventListener('click',()=>showStatus('idle','Pulse Activar conversación para continuar'));
  document.addEventListener('visibilitychange',()=>{if(document.hidden){pause();closeCamera();}});
  window.addEventListener('pagehide',()=>{pause();closeCamera();});
  $('input').addEventListener('focus',()=>{stop();showStatus('idle','Escribiendo respuesta');});
  fields.addEventListener('focusin',()=>{stop();showStatus('idle','Completando datos por escrito');});

  const camera=document.createElement('dialog');camera.id='sdCamera';const heading=document.createElement('h2');heading.textContent='Lectura local de cédula';const video=document.createElement('video');video.autoplay=true;video.muted=true;video.playsInline=true;const cameraNote=document.createElement('p');const capture=document.createElement('button');capture.textContent='Leer ahora';capture.className='primary';const close=document.createElement('button');close.textContent='Cerrar cámara';close.className='quiet';camera.append(heading,video,cameraNote,capture,close);document.body.append(camera);
  function closeCamera(){clearInterval(cameraTimer);cameraTimer=null;cameraStream?.getTracks().forEach(t=>t.stop());cameraStream=null;video.srcObject=null;if(camera.open)camera.close();}
  function cancelCamera(){closeCamera();showStatus('idle','Cámara cerrada · puede escribir el dato');openOptions();}
  close.onclick=cancelCamera;camera.addEventListener('cancel',cancelCamera);
  async function openCamera(){
    if(!config.ocr){notice('OCR no instalado. Puede escribir el dato en el formulario o usar el documento ficticio.');openOptions();return;}
    stop();showStatus('waiting','Leyendo documento');const sid=session,side=state.step;let scanning=false;
    try{
      camera.showModal();cameraNote.textContent='Muestre '+(side==='front'?'el frente':'el reverso')+' completo, bien iluminado. La captura no se guarda.';
      const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment',width:{ideal:1280}},audio:false});
      if(!camera.open||sid!==session){media.getTracks().forEach(t=>t.stop());return;}
      cameraStream=media;video.srcObject=media;await video.play();
      const scan=async()=>{
        if(scanning||!camera.open||!video.videoWidth)return;scanning=true;capture.disabled=true;
        try{
          const canvas=document.createElement('canvas');canvas.width=Math.min(1280,video.videoWidth);canvas.height=Math.round(video.videoHeight*canvas.width/video.videoWidth);canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
          const image=canvas.toDataURL('image/jpeg',.85).split(',')[1];canvas.width=canvas.height=0;
          const r=await api('/api/ocr',{side,image});
          if(!camera.open||sid!==session||state.step!==side)return;
          if(r.candidates.length===1){closeCamera();await act('form',JSON.stringify({[side==='front'?'document':'fingerprint']:r.candidates[0]}));}
          else cameraNote.textContent=r.candidates.length?'Hay varios números posibles. Acerque el documento o ingrese el dato manualmente.':'No se distingue el dato. Mejore la iluminación y mantenga el documento quieto.';
        }catch(e){cameraNote.textContent=e.message;clearInterval(cameraTimer);}
        finally{scanning=false;capture.disabled=false;}
      };
      capture.onclick=scan;cameraTimer=setInterval(scan,2500);
    }catch{closeCamera();notice('No se pudo abrir la cámara. Revise el permiso o ingrese el dato manualmente.');openOptions();}
  }
})();
