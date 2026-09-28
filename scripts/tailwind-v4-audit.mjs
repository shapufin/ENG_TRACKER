#!/usr/bin/env node
// Scans frontend/src for class-name patterns that change meaning or break
// outright under Tailwind CSS v4 (v3.4.17 -> v4.x upgrade, Phase 3 of the
// major-dependency-upgrade series). Read-only: prints a report, changes
// nothing. Re-run after each fix pass to confirm a pattern is fully gone.
//
// Usage: node scripts/tailwind-v4-audit.mjs [--json]

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "..", "frontend", "src");
const AS_JSON = process.argv.includes("--json");

const SOURCE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".css"]);

/**
 * Each pattern: id, regex, severity, and a one-line note on the v4 change.
 * Severity:
 *   "break"  - renamed/removed utility, old class is silently a no-op in v4
 *   "visual" - still valid but renders differently (size/color/width changed)
 *   "check"  - not itself broken, but worth eyeballing given v4's changes
 */
const PATTERNS = [
  {
    id: "bg-gradient-to",
    severity: "break",
    // matches bg-gradient-to-r / -l / -t / -b / -tr / -tl / -br / -bl
    regex: /\bbg-gradient-to-(t|b|l|r|tr|tl|br|bl)\b/g,
    note: "renamed to bg-linear-to-*; old class does nothing in v4",
  },
  {
    id: "flex-shrink",
    severity: "break",
    regex: /\bflex-shrink(-0)?\b/g,
    note: "renamed to shrink(-0); old class does nothing in v4",
  },
  {
    id: "flex-grow",
    severity: "break",
    regex: /\bflex-grow(-0)?\b/g,
    note: "renamed to grow(-0); old class does nothing in v4",
  },
  {
    id: "overflow-ellipsis",
    severity: "break",
    regex: /\boverflow-ellipsis\b/g,
    note: "renamed to text-ellipsis; old class does nothing in v4 (silent truncation break)",
  },
  {
    id: "shadow-sm-bare",
    severity: "visual",
    regex: /(?<!\w)shadow-sm\b/g,
    note: "shadow-sm is now a larger shadow (old shadow-sm value moved to shadow-xs); visual size increase",
  },
  {
    id: "ring-bare",
    severity: "visual",
    regex: /(?<!\w)ring(?!-)\b/g,
    note: "default ring changed from 3px blue-500 to 1px currentColor; check focus-ring visibility",
  },
  {
    id: "border-bare",
    severity: "visual",
    // `border` not followed by a `-` (i.e. not border-2, border-t, border-red-500, etc.)
    regex: /(?<!\w)border(?!-)\b/g,
    note: "default border color changed from gray-200 to currentColor when no color utility is paired",
  },
  {
    id: "outline-none",
    severity: "check",
    regex: /\boutline-none\b/g,
    note: "still valid in v4 but outline-hidden is the new accessible-focus-safe alias; audit for real a11y intent",
  },
  {
    id: "bracket-css-var-arbitrary-value",
    severity: "break",
    // e.g. w-[--radix-popover-trigger-width] — v4 no longer wraps a bare
    // `--custom-property` arbitrary value in `var()`, so this compiles to
    // an invalid CSS declaration (`width: --my-var;`) instead of the old
    // implicit var() wrapping. Use w-(--my-var) instead.
    regex: /\[--[a-zA-Z0-9_-]+\]/g,
    note: "v4 no longer auto-wraps a bare --custom-property arbitrary value in var(); use the (--var) syntax instead or it compiles to invalid CSS",
  },
  {
    id: "raw-palette-color",
    severity: "check",
    // bg-emerald-500, text-rose-700, border-sky-300, ring-amber-400, from-/to-/via- gradients, with optional /opacity
    regex: /\b(?:bg|text|border|ring|from|via|to|fill|stroke|divide|outline|decoration|accent|caret)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g,
    note: "raw Tailwind palette color shifts from RGB/HSL to OKLCH in v4 (subtle hue/chroma shift); tone.ts tokens are unaffected (they read CSS vars, not the palette)",
  },
  {
    id: "arbitrary-important",
    severity: "check",
    regex: /!["'\s]|\B!\w/g,
    note: "important-modifier placement (!class vs class!) — spot check only, this pattern is noisy",
  },
];

// The noisy one is opt-in only; keep the default report focused.
const DEFAULT_PATTERNS = PATTERNS.filter((p) => p.id !== "arbitrary-important");

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, files);
    } else if (SOURCE_EXT.has(full.slice(full.lastIndexOf(".")))) {
      files.push(full);
    }
  }
  return files;
}

function main() {
  const files = walk(ROOT);
  const results = {}; // pattern id -> { count, files: Map<relpath, count> }
  for (const p of DEFAULT_PATTERNS) results[p.id] = { count: 0, files: new Map() };

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const rel = relative(join(ROOT, ".."), file);
    for (const p of DEFAULT_PATTERNS) {
      p.regex.lastIndex = 0;
      const matches = text.match(p.regex);
      if (matches && matches.length) {
        results[p.id].count += matches.length;
        results[p.id].files.set(rel, (results[p.id].files.get(rel) || 0) + matches.length);
      }
    }
  }

  if (AS_JSON) {
    const out = {};
    for (const p of DEFAULT_PATTERNS) {
      out[p.id] = {
        severity: p.severity,
        note: p.note,
        totalMatches: results[p.id].count,
        fileCount: results[p.id].files.size,
        files: Object.fromEntries(results[p.id].files),
      };
    }
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  console.log(`Scanned ${files.length} files under frontend/src\n`);
  const bySeverity = { break: [], visual: [], check: [] };
  for (const p of DEFAULT_PATTERNS) bySeverity[p.severity].push(p);

  for (const sev of ["break", "visual", "check"]) {
    const label = { break: "BREAKING (silent no-op in v4)", visual: "VISUAL CHANGE (still valid, renders differently)", check: "WORTH CHECKING" }[sev];
    console.log(`=== ${label} ===`);
    for (const p of bySeverity[sev]) {
      const r = results[p.id];
      console.log(`  ${p.id}: ${r.count} matches in ${r.files.size} files — ${p.note}`);
      if (r.files.size > 0 && r.files.size <= 15) {
        for (const [f, c] of [...r.files.entries()].sort((a, b) => b[1] - a[1])) {
          console.log(`      ${f} (${c})`);
        }
      } else if (r.files.size > 15) {
        const top = [...r.files.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
        for (const [f, c] of top) console.log(`      ${f} (${c})`);
        console.log(`      ... and ${r.files.size - 15} more files (use --json for the full list)`);
      }
    }
    console.log("");
  }
}

main();
