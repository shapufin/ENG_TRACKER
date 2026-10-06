// TEMPORARY screenshot loop for the tables/buttons/dashboard-removal plan.
// Same JWT auth pattern as visual-verify.mjs. DELETE after the plan lands.
// Usage: node scripts/shot-tables.mjs --tag=tables1 [--only=hbpr] [--vp=v1280] [--theme=light]
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const OUT_ROOT = path.resolve(REPO_ROOT, "design-screenshots", "tables-plan");
const BASE = "http://127.0.0.1:5173";

const tag = (process.argv.find((a) => a.startsWith("--tag=")) || "--tag=shot").slice(6);
const onlyArg = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
const onlyVp = process.argv.find((a) => a.startsWith("--vp="))?.slice(5);
const onlyTheme = process.argv.find((a) => a.startsWith("--theme="))?.slice(8);

const TARGETS = [
  { user: "e2e_hbpr", url: "/hbpr?view=leaders", slug: "hbpr-leaders" },
  { user: "e2e_hbpr", url: "/hbpr", slug: "hbpr-overview" },
  { user: "e2e_tl_b", url: "/tl-scorecard?tab=records", slug: "tl-records" },
  { user: "e2e_admin", url: "/admin/hbpr-assignments", slug: "admin-hbpr" },
  // The HBPR home is the /hbpr workspace — /dashboard just redirects there.
  { user: "e2e_hbpr", url: "/dashboard", slug: "hbpr-home-redirect" },
];
const VIEWPORTS = {
  v320: { width: 320, height: 700 },
  v1280: { width: 1280, height: 900 },
};
const THEMES = ["light", "dark"];

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
      timeout: 60_000,
      env: { ...process.env, PYTHONPATH: REPO_ROOT },
    });
    const s = output.indexOf("===TOKENS_JSON_START===");
    const e = output.indexOf("===TOKENS_JSON_END===");
    return JSON.parse(output.slice(s + 24, e).trim());
  } finally {
    if (existsSync(tmpFile)) unlinkSync(tmpFile);
  }
}

const targets = onlyArg ? TARGETS.filter((t) => t.slug.includes(onlyArg)) : TARGETS;
const viewports = onlyVp ? { [onlyVp]: VIEWPORTS[onlyVp] } : VIEWPORTS;
const themes = onlyTheme ? [onlyTheme] : THEMES;
const tokens = generateTokens([...new Set(targets.map((t) => t.user))]);
const browser = await chromium.launch();
let ok = 0,
  fail = 0;
for (const theme of themes) {
  for (const [vpName, vp] of Object.entries(viewports)) {
    for (const t of targets) {
      const tok = tokens[t.user];
      if (!tok) {
        console.log(`SKIP ${t.slug}/${vpName}/${theme}: no token`);
        fail++;
        continue;
      }
      const ctx = await browser.newContext({ viewport: vp, colorScheme: theme });
      await ctx.addCookies([
        {
          name: "refresh_token",
          value: tok.refresh,
          domain: "127.0.0.1",
          path: "/api/auth/token/",
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      await ctx.addInitScript(
        ({ userObj, themeName }) => {
          localStorage.setItem("user", JSON.stringify(userObj));
          localStorage.setItem("theme", themeName);
        },
        { userObj: tok.user, themeName: theme }
      );
      await ctx.route("**/api/auth/token/refresh/", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ access: tok.access }),
        })
      );
      const page = await ctx.newPage();
      try {
        await page.goto(BASE + t.url, { waitUntil: "networkidle", timeout: 30_000 });
        await page.waitForTimeout(2500);
        const finalPath = new URL(page.url()).pathname + new URL(page.url()).search;
        const dir = path.join(OUT_ROOT, tag);
        mkdirSync(dir, { recursive: true });
        await page.screenshot({
          path: path.join(dir, `${t.slug}-${vpName}-${theme}.png`),
          fullPage: true,
        });
        console.log(`+ ${t.slug}/${vpName}/${theme} final=${finalPath}`);
        ok++;
      } catch (e) {
        console.log(`SKIP ${t.slug}/${vpName}/${theme}: ${e.message}`);
        fail++;
      }
      await ctx.close();
    }
  }
}
await browser.close();
console.log(`Done: ${ok} ok, ${fail} failed → ${path.join(OUT_ROOT, tag)}`);
process.exit(fail ? 1 : 0);
