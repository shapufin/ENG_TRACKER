"""
Set hire_date for existing users who don't have it set.
This ensures vacation balances are calculated correctly.
"""

from django.db import migrations

def set_hire_date_for_existing_users(apps, schema_editor):
    """
    Set hire_date = date_joined for all users without hire_date.
    This is a one-time migration to fix data integrity.
    """
    UserProfile = apps.get_model('users', 'UserProfile')

    # Get all user profiles without hire_date
    profiles_without_hire_date = UserProfile.objects.filter(hire_date__isnull=True)
    
    for profile in profiles_without_hire_date:
        if profile.user and profile.user.date_joined:
            profile.hire_date = profile.user.date_joined.date()
            profile.save(update_fields=['hire_date'])

def reverse_set_hire_date(apps, schema_editor):
    """Reverse migration - set hire_date back to null for all users."""
    UserProfile = apps.get_model('users', 'UserProfile')
    UserProfile.objects.all().update(hire_date=None)

class Migration(migrations.Migration):

    dependencies = [
        ('leave_management', '0001_initial'),
        ('users', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(
            set_hire_date_for_existing_users,
            reverse_set_hire_date,
        ),
    ]
