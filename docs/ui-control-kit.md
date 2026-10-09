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
- Tokens (`index.css`, light and dark): `--control-h-sm/-h/-h-lg` (2 / 2.25 / 2.5rem, 2.75rem default
  height under `pointer: coarse`), `--control-radius`, `--control-edge`, `--control-edge-hover`, `--field-bg`.
- Decision D1 (soft edge): the field edge is about 2:1 on a card; the focus ring (>= 3:1) and the
  always-visible icon/placeholder carry the rest. Controls keep a real `border` (forced-colors safe).

## Two surface levels

A page has only two surfaces: the **page** and the **card** (`GlassCard`, flat: hairline + `--shadow-card`,
no blur, hover lift only with `interactive`). A filter or chip panel is never a third grey card: it is the
header strip of the card that holds the table (`border-b border-line-subtle`), or a borderless row on the page.
A toolbar and the table it filters live in ONE card (example: `UsersPageTable` + `UsersPageFilters`).

## Admin page chrome

- `PageShell`: title `text-2xl font-semibold`, subtitle muted `text-sm`, actions right-aligned and wrapping.
  One primary action per header; the others are `outline`/`ghost`. Header and form buttons use
  `size="sm"` or `size="control"` (36px), never the 40px default beside 36px fields.
- Stat rows: `StatCard` (p-4, 12px label, `tabular-nums` value, 24px icon); grid is 2 columns on phones
  (an odd last card spans both), 5 on `xl`, no hole.
- Empty/loading/error: `EmptyState`, `LoadingCard`, `ErrorCard`. Text is never below 12px.
- Colours come from tone tokens only (no `dark:` colour classes). Table headers: `tableStyles.ts` (do not edit).

## Audits (all run in CI, `frontend/`)

- `node --test scripts/control-audit.test.mjs && node scripts/control-audit.mjs --strict`
- `node --test scripts/surface-audit.test.mjs && node scripts/surface-audit.mjs --strict`
- `node scripts/modal-audit.mjs`, `node scripts/table-header-audit.mjs`

## Admin dashboard grid

`react-grid-layout` v2 renders the admin dashboard (`pages/admin/components/dashboard-grid/`). Layout is
stored as `version: 2` (`widgets` = 12-column `lg` placements, optional `layouts.md` = 6-column); old
layouts are migrated by `gridLayout.migrate`. Drag and resize exist only in explicit **Edit layout** mode,
on the All tab, from a visible grip (keyboard: Alt+Arrow moves, Alt+Shift+Arrow resizes). Below 768px the
grid is a plain stack. One `updateLayout` per gesture, through the ordered save queue.
