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
document.addEventListener('keydown',e=>{if(!e.target.closest('header,dialog,button,a,input')&&!session&&!$('settings').open&&!e.ctrlKey&&!e.metaKey&&e.key!=='Tab')start();else lastActivity=Date.now();});
let lastMouse=null;document.addEventListener('mousemove',e=>{if(!session){if(e.target.closest('header,dialog')){lastMouse=[e.clientX,e.clientY];return;}if(lastMouse&&Math.abs(e.clientX-lastMouse[0])+Math.abs(e.clientY-lastMouse[1])>12)start();lastMouse=[e.clientX,e.clientY];}else if(!$('idleWarning').open)lastActivity=Date.now();});document.addEventListener('pointerdown',()=>{if(session&&!$('idleWarning').open)lastActivity=Date.now();});
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
  if(label)label.textContent='DEMO INDEPENDIENTE · VOZ PENDIENTE';
  const prompt=document.querySelector('#sdChatToggle > span');
  if(prompt)prompt.textContent='Demo: voz pendiente de conexión';
  const hint=document.getElementById('voiceHint');
  if(hint)hint.textContent='Solo datos ficticios. Consulte el siguiente paso en Ver opciones.';
  const settings=document.querySelectorAll('#settings > p');
  if(settings[0])settings[0].textContent='Demo pública para revisar la interfaz y un trámite simulado. Use Ver opciones o el chat. No hay conversación libre con IA ni audio conectado.';
  if(settings[1])settings[1].textContent='No se conecta al Registro Civil, pagos ni emisión. Las sesiones son temporales y pueden perderse al reiniciar el alojamiento.';
}
