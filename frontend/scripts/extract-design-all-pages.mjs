// Run designlang extraction on every page for every role.
// Uses pre-generated storageState files for authentication.
// Outputs to design-audit/app-extract-pages/<role>/<page-slug>/
//
// --resume: skip page dirs that already contain a valid _meta.json (cheap
// resume after an interrupted run). Without it, previous output is wiped.
// Delete design-audit/app-extract-pages to force a full regeneration.
import { execSync } from "node:child_process";
import { mkdirSync, existsSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROLE_FIXTURES, routesForRole } from "./visual-route-manifest.mjs";
import { sha256File, resolveDynamicFixtures, resolveRouteEntries } from "./visual-capture-helpers.mjs";

const resumeMode = process.argv.some((a) => a === "--resume");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const BASE = "http://127.0.0.1:5173";
const OUT_ROOT = path.join(REPO_ROOT, "design-audit", "app-extract-pages");
const STORAGE_DIR = path.join(REPO_ROOT, "design-audit");

// Canonical routes come from visual-route-manifest.mjs (no third route
// list). designlang authenticates via storage-state cookie files generated
// by _gen-storage-state-all.mjs (all 5 deterministic fixtures); roles whose
// state file is absent SKIP explicitly with the regeneration command.
// Per-page `_meta.json` links role, requested route, source prerender HTML
// hash, and output dir (plan: extraction metadata).
const STORAGE = {
  admin: path.join(STORAGE_DIR, "storage-state-admin.json"),
  tl: path.join(STORAGE_DIR, "storage-state-tl.json"),
  employee: path.join(STORAGE_DIR, "storage-state-employee.json"),
  hr: path.join(STORAGE_DIR, "storage-state-hr.json"),
  tl_hr: path.join(STORAGE_DIR, "storage-state-tl_hr.json"),
};

// Check servers
function checkServers() {
  try {
    execSync(`curl -s -o /dev/null -w "%{http_code}" ${BASE}`, { timeout: 5000, stdio: ["pipe", "pipe", "pipe"] });
  } catch {
    try {
      execSync(`powershell -Command "(Invoke-WebRequest -Uri '${BASE}' -UseBasicParsing -TimeoutSec 3).StatusCode"`, { timeout: 8000, stdio: ["pipe", "pipe", "pipe"] });
    } catch {
      console.error("ERROR: frontend server not reachable at", BASE);
      process.exit(1);
    }
  }
}

checkServers();
console.log("servers reachable\n");

// Read-only dynamic fixtures shared with the scraper/prerenderer (no writes).
const fixtures = resolveDynamicFixtures(OUT_ROOT);
console.log(`dynamic fixtures: ${JSON.stringify(fixtures)}\n`);

// Clean previous output (skipped in --resume mode, which fills only gaps).
if (!resumeMode && existsSync(OUT_ROOT)) rmSync(OUT_ROOT, { recursive: true, force: true });
mkdirSync(OUT_ROOT, { recursive: true });

let total = 0;
let ok = 0;
let fail = 0;

