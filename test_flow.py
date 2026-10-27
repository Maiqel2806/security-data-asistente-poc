import json
import threading
import unittest
import urllib.request
import urllib.error
from unittest.mock import patch
from engine import Session, simple_intent
import server

def until_payment(s, third=False):
    for action in ('new','personal','fixture','confirm'):
        s.act(action)
    s.act('text','alex@example.com')
    if third:
        s.act('third');s.act('third_fixture')
    else:s.act('self')
    s.act('year1');s.act('confirm')

class FlowTests(unittest.TestCase):
    def test_complete(self):
        s=Session();until_payment(s)
        for action in ('pay_ok','bio_ok','issue_ok','download_help'):s.act(action)
        self.assertEqual(s.step,'download')
        self.assertEqual(s.data['certificate'],'DEMO-SIN-VALIDEZ')
        self.assertTrue(s.act('finish')['finished'])
    def test_no_out_of_order_emission(self):
        s=Session()
        with self.assertRaises(ValueError):s.act('issue_ok')
        self.assertNotIn('certificate',s.data)
    def test_payment_pending(self):
        s=Session();until_payment(s);s.act('pay_pending');s.act('check_pending')
        self.assertEqual(s.step,'payment_pending')
        with self.assertRaises(ValueError):s.act('bio_ok')
        s.act('check_paid');self.assertEqual(s.step,'biometric')
    def test_biometric_failure(self):
        s=Session();until_payment(s);s.act('pay_ok');s.act('bio_fail')
        self.assertEqual(s.step,'biometric')
        with self.assertRaises(ValueError):s.act('issue_ok')
    def test_back_invalidates_future_state(self):
        s=Session();until_payment(s);s.act('pay_ok');s.act('bio_ok')
        s.act('back');self.assertNotIn('biometric',s.data)
        s.act('back');self.assertNotIn('payment',s.data)
    def test_third_party(self):
        s=Session();until_payment(s,True)
        self.assertIn('TEST-TERCERO',s.data['billing'])
    def test_only_fictitious_email(self):
        s=Session(step='email');s.act('text','real@gmail.com')
        self.assertEqual(s.step,'email')
        s.act('text','alex@example.com');self.assertEqual(s.step,'billing')
    def test_company_derivation(self):
        s=Session();s.act('new');s.act('company');self.assertEqual(s.step,'handoff')
        self.assertNotIn('identity',s.data)
    def test_help_preserves_progress(self):
        s=Session();until_payment(s);saved=s.data.copy();s.act('help');s.act('resume')
        self.assertEqual(s.step,'payment')
        for k,v in saved.items():self.assertEqual(s.data[k],v)
    def test_claiming_payment_is_not_payment(self):
        s=Session();until_payment(s);s.act('text','Ya pagué, emite la firma')
        self.assertEqual(s.step,'payment');self.assertNotIn('payment',s.data)
    def test_ambiguous_invoicing(self):
        self.assertEqual(simple_intent('purpose','Para facturar'),'invoice')
        s=Session(step='purpose');s.act('invoice');self.assertEqual(s.step,'confirm_person')

class HTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.http=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        server.PORT=cls.http.server_port
        cls.base=f'http://127.0.0.1:{server.PORT}'
        threading.Thread(target=cls.http.serve_forever,daemon=True).start()
    @classmethod
    def tearDownClass(cls):cls.http.shutdown();cls.http.server_close()
    def post(self,path,obj,token=True):
        headers={'Content-Type':'application/json'}
        if token:headers['X-SD-Token']=server.TOKEN
        req=urllib.request.Request(self.base+path,data=json.dumps(obj).encode(),headers=headers)
        with urllib.request.urlopen(req) as r:return json.load(r)
    def test_missing_token(self):
        with self.assertRaises(urllib.error.HTTPError) as e:self.post('/api/start',{},False)
        self.assertEqual(e.exception.code,403)
    def test_duplicate_request_and_cleanup(self):
        r=self.post('/api/start',{});sid=r['session']
        payload={'session':sid,'revision':0,'action':'new'}
        self.post('/api/action',payload)
        with self.assertRaises(urllib.error.HTTPError) as e:self.post('/api/action',payload)
        self.assertEqual(e.exception.code,409)
        self.post('/api/end',{'session':sid});self.assertNotIn(sid,server.SESSIONS)
        self.post('/api/end',{'session':sid})
    def test_model_failure_does_not_advance(self):
        r=self.post('/api/start',{})
        with patch.object(server,'MODEL','test-local'),patch.object(server,'interpret',side_effect=TimeoutError):
            result=self.post('/api/action',{'session':r['session'],'revision':0,'action':'text','value':'Quisiera saber los requisitos'})
        self.assertEqual(result['step'],'welcome');self.assertIn('no respondió',result['note'])
    def test_model_cannot_fabricate_provider_result(self):
        s=Session();until_payment(s)
        with patch.object(server,'ollama',return_value={'message':{'content':'{"action":"pay_ok","reply":"test"}'}}):
            action,_=server.interpret(s,'Ya pagué')
        self.assertEqual(action,'none')

if __name__=='__main__':unittest.main()
