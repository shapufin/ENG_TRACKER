import { useQuery } from "@tanstack/react-query";
import { dashboardService } from "@/services/dashboardService";
import type { CalendarWorkspace } from "@/types";

export const useWorkspaceData = () =>
  useQuery({
    queryKey: ["workspaces"],
    queryFn: async (): Promise<CalendarWorkspace[]> => {
      const teamWorkspaces = await dashboardService.getMyTeamsWorkspaces();
      if (teamWorkspaces.length) return teamWorkspaces;
      const prefs = await dashboardService.getMyWorkspaces();
      return prefs.map(
        (p) =>
          ({
            id: p.calendar,
            name: p.calendar_name || "Unknown",
            code: "",
            description: "",
            color: p.calendar_color || "#3b82f6",
            icon: "",
            is_public: false,
            team: null,
            default_view: "month",
            show_overtime: false,
            show_standby: true,
            show_vacation: true,
            show_holidays: true,
          }) as CalendarWorkspace
      );
    },
  });
