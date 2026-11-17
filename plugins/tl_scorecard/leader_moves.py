"""A leader-link change ends the old Line Manager's recurring 1-on-1 plan (audit R2).

Only the plan (configuration) goes. Skips are leader-authored history and stay with their
author (docs/workflow-invariants.md item 69). Without this, a plan would stay hidden and
come back, with a stale start date, if the employee later returned to that leader.
"""
from apps.users.services.user_creation import leader_link_changed

from .models import OneOnOnePlan

DISPATCH_UID = 'tl_scorecard.leader_moves.end_one_on_one_plan'


def end_plan_on_leader_move(sender, employee_id, field, old_id, new_id, **kwargs):
    if field != 'albanian_tl' or not old_id:
        return
    OneOnOnePlan.objects.filter(leader_id=old_id, employee_id=employee_id).delete()


def connect():
    leader_link_changed.connect(end_plan_on_leader_move, dispatch_uid=DISPATCH_UID, weak=False)


def disconnect():
    leader_link_changed.disconnect(dispatch_uid=DISPATCH_UID)
