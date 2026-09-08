// Pre-render all SPA pages with Playwright (intercepting the refresh endpoint)
// and save full HTML snapshots for designlang to analyze.
// Output: design-audit/prerendered/<role>/<page-slug>.html
import { chromium } from "playwright";
import { writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROLE_FIXTURES, routesForRole } from "./visual-route-manifest.mjs";
import { assertRouteReady, resolveDynamicFixtures, resolveRouteEntries } from "./visual-capture-helpers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const OUT_ROOT = path.join(REPO_ROOT, "design-audit", "prerendered");
const BASE = "http://127.0.0.1:5173";

// Canonical roles: deterministic seed_e2e_data fixtures (Phase 2 — no
// historical accounts, no copied route arrays; routes come from
// visual-route-manifest.mjs via routesForRole()).
const ROLE_AUTH = Object.fromEntries(
  Object.entries(ROLE_FIXTURES)
    .filter(([, f]) => f !== null)
    .map(([role, f]) => [role, { username: f.username }])
);

// Generate JWT tokens via Django
function generateTokens() {
  const usernames = Object.values(ROLE_AUTH).map((r) => r.username);
  const pyScript = `
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
        results[username] = None; continue
    refresh = RefreshToken.for_user(user)
    profile = getattr(user, 'profile', None)
    user_data = {'id': user.id, 'username': user.username, 'email': user.email,
        'first_name': user.first_name, 'last_name': user.last_name,
        'is_staff': user.is_staff, 'is_superuser': user.is_superuser}
    if profile:
        user_data['albanian_tl_id'] = getattr(profile, 'albanian_tl_id', None)
        user_data['italian_tl_id'] = getattr(profile, 'italian_tl_id', None)
        user_data['is_italian_tl_role'] = bool(getattr(profile, 'is_italian_tl', False))
        user_data['is_albanian_tl_role'] = bool(getattr(profile, 'is_albanian_tl', False))
        user_data['is_team_leader'] = bool(getattr(profile, 'is_team_leader', False))
        user_data['is_hr'] = bool(getattr(profile, 'is_hr', False))
        hire_date = getattr(profile, 'hire_date', None)
        user_data['hire_date'] = str(hire_date) if hire_date else None
        primary_team = getattr(profile, 'team', None)
        if primary_team:
            user_data['team'] = {'id': primary_team.id, 'name': primary_team.name,
                'code': primary_team.code, 'calendar_group': primary_team.calendar_group}
        user_data['teams'] = [{'id': t.id, 'name': t.name, 'code': t.code,
            'calendar_group': t.calendar_group} for t in profile.teams.all()]
        user_data['techs'] = [{'id': t.id, 'name': t.name, 'code': t.code}
            for t in profile.techs.filter(is_active=True).order_by('name')]
        user_data['client_ids'] = list(profile.clients.values_list('id', flat=True))
        user_data['roles'] = sorted(getattr(profile, 'role_codes', []) or [])
    from core.mixins.permissions import is_cr_admin
    user_data['is_cr_admin'] = is_cr_admin(user)
    try:
        from plugins.control_room.services.scope_service import get_access_for_user
        user_data['has_control_room_access'] = bool(get_access_for_user(user))
    except Exception:
        user_data['has_control_room_access'] = False
    results[username] = {'access': str(refresh.access_token),
        'refresh': str(refresh), 'user': user_data}
print(json.dumps(results))
`;
  const tmpPy = path.join(REPO_ROOT, "design-audit", ".gen_tokens_prerender.py");
  writeFileSync(tmpPy, pyScript, "utf-8");
  try {
    const out = execSync(`python "${tmpPy}"`, {
      cwd: REPO_ROOT, encoding: "utf-8", timeout: 30_000,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PYTHONPATH: REPO_ROOT },
    });
    const jsonLine = out.trim().split("\n").filter((l) => l.trim().startsWith("{")).pop();
    if (!jsonLine) throw new Error("No JSON in token output");
    return JSON.parse(jsonLine);
  } finally {
    if (existsSync(tmpPy)) rmSync(tmpPy, { force: true });
  }
}

async function createAuthContext(browser, tokens) {
  const ctx = await browser.newContext({
    colorScheme: "dark",
    viewport: { width: 1280, height: 800 },
  });
  // Set the refresh token cookie for the API origin
  await ctx.addCookies([{
    name: "refresh_token",
    value: tokens.refresh,
    domain: "127.0.0.1",
    path: "/",
    httpOnly: true,
    secure: false,
    sameSite: "Lax",
  }]);
  // Intercept the refresh endpoint to return the pre-generated access token
  await ctx.route("**/api/auth/token/refresh/", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ access: tokens.access, refresh: tokens.refresh }),
    });
  });
  // Set localStorage before page loads
  await ctx.addInitScript((userJson) => {
    localStorage.setItem("user", userJson);
    localStorage.setItem("theme", "dark");
  }, JSON.stringify(tokens.user));
  return ctx;
}

