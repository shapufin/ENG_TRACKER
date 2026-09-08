import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

export const useInvalidateVacationData = () => {
  const qc = useQueryClient();
  return useCallback(() => {
    qc.invalidateQueries({ queryKey: ["vacations", "calendar"] });
    qc.invalidateQueries({ queryKey: ["vacations", "balances"] });
    qc.invalidateQueries({ queryKey: ["vacations", "team-balances"] });
  }, [qc]);
};
