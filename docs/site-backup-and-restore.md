# Site backup and restore

Two separate backup tiers exist. Pick by goal, not by convenience.

| | Infrastructure DR (`db-backup` profile) | Application plugin (`plugins/site_backup`) |
|---|---|---|
| Captures | `pg_dump -Fc` of every table and sequence, `media_files` tar, `snapshot_files` tar | Django `dumpdata` JSON + media, zipped with a `manifest.json` |
| Two-factor secrets | Included (needs the same `MFA_ENCRYPTION_KEYS`) | **Excluded** (`users.usermfa`, `users.mfabackupcode`) |
| Sessions, year-close snapshots | Included | **Excluded** (`sessions`, `year_close`) |
| Restore | `pg_restore` (runbook 4.1-4.3) | Superuser UI (preview-first, per-model) or `restore_site_backup` |
| Use for | Server moves, disaster recovery | Selective rollback, staging seed, clean-install data import |

A whole-server move uses the left column: `docs/deploy/server-migration-checklist.md`.

## How the plugin works

- `create_backup` streams `dumpdata` (plain PKs, no natural keys) and the media tree into one ZIP. `manifest.json` carries `migration_state_hash`, the SHA-256 of every applied migration.
- Restore is blocked unless the target's hash equals the manifest's. There is deliberately no override: run the commit the backup was taken from, apply its migrations, restore, then upgrade.
- `dependent_closure` forces in every model that references an approved model; `topological_save_order` writes parents first. Rows missing from the backup are deleted only for models listed in `delete_missing_models`.
- The whole database write runs in one transaction; media is extracted last with a zip-slip guard and a 4 GiB cap.
- **PostgreSQL sequences are reset at the end of `commit()`** (`_reset_sequences`, the same call `loaddata` makes). Saving explicit PKs does not advance them, so without it the first insert after a restore fails with a duplicate key.
- Superuser-only (`SuperuserOnlyMixin`); restores are audit-logged.

## Headless restore (new server, clean install)

1. Clone at the backup's commit, configure `.env`, start the stack. `RUN_MIGRATIONS=1` creates the schema.
2. Copy the archive onto the host (or into the backend container), then:

```bash
python manage.py restore_site_backup backup.zip --all --restore-media --yes
```

Options: `--models a.b,c.d` instead of `--all`; `--delete-missing` removes rows absent from the backup for the restored models; without `--yes` it prints the per-model summary and asks. No web session or HTTP upload is involved, so proxy `client_max_body_size` and the gunicorn timeout do not apply to large archives.

3. Re-enrol two-factor for users who need it (`reset_user_mfa`); the archive never contained it.

## Caveats

- `--delete-missing` on `auth.user` can remove the superuser you are signed in as when restoring through the UI. The CLI has no session, so use it for provisioning.
- `auth.permission` rows carry `content_type_id` and `contenttypes` is not in the archive. Restoring onto a database migrated from the same commit yields the same IDs in practice; if a restore reports a foreign-key error on permissions, compare the two `django_content_type` tables first.
- An archive does not contain `year_close` snapshots. Carry the `snapshot_files` volume separately (checklist section 1).
