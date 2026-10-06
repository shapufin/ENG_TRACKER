// Table header centralization audit — exits 1 with file:line for every violation.
//
// RULE: a table's header surface and typography come from the single source of truth,
// `src/components/ui/tableStyles.ts`. No header block may declare typography or a fill
// inline. Detection lives in table-header-audit-lib.mjs and is pinned by
// table-header-audit.test.mjs (`node --test scripts/table-header-audit.test.mjs`).
//
// Scans tracked AND untracked source (a new, not-yet-added table must not escape).
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { findViolations } from "./table-header-audit-lib.mjs";

const files = execSync("git ls-files -co --exclude-standard -- src", { encoding: "utf8" })
  .split("\n")
  .map((s) => s.trim())
  .filter((f) => /\.(tsx?|jsx?)$/.test(f))
  .filter((f) => !/\.(test|spec)\./.test(f));

// Documented exceptions — sticky/virtualised grids that legitimately keep an opaque
// fill and compact type (DESIGN.md "Known intentional token exceptions").
const ALLOW = new Set([
  "src/components/calendar/ListView.tsx",
  "src/plugins/skills/components/SkillsMatrixTable.tsx",
  "src/plugins/skills/components/SkillsDenseMatrix.tsx",
  "src/plugins/skills/components/SkillsHeatmapGrid.tsx",
]);

let bad = 0;
let scanned = 0;
for (const f of files) {
  if (ALLOW.has(f)) continue;
  scanned++;
  for (const v of findViolations(readFileSync(f, "utf8"))) {
    console.log(`${f}:${v.line}  ${v.rule}  ${v.text}`);
    bad++;
  }
}
console.log(
  bad
    ? `\nFAIL: ${bad} violation(s) across ${scanned} files`
    : `\nPASS: 0 violations across ${scanned} files`
);
process.exit(bad ? 1 : 0);
