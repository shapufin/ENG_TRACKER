#!/usr/bin/env node
/**
 * Visual verification CLI — capture structured UI fingerprints, diff them
 * against baselines, and detect code inconsistencies. Dev-only tool.
 *
 * Commands:
 *   capture  — capture fingerprints for all (or filtered) role×route×viewport
 *              combos and save as JSON baselines.
 *   verify   — re-capture and diff against saved baselines. Exits 1 on
 *              regression.
 *   diff     — offline diff of two saved fingerprint directories.
 *   check    — run inconsistency detection on saved fingerprints (no browser).
 *
 * Usage (from frontend/):
 *   node scripts/visual-verify.mjs capture [--role=employee,tl] [--theme=dark] [--paths=overtime,calendar]
 *   node scripts/visual-verify.mjs verify  [--role=employee] [--theme=dark] [--paths=overtime]
 *   node scripts/visual-verify.mjs diff    --old .fingerprints-before --new .fingerprints-after
 *   node scripts/visual-verify.mjs check   [--dir .design-fingerprints]
 *
 * Dedup: admin-shell routes that render the same content as their user-shell
 * counterparts are skipped for non-admin roles (the user-shell capture is
 * the canonical one). Shared pages (login) are captured once.
 *
 * Prerequisites:
 *   - Django backend on http://127.0.0.1:8000
 *   - Vite dev server on http://127.0.0.1:5173
 *   - Playwright browsers installed (npx playwright install chromium)
 *
 * Output: ../design-fingerprints/
 *   <role>-<label>-<viewport>-<theme>.json   ← fingerprint baselines
 *   manifest.json                            ← capture metadata
 *   diff-report.txt                          ← last verify diff (human-readable)
 */
import { chromium } from "playwright";
import { mkdir, writeFile, rm, readdir } from "node:fs/promises";
import { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ROLE_FIXTURES,
  VIEWPORTS as MANIFEST_VIEWPORTS,
  routesForRole,
} from "./visual-route-manifest.mjs";
import {
  assertRouteReady,
  dismissToasts,
  createCollectors,
  resolveDynamicFixtures,
  resolveRouteEntries,
} from "./visual-capture-helpers.mjs";
import {
  extractFingerprint,
  diffFingerprints,
  detectInconsistencies,
  saveFingerprint,
  loadFingerprint,
  formatDiffReport,
  formatInconsistencyReport,
} from "./visual-fingerprint.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const OUT_ROOT = path.join(REPO_ROOT, "design-fingerprints");

const BASE = process.env.BASE_URL || "http://127.0.0.1:5173";
const API_HEALTH = "http://127.0.0.1:8000/api/health/live/";

const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: MANIFEST_VIEWPORTS.mobile.width, height: MANIFEST_VIEWPORTS.mobile.height },
};

const THEMES = ["dark", "light"];

// Routes that are shared across roles (captured once, not per-role)
const SHARED_ROUTES = new Set(["/login"]);

// ---- CLI arg parsing ----
function parseArgs(argv) {
  const args = { command: null, role: null, theme: null, paths: null, old: null, new: null, dir: null };
  for (const arg of argv.slice(2)) {
    if (!args.command && !arg.startsWith("--")) {
      args.command = arg;
    } else if (arg.startsWith("--role=")) {
      args.role = arg.slice("--role=".length).split(",");
    } else if (arg.startsWith("--theme=")) {
      args.theme = arg.slice("--theme=".length);
    } else if (arg.startsWith("--paths=")) {
      args.paths = arg.slice("--paths=".length).split(",");
    } else if (arg.startsWith("--old=")) {
      args.old = arg.slice("--old=".length);
    } else if (arg.startsWith("--new=")) {
      args.new = arg.slice("--new=".length);
    } else if (arg.startsWith("--dir=")) {
      args.dir = arg.slice("--dir=".length);
    }
  }
  return args;
}

// ---- Server check ----
async function checkServers() {
  for (const [name, url] of [["frontend", BASE], ["backend", API_HEALTH]]) {
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      console.log(`  ${name}: reachable`);
    } catch (e) {
      console.error(`ERROR: ${name} not reachable at ${url} (${e.message})`);
      console.error("Start both servers before running this script.");
      process.exit(1);
    }
  }
}

