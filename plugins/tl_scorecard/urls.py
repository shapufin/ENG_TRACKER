from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .viewsets import (
    AbsenceViewSet,
    EngagementSurveyResponseViewSet,
    EPRCycleViewSet,
    EPRGoalViewSet,
    HbprGovernanceEvidenceViewSet,
    IdleFlagViewSet,
    IdleStatusUpdateViewSet,
    MeetingAttendeeViewSet,
    MeetingViewSet,
    PIPRecordViewSet,
    PromotionFlagViewSet,
    ReviewDeliveryViewSet,
    TLScorecardViewSet,
)
from .viewsets_hbpr import HbprViewSet
from .viewsets_my_records import MyRecordsViewSet

router = DefaultRouter()
router.register(r'hbpr', HbprViewSet, basename='tl-scorecard-hbpr')
router.register(r'my-records', MyRecordsViewSet, basename='tl-scorecard-my-records')
router.register(r'', TLScorecardViewSet, basename='tl-scorecard')
router.register(r'meetings', MeetingViewSet, basename='tl-scorecard-meeting')
router.register(r'meeting-attendees', MeetingAttendeeViewSet, basename='tl-scorecard-meeting-attendee')
router.register(r'idle-flags', IdleFlagViewSet, basename='tl-scorecard-idle-flag')
router.register(r'idle-status-updates', IdleStatusUpdateViewSet, basename='tl-scorecard-idle-status-update')
router.register(r'review-deliveries', ReviewDeliveryViewSet, basename='tl-scorecard-review-delivery')
router.register(
    r'engagement-survey-responses', EngagementSurveyResponseViewSet, basename='tl-scorecard-engagement-survey',
)
router.register(r'absences', AbsenceViewSet, basename='tl-scorecard-absence')
router.register(r'pip-records', PIPRecordViewSet, basename='tl-scorecard-pip-record')
router.register(r'promotion-flags', PromotionFlagViewSet, basename='tl-scorecard-promotion-flag')
router.register(r'epr-cycles', EPRCycleViewSet, basename='tl-scorecard-epr-cycle')
router.register(r'epr-goals', EPRGoalViewSet, basename='tl-scorecard-epr-goal')
router.register(
    r'hbpr-evidence', HbprGovernanceEvidenceViewSet,
    basename='tl-scorecard-hbpr-evidence',
)

urlpatterns = [
    path('', include(router.urls)),
]
