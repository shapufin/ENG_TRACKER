import React from "react";
import { PEOPLE_WIDGET_IDS } from "@/config/dashboardWidgets";
import { useAdminPeople } from "@/hooks/useAdminDashboardQueries";
import { GridCell } from "../dashboard-grid/GridCell";
import { PeopleMixWidget } from "./PeopleMixWidget";
import { RejectionAnalysisWidget } from "./RejectionAnalysisWidget";

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
    <>
      {isWidgetActive("people-mix") && (
        <GridCell id="people-mix">
          <PeopleMixWidget {...props} />
        </GridCell>
      )}
      {isWidgetActive("rejection-analysis") && (
        <GridCell id="rejection-analysis">
          <RejectionAnalysisWidget {...props} />
        </GridCell>
      )}
    </>
  );
};

/** Mounts the single admin_people request only while a people widget is on. */
export const PeopleSection: React.FC<PeopleSectionProps> = (props) =>
  PEOPLE_WIDGET_IDS.some((id) => props.isWidgetActive(id)) ? <Fetching {...props} /> : null;
