"""Flujo determinista de demostración. No emite certificados reales."""
import re
import time
import unicodedata
from dataclasses import dataclass, field

def clean(text):
    return ''.join(c for c in unicodedata.normalize('NFD', text.lower()) if unicodedata.category(c) != 'Mn')

STEPS = {
 'welcome': ('¿En qué le puedo ayudar?', 'Puede escribir su solicitud o elegir una opción.', [('new','Obtener mi firma'),('renew','Renovar'),('status','Consultar solicitud')]),
 'purpose': ('¿Para qué utilizará su firma?', 'Esto nos ayuda a elegir el tipo de firma correcto.', [('personal','Mis trámites personales'),('invoice','Facturar por mi actividad'),('company','Representar a una empresa'),('unsure','No estoy seguro')]),
 'confirm_person': ('¿La utilizará a título personal?', 'Esta primera demostración atiende solicitudes de persona natural.', [('personal','Sí, por mi propia actividad'),('company','En nombre de una empresa')]),
 'identity': ('Vamos a revisar su identidad', 'Use exclusivamente los datos ficticios de esta demostración. La consulta al Registro Civil está simulada.', [('fixture','Usar documento de prueba')]),
 'review_identity': ('Revise los datos recuperados', 'Persona ficticia: Alex Ejemplo. Documento de prueba vigente. Ninguna consulta real ha sido realizada.', [('confirm','Los datos son correctos'),('incorrect','Hay un error en los datos')]),
 'email': ('¿En qué correo recibirá la información?', 'Use un correo ficticio, por ejemplo alex@example.com. No enviaremos mensajes.', []),
 'billing': ('¿A nombre de quién irá la factura?', 'Podemos reutilizar los datos de la solicitud.', [('self','A mi nombre'),('third','A nombre de un tercero')]),
 'third': ('Datos de facturación de prueba', 'Seleccione el tercero ficticio para probar esta ruta.', [('third_fixture','Empresa Ejemplo · TEST-TERCERO')]),
 'plan': ('Elija la vigencia de su firma', 'Valores ilustrativos para probar la interfaz. No son tarifas de Security Data.', [('year1','1 año · USD 20 de prueba'),('year2','2 años · USD 35 de prueba')]),
 'summary': ('Revise su solicitud', 'Al confirmar se inicia el pago simulado. Esta POC representa un recorrido digital propuesto; no crea cuentas reales.', [('confirm','Confirmar y continuar')]),
 'payment': ('Pago de demostración', 'Elija un resultado de prueba. No introduzca tarjetas ni realice transferencias.', [('pay_ok','Simular pago aprobado'),('pay_pending','Simular pago pendiente'),('pay_fail','Simular pago rechazado')]),
 'payment_pending': ('Pago pendiente', 'No vuelva a pagar. En producción consultaríamos el estado al proveedor.', [('check_paid','Simular confirmación del proveedor'),('check_pending','Mantener pendiente')]),
 'biometric': ('Verificación de identidad', 'Esta pantalla simula la prueba de vida. No captura imágenes ni verifica identidades.', [('bio_ok','Simular resultado aprobado'),('bio_fail','Simular resultado no aprobado')]),
 'issue': ('Solicitud lista para emisión', 'Pago y biometría simulados aprobados. El certificado real solo lo emite el servicio autorizado.', [('issue_ok','Simular emisión completada'),('issue_pending','Simular emisión pendiente')]),
 'issued': ('Demostración completada', 'En un trámite real, recibiría la información por correo y podría descargar su firma desde el portal. Aquí no se ha emitido ni enviado ningún certificado.', [('download_help','Cómo descargar y usar la firma')]),
 'download': ('Su clave de firma', 'Al descargar, establece una clave que utilizará para firmar. Es distinta de la contraseña de acceso al portal. Escríbala únicamente en el formulario seguro correspondiente; nunca en este chat.', [('finish','Entendido · Finalizar')]),
 'handoff': ('Vamos a solicitar ayuda', 'Derivación simulada: el operador recibiría el motivo y el avance. Esta POC no contacta a personas.', [('resume','Volver al paso anterior')]),
}

