/**
 * Playwright global setup — seeds deterministic E2E test data before the
 * suite runs. Executes the Django management command `seed_e2e_data` which
 * is idempotent (safe to run repeatedly).
 */
import { execSync } from "child_process";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default async function globalSetup() {
  const projectRoot = resolve(__dirname, "..", "..");
  const managePy = resolve(projectRoot, "manage.py");
  // Never seed the dev DB: pin the e2e settings for every child process.
  const commandOptions = {
    stdio: "pipe" as const,
    cwd: projectRoot,
    env: { ...process.env, DJANGO_SETTINGS_MODULE: "config.settings_e2e" },
  };
  const settings = "--settings=config.settings_e2e";
  execSync(`python "${managePy}" migrate --noinput ${settings}`, commandOptions);
  execSync(`python "${managePy}" seed_e2e_data ${settings}`, commandOptions);
}
