import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { LineChart } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { UserAvatar } from "@/components/calendar/UserAvatar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toneSurfaceClass } from "@/components/ui/tone";
import { userService } from "@/services/userService";
import { ExportButton } from "../ExportButton";

export type TLScorecardTab = "overview" | "records";

/** Current calendar quarter, e.g. "Q4 Active" — the program runs every quarter. */
const quarterLabel = (): string => `Q${Math.floor(new Date().getMonth() / 3) + 1} Active`;

const MAX_VISIBLE_AVATARS = 4;

/**
 * Overlapping direct-report avatar stack for the header meta line. Decorative:
 * renders nothing while loading, on error, or when the team is empty, so the
 * layout never shifts. Shares the ["team", "members"] query key, so it costs
 * no extra request when the team roster is already cached.
 */
const DirectReportStack: React.FC = () => {
  const { data: members } = useQuery({
    queryKey: ["team", "members"],
    queryFn: () => userService.getMyTeamMembers(),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  if (!members || members.length === 0) return null;
  const visible = members.slice(0, MAX_VISIBLE_AVATARS);
  const overflow = members.length - visible.length;
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden="true" className="text-border">
        •
      </span>
      <span role="group" aria-label="Direct reports" className="inline-flex items-center">
        {visible.map((m) => (
          <UserAvatar
            key={m.user.id}
            name={m.user.full_name || undefined}
            email={m.user.username}
            colorSeed={m.user.id}
            size="xs"
            className="ring-card -ml-1.5 ring-2 first:ml-0"
          />
        ))}
        {overflow > 0 && (
          <span
            aria-label={`${overflow} more team members`}
            className="bg-muted text-muted-foreground ring-card -ml-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ring-2"
          >
            +{overflow}
          </span>
        )}
      </span>
    </span>
  );
};

interface TLScorecardHeaderProps {
  subtitle?: string;
  tab: TLScorecardTab;
  onTabChange: (tab: TLScorecardTab) => void;
  /** ISO date inside the exported month; defaults to the current month. */
  month?: string;
  children: React.ReactNode;
}

/** Shell for the Albanian TL's authoring workspace: title, sections and tabs. */
export const TLScorecardHeader: React.FC<TLScorecardHeaderProps> = ({
  subtitle,
  tab,
  onTabChange,
  month,
  children,
}) => (
  <PageShell
    title="TL Scorecard"
    subtitle={
      subtitle ? (
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>{subtitle}</span>
          <DirectReportStack />
        </span>
      ) : undefined
    }
    titleBadge={
      <span
        role="status"
        aria-label={quarterLabel()}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${toneSurfaceClass.success}`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
        {quarterLabel()}
      </span>
    }
    actions={
      <>
        <ExportButton month={month} />
        <Button size="sm" asChild>
          <Link to="/tl-scorecard/visualize">
            <LineChart className="mr-2 h-4 w-4" aria-hidden="true" />
            Visualize
          </Link>
        </Button>
      </>
    }
  >
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="no-scrollbar -mx-1 min-w-0 flex-1 overflow-x-auto px-1">
          <Tabs value={tab} onValueChange={(value) => onTabChange(value as TLScorecardTab)}>
            <TabsList aria-label="Scorecard sections">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="records">Records</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <span className="text-muted-foreground hidden shrink-0 text-xs sm:inline-block">
          Last synced: Just now
        </span>
      </div>
      {children}
    </div>
  </PageShell>
);
