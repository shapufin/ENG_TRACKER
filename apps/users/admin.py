from django import forms
from django.contrib import admin
from django.contrib.admin.forms import AdminAuthenticationForm

from .services import mfa as mfa_service


class MFAAdminAuthenticationForm(AdminAuthenticationForm):
    """Django-admin login with the same second-factor rules as the API.

    A Django admin session also authenticates ``/api/*`` (DRF SessionAuthentication),
    so a password-only admin login would bypass MFA for everything.
    """

    otp = forms.CharField(
        required=False,
        strip=True,
        label='Authentication code',
        help_text='Only needed if two-factor authentication is on for your account. A backup code also works.',
        widget=forms.TextInput(attrs={'autocomplete': 'one-time-code', 'autocapitalize': 'characters'}),
    )

    def confirm_login_allowed(self, user):
        super().confirm_login_allowed(user)
        if mfa_service.is_enrolled(user):
            code = self.cleaned_data.get('otp') or ''
            if not code:
                raise forms.ValidationError('Enter your authentication code.', code='mfa_required')
            try:
                mfa_service.verify_second_factor(user, code)
            except mfa_service.MFAError as exc:
                raise forms.ValidationError(exc.message, code=exc.code)
        elif mfa_service.required_source(user) is not None:
            raise forms.ValidationError(
                'Two-factor authentication is required for your account. '
                'Sign in to the app once to set it up, then come back.',
                code='mfa_setup_required',
            )


admin.site.login_form = MFAAdminAuthenticationForm
admin.site.login_template = 'users/admin_login.html'
