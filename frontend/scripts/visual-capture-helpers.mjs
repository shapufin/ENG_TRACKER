// Shared assertions for visual capture tooling (scrape-screenshots.mjs,
// prerender-pages.mjs). Browser-agnostic: page functions take a Playwright
// `page` duck-type ({ url, locator, evaluate, on }). Pure helpers
// (headingMatches, extraction-safe checks) are unit-tested in
// visual-capture-helpers.test.mjs — no browser needed.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

// First non-empty h1; falls back to joined h2, then h3 texts (workspace
// prompts and EmptyState titles expose h2/h3, not h1). Never throws.
export async function readHeading(page) {
  try {
    const h1 = await page.locator("h1").first().textContent({ timeout: 3000 });
    if (h1 && h1.trim()) return h1.trim();
  } catch {
    /* fall through to h2/h3 scan */
  }
  for (const tag of ["h2", "h3"]) {
    try {
      const texts = await page.locator(tag).allTextContents({ timeout: 3000 });
      const text = texts
        .map((s) => s.trim())
        .filter(Boolean)
        .join(" | ");
      if (text) return text;
    } catch {
      /* try next tag */
    }
  }
  return null;
}

export function headingMatches(expected, actual) {
  if (actual == null) return false;
  const text = String(actual);
  return expected instanceof RegExp ? expected.test(text) : text.includes(expected);
}

export async function themeClassOk(page, themeName) {
  try {
    const hasDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    return themeName === "dark" ? hasDark === true : hasDark === false;
  } catch {
    return false;
  }
}

// Gate a capture/prerender write. Returns { ok, finalPath, heading, reason? }.
export async function assertRouteReady(page, route, themeName) {
  let finalPath = null;
  try {
    finalPath = new URL(page.url()).pathname;
  } catch {
    /* keep null */
  }
  if (finalPath === "/login") {
    // Landing on /login is CORRECT for the public login route itself
    // (LoginPage shows the form to authenticated visitors too — no
    // authed-redirect). Everywhere else it means auth failed.
    if (route.path === "/login") {
      const heading = await readHeading(page);
      if (!headingMatches(route.expectedHeading, heading)) {
        return {
          ok: false,
          finalPath,
          heading,
          reason: `heading mismatch (got ${JSON.stringify(heading)})`,
        };
      }
      return { ok: true, finalPath, heading };
    }
    return { ok: false, finalPath, heading: null, reason: "redirected to /login (auth failed)" };
  }
  if (finalPath !== route.path) {
    return {
      ok: false,
      finalPath,
      heading: null,
      reason: `final path ${finalPath} !== ${route.path}`,
    };
  }
  const heading = await readHeading(page);
  if (!headingMatches(route.expectedHeading, heading)) {
    return {
      ok: false,
      finalPath,
      heading,
      reason: `heading mismatch (got ${JSON.stringify(heading)})`,
    };
  }
  if (!(await themeClassOk(page, themeName))) {
    return { ok: false, finalPath, heading, reason: `theme class mismatch for ${themeName}` };
  }
  return { ok: true, finalPath, heading };
}

export function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

export async function readOverflow(page) {
  try {
    const { sw, cw } = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    }));
    return Math.max(0, sw - cw);
  } catch {
    return null;
  }
}

// Hide visible sonner toasts before a capture. Error toasts fired by the
// global QueryCache onError persist across SPA navigation, so a failing
// route (e.g. a 403 fixture-block) would otherwise photobomb the NEXT
// route's screenshot while that route's own manifest row stays clean.
// Implementation MUST NOT remove toast DOM nodes: sonner owns them via
// React, and removing them manually makes sonner's own expiry throw
// `removeChild ... not a child` which can break the whole React root and
// blank every later capture in the run. A stylesheet rule survives React
// re-renders and is idempotent per page.
export async function dismissToasts(page) {
  try {
    await page.evaluate(() => {
      const id = "__visual-hide-toasts";
      if (!document.getElementById(id)) {
        const style = document.createElement("style");
        style.id = id;
        style.textContent =
          "[data-sonner-toast], [data-sonner-toaster] { display: none !important; }";
        document.head.appendChild(style);
      }
    });
  } catch {
    /* best-effort hygiene — never fail a capture over toast cleanup */
  }
}

