# Handover: Engagement & TL Scorecard Visual Export Audit (PDF, Excel & Visualization PDF)

**Date:** 2026-11-25  
**Scope:** Audit of all visual export layouts, graph models, and browser download flows across **Engagement** (`plugins/engagement`) and **TL Scorecard** (`plugins/tl_scorecard`), plus shared exporters (`core/utils/pdf_report.py`, `frontend/src/components/visualization/pdfExport.ts`).  
**Status:** Phases 1–4 implemented on branch `feat/visual-export-redesign`; server PDFs (`engagement_month.pdf`, `engagement_year.pdf`, `tl_scorecard.pdf`) and `.xlsx` workbooks regenerated and visually inspected; live interactive browser screenshot/PDF pass on authenticated pages blocked by GOAT browser password-field `privateMode` handoff expiry (marked `NOT RUN` below).

---

## 1. Verification & Simulation Evidence

### 1.1 Design & Structural Gates (Baseline)
Run from `frontend/`:
- `node scripts/table-header-audit.mjs` → **PASS** (0 violations across 1,028 files)
- `node scripts/surface-audit.mjs --strict src/plugins/engagement src/plugins/tl_scorecard` → **PASS** (0 violations across 1,032 files)
- `node scripts/control-audit.mjs --strict src/plugins/engagement src/plugins/tl_scorecard` → **PASS** (0 violations across 700 files)
- `node scripts/modal-audit.mjs` → **PASS**
- Design contract reference: `DESIGN.md` ("Obsidian Enterprise", zero raw hex in `.tsx`, tabular numerals, 2-surface rule, `tone.ts` tokens).

### 1.2 Live Browser Download Simulation & Opened Files
Executed in headless Chromium (Playwright 1.62.1, `1440×900`) against an isolated copy of `db.e2e.sqlite3` seeded with 11 months of Engagement snapshots (`Jan–Nov 2026`, scores oscillating `64.0 → 92.5`, TTA `5.1h → 18.4h`, aging buckets, multi-team rows) and 6 months of TL Scorecard records (`Jun–Nov 2026`, meetings, reviews, PIPs, absences, idle flags, EPR cycles/evidence, HBPR partnership log).

| Surface | Triggered UI Action | Downloaded Artifact | Size | Pages / Sheets | Console / Net Errors |
|---|---|---|---|---|---|
| `/engagement/metrics` (`e2e_tl`) | Export Report → Excel — this month | `engagement_month_e2e_tl_2026-11.xlsx` | 12,736 B | 3 sheets (`Summary`, `Trend`, `Approval Aging`) | 0 / 0 |
| `/engagement/metrics` (`e2e_tl`) | Export Report → Excel — full year | `engagement_year_e2e_tl_2026.xlsx` | 13,197 B | 3 sheets (`Summary`, `Trend`, `Approval Aging`) | 0 / 0 |
| `/engagement/metrics` (`e2e_tl`) | Export Report → PDF report — this month | `engagement_month_e2e_tl_2026-11.pdf` | 11,157 B | 4 pages (A4 portrait) | 0 / 0 |
| `/engagement/metrics` (`e2e_tl`) | Export Report → PDF report — full year | `engagement_year_e2e_tl_2026.pdf` | 45,792 B | 24 pages (A4 portrait) | 0 / 0 |
| `/engagement/visualize` (`e2e_tl`) | Export PDF (`captureChartsToPdf`) | `engagement_visual_2026-11-01.pdf` | 469,394 B | 2 pages (A4 portrait, raster PNGs) | 0 / 0 |
| `/tl-scorecard` (`e2e_tl_b`) | Export Summary → Excel workbook (.xlsx) | `tl_scorecard_e2e_tl_b_2026-11.xlsx` | 16,131 B | 4 sheets (`Summary`, `Trend`, `Governance`, `HBPR partnership log`) | 0 / 0 |
| `/tl-scorecard` (`e2e_tl_b`) | Export Summary → PDF report | `tl_scorecard_e2e_tl_b_2026-11.pdf` | 13,598 B | 4 pages (A4 portrait) | 0 / 0 |
| `/tl-scorecard/visualize` (`e2e_tl_b`) | Export PDF (`captureChartsToPdf`) | `tl-scorecard-visual.pdf` | 494,856 B | 3 pages (A4 portrait, raster PNGs) | 0 / 0 |

