# Handover: TL Scorecard Month Filtering & Historical Reporting

**Target Surface**: `frontend/src/plugins/tl_scorecard/` (TL Scorecard Overview, Header, and Export)  
**Status**: Ready for Implementation  
**Created**: 2026-11-19  

---

## 1. Executive Summary & Objective

Currently, the TL Scorecard dashboard (`/tl-scorecard`) locks its view to the current ongoing month (`business_today()`, e.g., November 2026). Line Managers and Staff have no way in the UI to select or view past historical months (e.g., September 2026 where Q3 reviews and 100% compliance are recorded), nor can they export reports for past months from the dashboard.

**The Goal**:
1. Add a **Month Selector** at the top of the TL Scorecard page that allows users to pick any month within the selected reporting year (e.g., January through current month of 2026).
2. Deep-link the selected month via URL search params (`?year=2026&month=2026-09-01`).
3. Ensure the scorecard cards, team size, frozen badge, and the **Export Summary** button immediately update to reflect the selected month.

---

## 2. Technical Invariants & Backend Readiness

> [!NOTE]
> The Django backend is **already 100% ready** and requires **zero backend changes**:
> * `GET /api/plugins/tl_scorecard/scorecard/?month=YYYY-MM-DD` already parses `?month=`, fetches frozen `ScorecardMonthSnapshot` for past months, and returns the full month payload.
> * `GET /api/plugins/tl_scorecard/scorecard/export/?month=YYYY-MM-DD&file_format=xlsx|pdf` already generates the XLSX/PDF for any requested month.
> * `tlScorecardService.getScorecard(month?: string, leaderId?: number)` already accepts a `month` argument.

**Frontend Invariants to Preserve**:
* **House Design Doctrine**: Semantic design tokens only (e.g., `bg-muted`, `border-line-subtle`, `text-foreground`). No raw hex colors, no emoji.
* **Accessible Controls**: Every select/button must have an accessible name (`aria-label` or visible `<label>`).
* **Timezone Safety**: The current month comes from `currentBusinessMonthKey()` (`Europe/Tirane`), not UTC `date.today()`.
* **URL Sync**: Query parameters must be updated using `setParams(..., { replace: true })` without reloading the page.

---

## 3. Step-by-Step Implementation Plan

### Step 1: Create `ReportingMonthSelect.tsx`
Create a new dropdown selector for months inside `frontend/src/plugins/tl_scorecard/components/scorecard/ReportingMonthSelect.tsx`:
* **Props**:
  ```ts
  interface ReportingMonthSelectProps {
    year: number;
    month: string; // ISO format: 'YYYY-MM-01'
    onMonthChange: (nextMonth: string) => void;
  }
  ```
* **Behavior**:
  * Displays the 12 calendar months (`January` to `December`).
  * If `year === currentBusinessYear()`, months strictly greater than `currentBusinessMonth()` are disabled with `disabled={isFutureMonth}`.
  * Formats value as `YYYY-MM-01`.
  * Styled consistently with `ReportingYearSelect.tsx` using `Select`, `SelectTrigger`, `SelectContent`, `SelectItem`.

### Step 2: Integrate into `TLScorecardHeader.tsx`
Update `frontend/src/plugins/tl_scorecard/components/scorecard/TLScorecardHeader.tsx`:
* Pass `month`, `year`, `onMonthChange`, and `onYearChange` to the header.
* Place the month and year selectors side-by-side in the header toolbar (next to `<ExportButton month={month} />` and action buttons).
* Remove the standalone `<ReportingYearSelect />` that was sitting halfway down `TLScorecardPage.tsx` above `TeamGovernanceSection`.

### Step 3: Wire State & URL Params in `TLScorecardPage.tsx`
In `frontend/src/plugins/tl_scorecard/pages/TLScorecardPage.tsx`:
1. **Parse `month` from URL**:
   ```ts
   const monthParam = params.get("month");
   const activeMonth = isValidMonthString(monthParam) && monthParam.startsWith(String(year))
     ? monthParam
     : defaultMonthForYear(year); // e.g. current month if current year, or December if past year
   ```
2. **Update Handlers**:
   ```ts
   const setMonth = (nextMonth: string) => {
     setParams((prev) => {
       const next = new URLSearchParams(prev);
       next.set("month", nextMonth);
       next.set("year", nextMonth.slice(0, 4));
       return next;
     }, { replace: true });
   };
   ```
3. **Include Month in React Query Key & Query Function**:
   ```ts
   const scorecardQuery = useQuery({
     queryKey: ["tl-scorecard", "scorecard", "self", activeMonth],
     queryFn: async () => (await tlScorecardService.getScorecard(activeMonth)).data,
     enabled: onOverview,
   });
   ```
4. **Ensure Export Button Receives Active Month**:
   `<ExportButton month={activeMonth} />` in the header.

---

## 4. Exact File Modification Blueprint

```
frontend/src/plugins/tl_scorecard/
├── components/
│   ├── ExportButton.tsx                    (Unchanged / receives active month prop)
│   └── scorecard/
│       ├── ReportingMonthSelect.tsx        (NEW: Month dropdown with future-month guards)
│       ├── ReportingMonthSelect.test.tsx   (NEW: Unit test verifying rendering & disabled future months)
│       └── TLScorecardHeader.tsx           (MODIFIED: Hosts MonthSelect + YearSelect + ExportButton in toolbar)
└── pages/
    └── TLScorecardPage.tsx                 (MODIFIED: URL param ?month=, query key with month, removed duplicate year select)
```

---

## 5. Verification Checklist & Success Criteria

1. **URL Navigation**:
   * Visiting `/tl-scorecard?year=2026&month=2026-09-01` renders September 2026.
   * Switching month in the dropdown updates the URL without page reload.
2. **Data Parity for Enri Demnushi**:
   * When **September 2026** is selected:
     * 1-on-1 Compliance Card shows **`100.0%` (18 of 18 met)** in **GREEN**.
     * Manager Syncs Card shows **`7` syncs**.
     * Subtitle displays `"September 2026 · 18 team member(s) · Frozen"`.
   * When **November 2026** is selected:
     * Shows current active team (7 members) and YTD syncs (37 of 45).
3. **Export Verification**:
   * With September 2026 selected, clicking **Export Summary** (XLSX or PDF) downloads `tl_scorecard_enri.demnushi_2026-09.xlsx` (or `.pdf`) with the September figures.
4. **Quality Gates**:
   * `npx vitest run src/plugins/tl_scorecard` exits 0.
   * `npx tsc -b` passes without type errors.
   * No raw hex colors, no emoji, responsive down to 320px.
