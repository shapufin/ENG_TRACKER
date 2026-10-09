// Surface audit — prints file:line for every stray fill, `dark:` colour override and sub-12px text.
//
// RULE: surfaces and text colours come from tokens (bg-card, bg-surface-sunken, tone-*, foreground) that already
// carry the light/dark pair; body text is never below 12px. Detection and the documented-leftover ALLOW list live in
// surface-audit-lib.mjs and are pinned by surface-audit.test.mjs (`node --test scripts/surface-audit.test.mjs`).
//
// WARN-ONLY by default (exit 0). `--strict` exits 1; `--exclude=<dir>` skips a directory.
// `--warn-raw-palette` also reports RAW-PALETTE (bg/text/border-<colour>-N); that rule never fails the run.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { findViolations, isExcluded } from "./surface-audit-lib.mjs";

const strict = process.argv.includes("--strict");
const rawPalette = process.argv.includes("--warn-raw-palette");
// --exclude=src/some/dir (repeatable) skips a directory, e.g. work in flight on another branch.
const excludes = process.argv.filter((a) => a.startsWith("--exclude=")).map((a) => a.slice(10));
const files = execSync("git ls-files -co --exclude-standard -- src", { encoding: "utf8" })
  .split("\n")
  .map((s) => s.trim())
  .filter((f) => /\.(tsx|ts|jsx)$/.test(f))
  .filter((f) => !/\.(test|spec)\./.test(f))
  .filter((f) => !isExcluded(f, excludes));

const byRule = {};
let bad = 0;
for (const f of files) {
  for (const v of findViolations(readFileSync(f, "utf8"), f, undefined, { rawPalette })) {
    console.log(`${f}:${v.line}  ${v.rule}  ${v.text}`);
    byRule[v.rule] = (byRule[v.rule] ?? 0) + 1;
    if (v.rule !== "RAW-PALETTE") bad++;
  }
}
console.log(
  `\nBy rule: ${
    Object.entries(byRule)
      .map(([k, n]) => `${k}=${n}`)
      .join(", ") || "none"
  }`
);
console.log(
  bad
    ? `SURFACE-AUDIT ${strict ? "FAIL" : "WARN"}: ${bad} violation(s) across ${files.length} files`
    : `SURFACE-AUDIT PASS: 0 violations across ${files.length} files`
);
process.exit(bad && strict ? 1 : 0);