All 5 PDFs were opened and inspected page-by-page (rendered screenshots + OCR text), and all 3 `.xlsx` workbooks were inspected via `openpyxl` + raw `xl/charts/chart*.xml` XML parsing.

---

## 2. Critical Rendering & Data Bugs (P0 — Fix First)

### P0-1. KPI Tile Label & Value Text Overlap in Server PDFs (`core/utils/pdf_report.py:155-162`)
- **Observed in:** Page 1 of `engagement_month_*.pdf`, `engagement_year_*.pdf`, and `tl_scorecard_*.pdf`.
- **Symptom:** The large 18pt KPI metric (`93.3`, `66.7%`, `100.0%`, `10`, `1`) collides vertically with the 8pt muted label above it (`Engagement score`, `Approval rate`, `1:1 compliance`, `Management reviews...`).
- **Root Cause:** `cover_block` puts both the 8pt label and 18pt value inside a single `Paragraph(..., styles['body'])` separated by `<br/>`. `styles['body']` has fixed `leading=12` (12pt), which is smaller than the 18pt bold font on the second line, causing the numbers to overlap the label line.
- **Fix:** Render each KPI tile as a nested 2-row table or stacked `Paragraph`s using dedicated `kpi_label` (`fontSize=8, leading=10`) and `kpi_value` (`fontSize=18, leading=22`) styles, plus a subtle left/top tone accent stripe instead of flat grey boxes.

