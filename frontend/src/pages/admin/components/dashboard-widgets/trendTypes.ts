import type { AdminPeople, AdminTrends } from "@/types";

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
