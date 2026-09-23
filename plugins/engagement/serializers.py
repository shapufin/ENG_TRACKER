from rest_framework import serializers

from .models import TLApprovalMetric
from .services import is_stale


class TLApprovalMetricSerializer(serializers.ModelSerializer):
    leader_name = serializers.CharField(source='leader.get_full_name', read_only=True)
    team_name = serializers.CharField(source='team.name', read_only=True)
    is_stale = serializers.SerializerMethodField()

    class Meta:
        model = TLApprovalMetric
        fields = [
            'id', 'leader', 'leader_name', 'team', 'team_name', 'month',
            'metrics', 'team_size', 'active_submitters', 'approval_rate_pct',
            'resubmission_count', 'engagement_score', 'decisions_during_leave',
            'score_speed', 'score_approval_rate', 'score_activity', 'score_consistency',
            'computed_at', 'is_stale',
        ]

    def get_is_stale(self, obj):
        return is_stale(obj)
