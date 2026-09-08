/**
 * Scrape design screenshots for every page visible to each role.
 *
 * Usage (from frontend/):
 *   node scripts/scrape-screenshots.mjs [--role=employee,tl,hr,tl_hr,admin] [--theme=dark,light] [--smoke=true] [--paths=overtime-logs,payroll]
 *
 * --paths filters canonical routes by substring (matched against both the
 * template and resolved path) for cheap targeted re-runs; composes with
 * --role/--theme and always merges (never wipes output).
 *
 * --smoke=true REQUIRES --role and captures only the first manifest route
 * per requested role (desktop + dark only, merge mode, never wipes output).
 * Full runs (no filters) wipe and regenerate design-screenshots/.
 *
 * Prerequisites:
 *   - Django backend running on http://127.0.0.1:8000
 *   - Vite dev server running on http://127.0.0.1:5173
 *   - Playwright browsers installed (npx playwright install chromium)
 *
 * Output:
 *   ../design-screenshots/
 *     desktop/<role>-<PageLabel>.jpg       ← light mode, 1280×800
 *     mobile/<role>-<PageLabel>.jpg        ← light mode, 375×812
 *     desktop-dark/<role>-<PageLabel>.jpg  ← dark mode, 1280×800
 *     mobile-dark/<role>-<PageLabel>.jpg   ← dark mode, 375×812
 *     manifest.json   (extended rows: {file, role, path, label, viewport,
 *       theme, resolvedPath, heading, sha256, overflow, consoleErrors,
 *       failedRequests, valid, error?})
 *
 * Route coverage is canonical: frontend/scripts/visual-route-manifest.mjs.
 * Sidebar discovery runs only as a diagnostic diff (extra/missing links are
 * logged, never added to coverage). Before every screenshot the script
 * asserts final pathname + expected h1/heading + theme class; login,
 * denial, redirect, loader, and wrong-heading states are recorded INVALID
 * and never captured. Role identities are the deterministic seed_e2e_data
 * fixtures (e2e_employee_a, e2e_tl, e2e_hr, e2e_tl_hr, e2e_admin).
 *
 * AUTH STRATEGY: The backend uses ROTATE_REFRESH_TOKENS + BLACKLIST_AFTER_ROTATION,
 * and the anon throttle (100/hour) can be exhausted by repeated login
 * attempts. To avoid both issues:
 *   1. JWT tokens are generated directly via `manage.py shell` (no HTTP
 *      request to the throttled login endpoint).
 *   2. The refresh endpoint is intercepted by Playwright's route mock —
 *      the AuthContext's initial refreshToken() call gets a pre-generated
 *      access token without hitting the backend.
 *   3. After the initial page load, SPA navigation (pushState + popstate)
 *      preserves the in-memory access token across all page visits.
 *   4. Viewport switches use page.setViewportSize() (no reload).
 */
import { chromium } from "playwright";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { writeFileSync, unlinkSync, existsSync } from "node:fs";
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
  sha256File,
  readOverflow,
  dismissToasts,
  createCollectors,
  resolveDynamicFixtures,
  resolveRouteEntries,
} from "./visual-capture-helpers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const OUT_ROOT = path.join(REPO_ROOT, "design-screenshots");
const DESKTOP_DIR = path.join(OUT_ROOT, "desktop");
const MOBILE_DIR = path.join(OUT_ROOT, "mobile");
const DESKTOP_DARK_DIR = path.join(OUT_ROOT, "desktop-dark");
const MOBILE_DARK_DIR = path.join(OUT_ROOT, "mobile-dark");

const BASE = process.env.BASE_URL || "http://127.0.0.1:5173";
const API_BASE = "http://127.0.0.1:8000/api";
const API_HEALTH = "http://127.0.0.1:8000/api/health/live/";

const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: MANIFEST_VIEWPORTS.mobile.width, height: MANIFEST_VIEWPORTS.mobile.height },
};

const THEMES = {
  light: { colorScheme: "light", outDirs: { desktop: DESKTOP_DIR, mobile: MOBILE_DIR } },
  dark: { colorScheme: "dark", outDirs: { desktop: DESKTOP_DARK_DIR, mobile: MOBILE_DARK_DIR } },
};

