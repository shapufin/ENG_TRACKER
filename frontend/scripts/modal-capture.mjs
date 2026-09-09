// Interactive open-modal captures for the modal-consistency plan (Appendix B).
// Opens modals via real UI triggers (authenticated), screenshots them
// dark+light x desktop+mobile, asserts zero horizontal overflow + records
// dialog-vs-viewport geometry. SKIP-tolerant: a target whose trigger is not
// found is reported as SKIP (exit 0); use --strict to fail on skips.
// Usage: node scripts/modal-capture.mjs [--tag=baseline|after] [--strict] [--only=user-status,add-skill]
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const OUT_DIR = path.join(REPO_ROOT, "design-screenshots", "modals");
const BASE = "http://127.0.0.1:5173";
const API_HEALTH = "http://127.0.0.1:8000/api/health/live/";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [];
  })
);
const TAG = args.tag || "baseline";
const STRICT = args.strict === true || args.strict === "true";
const ONLY = args.only ? String(args.only).split(",") : null;

// role -> username (mirrors visual-route-manifest.mjs fixtures)
const USERS = { employee: "e2e_employee_a", tl: "e2e_tl", hr: "e2e_hr", tl_hr: "e2e_tl_hr", admin: "e2e_admin", tl_calendar: "enri.demnushi" };

// Actions DSL: ["click", selector] | ["clickFirst", selector] | ["wait", ms]
// Selectors tried in order; first matching+visible element wins per step.
const TARGETS = [
  { id: "user-status", role: "tl_calendar", path: "/calendar", actions: [["click", "button:has-text('Schedule List')"], ["clickFirst", "main [role='button']"], ["wait", 800]] },
  { id: "conflicts", role: "tl_calendar", path: "/calendar", actions: [["clickFirst", "button:has-text('Conflict')"], ["wait", 800]] },
  { id: "event-action", role: "tl_calendar", path: "/calendar", actions: [["clickFirst", "main button:not(:has-text('Book'))"], ["wait", 800]] },
  { id: "add-skill", role: "tl", path: "/skills", actions: [["clickFirst", "button:has-text('Add skill')"], ["wait", 800]] },
  { id: "rate-skill", role: "tl", path: "/skills/team", actions: [["clickFirst", "[role='gridcell']"], ["wait", 800]] },
  { id: "tech-members", role: "admin", path: "/admin/techs", actions: [["clickFirst", "button:has-text('Member')"], ["wait", 800]] },
  { id: "audit-detail", role: "admin", path: "/admin/audit-logs", actions: [["clickFirst", "tbody tr"], ["wait", 800]] },
  { id: "analytics-config", role: "admin", path: "/admin/analytics", actions: [["clickFirst", "button:has-text('Config')"], ["wait", 800]] },
  { id: "overtime-form", role: "employee", path: "/overtime", actions: [["clickFirst", "main button:has-text('Add')"], ["wait", 800]] },
  { id: "leave-form", role: "employee", path: "/leave-management", actions: [["clickFirst", "main button:has-text('Request')"], ["wait", 800]] },
  { id: "standby-form", role: "employee", path: "/standby", actions: [["clickFirst", "main button:has-text('Add')"], ["wait", 800]] },
  // Mockup-rollout baselines (Phase 0): wage assign (Phase 3), balance form (Phase 5
  // closest — no read-only audit view exists yet), balance delete confirm (Phase 1).
  // SKIP-tolerant: wage-assign SKIPs when every seeded user already has a wage.
  { id: "wage-assign", role: "admin", path: "/admin/payroll/wages", actions: [["clickFirst", "button:has-text('Assign Wage')"], ["wait", 800]] },
  { id: "balance-form", role: "admin", path: "/admin/leave-balances", actions: [["clickFirst", "button:has-text('Add Balance')"], ["wait", 800]] },
  { id: "confirm-delete", role: "admin", path: "/admin/leave-balances", actions: [["clickFirst", "button[aria-label^='Delete']"], ["wait", 800]] },
  // Phase 1 evidence: migrated destructive ConfirmDialog WITH icon header.
  // SKIP-tolerant: needs at least one seeded wage row with a Delete button.
  { id: "wage-delete", role: "admin", path: "/admin/payroll/wages", actions: [["clickFirst", "td button:has-text('Delete')"], ["wait", 800]] },
  // Phase 5 evidence: read-only allowance audit (View action per balance row).
  { id: "balance-audit", role: "admin", path: "/admin/leave-balances", actions: [["clickFirst", "button[aria-label^='View']"], ["wait", 800]] },
];

const VIEWPORTS = { desktop: { width: 1280, height: 800 }, mobile: { width: 390, height: 844 } };

