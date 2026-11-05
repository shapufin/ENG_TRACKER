import { useQuery } from "@tanstack/react-query";
import { payrollService } from "../services/payrollService";

/**
 * Whether the viewer may act on whole payroll runs (export, and for
 * administrators create, regenerate, finalize, delete). Fails closed: until the server answers, and for
 * any answer other than "company", those actions stay hidden. Login and logout
 * clear the query cache, so one key is enough across users.
 */
export const usePayrollRunScope = () => {
  const { data } = useQuery({
    queryKey: ["payroll", "run-scope"],
    queryFn: () => payrollService.getRunAccess(),
  });
  const isCompanyScope = data?.run_scope === "company";
  return {
    runScope: data?.run_scope,
    isCompanyScope,
    /** False for HR: runs are automatic, so only administrators change one by hand. */
    canMutateRuns: data?.can_mutate_runs === true,
  };
};