// Canonical role identities: deterministic seed_e2e_data fixtures only.
// (Removed Phase 2: historical local accounts admin/enri.demnushi/elencio.mukaj.)
const ROLE_AUTH = Object.fromEntries(
  Object.entries(ROLE_FIXTURES)
    .filter(([, f]) => f !== null)
    .map(([role, f]) => [role, { username: f.username }])
);

/**
 * Canonical visual routes for a role: manifest entries with dynamic
 * `:param` routes resolved via shared fixtures (see resolveRouteEntries).
 * Unresolvable dynamics log NO FIXTURE and are skipped, never fabricated.
 */
function canonicalRoleRoutes(role, fixtures = {}) {
  return resolveRouteEntries(routesForRole(role), fixtures, (r) =>
    console.log(`  - SKIP dynamic ${r.path} (NO FIXTURE: ${r.dynamicFixture})`)
  );
}

/**
 * Sidebar discovery is DIAGNOSTIC ONLY: diff discovered links against the
 * canonical manifest and report drift. It never expands coverage.
 */
function logDiscoveryDiff(role, discovered, routes) {
  const canonical = new Set(routes.map((r) => r.path));
  const extra = [...discovered.keys()].filter((p) => !canonical.has(p));
  const missing = [...canonical].filter((p) => !discovered.has(p));
  if (extra.length > 0) console.log(`  sidebar-only (not in manifest): ${extra.join(", ")}`);
  if (missing.length > 0) console.log(`  manifest-only (not in sidebar): ${missing.join(", ")}`);
}

function sanitizeLabel(label) {
  return (
    String(label)
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "page"
  );
}

