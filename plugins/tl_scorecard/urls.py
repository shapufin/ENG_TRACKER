from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .viewsets import (
    EngagementSurveyResponseViewSet,
    IdleFlagViewSet,
    IdleStatusUpdateViewSet,
    MeetingAttendeeViewSet,
    MeetingViewSet,
    ReviewDeliveryViewSet,
    TLScorecardViewSet,
)

router = DefaultRouter()
router.register(r'', TLScorecardViewSet, basename='tl-scorecard')
router.register(r'meetings', MeetingViewSet, basename='tl-scorecard-meeting')
router.register(r'meeting-attendees', MeetingAttendeeViewSet, basename='tl-scorecard-meeting-attendee')
router.register(r'idle-flags', IdleFlagViewSet, basename='tl-scorecard-idle-flag')
router.register(r'idle-status-updates', IdleStatusUpdateViewSet, basename='tl-scorecard-idle-status-update')
router.register(r'review-deliveries', ReviewDeliveryViewSet, basename='tl-scorecard-review-delivery')
router.register(
    r'engagement-survey-responses', EngagementSurveyResponseViewSet, basename='tl-scorecard-engagement-survey',
)

urlpatterns = [
    path('', include(router.urls)),
]
