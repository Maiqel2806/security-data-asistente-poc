"""Public pilot with server-side OCR/STT; SD providers remain simulated."""
import hashlib
import hmac
import json
import mimetypes
import os
import secrets
import threading
import time
from http import HTTPStatus
from http.cookies import SimpleCookie
from pathlib import Path
from urllib.parse import urlsplit

from local_engine import Session
from web_services import capabilities, run_media, MediaBusy

def simple_intent(step, value):
    return None

ROOT = Path(__file__).resolve().parent / 'web'
SECRET = secrets.token_bytes(32)
SESSIONS = {}
LOCK = threading.Lock()
MAX_SESSIONS = 200
TTL = 900
PORT = os.getenv('PORT', '8765')
PUBLIC_HOST = os.getenv('RENDER_EXTERNAL_HOSTNAME', '').strip().lower()
HOSTS = {f'localhost:{PORT}', f'127.0.0.1:{PORT}'}
if PUBLIC_HOST:
    HOSTS.add(PUBLIC_HOST)
CSP = ("default-src 'self'; script-src 'self'; style-src 'self'; "
       "connect-src 'self'; media-src 'self' blob:; img-src 'self' data:; object-src 'none'; "
       "base-uri 'none'; form-action 'self'; frame-ancestors 'none'")
FILES = {'/': ROOT / 'index.html', '/app.js': ROOT / 'app.js',
         '/style.css': ROOT / 'style.css', '/local-app.js': ROOT / 'local-app.js', '/local.css': ROOT / 'local.css'}
FILES.update({f'/assets/{p.name}': p for p in (ROOT / 'assets').iterdir()
              if p.is_file() and p.suffix in {'.png', '.ttf'}})


def token(owner):
    return hmac.new(SECRET, owner.encode(), hashlib.sha256).hexdigest()


def response(start, data, status=200, content_type=None, extra=(), head=False):
    body = data if isinstance(data, bytes) else json.dumps(data, ensure_ascii=False).encode()
    headers = [('Content-Type', content_type or 'application/json; charset=utf-8'),
               ('Content-Length', str(len(body))), ('Cache-Control', 'no-store'),
               ('Content-Security-Policy', CSP), ('X-Content-Type-Options', 'nosniff'),
               ('Referrer-Policy', 'no-referrer'),
               ('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()')]
    start(f'{status} {HTTPStatus(status).phrase}', headers + list(extra))
    return [b'' if head else body]


