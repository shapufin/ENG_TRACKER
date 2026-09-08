import { useContext } from "react";
import { CalendarWorkspaceContext } from "@/context/calendar-workspace-context-base";

export const useCalendarWorkspace = () => {
  const context = useContext(CalendarWorkspaceContext);
  if (!context) {
    throw new Error("useCalendarWorkspace must be used within a CalendarWorkspaceProvider");
  }
  return context;
};
