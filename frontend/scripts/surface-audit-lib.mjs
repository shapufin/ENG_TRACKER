// Pure detector for the surface contract (docs/superpowers/plans/2026-10-08-admin-ui-polish-and-grid.md section 6, sweeps S1/S3/S7).
// Text-based on purpose, like control-audit-lib.mjs: class tokens are matched with an optional variant chain
// (`sm:`, `hover:`, `dark:hover:` ...) so a prefix cannot hide a violation.
//
//   STRAY-FILL    bg-white, or bg/text/border-(slate|gray|zinc)-N   -> bg-card / bg-surface-sunken / bg-muted / tone tokens
//   DARK-OVERRIDE dark:bg-*, dark:text-*, dark:border-*             -> a token that carries both themes (tone-*, foreground, ...)
//   MICRO-TEXT    text-[10px] / text-[11px]                         -> text-xs (12px minimum)

const VARIANTS = String.raw`(?:[\w[\]&>*.-]+:)*`;
const RULES = [
  {
    rule: "STRAY-FILL",
    re: new RegExp(
      String.raw`(?<![\w-])${VARIANTS}(?:bg-white(?![\w-])|(?:bg|text|border)-(?:slate|gray|zinc)-\d)`
    ),
  },
  {
    rule: "DARK-OVERRIDE",
    re: new RegExp(String.raw`(?<![\w-])${VARIANTS}dark:${VARIANTS}(?:bg|text|border)-`),
  },
  {
    rule: "MICRO-TEXT",
    re: new RegExp(String.raw`(?<![\w-])${VARIANTS}text-\[(?:10|11)(?:\.\d+)?px\]`),
  },
];

/**
 * Documented leftovers (path suffix -> rules allowed). Keep this list SHORT: each entry is a place a
 * token genuinely cannot express, and is listed in .devin/context/03-FRONTEND-PATTERNS.md section 15.
 */
export const ALLOW = {
  // Identity colour systems (not status) - section 15 "deliberately NOT migrated".
  "components/calendar/calendarStyles.ts": ["DARK-OVERRIDE"],
  "components/calendar/UserAvatar.tsx": ["DARK-OVERRIDE", "MICRO-TEXT"],
  "plugins/skills/utils/proficiencyLevels.ts": ["DARK-OVERRIDE"],
  "plugins/skills/utils/categoryAccents.ts": ["DARK-OVERRIDE"],
  "plugins/organigrama/components/OrgNode.tsx": ["DARK-OVERRIDE", "STRAY-FILL"],
  "plugins/organigrama/components/BuilderNode.tsx": ["DARK-OVERRIDE", "STRAY-FILL"],
  "plugins/organigrama/components/CustomChartViewer.tsx": ["DARK-OVERRIDE", "STRAY-FILL"],
  "plugins/organigrama/components/OrgChartMobileList.tsx": ["DARK-OVERRIDE"],
  // Light and dark pick different steps of the same token (border vs line-subtle, 5% vs 10% foreground,
  // 12% vs 15% primary): no single token carries both.
  "components/calendar/ConflictCard.tsx": ["DARK-OVERRIDE"],
  "components/calendar/EventActionButtons.tsx": ["DARK-OVERRIDE"],
  "components/calendar/CalendarDayCell.tsx": ["DARK-OVERRIDE", "MICRO-TEXT"],
  "components/calendar/EventCard.tsx": ["DARK-OVERRIDE"],
  "plugins/skills/components/SkillsDenseMatrix.tsx": ["DARK-OVERRIDE"],
  "plugins/skills/components/SkillsHeatmapGrid.tsx": ["DARK-OVERRIDE"],
  "plugins/skills/components/SkillsMemberColumn.tsx": ["DARK-OVERRIDE"],
  // Fixed-size count badges, ring label and group label: 12px does not fit (h-4 w-4 / h-5 w-5 circles, pills).
  "plugins/notifications/components/NotificationBell.tsx": ["MICRO-TEXT"],
  "components/layout/SidebarNavLink.tsx": ["MICRO-TEXT"],
  "components/layout/SidebarSectionLabel.tsx": ["MICRO-TEXT"],
  "components/dashboard/ProgressRing.tsx": ["MICRO-TEXT"],
  "plugins/skills/components/ProficiencyBadge.tsx": ["MICRO-TEXT"], // pinned by ProficiencyBadge.test.tsx
};

const norm = (p) => p.replace(/\\/g, "/");
const isComment = (l) => /^\s*(\/\/|\/\*|\*)/.test(l);

export function findViolations(src, path = "src/x.tsx", allow = ALLOW) {
  const p = norm(path);
  const allowed = Object.entries(allow).find(([k]) => p.endsWith(k))?.[1] ?? [];
  const out = [];
  src.split("\n").forEach((line, i) => {
    if (isComment(line)) return;
    for (const { rule, re } of RULES) {
      if (re.test(line) && !allowed.includes(rule))
        out.push({ line: i + 1, rule, text: line.trim().replace(/\s+/g, " ").slice(0, 100) });
    }
  });
  return out;
}

/** True when `path` is under one of the `--exclude=<dir>` prefixes (another team's in-flight work). */
export function isExcluded(path, prefixes) {
  const p = norm(path);
  return prefixes.some((x) => p.startsWith(norm(x).replace(/\/?$/, "/")));
}