### P0-2. Headline Composite Engagement Score Completely Disappears in Visual PDF (`EngagementVisualizationPage.tsx:242-247`)
- **Observed in:** Page 1 of `engagement_visual_2026-11-01.pdf` — renders `"    / 100"` with blank space where `"93"` should be.
- **Root Cause:** The score `<span>` uses `bg-linear-to-br ... bg-clip-text ... text-transparent`. `html2canvas-pro` does not support CSS `background-clip: text` with `color: transparent`, so the headline KPI score vanishes in the captured PDF.
- **Fix:** During PDF clone (`applyPrintStyles` in `pdfExport.ts` or via a `print:` / `.pdf-exporting` class), reset `bg-clip-text` and `text-transparent` to solid `color: #0f172a` (or the score's semantic tone color) and drop CSS `drop-shadow` glow filters.

### P0-3. Horizontal Bar Y-Axis Labels Clipped Off Left Edge (`core/utils/pdf_report.py:274-278, 346-385`)
- **Observed in:** Page 3 of `tl_scorecard_*.pdf` (`Team risks & seniority`) — `"PIPs pending HR approval"` is truncated to `"Ps pending HR approval"`, `"Absences over 5 days"` touches the left canvas border.
- **Root Cause:** `_chart_box(drawing)` hardcodes `x0 = 34` points (~12mm) regardless of `horizontal=True` or category label width.
- **Fix:** Compute dynamic left margin from `max(stringWidth(cat, 'Helvetica', 7) for cat in categories) + padding` when `horizontal=True` (or wrap long labels / increase `x0` to `~115pt`).

### P0-4. Broken Legend Color Swatches on `Approval Aging` (`EngagementVisualizationPage.tsx:403-420` & `AgingBucketChart.tsx:118-132`)
- **Observed in:** `engagement_visual_2026-11-01.pdf` Page 1 (`Approval Aging`) — legend reads `Leave   Overtime   Standby` with **no colored squares**.
- **Root Cause:** `<Bar fill="url(#vizAgingLeave)" ... />` passes an SVG gradient URL into Recharts, which forwards `item.color = "url(#vizAgingLeave)"` to `ChartLegendContent`. Applying `backgroundColor: "url(#...)"` on an HTML `<div>` swatch is invalid CSS, so swatches render invisible. (`RequestVolumeChart` uses `fill="var(--color-approved)"`, so its swatches render properly.)
- **Fix:** Pass solid `stroke` / `legendType` or use `fill="var(--color-leave)"` (or explicit `color` token in `ChartLegendContent` fallback via `config[dataKey].color`).

### P0-5. `EPR cycles` Long Prose `Goals` Column Right-Aligned (`plugins/tl_scorecard/pdf_export.py:198`)
- **Observed in:** Page 4 of `tl_scorecard_*.pdf` (`EPR cycles` table).
- **Root Cause:** `numeric_cols=(len(headers) - 1,) if title == 'EPR cycles' else ()`. In `excel_export.py`, the second-to-last column is `goal_count` (numeric); in `pdf_export.py`, column index 4 is `Goals` (a semicolon-joined multi-line list of goal titles), so 5 lines of wrapped prose are right-aligned.
- **Fix:** Remove `numeric_cols` for `EPR cycles` in `pdf_export.py` (or add a dedicated numeric `Count` column before `Goals` and keep `Goals` left-aligned).

### P0-6. `Reviews (YTD)` Trend Line Is Flat Across All Months (`plugins/tl_scorecard/services.py:346-350, 991-1000`)
- **Observed in:** `tl_scorecard_*.pdf` Page 2 (`Management reviews (YTD)` = `10, 10, 10, 10, 10, 10`), `tl_scorecard_*.xlsx` `Trend` sheet, and `tl-scorecard-visual.pdf` Page 2 (`Review deliveries vs target`).
- **Root Cause:** `build_scorecard` caches `year_metrics[month.year]['review_deliveries_ytd'] = review_delivery_count(user, month.year)` across all months in that year without filtering `delivered_on <= month_end` (or `period <= month[:7]`). Every historical month in 2026 receives the final November YTD total (`10`), making the "Cumulative reviews delivered" trend line completely flat and hiding real monthly progress against the pro-rata target!
- **Fix:** Parameterize `review_delivery_count(leader, year, up_to_month=None)` (or filter `TrendWindow` deliveries by `delivered_on < month_end` / `period <= YYYY-MM`) and cache `year_metrics` per `(year, month)` for `review_deliveries_ytd` (note: check `ScorecardMonthSnapshot` and `test_tl_scorecard.py` / `test_trend_budget.py` query-count budgets!).

---

## 3. Graph Model Audit ("Wrong Graph Models" & Missing Increase/Decrease Signals)

Across both plugins, several charts pick chart types or encodings that obscure **month-over-month increases/decreases**, **target attainment**, **part-to-whole composition**, and **integer granularity**:

| Surface & Chart | Current Model (`file:line`) | Why It Fails / Looks Unprofessional | Recommended Graph Model |
|---|---|---|---|
| **Engagement PDF**: Trend (`engagement/pdf_export.py:111-118`) | 3 disconnected charts split across Page 1 & Page 2: bare `line_chart` (score), 4-line overlap `line_chart` (sub-scores), bare `bar_chart` (Avg TTA stranded on Page 2 with no title) | No target/benchmark bands (80 Healthy / 50 Watch); no MoM delta/increase callouts; Avg TTA bar chart is separated from its section heading and draws blank at `0.0h`; 4 sub-score lines collide | **1. Hero Combo / Dual-Panel Trend:** Score line + shaded area (with 80/50 horizontal threshold dashed bands & MoM `+Δ`/`-Δ` callouts) paired directly above/with Avg TTA line (with data labels). **2. Sub-score Drivers:** Grouped horizontal/vertical bars with MoM deltas or 2×2 small-multiples sparklines so each component's movement is legible |
| **Engagement PDF**: Volume (`engagement/pdf_export.py:121-135`) | 3 separate full-width grouped bar charts (`Submitted` vs `Decided`) per request type | When `Submitted ≈ Decided`, pairs of identical bars waste half a page each and hide **Approved / Rejected / Pending** status and **backlog carry-over** (`Decided > Submitted` in Oct Standby) | **Single Stacked Status Chart or 3-column Compact Panel:** Stacked bars (`Approved` green + `Rejected` red + `Pending` amber) with total `Submitted` overlay line/markers, matching `RequestVolumeChart` in the Web UI |
| **Engagement Excel**: `Trend` (`engagement/excel_export.py:220-250`) | `smooth: True` dual-axis `line` + dashed `line` (`Score` + `Avg TTA`); `Decisions during leave` not charted; no sub-scores or MoM delta | `smooth: True` spline overshoots above `100` on bounded scores and hides sharp month drops; dual lines on one plot without area/column distinction are hard to parse; lacks data labels and target line | **Linear (`smooth: False`) Column+Line Combo** (Score columns or non-smoothed area + TTA line on Y2) with **Target 80 benchmark series**, **MoM Change (`+/-`) column** in the data table (with green/red conditional arrows), plus a **2nd chart for the 4 Sub-scores** |
| **Engagement Excel**: `Approval Aging` (`engagement/excel_export.py:274-291`) | Clustered column (`Leave`, `Overtime`, `Standby`) with `set_style(37)` and `data_labels` printing overlapping `0`s | Style 37 conflicts with Trend's Style 11; zero-value bars clutter the baseline with `"0"` labels; clustered bars don't show total SLA distribution | **Stacked Column** (`Leave` + `Overtime` + `Standby` per bucket `<4h`, `4-24h`, `1-3d`, `>3d`) with **% share of total** column in table + clean custom number format `#,##0;;""` to suppress zero labels |
| **TL Scorecard PDF**: `Meetings & reviews` (`tl_scorecard/pdf_export.py:65-90`) | (1) 2-bar (`Manager syncs` vs `Team meetings w/ HRBP`, omitting `Team meetings held`); (2) line (`1:1 compliance` + empty `Onboarding` legend); (3) 2-line (`Reviews YTD` vs `Pro-rata target` with `0, 2.75, 5.5, 8.25, 11` fractional Y-axis) | Fractional Y-axis (`2.75`, `8.25`) for integer counts; empty `Onboarding 1-on-1s` series renders in legend; `1:1` chart has no `100%` target line or `80%` Watch band; `Reviews` chart doesn't highlight ahead/behind variance (`+Δ`/`-Δ`) | **(1) Cadence:** Clustered/stacked bars including `Team meetings held` + `With HRBP` + `TL syncs` with integer Y-axis. **(2) Compliance:** Bar or step-line with `100%` Target & `80%` Watch reference bands and point labels. **(3) Reviews YTD:** Bar (Actual YTD) + dashed target line + `+/-` pace variance badge |
| **TL Scorecard PDF**: `Team risks & seniority` (`tl_scorecard/pdf_export.py:141-160`) | Plain blue horizontal bar chart with **`0, 0.2, 0.4, 0.6, 0.8, 1`** decimal X-axis + 50mm solid donut for `1 person` | Fractional X-axis ticks (`0.2`, `0.4`) for headcounts; all risks colored identical blue (no severity distinction for SLA breaches / escalations); no bar-end value labels; giant 1-color donut wastes space | **Severity-coded horizontal bars** (danger red for `Absences >5d` & `Escalations`, warning amber for `PIPs pending`, muted/blue for info) with **integer axis ticks** and **direct bar-end count labels**; compact horizontal stacked bar (or compact pill strip) for Seniority when `<2` categories are non-zero |
| **TL Scorecard Excel**: `Trend` (`tl_scorecard/excel_export.py:188-212`) | Single `column` + `line` chart plotting ONLY `Manager syncs`, `Team meetings w/ HRBP`, and `Reviews (YTD)` on **one** `Count` axis | Completely **ignores** `1:1 compliance %`, `Promotion ratio %`, and `Onboarding 1-on-1s %` (columns B, F, G are never charted!); mixes cumulative YTD (0–12) with monthly counts (1–4) on one axis; omits `Pro-rata target` | **Two coordinated charts on `Trend`:** Chart 1 (Compliance %): Line/Column for `1:1 compliance %`, `Onboarding %`, `Promotion %` (`0–100%` axis + target line). Chart 2 (Cadence & Reviews): Monthly `Manager syncs` & `Team meetings` bars (Y1) + `Reviews YTD` vs `Pro-rata target` dashed line (Y2) |
| **Visualization Pages / Visual PDF**: `EngagementVisualizationPage.tsx` & `TLScorecardVisualizationPage.tsx` | `type="monotone"` spline curves on bounded `%` / score series (`1:1 compliance`, `Engagement Trend`, `Meeting notes within 24h`) | Splines create visual **overshoot/undershoot** (e.g., `1:1` drops smoothly through 50% between `100%` and `0%`; `TTA` curves upward before dropping to `0`; `Notes within 24h` dips below bar height). `TeamComparisonChart` maps `null` score to `0` (`TeamComparisonChart.tsx:29`) | Use `type="linear"` (or bar + threshold coloring for monthly `1:1 compliance`), add `ReferenceLine` benchmarks (`80` / `50` / `100%`) and explicit MoM delta labels, render `"No data"` instead of `0` bar in `TeamComparisonChart`, and replace `Notes within 24h` spline with stacked bars (`Within 24h` + `Late/missing`) |

---

## 4. Layout, Pagination & Polish Defects

### 4.1 Engagement Server PDF (`plugins/engagement/pdf_export.py`)
1. **Orphaned `"Monthly detail"` heading (`lines 187-203`):** `section_title(story, 'Monthly detail')` sits stranded at the bottom of Page 2 while January/November starts on Page 3 (`KeepTogether` in `_month_block` prevents `keepWithNext` from pulling the block with the title).
2. **Massive pagination bloat — 24 pages for 11 months in Year PDF (`lines 165-203`):**
   - Each month stacks 3 narrow `120mm` tables (`col_widths=[80, 40]` out of `178mm` content width, leaving `58mm` blank on the right), pushes `"Decided requests by time to approve."` to the bottom of Page N, and strands the aging `bar_chart` **alone on Page N+1** (80% blank page).
   - **Fix:** Merge Leave / Overtime / Standby into **one 4-column comparison table** (`Metric | Leave | Overtime | Standby`, full `178mm` width) + compact aging chart underneath inside `KeepTogether` — fitting **1 full month cleanly on 1 page** (or 2 months/page), cutting the Year PDF from **24 pages → ~7–12 dense pages**.
3. **Charts lack titles & captions (`core/utils/pdf_report.py`):** Every chart relies on a loose `paragraph()` above it, which separates across page breaks (e.g., Page 2 TTA bar chart has zero title/label anywhere on the page). Add an explicit `title` parameter drawn inside `Drawing` / `KeepTogether`.
4. **Even-month forced page break (`line 201`) + trailing `"No data recorded for December."` (`line 200`):** Replace with clean `KeepTogether` month blocks or a condensed annual monthly matrix table + only non-empty month details.

### 4.2 TL Scorecard Server PDF (`plugins/tl_scorecard/pdf_export.py`)
1. **Orphaned `"Governance records"` + `"Open PIPs"` on Page 3 (`lines 170-199`):** `pdf.paragraph(story, title)` uses `styles['body']` (`keepWithNext=0`), stranding `"Open PIPs"` at the bottom of Page 3 while its table opens Page 4 without a title. Wrap `(title, data_table)` in `KeepTogether` and give sub-titles `keepWithNext=1`.
2. **Odd-tile orphan grey box in `cover_block` (`core/utils/pdf_report.py:164-165`):** 7 KPI tiles in a 2-col grid create an empty grey cell on row 4 right. Use a 3-col or 4-col compact grid, or give the odd cell a white/transparent background instead of `PALETTE['surface']`.
3. **Missing header/title on `Seniority mix` donut (`line 156`):** Donut chart appears below the risk bar chart with no sub-heading.

### 4.3 Excel Workbooks (`plugins/engagement/excel_export.py` & `plugins/tl_scorecard/excel_export.py`)
1. **Engagement XLSX lacks print setup & freeze panes:** `_print_setup` (`landscape`, A4, `fit_to_pages(1, 0)`) and `freeze_panes` exist in `tl_scorecard/excel_export.py` but are completely absent in `engagement/excel_export.py`.
2. **Muddy conditional format + solid fill clash (`engagement/excel_export.py:172-187`):** Layers `#1D4ED8` blue `data_bar` directly over solid `#059669` green / `#F59E0B` amber / `#DC2626` red white-text cells, plus raw unformatted floats (`93.33` without `0.0` `num_format`). Use soft pastel tint fills (matching `STATUS_TONES` in `tl_scorecard/excel_export.py:34-38`) or separate the `Score` value column from a dedicated visual progress bar column.
3. **Inconsistent chart & sheet styling:**
   - Engagement XLSX mixes `set_style(11)` (`Trend`) with dark heavy `set_style(37)` (`Approval Aging`) and has no title banner on `Trend` or `Approval Aging`.
   - TL Scorecard XLSX uses 4 different sheet header treatments across its 4 sheets (`fmt.title` banner on `Summary`/`Governance`, no banner on `Trend`, `fmt.header` + `fmt.label` on `HBPR partnership log`).
4. **Column width mismatch on `tl_scorecard` `Governance` sheet (`lines 231-233`):** `A:26, B:H:20, I:50` forces `EPRStageEvidence.Summary` into narrow column `H` (width 20) and leaves `OpenPIPs` / `OpenAbsences` notes cramped while `I` (width 50) sits empty. Also `row_heights` are not sized for wrapped multiline cells.
5. **Workbook-to-PDF parity gaps:**
   - Engagement XLSX has **no `Volume` or `Monthly Detail` (per-type / per-team)** sheet, whereas the PDF has both.
   - TL Scorecard XLSX has **no `EPR Progress` summary table/chart** on `Summary`/`Trend` (only raw `EPRCycles` rows in `Governance`).

### 4.4 Client-Side Visual PDF (`frontend/src/components/visualization/pdfExport.ts`)
1. **Unused 2-column grid layout:** `captureChartsToPdf` implements 2-column packing for `data-pdf-span="half"`, **but neither `EngagementVisualizationPage` nor `TLScorecardVisualizationPage` passes `data-pdf-span="half"`** (`ChartSection.tsx` has no prop for it), so every card renders full-width and spreads across extra half-empty pages.
2. **Dark-mode CSS token bleed (`applyPrintStyles`, `lines 52-69`):** Only sets `backgroundColor` and `color` on the cloned node, not `--card`, `--foreground`, `--muted-foreground`, `--border`, or removing `.dark` class from the cloned document root. Exporting while in Dark Mode risks dark cards/low-contrast ticks on white paper.
3. **Rasterized PNG output (`html2canvas-pro`):** Vector charts and typography rasterize into ~500 KB non-searchable bitmaps. (Acceptable short-term if P0-2, P0-4, dark-mode token reset, and `data-pdf-span="half"` are fixed; long-term, server vector PDF parity is cleaner.)

### 4.5 Related UI / Runtime Findings Observed During Browser Simulation
1. **`EngagementMetricsPage.tsx:252-294` Export Popover stays open after clicking an item** (unlike `tl_scorecard/components/ExportButton.tsx`, which calls `setIsOpen(false)`).
2. **`EngagementMetricsPage` 3-request concurrent refresh lock:** On mount, `useEngagementMetrics` fires 3 concurrent GETs (`summary`, `trend`, `team-breakdown`) instead of using the existing single `dashboard` endpoint (`plugins/engagement/viewsets.py:224`), triggering `sqlite3.OperationalError: database is locked` in local dev/e2e when snapshots refresh simultaneously (observed in server logs during simulation).

---

## 5. Graphify Architecture & Blast-Radius Audit

Queried from `graphify-out/graph.json` (28,113 nodes):

```
Core PDF Kit (shared by both plugins — must stay plugin-agnostic)
  core/utils/pdf_report.py  (new_report, cover_block, data_table, line_chart, bar_chart, donut_chart)
    ├── plugins/engagement/pdf_export.py  ──> plugins/engagement/excel_export.py (_group_by_month)
    │                                     ──> plugins/engagement/services.py (aggregate_rows, monthly_rollup, weighted_mean)
    └── plugins/tl_scorecard/pdf_export.py ──> plugins/tl_scorecard/report_kpis.py (kpi_rows, status_for, reviews_target)

Excel Builders (xlsxwriter, self-contained per plugin)
  plugins/engagement/excel_export.py  <── plugins/engagement/viewsets.py (.export)
  plugins/tl_scorecard/excel_export.py <── plugins/tl_scorecard/viewsets/scorecard.py (.export)
                                       ──> core/utils/csv_safe.py (xlsx_safe)

Frontend Visualization & Client PDF Capture
  frontend/src/components/visualization/pdfExport.ts (captureChartsToPdf)
    ├── EngagementVisualizationPage.tsx (dynamic import)
    ├── TLScorecardVisualizationPage.tsx (dynamic import)
    └── pages/admin/hooks/useDashboardPdfExport.ts (dynamic import — BLAST RADIUS!)
```

### Key Coupling & Guardrails for the Implementer
1. **Shared `pdfExport.ts` blast radius:** `useDashboardPdfExport.ts` (Admin Dashboard PDF export) shares `captureChartsToPdf`. Any changes to `pdfExport.ts` must preserve `pdfExport.test.ts` and be regression-tested on Admin Dashboard export (`e2e/admin-dashboard.spec.ts`).
2. **Plugin isolation invariant (`CLAUDE.md`):** `plugins/engagement` and `plugins/tl_scorecard` must NEVER import from each other or from `plugins/payroll`. Shared PDF drawing/layout helpers belong exclusively in `core/utils/pdf_report.py`.
3. **HBPR masking & confidentiality contracts (`docs/hbpr-and-scorecard.md`, `test_scorecard_export_formats.py`):**
   - `kpi_rows(..., include_restricted=False)` must continue omitting `Leave`, `Overtime`, and `Onboarding` rows AND the cover target sentence for HBPR-only viewers (`test_hbpr_export_has_no_onboarding_text_anywhere`).
   - `_mask_one_on_one` nulls `one_on_one_compliance_pct` and `onboarding_pct` for non-owner HBPRs; new PDF/XLSX charts must treat `None` as a gap (`—`), never `0`, and never leak masked percentages (`test_pdf_never_contains_the_leaders_one_to_one_percentage`).
   - Free text in `tl_scorecard` XLSX must continue passing through `xlsx_safe` (`strings_to_formulas: False, strings_to_urls: False`), and Engagement XLSX must keep `test_excel_formula_safety.py` green (no `=`, `+`, `-`, `@` formula cells unless intentional Excel formulas are explicitly audited and exempted safely — note `EngagementWorkbookFormulaSafetyTests` asserts `cell.data_type != "f"` on every cell!).
4. **Query-budget tests (`test_trend_budget.py`, `test_trend_queries.py`, `test_engagement.py::test_year_pdf_uses_same_queries_as_year_xlsx`):** Fixing `review_delivery_count` per month in `scorecard_trend` must use the single `TrendWindow` query (do not add N+1 queries per month in `build_scorecard`).
5. **Single source of math:** Both PDF and XLSX must continue reading the exact same `aggregate_rows` / `monthly_rollup` (Engagement) and `kpi_rows` / `scorecard_trend` / `epr_metrics` (TL Scorecard) so PDF, XLSX, and UI never drift.

---

## 6. Recommended Implementation Phases & Acceptance Gates

| Phase | Target Files | Key Changes | Targeted Verification |
|---|---|---|---|
| **1. Core PDF Kit & Bug Fixes** | `core/utils/pdf_report.py`, `core/utils/test_pdf_report.py` | Fix `cover_block` KPI tile leading/overlap & odd-tile fill; add `sub_heading` (`keepWithNext=1`), integer Y/X axis stepping, dynamic horizontal bar label margin, `title` inside chart `Drawing`, threshold reference lines, MoM delta badges, stacked bar & combo area+line helpers | `py -3.14 manage.py test core.utils.test_pdf_report` |
| **2. Engagement PDF & XLSX Redesign** | `plugins/engagement/pdf_export.py`, `plugins/engagement/excel_export.py`, `plugins/engagement/test_engagement.py`, `plugins/engagement/test_excel_formula_safety.py` | Unified 4-col per-month comparison table + 1-page-per-month layout; stacked status volume chart; score+TTA combo with 80/50 bands & MoM deltas; XLSX print setup, freeze panes, pastel status fills without dark-bar clash, `smooth=False`, MoM change column, stacked aging, Volume/Monthly detail sheet | `py -3.14 manage.py test plugins.engagement` + `ruff check` |
| **3. TL Scorecard Trend Fix, PDF & XLSX Redesign** | `plugins/tl_scorecard/services.py`, `plugins/tl_scorecard/pdf_export.py`, `plugins/tl_scorecard/excel_export.py`, `plugins/tl_scorecard/test_scorecard_export_formats.py` | Fix cumulative-by-month `review_deliveries_ytd` in `scorecard_trend` via `TrendWindow`; fix `EPR cycles` alignment & orphaned `Open PIPs` header; add severity-coded risk bars & 100%/80% compliance bands; add Chart 1 (% KPIs) + Chart 2 (Cadence + Reviews vs target) on XLSX `Trend`; unify XLSX sheet banners, column widths (`Summary` in `I` or per-table widths), and print setup | `py -3.14 manage.py test plugins.tl_scorecard` + `ruff check` |
| **4. Frontend Visualization & Visual PDF Fixes** | `EngagementVisualizationPage.tsx`, `TLScorecardVisualizationPage.tsx`, `EngagementMetricsPage.tsx`, `AgingBucketChart.tsx`, `TeamComparisonChart.tsx`, `ChartSection.tsx`, `pdfExport.ts` | Fix `bg-clip-text` invisible score & `url(#...)` legend swatches; switch bounded `%`/score splines to `linear` + reference thresholds & delta tags; support `data-pdf-span="half"` for 2-col visual PDF packing; reset dark-mode tokens in `applyPrintStyles`; close Export popover on click | Frontend gate (`tsc --noEmit`, `eslint src`, `vitest run`, `npm run build`, all 4 audit scripts) |
| **5. End-to-End Browser & Visual Re-Audit** | Playwright simulation (`e2e/` or verification run) | Re-download all 8 PDFs & XLSX files via browser clicks (light & dark mode), open every rendered PDF page visually, verify zero text overlap/clipping, verify chart legibility & parity, and run `graphify update .` | Full backend + frontend gates + opened-PDF visual sign-off |

---

## 7. Implementation & Verification Summary (2026-11-25)

### Implemented Changes (`feat/visual-export-redesign`)
- **Phase 1 (`core/utils/pdf_report.py`, `core/utils/test_pdf_report.py`):** Nested KPI label/value/delta tiles with left tone accents and white trailing empty cells; `_nice_ticks(..., integer=...)`; dynamic horizontal bar left margin; `_add_chart` chaining `section_title` -> `chart_title` -> `caption` -> `drawing` directly via `keepWithNext=1`; left-anchored threshold bands (`_draw_thresholds`), collision-free multi-series/ceiling point labels, and `barLabels.boxAnchor='w'` for horizontal value labels; new `combo_chart` and `stacked_bar_chart`.
- **Phase 2 (`plugins/engagement/pdf_export.py`, `plugins/engagement/excel_export.py`, `plugins/engagement/test_engagement.py`):** Cover MoM `score_delta`, combo Score+Avg TTA chart, 4-series component driver chart, stacked request volume chart, 4-column `Metric | Leave | Overtime | Standby` monthly detail table, A4 landscape XLSX print setup + freeze panes, numeric `MoM Change` (`+0.0;-0.0;0.0`), stacked aging with suppressed zero labels, and `Monthly Volume` sheet.
- **Phase 3 (`plugins/tl_scorecard/services.py`, `pdf_export.py`, `excel_export.py`, `viewsets/scorecard.py`, tests):** Cumulative-by-month `review_deliveries_ytd` via `bisect_left` in `build_scorecard` + `before=` param on `review_delivery_count`; 3-series `Monthly Meeting Cadence`, conditional onboarding title/series (`include_restricted`), `100%`/`80%` threshold bands, severity-colored risk bars with integer axis and bar-end counts, deterministic `Seniority Mix` donut palette, left-aligned `Goals` in `Governance`, `EPR progress` table on XLSX `Summary`, unified banners/freeze panes, and two linear charts on XLSX `Trend`.
- **Phase 4 (`ChartSection.tsx`, `pdfExport.ts`, `EngagementMetricsPage.tsx`, `EngagementVisualizationPage.tsx`, `TTATrendChart.tsx`, `ScoreCompositionTrendChart.tsx`, `AgingBucketChart.tsx`, `TeamComparisonChart.tsx`, `TLScorecardVisualizationPage.tsx`, `pdfExport.test.ts`):** `pdfSpan` 2-col packing hints, `.dark` class stripping without overriding `src/index.css` `--chart-*` palette tokens + solid ink conversion for `[data-pdf-solid-text]` / `.bg-clip-text.text-transparent` in `applyPrintStyles`, solid legend swatches in `AgingBucketChart` / `EngagementVisualizationPage`, linear curves + labeled benchmark lines, transparent placeholder + `"No data"` labels on `null` team comparison scores, stacked `Notes within 24h` bars, bar-end risk count labels, and Export popover auto-close.

### Visual & Gate Evidence
- **Regenerated Server Artifacts Inspected (`sim_e2e.sqlite3`):** `engagement_month.pdf` (3 pages), `engagement_year.pdf` (9 pages, down from 24), `tl_scorecard.pdf` (4 pages), plus `.xlsx` structure (`engagement_month.xlsx`, `engagement_year.xlsx`, `tl_scorecard.xlsx` verified via `openpyxl`). Opened all pages visually: zero orphaned headings, zero KPI overlaps, legible axes, bar-end labels, and aligned `Governance` `Goals`.
- **NOT RUN (Environment / Handoff Block):** Live interactive browser download verification of client-side `captureChartsToPdf` (`EngagementVisualizationPage` light/dark and `TLScorecardVisualizationPage`) could not complete because GOAT browser enforces `privateMode` on `<input type="password">` at `/login` and the password-entry handoff expired (`handoff:a81ee7a6-b5cf-4dc9-936c-e54b1ba01022`). Covered by unit/component tests (`pdfExport.test.ts`, `EngagementVisualizationPage.test.tsx`, `TLScorecardVisualizationPage.test.tsx`).
