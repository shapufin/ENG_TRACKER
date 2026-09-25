from rest_framework import serializers

from .models import (
    Absence,
    EngagementSurveyResponse,
    EPRCycle,
    EPRGoal,
    IdleFlag,
    IdleStatusUpdate,
    Meeting,
    MeetingAttendee,
    PIPRecord,
    PromotionFlag,
    ReviewDelivery,
)


def _display_name(user):
    if user is None:
        return None
    return user.get_full_name() or user.username


class LeaveSlaSerializer(serializers.Serializer):
    decided_count = serializers.IntegerField()
    pct_within_2_days = serializers.FloatField(allow_null=True)
    pending_at_month_end = serializers.IntegerField()


class OvertimeTurnaroundSerializer(serializers.Serializer):
    decided_count = serializers.IntegerField()
    avg_turnaround_days = serializers.FloatField(allow_null=True)


class MeetingComplianceSerializer(serializers.Serializer):
    one_on_one_compliance_pct = serializers.FloatField(allow_null=True)
    tl_sync_count = serializers.IntegerField()
    team_meetings_held = serializers.IntegerField()
    team_meetings_with_hrbp = serializers.IntegerField()
    team_meeting_notes_within_24h = serializers.IntegerField()


class IdleMetricsSerializer(serializers.Serializer):
    open_count = serializers.IntegerField()
    resolved_count = serializers.IntegerField()


class SeniorityRatioSerializer(serializers.Serializer):
    junior = serializers.IntegerField()
    mid = serializers.IntegerField()
    senior = serializers.IntegerField()
    unset = serializers.IntegerField()


class AbsenceMetricsSerializer(serializers.Serializer):
    open_count = serializers.IntegerField()
    breached_5_day_sla = serializers.IntegerField()


class PipMetricsSerializer(serializers.Serializer):
    active_count = serializers.IntegerField()
    pending_approval_count = serializers.IntegerField()


class PromotionRatioSerializer(serializers.Serializer):
    promoted_count = serializers.IntegerField()
    team_size = serializers.IntegerField()
    promoted_pct = serializers.FloatField(allow_null=True)
    target_pct = serializers.FloatField()


class ScorecardSerializer(serializers.Serializer):
    month = serializers.CharField()
    team_size = serializers.IntegerField()
    leave = LeaveSlaSerializer()
    overtime = OvertimeTurnaroundSerializer()
    meetings = MeetingComplianceSerializer()
    idle = IdleMetricsSerializer()
    review_deliveries_ytd = serializers.IntegerField()
    seniority = SeniorityRatioSerializer()
    absences = AbsenceMetricsSerializer()
    pip = PipMetricsSerializer()
    promotion = PromotionRatioSerializer()
    escalation_count = serializers.IntegerField()


class KpiCoverageEntrySerializer(serializers.Serializer):
    kpi = serializers.CharField()
    sheet = serializers.IntegerField()
    status = serializers.CharField()
    phase = serializers.IntegerField(allow_null=True)
    note = serializers.CharField()


class MeetingAttendeeSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()

    class Meta:
        model = MeetingAttendee
        fields = ['id', 'meeting', 'user', 'user_name', 'role']
        read_only_fields = ['id']

    def get_user_name(self, obj):
        return _display_name(obj.user)


class MeetingSerializer(serializers.ModelSerializer):
    organizer_name = serializers.SerializerMethodField()
    counterparty_name = serializers.SerializerMethodField()
    recorded_by_name = serializers.SerializerMethodField()
    attendees = MeetingAttendeeSerializer(many=True, read_only=True)

    class Meta:
        model = Meeting
        fields = [
            'id', 'meeting_type', 'organizer', 'organizer_name', 'counterparty', 'counterparty_name',
            'team', 'occurred_on', 'notes', 'notes_published_at', 'reference_url',
            'recorded_by', 'recorded_by_name', 'recorded_at', 'attendees',
        ]
        read_only_fields = ['id', 'organizer', 'recorded_by', 'recorded_at']

    def get_organizer_name(self, obj):
        return _display_name(obj.organizer)

    def get_counterparty_name(self, obj):
        return _display_name(obj.counterparty)

    def get_recorded_by_name(self, obj):
        return _display_name(obj.recorded_by)


class IdleStatusUpdateSerializer(serializers.ModelSerializer):
    recorded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = IdleStatusUpdate
        fields = [
            'id', 'flag', 'week_of', 'status_note', 'productivity_task_snapshot',
            'recorded_by', 'recorded_by_name', 'recorded_at',
        ]
        read_only_fields = ['id', 'recorded_by', 'recorded_at']
        validators = []

    def get_recorded_by_name(self, obj):
        return _display_name(obj.recorded_by)


class IdleFlagSerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    flagged_by_name = serializers.SerializerMethodField()
    status_updates = IdleStatusUpdateSerializer(many=True, read_only=True)

    class Meta:
        model = IdleFlag
        fields = [
            'id', 'employee', 'employee_name', 'flagged_by', 'flagged_by_name', 'flagged_on',
            'status', 'productivity_task', 'resolved_on', 'notes', 'reference_url', 'status_updates',
        ]
        read_only_fields = ['id', 'flagged_by']

    def get_employee_name(self, obj):
        return _display_name(obj.employee)

    def get_flagged_by_name(self, obj):
        return _display_name(obj.flagged_by)


class ReviewDeliverySerializer(serializers.ModelSerializer):
    leader_name = serializers.SerializerMethodField()

    class Meta:
        model = ReviewDelivery
        fields = [
            'id', 'leader', 'leader_name', 'period', 'recipient', 'delivered_on',
            'notes', 'reference_url', 'recorded_by', 'recorded_at',
        ]
        read_only_fields = ['id', 'leader', 'recorded_by', 'recorded_at']

    def get_leader_name(self, obj):
        return _display_name(obj.leader)


class EngagementSurveyResponseSerializer(serializers.ModelSerializer):
    respondent_name = serializers.SerializerMethodField()

    class Meta:
        model = EngagementSurveyResponse
        fields = ['id', 'respondent', 'respondent_name', 'team', 'period', 'score', 'submitted_at']
        read_only_fields = ['id', 'respondent', 'submitted_at']
        validators = []

    def get_respondent_name(self, obj):
        return _display_name(obj.respondent)


class AbsenceSerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    flagged_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Absence
        fields = [
            'id', 'employee', 'employee_name', 'flagged_by', 'flagged_by_name', 'absence_date',
            'reason', 'addressed_on', 'notes', 'reference_url', 'recorded_at',
        ]
        read_only_fields = ['id', 'flagged_by', 'recorded_at']

    def get_employee_name(self, obj):
        return _display_name(obj.employee)

    def get_flagged_by_name(self, obj):
        return _display_name(obj.flagged_by)


class PIPRecordSerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    tl_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()

    class Meta:
        model = PIPRecord
        fields = [
            'id', 'employee', 'employee_name', 'tl', 'tl_name', 'status', 'start_date',
            'approved_by', 'approved_by_name', 'approved_at', 'notes', 'reference_url',
        ]
        read_only_fields = ['id', 'tl', 'approved_by', 'approved_at']

    def get_employee_name(self, obj):
        return _display_name(obj.employee)

    def get_tl_name(self, obj):
        return _display_name(obj.tl)

    def get_approved_by_name(self, obj):
        return _display_name(obj.approved_by)


class PromotionFlagSerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    nominated_by_name = serializers.SerializerMethodField()

    class Meta:
        model = PromotionFlag
        fields = [
            'id', 'employee', 'employee_name', 'nominated_by', 'nominated_by_name',
            'nominated_on', 'status', 'decided_on', 'notes',
        ]
        read_only_fields = ['id', 'nominated_by']

    def get_employee_name(self, obj):
        return _display_name(obj.employee)

    def get_nominated_by_name(self, obj):
        return _display_name(obj.nominated_by)


class EPRGoalSerializer(serializers.ModelSerializer):
    class Meta:
        model = EPRGoal
        fields = ['id', 'cycle', 'description']
        read_only_fields = ['id']


class EPRCycleSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    goals = EPRGoalSerializer(many=True, read_only=True)
    goal_count = serializers.SerializerMethodField()

    class Meta:
        model = EPRCycle
        fields = [
            'id', 'user', 'user_name', 'year', 'goal_setting_completed_at',
            'mid_year_completed_at', 'final_review_completed_at', 'goals', 'goal_count',
        ]
        # `user` (the employee this cycle is about) is writable — it's the
        # target, not the request's caller, so it can't be read-only like
        # the caller-derived fields on other serializers.
        read_only_fields = ['id']
        validators = []

    def get_user_name(self, obj):
        return _display_name(obj.user)

    def get_goal_count(self, obj):
        return obj.goals.count()


class EscalationCandidateSerializer(serializers.Serializer):
    kind = serializers.CharField()
    subject_id = serializers.IntegerField()
    subject_name = serializers.CharField()
    detail = serializers.CharField()
    since = serializers.DateField()
