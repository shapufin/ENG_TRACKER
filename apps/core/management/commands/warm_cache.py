"""
Management command to warm the application cache.

Pre-loads frequently accessed data into cache on deployment
to eliminate cold-start performance issues.
"""

from django.core.management.base import BaseCommand
from django.core.cache import cache
from apps.permissions.models import Role, Permission, Group
from apps.core.cache_constants import CacheKey, CacheTTL


class Command(BaseCommand):
    help = 'Warm the application cache with frequently accessed data'

    def handle(self, *args, **options):
        self.stdout.write('Starting cache warming...')
        
        try:
            # Warm role cache
            roles = Role.objects.all().select_related().prefetch_related('permissions')
            role_count = 0
            for role in roles:
                cache_key = CacheKey.role(role.id)
                cache.set(cache_key, role, CacheTTL.LONG)
                role_count += 1
            
            self.stdout.write(f'✓ Warmed {role_count} roles')
            
            # Warm permission cache
            permissions = Permission.objects.all()
            perm_count = 0
            for perm in permissions:
                cache_key = f"perm:all:{perm.module}:{perm.action}"
                cache.set(cache_key, perm, CacheTTL.LONG)
                perm_count += 1
            
            self.stdout.write(f'✓ Warmed {perm_count} permissions')
            
            # Warm group cache
            groups = Group.objects.all().prefetch_related('permissions')
            group_count = 0
            for group in groups:
                cache_key = f"group:{group.id}"
                cache.set(cache_key, group, CacheTTL.LONG)
                group_count += 1
            
            self.stdout.write(f'✓ Warmed {group_count} groups')
            
            total = role_count + perm_count + group_count
            self.stdout.write(
                self.style.SUCCESS(
                    f'\n✓ Cache warming complete! Warmed {total} items'
                )
            )
            
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f'Error during cache warming: {str(e)}')
            )
            raise
