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


const TARGETS = [
  ["e2e_admin","/admin/calendars","teams"],["e2e_admin","/admin/users","users"],
  ["e2e_admin","/admin/teams","admin-teams"],["e2e_admin","/admin/resource-access","resaccess"],
  ["e2e_admin","/admin/skills/catalog","skillscat"],["e2e_admin","/admin/hbpr-assignments","hbprassign"],
  ["e2e_admin","/admin/clients","clients"],["e2e_admin","/admin/techs","tech"],
  ["e2e_admin","/admin/leave-balances","leavebal"],["e2e_admin","/admin/reports","reports"],
  ["e2e_admin","/admin/backup-restore","backup"],["e2e_admin","/admin/payroll/runs","payroll"],
  ["e2e_hbpr","/hbpr?view=leaders","leaders"],["e2e_hbpr","/hbpr?view=leaders&x=1","hbprrec"],
  ["e2e_tl_b","/tl-scorecard?tab=records","tlrec"],["e2e_tl_b","/engagement/metrics","engage"],
  ["e2e_tl_b","/leave-management","leave"],["e2e_tl_b","/overtime","overtime"],
  ["e2e_tl_b","/settings","settings"],["e2e_tl_b","/standby","standby"],
];
const VPS={v1280:{width:1280,height:900},v320:{width:320,height:700}};
const THEMES=["light","dark"];


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


const tokens = generateTokens([...new Set(TARGETS.map((t) => t[0]))]);
const browser = await chromium.launch();
const dir = path.join(OUT_ROOT, "review2"); mkdirSync(dir, { recursive: true });
let problems = 0;
for (const theme of THEMES) for (const [vp, size] of Object.entries(VPS)) for (const [user, url, slug] of TARGETS) {
  const tok = tokens[user]; if (!tok) { console.log("NO TOKEN", user); continue; }
  const ctx = await browser.newContext({ viewport: size, colorScheme: theme });
  await ctx.addCookies([{ name: "refresh_token", value: tok.refresh, domain: "127.0.0.1", path: "/api/auth/token/", httpOnly: true, sameSite: "Lax" }]);
  await ctx.addInitScript(({u,t})=>{localStorage.setItem("user",JSON.stringify(u));localStorage.setItem("theme",t);},{u:tok.user,t:theme});
  await ctx.route("**/api/auth/token/refresh/", (r)=>r.fulfill({status:200,contentType:"application/json",body:JSON.stringify({access:tok.access})}));
  const page = await ctx.newPage();
  try {
    await page.goto(BASE + url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(1800);
    const r = await page.evaluate(() => {
      const cells = [...document.querySelectorAll("thead th")].filter(e=>e.offsetParent && e.textContent.trim());
      const bad = cells.map(e=>{const c=getComputedStyle(e);return {t:e.textContent.trim().slice(0,20),fs:c.fontSize,fw:c.fontWeight,tt:c.textTransform,ls:c.letterSpacing};})
        .filter(c=>!(c.fs==="14px"&&c.fw==="500"&&c.tt==="none"&&(c.ls==="normal"||c.ls==="0px")));
      const grid=[...document.querySelectorAll("[class*='grid-cols-']")].filter(e=>getComputedStyle(e).textTransform==="uppercase").map(e=>e.textContent.trim().slice(0,30));
      const de=document.documentElement;
      return {ths:cells.length,bad,grid,overflowX:de.scrollWidth-de.clientWidth,final:location.pathname};
    });
    const flag = r.bad.length || r.grid.length || r.overflowX>0;
    if (flag) problems++;
    console.log(`${flag?"!!":"ok"} ${slug}/${vp}/${theme} path=${r.final} th=${r.ths} pageOverflow=${r.overflowX} bad=${JSON.stringify(r.bad.slice(0,3))} gridUpper=${JSON.stringify(r.grid)}`);
    const tbl = page.locator("table, [class*='grid-cols-[80px']").first();
    if (await tbl.count()) { await tbl.scrollIntoViewIfNeeded().catch(()=>{}); await page.screenshot({ path: path.join(dir, `${slug}-${vp}-${theme}.png`) }); }
  } catch (e) { console.log(`SKIP ${slug}/${vp}/${theme}: ${e.message.slice(0,80)}`); }
  await ctx.close();
}
await browser.close();
console.log("problems:", problems);
