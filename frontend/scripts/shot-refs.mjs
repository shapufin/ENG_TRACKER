// TEMPORARY: screenshot public design references (shadcn docs). DELETE after plan.
// Usage: node scripts/shot-refs.mjs [--tag=refs-live]
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tag = (process.argv.find((a) => a.startsWith("--tag=")) || "--tag=refs").slice(6);
const OUT = path.resolve(__dirname, "..", "..", "design-screenshots", "tables-plan", tag);
mkdirSync(OUT, { recursive: true });

const PAGES = [
  { slug: "shadcn-button", url: "https://ui.shadcn.com/docs/components/base/button", crop: null },
  { slug: "shadcn-table", url: "https://ui.shadcn.com/docs/components/base/table", crop: "table" },
  {
    slug: "shadcn-data-table",
    url: "https://ui.shadcn.com/docs/components/base/data-table",
    crop: "table",
  },
];
const THEMES = ["light", "dark"];

const browser = await chromium.launch();
for (const theme of THEMES) {
  for (const p of PAGES) {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      colorScheme: theme,
    });
    const page = await ctx.newPage();
    try {
      await page.goto(p.url, { waitUntil: "networkidle", timeout: 60_000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(OUT, `${p.slug}-${theme}.png`), fullPage: false });
      console.log(`+ ${p.slug}-${theme}`);
      if (p.crop) {
        const el = page.locator(p.crop).first();
        if ((await el.count()) > 0) {
          await el.screenshot({ path: path.join(OUT, `${p.slug}-crop-${theme}.png`) });
          console.log(`+ ${p.slug}-crop-${theme}`);
        }
      }
    } catch (e) {
      console.log(`SKIP ${p.slug}-${theme}: ${e.message}`);
    }
    await ctx.close();
  }
}
await browser.close();
console.log("done");
