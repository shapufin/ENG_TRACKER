from rest_framework import serializers

from .models import TLApprovalMetric


class TLApprovalMetricSerializer(serializers.ModelSerializer):
    leader_name = serializers.CharField(source='leader.get_full_name', read_only=True)
    team_name = serializers.CharField(source='team.name', read_only=True)

    class Meta:
        model = TLApprovalMetric
        fields = [
            'id', 'leader', 'leader_name', 'team', 'team_name', 'month',
            'metrics', 'team_size', 'active_submitters', 'approval_rate_pct',
            'resubmission_count', 'engagement_score', 'decisions_during_leave',
            'decisions_on_holidays', 'score_speed', 'score_approval_rate',
            'score_responsiveness', 'score_consistency', 'next_deadline_at', 'computed_at',
        ]
