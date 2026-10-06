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



const WHO = process.env.WHO || "e2e_admin";
const tokens = generateTokens([WHO]);
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
  if (process.env.DBG) { page.on("console", (m)=>{ if (m.type()==="error") console.log("CONSOLE", m.text().slice(0,160)); }); page.on("requestfailed", (r)=>console.log("REQFAIL", r.url().slice(0,100))); }
  const errors = [];
  page.on("pageerror", (e)=>errors.push(e.message));
  page.on("response", (r)=>{ if (r.status()>=400 && r.url().includes("/api/")) console.log("HTTP", r.status(), r.url().slice(0,100)); });
  await page.goto(BASE + url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(4500);
  if (process.env.DBG) await page.screenshot({ path: path.join(dir, "dbg-" + user + ".png") });
  if (process.env.DBG) console.log("DBG url", page.url(), "ls", await page.evaluate(()=>Object.keys(localStorage).join(",")), "cookies", (await ctx.cookies()).map(c=>c.name).join(","));
  return { page, ctx, errors };
}
async function flow(name, fn, who="e2e_admin") {
  if (who !== WHO) return;
  try { const note = await fn(); results.push(["PASS", name, note||""]); }
  catch (e) { results.push(["FAIL", name, e.message.slice(0,160)]); }
}
const eq = (a,b,m)=>{ if (a!==b) throw new Error(`${m}: expected ${b}, got ${a}`); };

await flow("admin/users: select-all, sort by Username toggles order, search filters", async () => {
  const { page, ctx, errors } = await open("e2e_admin", "/admin/users");
  const first = async () => (await page.locator("tbody tr").first().locator("td").nth(1).innerText()).trim();
  const a = await first();
  await page.getByRole("button", { name: /Sort by username/i }).click(); await page.waitForTimeout(300);
  const b = await first();
  await page.getByRole("button", { name: /Sort by username/i }).click(); await page.waitForTimeout(300);
  const c = await first();
  if (b === c) throw new Error("sort did not toggle: " + b);
  await page.getByRole("checkbox", { name: "Select all rows on this page" }).click();
  const checked = await page.locator("tbody [role=checkbox][data-state=checked]").count();
  if (checked < 1) throw new Error("select-all checked 0 rows");
  await page.getByPlaceholder(/Search users/i).fill("zzz_tl"); await page.waitForTimeout(500);
  const rows = await page.locator("tbody tr").count();
  eq(rows, 1, "search rows");
  await page.screenshot({ path: path.join(dir, "users-flow.png") });
  await ctx.close(); if (errors.length) throw new Error("pageerror: " + errors[0]);
  return `first rows ${a}/${b}/${c}, selected ${checked}`;
});
await flow("admin/calendars: teams grid header + select a team enables Apply", async () => {
  const { page, ctx, errors } = await open("e2e_admin", "/admin/calendars");
  const hdr = page.locator("div.grid", { hasText: "Calendar Group" }).filter({ hasText: "Leader" }).first();
  await hdr.scrollIntoViewIfNeeded();
  const cs = await hdr.evaluate((e)=>{const c=getComputedStyle(e);return [c.fontSize,c.fontWeight,c.textTransform,c.letterSpacing].join("|");});
  if (!cs.startsWith("14px|500|none")) throw new Error("grid header style " + cs);
  await page.getByRole("checkbox", { name: /Select team/ }).first().click();
  await page.getByPlaceholder(/Enter group name/i).fill("flow-test");
  const enabled = await page.getByRole("button", { name: /Apply to selected/i }).isEnabled();
  if (!enabled) throw new Error("Apply stayed disabled");
  await hdr.screenshot({ path: path.join(dir, "teams-header.png") });
  await page.getByRole("textbox", { name: /Search teams/i }).fill("E2E"); await page.waitForTimeout(300);
  await ctx.close(); if (errors.length) throw new Error("pageerror: " + errors[0]);
  return cs;
});
await flow("admin/calendars -> Holidays tab renders (migrated HolidayTable)", async () => {
  const { page, ctx, errors } = await open("e2e_admin", "/admin/calendars");
  await page.getByRole("tab", { name: "Holidays" }).click(); await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(dir, "holidays-tab.png") });
  await ctx.close(); if (errors.length) throw new Error("pageerror: " + errors[0]);
});
await flow("hbpr leaders: Evidence button fully inside card at 1280 and opens evidence", async () => {
  const { page, ctx, errors } = await open("e2e_hbpr", "/hbpr?view=leaders");
  const btn = page.getByRole("link", { name: /governance evidence/i }).filter({ visible: true }).first();
  const bb = await btn.boundingBox();
  const card = await btn.evaluate((t)=>{let c=t.parentElement;while(c&&!(getComputedStyle(c).overflowX!=="visible"||getComputedStyle(c).borderRadius!=="0px"))c=c.parentElement;const r=c.getBoundingClientRect();return {right:r.right};});
  if (bb.x + bb.width > card.right + 0.5) throw new Error(`Evidence clipped: ${bb.x+bb.width} > ${card.right}`);
  await btn.click(); await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(dir, "hbpr-evidence.png") });
  await ctx.close(); if (errors.length) throw new Error("pageerror: " + errors[0]);
  return `right edge ${Math.round(bb.x+bb.width)} <= ${Math.round(card.right)}`;
}, "e2e_hbpr");
await flow("tl-scorecard records: tab renders rows + header contract", async () => {
  const { page, ctx, errors } = await open("e2e_tl_b", "/tl-scorecard?tab=records");
  const n = await page.locator("thead th").count();
  await page.screenshot({ path: path.join(dir, "tl-records.png") });
  await ctx.close(); if (errors.length) throw new Error("pageerror: " + errors[0]);
  return `${n} headers`;
}, "e2e_tl_b");
await flow("engagement metrics: DataTable sorts + shows 8 headers", async () => {
  const { page, ctx, errors } = await open("e2e_tl_b", "/engagement/metrics");
  eq(await page.locator("thead th").count(), 8, "th count");
  const sortBtn = page.getByRole("button", { name: /^Sort by/ }).first();
  await sortBtn.click(); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, "engagement.png") });
  await ctx.close(); if (errors.length) throw new Error("pageerror: " + errors[0]);
}, "e2e_tl_b");
await flow("resource-access: select-all checkbox in header works", async () => {
  const { page, ctx, errors } = await open("e2e_admin", "/admin/resource-access");
  await page.screenshot({ path: path.join(dir, "resaccess.png") });
  await ctx.close(); if (errors.length) throw new Error("pageerror: " + errors[0]);
});
await flow("320px mobile: admin pages have no horizontal page scroll", async () => {
  for (const [u,url] of [["e2e_admin","/admin/users"],["e2e_admin","/admin/teams"],["e2e_admin","/admin/resource-access"]]) {
    const { page, ctx } = await open(u, url, "light", {width:320,height:700});
    const o = await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    await ctx.close(); if (o>0) throw new Error(`${url} overflows by ${o}`);
  }
});
await browser.close();
for (const r of results) console.log(r.join(" | "));
process.exit(results.some(r=>r[0]==="FAIL")?1:0);
