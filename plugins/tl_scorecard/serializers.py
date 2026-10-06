import re


from django.utils import timezone
from rest_framework import serializers

from core.mixins.permissions import is_staff_user

from .scope import scoreable_member_ids
from .models import (
    Absence,
    EngagementSurveyResponse,
    EPRCycle,
    EPRGoal,
    EPRStageRecord,
    HbprGovernanceEvidence,
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


_UNSET = object()


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


def _viewer(serializer):
    request = serializer.context.get('request')
    return getattr(request, 'user', None)


def _is_staff(user):
    return bool(user and (user.is_staff or user.is_superuser))


class _OwnerOnlyNotesMixin:
    """Blank a TL's private free text for anyone but the owner and staff.

    ``owner_field`` names the FK to the TL who wrote the record. The substance
    of a record (an absence's reason, dates, status) stays visible.
    """
    owner_field = None

    def to_representation(self, instance):
        data = super().to_representation(instance)
        viewer = _viewer(self)
        owner_id = getattr(instance, f'{self.owner_field}_id', None)
        if not (_is_staff(viewer) or (viewer and viewer.id == owner_id)):
            data['notes'] = ''
            if 'reference_url' in data:
                data['reference_url'] = ''
        return data


class MeetingAttendeeSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()

    class Meta:
        model = MeetingAttendee
        fields = ['id', 'meeting', 'user', 'user_name', 'role', 'notes']
        read_only_fields = ['id']

    def get_user_name(self, obj):
        return _display_name(obj.user)

    def validate(self, attrs):
        role = attrs.get('role', getattr(self.instance, 'role', 'member'))
        attendee = attrs.get('user', getattr(self.instance, 'user', None))
        if role == 'hrbp' and attendee is not None:
            from apps.users.services.hbpr_scope import is_hbpr
            from core.mixins.permissions import has_hr_role
            if not (is_hbpr(attendee) or has_hr_role(attendee) or _is_staff(attendee)):
                raise serializers.ValidationError(
                    {'user': 'An HRBP attendee must be an HBPR, HR or staff user.'})
        return attrs

    def to_representation(self, instance):
        data = super().to_representation(instance)
        viewer = _viewer(self)
        # An attendee's notes are theirs: the attendee and staff only.
        if not (_is_staff(viewer) or (viewer and viewer.id == instance.user_id)):
            data['notes'] = ''
        return data


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
            'shared_summary', 'shared_at',
            'recorded_by', 'recorded_by_name', 'recorded_at', 'attendees',
        ]
        read_only_fields = [
            'id', 'organizer', 'recorded_by', 'recorded_at', 'shared_summary', 'shared_at',
        ]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        viewer = _viewer(self)
        # Private notes: organizer, staff, or someone who attended.
        allowed = _is_staff(viewer) or (
            viewer is not None and (
                viewer.id == instance.organizer_id
                or any(a.user_id == viewer.id for a in instance.attendees.all())
            )
        )
        if not allowed:
            data['notes'] = ''
            data['reference_url'] = ''
        return data

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


class IdleFlagSerializer(_OwnerOnlyNotesMixin, serializers.ModelSerializer):
    owner_field = 'flagged_by'
    employee_name = serializers.SerializerMethodField()
    flagged_by_name = serializers.SerializerMethodField()
    status_updates = IdleStatusUpdateSerializer(many=True, read_only=True)

    class Meta:
        model = IdleFlag
        fields = [
            'id', 'employee', 'employee_name', 'flagged_by', 'flagged_by_name', 'flagged_on',
            'status', 'productivity_task', 'resolved_on', 'notes', 'reference_url', 'status_updates',
        ]
        # status/resolved_on move together through the `resolve` action only.
        read_only_fields = ['id', 'flagged_by', 'status', 'resolved_on']

    def get_employee_name(self, obj):
        return _display_name(obj.employee)

    def get_flagged_by_name(self, obj):
        return _display_name(obj.flagged_by)


class ReviewDeliverySerializer(_OwnerOnlyNotesMixin, serializers.ModelSerializer):
    """``notes``/``reference_url`` are the TL's private record — redacted for
    anyone but the owner and staff, like every other record family. The
    substance (recipient, period, delivered date) stays visible."""

    owner_field = 'leader'
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

    def validate_period(self, value):
        if not re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])', value):
            raise serializers.ValidationError('Use the YYYY-MM format.')
        return value

    def get_respondent_name(self, obj):
        return _display_name(obj.respondent)


