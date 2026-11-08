import { useState } from "react";
import { MOBILE_CARD_QUERY } from "@/components/ui/DataTableCards";
import { useMediaQuery } from "@/hooks/useMediaQuery";

/**
 * Tap a phone card to read the whole record in a sheet. `onRowClick` is only
 * defined below md, so tables on tablet and desktop keep their current behaviour.
 */
export const usePhoneRecordDetail = <T>() => {
  const isPhone = useMediaQuery(MOBILE_CARD_QUERY);
  const [record, setRecord] = useState<T | null>(null);
  return {
    record,
    onRowClick: isPhone ? (row: T) => setRecord(row) : undefined,
    onOpenChange: (open: boolean) => {
      if (!open) setRecord(null);
    },
  };
};
