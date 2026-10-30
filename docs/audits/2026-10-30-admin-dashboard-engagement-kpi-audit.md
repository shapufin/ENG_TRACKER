# Full Audit Report: Admin Dashboard Real Data, TL Engagement Metrics & IT TL KPI Scope

**Date**: 2026-10-30  
**Repository Branch**: `main`  
**HEAD Commit**: `2936f1e`  
**Audit Scope**:
1. Admin Dashboard live data pipelines, aggregation endpoints, and graph freshness.
2. TL Engagement metrics, SLA breach definitions, TTA calculations, and UI graph layout bugs.
3. Italian Team Leader (IT TL) vs Albanian Team Leader (AL TL) hierarchy and KPI upload team scoping.

---

## 1. Executive Summary

A systematic code-level and database audit was performed to address three specific production concerns:
1. **Admin Dashboard Graphs not updating or showing incorrect numbers**: Confirmed. The "This month" tab in the Hours widget (`HoursTrendWidget.tsx`) is miswired to `global_stats`, which aggregates **all-time lifetime approved hours** across the entire database without a date filter (showing 675h / 8,805h instead of the current month's 7h / 95h). Coupled with a 5-minute React Query cache and `refetchOnWindowFocus: false`, background changes do not reflect in real time.
2. **TL Engagement "Breaches" and "TTA" Confusion**:
   - **TTA** = *Time To Approve*: the average hours elapsed between employee submission (`submitted_at`) and TL decision (`approved_at`).
   - **Breaches**: Any request decided after its SLA deadline, **plus any request currently pending past its SLA deadline**. The "7 breaches" seen in production correspond directly to 7 requests that missed their SLA deadline (Leave: end of same working day; Overtime/Standby: 5 working days, Europe/Tirane).
   - **Graph Layout Bugs**: Found Y-axis label collisions in `TTATrendChart` due to zero margins and shrinking aspect-video containers in `ScoreCompositionTrendChart` and `RequestVolumeChart`.
   - **Proposed Solution**: An informative **"!" (Metrics Guide)** button on the page header opening an interactive modal explaining all four score components, TTA, and SLA rules.
3. **Excluding IT TL (Italian Team Leaders) from KPI Upload**:
   - IT TLs rank higher than AL TLs as reporting line managers.
   - In `ticket_kpi/viewsets.py`, `_get_tl_team_members` utilizes `user.profile.get_team_member_ids()`, which pulls all users across shared teams via M2M. Because IT TLs share workspaces or lead teams, they are mistakenly treated as measurable individual contributors in team KPI summaries and upload tables.
   - Precedent: `plugins/skills/services/team_query.py` (`matrix_user_ids`) already excludes IT TLs. The same filter is required in `ticket_kpi`.

---

## 2. Admin Dashboard: Real Data vs Graph Stagnation

### 2.1 The "This month" Graph Shows Lifetime Database Totals
In `frontend/src/pages/admin/components/dashboard-widgets/HoursTrendWidget.tsx`:
```tsx
<Tabs value={tab} onValueChange={setTab} className="h-full">
  <ChartCard sectionId="hours-trend" title="Hours" action={
    <TabsList>
      <TabsTrigger value="month">This month</TabsTrigger>
      <TabsTrigger value="trend">Trend</TabsTrigger>
    </TabsList>
  }>
    <TabsContent value="month">
      <HoursOverviewBody hoursData={hoursData} isLoading={statsLoading} />
    </TabsContent>
    <TabsContent value="trend">
      <OtStandbyTrendBody {...trend} />
    </TabsContent>
  </ChartCard>
</Tabs>
```

- In `HoursOverviewBody`, `hoursData` is fed by `computeAdminDashboardSummary(globalStats)`:
  ```ts
  hoursData: [
    { label: "Overtime", hours: Number(stats.total_overtime_hours) },
    { label: "Standby", hours: Number(stats.total_standby_hours) },
  ]
  ```
- In backend `apps/dashboard/viewsets.py` (`def global_stats`):
  ```python
  # Overtime stats
  overtime_stats = OvertimeLog.objects.aggregate(
      total_hours=Coalesce(Sum('hours', filter=Q(status='approved')), 0.0, output_field=models.FloatField()),
      pending_count=Count('id', filter=Q(status='pending')),
      approved_count=Count('id', filter=Q(status='approved')),
      rejected_count=Count('id', filter=Q(status='rejected')),
  )
  ```
  **Verification Evidence**:
  - Live query result for `global_stats`:
    `total_overtime_hours = 675.0h`, `total_standby_hours = 8805.0h`.
  - Live query result for current month `admin_trends`:
    `overtime = 7.0h`, `standby = 95.0h`.
  - When an admin views the "This month" bar chart, they see **675h Overtime** and **8,805h Standby**, which does not change noticeably when a few hours are logged, giving the impression that the graph is either hardcoded or broken.

### 2.2 Aggressive StaleTime & Window Focus Disabled
In `frontend/src/hooks/useAdminDashboardQueries.ts`:
```ts
export const useAdminTrends = (enabled: boolean, months = 12) =>
  useQuery({
    queryKey: ["admin", "trends", months],
    queryFn: () => dashboardService.getAdminTrends(months),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    enabled,
  });
```
- React Query holds cache for 5 minutes and deliberately ignores tab focus. If changes occur in production or another tab, graphs stay static unless the admin clicks the manual Refresh button.

---

## 3. TL Engagement: TTA, Breaches & UI Improvements

### 3.1 What is TTA (Time To Approve)?
- Code location: `plugins/engagement/services.py` (`avg_tta_hours`, `p50_tta_hours`, `p90_tta_hours`).
- **Definition**: The total hours elapsed between when an employee submits a leave, overtime, or standby request and when the team leader approves or rejects it.
- Displayed in `TTATrendChart` as a secondary dashed axis and in `SummaryCards` under Approval Rate.

### 3.2 What are Breaches (Why 7 Breaches)?
- Code location: `plugins/engagement/services.py` line 408:
  ```python
  breaches = judgeable - on_time
  ```
  Where `judgeable` = decided requests + `pending_past_deadline`.
- A request becomes a **breach** if:
  1. It was decided after the SLA deadline; **OR**
  2. It is currently sitting pending and the SLA deadline has already elapsed.
- **SLA Deadlines (`plugins/engagement/sla.py`, canonical timezone `Europe/Tirane`)**:
  - **Leave**: End of the same working day submitted (if submitted on weekend or holiday: end of next working day).
  - **Overtime & Standby**: End of the 5th working day after submission date.
  - Working day: Monday through Friday, excluding public holidays.
- **Conclusion**: Seeing "7 breaches" means exactly 7 requests in that monthly evaluation period were either decided past their deadline or remained pending past their deadline.

### 3.3 Score Weights & Formula
The Engagement Score (0–100) is composed of four weighted metrics:
1. **Speed / Within Deadline (40%)**: `(on_time / judgeable) * 100`.
2. **Approval Rate (20%)**: `(approved / decided) * 100`.
3. **Responsiveness (20%)**: How early in the SLA deadline window decisions are made (100% credit if median decision lands in first 25% of window, scaling linearly down to 0 at deadline).
4. **Consistency (20%)**: Standard deviation vs mean of decision window fractions (low variance = higher score).

### 3.4 Engagement Page Graph Bugs
1. **`TTATrendChart.tsx`**:
   - `margin={{ top: 8, right: 8, left: 0, bottom: 0 }}`
   - `label={{ value: "Score", angle: -90, position: "insideLeft", fontSize: 11 }}`
   - With `left: 0`, the vertical "Score" label overlaps with tick values (`0, 20, 40...`).
   - Fix: Increase left margin to `16px` and right margin to `24px`.
2. **`ScoreCompositionTrendChart.tsx` & `RequestVolumeChart.tsx`**:
   - Both use `<ChartContainer config={config} className="max-h-[320px] w-full">`.
   - `ChartContainer` includes `aspect-video` by default, which collapses vertically inside responsive two-column grid cards on laptop/tablet displays.
   - Fix: Apply explicit container height `h-[280px]` or `h-[300px]`.
3. **Missing Metrics Explanation**:
   - Currently, there is no explanation of TTA or Breaches in the UI.
   - Fix: Add an `<Info />` / `!` button next to "Export Report" that opens an interactive reference guide.

---

## 4. Removing IT TL (Italian Team Leaders) from KPI Upload

### 4.1 Hierarchy Context: IT TL vs AL TL
- In the organisational structure:
  - **Italian Team Leaders (IT TLs)** are senior line managers who supervise Albanian Team Leaders or large cross-border teams.
  - **Albanian Team Leaders (AL TLs)** manage operational delivery on the ground and are governed by HBPR.
  - IT TLs rank above AL TLs and do not belong in individual contributor ticket metrics.
- In `plugins/skills/services/team_query.py`, the system already excludes IT TLs:
  ```python
  def matrix_user_ids(user):
      """visible_user_ids minus Italian TLs, for the team matrix pages.
      An Italian TL is the reporting line above the people the matrix measures,
      so they are left out of rows, coverage, gaps and exports.
      """
      italian_tls = User.objects.filter(
          Q(profile__is_italian_tl_role=True)
          | Q(user_roles__role__code='italian_tl', user_roles__is_active=True)
          | Q(italian_team_members__isnull=False)
      ).values('id')
      return set(visible_user_ids(user)) - {row['id'] for row in italian_tls}
  ```

### 4.2 Why IT TLs Appear in Ticket KPI
In `plugins/ticket_kpi/viewsets.py`:
```python
def _get_tl_team_members(user):
    if not hasattr(user, 'profile') or not user.profile.is_team_leader:
        return User.objects.none()
    ids = user.profile.get_team_member_ids() | {user.id}
    return User.objects.filter(id__in=ids).select_related('profile').order_by('username')
```
- `get_team_member_ids()` inspects shared team M2M (`teams__id__in=team_ids`).
- Because IT TLs belong to the same team workspace or lead the parent team, they are returned in `get_team_member_ids()`.
- They appear as team members in `TicketKPITeamPage` tables, team summaries, batch review queues, and upload targets.

### 4.3 Required Implementation
Update `_get_tl_team_members(user)` in `plugins/ticket_kpi/viewsets.py` to filter out Italian TLs:
```python
def _get_tl_team_members(user):
    if not hasattr(user, 'profile') or not user.profile.is_team_leader:
        return User.objects.none()
    ids = user.profile.get_team_member_ids() | {user.id}
    it_tl_ids = User.objects.filter(
        Q(profile__is_italian_tl_role=True)
        | Q(user_roles__role__code='italian_tl', user_roles__is_active=True)
        | Q(italian_team_members__isnull=False)
    ).values_list('id', flat=True)
    return User.objects.filter(id__in=ids).exclude(id__in=it_tl_ids).select_related('profile').order_by('username')
```

---

## 5. Implementation Roadmap & Fix Batches

| Batch | Surface | Key Actions | Target Files |
|---|---|---|---|
| **Batch A** | Admin Dashboard | Fix Hours "This month" bar chart to use current-month slice from `admin_trends` rather than all-time `global_stats`. Adjust query cache/focus rules. | `HoursTrendWidget.tsx`, `useAdminDashboardQueries.ts` |
| **Batch B** | TL Engagement | Add interactive "!" Guide Dialog explaining TTA, Breaches, and SLAs. Fix Y-axis label overlap and chart container heights. | `EngagementMetricsPage.tsx`, `TTATrendChart.tsx`, `ScoreCompositionTrendChart.tsx`, `RequestVolumeChart.tsx` |
| **Batch C** | Ticket KPI Scope | Exclude Italian TLs from `_get_tl_team_members` in Ticket KPI plugin. | `plugins/ticket_kpi/viewsets.py` |

---

## Verification 2026-10-30 (code + live browser on the e2e DB)

Plan: `docs/superpowers/plans/2026-10-30-admin-engagement-kpi-fixes.md`.

- Hours "This month" shows lifetime: **confirmed**. Same page: Hours chart 35.0h OT / 39.0h SB vs Overtime by Client + Team Comparison (both this month) 28h OT. **New:** the KPI strip "Overtime / This month" card has the same defect (`overtimeSummary.total_hours`).
- Stale cache: true but minor; the visible mismatch is the lifetime bug.
- Metrics guide: confirmed missing. This build has no "Breaches" KPI card (banner + table column only), so the audit's "Breaches: 7" card is not literal.
- `TTATrendChart` axis-label collision: **not reproduced** at 1440px.
- `aspect-video` collapse: **partly true** (297x167 at 1024px, 505x284 at 1440px) on `ChartContainer` charts, not on `TTATrendChart`.
- IT TL in Ticket KPI scope: **confirmed**. The proposed copy of the Skills `Q(...)` block is rejected: lift it to a core helper instead (cross-plugin import rule).
- Production figures (675h, 7 breaches) could not be checked without prod access.
