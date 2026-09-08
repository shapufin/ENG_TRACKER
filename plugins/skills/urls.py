"""URL routing for the Skills Matrix plugin."""
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .viewsets import (
    SkillCategoryViewSet,
    SkillViewSet,
    UserSkillViewSet,
    SkillMatrixViewSet,
    SkillGapReportViewSet,
    SkillExportViewSet,
    SkillRatingHistoryViewSet,
)

router = DefaultRouter()
router.register(r'categories', SkillCategoryViewSet, basename='skill-category')
router.register(r'skills', SkillViewSet, basename='skill')
router.register(r'user-skills', UserSkillViewSet, basename='user-skill')
router.register(r'matrix', SkillMatrixViewSet, basename='skill-matrix')
router.register(r'gap-report', SkillGapReportViewSet, basename='skill-gap')
router.register(r'export', SkillExportViewSet, basename='skill-export')
router.register(r'history', SkillRatingHistoryViewSet, basename='skill-history')

urlpatterns = [
    path('', include(router.urls)),
]
