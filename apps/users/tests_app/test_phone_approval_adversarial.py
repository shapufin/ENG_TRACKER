"""Phone approval: the abuse cases. Spec section 9 and the Review Focus of the plan."""
import re
from pathlib import Path

from django.conf import settings
from rest_framework.test import APIClient

from apps.users.tests_app.test_phone_approval_auth import (
    COLLECT, PhoneApprovalHttpTestCase, request_url,
)
from apps.users.views import auth as auth_views


class AdversarialTests(PhoneApprovalHttpTestCase):
    def test_forwarded_approval_url_without_collect_key_cannot_sign_in(self):
        token, started = self.start()
        self.assertEqual(self.approve_on_phone(started).status_code, 200)
        attacker = APIClient()
        for body in (
            {'mfa_token': token, 'request_id': started['request_id']},
            {'mfa_token': token, 'request_id': started['request_id'], 'collect_key': 'guess'},
            {'request_id': started['request_id'], 'collect_key': started['collect_key']},
        ):
            response = attacker.post(COLLECT, body, format='json')
            self.assertIn(response.status_code, (401, 404), body)
            self.assertNotIn('access', response.data)
        self.assertEqual(self.collect(token, started).status_code, 200)  # the real PC still can

    def test_two_pcs_two_requests_are_independent(self):
        token_a, started_a = self.start()
        token_b, started_b = self.start()
        self.assertNotEqual(started_a['request_id'], started_b['request_id'])
        self.assertEqual(self.approve_on_phone(started_a).status_code, 200)
        self.assertEqual(self.collect(token_b, started_b).data, {'status': 'pending'})
        crossed = self.pc.post(COLLECT, {
            'mfa_token': token_b, 'request_id': started_a['request_id'], 'collect_key': started_b['collect_key'],
        }, format='json')
        self.assertEqual(crossed.status_code, 404)
        self.assertEqual(self.collect(token_a, started_a).status_code, 200)
        self.assertEqual(self.collect(token_b, started_b).data, {'status': 'pending'})

    def test_blind_approvals_lock_the_account_over_http(self):
        for _ in range(5):
            _, started = self.start()
            wrong = next(n for n in self.phone_client.get(request_url(started['request_id'])).data['options']
                         if n != started['number'])
            self.approve_on_phone(started, number=wrong)
        token = self.mfa_token()
        response = self.pc.post('/api/auth/token/phone-request/', {'mfa_token': token, 'via': 'qr'}, format='json')
        self.assertEqual((response.status_code, response.data['code']), (429, 'locked'))

    def test_changed_password_voids_the_pending_mfa_token(self):
        token, started = self.start()
        self.assertEqual(self.approve_on_phone(started).status_code, 200)
        self.user.set_password('new-Strong-456')
        self.user.save()
        response = self.collect(token, started)
        self.assertEqual((response.status_code, response.data['code']), (401, 'challenge_invalid'))
        self.assertNotIn('access', response.data)

    def test_approval_for_a_deactivated_user_does_not_sign_in(self):
        token, started = self.start()
        self.assertEqual(self.approve_on_phone(started).status_code, 200)
        self.user.is_active = False
        self.user.save()
        self.assertEqual(self.collect(token, started).status_code, 401)

    def test_throttle_scopes(self):
        rates = settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']
        self.assertIn('phone_poll', rates)  # DRF refuses to run a scope with no rate entry
        self.assertEqual(auth_views.PhoneCollectView.throttle_scope, 'phone_poll')
        for view in (auth_views.PhoneRequestView, auth_views.PhoneApprovalDetailView,
                     auth_views.PhoneApprovalDecideView, auth_views.PairedPhonesView,
                     auth_views.PairedPhoneDetailView):
            self.assertEqual(view.throttle_scope, 'mfa', view.__name__)


class TokenMintingSourceWalk(PhoneApprovalHttpTestCase):
    def test_only_the_existing_paths_mint_tokens(self):
        """Phone approval must end in ``_signed_in_response`` (via ``_complete_mfa_login``), never mint itself."""
        root = Path(settings.BASE_DIR) / 'apps' / 'users'
        callers = sorted(
            str(path.relative_to(root)).replace('\\', '/')
            for path in root.rglob('*.py')
            if 'tests' not in path.parts and not path.name.startswith('test_')
            and re.search(r'\.issue\(', path.read_text(encoding='utf-8'))
        )
        self.assertEqual(callers, ['serializers.py', 'views/auth.py'])
        source = (root / 'services' / 'phone_approval.py').read_text(encoding='utf-8')
        self.assertNotIn('RefreshToken', source)
        self.assertNotIn('issue(', source)