async function checkServers() {
  const checks = [
    ["frontend", BASE],
    ["backend", API_HEALTH],
  ];
  for (const [name, url] of checks) {
    try {
      const res = await fetchUrl(url, 5000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      console.log(`  ${name}: reachable (${res.status})`);
    } catch (e) {
      console.error(
        `\nERROR: ${name} server not reachable at ${url} (${e.message}).\n` +
          `Start both servers before running this script:\n` +
          `  backend:  python manage.py runserver 127.0.0.1:8000 --noreload\n` +
          `  frontend: npm run dev -- --host 127.0.0.1\n`
      );
      process.exit(1);
    }
  }
}

async function fetchUrl(url, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Generate JWT tokens + user objects for all roles via `manage.py shell`.
 * This bypasses the throttled login endpoint entirely — no HTTP request
 * is made to /api/auth/token/. The output is JSON: { username: { access,
 * refresh, user } }.
 */
function generateTokens() {
  // Deterministic seed_e2e_data fixtures (Phase 2: no historical accounts).
  const usernames = Object.values(ROLE_AUTH).map((r) => r.username);
  // Python script that generates JWT tokens directly (no HTTP request
  // to the throttled login endpoint). Written to a temp file and run
  // with `manage.py shell < file` to avoid interactive-mode prompt
  // corruption on Windows.
  const shellScript = `
import json
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken
from core.mixins.permissions import is_cr_admin

User = get_user_model()
results = {}
for username in ${JSON.stringify(usernames)}:
    try:
        user = User.objects.get(username=username)
    except User.DoesNotExist:
        continue
    refresh = RefreshToken.for_user(user)
    profile = getattr(user, 'profile', None)
    user_data = {
        'id': user.id,
        'username': user.username,
        'email': user.email,
        'first_name': user.first_name,
        'last_name': user.last_name,
        'is_staff': user.is_staff,
        'is_superuser': user.is_superuser,
    }
    if profile is not None:
        user_data['albanian_tl_id'] = getattr(profile, 'albanian_tl_id', None)
        user_data['italian_tl_id'] = getattr(profile, 'italian_tl_id', None)
        user_data['is_italian_tl_role'] = bool(getattr(profile, 'is_italian_tl', False))
        user_data['is_albanian_tl_role'] = bool(getattr(profile, 'is_albanian_tl', False))
        user_data['is_team_leader'] = bool(getattr(profile, 'is_team_leader', False))
        user_data['is_hr'] = bool(getattr(profile, 'is_hr', False))
        hire_date = getattr(profile, 'hire_date', None)
        user_data['hire_date'] = str(hire_date) if hire_date else None
        primary_team = getattr(profile, 'team', None)
        if primary_team is not None:
            user_data['team'] = {
                'id': primary_team.id,
                'name': primary_team.name,
                'code': primary_team.code,
                'calendar_group': primary_team.calendar_group,
            }
        user_data['teams'] = [
            {'id': t.id, 'name': t.name, 'code': t.code, 'calendar_group': t.calendar_group}
            for t in profile.teams.all()
        ]
        user_data['techs'] = [
            {'id': t.id, 'name': t.name, 'code': t.code}
            for t in profile.techs.filter(is_active=True).order_by('name')
        ]
        user_data['client_ids'] = list(profile.clients.values_list('id', flat=True))
        user_data['roles'] = sorted(getattr(profile, 'role_codes', []) or [])
    user_data['is_cr_admin'] = is_cr_admin(user)
    try:
        from plugins.control_room.services.scope_service import get_access_for_user
        user_data['has_control_room_access'] = bool(get_access_for_user(user))
    except Exception:
        user_data['has_control_room_access'] = False
    results[username] = {
        'access': str(refresh.access_token),
        'refresh': str(refresh),
        'user': user_data,
    }
print('===TOKENS_JSON_START===')
print(json.dumps(results))
print('===TOKENS_JSON_END===')
`;
  console.log("  generating JWT tokens via Django shell...");
  const tmpFile = path.join(OUT_ROOT, ".gen_tokens.py");
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
    if (start === -1 || end === -1) {
      throw new Error(
        "Failed to parse token output.\nOutput (last 800 chars):\n" + output.slice(-800)
      );
    }
    const json = output.slice(start + "===TOKENS_JSON_START===".length, end).trim();
    const parsed = JSON.parse(json);
    if (Object.keys(parsed).length === 0) {
      throw new Error("Token generation returned 0 users. Check that users exist.");
    }
    return parsed;
  } finally {
    if (existsSync(tmpFile)) unlinkSync(tmpFile);
  }
}

/**
 * Create a Playwright context pre-authenticated with the given tokens.
 * - Sets the refresh_token cookie (for any real refresh attempts)
 * - Injects localStorage("user") + localStorage("theme") via init script
 * - Sets colorScheme so prefers-color-scheme matches the theme
 * - Intercepts the refresh endpoint to return the pre-generated access
 *   token (avoids hitting the throttled backend refresh endpoint)
 */
async function createAuthContext(browser, viewport, tokens, theme = "light") {
  const ctx = await browser.newContext({ viewport, colorScheme: theme });

  // Set refresh token cookie — same path the backend uses
  await ctx.addCookies([
    {
      name: "refresh_token",
      value: tokens.refresh,
      domain: "127.0.0.1",
      path: "/api/auth/token/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  // Inject localStorage before any page script runs.
  // "user" is the AuthContext persist signal; "theme" forces light/dark
  // so ThemeProvider resolves to the correct class on first render.
  await ctx.addInitScript(
    ({ userObj, themeName }) => {
      localStorage.setItem("user", JSON.stringify(userObj));
      if (themeName === "dark") {
        localStorage.setItem("theme", "dark");
      } else {
        localStorage.setItem("theme", "light");
      }
    },
    { userObj: tokens.user, themeName: theme }
  );

  // Intercept the refresh endpoint — return the pre-generated access token
  // so the AuthContext initializer never hits the throttled backend.
  await ctx.route("**/api/auth/token/refresh/", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ access: tokens.access }),
    });
  });

  return ctx;
}

/**
 * Initial page load with fallback wait strategy. networkidle can time
 * out on long-polling connections; fall back to domcontentloaded.
 */
async function page_goto(page, url) {
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  } catch {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  }
}

/**
 * SPA-navigate to a path without a full page reload. Preserves the
 * in-memory access token across navigations.
 */
