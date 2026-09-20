#!/usr/bin/env node
/**
 * Dashboard consistency audit — fails (exit 1) with a file:line list on any
 * hit. Run from frontend/: `node scripts/dashboard-audit.mjs`.
 *
 * Guards the dashboard-consistency plan invariants:
 * - no mockup hex values (mockup palette must not enter the codebase)
 * - no internal <a href> navs in dashboard surfaces (use Link/navigate)
 * - no dark-only white washes (invisible in light mode)
 * - no invented mockup metrics (real data or omit)
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SCOPES = [
  "src/pages/dashboard",
  "src/pages/admin/components/dashboard-widgets",
  "src/components/dashboard/DashboardSwitcher.tsx",
  "src/components/dashboard/DashboardSectionShell.tsx",
  "src/components/dashboard/dashboardSegments.ts",
  "src/components/layout/TeamContextPill.tsx",
];

const PATTERNS = [
  { name: "mockup-hex", re: /#[Oo]284[Cc]7|#f8fafc|#f1f5f9|#e2e8f0/gi },
  { name: "internal-anchor-nav", re: /<a\s+[^>]*href="\//g },
  { name: "dark-only-white-wash", re: /border-white\/10|bg-white\/\[/g },
  { name: "invented-metric", re: /99\.4%|quorum|3\.4h|All Queue Approved/g },
];

function collect(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) collect(full, out);
    else if (/\.(tsx?|css)$/.test(entry)) out.push(full);
  }
  return out;
}

const files = [];
for (const scope of SCOPES) {
  const full = join(ROOT, scope);
  try {
    const stat = statSync(full);
    if (stat.isDirectory()) collect(full, files);
    else files.push(full);
  } catch {
    // Scope file does not exist yet (e.g. TeamContextPill before Phase 5) — skip.
  }
}

let hits = 0;
for (const file of files) {
  const content = readFileSync(file, "utf8");
  const lines = content.split("\n");
  for (const { name, re } of PATTERNS) {
    lines.forEach((line, i) => {
      // Reset lastIndex for global regexes reused across lines.
      re.lastIndex = 0;
      if (re.test(line)) {
        hits += 1;
        console.log(`${relative(ROOT, file)}:${i + 1} [${name}] ${line.trim()}`);
      }
    });
  }
}

if (hits > 0) {
  console.log(`dashboard-audit: FAIL (${hits} hit${hits === 1 ? "" : "s"})`);
  process.exit(1);
} else {
  console.log("dashboard-audit: PASS");
}
