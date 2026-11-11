import { describe, it, expect, vi, beforeEach } from "vitest";
import api from "@/lib/api";
import { ticketKPIService } from "./ticketKPIService";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() },
}));

vi.mock("@/lib/api-utils", () => ({
  normalizeList: (d: any) => (Array.isArray(d) ? d : (d?.results ?? [])),
}));

const BASE = "/plugins/ticket_kpi";

beforeEach(() => vi.clearAllMocks());

describe("getEvidence pagination", () => {
  it("follows every page so a large squad is not cut at the page size", async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: { next: "x?page=2", results: [{ id: 1 }] } } as any)
      .mockResolvedValueOnce({ data: { next: null, results: [{ id: 2 }] } } as any);
    const rows = await ticketKPIService.getEvidence({ month: "2026-01-01" });
    expect(rows.map((r) => r.id)).toEqual([1, 2]);
    expect(api.get).toHaveBeenLastCalledWith(`${BASE}/evidence/`, {
      params: { month: "2026-01-01", page: 2 },
    });
  });
});

describe("ticketKPIService URL contracts", () => {
  it("getProfiles calls /plugins/ticket_kpi/profiles/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] } as any);
    await ticketKPIService.getProfiles();
    expect(api.get).toHaveBeenCalledWith(`${BASE}/profiles/`);
  });

  it("getMonthlySummary calls /plugins/ticket_kpi/dashboard/monthly_summary/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: {} } as any);
    await ticketKPIService.getMonthlySummary("2026-01-01");
    expect(api.get).toHaveBeenCalledWith(`${BASE}/dashboard/monthly_summary/`, {
      params: { month: "2026-01-01" },
    });
  });

  it("getEvidence calls /plugins/ticket_kpi/evidence/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] } as any);
    await ticketKPIService.getEvidence();
    expect(api.get).toHaveBeenCalledWith(`${BASE}/evidence/`, { params: undefined });
  });

  it("getTickets calls /plugins/ticket_kpi/dashboard/tickets/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { results: [], count: 0 } } as any);
    await ticketKPIService.getTickets({ month: "2026-01-01", year: 2026 });
    expect(api.get).toHaveBeenCalledWith(`${BASE}/dashboard/tickets/`, {
      params: { month: "2026-01-01", year: "2026" },
    });
  });

  it("createLink POSTs to /plugins/ticket_kpi/links/", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} } as any);
    await ticketKPIService.createLink(1, 2);
    expect(api.post).toHaveBeenCalledWith(`${BASE}/links/`, {
      overtime_log: 1,
      normalized_ticket: 2,
      note: "",
    });
  });

  it("never uses /api/ prefix", () => {
    expect(BASE).not.toContain("/api/");
    expect(BASE).toBe("/plugins/ticket_kpi");
  });
});
