import type { CalendarEvent } from "../types";

interface UseEventActionPermissionsOptions {
  event: CalendarEvent;
  currentUser: { id: number } | null;
  canViewTeamData: boolean;
}

export const useEventActionPermissions = ({
  event,
  currentUser,
  canViewTeamData,
}: UseEventActionPermissionsOptions) => {
  const isOwnRecord = currentUser && event.userId === currentUser.id;
  const isTL = canViewTeamData;
  const isHoliday = event.type === "holiday";
  const isSick = event.type === "sick";
  const isPending = event.status === "pending";

  return {
    showEdit: isOwnRecord && !isHoliday && event.type !== "standby",
    showDelete: (isOwnRecord && !isHoliday) || (isTL && !isHoliday),
    showApprovalActions: isTL && !isOwnRecord && !isHoliday && !isSick && isPending,
    showNoActionsMessage: !isOwnRecord && !isTL && !isHoliday && !isSick,
    isHoliday,
    isSick,
    isPending,
    isOwnRecord,
  };
};