class AbsenceSerializer(_OwnerOnlyNotesMixin, serializers.ModelSerializer):
    owner_field = 'flagged_by'
    employee_name = serializers.SerializerMethodField()
    flagged_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Absence
        fields = [
            'id', 'employee', 'employee_name', 'flagged_by', 'flagged_by_name', 'absence_date',
            'reason', 'addressed_on', 'notes', 'reference_url', 'recorded_at',
        ]
        # addressed_on is set by the `address` action only.
        read_only_fields = ['id', 'flagged_by', 'recorded_at', 'addressed_on']

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
            'shared_notes', 'closed_on', 'status_note',
        ]
        # `status` is server-controlled: created as draft, moved only by actions.
        read_only_fields = [
            'id', 'tl', 'status', 'approved_by', 'approved_at', 'closed_on', 'status_note',
        ]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        viewer = _viewer(self)
        # `notes` is the TL's private evidence; `shared_notes` is what reviewers read.
        if not (_is_staff(viewer) or (viewer and viewer.id == instance.tl_id)):
            data['notes'] = ''
            data['reference_url'] = ''
        return data

    def get_employee_name(self, obj):
        return _display_name(obj.employee)

    def get_tl_name(self, obj):
        return _display_name(obj.tl)

    def get_approved_by_name(self, obj):
        return _display_name(obj.approved_by)


class PromotionFlagSerializer(_OwnerOnlyNotesMixin, serializers.ModelSerializer):
    owner_field = 'nominated_by'
    employee_name = serializers.SerializerMethodField()
    nominated_by_name = serializers.SerializerMethodField()

    class Meta:
        model = PromotionFlag
        fields = [
            'id', 'employee', 'employee_name', 'nominated_by', 'nominated_by_name',
            'nominated_on', 'status', 'decided_on', 'decided_by', 'decision_note', 'notes',
        ]
        # Only the `decide` action may set these; a TL must not self-approve.
        read_only_fields = [
            'id', 'nominated_by', 'status', 'decided_on', 'decided_by', 'decision_note',
        ]

    def get_employee_name(self, obj):
        return _display_name(obj.employee)

    def get_nominated_by_name(self, obj):
        return _display_name(obj.nominated_by)


class EPRGoalSerializer(serializers.ModelSerializer):
    class Meta:
        model = EPRGoal
        fields = ['id', 'cycle', 'description']
        read_only_fields = ['id']


class EPRStageRecordSerializer(serializers.ModelSerializer):
    stage_display = serializers.CharField(source='get_stage_display', read_only=True)
    recorded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = EPRStageRecord
        fields = [
            'id', 'cycle', 'stage', 'stage_display', 'summary', 'reference_url',
            'shared_with_employee', 'recorded_by', 'recorded_by_name', 'created_at',
        ]
        read_only_fields = ['id', 'cycle', 'stage', 'recorded_by', 'created_at']

    def get_recorded_by_name(self, obj):
        return _display_name(obj.recorded_by)


class EPRCycleSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    goals = EPRGoalSerializer(many=True, read_only=True)
    goal_count = serializers.SerializerMethodField()
    stage_records = serializers.SerializerMethodField()

    class Meta:
        model = EPRCycle
        fields = [
            'id', 'user', 'user_name', 'year', 'goal_setting_completed_at',
            'mid_year_completed_at', 'final_review_completed_at', 'goals',
            'goal_count', 'stage_records',
        ]
        # `user` (the employee this cycle is about) is writable — it's the
        # target, not the request's caller, so it can't be read-only like
        # the caller-derived fields on other serializers. The three
        # `*_completed_at` fields are set by the `complete_stage` action
        # only — same mechanism as `Absence.addressed_on`.
        read_only_fields = [
            'id', 'goal_setting_completed_at', 'mid_year_completed_at',
            'final_review_completed_at',
        ]
        validators = []

    def get_user_name(self, obj):
        return _display_name(obj.user)

    def get_goal_count(self, obj):
        return obj.goals.count()

    def get_stage_records(self, obj):
        """Stage evidence: full rows for the owning TL and staff; existence
        metadata only for an HBPR (they verify evidence was recorded, never
        read employee review content — mirrors notes redaction)."""
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if user is not None and not is_staff_user(user):
            # get_team_member_ids() costs 3 queries — memoize per serializer
            # instance (one request), not per cycle row.
            member_ids = getattr(self, '_member_ids_cache', None)
            if member_ids is None:
                member_ids = self._member_ids_cache = scoreable_member_ids(user)
            if obj.user_id not in member_ids:
                return [
                    {
                        'id': r.id,
                        'stage': r.stage,
                        'has_reference': bool(r.reference_url),
                        'shared_with_employee': r.shared_with_employee,
                        'recorded_by_name': _display_name(r.recorded_by),
                        'created_at': r.created_at,
                    }
                    for r in obj.stage_records.all()
                ]
        return EPRStageRecordSerializer(
            obj.stage_records.all(), many=True, context=self.context
        ).data


