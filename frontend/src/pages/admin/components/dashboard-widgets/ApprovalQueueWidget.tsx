import React from "react";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAdminOverview, useAdminPeople } from "@/hooks/useAdminDashboardQueries";
import { ApprovalAgingBody } from "./ApprovalAgingBody";
import { ApprovalStatusBody } from "./ApprovalStatusBody";
import { ApproverSlaBody } from "./ApproverSlaBody";

interface ApprovalQueueWidgetProps {
  statusData: { name: string; value: number }[];
  statsLoading?: boolean;
}

// Each tab reads its own shared request, so only the tab on screen fetches; the
// requests are the same ones the overview and people widgets use (same query keys).
const AgingTab: React.FC = () => {
  const q = useAdminOverview(true);
  return (
    <ApprovalAgingBody
      data={q.data}
      isLoading={q.isLoading}
      isError={q.isError}
      onRetry={() => void q.refetch()}
    />
  );
};

const SpeedTab: React.FC = () => {
  const q = useAdminPeople(true);
  return (
    <ApproverSlaBody
      data={q.data}
      isLoading={q.isLoading}
      isError={q.isError}
      onRetry={() => void q.refetch()}
    />
  );
};

/** Request status, approval aging with the pending backlog, and approver speed in one card. */
export const ApprovalQueueWidget: React.FC<ApprovalQueueWidgetProps> = ({
  statusData,
  statsLoading,
}) => (
  <Tabs defaultValue="status" className="h-full">
    <ChartCard
      sectionId="approval-queue"
      title="Approval Queue"
      className="h-full"
      action={
        <TabsList aria-label="Approval queue views">
          <TabsTrigger value="status">Status</TabsTrigger>
          <TabsTrigger value="aging">Aging</TabsTrigger>
          <TabsTrigger value="speed">Speed</TabsTrigger>
        </TabsList>
      }
    >
      <TabsContent value="status" className="mt-0 h-full">
        <ApprovalStatusBody statusData={statusData} isLoading={statsLoading} />
      </TabsContent>
      <TabsContent value="aging" className="mt-0 h-full">
        <AgingTab />
      </TabsContent>
      <TabsContent value="speed" className="mt-0 h-full">
        <SpeedTab />
      </TabsContent>
    </ChartCard>
  </Tabs>
);