async function spaNavigate(page, path) {
  await page.evaluate((p) => {
    window.history.pushState({}, "", p);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
  await page.waitForURL((url) => url.pathname === path, { timeout: 10_000 }).catch(() => {});
}

/**
 * Discover sidebar nav links via SPA navigation.
 */
async function discoverRoutes(page, role) {
  const routes = new Map();
  const entries = role === "admin" ? ["/admin", "/dashboard"] : ["/dashboard"];
  for (const entry of entries) {
    await spaNavigate(page, entry);
    await page.waitForSelector("nav a[href]", { timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(800);
    const links = await page
      .$$eval("nav a[href]", (els) =>
        els
          .map((a) => ({
            href: a.getAttribute("href"),
            text: (a.textContent || "").trim(),
          }))
          .filter((l) => l.href && !l.href.startsWith("http") && !l.href.startsWith("#"))
      )
      .catch(() => []);
    for (const l of links) {
      if (!routes.has(l.href)) routes.set(l.href, l.text || l.href);
    }
  }
  return routes;
}

async function capturePage(
  page,
  route,
  outDir,
  role,
  viewportName,
  themeName,
  manifest,
  usedNames,
  collectors
) {
  const label = sanitizeLabel(route.label);
  let filename = `${role}-${label}.jpg`;
  while (usedNames.has(filename)) {
    const counter = (filename.match(/-(\d+)\.jpg$/)?.[1] || 1) + 1;
    filename = `${role}-${label}-${counter}.jpg`;
  }
  usedNames.add(filename);
  const filepath = path.join(outDir, filename);
  const bucket = collectors.begin();

  try {
    await spaNavigate(page, route.path);
  } catch (e) {
    console.warn(
      `  ! [${role}/${viewportName}/${themeName}] nav failed ${route.path}: ${e.message}`
    );
    manifest.files.push({
      file: null,
      role,
      path: route.requestedPath || route.path,
      label: route.label,
      viewport: viewportName,
      theme: themeName,
      resolvedPath: null,
      heading: null,
      sha256: null,
      overflow: null,
      consoleErrors: bucket.consoleErrors,
      failedRequests: bucket.failedRequests,
      valid: false,
      error: `nav failed: ${e.message}`,
    });
    return;
  }
  await page.waitForTimeout(1500);

  // Gate: final pathname + expected heading + theme class. Login, denial,
  // redirect, loader, and wrong-heading states are INVALID, never captured.
  const gate = await assertRouteReady(page, route, themeName);
  if (!gate.ok) {
    console.warn(
      `  ! [${role}/${viewportName}/${themeName}] INVALID ${route.path}: ${gate.reason}`
    );
    manifest.files.push({
      file: null,
      role,
      path: route.requestedPath || route.path,
      label: route.label,
      viewport: viewportName,
      theme: themeName,
      resolvedPath: gate.finalPath,
      heading: gate.heading,
      sha256: null,
      overflow: null,
      consoleErrors: bucket.consoleErrors,
      failedRequests: bucket.failedRequests,
      valid: false,
      error: gate.reason,
    });
    return;
  }

  // Toast hygiene: error toasts from a PREVIOUS failing route survive SPA
  // navigation and would contaminate this capture (its errors belong to the
  // other route's manifest row).
  await dismissToasts(page);

  await page.screenshot({
    path: filepath,
    type: "jpeg",
    quality: 80,
    fullPage: true,
  });
  const rel = path.relative(OUT_ROOT, filepath).replace(/\\/g, "/");
  const sha256 = sha256File(filepath);
  const overflow = await readOverflow(page);
  // Validity includes evidence cleanliness (final-consistency rule 4): a
  // valid row must have no console errors and no unapproved failed requests.
  // A route whose data fetch 403s (e.g. superuser-only admin_logs for the
  // staff-only e2e_admin fixture) is FIXTURE-BLOCKED, never a valid capture.
  // Exception: expected-denial variants (manifest `expectedDenial`) render
  // their denial UI precisely BECAUSE the scoped data calls 403 — that is
  // the documented page state, so the 403 noise does not invalidate.
  const denialExpected = Array.isArray(route.expectedDenial) && route.expectedDenial.includes(role);
  const clean =
    denialExpected || (bucket.consoleErrors.length === 0 && bucket.failedRequests.length === 0);
  manifest.files.push({
    file: rel,
    role,
    path: route.requestedPath || route.path,
    label: route.label,
    viewport: viewportName,
    theme: themeName,
    resolvedPath: gate.finalPath,
    heading: gate.heading,
    sha256,
    overflow,
    consoleErrors: bucket.consoleErrors,
    failedRequests: bucket.failedRequests,
    valid: clean,
    ...(clean ? {} : { error: "failed requests/console errors during capture" }),
  });
  if (clean) {
    console.log(
      `  + [${role}/${viewportName}/${themeName}] ${rel}  (${route.path}) sha:${sha256.slice(0, 12)} overflow:${overflow}`
    );
  } else {
    console.warn(
      `  ! [${role}/${viewportName}/${themeName}] INVALID ${route.path}: ${bucket.failedRequests.length} failed request(s), ${bucket.consoleErrors.length} console error(s)`
    );
  }
}

// --- CLI filtering: --role=tl,hr --theme=dark (comma-separated, optional) ---
// --smoke=true REQUIRES --role: first manifest route per role, desktop+dark
// only, always merge mode (never wipes output).
const cliArgs = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([\w-]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), "true"];
  })
);
const roleFilter = cliArgs.role
  ? new Set(
      cliArgs.role
        .split(",")
        .map((r) => r.trim())
        .filter(Boolean)
    )
  : null;
