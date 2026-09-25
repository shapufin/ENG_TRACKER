from rest_framework import serializers


class LeaveSlaSerializer(serializers.Serializer):
    decided_count = serializers.IntegerField()
    pct_within_2_days = serializers.FloatField(allow_null=True)
    pending_at_month_end = serializers.IntegerField()


class OvertimeTurnaroundSerializer(serializers.Serializer):
    decided_count = serializers.IntegerField()
    avg_turnaround_days = serializers.FloatField(allow_null=True)


class ScorecardSerializer(serializers.Serializer):
    month = serializers.CharField()
    team_size = serializers.IntegerField()
    leave = LeaveSlaSerializer()
    overtime = OvertimeTurnaroundSerializer()


class KpiCoverageEntrySerializer(serializers.Serializer):
    kpi = serializers.CharField()
    sheet = serializers.IntegerField()
    status = serializers.CharField()
    phase = serializers.IntegerField(allow_null=True)
    note = serializers.CharField()
