export const chartTooltipStyle = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "var(--radius)",
  color: "hsl(var(--popover-foreground))",
  fontSize: 12,
  boxShadow: "0 4px 16px -4px hsl(var(--foreground) / 0.15)",
};

export const axisTickStyle = { fontSize: 12, fill: "hsl(var(--muted-foreground))" };

/** "2026-10" -> "Oct". */
export const monthLabel = (ym: string): string => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, (m || 1) - 1, 1).toLocaleString("en", { month: "short" });
};

/** One decimal, no trailing ".0": 12.5 -> "12.5", 16 -> "16". */
export const fmt1 = (n: number): string => String(Math.round(n * 10) / 10);
