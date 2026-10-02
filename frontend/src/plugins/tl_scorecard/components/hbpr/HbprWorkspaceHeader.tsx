import React from "react";
import { PageShell } from "@/components/layout/PageShell";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExportButton } from "../ExportButton";

export type HbprView = "overview" | "leaders" | "records" | "evidence";

const VIEWS: { value: HbprView; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "leaders", label: "Team leaders" },
  { value: "records", label: "Records" },
  { value: "evidence", label: "Evidence" },
];

const yearOptions = (): number[] => {
  const current = new Date().getFullYear();
  return [current - 3, current - 2, current - 1, current, current + 1];
};

interface HbprWorkspaceHeaderProps {
  view: HbprView;
  onViewChange: (view: HbprView) => void;
  year: number;
  onYearChange: (year: number) => void;
  exportLeaderId?: number;
  exportLeaderName?: string;
  children: React.ReactNode;
}

/** Workspace shell: title, reporting-period selector, evidence export and views. */
export const HbprWorkspaceHeader: React.FC<HbprWorkspaceHeaderProps> = ({
  view,
  onViewChange,
  year,
  onYearChange,
  exportLeaderId,
  exportLeaderName,
  children,
}) => (
  <PageShell
    title="HBPR Workspace"
    subtitle="Governance partnership with the Albanian team leaders assigned to you"
    actions={
      <>
        <div>
          <Label htmlFor="hbpr-reporting-year" className="text-xs">
            Reporting period
          </Label>
          <Select value={String(year)} onValueChange={(v) => onYearChange(Number(v))}>
            <SelectTrigger id="hbpr-reporting-year" className="mt-1 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions().map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {exportLeaderId !== undefined && (
          <div>
            <span className="text-muted-foreground block text-xs">
              Evidence export{exportLeaderName ? ` · ${exportLeaderName}` : ""}
            </span>
            <ExportButton leaderId={exportLeaderId} />
          </div>
        )}
      </>
    }
  >
    <div className="space-y-6">
      <Tabs value={view} onValueChange={(value) => onViewChange(value as HbprView)}>
        <TabsList aria-label="HBPR workspace sections">
          {VIEWS.map((v) => (
            <TabsTrigger key={v.value} value={v.value}>
              {v.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {children}
    </div>
  </PageShell>
);
