"""A malformed date query parameter is a 400, never a 500 (audit F3, 2026-11-16).

``team_pending`` (``date_from``/``date_to``), ``team_logs`` (``date``) and
``admin_logs`` (``date``) passed the raw string to the ORM, which raised a
Django ``ValidationError`` that DRF does not convert.
"""
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

URLS = [
    f'/api/{app}/logs/{action}/?{param}=garbage'
    for app in ('overtime', 'standby')
    for action, param in (
        ('team_pending', 'date_from'),
        ('team_pending', 'date_to'),
        ('team_logs', 'date'),
        ('admin_logs', 'date'),
    )
]


class MalformedDateParamTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(username='dp_admin', password='x', email='a@a.a')
        self.api = APIClient()
        self.api.force_authenticate(self.admin)

    def test_garbage_date_is_a_400(self):
        for url in URLS:
            with self.subTest(url=url):
                self.assertEqual(self.api.get(url).status_code, 400)

    def test_valid_date_still_works(self):
        for app in ('overtime', 'standby'):
            for action, param in (('team_pending', 'date_from'), ('team_logs', 'date'), ('admin_logs', 'date')):
                with self.subTest(app=app, action=action):
                    response = self.api.get(f'/api/{app}/logs/{action}/?{param}=2026-11-02')
                    self.assertEqual(response.status_code, 200)
