"""Overlap detection must see overnight entries across the date boundary."""
from datetime import date, time

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.overtime.models import Client, OvertimeLog
from core.utils.time_overlap import find_overlapping_entry

User = get_user_model()
DAY1, DAY2, DAY3 = date(2026, 2, 1), date(2026, 2, 2), date(2026, 2, 3)


class CrossMidnightOverlapTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='night', password='x')
        self.client_obj = Client.objects.create(name='C', code='C', is_active=True)
        self.night = self.make(DAY1, time(23), time(1))

    def make(self, day, start, end):
        return OvertimeLog.objects.create(
            user=self.user, client=self.client_obj, date=day, start_time=start,
            end_time=end, hours=1, status='pending',
        )

    def find(self, day, start, end, **kw):
        return find_overlapping_entry(
            OvertimeLog.objects.filter(is_deleted=False), self.user.id, day, start, end, **kw,
        )

    def test_next_day_entry_inside_the_overnight_tail_overlaps(self):
        self.assertEqual(self.find(DAY2, time(0), time(1)), self.night)
        self.assertEqual(self.find(DAY2, time(0, 30), time(2)), self.night)

    def test_new_overnight_entry_overlaps_an_existing_next_day_entry(self):
        early = self.make(DAY3, time(0, 15), time(0, 45))
        self.assertEqual(self.find(DAY2, time(23), time(1)), early)

    def test_touching_ranges_do_not_overlap(self):
        self.assertIsNone(self.find(DAY2, time(1), time(2)))
        self.assertIsNone(self.find(DAY1, time(21), time(23)))

    def test_unrelated_days_and_same_day_overlap_still_work(self):
        self.assertIsNone(self.find(DAY3, time(0), time(1)))
        self.assertEqual(self.find(DAY1, time(22), time(23, 30)), self.night)

    def test_exclude_pk_and_rejected_are_ignored(self):
        self.assertIsNone(self.find(DAY2, time(0), time(1), exclude_pk=self.night.pk))
        OvertimeLog.objects.filter(pk=self.night.pk).update(status='rejected')
        self.assertIsNone(self.find(DAY2, time(0), time(1)))
