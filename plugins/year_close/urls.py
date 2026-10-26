from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .viewsets import YearSnapshotFileViewSet, YearSnapshotViewSet

router = DefaultRouter()
router.register(r'snapshots', YearSnapshotViewSet, basename='year_close-snapshot')
router.register(r'files', YearSnapshotFileViewSet, basename='year_close-file')

urlpatterns = [
    path('', include(router.urls)),
]
