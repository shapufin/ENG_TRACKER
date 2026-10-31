import { useQuery } from "@tanstack/react-query";
import { userService } from "@/services/userService";

export const useTeamsPageData = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "teams"],
    queryFn: () => userService.getTeams({ page_size: 1000, is_active: "all" }),
  });
  const { data: groupsData } = useQuery({
    queryKey: ["admin", "calendar-groups"],
    queryFn: () => userService.getCalendarGroups(),
  });
  // People who can lead a team, for the edit dialog's leader picker.
  const { data: leaders } = useQuery({
    queryKey: ["admin", "team-leaders", "all"],
    queryFn: () => userService.getTeamLeaders("all"),
  });

  return { data, isLoading, groupsData, leaders: leaders ?? [] };
};