for (const [role, fixture] of Object.entries(ROLE_FIXTURES)) {
  if (fixture === null) {
    console.log(`\n== ${role} — SKIP (NO FIXTURE: no deterministic identity) ==`);
    continue;
  }
  const storage = STORAGE[role];
  if (!storage || !existsSync(storage)) {
    console.log(`\n== ${role} — SKIP (no storage state; run node scripts/_gen-storage-state-all.mjs first) ==`);
    continue;
  }
  const roleDir = path.join(OUT_ROOT, role);
  mkdirSync(roleDir, { recursive: true });
  // Canonical manifest routes; dynamic `:param` routes resolve via
  // shared read-only fixtures (unresolvable ones SKIP as NO FIXTURE).
  const roleRoutes = resolveRouteEntries(routesForRole(role), fixtures, (r) =>
    console.log(`  - SKIP dynamic ${r.path} (NO FIXTURE: ${r.dynamicFixture})`)
  );
  console.log(`\n== ${role} (${roleRoutes.length} pages) ==`);

  for (const route of roleRoutes) {
    total++;
    const url = `${BASE}${route.path}`;
    // Preserve legacy dir naming: admin routes keep the manifest label
    // (already admin-prefixed); app routes are <role>-<stem>.
    const dirName = route.layout === "admin" ? route.label : `${role}-${route.label}`;
    const pageDir = path.join(roleDir, dirName);
    mkdirSync(pageDir, { recursive: true });
    // Resume: a present _meta.json + extracted files means this page is done.
    // (total++ already ran above; only ok++ here to keep the ratio honest.)
    if (resumeMode && existsSync(path.join(pageDir, "_meta.json"))) {
      try {
        if (readdirSync(pageDir).length > 1) {
          console.log(`  = ${dirName} (cached, skipping)`);
          ok++;
          continue;
        }
      } catch {
        /* fall through to extraction */
      }
    }
    // Link the validated prerender output (source HTML hash) when present.
    const prerenderFile = path.join(REPO_ROOT, "design-audit", "prerendered", role, `${route.label}.html`);
    let sourceHtmlHash = null;
    if (existsSync(prerenderFile)) {
      try {
        sourceHtmlHash = sha256File(prerenderFile);
      } catch {
        sourceHtmlHash = null;
      }
    } else {
      console.log(`  ~ ${dirName} — no prerendered HTML (hash null; rerun prerender-pages.mjs first)`);
    }

    const args = [
      "npx", "designlang", url,
      // --storage-state applies the FULL Playwright storageState (cookies +
      // localStorage). --cookie-file loads cookies only, which is useless for
      // this SPA: auth lives in localStorage (access_token + user), so every
      // page silently redirected to /login (the 2026-09-05 crawl bug).
      "--storage-state", `"${storage}"`,
      "--out", `"${pageDir}"`,
      "--name", dirName,
      "--wait", "2500",
      "--dark",
      "--no-prompts",       // skip prompt-pack (we have the whole-app one)
      "--no-design-md",     // skip DESIGN.md (we have the whole-app one)
      "--no-history",       // don't pollute designlang history
      "-q",                 // quiet: only file paths + errors
    ].join(" ");

    try {
      execSync(args, {
        cwd: __dirname,
        timeout: 60_000,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      ok++;
      console.log(`  ✓ ${dirName}  (${route.path})`);
    } catch (err) {
      fail++;
      // designlang often writes files then errors on a trailing step;
      // check if output was still produced
      const files = existsSync(pageDir);
      if (files) {
        ok++;
        fail--;
        console.log(`  ~ ${dirName}  (${route.path}) — files written, trailing error suppressed`);
      } else {
        console.error(`  ✗ ${dirName}  (${route.path}) — ${err.message?.slice(0, 120)}`);
      }
    }
    // Self-heal known designlang v12.21.0 serialization bugs in this page's
    // output (no-op when the package is patched; see designlang-sanitize.mjs).
    try {
      const { sanitizePageDir } = await import("./designlang-sanitize.mjs");
      sanitizePageDir(pageDir);
    } catch (e) {
      console.error(`  ! sanitizer failed for ${dirName}: ${e.message?.slice(0, 100)}`);
    }
    // Extraction metadata: role + requested route + resolved route +
    // source HTML hash + out dir.
    writeFileSync(
      path.join(pageDir, "_meta.json"),
      JSON.stringify(
        {
          role,
          path: route.requestedPath || route.path,
          resolvedPath: route.path,
          label: dirName,
          outDir: path.relative(REPO_ROOT, pageDir).replace(/\\/g, "/"),
          sourceHtmlHash,
          at: new Date().toISOString(),
        },
        null,
        2
      )
    );
  }
}

console.log(`\nDone. ${ok}/${total} pages extracted, ${fail} failed.`);
console.log(`Output: ${path.relative(REPO_ROOT, OUT_ROOT)}/<role>/<page>/`);
