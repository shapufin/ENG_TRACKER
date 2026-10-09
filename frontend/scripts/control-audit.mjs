// Control-kit audit — prints file:line for every violation of the field/toolbar contract.
//
// RULE: a field's height, padding, edge and search affordance come from
// src/components/ui/{controlSurface.ts,SearchField.tsx,FilterToolbar.tsx}. Detection lives in
// control-audit-lib.mjs and is pinned by control-audit.test.mjs (`node --test scripts/control-audit.test.mjs`).
//
// WARN-ONLY by default (exit 0): Phase 5 migrates the remaining call sites. `--strict` exits 1; `--exclude=<dir>` skips a directory.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { findViolations, isExcluded } from "./control-audit-lib.mjs";

const strict = process.argv.includes("--strict");
// --exclude=src/some/dir (repeatable) skips a directory, e.g. work in flight on another branch.
const excludes = process.argv.filter((a) => a.startsWith("--exclude=")).map((a) => a.slice(10));
const files = execSync("git ls-files -co --exclude-standard -- src", { encoding: "utf8" })
  .split("\n")
  .map((s) => s.trim())
  .filter((f) => /\.(tsx|jsx)$/.test(f))
  .filter((f) => !/\.(test|spec)\./.test(f))
  .filter((f) => !isExcluded(f, excludes));

const byRule = {};
let bad = 0;
for (const f of files) {
  for (const v of findViolations(readFileSync(f, "utf8"), f)) {
    console.log(`${f}:${v.line}  ${v.rule}  ${v.text}`);
    byRule[v.rule] = (byRule[v.rule] ?? 0) + 1;
    bad++;
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
    ? `CONTROL-AUDIT ${strict ? "FAIL" : "WARN"}: ${bad} violation(s) across ${files.length} files`
    : `CONTROL-AUDIT PASS: 0 violations across ${files.length} files`
);
process.exit(bad && strict ? 1 : 0);
