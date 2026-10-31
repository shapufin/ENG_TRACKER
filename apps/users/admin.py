from django import forms
from django.contrib import admin, messages
from django.contrib.admin.forms import AdminAuthenticationForm
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.contrib.auth.models import User

from .services import mfa as mfa_service
from .services.user_deactivation import deactivation_warnings


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


class LeaderAwareUserAdmin(DjangoUserAdmin):
    """Django's user admin, plus the importer's warning when a team leader is deactivated.

    Deactivation changes nothing else on purpose (reactivating restores it all), so this only
    reports the teams and members left pointing at the user. See user_deactivation.py.
    """

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        if change and 'is_active' in form.changed_data and not obj.is_active:
            for line in deactivation_warnings(obj):
                messages.warning(request, line)


try:
    admin.site.unregister(User)
except admin.sites.NotRegistered:
    pass
admin.site.register(User, LeaderAwareUserAdmin)