async function page_goto(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
}

async function run() {
  console.log("prerendering SPA pages for designlang\n");

  // Check servers
  try {
    execSync(`powershell -Command "(Invoke-WebRequest -Uri '${BASE}' -UseBasicParsing -TimeoutSec 3).StatusCode"`,
      { timeout: 8000, stdio: ["pipe", "pipe", "pipe"] });
  } catch {
    console.error("ERROR: frontend not reachable at", BASE);
    process.exit(1);
  }

  const allTokens = generateTokens();
  if (existsSync(OUT_ROOT)) rmSync(OUT_ROOT, { recursive: true, force: true });
  mkdirSync(OUT_ROOT, { recursive: true });

  // Read-only dynamic fixtures shared with the scraper (no writes).
  const fixtures = resolveDynamicFixtures(OUT_ROOT);
  console.log(`dynamic fixtures: ${JSON.stringify(fixtures)}\n`);

  const browser = await chromium.launch({ headless: true });
  let total = 0, ok = 0;

  for (const [role, cfg] of Object.entries(ROLE_AUTH)) {
    const tokens = allTokens[cfg.username];
    if (!tokens) { console.error(`  ! no tokens for ${role}`); continue; }

    const roleDir = path.join(OUT_ROOT, role);
    mkdirSync(roleDir, { recursive: true });
    // Canonical manifest routes; dynamic `:param` routes resolve via
    // shared read-only fixtures (template kept in requestedPath for the
    // gate log; unresolvable ones SKIP as NO FIXTURE, never fabricated).
    const roleRoutes = resolveRouteEntries(routesForRole(role), fixtures, (r) =>
      console.log(`  - SKIP dynamic ${r.path} (NO FIXTURE: ${r.dynamicFixture})`)
    );
    console.log(`\n== ${role} (${roleRoutes.length} pages) ==`);

    // Create one context per role (auth is shared across pages)
    const ctx = await createAuthContext(browser, tokens);
    const page = await ctx.newPage();

    // Initial load to bootstrap auth
    await page_goto(page, `${BASE}/dashboard`);
    if (page.url().includes("/login")) {
      console.error(`  ! redirected to /login — auth failed for ${role}`);
      await ctx.close();
      continue;
    }
    // Wait for auth bootstrap + initial data fetch
    await page.waitForTimeout(3000);

    for (const route of roleRoutes) {
      total++;
      try {
        // SPA navigation via pushState (no full reload)
        await page.evaluate((p) => {
          window.history.pushState({}, "", p);
          window.dispatchEvent(new PopStateEvent("popstate"));
        }, route.path);
        // Bounded data-settle wait (replaces the old fixed 3s assumption
        // as a success signal — the gate below is the authority).
        await page.waitForTimeout(3000);
        // Gate: final pathname + expected heading + dark theme class.
        // Login, denial, redirect, loader, and wrong-heading states are
        // INVALID — no HTML is emitted for them, ever.
        const gate = await assertRouteReady(page, route, "dark");
        if (!gate.ok) {
          console.error(`  ✗ ${route.label} — INVALID: ${gate.reason} (no HTML written)`);
          continue;
        }
        // Save full rendered HTML — strip Vite dev scripts so the page
        // is static and doesn't try to reconnect to the Vite WebSocket.
        let html = await page.content();
        html = html
          // Remove Vite client and React Refresh scripts
          .replace(/<script[^>]*src="\/@vite\/client"[^>]*><\/script>/g, "")
          .replace(/<script[^>]*>@react-refresh[^>]*>[\s\S]*?<\/script>/g, "")
          .replace(/<script[^>]*>\s*import\s*\{[^}]*injectIntoGlobalHook[\s\S]*?<\/script>/g, "")
          // Remove module scripts that would re-init the SPA
          .replace(/<script[^>]*type="module"[^>]*src="\/src\/[^"]*"[^>]*><\/script>/g, "");
        const outFile = path.join(roleDir, `${route.label}.html`);
        writeFileSync(outFile, html, "utf-8");
        ok++;
        console.log(`  ✓ ${route.label}  (${html.length.toLocaleString()} bytes)`);
      } catch (err) {
        console.error(`  ✗ ${route.label} — ${err.message?.slice(0, 100)}`);
      }
    }
    await ctx.close();
  }

  await browser.close();
  console.log(`\nDone. ${ok}/${total} pages prerendered to ${path.relative(REPO_ROOT, OUT_ROOT)}/`);
}

run().catch((e) => { console.error("Fatal:", e); process.exit(1); });
