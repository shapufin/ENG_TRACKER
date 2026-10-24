import { useQuery } from "@tanstack/react-query";
import { overtimeService, type OvertimeHoursPreview } from "@/services/overtimeService";

type Args = {
  date: string;
  startTime: string;
  endTime: string;
  /** The entry being edited, left out of its own preview. */
  editingId: number | null;
  /** Admin creating for someone else. */
  user?: string;
};

const CLOCK = /^\d{2}:\d{2}/;

/** What the entry in the form would be paid, given the person's other entries that day. */
export const useOvertimeHoursPreview = ({ date, startTime, endTime, editingId, user }: Args) =>
  useQuery({
    queryKey: ["overtime", "hours-preview", date, startTime, endTime, editingId, user],
    queryFn: () =>
      overtimeService.previewHours({
        date,
        start_time: startTime,
        end_time: endTime,
        exclude: editingId ?? undefined,
        user,
      }),
    enabled: !!date && CLOCK.test(startTime) && CLOCK.test(endTime),
    retry: false,
  });

const clock = (value: string) => value.slice(0, 5);

/** Small caption under the preview: the block the entry shares, or that it is covered. */
export const previewNote = (preview: OvertimeHoursPreview | undefined) => {
  if (!preview) return undefined;
  const window = `${clock(preview.paid_window_start)}-${clock(preview.paid_window_end)}`;
  return preview.hours === 0 ? `Covered by ${window}` : `Block ${window}`;
};
