// Build assertion: heavy chart/PDF libs must not be preloaded by index.html,
// otherwise every page (login included) downloads them. Run after `vite build`.
// Usage: node scripts/entry-chunk-audit.mjs
import { readFileSync } from "node:fs";

const HEAVY = ["vendor-recharts", "jspdf", "html2canvas"];
const html = readFileSync(new URL("../dist/index.html", import.meta.url), "utf8");
const entryAssets = [...html.matchAll(/(?:href|src)="\/assets\/([^"]+\.js)"/g)].map((m) => m[1]);

const offenders = entryAssets.filter((f) => HEAVY.some((h) => f.startsWith(h)));
if (offenders.length) {
  console.error(`entry-chunk-audit: heavy chunks loaded by index.html: ${offenders.join(", ")}`);
  process.exit(1);
}
console.log(`entry-chunk-audit: OK (${entryAssets.length} entry JS chunks, no heavy libs)`);
