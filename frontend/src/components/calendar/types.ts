export type CalendarEventType = "standby" | "vacation" | "sick" | "holiday";
export type CalendarEventStatus = "pending" | "approved" | "rejected";

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  type: CalendarEventType;
  status: CalendarEventStatus;
  userId?: number;
  userName?: string;
  hours?: number;
  days?: number;
  description?: string;
  compactLabel: string;
  leaveBalance?: {
    total_days: number;
    used_days: number;
    pending_days: number;
    available_days: number;
    effective_available_days?: number;
    is_carry_over?: boolean;
    expires_at?: string | null;
  };
}