const themeFilter = cliArgs.theme
  ? new Set(
      cliArgs.theme
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    )
  : null;
const smokeMode = cliArgs.smoke === "true" || cliArgs.smoke === true;
if (smokeMode && !roleFilter) {
  console.error(
    "ERROR: --smoke=true requires --role=<role[,role...]> (refuses full-matrix smoke)."
  );
  process.exit(1);
}
// Throttle-aware targeted re-runs: only routes whose template OR resolved
// path contains one of these substrings.
const pathFilter = cliArgs.paths
  ? cliArgs.paths
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  : null;
const matchesPaths = (route) =>
  !pathFilter ||
  pathFilter.some((s) => route.path.includes(s) || (route.requestedPath || "").includes(s));
for (const r of roleFilter || []) {
  if (!ROLE_AUTH[r]) {
    console.error(`ERROR: unknown --role=${r}. Valid: ${Object.keys(ROLE_AUTH).join(",")}.`);
    process.exit(1);
  }
}
const isFilteredRun = Boolean(roleFilter || themeFilter || smokeMode || pathFilter);

async function run() {
  console.log("design-screenshot scraper");
  if (roleFilter) console.log(`  role filter: ${[...roleFilter].join(", ")}`);
  if (themeFilter) console.log(`  theme filter: ${[...themeFilter].join(", ")}`);
  console.log();
  await checkServers();

  // Generate JWT tokens for all roles (bypasses throttled login endpoint)
  const allTokens = generateTokens();

  // Read-only dynamic fixtures (first IDs; no writes). Logged once here.
  const fixtures = resolveDynamicFixtures(OUT_ROOT);
  console.log(`  dynamic fixtures: ${JSON.stringify(fixtures)}`);

  const roleEntries = Object.entries(ROLE_AUTH).filter(
    ([role]) => !roleFilter || roleFilter.has(role)
  );
  const themesToRun = Object.entries(THEMES).filter(
    ([theme]) => !themeFilter || themeFilter.has(theme)
  );

  // Wipe output only on a full run; filtered runs merge into existing output.
  if (!isFilteredRun) {
    await rm(OUT_ROOT, { recursive: true, force: true });
  }
  // Ensure all needed dirs exist (for both full and filtered runs)
  const allDirs = [DESKTOP_DIR, MOBILE_DIR, DESKTOP_DARK_DIR, MOBILE_DARK_DIR];
  for (const d of allDirs) await mkdir(d, { recursive: true });

  // Load existing manifest if merging, else start fresh
  let manifest = { generatedAt: new Date().toISOString(), files: [] };
  let previousFiles = [];
  if (isFilteredRun) {
    try {
      const existing = await import("node:fs/promises").then((m) =>
        m.readFile(path.join(OUT_ROOT, "manifest.json"), "utf-8")
      );
      const parsed = JSON.parse(existing);
      previousFiles = parsed.files || [];
    } catch {
      // no existing manifest — start fresh
    }
  }

  const browser = await chromium.launch({ headless: true });

  for (const [role, cfg] of roleEntries) {
    const tokens = allTokens[cfg.username];
    if (!tokens) {
      console.error(`  ! no token generated for ${role} (${cfg.username}) — skipping`);
      continue;
    }
    console.log(`\n== ${role} (${cfg.username}) ==`);

    // Canonical routes from the manifest. Sidebar discovery runs once per
    // role as a DIAGNOSTIC diff only — it never changes coverage.
    const routes = canonicalRoleRoutes(role, fixtures);
    const roleRoutes = (smokeMode ? routes.slice(0, 1) : routes).filter(matchesPaths);
    if (roleRoutes.length === 0) {
      console.log(`  (no routes match --paths filter — skipping role)`);
      continue;
    }
    if (smokeMode) console.log(`  smoke: first route only -> ${roleRoutes[0]?.path}`);
    const discCtx = await createAuthContext(browser, VIEWPORTS.desktop, tokens, "light");
    const discPage = await discCtx.newPage();
    await page_goto(discPage, `${BASE}/dashboard`);
    if (discPage.url().includes("/login")) {
      console.error(`  ! redirected to /login after initial load — skipping role`);
      await discCtx.close();
      continue;
    }
    await discPage.waitForTimeout(1500);
    logDiscoveryDiff(role, await discoverRoutes(discPage, role), routes);
    await discCtx.close();

    // Capture each theme × viewport combination. A fresh context per
    // theme ensures the ThemeProvider resolves correctly on first render
    // (localStorage + colorScheme are set at context creation time).
    // Smoke pins dark desktop regardless of --theme/--viewport input.
    const themesEff = smokeMode ? themesToRun.filter(([t]) => t === "dark") : themesToRun;
    const viewportsEff = smokeMode ? [["desktop", VIEWPORTS.desktop]] : Object.entries(VIEWPORTS);
    for (const [themeName, themeCfg] of themesEff) {
      const ctx = await createAuthContext(browser, VIEWPORTS.desktop, tokens, themeName);
      const page = await ctx.newPage();
      const collectors = createCollectors();
      collectors.attach(page);
      await page_goto(page, `${BASE}/dashboard`);
      if (page.url().includes("/login")) {
        console.error(`  ! redirected to /login [${themeName}] — skipping theme`);
        await ctx.close();
        continue;
      }
      await page.waitForTimeout(1500);

      for (const [vname, vp] of viewportsEff) {
        const outDir = themeCfg.outDirs[vname];
        await page.setViewportSize(vp);
        await page.waitForTimeout(500);
        const usedNames = new Set();
        for (const route of roleRoutes) {
          await capturePage(
            page,
            route,
            outDir,
            role,
            vname,
            themeName,
            manifest,
            usedNames,
            collectors
          );
        }
      }
      await ctx.close();
    }
  }

  await browser.close();

  // Merge: keep previous rows whose (role, theme, viewport, path) was NOT
  // re-captured this run. A failed/skipped role pass or a narrow --paths
  // filter must never silently drop previously valid evidence.
  const capturedKeys = new Set(
    manifest.files.map((f) => `${f.role}|${f.theme}|${f.viewport}|${f.path}`)
  );
  let keptPrev = 0;
  for (const prev of previousFiles) {
    const key = `${prev.role}|${prev.theme}|${prev.viewport}|${prev.path}`;
    if (!capturedKeys.has(key)) {
      manifest.files.push(prev);
      keptPrev++;
    }
  }
  if (isFilteredRun && keptPrev > 0) {
    console.log(`  merged: kept ${keptPrev} previous manifest row(s) not re-captured`);
  }

  await writeFile(path.join(OUT_ROOT, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(
    `\nDone. ${manifest.files.length} screenshots in ` +
      `${path.relative(REPO_ROOT, OUT_ROOT)}/ ` +
      `(desktop, mobile, desktop-dark, mobile-dark). ` +
      `Manifest at ${path.relative(REPO_ROOT, OUT_ROOT)}/manifest.json`
  );
}

run().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
