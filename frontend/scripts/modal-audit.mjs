// Modal audit gate — forbids known modal anti-patterns in touched files.
// Usage: node scripts/modal-audit.mjs [--staged-only]
// Exit 0 + "MODAL-AUDIT PASS" when clean; exit 1 with file:line list on hits.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "..", "src");

const RULES = [
  { id: "fixed-vh-shell", re: /(?<!max-)h-\[(80|90)vh\]/, why: "fixed viewport-height shell; use flex-col + flex-1 scroll body" },
  { id: "fixed-px-panel", re: /max-h-\[(:?(400|360)px)\]|h-\[400px\]/, why: "fixed-px panel; use viewport-relative max-h-[min(400px,50vh)] or shared scroll body" },
  { id: "offstandard-vh", re: /92vh/, why: "off-standard height; use max-h-[90vh]" },
  { id: "whole-content-scroll", re: /DialogContent className="[^"]*overflow-y-auto/, why: "whole-content scroll (header scrolls away); use overflow-hidden + inner flex-1 overflow-y-auto" },
  // The scroll contract, widths and padding now live in the DialogContent
  // primitive. A callsite that re-states them either duplicates the default or
  // silently loses to it (prefixed vs unprefixed tailwind-merge groups).
  { id: "arbitrary-dialog-width", re: /DialogContent[^>]*className="[^"]*\bsm:max-w-|DialogContent[^>]*className="[^"]*\bmax-w-(?!\[min)/, why: "literal width on DialogContent; use the size prop (sm|md|lg|xl|full)" },
  { id: "restated-scroll-contract", re: /DialogContent[^>]*className="[^"]*\b(flex-col|overflow-hidden)\b/, why: "scroll contract is baked into DialogContent; drop the class" },
  { id: "callsite-dialog-padding", re: /DialogContent[^>]*className="[^"]*\bp-0\b/, why: "p-0 cannot cancel the responsive sm:p-6; use padded={false}" },
  { id: "hidden-close-hack", re: /DialogContent[^>]*\[&>button\]:hidden/, why: "blunt child-button hide; use hideClose" },
  { id: "arbitrary-micro-text", re: /text-\[1[01]px\]/, why: "arbitrary micro text size; use text-micro / text-micro-lg or FieldLabel" },
  { id: "card-on-popover", re: /DialogContent className="[^"]*bg-card/, why: "bg-card on modal surface; use default bg-popover (or record spec-win)" },
  { id: "raw-textarea", re: /<textarea[\s>]/, why: "raw <textarea>; use shared Textarea" },
  // Visible scrollbars inside dialogs read as clutter (mockup: clean surfaces).
  // Every overflow region in a dialog file hides its bar via .no-scrollbar
  // (scroll function kept: wheel/touch/keyboard). Shared DataTable keeps its
  // own styled viewport — only dialog-owned wrappers are flagged.
  { id: "bare-dialog-scroll", re: /overflow-y-auto/, why: "dialog scroll region without no-scrollbar" },
];

// The dialog primitive owns the contract these rules police — auditing it
// would flag its own definition.
const PRIMITIVE_RE = /components[\\/]ui[\\/]dialog\.tsx$/;

function* walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(tsx|ts)$/.test(e) && !/\.test\./.test(e)) yield p;
  }
}

const hits = [];
for (const f of walk(ROOT)) {
  if (PRIMITIVE_RE.test(f)) continue;
  const src = readFileSync(f, "utf8");
  if (!src.includes("DialogContent") && !/<textarea[\s>]/.test(src)) continue;
  const lines = src.split("\n");
  lines.forEach((line, i) => {
    for (const r of RULES) {
      if (r.id === "bare-dialog-scroll" && line.includes("no-scrollbar")) continue;
      if (r.re.test(line)) hits.push(`${relative(process.cwd(), f)}:${i + 1} [${r.id}] ${line.trim().slice(0, 140)}`);
    }
  });
}

// NOTE: hidden-Radix-close touch targets are pinned by scroll-contract tests
// per modal (jsdom class assertions), not by this grep gate — the custom
// close button often lives in an imported header component.

if (hits.length) {
  console.log(`MODAL-AUDIT FAIL — ${hits.length} hits:\n` + hits.join("\n"));
  process.exit(1);
}
console.log("MODAL-AUDIT PASS");
