import { useQuery } from "@tanstack/react-query";
import { userService } from "@/services/userService";

export const useTeamsPageData = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "teams"],
    queryFn: () => userService.getTeams({ page_size: 1000 }),
  });
  const { data: groupsData } = useQuery({
    queryKey: ["admin", "calendar-groups"],
    queryFn: () => userService.getCalendarGroups(),
  });

  return { data, isLoading, groupsData };
};
