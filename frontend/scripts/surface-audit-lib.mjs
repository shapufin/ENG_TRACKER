// Pure detector for the surface contract (docs/superpowers/plans/2026-10-08-admin-ui-polish-and-grid.md section 6, sweeps S1/S3/S7).
// Text-based on purpose, like control-audit-lib.mjs: class tokens are matched with an optional variant chain
// (`sm:`, `hover:`, `dark:hover:` ...) so a prefix cannot hide a violation.
//
//   STRAY-FILL    bg-white, or bg/text/border-(slate|gray|zinc)-N   -> bg-card / bg-surface-sunken / bg-muted / tone tokens
//   DARK-OVERRIDE dark:bg-*, dark:text-*, dark:border-*             -> a token that carries both themes (tone-*, foreground, ...)
//   MICRO-TEXT    any text-[<12px], text-micro, text-micro-lg       -> text-xs (12px minimum; ALLOW list in docs/ui-control-kit.md)
//   DARK-EXTRA    dark:(ring|fill|stroke|from|to|via|divide|shadow|outline)-*  (dark:shadow-none is fine)
//   RAW-PALETTE   (bg|text|border)-(red|blue|green|...)-N           -> tone tokens. OPT-IN (`rawPalette: true`, CLI `--warn-raw-palette`), warn-only

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
    re: new RegExp(
      String.raw`(?<![\w-])${VARIANTS}(?:text-\[(?:[0-9]|10|11)(?:\.\d+)?px\]|text-\[0?\.[0-6]\d*rem\]|text-\[0\.7(?:[0-4]\d*)?rem\]|text-micro(?:-lg)?(?![\w-]))`
    ),
  },
  {
    rule: "DARK-EXTRA",
    re: new RegExp(
      String.raw`(?<![\w-])${VARIANTS}dark:${VARIANTS}(?:ring|fill|stroke|from|to|via|divide|shadow|outline)-(?!none(?![\w-]))`
    ),
  },
];

// Not enforced yet: 33 files / 173 lines use raw palette steps (progress bars, status icons, identity systems), and
// each needs a visual check before it can move to tone tokens. Reported only with `--warn-raw-palette`.
const RAW_PALETTE = {
  rule: "RAW-PALETTE",
  re: new RegExp(
    String.raw`(?<![\w-])${VARIANTS}(?:bg|text|border)-(?:red|blue|green|emerald|amber|orange|yellow|purple|violet|indigo|sky|teal|cyan|pink|rose|fuchsia|lime|stone|neutral)-\d`
  ),
};

/**
 * Documented leftovers (path suffix -> rules allowed). Keep this list SHORT: each entry is a place a
 * token genuinely cannot express, and the reason is written down in the tracked docs/ui-control-kit.md.
 */
export const ALLOW = {
  // Identity colour systems (not status) - section 15 "deliberately NOT migrated".
  "components/calendar/calendarStyles.ts": ["DARK-OVERRIDE"],
  "components/calendar/UserAvatar.tsx": ["DARK-OVERRIDE"],
  "plugins/skills/utils/proficiencyLevels.ts": ["DARK-OVERRIDE", "DARK-EXTRA"],
  "plugins/skills/utils/categoryAccents.ts": ["DARK-OVERRIDE"],
  "plugins/organigrama/components/OrgNode.tsx": ["DARK-OVERRIDE", "STRAY-FILL"],
  "plugins/organigrama/components/BuilderNode.tsx": ["DARK-OVERRIDE", "STRAY-FILL"],
  "plugins/organigrama/components/CustomChartViewer.tsx": ["DARK-OVERRIDE", "STRAY-FILL"],
  "plugins/organigrama/components/OrgChartMobileList.tsx": ["DARK-OVERRIDE"],
  // Light and dark pick different steps of the same token (border vs line-subtle, 5% vs 10% foreground,
  // 12% vs 15% primary): no single token carries both.
  "components/calendar/ConflictCard.tsx": ["DARK-OVERRIDE"],
  "components/calendar/EventActionButtons.tsx": ["DARK-OVERRIDE"],
  "components/calendar/CalendarDayCell.tsx": ["DARK-OVERRIDE", "DARK-EXTRA"],
  "components/calendar/EventCard.tsx": ["DARK-OVERRIDE"],
  "plugins/skills/components/SkillsDenseMatrix.tsx": ["DARK-OVERRIDE"],
  "plugins/skills/components/SkillsHeatmapGrid.tsx": ["DARK-OVERRIDE"],
  "plugins/skills/components/SkillsMemberColumn.tsx": ["DARK-OVERRIDE"],
  // Fixed-size badges where 12px does not fit (h-4 w-4 count circle, ring centre, size="sm" proficiency pill).
  "plugins/notifications/components/NotificationBell.tsx": ["MICRO-TEXT"],
  "components/dashboard/ProgressRing.tsx": ["MICRO-TEXT"],
  "plugins/skills/components/ProficiencyBadge.tsx": ["MICRO-TEXT"], // pinned by ProficiencyBadge.test.tsx
};

const norm = (p) => p.replace(/\\/g, "/");
const isComment = (l) => /^\s*(\/\/|\/\*|\*)/.test(l);

export function findViolations(
  src,
  path = "src/x.tsx",
  allow = ALLOW,
  { rawPalette = false } = {}
) {
  const p = norm(path);
  const allowed = Object.entries(allow).find(([k]) => p.endsWith(k))?.[1] ?? [];
  const out = [];
  src.split("\n").forEach((line, i) => {
    if (isComment(line)) return;
    for (const { rule, re } of rawPalette ? [...RULES, RAW_PALETTE] : RULES) {
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
