import React from "react";
import { Link } from "react-router-dom";
import { LineChart } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type TLScorecardTab = "overview" | "records";

interface TLScorecardHeaderProps {
  subtitle?: string;
  tab: TLScorecardTab;
  onTabChange: (tab: TLScorecardTab) => void;
  children: React.ReactNode;
}

/** Shell for the Albanian TL's authoring workspace: title, sections and tabs. */
export const TLScorecardHeader: React.FC<TLScorecardHeaderProps> = ({
  subtitle,
  tab,
  onTabChange,
  children,
}) => (
  <PageShell
    title="TL Scorecard"
    subtitle={subtitle}
    actions={
      <Button variant="outline" size="sm" asChild>
        <Link to="/tl-scorecard/visualize">
          <LineChart className="mr-2 h-4 w-4" aria-hidden="true" />
          Visualize
        </Link>
      </Button>
    }
  >
    <div className="space-y-6">
      <Tabs value={tab} onValueChange={(value) => onTabChange(value as TLScorecardTab)}>
        <TabsList aria-label="Scorecard sections">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="records">Records</TabsTrigger>
        </TabsList>
      </Tabs>
      {children}
    </div>
  </PageShell>
);
