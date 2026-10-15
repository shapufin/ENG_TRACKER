"""PERF-07: LargeResultsPagination clamps ``page_size``.

The ceiling stays at 10000 on purpose: the calendar (useCalendarEventQueries.ts)
legitimately requests ``page_size=10000`` for standby and leave to render every
month at once, and a lower ceiling would silently truncate that view. Lowering
it first requires the calendar to page.
"""
from django.test import SimpleTestCase
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from core.pagination import LargeResultsPagination


class LargeResultsPaginationClampTests(SimpleTestCase):
    def _size(self, value):
        request = Request(APIRequestFactory().get('/x/', {'page_size': value}))
        return LargeResultsPagination().get_page_size(request)

    def test_oversized_request_is_clamped_to_the_ceiling(self):
        self.assertEqual(self._size(1_000_000), 10000)

    def test_the_calendar_request_is_honoured(self):
        self.assertEqual(self._size(10000), 10000)

    def test_small_request_is_untouched(self):
        self.assertEqual(self._size(25), 25)
