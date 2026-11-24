"""The upload throttle counts file parsing only (production 429, 2026-11-24).

``throttle_scope = 'upload'`` sat on the whole ``TicketUploadViewSet``, so the
batch lists a leader's team page reloads after every import, review and delete
shared the 30/hour file-parsing bucket. A Line Manager importing for a few
members ran it dry and every later Analyze answered 429.
"""
from unittest import mock

from django.core.cache import cache
from rest_framework.test import APIRequestFactory, force_authenticate
from rest_framework.throttling import ScopedRateThrottle

from plugins.ticket_kpi.test_leader_upload import LeaderUploadBase
from plugins.ticket_kpi.viewsets import TicketUploadViewSet

factory = APIRequestFactory()
RATES = {'upload': '2/hour'}


@mock.patch.object(ScopedRateThrottle, 'THROTTLE_RATES', RATES)
class UploadThrottleScopeTests(LeaderUploadBase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)

    def list_batches(self, action):
        request = factory.get('/x/')
        force_authenticate(request, self.lm)
        return TicketUploadViewSet.as_view({'get': action})(request)

    def test_batch_lists_do_not_spend_the_upload_budget(self):
        for _ in range(5):
            self.assertEqual(self.list_batches('team_batches').status_code, 200)
            self.assertEqual(self.list_batches('my_batches').status_code, 200)
        response = self.call(self.lm, action='analyze')
        self.assertEqual(response.status_code, 200, response.data)

    def test_file_parsing_is_still_throttled(self):
        for _ in range(2):
            self.assertEqual(self.call(self.lm, action='analyze').status_code, 200)
        self.assertEqual(self.call(self.lm, action='analyze').status_code, 429)
