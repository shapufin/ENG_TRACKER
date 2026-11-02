# Manager / Line Manager display rename (2026-11-02)

Status: done on branch `feat/display-rename-manager-line-manager`. Rule of record: `docs/workflow-invariants.md` item 52.

## Goal
Show **Manager** instead of "Italian TL" / "IT TL" and **Line Manager** instead of "Albanian TL" / "AL TL" in every place a person reads it: screens, exports, reports, notifications, error messages, docs. Permissions, scope and data do not change.

## Decisions
- Display only. Codes stay: role codes `italian_tl` / `albanian_tl`, `UserProfile.italian_tl` / `albanian_tl` and `is_*_tl_role`, API parameters (`italian_tl_id`), endpoints (`italian_team_leaders`), class names (`HbprAlbanianTlAssignment`), kebab-case test ids.
- "Team Leader" / "TL" stays as the umbrella term for both (TL scope, `tl_scorecard`, "No Team Leader").
- Nationality words that mean something else stay: Albanian payroll rules, Albanian Lek, Albanian time zone and labour law, and example team names in tests.
- Role names reach the API through `apps/permissions/display_names.py` (one map, four serializers). No migration was added or edited.

## What changed
- About 680 lines in about 175 files rewritten by a phrase-level script (articles handled: "an Italian TL" became "a Manager"). It skipped migrations, `help_text` lines, dated plans, specs, audits, reviews, `AGENTS.md` history and `graphify-out/`.
- Hand fixes: the HBPR duplicate-assignment error text (two files), `PluginConfigPermissions` category description, serializer docstrings, doc prose, the HR page test expectations.
- New: `apps/permissions/display_names.py` and `apps/permissions/test_role_display_names.py`.
- Docs: `docs/workflow-invariants.md` item 52, a `CLAUDE.md` hot invariant and router row, an `AGENTS.md` naming rule, and the local `.devin/context/*.md` files.

## Deliberately not changed
- Model `help_text` on `UserProfile.italian_tl`, `albanian_tl`, `is_italian_tl_role`, `is_albanian_tl_role`, and the `IT TL / Team` bundle-kind choice label in `plugins/year_close/models.py`. Both would need schema migrations (SQLite rebuilds the table). The year-close label is not rendered anywhere today.
- `Role.name` rows in the database (still "Italian Team Leader" / "Albanian Team Leader"). Anything that reads the table directly, such as Django admin, shows the old names.
- Dated history under `docs/superpowers/plans`, `specs`, `docs/audits`, `docs/reviews`, `UPGRADE-JOURNAL.md`.

## Checks
- Backend: `py -3.14 manage.py test`, `makemigrations --check`.
- Frontend: `npx tsc --noEmit`, `npx vitest run`, `npx eslint` on changed files, control, surface and table-header audits.
- Wording guard: `git grep -E "\b(Italian|Albanian) (TL|Team Leader)|\b(IT|AL) TL"` outside the excluded paths returns nothing.

## Later (separate plan)
1. Migration: update `Role.name`/`description`, model `help_text` and the year-close label.
2. Optional full code rename (fields, flags, params, endpoints) with a data-safe migration and a restore-compatibility note for site backups.
3. Decide whether "Team Leader" should also become "Manager" family wording everywhere.
