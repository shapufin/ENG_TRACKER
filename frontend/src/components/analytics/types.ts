export interface AnalyticsMetric {
  name: string;
  value: number;
  change: number;
  unit?: string;
  trend: "up" | "down" | "stable";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: any;
}

export interface AnalyticsData {
  metrics: AnalyticsMetric[];
}

export interface TeamOption {
  id: number;
  name: string;
}

export interface UserOption {
  id: number;
  username: string;
  full_name?: string;
}

export interface Hotspot {
  team: string;
  hours: number;
  severity: string;
}

export interface TrendPoint {
  date: string;
  hours?: number;
  count?: number;
  approved?: number;
  pending?: number;
  rejected?: number;
  new_users?: number;
  new_active?: number;
}

export interface AnalyticsTrends {
  overtime: TrendPoint[];
  standby: TrendPoint[];
  leave: TrendPoint[];
  user_activity: TrendPoint[];
}

export interface AnalyticsInsight {
  type: "trend_up" | "trend_down" | "concentration" | "backlog" | "spike" | "status_bottleneck";
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  metric: string;
  change: number;
}
