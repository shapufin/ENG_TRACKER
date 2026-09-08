import { useQuery } from "@tanstack/react-query";
import { reportService, type TeamOption, type WorkspaceOption } from "@/services/reportService";
import { userService } from "@/services/userService";
import type { TeamLeaderOption } from "./useHRReportManagement";

export const useHRReportFilterOptions = () => {
  const { data: italianTLs } = useQuery<TeamLeaderOption[]>({
    queryKey: ["hr", "italian-tls"],
    queryFn: () => userService.getItalianTeamLeaders(),
    refetchOnMount: true,
    staleTime: 300000,
    refetchOnWindowFocus: false,
  });

  const { data: albanianTLs } = useQuery<TeamLeaderOption[]>({
    queryKey: ["hr", "albanian-tls"],
    queryFn: () => userService.getAlbanianTeamLeaders(),
    refetchOnMount: true,
    staleTime: 300000,
    refetchOnWindowFocus: false,
  });

  const { data: teams } = useQuery<TeamOption[]>({
    queryKey: ["hr", "teams"],
    queryFn: () => reportService.getTeams(),
    refetchOnMount: true,
    staleTime: 300000,
    refetchOnWindowFocus: false,
  });

  const { data: workspaces } = useQuery<WorkspaceOption[]>({
    queryKey: ["hr", "workspaces"],
    queryFn: () => reportService.getWorkspaces(),
    refetchOnMount: true,
    staleTime: 300000,
    refetchOnWindowFocus: false,
  });

  return { italianTLs, albanianTLs, teams, workspaces };
};
