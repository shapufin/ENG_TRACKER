from django import forms
from django.contrib import admin
from django.contrib.admin.forms import AdminAuthenticationForm
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.contrib.auth.forms import UserChangeForm
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


class LeaderAwareUserChangeForm(UserChangeForm):
    """Deactivating a user who leaves something behind needs an explicit confirmation.

    The lines are the same ones the importer reports (user_deactivation.py). The admin
    must tick the box before the save goes through; reactivation never asks.
    """

    confirm_offboarding = forms.BooleanField(
        required=False,
        label='I have read the offboarding warnings above and want to deactivate this user',
    )

    def clean(self):
        cleaned = super().clean()
        user = self.instance
        deactivating = (
            user.pk is not None
            and 'is_active' in self.changed_data
            and not cleaned.get('is_active')
        )
        if deactivating and not cleaned.get('confirm_offboarding'):
            lines = deactivation_warnings(user)
            if lines:
                self.add_error('confirm_offboarding', ' '.join(lines))
        return cleaned


class LeaderAwareUserAdmin(DjangoUserAdmin):
    """Django's user admin with the offboarding confirmation (audithandover.md M2).

    Deactivation changes nothing else on purpose (reactivating restores it all); the form
    lists what is left behind and asks for confirmation. See user_deactivation.py.
    """

    form = LeaderAwareUserChangeForm
    fieldsets = DjangoUserAdmin.fieldsets + (
        ('Offboarding', {'fields': ('confirm_offboarding',)}),
    )


try:
    admin.site.unregister(User)
except admin.sites.NotRegistered:
    pass
admin.site.register(User, LeaderAwareUserAdmin)