@dataclass
class Session:
    step: str = 'welcome'
    data: dict = field(default_factory=dict)
    history: list = field(default_factory=list)
    events: list = field(default_factory=list)
    revision: int = 0
    started: float = field(default_factory=time.monotonic)
    touched: float = field(default_factory=time.monotonic)
    note: str = ''

    def snapshot(self):
        title, description, choices = STEPS[self.step]
        return dict(step=self.step, title=title, description=description,
                    choices=[dict(id=a,label=b) for a,b in choices], data=self.data.copy(),
                    revision=self.revision, note=self.note, can_back=bool(self.history),
                    elapsed_seconds=round(time.monotonic()-self.started), events=len(self.events))

    def go(self, step):
        self.history.append((self.step, self._before.copy()))
        self.step = step

    def act(self, action, value=''):
        allowed = {x[0] for x in STEPS[self.step][2]} | {'help','back','text'}
        if action not in allowed:
            raise ValueError('Esta acción no corresponde al paso actual.')
        self._before = self.data.copy()
        self.note = ''
        old = self.step
        if action == 'back':
            if self.history:
                self.step, self.data = self.history.pop()
        elif action == 'help':
            if self.step != 'handoff':
                self.data['derivation'] = 'Ayuda solicitada por el cliente'
                self.go('handoff')
        elif action == 'text':
            self.accept_text(value)
        elif action in ('renew','status','company','incorrect'):
            self.data['derivation'] = {'renew':'Renovación fuera del alcance inicial','status':'Consulta de estado sin integración','company':'Perfil de empresa','incorrect':'Datos de identidad inconsistentes'}[action]
            self.go('handoff')
        elif action == 'new': self.go('purpose')
        elif action in ('invoice','unsure'): self.go('confirm_person')
        elif action == 'personal':
            self.data['profile'] = 'Persona natural'
            self.go('identity')
        elif action == 'fixture':
            self.data.update(name='Alex Ejemplo',document='TEST-CEDULA',fingerprint='TEST06',identity='simulada')
            self.go('review_identity')
        elif action == 'confirm' and self.step == 'review_identity': self.go('email')
        elif action == 'self':
            self.data['billing'] = 'Solicitante: Alex Ejemplo'
            self.go('plan')
        elif action == 'third': self.go('third')
        elif action == 'third_fixture':
            self.data['billing'] = 'Empresa Ejemplo · TEST-TERCERO'
            self.go('plan')
        elif action in ('year1','year2'):
            self.data.update(plan='1 año' if action=='year1' else '2 años',price=20 if action=='year1' else 35)
            self.go('summary')
        elif action == 'confirm' and self.step == 'summary': self.go('payment')
        elif action in ('pay_ok','check_paid'):
            self.data['payment'] = 'aprobado_simulado'
            self.go('biometric')
        elif action == 'pay_pending': self.go('payment_pending')
        elif action == 'check_pending': self.note='El pago sigue pendiente. No realice otro pago.'
        elif action == 'pay_fail': self.note='Pago de prueba rechazado. Puede probar otro resultado o solicitar ayuda.'
        elif action == 'bio_ok':
            if self.data.get('payment') != 'aprobado_simulado': raise ValueError('Falta confirmar el pago.')
            self.data['biometric']='aprobado_simulado'
            self.go('issue')
        elif action == 'bio_fail': self.note='Verificación de prueba no aprobada. Puede reintentar o pedir ayuda.'
        elif action == 'issue_pending': self.note='Emisión pendiente. El pago ya está confirmado: no se repetirá.'
        elif action == 'issue_ok':
            if any(self.data.get(k) != 'aprobado_simulado' for k in ('payment','biometric')):
                raise ValueError('Faltan validaciones previas.')
            self.data['certificate']='DEMO-SIN-VALIDEZ'
            self.go('issued')
        elif action == 'download_help': self.go('download')
        elif action == 'resume':
            if self.history: self.step,self.data=self.history.pop()
        elif action == 'finish': return {'finished':True}
        self.revision += 1
        self.touched=time.monotonic()
        self.events.append(dict(step=old,action=action,next=self.step))
        return self.snapshot()

    def accept_text(self, value):
        if self.step == 'email':
            email=value.strip().lower()
            if not re.fullmatch(r'[a-z0-9._+\-]+@example\.(com|org|net)', email):
                self.note='Para esta prueba use un correo ficticio terminado en @example.com, @example.org o @example.net.'
            else:
                self.data['email']=email
                self.go('billing')
        else:
            self.note='Use las tarjetas para avanzar. La conversación libre requiere conectar el modelo local en Configuración.'

def simple_intent(step,text):
    """Atajos explícitos, no presentados como un LLM."""
    t=clean(text)
    if any(x in t for x in ('operador','persona humana','ayuda humana')): return 'help'
    if t in ('volver','atras'): return 'back'
    if step=='welcome':
        if 'renov' in t: return 'renew'
        if 'estado' in t or 'consultar' in t: return 'status'
        if 'firma' in t: return 'new'
    if step in ('purpose','confirm_person'):
        if 'empresa' in t or 'representante' in t: return 'company'
        if 'natural' in t or 'personal' in t or 'propia actividad' in t: return 'personal'
        if step=='purpose' and 'factur' in t: return 'invoice'
    return None
