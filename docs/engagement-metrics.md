# TL Engagement Metrics (tracked source of truth)

Plugin: `plugins/engagement`. Pages: `/engagement/metrics`, `/engagement/visualize`.
Keep this file in sync with `.devin/context/PLUGINS/09-engagement.md` and the
`CLAUDE.md` engagement entry when the rules change.

## What it measures

How quickly and reliably a team leader (TL) decides the leave, overtime and
standby requests of the people they manage. It does not measure how much work
staff submit.

## Scope

- A TL sees every team that contains at least one active user they manage. A
  managed user is one linked through the `italian_tl`/`albanian_tl` field,
  a member of a team the TL belongs to, or a member of a team the TL leads.
- A person in several teams counts in each team (overtime is billed per team).
- Managed users with no team are excluded. Deactivated users are excluded.
  The TL's own requests are excluded (someone else decides them).
- Staff/admin see every TL. Each TL sees only their own rows. HBPR has no access.

## Deadlines (Albania local time, end of day)

Local time is the IANA zone `Europe/Tirane` (the current canonical name for
Albania; `Europe/Tirana` is no longer in tzdata).

Working day = Monday to Friday, not a public holiday.

| Request | Deadline |
|---|---|
| Leave | End of the same working day it was submitted. Submitted on a weekend or holiday: end of the next working day. |
| Overtime, standby | End of the 5th working day after the submission date. |

Public holidays are the global holidays plus holidays of calendars the TL has
active (`UserCalendarPreference.is_active`). Deadlines do not pause during the
TL's own vacation.

## Judgement per request

- Decided (approved or rejected) on or before the deadline: on time.
- Decided after the deadline: breach.
- Still pending after the deadline: breach, immediately, without anyone
  touching the record.
- Pending before the deadline: not judged yet.
- Soft-deleted requests are ignored.

Each snapshot stores `judgeable`, `on_time`, `breaches`, `pending_past_deadline`
per request type. It also stores `next_deadline_at`: the earliest deadline among
pending requests not yet due. When that time passes, the snapshot is stale and
is recomputed on the next read.

## Score (0-100)

| Component | Weight | Definition |
|---|---|---|
| Within deadline (`score_speed`) | 40% | on time / judgeable across leave, overtime and standby |
| Approval rate (`score_approval_rate`) | 20% | approved / decided |
| Responsiveness (`score_responsiveness`) | 20% | Median share of the deadline window used to decide. Full credit within the first 25% of the window, falling linearly to 0 at the deadline. Weighted by decided count per type. |
| Consistency (`score_consistency`) | 20% | 1 - (stdev / mean) of the window fractions, so leave and overtime are comparable |

Components without data are dropped and the rest renormalised.

## Evidence (shown, not scored)

- Decisions made while the TL was on their own approved leave.
- Decisions made on public holidays.

## Freshness

There is no scheduler. A snapshot is recomputed on read when any of these hold:
it was never computed, its metrics lack the SLA fields (any snapshot written
before 2026-10-08, so the migration heals itself), a pending deadline has passed,
team membership changed, or a domain row changed after `computed_at`. The response reports
`refreshed_on_read`. A TL's first read of a new month creates that month's
snapshots for every team pair; this is not counted as a refresh.

Backfill after a rule change: `python manage.py recompute_tl_metrics --all-months`.

## Verification

    py -3.14 manage.py test plugins.engagement
    py -3.14 manage.py makemigrations --check
    py -3.14 -m ruff check plugins/engagement
    cd frontend; npx vitest run src/plugins/engagement
    cd frontend; npx tsc -b --noEmit

## Scope and query cost (2026-10-08, review pass 3)

- One scope definition: `services._managed_map`. It resolves scope for many
  leaders in a fixed number of queries, ignores soft-deleted memberships, and
  excludes the leader and deactivated users. `team_member_ids`, `leader_team_pairs`
  and staleness all use it. Do not add a second definition (the old
  `UserProfile.get_team_member_ids()` path was dropped for this reason).
- Freshness is batched: `services.stale_snapshot_ids` checks a whole page of rows
  with one query per request type. Staff team-breakdown queries are constant:
  53 queries with 3 TLs and 197 with 12 before the fix; equal after it. Guarded by
  `StaffReadScalingTests`.
- Deactivated TLs are hidden from every read surface (`_base_queryset` filters
  `leader__is_active`). Their snapshots stop being refreshed, so showing them
  would present numbers that silently age.

## Performance (2026-10-08, pass 4)

Measured on the SQLite test database with 10 TLs, 40 staff and 1,440 requests
for the current month. Production runs on other hardware and a larger dataset,
so re-measure there before relying on the timings. Query counts are exact.

| Path | Before | After |
|---|---|---|
| Warm staff team-breakdown | 22 queries | 21 |
| Warm staff summary / trend | 22 | 21 |
| Warm TL summary / trend | 25 | 25 |
| Warm TL export, month scope | 35 | 25 |
| Cold: create every missing snapshot (10 pairs) | 242 | 241 |
| Cold: one TL pair | 21 | 21 |

Other changes:
- Candidate leaders are one SQL query on `User` (team leaders, FK targets, legacy
  flags, active TL role assignments). It no longer loads every profile per staff
  read, so the cost does not grow with the headcount in Python.
- Freshness scans only requests submitted in the snapshots' months
  (`submitted_at` is indexed), not each member's full history.
- Month export fetches and refreshes the trend window once, not twice.

Pass 5 (2026-10-08, plan `.devin/plans/plan-engagement-read-path-2026-10-08.md`):
- One scope per request: `services.ReadScope` is created once per request by the
  viewset and passed to every scope and freshness function. Warm TL summary 25 → 20,
  warm staff team-breakdown 21 → 16.
- Dashboard endpoint: `GET /api/plugins/engagement/metrics/dashboard/?month=`
  returns `{summary, trend, team_breakdown}`, each identical to its own endpoint.
  Measured 75 queries for the three requests versus 24 in one. The frontend does
  NOT use it: the user reverted the hook to three requests on 2026-10-08, so the
  page still makes three requests and pays the 75-query cost. The endpoint is
  kept for a future switch.
- Snapshot creation pre-warms team membership for all pairs, so its membership
  reads no longer grow with the team count.

Remaining cost, accepted:
- Every read computes scope twice (once to create missing snapshots, once for the
  freshness check). About 6 of the 21–25 queries. A per-request memo would remove
  it; not done because it couples the two functions.
- Each read still makes about 16–20 queries, which is the scope, the freshness check
  and the data. Scope is computed once per request now.
- Timings are noisy on SQLite (roughly 20–50 ms per read). Query counts are the
  stable signal.

## Known limits (accepted, not fixed)

- Team totals sum across teams, so a person in two teams is counted twice in
  Team Size. This follows the per-team billing rule.
- A TL's old snapshot for a team they no longer manage is kept until the next
  recompute, with stale numbers.
- `candidate_leader_ids` scans every `UserProfile` once per staff read to find
  leaders (FK targets, TL roles, `role_codes`). A single query, but linear in the
  user count. If that grows, move the role-code check into SQL.
- A rejected request with a null `approved_at` is excluded from scoring, since
  it is neither decided nor pending. All reject paths set `approved_at`
  (`core/mixins/permissions.py` `perform_reject`); legacy rows created outside the
  API could still have it null.
