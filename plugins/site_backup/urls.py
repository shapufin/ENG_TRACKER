"""
URL routing for the Site Backup & Restore plugin.
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .viewsets import BackupRecordViewSet, RestoreViewSet

router = DefaultRouter()
router.register(r'backups', BackupRecordViewSet, basename='site-backup-record')

urlpatterns = [
    path('', include(router.urls)),
    path('restore/preview/', RestoreViewSet.as_view({'post': 'preview'}), name='site-backup-restore-preview'),
    path('restore/commit/', RestoreViewSet.as_view({'post': 'commit'}), name='site-backup-restore-commit'),
]
