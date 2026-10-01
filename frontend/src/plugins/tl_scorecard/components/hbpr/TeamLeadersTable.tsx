import React from "react";
import { Link } from "react-router-dom";
import { UsersRound } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { GlassCard } from "@/components/ui/GlassCard";
import type { HbprTeamLeaderRow } from "../../types/tlScorecard";

const plans = (tl: HbprTeamLeaderRow) => `${tl.pending_pips} awaiting · ${tl.active_pips} active`;

export const TeamLeadersTable: React.FC<{ tls: HbprTeamLeaderRow[] }> = ({ tls }) => (
  <section aria-labelledby="hbpr-tls" className="space-y-3">
    <h2 id="hbpr-tls" className="text-lg font-semibold">
      Team leaders
    </h2>
    <GlassCard animateOnMount={false} isHoverLift={false} className="p-0">
      {tls.length === 0 ? (
        <EmptyState icon={UsersRound} title="No team leaders in your scope yet" className="py-8" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border/50">
                <th scope="col" className="px-4 py-2 font-medium">Team leader</th>
                <th scope="col" className="px-4 py-2 font-medium">People</th>
                <th scope="col" className="px-4 py-2 font-medium">Improvement plans</th>
                <th scope="col" className="px-4 py-2 font-medium">Idle flags</th>
                <th scope="col" className="px-4 py-2 font-medium">Absences</th>
                <th scope="col" className="px-4 py-2 font-medium">No recent 1-on-1</th>
                <th scope="col" className="px-4 py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {tls.map((tl) => (
                <tr key={tl.id}>
                  <th scope="row" className="px-4 py-2.5 font-medium">{tl.name}</th>
                  <td className="px-4 py-2.5 tabular-nums">{tl.team_size}</td>
                  <td className="px-4 py-2.5">{plans(tl)}</td>
                  <td className="px-4 py-2.5 tabular-nums">{tl.open_idle_flags}</td>
                  <td className="px-4 py-2.5 tabular-nums">{tl.open_absences}</td>
                  <td className="px-4 py-2.5 tabular-nums">{tl.people_without_recent_one_on_one}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      to={`/tl-scorecard?tab=records&tl=${tl.id}`}
                      aria-label={`Open records for ${tl.name}`}
                      className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline sm:min-h-0"
                    >
                      Open records
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </GlassCard>
  </section>
);
