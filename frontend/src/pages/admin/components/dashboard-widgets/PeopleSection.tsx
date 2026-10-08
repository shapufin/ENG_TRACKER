import React from "react";
import { PEOPLE_WIDGET_IDS } from "@/config/dashboardWidgets";
import { useAdminPeople } from "@/hooks/useAdminDashboardQueries";
import { ApproverSlaWidget } from "./ApproverSlaWidget";
import { RejectionAnalysisWidget } from "./RejectionAnalysisWidget";
import { RoleDistributionWidget } from "./RoleDistributionWidget";
import { TechDistributionWidget } from "./TechDistributionWidget";

interface PeopleSectionProps {
  isWidgetActive: (id: string) => boolean;
}

const Fetching: React.FC<PeopleSectionProps> = ({ isWidgetActive }) => {
  const q = useAdminPeople(true);
  const props = {
    data: q.data,
    isLoading: q.isLoading,
    isError: q.isError,
    onRetry: () => void q.refetch(),
  };
  return (
    <div className="grid gap-4 lg:grid-cols-4">
      {isWidgetActive("role-distribution") && <RoleDistributionWidget {...props} />}
      {isWidgetActive("tech-distribution") && <TechDistributionWidget {...props} />}
      {isWidgetActive("rejection-analysis") && <RejectionAnalysisWidget {...props} />}
      {isWidgetActive("approver-sla") && <ApproverSlaWidget {...props} />}
    </div>
  );
};

/** Mounts the single admin_people request only while a people widget is on. */
export const PeopleSection: React.FC<PeopleSectionProps> = (props) =>
  PEOPLE_WIDGET_IDS.some((id) => props.isWidgetActive(id)) ? <Fetching {...props} /> : null;
