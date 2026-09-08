// TEMP: screenshot every content mockup (skip index nav pages) at 1280x800.
// file:// URLs; Tailwind CDN + fonts need network. DELETE AFTER USE.
import { chromium } from "playwright";
import { readdirSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const MOCK_ROOT = path.join(REPO_ROOT, "Time Tracker UI Project");
const OUT = path.join(REPO_ROOT, "design-audit", "mockup-captures");
mkdirSync(OUT, { recursive: true });

const targets = [];
for (const role of ["Admin", "Employee", "TL"]) {
  const dir = path.join(MOCK_ROOT, role);
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".html") || f === "index.html") continue;
    targets.push({ role, file: f, url: pathToFileURL(path.join(dir, f)).href });
  }
}
console.log("targets:", targets.length);

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  for (const t of targets) {
    const out = path.join(OUT, `${t.role}-${t.file.replace(".html", "")}.jpg`);
    await page.goto(t.url, { waitUntil: "networkidle", timeout: 30000 }).catch((e) => console.log("NAV FAIL", t.file, e.message.split("\n")[0]));
    await page.waitForTimeout(1200);
    await page.screenshot({ path: out, type: "jpeg", quality: 80 });
    console.log("saved:", path.basename(out));
  }
} finally {
  await browser.close();
}
