import type { User } from "@/types";

export const teamLabel = (user: User) =>
  user.teams?.[0]?.name || (user as User & { team_name?: string }).team_name || "No team";

export const userDisplayName = (user: User) =>
  user.full_name || `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || user.username;

export const typeFilters = [
  { key: "vacation" as const, label: "Vacation", dot: "bg-emerald-400" },
  { key: "sick" as const, label: "Sick", dot: "bg-rose-400" },
  { key: "standby" as const, label: "Standby", dot: "bg-amber-400" },
] as const;
