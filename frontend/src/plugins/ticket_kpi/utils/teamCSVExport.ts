export interface TeamMemberRow {
  user_id: number;
  username: string;
  name: string;
  total_tickets: number;
  closed_tickets?: number;
  open_tickets?: number;
  avg_resolution_hours?: number;
  sla_compliance_pct?: number;
  sla_breached_count?: number;
  fields_populated?: string[];
  field_breakdowns?: Record<string, Record<string, number>>;
}

export interface TeamSummary {
  total_tickets: number;
  avg_resolution_hours?: number;
  sla_compliance_pct?: number;
  members?: TeamMemberRow[];
  members_with_data?: number;
}

export const downloadTeamCSV = (month: string, summary?: TeamSummary) => {
  if (!summary) return;
  const rows = [
    ["Team KPI Report", month],
    ["Total Tickets", summary.total_tickets],
    ["Avg Resolution (h)", summary.avg_resolution_hours ?? "N/A"],
    ["SLA Compliance (%)", summary.sla_compliance_pct ?? "N/A"],
    [],
    ["Name", "Username", "Tickets", "Avg Resolution (h)", "SLA Compliance (%)"],
    ...(summary.members || []).map((m) => [
      m.name,
      m.username,
      m.total_tickets,
      m.avg_resolution_hours ?? "N/A",
      m.sla_compliance_pct ?? "N/A",
    ]),
  ];
  const csv = rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `team_kpi_${month.slice(0, 7)}.csv`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
};