def app(env, start):
    def reply(data, status=200, **kw):
        return response(start, data, status, **kw)

    method = env.get('REQUEST_METHOD', 'GET')
    path = env.get('PATH_INFO', '/')
    host = env.get('HTTP_HOST', '').lower()
    if path == '/healthz' and method in {'GET', 'HEAD'}:
        return reply({'status': 'ok', 'mode': 'demo'}, head=method == 'HEAD')
    if host not in HOSTS:
        return reply({'error': 'Host no permitido.'}, 403)
    try:
        cookie = SimpleCookie(env.get('HTTP_COOKIE', ''))
        owner = cookie['sd_demo'].value if 'sd_demo' in cookie else ''
        if len(owner) != 43 or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_' for c in owner):
            owner = ''
        if method in {'GET', 'HEAD'}:
            if path == '/api/config':
                owner = owner or secrets.token_urlsafe(32)
                secure = '; Secure' if PUBLIC_HOST else ''
                return reply(dict(token=token(owner), model='', model_available=False,
                                  installed=[], public_demo=True, local_flow=True, **capabilities()),
                             extra=[('Set-Cookie', f'sd_demo={owner}; Path=/; HttpOnly; SameSite=Strict{secure}')],
                             head=method == 'HEAD')
            file = FILES.get(path)
            if file is None:
                return reply({'error': 'No encontrado.'}, 404)
            content_type = {'.js': 'application/javascript', '.ttf': 'font/ttf'}.get(file.suffix)
            content_type = content_type or mimetypes.guess_type(file.name)[0] or 'application/octet-stream'
            body = file.read_bytes()
            if path == '/':
                body = body.replace(b'src="/app.js"', b'src="/local-app.js"').replace(b'</head>', b'<link rel="stylesheet" href="/local.css"></head>')
            return reply(body, content_type=content_type, head=method == 'HEAD')
        if method != 'POST':
            return reply({'error': 'Método no permitido.'}, 405)
        if path not in {'/api/start', '/api/action', '/api/end', '/api/transcribe', '/api/ocr'}:
            return reply({'error': 'No encontrado.'}, 404)
        supplied = env.get('HTTP_X_SD_TOKEN', '')
        if not owner or not hmac.compare_digest(supplied, token(owner)):
            return reply({'error': 'Recargue la página para iniciar una sesión válida.'}, 403)
        origin = env.get('HTTP_ORIGIN')
        scheme = 'https' if PUBLIC_HOST else env.get('wsgi.url_scheme', 'http')
        if origin and origin != f'{scheme}://{host}':
            return reply({'error': 'Origen no permitido.'}, 403)
        if path in {'/api/transcribe', '/api/ocr'}:
            with LOCK:
                now = time.monotonic()
                active = any(who == owner and now - session.touched <= TTL for who, session in SESSIONS.values())
            if not active:
                return reply({'error': 'Inicie una atención antes de usar cámara o micrófono.'}, 403)
            size = int(env.get('CONTENT_LENGTH') or 0)
            if not 0 < size <= 8_000_000:
                return reply({'error': 'Captura demasiado grande.'}, 413)
            raw = env['wsgi.input'].read(size)
            try:
                return reply(run_media(path, raw, owner))
            except MediaBusy:
                return reply({'error': 'El servidor está procesando otra captura. Intente nuevamente.'}, 429)
            except ValueError:
                return reply({'error': 'No se pudo leer la captura. Repita o use la entrada escrita.'}, 400)
            except Exception as exc:
                print('Media unavailable:', type(exc).__name__, flush=True)
                return reply({'error': 'El reconocimiento no está disponible. Use el chat o reintente.'}, 503)
        length = int(env.get('CONTENT_LENGTH') or 0)
        if not 0 <= length <= 12000:
            return reply({'error': 'Mensaje demasiado largo.'}, 413)
        req = json.loads(env['wsgi.input'].read(length) or b'{}')
        if not isinstance(req, dict):
            raise ValueError('Invalid JSON object')
        with LOCK:
            now = time.monotonic()
            for sid in list(SESSIONS):
                if now - SESSIONS[sid][1].touched > TTL:
                    del SESSIONS[sid]
            if path == '/api/start':
                owned = [sid for sid, (who, _) in SESSIONS.items() if who == owner]
                if len(owned) >= 5:
                    del SESSIONS[owned[0]]
                if len(SESSIONS) >= MAX_SESSIONS:
                    return reply({'error': 'La demo está ocupada. Intente más tarde.'}, 429)
                sid = secrets.token_urlsafe(24)
                s = Session()
                SESSIONS[sid] = (owner, s)
                return reply({'session': sid, 'state': s.snapshot()})
            sid = req.get('session', '')
            if not isinstance(sid, str):
                raise ValueError('Invalid session')
            entry = SESSIONS.get(sid)
            if not entry or entry[0] != owner:
                return reply({'error': 'La sesión terminó. Inicie una nueva atención.'}, 410)
            if path == '/api/end':
                del SESSIONS[sid]
                return reply({'finished': True})
            s = entry[1]
            if req.get('revision') != s.revision:
                return reply({'error': 'La pantalla cambió. Reinicie la atención.'}, 409)
            action = req.get('action', '')
            value = req.get('value', '')
            if not isinstance(action, str) or not isinstance(value, str) or len(value) > 1200:
                raise ValueError('Invalid action')
            value = value.strip()
            if action == 'text' and s.step != 'email':
                action = simple_intent(s.step, value) or action
            result = s.act(action, value)
            if result.get('finished'):
                del SESSIONS[sid]
            return reply(result)
    except (ValueError, TypeError, KeyError, UnicodeError):
        return reply({'error': 'Revise la información o use una opción del paso actual.'}, 400)


if __name__ == '__main__':
    # Local check only. Render uses Gunicorn, never this development server.
    from wsgiref.simple_server import make_server
    print(f'Demo pública en prueba local: http://127.0.0.1:{PORT}')
    make_server('127.0.0.1', int(PORT), app).serve_forever()
