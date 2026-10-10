export interface TeamsColumn {
  id: string;
  label: string;
  width: string;
}

export const TEAMS_COLUMNS: TeamsColumn[] = [
  { id: "team", label: "Team", width: "2fr" },
  { id: "code", label: "Code", width: "1.5fr" },
  { id: "calendar_group", label: "Calendar Group", width: "1.5fr" },
  { id: "members", label: "Members", width: "1fr" },
  { id: "leader", label: "Leader", width: "1fr" },
  { id: "actions", label: "Actions", width: "120px" },
];

export const TEAMS_COLUMNS_STORAGE_KEY = "table-visibility-calendar-teams";

export const isTeamsColumnVisible = (
  visibility: Record<string, boolean>,
  id: string
): boolean => visibility[id] ?? true;

export const teamsGridTemplate = (visibility: Record<string, boolean>): string =>
  `80px ${TEAMS_COLUMNS.filter((c) => isTeamsColumnVisible(visibility, c.id))
    .map((c) => c.width)
    .join(" ")}`;

export const loadTeamsColumnVisibility = (): Record<string, boolean> => {
  try {
    const saved = localStorage.getItem(TEAMS_COLUMNS_STORAGE_KEY);
    if (!saved) return {};
    const parsed = JSON.parse(saved);
    if (!parsed._version) {
      localStorage.removeItem(TEAMS_COLUMNS_STORAGE_KEY);
      return {};
    }
    const visibility = { ...parsed };
    delete (visibility as { _version?: unknown })._version;
    return visibility;
  } catch {
    return {};
  }
};

export const saveTeamsColumnVisibility = (visibility: Record<string, boolean>): void => {
  localStorage.setItem(
    TEAMS_COLUMNS_STORAGE_KEY,
    JSON.stringify({ _version: 1, ...visibility })
  );
};
