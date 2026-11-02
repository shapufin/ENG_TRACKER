import { describe, it, expect, vi } from "vitest";
import { downloadTeamCSV, type TeamSummary } from "./teamCSVExport";

describe("downloadTeamCSV", () => {
  it("does nothing when summary is undefined", () => {
    const createObjectURL = vi.spyOn(window.URL, "createObjectURL");
    downloadTeamCSV("2024-06", undefined);
    expect(createObjectURL).not.toHaveBeenCalled();
    createObjectURL.mockRestore();
  });

  it("creates and downloads CSV with team data", () => {
    const createObjectURL = vi.spyOn(window.URL, "createObjectURL").mockReturnValue("blob:mock");
    const revokeObjectURL = vi.spyOn(window.URL, "revokeObjectURL");
    const click = vi.fn();
    const appendChild = vi.fn();
    const removeChild = vi.fn();
    vi.spyOn(document, "createElement").mockReturnValue({
      click,
      download: "",
    } as unknown as HTMLAnchorElement);
    vi.spyOn(document.body, "appendChild").mockImplementation(appendChild as any);
    vi.spyOn(document.body, "removeChild").mockImplementation(removeChild as any);

    const summary: TeamSummary = {
      total_tickets: 10,
      avg_resolution_hours: 2.5,
      sla_compliance_pct: 95,
      members: [{ user_id: 1, username: "alice", name: "Alice", total_tickets: 5 }],
    };

    downloadTeamCSV("2024-06-15", summary);

    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock");

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it("neutralises formulas in member names", async () => {
    let blob: Blob | undefined;
    vi.spyOn(window.URL, "createObjectURL").mockImplementation((b) => {
      blob = b as Blob;
      return "blob:mock";
    });
    vi.spyOn(window.URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(document, "createElement").mockReturnValue({
      click: vi.fn(),
      download: "",
    } as unknown as HTMLAnchorElement);
    vi.spyOn(document.body, "appendChild").mockImplementation(vi.fn() as any);

    downloadTeamCSV("2024-06-15", {
      total_tickets: 1,
      members: [{ user_id: 1, username: "eve", name: "=HYPERLINK(1)", total_tickets: 1 }],
    });

    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob as Blob);
    });
    expect(text).toContain("'=HYPERLINK(1),eve,1");
    vi.restoreAllMocks();
  });

  it("handles missing optional fields", () => {
    const createObjectURL = vi.spyOn(window.URL, "createObjectURL").mockReturnValue("blob:mock");
    const revokeObjectURL = vi.spyOn(window.URL, "revokeObjectURL");
    const click = vi.fn();
    vi.spyOn(document, "createElement").mockReturnValue({
      click,
      download: "",
    } as unknown as HTMLAnchorElement);
    vi.spyOn(document.body, "appendChild").mockReturnValue(undefined as any);
    vi.spyOn(document.body, "removeChild").mockReturnValue(undefined as any);

    downloadTeamCSV("2024-06-15", { total_tickets: 0 });

    expect(createObjectURL).toHaveBeenCalled();

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });
});
