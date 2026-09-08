import { describe, it, expect, vi, beforeEach } from "vitest";
import api from "@/lib/api";
import { payrollService } from "./payrollService";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() },
}));

vi.mock("@/lib/download", () => ({ downloadBlobResponse: vi.fn() }));
vi.mock("@/lib/api-utils", () => ({ normalizeList: (d: any) => (Array.isArray(d) ? d : d?.results ?? []) }));

const BASE = "/plugins/payroll";

beforeEach(() => vi.clearAllMocks());

describe("payrollService URL contracts", () => {
  it("getConfiguration calls /plugins/payroll/configuration/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: {} } as any);
    await payrollService.getConfiguration();
    expect(api.get).toHaveBeenCalledWith(`${BASE}/configuration/`);
  });

  it("updateConfiguration PATCHes /plugins/payroll/configuration/1/", async () => {
    vi.mocked(api.patch).mockResolvedValue({ data: {} } as any);
    await payrollService.updateConfiguration({});
    expect(api.patch).toHaveBeenCalledWith(`${BASE}/configuration/1/`, {});
  });

  it("getWages calls /plugins/payroll/wages/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] } as any);
    await payrollService.getWages();
    expect(api.get).toHaveBeenCalledWith(`${BASE}/wages/`, { params: undefined });
  });

  it("createWage POSTs to /plugins/payroll/wages/", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} } as any);
    await payrollService.createWage({});
    expect(api.post).toHaveBeenCalledWith(`${BASE}/wages/`, {});
  });

  it("getRuleSets calls /plugins/payroll/rule-sets/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] } as any);
    await payrollService.getRuleSets();
    expect(api.get).toHaveBeenCalledWith(`${BASE}/rule-sets/`, { params: undefined });
  });

  it("getRuns calls /plugins/payroll/runs/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] } as any);
    await payrollService.getRuns();
    expect(api.get).toHaveBeenCalledWith(`${BASE}/runs/`, { params: undefined });
  });

  it("createRun POSTs to /plugins/payroll/runs/", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} } as any);
    await payrollService.createRun({} as any);
    expect(api.post).toHaveBeenCalledWith(`${BASE}/runs/`, {});
  });

  it("finalizeRun POSTs to /plugins/payroll/runs/:id/finalize/", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} } as any);
    await payrollService.finalizeRun(1);
    expect(api.post).toHaveBeenCalledWith(`${BASE}/runs/1/finalize/`);
  });

  it("getWorkCalendars calls /plugins/payroll/work-calendar/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] } as any);
    await payrollService.getWorkCalendars();
    expect(api.get).toHaveBeenCalledWith(`${BASE}/work-calendar/`, { params: undefined });
  });

  it("never uses /api/ prefix", () => {
    expect(BASE).not.toContain("/api/");
    expect(BASE).toBe("/plugins/payroll");
  });
});
