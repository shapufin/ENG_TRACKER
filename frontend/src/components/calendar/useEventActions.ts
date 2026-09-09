import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { leaveService } from "@/services/leaveService";
import { standbyService } from "@/services/standbyService";
import { handleApiError } from "@/lib/error-handler";
import type { CalendarEvent } from "./types";

export const useEventActions = (event: CalendarEvent | null, onClose: () => void) => {
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const recordId = event ? parseInt(event.id.split("-")[1] || "0", 10) : 0;
  const isLeave = event?.type === "vacation" || event?.type === "sick";
  const isStandby = event?.type === "standby";

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["vacations", "calendar"] });
    queryClient.invalidateQueries({ queryKey: ["standby", "calendar"] });
  };

  const withSubmitting = async (fn: () => Promise<void>) => {
    if (!recordId) return;
    setIsSubmitting(true);
    try {
      await fn();
      invalidate();
      onClose();
    } catch (error) {
      handleApiError(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveEdit = async (data: { start: string; end: string; reason: string }) => {
    await withSubmitting(async () => {
      if (isLeave) {
        await leaveService.updateRequest(recordId, {
          start_date: data.start,
          end_date: data.end,
          reason: data.reason,
        });
      }
    });
  };

  const remove = async () => {
    await withSubmitting(async () => {
      if (isLeave) {
        await leaveService.deleteRequest(recordId);
      } else if (isStandby) {
        await standbyService.deleteLog(recordId);
      }
    });
  };

  const approve = async () => {
    await withSubmitting(async () => {
      if (isLeave) {
        await leaveService.approve(recordId);
      } else if (isStandby) {
        await standbyService.approve(recordId);
      }
    });
  };

  const reject = async (reason: string) => {
    await withSubmitting(async () => {
      if (isLeave) {
        await leaveService.reject(recordId, reason);
      } else if (isStandby) {
        await standbyService.reject(recordId, reason);
      }
    });
  };

  return {
    isSubmitting,
    saveEdit,
    remove,
    approve,
    reject,
  };
};
