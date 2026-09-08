"""
Tests for leave_management app.
"""

from datetime import date, timedelta
from unittest.mock import patch
from uuid import uuid4

from django.test import TestCase
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from .models import LeaveRequest, LeaveBalance, GlobalSettings, count_business_days
from apps.dashboard.models.calendar import CalendarWorkspace
from apps.users.models import Team, TeamMembership


class LeaveRequestViewSetTests(TestCase):
    """Test LeaveRequestViewSet CRUD operations and approval workflow."""

    def setUp(self):
        """Set up test data."""
        self.client = APIClient()
        today = timezone.localdate()
        self.business_day = today + timedelta(days=(7 - today.weekday()) % 7 or 7)
        self.user = User.objects.create_user(username='testuser', password='testpass')
        self.staff_user = User.objects.create_user(username='staff', password='testpass', is_staff=True)

        # Create leave balance for user (set accrual_start_date far in the past for full accrual)
        self.settings = GlobalSettings.objects.get_or_create(pk=1)[0]
        current_year = timezone.now().year
        self.balance = LeaveBalance.objects.create(
            user=self.user,
            leave_type='vacation',
            year=current_year,
            total_days=self.settings.default_yearly_leave_days,
            accrual_start_date=date(2000, 1, 1)
        )
        self.workspace = CalendarWorkspace.objects.create(name='Leave WS', code='lv-ws', is_public=True)

    def test_count_business_days_excludes_weekends(self):
        """Mon–Fri range spanning a weekend must not count Sat/Sun."""
        # 2026-07-24 is Friday; 2026-07-27 is Monday → Fri+Mon = 2 business days
        self.assertEqual(count_business_days(date(2026, 7, 24), date(2026, 7, 27)), 2)
        # Pure weekend
        self.assertEqual(count_business_days(date(2026, 7, 25), date(2026, 7, 26)), 0)
        # Full week Mon–Sun
        self.assertEqual(count_business_days(date(2026, 7, 20), date(2026, 7, 26)), 5)

    def test_validate_and_deduct_use_same_business_day_count(self):
        """Validation must charge the same weekday count as LeaveRequest.days_requested."""
        # Fixed Fri–Mon range: 2 business days (not 4 calendar days).
        start = date(2026, 7, 24)  # Friday
        end = date(2026, 7, 27)    # Monday
        expected = count_business_days(start, end)
        self.assertEqual(expected, 2)

        initial_pending = self.balance.pending_days
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            '/api/leave-management/requests/',
            {
                'start_date': start.isoformat(),
                'end_date': end.isoformat(),
                'request_type': 'vacation',
                'reason': 'Weekend-spanning leave',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['days_requested'], expected)

        self.balance.refresh_from_db()
        self.assertEqual(
            float(self.balance.pending_days),
            float(initial_pending) + expected,
            "pending_days must increase by business days only",
        )

    def test_weekend_only_vacation_rejected(self):
        """A Sat–Sun range has 0 business days and must fail validation."""
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            '/api/leave-management/requests/',
            {
                'start_date': '2026-07-25',  # Saturday
                'end_date': '2026-07-26',    # Sunday
                'request_type': 'vacation',
                'reason': 'Weekend only',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)

    def test_user_balance_summary_includes_previous_year_carry_over(self):
        """Carry-over rows are year=N-1; summary must not filter year=current."""
        current_year = timezone.now().year
        carry = LeaveBalance.objects.create(
            user=self.user,
            leave_type='vacation',
            year=current_year - 1,
            total_days=5,
            is_carry_over=True,
            expires_at=date(current_year, 12, 31),
        )
        self.client.force_authenticate(user=self.user)
        response = self.client.get('/api/leave-management/balances/user_balance_summary/')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIsNotNone(response.data['vacation']['carry_over'])
        self.assertEqual(response.data['vacation']['carry_over']['id'], carry.id)
        self.assertNotIn('sick', response.data)

    def test_create_leave_request(self):
        """Test creating a leave request."""
        data = {
            'start_date': timezone.now().date().isoformat(),
            'end_date': (timezone.now().date() + timezone.timedelta(days=4)).isoformat(),
            'request_type': 'vacation',
            'reason': 'Test leave'
        }
        self.client.force_authenticate(user=self.user)
        response = self.client.post('/api/leave-management/requests/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(LeaveRequest.objects.count(), 1)

    def test_approve_leave_request(self):
        """Test approving a leave request."""
        request = LeaveRequest.objects.create(
            user=self.user,
            start_date=self.business_day,
            end_date=self.business_day,
            request_type='vacation',
            reason='Test leave',
            status='pending',
            balance=self.balance
        )
        self.client.force_authenticate(user=self.staff_user)
        response = self.client.post(f'/api/leave-management/requests/{request.id}/approve/')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        request.refresh_from_db()
        self.assertEqual(request.status, 'approved')

    def test_reject_leave_request(self):
        """Test rejecting a leave request."""
        request = LeaveRequest.objects.create(
            user=self.user,
            start_date=self.business_day,
            end_date=self.business_day,
            request_type='vacation',
            reason='Test leave',
            status='pending',
            balance=self.balance
        )
        data = {'rejection_reason': 'Insufficient balance'}
        self.client.force_authenticate(user=self.staff_user)
        response = self.client.post(f'/api/leave-management/requests/{request.id}/reject/', data)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        request.refresh_from_db()
        self.assertEqual(request.status, 'rejected')

    def test_overlapping_leave_request_blocked(self):
        """Ensure overlapping requests are rejected with 400 error."""
        start = self.business_day
        LeaveRequest.objects.create(
            user=self.user,
            start_date=start,
            end_date=start + timezone.timedelta(days=2),
            request_type='vacation',
            status='approved',
            balance=self.balance
        )

        payload = {
            'start_date': start.isoformat(),
            'end_date': (start + timezone.timedelta(days=1)).isoformat(),
            'request_type': 'vacation',
            'reason': 'Overlap attempt'
        }
        self.client.force_authenticate(user=self.user)
        response = self.client.post('/api/leave-management/requests/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertIn('Overlapping', str(response.data))

    def test_carry_over_expiry_respects_timezone(self):
        """Carry-over expiry check must use timezone.localdate() to avoid drift."""
        balance = LeaveBalance.objects.create(
            user=self.user,
            leave_type='vacation',
            year=timezone.now().year - 1,
            total_days=10,
            used_days=0,
            pending_days=0,
            is_carry_over=True,
            expires_at=date(2026, 3, 31)
        )
        with patch('apps.leave_management.models.core.timezone.localdate', return_value=date(2026, 4, 1)):
            self.assertTrue(balance.is_expired)

    def test_hr_user_cannot_create_leave_request(self):
        """HR users must be denied create even though they pass IsAuthenticated."""
        hr_user = User.objects.create_user(username='hruser', password='testpass')
        profile = hr_user.profile
        profile.is_hr_user = True
        profile.save()

        self.client.force_authenticate(user=hr_user)
        data = {
            'start_date': timezone.now().date().isoformat(),
            'end_date': (timezone.now().date() + timezone.timedelta(days=1)).isoformat(),
            'request_type': 'sick',
            'reason': 'HR create attempt',
        }
        response = self.client.post('/api/leave-management/requests/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, response.data)

    def test_team_pending_months_groups_by_month(self):
        """team_pending_months returns months with pending counts, sorted ascending."""
        LeaveRequest.objects.create(
            user=self.user, start_date=date(2026, 3, 10), end_date=date(2026, 3, 12),
            request_type='vacation', reason='Mar', status='pending', balance=self.balance,
        )
        LeaveRequest.objects.create(
            user=self.user, start_date=date(2026, 1, 5), end_date=date(2026, 1, 8),
            request_type='sick', reason='Jan', status='pending', balance=self.balance,
        )
        LeaveRequest.objects.create(
            user=self.user, start_date=date(2026, 2, 1), end_date=date(2026, 2, 3),
            request_type='vacation', reason='Approved', status='approved', balance=self.balance,
        )
        self.client.force_authenticate(user=self.staff_user)
        response = self.client.get('/api/leave-management/requests/team_pending_months/')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        months = response.data
        self.assertEqual(len(months), 2)
        self.assertEqual(months[0]['month'], '2026-01-01')
        self.assertEqual(months[0]['count'], 1)
        self.assertEqual(months[1]['month'], '2026-03-01')
        self.assertEqual(months[1]['count'], 1)

    def test_deduct_balance_uses_carry_over_when_sufficient(self):
        """When carry-over fully covers the request, only carry-over is deducted."""
        current_year = timezone.now().year
        future_expiry = date(current_year, 12, 31)
        carry = LeaveBalance.objects.create(
            user=self.user,
            leave_type='vacation',
            year=current_year - 1,
            total_days=10,
            is_carry_over=True,
            expires_at=future_expiry,
        )
        initial_carry_pending = carry.pending_days
        initial_balance_pending = self.balance.pending_days

        self.client.force_authenticate(user=self.user)
        data = {
            'start_date': timezone.now().date().isoformat(),
            'end_date': (timezone.now().date() + timezone.timedelta(days=2)).isoformat(),
            'request_type': 'vacation',
            'reason': 'Using carry-over',
        }
        response = self.client.post('/api/leave-management/requests/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

        carry.refresh_from_db()
        self.balance.refresh_from_db()
        self.assertGreater(carry.pending_days, initial_carry_pending, "carry-over pending should increase")
        self.assertEqual(self.balance.pending_days, initial_balance_pending, "current year should be untouched")

    def test_deduct_balance_uses_current_year_when_carry_over_insufficient(self):
        """When carry-over cannot cover the full request, current year is used instead."""
        current_year = timezone.now().year
        future_expiry = date(current_year, 12, 31)
        carry = LeaveBalance.objects.create(
            user=self.user,
            leave_type='vacation',
            year=current_year - 1,
            total_days=2,
            is_carry_over=True,
            expires_at=future_expiry,
        )
        initial_carry_pending = carry.pending_days
        initial_balance_pending = self.balance.pending_days

        self.client.force_authenticate(user=self.user)
        data = {
            'start_date': timezone.now().date().isoformat(),
            'end_date': (timezone.now().date() + timezone.timedelta(days=4)).isoformat(),
            'request_type': 'vacation',
            'reason': 'Requesting more than carry-over covers',
        }
        response = self.client.post('/api/leave-management/requests/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

        carry.refresh_from_db()
        self.balance.refresh_from_db()
        self.assertEqual(carry.pending_days, initial_carry_pending, "carry-over should be untouched")
        self.assertGreater(self.balance.pending_days, initial_balance_pending, "current year pending should increase")

    def test_team_endpoints_workspace_scope(self):
        """Leave TL endpoints work with or without workspace_ids."""
        self.client.force_authenticate(user=self.staff_user)

        # team_balances without workspace returns all team entries
        response = self.client.get('/api/leave-management/balances/team_balances/')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        # team_balances with workspace also works
        response = self.client.get('/api/leave-management/balances/team_balances/', {'workspace_ids': str(self.workspace.id)})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        # team_logs without workspace returns all team entries
        response = self.client.get('/api/leave-management/requests/team_logs/')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        response = self.client.get('/api/leave-management/requests/team_logs/', {'workspace_ids': str(self.workspace.id)})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

    def test_regular_team_member_is_forbidden_from_leave_team_logs(self):
        """Regular team members must not access leave team endpoints."""
        teammate = User.objects.create_user(username='lv-teammate', password='testpass')
        team = Team.objects.create(name='Leave Team', code=f'LV{uuid4().hex[:8]}')
        TeamMembership.objects.create(user_profile=self.user.profile, team=team, is_primary_team=True)
        TeamMembership.objects.create(user_profile=teammate.profile, team=team)
        workspace = CalendarWorkspace.objects.create(
            name='Leave Workspace',
            code=f'lv-ws-{uuid4().hex[:8]}',
            team=team,
            is_public=False,
        )
        teammate_balance = LeaveBalance.objects.create(
            user=teammate,
            leave_type='vacation',
            year=timezone.now().year,
            total_days=self.settings.default_yearly_leave_days,
        )
        LeaveRequest.objects.create(
            user=teammate,
            start_date=self.business_day,
            end_date=self.business_day,
            request_type='vacation',
            reason='Team leave',
            status='approved',
            balance=teammate_balance,
        )

        self.client.force_authenticate(user=self.user)
        response = self.client.get('/api/leave-management/requests/team_logs/', {'workspace_ids': str(workspace.id)})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, response.data)

    def test_user_without_team_blocked_from_leave_team_logs(self):
        """Users without team membership should be denied access to team_logs."""
        team = Team.objects.create(name='Other Leave Team', code=f'LV{uuid4().hex[8:16]}')
        workspace = CalendarWorkspace.objects.create(
            name='Other Leave Workspace',
            code=f'lv-ws-{uuid4().hex[8:]}',
            team=team,
            is_public=False,
        )
        self.client.force_authenticate(user=self.user)
        response = self.client.get('/api/leave-management/requests/team_logs/', {'workspace_ids': str(workspace.id)})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, response.data)

    def test_carry_over_priority_before_march_31(self):
        """Carry-over is prioritized before March 31 deadline."""
        current_year = timezone.now().year
        carry_over_expiry = date(current_year, 3, 31)
        
        # Mock today to be before March 31
        with patch('apps.leave_management.viewsets.timezone.localdate', return_value=date(current_year, 1, 15)):
            carry = LeaveBalance.objects.create(
                user=self.user,
                leave_type='vacation',
                year=current_year - 1,
                total_days=5,
                is_carry_over=True,
                expires_at=carry_over_expiry,
            )
            initial_carry_pending = carry.pending_days
            initial_balance_pending = self.balance.pending_days

            self.client.force_authenticate(user=self.user)
            data = {
                'start_date': date(current_year, 1, 20).isoformat(),
                'end_date': date(current_year, 1, 22).isoformat(),
                'request_type': 'vacation',
                'reason': 'Before March 31',
            }
            response = self.client.post('/api/leave-management/requests/', data, format='json')
            self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

            carry.refresh_from_db()
            self.balance.refresh_from_db()
            self.assertGreater(carry.pending_days, initial_carry_pending, "carry-over should be used before March 31")
            self.assertEqual(self.balance.pending_days, initial_balance_pending, "current year should be untouched")