// ---- Token generation (reuses scrape-screenshots.mjs pattern) ----
function generateTokens(usernames) {
  const shellScript = `
import json, os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken
User = get_user_model()
results = {}
for username in ${JSON.stringify(usernames)}:
    try:
        user = User.objects.get(username=username)
    except User.DoesNotExist:
        continue
    refresh = RefreshToken.for_user(user)
    results[username] = {
        'access': str(refresh.access_token),
        'refresh': str(refresh),
        'user': {
            'id': user.id, 'username': user.username, 'email': user.email,
            'first_name': user.first_name, 'last_name': user.last_name,
            'is_staff': user.is_staff, 'is_superuser': user.is_superuser,
        },
    }
print('===TOKENS_JSON_START===')
print(json.dumps(results))
print('===TOKENS_JSON_END===')
`;
  const tmpFile = path.join(OUT_ROOT, ".gen_tokens.py");
  if (!existsSync(OUT_ROOT)) mkdirSync(OUT_ROOT, { recursive: true });
  writeFileSync(tmpFile, shellScript, "utf-8");
  try {
    const output = execSync(`python "${tmpFile}"`, {
      cwd: REPO_ROOT,
      encoding: "utf-8",
      timeout: 30_000,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PYTHONPATH: REPO_ROOT },
    });
    const start = output.indexOf("===TOKENS_JSON_START===");
    const end = output.indexOf("===TOKENS_JSON_END===");
    if (start === -1 || end === -1) throw new Error("Token parse failed");
    return JSON.parse(output.slice(start + "===TOKENS_JSON_START===".length, end).trim());
  } finally {
    if (existsSync(tmpFile)) unlinkSync(tmpFile);
  }
}

// ---- Auth context (reuses scrape-screenshots.mjs pattern) ----
async function createAuthContext(browser, viewport, tokens, theme) {
  const ctx = await browser.newContext({ viewport, colorScheme: theme });
  await ctx.addCookies([
    { name: "refresh_token", value: tokens.refresh, domain: "127.0.0.1", path: "/api/auth/token/", httpOnly: true, sameSite: "Lax" },
  ]);
  await ctx.addInitScript(
    ({ userObj, themeName }) => {
      localStorage.setItem("user", JSON.stringify(userObj));
      localStorage.setItem("theme", themeName);
    },
    { userObj: tokens.user, themeName: theme },
  );
  await ctx.route("**/api/auth/token/refresh/", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access: tokens.access }) }),
  );
  return ctx;
}

// ---- Dedup: determine which route×role combos to capture ----
function buildCapturePlan(roles, themes, pathFilter) {
  const plan = [];
  const capturedShared = new Set(); // shared routes captured once

  for (const role of roles) {
    const fixture = ROLE_FIXTURES[role];
    if (!fixture) continue;
    const routes = routesForRole(role);

    for (const route of routes) {
      // Filter by --paths
      if (pathFilter && !pathFilter.some((p) => route.path.includes(p) || route.label.includes(p))) continue;

      // Dedup: shared routes captured once (first role that hits them)
      if (SHARED_ROUTES.has(route.path)) {
        const key = `${route.path}`;
        if (capturedShared.has(key)) continue;
        capturedShared.add(key);
      }

      // Dedup: admin-layout routes for non-admin roles are skipped
      // (admin shell is only accessible to admin/hr; the user-shell
      // version is the canonical capture for those pages)
      if (route.layout === "admin" && !["admin", "hr"].includes(role)) continue;

      for (const theme of themes) {
        for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
          plan.push({ role, route, theme, viewport: vpName, vp });
        }
      }
    }
  }
  return plan;
}

