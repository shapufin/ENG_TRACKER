# Closed-year archive, Archives area and 3-year retention (plan v2)

Status: owner decisions recorded 2026-11-12. Phase 1 built on `feat/year-close-archive-bundle`, rest not built.
Branch per phase, TDD, one PR each, docs and backup checks inside every phase.

## Owner decisions (2026-11-12)
1. Retention is 3 full years after the year is closed (`YEAR_RETENTION_YEARS = 3`) for overtime, standby, leave,
   scorecard, EPR, engagement and HBPR evidence, and 5 years for payroll (`PAYROLL_RETENTION_YEARS = 5`).
2. Superuser only: the Archives area, downloads, purge and notices. Staff and HR do not see it.
3. A separate admin category "Archives" keeps the rest of the admin GUI clean.
4. HBPR evidence is purged with the rest once archived (supersedes the old "evidence rows are never deleted" rule).
5. Backup/restore must be updated with every change so a restore never breaks or silently undoes a purge.

## Senior calls on top of that
- A purge is never automatic: a superuser starts it with a click (and `purge_expired_years` for the headless path).
  Gates, all required: year closed, archive files present and sha256 verified, notice sent at 90 and 30 days before,
  no failed file. Anything else refuses and says why. The dry-run summary is shown before the confirm.
- After a purge the ZIP is the only copy. So `SNAPSHOT_ROOT` must be inside the backup scope (runbook + guard test),
  and a purge refuses if the file or its hash is missing.
- Payroll is kept 5 years, longer than the rest; the owner still confirms the legal period with the accountant.
- Leave requests are purged only after year-end carry-over is applied; a balance-impact test pins that no balance moves.

## Phase 1 - Complete the year-close bundle (built, awaiting suite)
`archive_sets.py`: EPR, scorecard months, engagement, HBPR evidence with attendees, leader records, in the company
ZIP; December snapshot blocker. Items 74-75 in `docs/workflow-invariants.md`.

## Phase 2 - Archives area (superuser)
- Admin sidebar group "Archives" (one entry, replaces the Previous Years entry; route and crumbs updated).
- Sections per year: Payroll, Overtime, Standby, Leave, Scorecard and EPR, Engagement, HBPR evidence, each with its
  file, size, hash status, removal date and download. Leader history lists current and former leaders per year.
- Read-only: downloads and status, no live data grid (closed-year data is frozen, no recomputation).

## Phase 3 - Retention, notice, purge, tombstone
- New small model `ArchivePurge` (year, category, rows removed, archive hash, purged at): proof of what was removed.
- `retention.py` with a daily notice job (no purge job) and the command; notice event through the notification registry, once per year and stage.
- Purge order respects `PROTECT` (payroll lines before runs, evidence before assignments); audited; idempotent.
- Closed-year lock stays (`ClosedYear` row is never deleted), so purged years still refuse writes.

## Phase 4 - Backup/restore (same PR as Phase 3, plus a check per phase)
- `ArchivePurge` added to the backup coverage guard and the restore classification tests.
- A restore of a pre-purge backup resurrects rows: the next retention run purges them again (idempotent); documented.
- `SNAPSHOT_ROOT` listed as critical in `docs/site-backup-and-restore.md` and the runbook.
- `year_close` stays in `EXCLUDED_APPS`, `ArchivePurge` is the one exception to decide and test.

## Phase 5 - Leader moves
Admin response lists a departing leader's open flags, PIPs and absences; no re-owning (team-lifecycle rule stands).

## Docs and workflow (each phase)
`docs/workflow-invariants.md` (items 74+; item 34 updated: evidence is purgeable after 3 years), `docs/team-lifecycle.md`,
`docs/hbpr-and-scorecard.md`, `docs/payroll.md`, `docs/site-backup-and-restore.md`, runbook cron/notice entry,
`CLAUDE.md` Hot Invariants and Task Router keywords, `AGENTS.md` log.

## Test points
Bundle sets and December blocker; purge refuses without file/hash/notice; dry run changes nothing; second run is a no-op;
payroll/OT/standby purge leaves no orphan and no PROTECT error; leave balances unchanged; superuser-only on every route;
restore round-trip with `ArchivePurge`; notice sent once. Full suites once per phase.
