import React from "react";
import { Badge } from "@/components/ui/badge";
import type { DetailedUserReport } from "@/services/reportService";
import { HRTableShell } from "./HRTableShell";

interface HRPersonnelTableProps {
  users: DetailedUserReport[];
}

// fallow-ignore-next-line complexity
const HRPersonnelRow: React.FC<{ user: DetailedUserReport }> = ({ user: u }) => (
  <tr key={u.user_id} className="group transition-colors hover:bg-primary/[0.02]">
    <td className="px-6 py-4">
      <div className="flex flex-col">
        <span className="font-semibold">{u.full_name}</span>
        <span className="font-mono text-[10px] text-muted-foreground">@{u.username}</span>
      </div>
    </td>
    <td className="px-6 py-4">
      <Badge
        variant="secondary"
        className="bg-muted text-[10px] font-bold uppercase tracking-tighter"
      >
        {u.team || "Unassigned"}
      </Badge>
    </td>
    <td className="px-6 py-4 text-right font-mono">
      <span className="font-bold">{u.overtime?.total_hours ?? 0}</span>
      <span className="text-muted-foreground">/{u.overtime?.approved_hours ?? 0}</span>
    </td>
    <td className="px-6 py-4 text-right font-mono">
      <span className="font-bold">{u.standby?.total_hours ?? 0}</span>
      <span className="text-muted-foreground">/{u.standby?.approved_hours ?? 0}</span>
    </td>
    <td className="px-6 py-4 text-right font-mono">
      <span className="font-bold">{u.leave?.total_days ?? 0}</span>
      <span className="text-muted-foreground">/{u.leave?.approved_days ?? 0}</span>
    </td>
    <td className="px-6 py-4 text-right font-mono">{u.leave_balance ?? 0}</td>
  </tr>
);

export const HRPersonnelTable: React.FC<HRPersonnelTableProps> = ({ users }) => (
  <HRTableShell
    title="Identity Breakdown (Aggregated)"
    headers={[
      { label: "Identity" },
      { label: "Team" },
      { label: "Overtime (Total/Appr)", align: "right" },
      { label: "Standby (Total/Appr)", align: "right" },
      { label: "Leaves (Total/Appr)", align: "right" },
      { label: "Balance Left", align: "right" },
    ]}
  >
    {users.length > 0 ? (
      users.map((u) => <HRPersonnelRow key={u.user_id} user={u} />)
    ) : (
      <tr>
        <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
          No users found.
        </td>
      </tr>
    )}
  </HRTableShell>
);
