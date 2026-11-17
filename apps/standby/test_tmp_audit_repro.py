import datetime as dt
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from django.utils import timezone
from apps.standby.models import StandbyLog


class Repro(APITestCase):
    def setUp(self):
        U = get_user_model()
        self.u = U.objects.create_user('repro', password='x')
        self.s = U.objects.create_user('staffy', password='x', is_staff=True, is_superuser=True)
        self.client.raise_request_exception = False
        self.client.force_authenticate(self.u)
        self.today = timezone.localdate()

    def p(self, label, r):
        print('PROBE', label, r.status_code, str(getattr(r, 'data', ''))[:160])

    def test_probes(self):
        c = self.client
        d = self.today.isoformat()
        self.p('only start_time + hours', c.post('/api/standby/logs/', {'date': d, 'start_time': '10:00', 'hours': 3}, format='json'))
        self.p('hours 0.5 no times', c.post('/api/standby/logs/', {'date': d, 'hours': '0.5'}, format='json'))
        r = c.post('/api/standby/logs/', {'date': d, 'start_time': '12:00', 'end_time': '14:00'}, format='json')
        log = StandbyLog.objects.filter(user=self.u, start_time='12:00').first()
        # duplicate identical
        self.p('dup same slot', c.post('/api/standby/logs/', {'date': d, 'start_time': '12:00', 'end_time': '14:00'}, format='json'))
        StandbyLog.objects.filter(pk=log.pk).update(status='rejected', rejection_reason='no')
        r = c.patch(f'/api/standby/logs/{log.pk}/', {'description': 'fixed'}, format='json')
        log.refresh_from_db()
        self.p('edit rejected -> status=' + log.status, r)
        # no-times entries never overlap: two 24h on same day
        self.p('24h no times #1', c.post('/api/standby/logs/', {'date': d, 'hours': 24}, format='json'))
        self.p('24h no times #2', c.post('/api/standby/logs/', {'date': d, 'hours': 24}, format='json'))
        self.p('list bad date', c.get('/api/standby/logs/?date=garbage'))
        self.p('summary', c.get('/api/standby/logs/summary/'))
        c.force_authenticate(self.s)
        for url in ['/api/standby/logs/team_pending/?date_from=garbage', '/api/standby/logs/team_logs/?date=garbage',
                    '/api/standby/logs/admin_logs/?date=garbage', '/api/overtime/logs/team_pending/?date_from=garbage',
                    '/api/overtime/logs/team_logs/?date=garbage', '/api/overtime/logs/admin_logs/?date=garbage',
                    '/api/standby/logs/admin_logs/?page=abc', '/api/standby/logs/?user=abc',
                    '/api/standby/logs/export/?date_from=garbage', '/api/overtime/logs/export/?date_from=garbage']:
            self.p(url, c.get(url))
        self.p('bulk_approve bad ids', c.post('/api/standby/logs/bulk_approve/', {'ids': 'x'}, format='json'))
        self.p('create for bad user', c.post('/api/standby/logs/', {'date': d, 'hours': 2, 'user': 'abc'}, format='json'))
        self.p('create for missing user', c.post('/api/standby/logs/', {'date': d, 'hours': 2, 'user': 999999}, format='json'))
