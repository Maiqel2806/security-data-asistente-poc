"""Local guided pilot. Provider results are explicit fixtures, never voice claims."""
import copy
import json
import re
import sqlite3
import time
import unicodedata
from pathlib import Path

PLANS = {
 'week': ('1 semana', 515), 'month': ('1 mes', 1210),
 'year1': ('1 año', 2415), 'year2': ('2 años', 3657),
 'year3': ('3 años', 5122), 'year4': ('4 años', 6364), 'year5': ('5 años', 7441),
}
DATA_DIR = Path(__file__).parent / 'local_data'
YES = {'si', 'si correcto', 'correcto', 'es correcto', 'confirmo', 'afirmativo', 'de acuerdo', 'esta bien', 'si es correcto', 'si esta correcto', 'si esta bien', 'claro', 'asi es'}
NO = {'no', 'incorrecto', 'no es correcto', 'no esta bien', 'corregir', 'esta mal', 'no es asi', 'negativo'}

def clean(text):
    return ''.join(c for c in unicodedata.normalize('NFD', str(text).lower()) if unicodedata.category(c) != 'Mn').strip(' .,!¿?¡').replace(',', '')

def email_text(value):
    t = str(value).strip().lower().rstrip(' .')
    for a,b in [('guion bajo','_'),('guión bajo','_'),('arroba','@'),('punto','.'),('guion','-'),('guión','-')]:
        t = t.replace(a,b)
    return re.sub(r'\s+', '', t)

def valid_email(value):
    return bool(re.fullmatch(r'[a-z0-9.!#$%&\x27*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}', value)) and len(value) <= 254 and '..' not in value

def digit_text(text):
    t = clean(text)
    for word, digit in zip(['cero','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve'], '0123456789'):
        t = re.sub(r'\b'+word+r'\b',digit,t)
    return re.sub(r'[\s.-]', '', t)

def plan_intent(t):
    if 'semana' in t: return 'week' if not re.search(r'\b(dos|tres|cuatro|cinco|[2-9])\b',t) else None
    if re.search(r'\bmes\b',t): return 'month'
    for i,w in enumerate(['un','dos','tres','cuatro','cinco'],1):
        if re.search(r'\b('+w+r'|'+str(i)+r'|'+('uno' if i==1 else w)+r')\s*anos?\b',t): return 'year'+str(i)
    return None

def field(name,label,kind='text',value=''):
    return dict(name=name,label=label,type=kind,value=value)

