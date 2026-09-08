import React from "react";
import { UserStatusModal } from "@/components/calendar/UserStatusModal";
import { EventActionModal } from "@/components/calendar/EventActionModal";
import { ConflictsModal } from "@/components/calendar/ConflictsModal";
import { CalendarFormDialog } from "./CalendarFormDialog";
import type { User } from "@/types";
import type { useCalendarPageData } from "../hooks/useCalendarPageData";

type CalendarData = ReturnType<typeof useCalendarPageData>;

interface CalendarPageModalsProps {
  user: User | null;
  canViewTeamData: boolean;
  data: CalendarData;
}

export const CalendarPageModals: React.FC<CalendarPageModalsProps> = ({
  user,
  canViewTeamData,
  data,
}) => (
  <>
    <CalendarFormDialog
      open={data.dialogOpen}
      onOpenChange={data.handleDialogOpenChange}
      title={`${data.requestType === "sick" ? "New Sick Leave" : "New Vacation"}${data.selectedDates ? ` (${data.selectedDates.start} to ${data.selectedDates.end})` : ""}`}
      requestType={data.requestType}
      onRequestTypeChange={data.setRequestType}
      reason={data.reason}
      onReasonChange={data.setReason}
      carryOverAndBalance={data.carryOverAndBalance}
      isSubmitting={data.createRequest.isPending}
      isError={data.createRequest.isError}
      error={data.createRequest.error as Error | null}
      onSubmit={data.handleSubmit}
    />

    <UserStatusModal
      open={Boolean(data.activeModalUser) && data.userModalOpen}
      onOpenChange={data.setUserModalOpen}
      user={
        data.activeModalUser || { id: 0, username: "", email: "", first_name: "", last_name: "" }
      }
      vacationBalances={data.selectedUserBalances}
      holidays={data.holidayData}
    />

    <EventActionModal
      open={Boolean(data.actionModalEvent)}
      onOpenChange={(open) => !open && data.setActionModalEvent(null)}
      event={data.actionModalEvent}
      currentUser={user}
      canViewTeamData={canViewTeamData}
    />

    <ConflictsModal
      open={data.conflictsModalOpen}
      onOpenChange={data.setConflictsModalOpen}
      conflicts={data.allConflictEntries}
    />
  </>
);
