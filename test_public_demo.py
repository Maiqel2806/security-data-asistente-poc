import io
import json
import unittest
from wsgiref.util import setup_testing_defaults
from wsgiref.validate import validator

import public_demo as web


class Client:
    def __init__(self):
        self.cookie = ''
        self.token = ''

    def call(self, path, payload=None, **overrides):
        env = {}
        setup_testing_defaults(env)
        data = json.dumps(payload or {}).encode()
        env.update(HTTP_HOST=f'localhost:{web.PORT}', PATH_INFO=path,
                   REQUEST_METHOD='GET' if payload is None else 'POST',
                   CONTENT_LENGTH=str(len(data)), CONTENT_TYPE='application/json',
                   QUERY_STRING='', HTTP_COOKIE=self.cookie, HTTP_X_SD_TOKEN=self.token,
                   **{'wsgi.input': io.BytesIO(data)})
        env.update(overrides)
        output = {}
        def start(status, headers, exc_info=None):
            output.update(status=int(status.split()[0]), headers=dict(headers))
        result = validator(web.app)(env, start)
        try:
            output['body'] = b''.join(result)
        finally:
            if hasattr(result, 'close'):
                result.close()
        if 'Set-Cookie' in output['headers']:
            self.cookie = output['headers']['Set-Cookie'].split(';')[0]
        if output['headers']['Content-Type'].startswith('application/json'):
            output['json'] = json.loads(output['body']) if output['body'] else {}
        return output

    def configure(self):
        self.token = self.call('/api/config')['json']['token']
        return self


class PublicDemoTests(unittest.TestCase):
    def setUp(self):
        web.SESSIONS.clear()
        self.c = Client().configure()

    def test_full_journey(self):
        result = self.c.call('/api/start', {})['json']
        sid, state = result['session'], result['state']
        for action, value in [('text','quiero mi firma'), ('personal',''),
                              ('fixture',''), ('confirm',''),
                              ('text','alex@example.com'), ('self',''), ('year1',''),
                              ('confirm',''), ('pay_ok',''), ('bio_ok',''),
                              ('issue_ok',''), ('download_help',''), ('finish','')]:
            r = self.c.call('/api/action', dict(session=sid,revision=state['revision'],action=action,value=value))
            self.assertEqual(r['status'], 200, r)
            state = r['json']
        self.assertTrue(state['finished'])
        self.assertNotIn(sid, web.SESSIONS)

    def test_browser_isolation(self):
        sid = self.c.call('/api/start', {})['json']['session']
        other = Client().configure()
        self.assertEqual(other.call('/api/end', {'session':sid})['status'],410)
        self.assertIn(sid, web.SESSIONS)

    def test_origin_token_and_host(self):
        self.assertEqual(self.c.call('/api/start', {}, HTTP_X_SD_TOKEN='bad')['status'],403)
        self.assertEqual(self.c.call('/api/start', {}, HTTP_ORIGIN='https://evil.example')['status'],403)
        self.assertEqual(self.c.call('/', HTTP_HOST='evil.example')['status'],403)

    def test_routes_and_body_bounds(self):
        for path in ['/', '/app.js', '/style.css', '/assets/asistente-transparente.png','/healthz']:
            self.assertEqual(self.c.call(path)['status'],200,path)
        for path in ['/server.py','/.env','/assets/../server.py']:
            self.assertEqual(self.c.call(path)['status'],404,path)
        self.assertEqual(self.c.call('/api/start', {}, CONTENT_LENGTH='13000')['status'],413)
        self.assertEqual(self.c.call('/api/start', [], **{'wsgi.input':io.BytesIO(b'[]'),'CONTENT_LENGTH':'2'})['status'],400)

    def test_stale_revision_expiry_and_end(self):
        sid = self.c.call('/api/start', {})['json']['session']
        r = self.c.call('/api/action',dict(session=sid,revision=99,action='new'))
        self.assertEqual(r['status'],409)
        web.SESSIONS[sid][1].touched -= 901
        self.assertEqual(self.c.call('/api/action',dict(session=sid,revision=0,action='new'))['status'],410)

    def test_public_has_no_voice_or_llm(self):
        config = self.c.call('/api/config')['json']
        self.assertTrue(config['public_demo'])
        self.assertFalse(config['voice'])
        self.assertFalse(config['model_available'])
        self.assertEqual(self.c.call('/api/transcribe', {})['status'],503)

    def test_capacity(self):
        for _ in range(7):
            self.c.call('/api/start', {})
        self.assertEqual(len(web.SESSIONS),5)

    def test_render_https(self):
        old_host = web.PUBLIC_HOST
        web.PUBLIC_HOST = 'sd-review.onrender.com'
        web.HOSTS.add(web.PUBLIC_HOST)
        try:
            r = self.c.call('/api/config', HTTP_HOST=web.PUBLIC_HOST)
            self.assertIn('; Secure',r['headers']['Set-Cookie'])
            self.c.token = r['json']['token']
            self.assertEqual(self.c.call('/api/start',{},HTTP_HOST=web.PUBLIC_HOST,
                                        HTTP_ORIGIN='https://'+web.PUBLIC_HOST)['status'],200)
        finally:
            web.HOSTS.discard(web.PUBLIC_HOST)
            web.PUBLIC_HOST = old_host


if __name__ == '__main__':
    unittest.main()
