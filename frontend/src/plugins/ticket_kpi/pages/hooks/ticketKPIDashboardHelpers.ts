export const getInitialMonth = (queryMonth: string | null) => {
  if (queryMonth && /^\d{4}-\d{2}(-\d{2})?$/.test(queryMonth)) {
    const [year, month] = queryMonth.split("-");
    return `${year}-${month}-01`;
  }
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const buildStats = (monthlyKPI: any) => ({
  total: monthlyKPI?.total_tickets ?? 0,
  closed: monthlyKPI?.closed_tickets ?? 0,
  avgRes: monthlyKPI?.avg_resolution_hours ?? "N/A",
  sla: monthlyKPI?.sla_compliance_pct ?? "N/A",
  p50: monthlyKPI?.p50_resolution_hours ?? "N/A",
  p90: monthlyKPI?.p90_resolution_hours ?? "N/A",
  comparison: monthlyKPI?.comparison ?? null,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const buildTrendChartData = (trendData: any[] | undefined) =>
  trendData?.map((d) => ({
    month: d.month,
    tickets: d.total_tickets,
    avgHours: d.avg_resolution_hours ?? 0,
  })) ?? [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const buildCategoryChartData = (categoryData: any) =>
  categoryData
    ? Object.entries(categoryData.by_category || {}).map(([name, value]) => ({
        name,
        value: Number(value),
      }))
    : [];
