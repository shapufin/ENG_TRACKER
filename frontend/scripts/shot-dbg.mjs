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
      cwd: REPO_ROOT, encoding: "utf-8", timeout: 60_000,
      env: { ...process.env, PYTHONPATH: REPO_ROOT },
    });
    const s = output.indexOf("===TOKENS_JSON_START===");
    const e = output.indexOf("===TOKENS_JSON_END===");
    return JSON.parse(output.slice(s + 24, e).trim());
  } finally {
    if (existsSync(tmpFile)) unlinkSync(tmpFile);
  }
}



const tokens = generateTokens(["e2e_admin","e2e_hbpr","e2e_tl_b"]);
const browser = await chromium.launch();
const dir = path.join(OUT_ROOT, "flows"); mkdirSync(dir, { recursive: true });
const results = [];
async function open(user, url, theme="dark", vp={width:1280,height:900}) {
  const tok = tokens[user];
  const ctx = await browser.newContext({ viewport: vp, colorScheme: theme });
  await ctx.addCookies([{ name: "refresh_token", value: tok.refresh, domain: "127.0.0.1", path: "/api/auth/token/", httpOnly: true, sameSite: "Lax" }]);
  await ctx.addInitScript(({u,t})=>{localStorage.setItem("user",JSON.stringify(u));localStorage.setItem("theme",t);},{u:tok.user,t:theme});
  await ctx.route("**/api/auth/token/refresh/", (r)=>r.fulfill({status:200,contentType:"application/json",body:JSON.stringify({access:tok.access})}));
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e)=>errors.push(e.message));
  await page.goto(BASE + url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1500);
  return { page, ctx, errors };
}
async function flow(name, fn) {
  try { const note = await fn(); results.push(["PASS", name, note||""]); }
  catch (e) { results.push(["FAIL", name, e.message.slice(0,160)]); }
}
const eq = (a,b,m)=>{ if (a!==b) throw new Error(`${m}: expected ${b}, got ${a}`); };

{ const { page, ctx } = await open("e2e_admin", "/admin/users"); console.log("URL", page.url()); console.log("BODY", (await page.locator("body").innerText()).slice(0,200).replace(/
/g," ")); await page.screenshot({path: path.join(dir,"dbg.png")}); await ctx.close(); }
await browser.close(); process.exit(0);
