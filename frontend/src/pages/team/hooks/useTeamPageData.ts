import { useMemo } from "react";
import type { OvertimeLog, StandbyLog, LeaveRequest, UserProfile } from "@/types";
import { calcHours } from "./calcHours";
import { filterTeamRows } from "./filterTeamRows";
import { calcVacationDaysLeft } from "./useTeamPageDataHelpers";

export const useTeamPageData = (
  overtimeLogs: OvertimeLog[] | undefined,
  standbyLogs: StandbyLog[] | undefined,
  leaveRequests: LeaveRequest[] | undefined,
  teamMembers: UserProfile[] | undefined,
  teamBalances: unknown[] | undefined,
  filterStatus: string,
  filterTeam: string,
  dateFrom: string,
  dateTo: string,
  searchQuery: string
) => {
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const membersData = useMemo(() => (Array.isArray(teamMembers) ? teamMembers : []), [teamMembers]);

  const userTeamMap = useMemo(() => {
    const map = new Map<number, number[]>();
    membersData.forEach((member) => {
      const teamIds = member.teams_detail?.map((t) => t.id) || member.teams || [];
      map.set(member.user.id, teamIds);
    });
    return map;
  }, [membersData]);

  const userMetaMap = useMemo(() => {
    const map = new Map<number, { teamNames: string[]; italianTlName?: string | null }>();
    membersData.forEach((member) => {
      const teamNames =
        member.teams_detail?.map((team) => team.name).filter(Boolean) ||
        (member.team_name ? [member.team_name] : []);
      map.set(member.user.id, { teamNames, italianTlName: member.italian_tl_name?.trim() || null });
    });
    return map;
  }, [membersData]);

  const availableTeams = useMemo(() => {
    const teamSet = new Map<number, { id: number; name: string }>();
    membersData.forEach((member) => {
      (member.teams_detail || []).forEach((team) => {
        if (team.id && team.name && !teamSet.has(team.id))
          teamSet.set(team.id, { id: team.id, name: team.name });
      });
    });
    return Array.from(teamSet.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [membersData]);

  const vacationDaysLeft = useMemo(
    () => calcVacationDaysLeft(teamBalances, membersData, filterTeam),
    [teamBalances, membersData, filterTeam]
  );

  const overtimeHours = useMemo(
    () => calcHours(overtimeLogs || [], membersData, filterTeam, dateFrom, dateTo),
    [overtimeLogs, membersData, filterTeam, dateFrom, dateTo]
  );
  const standbyHours = useMemo(
    () => calcHours(standbyLogs || [], membersData, filterTeam, dateFrom, dateTo),
    [standbyLogs, membersData, filterTeam, dateFrom, dateTo]
  );

  const filterOptions = useMemo(
    () => ({ filterStatus, filterTeam, dateFrom, dateTo, normalizedSearch, userTeamMap }),
    [filterStatus, filterTeam, dateFrom, dateTo, normalizedSearch, userTeamMap]
  );

  const filteredOvertime = useMemo(
    () => filterTeamRows(overtimeLogs, filterOptions),
    [overtimeLogs, filterOptions]
  );
  const filteredStandby = useMemo(
    () => filterTeamRows(standbyLogs, filterOptions),
    [standbyLogs, filterOptions]
  );
  const filteredLeaves = useMemo(
    () => filterTeamRows(leaveRequests, filterOptions),
    [leaveRequests, filterOptions]
  );

  return {
    membersData,
    userTeamMap,
    userMetaMap,
    availableTeams,
    vacationDaysLeft,
    overtimeHours,
    standbyHours,
    filteredOvertime,
    filteredStandby,
    filteredLeaves,
  };
};
