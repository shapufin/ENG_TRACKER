// Modal visual audit gate — forbids mockup-hex / non-token styling in dialog files.
// Companion to modal-audit.mjs (scroll contract). Covers the mockup-rollout plan:
// mockup raw hex must be token-mapped, never copied; no slate palette, no
// purple/indigo gradients, no bg-card on DialogContent.
// Usage: node scripts/modal-visual-audit.mjs
// Exit 0 + "MODAL-VISUAL-AUDIT PASS" when clean; exit 1 with file:line list on hits.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "..", "src");

const RULES = [
  { id: "raw-hex", re: /#[0-9A-Fa-f]{6}\b/, why: "raw hex in dialog file; use semantic theme tokens (bg-popover, bg-surface-sunken, border-border, ...)" },
  { id: "slate-palette", re: /(?:text|bg|border)-slate-/, why: "slate palette class; use text-muted-foreground / token surfaces" },
  { id: "mockup-gradient", re: /from-purple-|to-indigo-|from-indigo-|via-purple-/, why: "mockup purple/indigo gradient; use existing Button default variant (no gradient token)" },
  { id: "card-on-popover", re: /DialogContent className="[^"]*bg-card/, why: "bg-card on modal surface; use default bg-popover (or record spec-win)" },
];

function* walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(tsx|ts)$/.test(e) && !/\.test\./.test(e)) yield p;
  }
}

const hits = [];
for (const f of walk(ROOT)) {
  const src = readFileSync(f, "utf8");
  // Only dialog-owned files: direct DialogContent usage or shared dialog wrappers.
  if (!src.includes("DialogContent") && !src.includes("FormDialog") && !src.includes("ConfirmDialog")) continue;
  // Skip the primitive definition itself (documents the token contract).
  if (f.endsWith(join("components", "ui", "dialog.tsx"))) continue;
  const lines = src.split("\n");
  lines.forEach((line, i) => {
    for (const r of RULES) {
      if (r.re.test(line)) hits.push(`${relative(process.cwd(), f)}:${i + 1} [${r.id}] ${line.trim().slice(0, 140)}`);
    }
  });
}

if (hits.length) {
  console.log(`MODAL-VISUAL-AUDIT FAIL — ${hits.length} hits:\n` + hits.join("\n"));
  process.exit(1);
}
console.log("MODAL-VISUAL-AUDIT PASS");