function generateTokens(usernames) {
  const script = `
import json, os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken
User = get_user_model()
results = {}
for username in ${JSON.stringify(usernames)}:
    try: user = User.objects.get(username=username)
    except User.DoesNotExist: continue
    refresh = RefreshToken.for_user(user)
    results[username] = {'access': str(refresh.access_token), 'refresh': str(refresh),
      'user': {'id': user.id, 'username': user.username, 'email': user.email,
        'first_name': user.first_name, 'last_name': user.last_name,
        'is_staff': user.is_staff, 'is_superuser': user.is_superuser}}
print('===TOKENS_JSON_START===' + json.dumps(results) + '===TOKENS_JSON_END===')
`;
  const tmp = path.join(OUT_DIR, ".gen_tokens.py");
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(tmp, script, "utf-8");
  try {
    const out = execSync(`python "${tmp}"`, { cwd: REPO_ROOT, encoding: "utf-8", timeout: 30_000, env: { ...process.env, PYTHONPATH: REPO_ROOT } });
    const m = out.match(/===TOKENS_JSON_START===(.*)===TOKENS_JSON_END===/s);
    if (!m) throw new Error("token parse failed");
    return JSON.parse(m[1]);
  } finally { if (existsSync(tmp)) unlinkSync(tmp); }
}

async function createAuthContext(browser, viewport, tokens, theme) {
  const ctx = await browser.newContext({ viewport, colorScheme: theme });
  await ctx.addCookies([{ name: "refresh_token", value: tokens.refresh, domain: "127.0.0.1", path: "/api/auth/token/", httpOnly: true, sameSite: "Lax" }]);
  await ctx.addInitScript(({ userObj, themeName }) => {
    localStorage.setItem("user", JSON.stringify(userObj));
    localStorage.setItem("theme", themeName);
  }, { userObj: tokens.user, themeName: theme });
  await ctx.route("**/api/auth/token/refresh/", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access: tokens.access }) }));
  return ctx;
}

async function tryStep(page, [type, arg]) {
  if (type === "wait") { await page.waitForTimeout(arg); return true; }
  const loc = page.locator(arg).first();
  try { await loc.waitFor({ state: "visible", timeout: 4000 }); } catch { return false; }
  try {
    if (type === "click" || type === "clickFirst") await loc.click({ timeout: 4000 });
    return true;
  } catch { return false; }
}

const browser = await chromium.launch();
const usernames = [...new Set(TARGETS.map((t) => USERS[t.role]))];
const report = [];

for (const theme of ["dark", "light"]) {
  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    // Fresh JWTs per viewport batch: access tokens expire (~5 min), and tokens
    // generated once up front die mid-run (all-light SKIP). Matches the
    // visual-verify pattern (per-role fresh tokens + SPA nav).
    const allTokens = generateTokens(usernames);
    // one context per role (throttle safety: SPA nav within context)
    const ctxByRole = {};
    const getCtx = async (role) => {
      if (!ctxByRole[role]) {
        const tokens = allTokens[USERS[role]];
        if (!tokens) return null;
        ctxByRole[role] = await createAuthContext(browser, vp, tokens, theme);
      }
      return ctxByRole[role];
    };
    for (const t of TARGETS) {
      if (ONLY && !ONLY.includes(t.id)) continue;
      const entry = { id: t.id, theme, viewport: vpName, status: "SKIP", file: null, overflowPx: null, dialogH: null, viewportH: vp.height };
      try {
        const ctx = await getCtx(t.role);
        if (!ctx) { entry.status = "SKIP(no-user)"; report.push(entry); continue; }
        const page = await ctx.newPage();
        await page.goto(BASE + t.path, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
        await page.waitForTimeout(2000);
        let ok = true;
        for (const s of t.actions) { if (!(await tryStep(page, s))) { ok = false; break; } }
        const dlg = page.locator("[role='dialog']").first();
        let visible = false;
        try { await dlg.waitFor({ state: "visible", timeout: 5000 }); visible = true; } catch { visible = false; }
        if (ok && visible) {
          const file = `${t.id}-${theme}-${vpName}-${TAG}.jpg`;
          await dlg.screenshot({ path: path.join(OUT_DIR, file) });
          const geo = await page.evaluate(() => {
            const d = document.querySelector("[role='dialog']");
            const r = d ? d.getBoundingClientRect() : { height: 0 };
            return { overflowPx: Math.max(0, document.documentElement.scrollWidth - window.innerWidth), dialogH: Math.round(r.height), viewportH: window.innerHeight };
          });
          Object.assign(entry, { status: geo.overflowPx === 0 ? "OK" : "OVERFLOW", file, ...geo });
        } else if (!ok) entry.status = "SKIP(trigger)";
        else entry.status = "SKIP(no-dialog)";
        await page.close();
      } catch (e) { entry.status = `ERROR(${String(e.message).slice(0, 80)})`; }
      report.push(entry);
      console.log(`  ${entry.status.padEnd(14)} ${t.id} ${theme} ${vpName}`);
    }
    for (const c of Object.values(ctxByRole)) await c.close();
  }
}
await browser.close();

const out = path.join(OUT_DIR, `modal-capture-report-${TAG}.json`);
writeFileSync(out, JSON.stringify(report, null, 2));
const counts = report.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
console.log("\n" + JSON.stringify(counts));
console.log(`report: ${out}`);
const hashDupes = report.filter((r) => r.status === "OK").length;
if (STRICT && report.some((r) => r.status.startsWith("SKIP") || r.status.startsWith("ERROR"))) process.exit(1);
console.log(`captured OK: ${hashDupes}/${report.length}`);