class EscalationCandidateSerializer(serializers.Serializer):
    kind = serializers.CharField()
    subject_id = serializers.IntegerField()
    subject_name = serializers.CharField()
    detail = serializers.CharField()
    since = serializers.DateField()


class HbprGovernanceEvidenceSerializer(serializers.ModelSerializer):
    """Evidence of the HBPR↔AL-TL relationship. ``recorded_by``/``updated_by``
    are server-set (never taken from the payload); ``next_due_on`` and
    ``cadence_status`` are computed from the owning assignment's cadence."""

    kind_display = serializers.CharField(source='get_kind_display', read_only=True)
    recorded_by_name = serializers.SerializerMethodField()
    updated_by_name = serializers.SerializerMethodField()
    albanian_tl = serializers.IntegerField(
        source='assignment.albanian_tl_id', read_only=True
    )
    hbpr = serializers.IntegerField(source='assignment.hbpr_id', read_only=True)
    cadence = serializers.CharField(source='assignment.cadence', read_only=True)
    next_due_on = serializers.SerializerMethodField()
    cadence_status = serializers.SerializerMethodField()

    class Meta:
        model = HbprGovernanceEvidence
        fields = [
            'id', 'assignment', 'albanian_tl', 'hbpr', 'cadence',
            'kind', 'kind_display', 'occurred_on', 'reporting_year',
            'shared_summary', 'action_items', 'reference_url',
            'recorded_by', 'recorded_by_name', 'updated_by', 'updated_by_name',
            'next_due_on', 'cadence_status',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'recorded_by', 'updated_by', 'created_at', 'updated_at',
        ]

    def get_recorded_by_name(self, obj):
        return _display_name(obj.recorded_by)

    def get_updated_by_name(self, obj):
        return _display_name(obj.updated_by)

    def _last_cadence_on(self, obj):
        """Latest cadence meeting for the owning assignment.

        Prefers the `last_cadence_on` annotation the viewset adds (one query for
        a whole list); falls back to a query for a bare instance.
        """
        annotated = getattr(obj, 'last_cadence_on', _UNSET)
        if annotated is not _UNSET:
            return annotated
        return (
            HbprGovernanceEvidence.objects.filter(
                assignment_id=obj.assignment_id, kind='cadence_meeting'
            )
            .order_by('-occurred_on')
            .values_list('occurred_on', flat=True)
            .first()
        )

    def get_next_due_on(self, obj):
        assignment = obj.assignment
        if not assignment.is_current:
            return None
        # The raw cadence date, matching the admin assignment serializer and the
        # HBPR overview. Lateness is carried by `cadence_status`, not by
        # rewriting the date, so all three surfaces agree.
        return str(assignment.next_due_on(last_meeting_on=self._last_cadence_on(obj)))

    def get_cadence_status(self, obj):
        from apps.users.services.hbpr_assignments import cadence_status

        # One definition, shared with the admin serializer and the HBPR overview
        # (an inline copy here could never emit 'due' on the exact due date).
        return cadence_status(obj.assignment, last_meeting_on=self._last_cadence_on(obj))

    def validate(self, attrs):
        # Evidence cannot be re-homed. `assignment` is writable on create (the AL
        # TL picks their own partnership), but moving an existing row would hand
        # it to another TL's partnership — and to that TL's HBPR — while the
        # ownership check in `perform_update` only looks at the row's OLD owner.
        new_assignment = attrs.get('assignment')
        if (
            self.instance is not None
            and new_assignment is not None
            and new_assignment.id != self.instance.assignment_id
        ):
            raise serializers.ValidationError(
                {'assignment': 'Evidence cannot be moved to another assignment.'}
            )

        kind = attrs.get('kind', getattr(self.instance, 'kind', None))
        year = attrs.get('reporting_year', getattr(self.instance, 'reporting_year', None))
        if kind in HbprGovernanceEvidence.EPR_KINDS and year is None:
            raise serializers.ValidationError(
                {'reporting_year': 'Required for EPR participation evidence.'}
            )
        if kind == 'cadence_meeting' and year is not None:
            raise serializers.ValidationError(
                {'reporting_year': 'Only EPR evidence carries a reporting year.'}
            )

        # Evidence records something that happened; a future date would also make
        # `next_due_on` future and read as 'on_track' prematurely.
        occurred_on = attrs.get('occurred_on', getattr(self.instance, 'occurred_on', None))
        if occurred_on is not None and occurred_on > timezone.localdate():
            raise serializers.ValidationError(
                {'occurred_on': 'Evidence cannot be recorded for a future date.'}
            )
        return attrs