class Session:
    def __init__(self):
        self.step='welcome';self.data={};self.history=[];self.events=[]
        self.started=self.touched=time.monotonic();self.revision=0;self.note=''

    def view(self):
        d=self.data; s=self.step; choices=[]; fields=[]; listen=True
        yesno=[('yes','Sí, es correcto'),('no','No, corregir')]
        if s=='welcome':
            title='Bienvenido a Security Data';desc='Hola, soy su asesora virtual. Esta es una prueba local. ¿En qué puedo ayudarle?';choices=[('new','Obtener mi firma electrónica')]
        elif s=='purpose':
            title='¿Qué uso le dará a su firma?';desc='¿La usará solo para firmar documentos personales o para otra actividad?';choices=[('personal','Solo firmar documentos · sin RUC'),('other','Facturación o empresa')]
        elif s=='front':
            title='Muestre el frente de su cédula';desc='Necesito leer el número de cédula de diez dígitos. Puede abrir la cámara o usar un documento ficticio para esta prueba.';choices=[('camera','Abrir cámara'),('demo_front','Usar frente ficticio')];fields=[field('document','Número de cédula · 10 dígitos')]
        elif s in ('front_confirm','back_confirm'):
            title='Confirme la lectura del documento';value=d['document'] if s=='front_confirm' else d['fingerprint'];desc='He leído: '+ ' '.join(value)+'. ¿Es correcto?';choices=yesno
        elif s=='back_id':
            title='Ahora muestre el reverso';desc='Buscaremos el código dactilar y tomaremos sus primeros seis caracteres, conservando las letras.';choices=[('camera','Abrir cámara'),('demo_back','Usar reverso ficticio')];fields=[field('fingerprint','Primeros 6 caracteres del código dactilar')]
        elif s=='registry':
            title='Consulta al Registro Civil pendiente';desc='El conector de Security Data aún no está disponible. Puede continuar con Alex Ejemplo y datos completamente ficticios, o solicitar ayuda.';choices=[('demo_registry','Simular datos del Registro Civil'),('help','Solicitar ayuda')];listen=False
        elif s=='identity_confirm':
            title='Confirme los datos recuperados';desc=f"La consulta es simulada. El solicitante es {d['name']}. ¿Es correcta esta información?";choices=yesno
        elif s=='email':
            title='¿Cuál es su correo electrónico?';desc='Puede dictarlo diciendo arroba y punto, o escribirlo en el campo de correo. Luego lo confirmaremos. En esta prueba no enviaremos mensajes.';fields=[field('email','Correo electrónico','email',d.get('email',''))]
        elif s=='email_confirm':
            title='Confirme su correo';desc=f"Su correo es {d['email']}. ¿Es correcto?";choices=yesno
        elif s=='plan':
            title='¿Qué vigencia prefiere?';desc='Puede elegir una semana, un mes, o de uno a cinco años.';choices=[(k,f'{name} · ${cents/100:.2f}') for k,(name,cents) in PLANS.items()]
        elif s=='plan_confirm':
            title='Confirme la vigencia y el precio';c=d['price_cents'];desc=f"Su solicitud es por {d['plan']}, con un precio de {c//100} dólares con {c%100:02d} centavos. ¿Es correcto?";choices=yesno
        elif s=='billing':
            title='¿A nombre de quién irá la factura?';desc='¿Usamos los mismos datos del solicitante o los datos de otra persona?';choices=[('self','Mismos datos del solicitante'),('third','Otros datos')]
        elif s=='billing_id':
            title='Indique la identificación para facturar';desc='Dígame los diez dígitos de la cédula, uno por uno, o escriba la cédula o RUC.';fields=[field('billing_id','Cédula o RUC')]
        elif s=='sri':
            title='Consulta al SRI pendiente';desc='El conector al SRI no está configurado. Podemos probar una respuesta ficticia o ingresar los datos manualmente.';choices=[('demo_sri','Simular datos encontrados'),('manual','Completar datos manualmente')];listen=False
        elif s=='billing_fields':
            title='Complete los datos de facturación';desc='Ingrese el nombre o razón social, dirección y correo en el formulario. También puede dictar los campos uno a uno.';choices=[('dictate','Dictar los datos')];fields=[field('billing_name','Nombre o razón social'),field('billing_address','Dirección'),field('billing_email','Correo de facturación','email')]
        elif s in ('billing_name','billing_address','billing_email'):
            labels={'billing_name':'nombre o razón social','billing_address':'dirección','billing_email':'correo de facturación'}
            title='Indique '+labels[s];desc='Puede dictarlo o escribirlo. Confirmaremos los datos antes de continuar.';fields=[field(s,labels[s].capitalize(),'email' if s=='billing_email' else 'text')]
        elif s=='billing_confirm':
            title='Confirme la facturación';desc=f"La factura será para {d['billing_name']}, dirección {d['billing_address']}, correo {d['billing_email']}. ¿Es correcto?";choices=yesno
        elif s=='payment':
            title='¿Cómo desea pagar?';desc='Puede pagar con tarjeta de débito, tarjeta de crédito o Deuna. Para depósito o transferencia guardaremos la solicitud y generaremos un turno local de prueba.';choices=[('debit','Tarjeta de débito'),('credit','Tarjeta de crédito'),('deuna','Deuna'),('transfer','Depósito o transferencia')]
        elif s=='payment_wait':
            title='Esperando confirmación del pago';desc='Método elegido: '+d['payment_method']+'. La pasarela todavía no está integrada. En esta prueba no introduzca datos de tarjeta ni realice pagos.';choices=[('demo_paid','Simular confirmación de la pasarela'),('demo_rejected','Simular rechazo'),('change_payment','Cambiar método')];listen=False
        elif s=='biometric':
            title='Validación biométrica';desc='El pago de prueba está aprobado. Antes de emitir falta la prueba de vida. Leer una cédula con la cámara no sustituye esta validación. El proveedor biométrico aún no está conectado.';choices=[('demo_bio','Simular prueba de vida aprobada'),('demo_bio_fail','Simular fallo de biometría')];listen=False
        elif s=='issue':
            title='Lista para emisión de prueba';desc='Los controles simulados están aprobados. Falta la respuesta del servicio emisor. Esta prueba no genera certificados reales.';choices=[('demo_issue','Simular respuesta del emisor')];listen=False
        elif s=='complete':
            title='Indicaciones para descargar su firma';desc='La demostración terminó correctamente. En el proceso real recibirá en su correo registrado un mensaje con las indicaciones para descargar la firma. También podrá descargarla desde su cuenta del portal de clientes. Al descargarla establecerá la clave que usará para firmar; no debe compartirla con la asesora. En esta prueba no se ha enviado un correo ni emitido una firma. ¿Hay algo más en lo que pueda ayudarle?';choices=[('yes','Sí, otra consulta'),('no','No, gracias')]
        elif s=='handoff_payment':
            title='Solicitud guardada para revisión';desc=f"Su turno local de prueba es {d['ticket']}. Un operador deberá verificar el depósito o transferencia y aprobar el pago. La solicitud sigue pendiente; no se ha emitido una firma. ¿Necesita algo más?";choices=[('yes','Sí, otra consulta'),('no','No, gracias')]
        elif s=='help':
            title='Ayuda de un operador';desc='Esta solicitud requiere atención de una persona. La derivación es simulada; no se ha enviado un aviso a un operador.';choices=[('back','Volver'),('no','Terminar')];listen=True
        elif s=='farewell':
            title='Gracias por su visita';desc='Gracias por visitar Security Data. Ha sido un gusto ayudarle. Permítame atender a los demás clientes en espera. Que tenga un excelente día.';listen=False
        else: raise ValueError('Paso desconocido')
        return title,desc,choices,fields,listen

    def snapshot(self):
        title,desc,choices,fields,listen=self.view()
        visible={k:v for k,v in self.data.items() if k!='fingerprint'}
        return dict(step=self.step,title=title,description=desc,speech=self.note or desc,choices=[dict(id=a,label=b) for a,b in choices],fields=fields,listen=listen,data=visible,revision=self.revision,note=self.note,can_back=bool(self.history) and self.step not in {'payment_wait','biometric','issue','complete','handoff_payment','farewell'},elapsed_seconds=round(time.monotonic()-self.started),events=len(self.events))

    def go(self, step):
        self.history.append((self.step,copy.deepcopy(self.data)));self.step=step

    def intent(self, value):
        t=clean(value)
        if t in ('atras','volver','regresar'): return 'back'
        if any(x in t for x in ('ayuda humana','operador','asesor humano')):return 'help'
        if self.step=='welcome' and 'firma' in t:return 'new'
        if self.step=='purpose':
            if any(x in t for x in ('factur','empresa','representante','con ruc')):return 'other'
            if any(x in t for x in ('document','personal','sin ruc','solo firmar')):return 'personal'
        if self.step in {'front_confirm','back_confirm','identity_confirm','email_confirm','plan_confirm','billing_confirm','complete','handoff_payment'}:
            if t in YES:return 'yes'
            if t in NO or t.startswith('no,') or t.startswith('no '):return 'no'
        if self.step=='plan':return plan_intent(t)
        if self.step=='billing':
            if any(x in t for x in ('otro','otra','tercero')):return 'third'
            if any(x in t for x in ('mismo','mi nombre','mis datos','solicitante')):return 'self'
        if self.step=='payment':
            if 'transfer' in t or 'deposit' in t:return 'transfer'
            if 'debito' in t:return 'debit'
            if 'credito' in t:return 'credit'
            if 'deuna' in t or 'de una' in t:return 'deuna'
        if self.step=='billing_fields' and 'dict' in t:return 'dictate'
        return None

    def act(self, action, value=''):
        self.note=''; old=self.step
        if action=='finish' and self.step=='farewell':return {'finished':True}
        if action=='text':
            mapped=self.intent(value)
            if mapped:action=mapped
            elif self.step in {'front','back_id','email','billing_id','billing_name','billing_address','billing_email'}:
                key={'front':'document','back_id':'fingerprint'}.get(self.step,self.step)
                action='form';value=json.dumps({key:value})
            else:
                self.note='No pude identificar una respuesta válida. Puede repetirla o abrir Ver opciones.'
                return self.changed(old,action)
        allowed={x[0] for x in self.view()[2]}|{'help'}
        if self.view()[3]:allowed.add('form')
        if self.snapshot()['can_back']:allowed.add('back')
        if action not in allowed:raise ValueError('Acción no permitida en este paso')
        if action=='help':self.go('help')
        elif action=='back':
            if self.history:self.step,self.data=self.history.pop()
        elif action=='new':self.go('purpose')
        elif action=='personal':self.data['profile']='Persona natural · sin RUC';self.go('front')
        elif action=='other':self.go('help')
        elif action=='demo_front':self.data['document']='0000000000';self.go('front_confirm')
        elif action=='demo_back':self.data['fingerprint']='A0000A';self.go('back_confirm')
        elif action=='demo_registry':
            self.data.update(document='0000000000',fingerprint='A0000A',name='Alex Ejemplo',address='Dirección de prueba',identity='simulada')
            self.go('identity_confirm')
        elif action=='form':self.accept_fields(json.loads(value))
        elif action=='yes':
            destinations={'front_confirm':'back_id','back_confirm':'registry','identity_confirm':'email','email_confirm':'plan','plan_confirm':'billing','billing_confirm':'payment'}
            if self.step in destinations:self.go(destinations[self.step])
            else:self.data={};self.history=[];self.step='welcome'
        elif action=='no':
            destinations={'front_confirm':'front','back_confirm':'back_id','identity_confirm':'front','email_confirm':'email','plan_confirm':'plan','billing_confirm':'billing'}
            target=destinations.get(self.step,'farewell')
            if self.step=='identity_confirm':self.data={}
            if self.step=='plan_confirm':self.data.pop('plan',None);self.data.pop('price_cents',None)
            if self.step=='billing_confirm':
                for k in list(self.data):
                    if k.startswith('billing'):self.data.pop(k)
            self.go(target)
        elif action in PLANS:
            self.data.update(plan=PLANS[action][0],price_cents=PLANS[action][1]);self.go('plan_confirm')
        elif action=='self':
            self.data.update(billing_name=self.data['name'],billing_address=self.data['address'],billing_email=self.data['email'],billing_id=self.data['document']);self.go('billing_confirm')
        elif action=='third':self.go('billing_id')
        elif action=='demo_sri':
            self.data.update(billing_name='Tercero Ejemplo',billing_id='0000000000',billing_address='Dirección ficticia',billing_email='tercero@example.com');self.go('billing_confirm')
        elif action=='manual':self.go('billing_fields')
        elif action=='dictate':self.go('billing_name')
        elif action in ('debit','credit','deuna'):
            self.data['payment_method']={'debit':'tarjeta de débito','credit':'tarjeta de crédito','deuna':'Deuna'}[action];self.go('payment_wait')
        elif action=='change_payment':self.go('payment')
        elif action=='demo_paid':self.data['payment']='aprobado_simulado';self.go('biometric')
        elif action=='demo_rejected':self.note='Pago simulado rechazado. Puede cambiar el método o reintentar; no se emitirá la firma.'
        elif action=='demo_bio':self.data['biometric']='aprobado_simulado';self.go('issue')
        elif action=='demo_bio_fail':self.note='La biometría simulada no fue aprobada. Puede reintentar o solicitar un operador.'
        elif action=='demo_issue':
            if any(self.data.get(k)!='aprobado_simulado' for k in ('payment','biometric')):raise ValueError('Faltan validaciones')
            self.data['certificate']='DEMO-SIN-VALIDEZ';self.go('complete')
        elif action=='transfer':
            self.data['payment_method']='depósito o transferencia';self.data['payment']='pendiente_revision'
            self.data['ticket']=self.save_pending();self.go('handoff_payment')
        return self.changed(old,action)

    def changed(self,old,action):
        self.revision+=1;self.touched=time.monotonic();self.events.append({'step':old,'action':action,'next':self.step});return self.snapshot()

    def accept_fields(self, f):
        if not isinstance(f,dict):raise ValueError('Formulario inválido')
        if self.step=='front':
            v=digit_text(f.get('document',''))
            if not re.fullmatch(r'\d{10}',v):self.note='La cédula debe tener diez dígitos. Revise la lectura.';return
            self.data['document']=v;self.go('front_confirm')
        elif self.step=='back_id':
            v=re.sub(r'\s','',str(f.get('fingerprint',''))).upper()
            if not re.fullmatch(r'[A-Z]\d{4}[A-Z](?:\d{4})?',v):self.note='Revise el código dactilar. Ejemplo ficticio: A0000A0000; conservaremos A0000A.';return
            self.data['fingerprint']=v[:6];self.go('back_confirm')
        elif self.step in ('email','billing_email'):
            key=self.step;v=email_text(f.get(key,''))
            if not valid_email(v):self.note='El correo no tiene un formato válido. Puede escribirlo en el campo disponible.';return
            self.data[key]=v;self.go('email_confirm' if key=='email' else 'billing_confirm')
        elif self.step=='billing_id':
            v=digit_text(f.get('billing_id',''))
            if not re.fullmatch(r'(\d{10}|\d{13})',v):self.note='Escriba una cédula de diez dígitos o un RUC de trece.';return
            self.data['billing_id']=v;self.go('sri')
        elif self.step in ('billing_name','billing_address'):
            v=str(f.get(self.step,'')).strip()
            if len(v)<3:self.note='Indique el dato completo, por favor.';return
            self.data[self.step]=v[:200];self.go('billing_address' if self.step=='billing_name' else 'billing_email')
        elif self.step=='billing_fields':
            name=str(f.get('billing_name','')).strip();addr=str(f.get('billing_address','')).strip();mail=email_text(f.get('billing_email',''))
            if len(name)<3 or len(addr)<3 or not valid_email(mail):self.note='Revise nombre, dirección y correo de facturación.';return
            self.data.update(billing_name=name[:200],billing_address=addr[:200],billing_email=mail);self.go('billing_confirm')

    def save_pending(self):
        DATA_DIR.mkdir(exist_ok=True)
        payload={k:v for k,v in self.data.items() if k!='fingerprint'}
        with sqlite3.connect(DATA_DIR/'pending.sqlite3') as db:
            db.execute('CREATE TABLE IF NOT EXISTS requests(id INTEGER PRIMARY KEY, created REAL, payload TEXT, status TEXT)')
            c=db.execute('INSERT INTO requests(created,payload,status) VALUES(?,?,?)',(time.time(),json.dumps(payload,ensure_ascii=False),'pendiente_revision'))
            return f'LOCAL-{c.lastrowid:04d}'
