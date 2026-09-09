/** Team page KPI summary cards: seniority, strongest domain, gaps, coverage. */

import React from "react";
import { AlertTriangle, Gauge, ShieldCheck, Trophy } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { cn } from "@/lib/utils";
import type { SkillCoverage } from "../types/skills";
import {
  computeCriticalGap,
  computeSeniorityIndex,
  computeStrongestDomain,
  computeVerificationRate,
  type GapKpi,
  type SeniorityKpi,
  type VerificationKpi,
} from "../utils/skillKpis";
import { avgTone, categoryAccent } from "../utils/categoryAccents";
import { toneTextClass } from "@/components/ui/tone";

interface SkillsKpiCardsProps {
  coverage: SkillCoverage[];
  gaps: SkillCoverage[];
  memberCount: number;
}

/** Thin semantic progress bar (decorative — the value text carries meaning). */
const MiniBar: React.FC<{ pct: number; fillClass: string }> = ({ pct, fillClass }) => (
  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
    <div
      className={cn("h-full rounded-full transition-[width] duration-300 ease-out", fillClass)}
      style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
    />
  </div>
);

const SeniorityCard: React.FC<{ kpi: SeniorityKpi | null }> = ({ kpi }) =>
  kpi ? (
    <StatCard
      label="Team Seniority Index"
      icon={Gauge}
      value={<span className="font-mono">{`L${kpi.avg}`}</span>}
      valueColorClass={avgTone(kpi.avg)}
      trend={
        <span className="block">
          <span>{kpi.label}</span>
          <MiniBar pct={kpi.pct} fillClass="bg-amber-500/70" />
        </span>
      }
    />
  ) : null;

const DomainCard: React.FC<{
  name: string;
  avg: number;
  pct: number;
}> = ({ name, avg, pct }) => {
  const accent = categoryAccent(name);
  return (
    <StatCard
      label="Strongest Domain"
      icon={Trophy}
      value={
        <span className="truncate font-mono text-xl" title={name}>
          {name}
        </span>
      }
      valueColorClass={accent.text}
      trend={
        <span className="block">
          <span className="font-mono tabular-nums">
            Avg L{avg} · {pct}%
          </span>
          <MiniBar pct={pct} fillClass="bg-blue-500/70" />
        </span>
      }
    />
  );
};

const GapCard: React.FC<{ kpi: GapKpi | null }> = ({ kpi }) =>
  kpi ? (
    <StatCard
      label="Critical Gap"
      icon={AlertTriangle}
      value={
        <span className="truncate font-mono text-xl" title={kpi.skillName}>
          {kpi.skillName}
        </span>
      }
      valueColorClass={toneTextClass.danger}
      trend={
        <span className="block font-mono tabular-nums">
          {kpi.ratedCount} / {kpi.teamSize} rated
          <MiniBar
            pct={(kpi.ratedCount / Math.max(1, kpi.teamSize)) * 100}
            fillClass="bg-tone-danger-text/70"
          />
        </span>
      }
    />
  ) : null;

const VerificationCard: React.FC<{ kpi: VerificationKpi | null }> = ({ kpi }) =>
  kpi ? (
    <StatCard
      label="Verification Rate"
      icon={ShieldCheck}
      value={<span className="font-mono">{`${kpi.pct}%`}</span>}
      valueColorClass={toneTextClass.success}
      trend={
        <span className="block font-mono tabular-nums">
          {kpi.rated} / {kpi.total} ratings
          <MiniBar pct={kpi.pct} fillClass="bg-tone-success-text/70" />
        </span>
      }
    />
  ) : null;

export const SkillsKpiCards: React.FC<SkillsKpiCardsProps> = ({ coverage, gaps, memberCount }) => {
  const seniority = computeSeniorityIndex(coverage);
  const domain = computeStrongestDomain(coverage);
  const gap = computeCriticalGap(gaps, memberCount);
  const verification = computeVerificationRate(coverage, memberCount);

  if (!seniority && !domain && !gap && !verification) return null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:gap-4">
      <SeniorityCard kpi={seniority} />
      {domain && <DomainCard {...domain} />}
      <GapCard kpi={gap} />
      <VerificationCard kpi={verification} />
    </div>
  );
};
