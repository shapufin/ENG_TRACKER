import { useQuery } from "@tanstack/react-query";
import { payrollService } from "../services/payrollService";

/**
 * Whether the viewer may act on whole payroll runs (create, regenerate,
 * finalize, delete, export). Fails closed: until the server answers, and for
 * any answer other than "company", those actions stay hidden. Login and logout
 * clear the query cache, so one key is enough across users.
 */
export const usePayrollRunScope = () => {
  const { data } = useQuery({
    queryKey: ["payroll", "run-scope"],
    queryFn: () => payrollService.getRunScope(),
  });
  return { runScope: data, isCompanyScope: data === "company" };
};
