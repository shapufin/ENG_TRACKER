# cryptography upgrade and a green main before production

## Primary goal

The pip-audit "Security scan" passes and a production build ships a patched `cryptography`, without any user losing MFA access or any browser losing push notifications, and CI is trustworthy enough to gate the release.

## Facts (verified 2026-10-29)

- Pin: `requirements.txt:35` `cryptography==47.0.0`. CI runs `pip-audit -r requirements*.txt --strict` (`.github/workflows/ci.yml:419`, `security-weekly.yml`).
- Findings against 47.0.0: PYSEC-2026-3552 / CVE-2026-69247 (PKCS#7 EnvelopedData decrypt oracle, fixed 50.0.0), PYSEC-2026-3553 / CVE-2026-69249 (X.509 path-building blow-up, fixed 49.0.0), PYSEC-2026-3554 / CVE-2026-69248 (wildcard DNS name check, fixed 49.0.0), GHSA-537c-gmf6-5ccf (OpenSSL bundled in the wheels, fixed 48.0.1). **Minimum fixed version is 50.0.0; latest is 50.0.2** (released 2026-09-30, older than two weeks).
- Real exposure is low: the app uses only Fernet (`core/utils/crypto.py`, MFA seeds, `MultiFernet` over `MFA_ENCRYPTION_KEYS`) and EC key serialization (`plugins/notifications/vapid_utils.py`). Neither PKCS#7 nor X.509 verification is used. The bundled-OpenSSL finding still justifies upgrading.
- Dependants: `pywebpush==2.5.0`, `py-vapid==1.9.4`, `http-ece` require `cryptography` with no upper pin; `pip install --dry-run cryptography==50.0.2` resolved cleanly. PyJWT does not depend on it.
- Compatibility evidence: in a throwaway venv with `cryptography==50.0.2`, a Fernet token **encrypted under 47.0.0 decrypted correctly**, a 47.0.0-generated EC PEM loaded through `py_vapid.Vapid.from_file`, and `pywebpush` imported. So existing MFA ciphertexts and VAPID keys survive the bump.
- Python 3.12 (CI and `Dockerfile` builder) and 3.14 (dev) both have wheels.

## Phase 0: Branch and scope

**How this serves the primary goal:** keeps a one-line security bump reviewable and revertable on its own.

- New branch off `main`: `fix/cryptography-50`. Do not stack on `fix/hr-isolation` (PR #192).
- Only `requirements.txt` changes, plus the comment above the pin. No code change is expected.

## Phase 1: Bump and local proof (TDD-style: tests first, then pin)

**How this serves the primary goal:** proves MFA and push still work on the new library before CI does.

1. Change the pin to `cryptography==50.0.2`. Update nothing else unless the resolver demands it (`pip install -r requirements.txt -r requirements-production.txt -r requirements-dev.txt` in a clean venv; then `pip check`).
2. Run with `py -3.14` after installing the new pin: `manage.py test apps.users.tests_app.test_mfa_service apps.users.tests_app.test_mfa_auth apps.users.tests_app.test_mfa_admin_and_commands plugins.notifications`.
3. Add one regression test in `apps/users/tests_app/test_mfa_service.py`: a hard-coded Fernet key plus a **hard-coded ciphertext produced under 47.0.0** must decrypt through `core.utils.crypto.decrypt_text`. This pins cross-version compatibility so a future bump cannot silently orphan MFA seeds. Generate the fixture with the current 47.0.0 env before changing the pin.
4. `py -3.14 manage.py check` and `makemigrations --check`.

Anti-patterns: do not regenerate or rotate `MFA_ENCRYPTION_KEYS`; do not change `requirements.txt` to a range or `>=`; do not touch the `pywebpush`/`py-vapid` pins.

## Phase 2: CI, image and audit

**How this serves the primary goal:** the artifacts that actually ship are scanned, not just the source tree.

- Push; require the PR's `Security scan` (pip-audit `--strict`), `Backend`, `Backend image smoke`, `Docker build`, `Image scan (Trivy)` green. `pip-audit` must report no findings for `cryptography`; if another package appears, list it and decide separately (do not widen this PR).
- Verify the built image: `docker run --rm <image> python -c "import cryptography;print(cryptography.__version__)"` prints `50.0.2`.

## Phase 3: Green main (blocks a trustworthy production push)

**How this serves the primary goal:** a release gate that is already red on `main` proves nothing about this change.

`main` (65fc9f1) already fails `Backend (PostgreSQL 16)`, `Frontend`, `E2E (Playwright)` and `Security scan`. Treat each as its own small PR; none is caused by cryptography except Security scan.

1. **Backend (PostgreSQL 16)**: identical 13 errors on `main` and on PR #192: 9 in `plugins.onboarding.test_export_api` (DownloadTests), 3 in `plugins.onboarding.test_archived_access`, 1 in `apps.users.tests_app.test_mfa_auth` (`test_regenerate_backup_codes_needs_password_and_code`). Log signature: `psycopg2.InterfaceError: connection already closed` and "Failed to record core audit log ... An error occurred in the current transaction" (a PG transaction aborted by an earlier statement; SQLite hides this). Reproduce locally against PostgreSQL 16 with only those modules, find the first failing statement (the audit-log write after a failed query inside `atomic`), fix the test/fixture or the code path. Backend on SQLite is green, so this is PG-specific.
2. **Frontend**: on this PR it was Prettier on changed files (fixed in 45f5458). On `main`, read the failing step first; it may be `npm audit --audit-level=high` or lint. Fix per its log.
3. **E2E (Playwright)**: still pending on PR #192; read the `main` failure first. Run locally against the isolated e2e backend (`config.settings_e2e`, throttling off), not a dev server.

## Phase 4: Production rollout

**How this serves the primary goal:** the new dependency reaches production with a tested way back.

- Merge order: cryptography PR first (small), then PR #192, each after its checks are green.
- Before deploy: `db-backup` per `docs/deploy/production-runbook.md`; confirm `MFA_ENCRYPTION_KEYS` is present in the production env (the key must not live next to a DB backup).
- After deploy: log in with an MFA-enrolled account (TOTP code accepted); send a test push to a subscribed browser; `GET /api/health/ready/` is 200; check the logs for `SecretDecryptError`.
- Rollback: redeploy the previous image tag. Fernet ciphertext written by 50.x is the same format, so no data migration is needed either way.

## Not now

Bumping other dependencies · rotating MFA or VAPID keys · changing pip-audit to ignore advisories · refactoring `core/utils/crypto.py`.
