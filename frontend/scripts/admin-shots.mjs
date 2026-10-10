// Light/dark screenshot + console/network capture for the 27 admin routes.
// Usage: node scripts/admin-shots.mjs --tag=before [--only=a,b] [--themes=light,dark]
// Output (untracked, main repo): admin-gui-screenshots/<tag>/<theme>/<n>-<slug>[--tab-<k>].jpg + report.json
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ADMIN_ROUTES } from "./admin-routes.mjs";
import { createCollectors, dismissToasts } from "./visual-capture-helpers.mjs";

const BASE = "http://127.0.0.1:5173";
const OUT_ROOT = "C:/Users/EDEMNUSHIW/Desktop/Engineering_tracker/admin-gui-screenshots";
const USERNAME = "e2e_super";
const PASSWORD = process.env.ADMIN_SHOTS_PASSWORD || "e2e_pass_2026";

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const tag = arg("tag");
if (!tag) {
  console.error("--tag=<name> is required");
  process.exit(2);
}
const only = arg("only")?.split(",");
const themes = (arg("themes") || "light,dark").split(",");
const routes = only ? ADMIN_ROUTES.filter((r) => only.includes(r.slug)) : ADMIN_ROUTES;
const tabSlug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function login(browser, theme) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
  await ctx.addInitScript((t) => localStorage.setItem("theme", t), theme);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"], input[type="text"]').first().fill(USERNAME);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
  const state = await ctx.storageState();
  await ctx.close();
  return state;
}

async function shot(page, file) {
  await dismissToasts(page);
  await page.screenshot({ path: file, type: "jpeg", quality: 85 });
}

const report = {};
let bad = 0;
const browser = await chromium.launch();
try {
  for (const theme of themes) {
    const state = await login(browser, theme);
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: theme,
      storageState: state,
    });
    await ctx.addInitScript((t) => localStorage.setItem("theme", t), theme);
    const page = await ctx.newPage();
    const collectors = createCollectors();
    collectors.attach(page);
    const dir = path.join(OUT_ROOT, tag, theme);
    mkdirSync(dir, { recursive: true });
    report[theme] = {};
    let first = true;
    for (const r of routes) {
      await page.waitForTimeout(1500); // pace requests: the API throttles bursts (429)
      const bucket = collectors.begin();
      console.log(`[${theme}] ${r.n} ${r.slug}`);
      try {
        // SPA navigation after the first load: full reloads re-hit the throttled token refresh (429)
        if (first) await page.goto(`${BASE}${r.path}`, { waitUntil: "domcontentloaded" });
        else await page.evaluate((p) => { history.pushState({}, "", p); dispatchEvent(new PopStateEvent("popstate")); }, r.path);
        first = false;
        await page.waitForTimeout(800); // let the lazy route replace the previous page
        await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
        if (r.slug === "dashboard") {
          await page.getByRole("heading", { name: "Admin Dashboard" }).first().waitFor({ timeout: 15000 });
        } else {
          await page.locator("main h1").first().waitFor({ timeout: 15000 });
        }
        await shot(page, path.join(dir, `${r.n}-${r.slug}.jpg`));
        for (const t of r.tabs ?? []) {
          let tab = page.getByRole("tab", { name: t, exact: true });
          if ((await tab.count()) === 0) tab = page.getByRole("tab", { name: t });
          await tab.first().click();
          await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
          await page.waitForTimeout(400);
          await shot(page, path.join(dir, `${r.n}-${r.slug}--tab-${tabSlug(t)}.jpg`));
        }
      } catch (e) {
        bucket.consoleErrors.push(`capture failed: ${String(e).slice(0, 250)}`);
      }
      report[theme][r.slug] = { consoleErrors: bucket.consoleErrors, failedRequests: bucket.failedRequests };
      if (bucket.consoleErrors.length || bucket.failedRequests.length) bad++;
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
mkdirSync(path.join(OUT_ROOT, tag), { recursive: true });
writeFileSync(path.join(OUT_ROOT, tag, "report.json"), JSON.stringify(report, null, 2));
console.log(`done: ${bad} route(s) with errors`);
process.exit(bad ? 1 : 0);
