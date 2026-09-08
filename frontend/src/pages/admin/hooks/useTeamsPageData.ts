import { useQuery } from "@tanstack/react-query";
import { userService } from "@/services/userService";
import type { UserProfile } from "@/types";

export const useTeamsPageData = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "teams"],
    queryFn: () => userService.getTeams(),
  });
  const { data: profilesData } = useQuery({
    queryKey: ["admin", "profiles"],
    queryFn: () => userService.getProfiles(),
  });
  const { data: groupsData } = useQuery({
    queryKey: ["admin", "calendar-groups"],
    queryFn: () => userService.getCalendarGroups(),
  });

  const profiles = profilesData?.results || [];

  return { data, isLoading, groupsData, profiles: profiles as UserProfile[] };
};
