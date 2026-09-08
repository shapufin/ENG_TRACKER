/** Pure selectors computing Team page KPI card values from fetched data. */

import type { SkillCoverage } from "../types/skills";

export interface SeniorityKpi {
  /** Weighted mean level across rated skills, 1 decimal (e.g. 3.4). */
  avg: number;
  /** Nearest integer level label (e.g. "Proficient"). */
  label: string;
  /** avg / 5 as a 0-100 percentage for the progress bar. */
  pct: number;
}

export interface DomainKpi {
  name: string;
  avg: number;
  pct: number;
}

export interface GapKpi {
  skillName: string;
  ratedCount: number;
  teamSize: number;
}

export interface VerificationKpi {
  rated: number;
  total: number;
  pct: number;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

const LEVEL_LABELS: Record<number, string> = {
  1: "Foundational",
  2: "Developing",
  3: "Proficient",
  4: "Advanced",
  5: "Mastery",
};

const nearestLevelLabel = (avg: number): string =>
  LEVEL_LABELS[Math.min(5, Math.max(1, Math.round(avg)))] ?? `L${round1(avg)}`;

/** Weighted mean of per-skill avg_level over skills with at least one rating. */
export const computeSeniorityIndex = (coverage: SkillCoverage[]): SeniorityKpi | null => {
  const rated = coverage.filter((c) => c.team_count > 0);
  if (rated.length === 0) return null;
  const totalRatings = rated.reduce((sum, c) => sum + c.team_count, 0);
  const weighted = rated.reduce((sum, c) => sum + c.avg_level * c.team_count, 0);
  const avg = round1(weighted / totalRatings);
  return { avg, label: nearestLevelLabel(avg), pct: Math.round((avg / 5) * 100) };
};

/** Category with the highest mean avg_level (ties broken A-Z by name). */
export const computeStrongestDomain = (coverage: SkillCoverage[]): DomainKpi | null => {
  const byCategory = new Map<string, { sum: number; count: number }>();
  for (const c of coverage) {
    if (c.team_count === 0) continue;
    const entry = byCategory.get(c.category_name) ?? { sum: 0, count: 0 };
    entry.sum += c.avg_level;
    entry.count += 1;
    byCategory.set(c.category_name, entry);
  }
  if (byCategory.size === 0) return null;
  const ranked = [...byCategory.entries()]
    .map(([name, { sum, count }]) => ({ name, avg: round1(sum / count) }))
    .sort((a, b) => b.avg - a.avg || a.name.localeCompare(b.name));
  const best = ranked[0];
  return { name: best.name, avg: best.avg, pct: Math.round((best.avg / 5) * 100) };
};

/** Worst gap (lowest avg) from the gap report, with rated/team-size context. */
export const computeCriticalGap = (gaps: SkillCoverage[], memberCount: number): GapKpi | null => {
  const worst = gaps.find((g) => g.team_count > 0);
  if (!worst) return null;
  return {
    skillName: worst.skill_name,
    ratedCount: worst.team_count,
    teamSize: Math.max(memberCount, worst.team_count),
  };
};

/** Share of possible (member × skill) ratings that exist. */
export const computeVerificationRate = (
  coverage: SkillCoverage[],
  memberCount: number
): VerificationKpi | null => {
  if (memberCount <= 0 || coverage.length === 0) return null;
  const rated = coverage.reduce((sum, c) => sum + c.team_count, 0);
  const total = memberCount * coverage.length;
  return { rated, total, pct: Math.round((rated / total) * 100) };
};
