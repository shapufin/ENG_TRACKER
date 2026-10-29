"""Pure HR is not part of Ticket KPI: every ticket_kpi viewset refuses them.

HR who is also a TL or staff is not `is_hr_only` and keeps access.
"""
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from plugins.ticket_kpi import viewsets

VIEWSETS = [
    viewsets.ExportProfileViewSet,
    viewsets.TicketUploadViewSet,
    viewsets.TicketKPIDashboardViewSet,
    viewsets.TicketKPIReportViewSet,
    viewsets.KPIEvidenceViewSet,
    viewsets.TicketOvertimeLinkViewSet,
]


class HrOnlyBlockTests(TestCase):
    def _hr(self, username, **extra):
        user = User.objects.create_user(username=username, password='x', **extra)
        user.profile.is_hr_user = True
        user.profile.save()
        return user

    def _check(self, viewset_cls, user):
        view = viewset_cls()
        view.action_map = {'get': 'list'}
        request = APIRequestFactory().get('/')
        force_authenticate(request, user)
        view.request = view.initialize_request(request)
        view.action = 'list'
        view.kwargs = {}
        view.format_kwarg = None
        return view.check_permissions(view.request)

    def test_pure_hr_is_refused_by_every_viewset(self):
        from rest_framework.exceptions import PermissionDenied
        hr = self._hr('kpi-hr')
        for cls in VIEWSETS:
            with self.subTest(viewset=cls.__name__):
                with self.assertRaises(PermissionDenied):
                    self._check(cls, hr)

    def test_hr_who_is_also_staff_is_not_blocked_by_the_hr_rule(self):
        from rest_framework.exceptions import PermissionDenied
        hr_staff = self._hr('kpi-hr-staff', is_staff=True)
        for cls in VIEWSETS:
            with self.subTest(viewset=cls.__name__):
                try:
                    self._check(cls, hr_staff)
                except PermissionDenied as exc:
                    self.assertNotIn('not available for your role', str(exc.detail))
