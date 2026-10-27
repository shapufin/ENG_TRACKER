from rest_framework import serializers

from .models import TLApprovalMetric


class TLApprovalMetricSerializer(serializers.ModelSerializer):
    leader_name = serializers.CharField(source='leader.get_full_name', read_only=True)
    # Live name while the team exists, the stored label once it has been purged.
    team_name = serializers.SerializerMethodField()
    team_code = serializers.SerializerMethodField()

    def get_team_name(self, obj):
        return obj.team.name if obj.team_id else obj.team_name

    def get_team_code(self, obj):
        return obj.team.code if obj.team_id else obj.team_code

    class Meta:
        model = TLApprovalMetric
        fields = [
            'id', 'leader', 'leader_name', 'team', 'team_name', 'team_code', 'month',
            'metrics', 'team_size', 'active_submitters', 'approval_rate_pct',
            'resubmission_count', 'engagement_score', 'decisions_during_leave',
            'decisions_on_holidays', 'score_speed', 'score_approval_rate',
            'score_responsiveness', 'score_consistency', 'next_deadline_at', 'computed_at',
        ]
