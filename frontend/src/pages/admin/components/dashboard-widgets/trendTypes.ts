import type { AdminPeople, AdminTrends } from "@/types";

export const TREND_PERIODS = ["3", "6", "12", "24"] as const;
export type TrendPeriod = (typeof TREND_PERIODS)[number];

export interface TrendWidgetProps {
  data?: AdminTrends;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

export interface PeopleWidgetProps {
  data?: AdminPeople;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}