// Per-route console/network collectors. Attach once per page, swap the
// bucket per route via begin(). Handlers never throw into Playwright.
// failedRequests covers BOTH network failures and HTTP error statuses
// (requestfailed does not fire for HTTP 403/429 — the response listener
// does, with the URL that console text omits).
export function createCollectors() {
  const state = { current: null };
  const attach = (page) => {
    page.on("console", (msg) => {
      if (state.current && msg.type() === "error") {
        state.current.consoleErrors.push(msg.text().slice(0, 300));
      }
    });
    page.on("pageerror", (err) => {
      if (state.current) state.current.consoleErrors.push(String(err).slice(0, 300));
    });
    page.on("requestfailed", (req) => {
      if (!state.current) return;
      const reason = req.failure()?.errorText || "UNKNOWN";
      // Navigation aborts are not page defects: in-flight queries canceled
      // when the SPA routes away (React Query unmount cancellation) surface
      // here and would otherwise pollute the NEXT route's bucket.
      if (reason === "ERR_ABORTED" || reason === "ERR_INTERRUPTED") return;
      state.current.failedRequests.push(`${req.method()} ${req.url()} (${reason})`.slice(0, 300));
    });
    page.on("response", (res) => {
      if (state.current && res.status() >= 400) {
        try {
          state.current.failedRequests.push(
            `${res.request().method()} ${res.url()} -> ${res.status()}`.slice(0, 300)
          );
        } catch {
          /* ignore url access errors */
        }
      }
    });
  };
  const begin = () => {
    state.current = { consoleErrors: [], failedRequests: [] };
    return state.current;
  };
  return { attach, begin };
}

/**
 * Resolve dynamic-route fixtures read-only (first Group / PayrollRun /
 * OrgChart by id — no writes). Shared by scrape + prerender + extract so
 * all three resolve `:param` routes identically.
 * Returns { 'resource-group': id|null, 'payroll-run': id|null,
 * 'org-chart': id|null }. Out dir for the temp snippet: design-audit
 * (repo-root OUT varies per caller, so callers pass it).
 */
export function resolveDynamicFixtures(outDir) {
  const snippet = `
import json, os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()
out = {}
try:
    from apps.permissions.models.core import Group
    g = Group.objects.order_by('id').first()
    out['resource-group'] = g.id if g else None
except Exception:
    out['resource-group'] = None
try:
    from plugins.payroll.models import PayrollRun
    r = PayrollRun.objects.order_by('id').first()
    out['payroll-run'] = r.id if r else None
except Exception:
    out['payroll-run'] = None
try:
    from plugins.organigrama.models import OrgChart
    c = OrgChart.objects.order_by('id').first()
    out['org-chart'] = c.id if c else None
except Exception:
    out['org-chart'] = None
print(json.dumps(out))
`;
  const tmpFile = path.join(outDir, ".resolve_fixtures.py");
  writeFileSync(tmpFile, snippet, "utf-8");
  try {
    const output = execSync(`python "${tmpFile}"`, {
      cwd: REPO_ROOT,
      encoding: "utf-8",
      timeout: 30_000,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PYTHONPATH: REPO_ROOT },
    });
    const line = output
      .trim()
      .split("\n")
      .filter((l) => l.trim().startsWith("{"))
      .pop();
    return line ? JSON.parse(line) : {};
  } catch (e) {
    console.warn(`  ! dynamic fixture resolution failed: ${e.message?.slice(0, 120)}`);
    return {};
  } finally {
    if (existsSync(tmpFile)) unlinkSync(tmpFile);
  }
}

/**
 * Map manifest routes to concrete entries: static routes pass through;
 * dynamic routes resolve `:param` from fixtures (keeping the template in
 * `requestedPath`) or return null for NO FIXTURE skips. Shared by all
 * three utilities so skip/resolve behavior is identical.
 */
export function resolveRouteEntries(routes, fixtures, onSkip) {
  const entries = [];
  for (const r of routes) {
    if (!r.path.includes(":")) {
      entries.push(r);
      continue;
    }
    const id = (fixtures || {})[r.dynamicFixture];
    if (id == null) {
      onSkip?.(r);
      continue;
    }
    entries.push({
      ...r,
      requestedPath: r.path,
      path: r.path.replace(/:[^/]+/, String(id)),
      fixtureId: id,
    });
  }
  return entries;
}
