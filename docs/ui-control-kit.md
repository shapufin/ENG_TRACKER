# UI control kit, surfaces and admin page chrome

Short, tracked summary (the detailed notes live in the local `.devin/context/03-FRONTEND-PATTERNS.md` §19).
Fix a look in the token or the primitive, never per call site.

## Control kit (`frontend/src/components/ui/`)

- `controlSurface.ts` is the single definition of a field: height, radius, fill, edge, text size,
  placeholder, focus ring. `Input`, `Textarea`, `SelectTrigger`, `SearchField` consume it.
  The prop is `controlSize` (`sm | md | lg`), not `size` (native `<input size>`).
  `Button` keeps `size` and has `control-sm | control | control-lg` for toolbar alignment.
- `SearchField`: the one search box (icon slot, clear button, Esc clears, required `aria-label`).
  Never draw a `<Search>` icon next to an `<Input>` or add `pl-*` padding by hand.
- `FilterToolbar` (+ `.Search`, `.Group`): layout only; the `max-w-sm flex-1` wrapper lives here once.
- `Chip` (`pressed` -> `aria-pressed`): toggle chip at `--control-h-sm`. `FacetRow` (`components/admin`)
  puts a quiet 12px label in front of a wrapping chip row.
- `DateRangePicker` uses the same surface (`controlSize`), so it aligns with fields and buttons.
  `DataTable` takes `toolbarActions` (filters, chips) so search, filters and Columns share ONE toolbar row.
- `FormField`: label, `helper` (12px muted), `error` (`aria-invalid` + `aria-describedby`), required marker
  (CSS, not in the label text). Use it instead of Label + Input + hand-written error `<p>`.
- Tokens (`index.css`, light and dark): `--control-h-sm/-h/-h-lg` (2 / 2.25 / 2.5rem; under `pointer: coarse`
  `-h` is 2.75rem and `-h-sm` 2.5rem, so chips and `control-sm` buttons grow on touch), `--control-radius`,
  `--control-edge`, `--control-edge-hover`, `--field-bg`. Contrast values are pinned in `theme/tokens.test.ts`.
- Decision D1 (soft edge): the field edge is about 2:1 on a card (dark and light); the focus ring (>= 3:1) and the
  always-visible icon/placeholder carry the rest. Controls keep a real `border` (forced-colors safe).
- `Chip`: a pressed chip gets Highlight colours and a check glyph under `forced-colors`. Counts inside a chip
  inherit its text colour at full opacity (never `opacity-70`). `SearchField`: no `role="search"` wrapper; Esc
  clears a non-empty field and is swallowed before a surrounding Dialog/Popover sees it (second Esc closes).
- A toolbar `Button` takes `size="control-sm|control|control-lg"`, never `h-N` (icon-only `h-N w-N` squares and
  `size="icon"` are fine). A Radix `Select` whose value can be missing from its items (an inactive level, a
  deleted record) must render that value as an extra item, e.g. `Retired (inactive)`, or the trigger goes blank.

## Two surface levels

A page has only two surfaces: the **page** and the **card** (`GlassCard`, flat: hairline + `--shadow-card`,
no blur, hover lift only with `interactive`). A filter or chip panel is never a third grey card: it is the
header strip of the card that holds the table (`border-b border-line-subtle`), or a borderless row on the page.
A toolbar and the table it filters live in ONE card (example: `UsersPageTable` + `UsersPageFilters`).

## Admin page chrome

- `PageShell` (used app-wide, not only in admin): title `text-2xl font-semibold`, subtitle muted `text-sm`,
  actions right-aligned and wrapping.
  One primary action per header; the others are `outline`/`ghost`. Header and form buttons use
  `size="sm"` or `size="control"` (36px), never the 40px default beside 36px fields.
- Stat rows: `StatCard` (p-4, 12px label, `tabular-nums` value, 24px `shrink-0` icon, `min-w-0` text); grid is 2 columns on phones
  (an odd last card spans both), 5 on `xl`, no hole.
- Empty/loading/error: `EmptyState`, `LoadingCard`, `ErrorCard`.
- Text is never below 12px (`text-xs`); `text-micro`/`text-micro-lg` and any `text-[<12px]` are audit violations,
  except the ALLOW list below. Colours come from tone tokens and `dark:` colour classes are banned outside that list.
  Raw palette steps (`bg-amber-500`, `text-emerald-400`) still exist in 33 files (progress bars, status icons,
  identity systems): `surface-audit.mjs --warn-raw-palette` lists them (warn-only, never fails). Do not add more.
- Table headers: `tableStyles.ts` (do not edit).

## Audits (all run in CI, `frontend/`)

Control audit rules: SEARCH-ICON, SEARCH-TYPE (`<Input type="search">`), INPUT-PAD, CONTROL-HEIGHT (`h-8..12` on
Input/Textarea/SelectTrigger/Button/DatePicker/DateRangePicker), RAW-CONTROL, TOOLBAR-WRAPPER. The e2e probe in
`e2e/visual-guards.spec.ts` checks every `[data-filter-toolbar]` on six admin pages has equal-height controls.

- `node --test scripts/control-audit.test.mjs && node scripts/control-audit.mjs --strict`
- `node --test scripts/surface-audit.test.mjs && node scripts/surface-audit.mjs --strict`
- `node scripts/modal-audit.mjs`, `node scripts/table-header-audit.mjs`

## Surface audit ALLOW list (`scripts/surface-audit-lib.mjs`)

Keep it short; each entry names a rule a token cannot express. Anything else is a violation.

- Identity colour systems (a person, skill category, org node is not a status): `calendarStyles.ts`, `UserAvatar`,
  `proficiencyLevels.ts`, `categoryAccents.ts`, organigrama `OrgNode`/`BuilderNode`/`CustomChartViewer`/
  `OrgChartMobileList` (DARK-OVERRIDE; the org nodes also STRAY-FILL; `proficiencyLevels` and `CalendarDayCell`
  also DARK-EXTRA).
- Light and dark use different steps of one token (border vs line-subtle, 5% vs 10% foreground): `ConflictCard`,
  `EventActionButtons`, `CalendarDayCell`, `EventCard`, `SkillsDenseMatrix`, `SkillsHeatmapGrid`,
  `SkillsMemberColumn` (DARK-OVERRIDE).
- MICRO-TEXT, fixed boxes where 12px does not fit: `NotificationBell` (16px count circle), `ProgressRing`
  (ring centre), `ProficiencyBadge` `size="sm"` (pinned by its test).
- Control audit bespoke inputs: `CommandPalette`, `HeaderSearch` (own chrome) and file Dropzones may use a raw
  `<input>`; `HeaderSearch` is the one remaining `type="search"` outside `SearchField`.

## Admin dashboard grid

`react-grid-layout` v2 renders the admin dashboard (`pages/admin/components/dashboard-grid/`). Layout is
stored as `version: 2` (`widgets` = 12-column `lg` placements, optional `layouts.md` = 6-column); old
layouts are migrated by `gridLayout.migrate`. Drag and resize exist only in explicit **Edit layout** mode,
on the All tab, from a visible grip (keyboard: Alt+Arrow moves, Alt+Shift+Arrow resizes). Below 768px the
grid is a plain stack. One `updateLayout` per gesture, through the ordered save queue.