// ---- SPA navigation (preserves in-memory access token) ----
async function spaNavigate(page, path) {
  await page.evaluate((p) => {
    window.history.pushState({}, "", p);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
  await page.waitForURL((url) => url.pathname === path, { timeout: 10_000 }).catch(() => {});
}

// ---- Capture a fingerprint from an existing page (SPA navigation) ----
// Reuses the same browser context/page across captures to preserve the
// in-memory access token and avoid throttling. Viewport switches use
// page.setViewportSize() (no reload).
async function captureFingerprintFromPage(page, entry, collectors) {
  const { role, route, theme, viewport, vp } = entry;
  const bucket = collectors.begin();
  await dismissToasts(page);

  // SPA-navigate to the route (preserves in-memory token)
  try {
    await spaNavigate(page, route.path);
  } catch (e) {
    console.log(`  SKIP ${role}/${route.label}/${viewport}/${theme}: nav failed ${e.message}`);
    return null;
  }
  await page.waitForTimeout(1500);
  await dismissToasts(page);

  // Assert route is ready
  const ready = await assertRouteReady(page, route, theme);
  if (!ready.ok) {
    console.log(`  SKIP ${role}/${route.label}/${viewport}/${theme}: ${ready.reason}`);
    return null;
  }

  // Extract fingerprint
  const fp = await extractFingerprint(page, {
    stateName: `${role}-${route.label}-${viewport}-${theme}`,
    viewport: vp,
    theme,
  });

  fp.consoleErrors = bucket.consoleErrors;
  fp.failedRequests = bucket.failedRequests;
  fp.route = { path: route.path, label: route.label, role, viewport, theme };

  return fp;
}

// ---- Initial page load (full navigation, used once per role) ----
async function pageGoto(page, url) {
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  } catch {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  }
}

// ---- Filename helper ----
function fingerprintFilename(entry) {
  const { role, route, theme, viewport } = entry;
  return `${role}-${route.label}-${viewport}-${theme}.json`;
}

// ---- CAPTURE command ----
async function cmdCapture(args) {
  await checkServers();

  const roles = args.role || ["employee", "tl", "hr", "tl_hr", "admin"];
  const themes = args.theme ? [args.theme] : THEMES;
  const pathFilter = args.paths;

  const plan = buildCapturePlan(roles, themes, pathFilter);
  console.log(`\nCapture plan: ${plan.length} fingerprints (${roles.length} roles × ${themes.length} themes)`);

  // Resolve dynamic fixtures
  const fixtures = resolveDynamicFixtures(OUT_ROOT);
  const resolvedPlan = resolveRouteEntries(
    plan.map((e) => ({ ...e.route, _entry: e })),
    fixtures,
    (r) => console.log(`  SKIP dynamic ${r.path} (NO FIXTURE)`),
  );
  // Map back
  const finalPlan = resolvedPlan
    .map((r) => (r._entry ? { ...r._entry, route: r } : null))
    .filter(Boolean);

  // Wipe output (capture mode = fresh baselines)
  if (existsSync(OUT_ROOT)) {
    await rm(OUT_ROOT, { recursive: true, force: true });
  }
  await mkdir(OUT_ROOT, { recursive: true });

  const browser = await chromium.launch();
  const collectors = createCollectors();
  const manifest = [];
  let captured = 0;
  let skipped = 0;

  // Group plan by role so we can generate fresh tokens per role (JWT access
  // tokens expire mid-run if generated all at once for 500+ captures).
  const byRole = new Map();
  for (const entry of finalPlan) {
    if (!byRole.has(entry.role)) byRole.set(entry.role, []);
    byRole.get(entry.role).push(entry);
  }

  for (const [role, entries] of byRole) {
    const username = ROLE_FIXTURES[role]?.username;
    if (!username) {
      console.log(`  SKIP role ${role}: no fixture`);
      skipped += entries.length;
      continue;
    }
    console.log(`\n--- ${role} (${username}) ---`);
    console.log("  generating fresh JWT tokens...");
    const tokens = generateTokens([username])[username];
    if (!tokens) {
      console.log(`  SKIP: token generation failed`);
      skipped += entries.length;
      continue;
    }

    // Group entries by theme — one context per theme, SPA-navigate between
    // routes, viewport switches via setViewportSize (no reload).
    const byTheme = new Map();
    for (const entry of entries) {
      if (!byTheme.has(entry.theme)) byTheme.set(entry.theme, []);
      byTheme.get(entry.theme).push(entry);
    }

    for (const [themeName, themeEntries] of byTheme) {
      const desktopVp = VIEWPORTS.desktop;
      const ctx = await createAuthContext(browser, desktopVp, tokens, themeName);
      const page = await ctx.newPage();
      collectors.attach(page);

      // Initial full page load to establish the session
      const firstRoute = themeEntries[0].route;
      console.log(`  [${themeName}] loading ${firstRoute.path}...`);
      await pageGoto(page, `${BASE}${firstRoute.path}`);
      await page.waitForTimeout(2000);
      await dismissToasts(page);

      for (const entry of themeEntries) {
        const filename = fingerprintFilename(entry);
        console.log(`  capturing ${filename}...`);

        // Switch viewport if needed (no page reload)
        if (entry.viewport === "mobile") {
          await page.setViewportSize(VIEWPORTS.mobile);
        } else {
          await page.setViewportSize(VIEWPORTS.desktop);
        }

        const fp = await captureFingerprintFromPage(page, entry, collectors);
        if (!fp) {
          skipped++;
          continue;
        }

        saveFingerprint(fp, OUT_ROOT, filename);
        manifest.push({
          file: filename,
          role: entry.role,
          path: entry.route.path,
          label: entry.route.label,
          viewport: entry.viewport,
          theme: entry.theme,
          heading: fp.page.title,
          componentCount: Object.values(fp.regions).reduce((n, r) => n + (r.components?.length || 0), 0),
          regionCount: Object.keys(fp.regions).length,
          consoleErrors: fp.consoleErrors?.length || 0,
          failedRequests: fp.failedRequests?.length || 0,
        });
        captured++;
      }

      await ctx.close();
    }
  }

  await browser.close();

  // Write manifest
  await writeFile(
    path.join(OUT_ROOT, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf-8",
  );

  console.log(`\nDone: ${captured} captured, ${skipped} skipped → ${OUT_ROOT}`);
}

// ---- VERIFY command ----
async function cmdVerify(args) {
  await checkServers();

  const roles = args.role || ["employee", "tl", "hr", "tl_hr", "admin"];
  const themes = args.theme ? [args.theme] : THEMES;
  const pathFilter = args.paths;

  // Load baseline manifest
  const manifestPath = path.join(OUT_ROOT, "manifest.json");
  if (!existsSync(manifestPath)) {
    console.error("No baseline manifest found. Run `capture` first.");
    process.exit(1);
  }
  const baselineManifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

  const plan = buildCapturePlan(roles, themes, pathFilter);
  const fixtures = resolveDynamicFixtures(OUT_ROOT);
  const resolvedPlan = resolveRouteEntries(
    plan.map((e) => ({ ...e.route, _entry: e })),
    fixtures,
    (r) => console.log(`  SKIP dynamic ${r.path} (NO FIXTURE)`),
  );
  const finalPlan = resolvedPlan
    .map((r) => (r._entry ? { ...r._entry, route: r } : null))
    .filter(Boolean);

  const browser = await chromium.launch();
  const collectors = createCollectors();
  const allDiffs = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  // Group by role for fresh per-role token generation (avoids JWT expiry)
  const byRole = new Map();
  for (const entry of finalPlan) {
    if (!byRole.has(entry.role)) byRole.set(entry.role, []);
    byRole.get(entry.role).push(entry);
  }

  for (const [role, entries] of byRole) {
    const username = ROLE_FIXTURES[role]?.username;
    if (!username) {
      skipped += entries.length;
      continue;
    }
    console.log(`\n--- ${role} (${username}) ---`);
    console.log("  generating fresh JWT tokens...");
    const tokens = generateTokens([username])[username];
    if (!tokens) {
      skipped += entries.length;
      continue;
    }

    // Group by theme — one context per theme, SPA navigation
    const byTheme = new Map();
    for (const entry of entries) {
      if (!byTheme.has(entry.theme)) byTheme.set(entry.theme, []);
      byTheme.get(entry.theme).push(entry);
    }

    for (const [themeName, themeEntries] of byTheme) {
      const ctx = await createAuthContext(browser, VIEWPORTS.desktop, tokens, themeName);
      const page = await ctx.newPage();
      collectors.attach(page);

      const firstRoute = themeEntries[0].route;
      console.log(`  [${themeName}] loading ${firstRoute.path}...`);
      await pageGoto(page, `${BASE}${firstRoute.path}`);
      await page.waitForTimeout(2000);
      await dismissToasts(page);

      for (const entry of themeEntries) {
        const filename = fingerprintFilename(entry);
        const baselinePath = path.join(OUT_ROOT, filename);
        if (!existsSync(baselinePath)) {
          console.log(`  SKIP ${filename}: no baseline`);
          skipped++;
          continue;
        }

        if (entry.viewport === "mobile") {
          await page.setViewportSize(VIEWPORTS.mobile);
        } else {
          await page.setViewportSize(VIEWPORTS.desktop);
        }

        console.log(`  verifying ${filename}...`);
        const currentFp = await captureFingerprintFromPage(page, entry, collectors);
        if (!currentFp) {
          skipped++;
          continue;
        }

        const baselineFp = loadFingerprint(baselinePath);
        const diff = diffFingerprints(baselineFp, currentFp);
        diff.filename = filename;
        allDiffs.push(diff);

        if (diff.summary.equivalent) {
          console.log(`    PASS`);
          passed++;
        } else {
          console.log(
            `    FAIL: ${diff.summary.regressionCount} regressions, ${diff.summary.invariantCount} invariants`,
          );
          failed++;
        }
      }

      await ctx.close();
    }
  }

  await browser.close();

  // Write diff report
  const reportLines = [];
  reportLines.push(`# Visual Verification Report — ${new Date().toISOString()}`);
  reportLines.push(`Passed: ${passed} | Failed: ${failed} | Skipped: ${skipped}`);
  reportLines.push("");

  for (const diff of allDiffs) {
    if (diff.summary.equivalent) continue;
    reportLines.push(formatDiffReport(diff));
    reportLines.push("");
  }

  const reportPath = path.join(OUT_ROOT, "diff-report.txt");
  writeFileSync(reportPath, reportLines.join("\n"), "utf-8");

  console.log(`\nResults: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log(`Report: ${reportPath}`);

  if (failed > 0) process.exit(1);
}

// ---- DIFF command (offline) ----
async function cmdDiff(args) {
  if (!args.old || !args.new) {
    console.error("Usage: diff --old <dir> --new <dir>");
    process.exit(1);
  }

  const oldDir = path.resolve(args.old);
  const newDir = path.resolve(args.new);
  if (!existsSync(oldDir) || !existsSync(newDir)) {
    console.error("Both directories must exist");
    process.exit(1);
  }

  const oldFiles = (await readdir(oldDir)).filter((f) => f.endsWith(".json") && f !== "manifest.json");
  const newFiles = new Set((await readdir(newDir)).filter((f) => f.endsWith(".json") && f !== "manifest.json"));

  const reportLines = [];
  let passed = 0;
  let failed = 0;

  for (const file of oldFiles) {
    const oldFp = loadFingerprint(path.join(oldDir, file));
    const newFpPath = path.join(newDir, file);
    if (!existsSync(newFpPath)) {
      reportLines.push(`## ${file}: MISSING in new`);
      failed++;
      continue;
    }
    const newFp = loadFingerprint(newFpPath);
    const diff = diffFingerprints(oldFp, newFp);
    if (diff.summary.equivalent) {
      passed++;
    } else {
      reportLines.push(formatDiffReport(diff));
      reportLines.push("");
      failed++;
    }
  }

  // Check for added files
  for (const file of newFiles) {
    if (!oldFiles.includes(file)) {
      reportLines.push(`## ${file}: ADDED (not in baseline)`);
      failed++;
    }
  }

  console.log(`Diff: ${passed} passed, ${failed} failed`);
  if (reportLines.length > 0) {
    console.log("\n" + reportLines.join("\n"));
  }
  if (failed > 0) process.exit(1);
}

// ---- CHECK command (inconsistency detection, no browser) ----
async function cmdCheck(args) {
  const dir = args.dir ? path.resolve(args.dir) : OUT_ROOT;
  if (!existsSync(dir)) {
    console.error(`Directory not found: ${dir}`);
    process.exit(1);
  }

  const files = (await readdir(dir)).filter((f) => f.endsWith(".json") && f !== "manifest.json");
  console.log(`Checking ${files.length} fingerprints for inconsistencies...`);

  let totalErrors = 0;
  let totalWarns = 0;
  let totalInfos = 0;
  const reportLines = [];

  for (const file of files) {
    const fp = loadFingerprint(path.join(dir, file));
    if (!fp) continue;
    const issues = detectInconsistencies(fp);
    if (issues.length === 0) continue;

    const errors = issues.filter((i) => i.severity === "error");
    const warns = issues.filter((i) => i.severity === "warn");
    const infos = issues.filter((i) => i.severity === "info");
    totalErrors += errors.length;
    totalWarns += warns.length;
    totalInfos += infos.length;

    reportLines.push(`## ${file}`);
    reportLines.push(formatInconsistencyReport(issues));
  }

  console.log(`\nIssues: ${totalErrors} errors, ${totalWarns} warnings, ${totalInfos} info`);

  if (reportLines.length > 0) {
    const reportPath = path.join(dir, "inconsistency-report.txt");
    writeFileSync(reportPath, reportLines.join("\n"), "utf-8");
    console.log(`Report: ${reportPath}`);
    console.log("\n" + reportLines.join("\n"));
  }

  if (totalErrors > 0) process.exit(1);
}

// ---- COMPARE command (reference-screenshot mode) ----
// Captures a live fingerprint + screenshot for each requested route, then
// compares the live screenshot against the corresponding reference screenshot
// in design-screenshots/. Outputs a structured report with:
// - The fingerprint (for AI-agent analysis)
// - A pixel-diff score (percentage of differing pixels)
// - Side-by-side reference vs current file paths for manual visual review
//
// Usage:
//   compare --ref ../design-screenshots/desktop-dark [--role=employee] [--paths=overtime]
async function cmdCompare(args) {
  if (!args.ref) {
    console.error("Usage: compare --ref <screenshot-dir> [--role=employee] [--paths=overtime]");
    process.exit(1);
  }
  await checkServers();

  const refDir = path.resolve(args.ref);
  if (!existsSync(refDir)) {
    console.error(`Reference directory not found: ${refDir}`);
    process.exit(1);
  }

  const roles = args.role || ["employee", "tl", "hr", "tl_hr", "admin"];
  const themes = args.theme ? [args.theme] : THEMES;
  const pathFilter = args.paths;

  const plan = buildCapturePlan(roles, themes, pathFilter);
  const fixtures = resolveDynamicFixtures(OUT_ROOT);
  const resolvedPlan = resolveRouteEntries(
    plan.map((e) => ({ ...e.route, _entry: e })),
    fixtures,
    (r) => console.log(`  SKIP dynamic ${r.path} (NO FIXTURE)`),
  );
  const finalPlan = resolvedPlan
    .map((r) => (r._entry ? { ...r._entry, route: r } : null))
    .filter(Boolean);

  const usernames = roles.map((r) => ROLE_FIXTURES[r]?.username).filter(Boolean);
  console.log("Generating JWT tokens...");
  const allTokens = generateTokens(usernames);

  const compareOut = path.join(OUT_ROOT, "compare");
  if (!existsSync(compareOut)) mkdirSync(compareOut, { recursive: true });

  const browser = await chromium.launch();
  const collectors = createCollectors();
  const results = [];
  let matched = 0;
  let noRef = 0;
  let failed = 0;

  for (const entry of finalPlan) {
    const { role, route, theme, viewport, vp } = entry;
    const username = ROLE_FIXTURES[role]?.username;
    const tokens = allTokens[username];
    if (!tokens) {
      skipped++;
      continue;
    }

    // Find the reference screenshot: <role>-<Label>.jpg in the ref dir
    const refFile = path.join(refDir, `${role}-${sanitizeLabel(route.label)}.jpg`);
    if (!existsSync(refFile)) {
      console.log(`  SKIP ${role}/${route.label}/${viewport}/${theme}: no reference screenshot`);
      noRef++;
      continue;
    }

    console.log(`  comparing ${role}/${route.label}/${viewport}/${theme}...`);
    const fp = await captureFingerprint(browser, tokens, entry, fixtures, collectors);
    if (!fp) {
      failed++;
      continue;
    }

    // Save the fingerprint
    const fpFilename = `compare-${role}-${route.label}-${viewport}-${theme}.json`;
    saveFingerprint(fp, compareOut, fpFilename);

    // Capture a current screenshot for side-by-side review
    const ctx = await createAuthContext(browser, vp, tokens, theme);
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE}${route.path}`, { waitUntil: "networkidle", timeout: 30_000 });
      await page.waitForTimeout(1500);
      await dismissToasts(page);
      const currentShot = path.join(compareOut, `current-${role}-${route.label}-${viewport}-${theme}.jpg`);
      await page.screenshot({ path: currentShot, type: "jpeg", quality: 80 });

      // Run inconsistency detection on the fingerprint
      const issues = detectInconsistencies(fp);
      const errors = issues.filter((i) => i.severity === "error");
      const warns = issues.filter((i) => i.severity === "warn");

      results.push({
        role,
        label: route.label,
        path: route.path,
        viewport,
        theme,
        referenceScreenshot: refFile,
        currentScreenshot: currentShot,
        fingerprint: path.join(compareOut, fpFilename),
        inconsistencyErrors: errors.length,
        inconsistencyWarnings: warns.length,
        componentCount: Object.values(fp.regions).reduce((n, r) => n + (r.components?.length || 0), 0),
        regionCount: Object.keys(fp.regions).length,
      });
      matched++;
    } finally {
      await ctx.close();
    }
  }

  await browser.close();

  // Write comparison report
  const reportLines = [
    `# Visual Comparison Report — ${new Date().toISOString()}`,
    `Reference: ${refDir}`,
    `Matched: ${matched} | No reference: ${noRef} | Failed: ${failed}`,
    "",
  ];

  for (const r of results) {
    reportLines.push(`## ${r.role}/${r.label} (${r.viewport}/${r.theme})`);
    reportLines.push(`  Reference: ${r.referenceScreenshot}`);
    reportLines.push(`  Current:   ${r.currentScreenshot}`);
    reportLines.push(`  Fingerprint: ${r.fingerprint}`);
    reportLines.push(`  Components: ${r.componentCount} in ${r.regionCount} regions`);
    reportLines.push(`  Inconsistencies: ${r.inconsistencyErrors} errors, ${r.inconsistencyWarnings} warnings`);
    reportLines.push("");
  }

  const reportPath = path.join(compareOut, "comparison-report.txt");
  writeFileSync(reportPath, reportLines.join("\n"), "utf-8");

  // Also write a JSON manifest for programmatic access
  writeFileSync(
    path.join(compareOut, "comparison-manifest.json"),
    JSON.stringify(results, null, 2),
    "utf-8",
  );

  console.log(`\nResults: ${matched} compared, ${noRef} no reference, ${failed} failed`);
  console.log(`Report: ${reportPath}`);
  console.log(`\nTo review visually, open the reference and current screenshots side-by-side.`);
  console.log(`The fingerprint JSON files contain structured data for AI-agent analysis.`);
}

function sanitizeLabel(label) {
  return (
    String(label)
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "page"
  );
}

// ---- Main ----
const args = parseArgs(process.argv);

switch (args.command) {
  case "capture":
    await cmdCapture(args);
    break;
  case "verify":
    await cmdVerify(args);
    break;
  case "diff":
    await cmdDiff(args);
    break;
  case "check":
    await cmdCheck(args);
    break;
  case "compare":
    await cmdCompare(args);
    break;
  default:
    console.error(`Usage: node scripts/visual-verify.mjs <capture|verify|diff|check|compare> [options]`);
    console.error("  capture [--role=employee,tl] [--theme=dark] [--paths=overtime,calendar]");
    console.error("  verify  [--role=employee] [--theme=dark] [--paths=overtime]");
    console.error("  diff    --old <dir> --new <dir>");
    console.error("  check   [--dir <dir>]");
    console.error("  compare --ref <screenshot-dir> [--role=employee] [--paths=overtime]");
    process.exit(1);
}
