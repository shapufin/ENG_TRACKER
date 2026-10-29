import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { exportData } from "./exportUtils";

type MockLink = { href: string; download: string; click: ReturnType<typeof vi.fn> };

const createMockLink = (): MockLink => ({ href: "", download: "", click: vi.fn() });
const asAnchor = (link: MockLink) => link as unknown as HTMLAnchorElement;

describe("exportData utility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(document, "createElement");
    vi.spyOn(URL, "createObjectURL");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should export data as JSON", () => {
    const mockLink = createMockLink();
    vi.mocked(document.createElement).mockReturnValue(asAnchor(mockLink));
    vi.mocked(URL.createObjectURL).mockReturnValue("blob:url");

    const data = [{ id: 1, name: "Test" }];
    exportData(data, "test-file", "json");

    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(document.createElement).toHaveBeenCalledWith("a");
    expect(mockLink.click).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:url");
  });

  it("should export data as CSV with custom config", () => {
    const mockLink = createMockLink();
    vi.mocked(document.createElement).mockReturnValue(asAnchor(mockLink));
    vi.mocked(URL.createObjectURL).mockReturnValue("blob:url");

    const data = [
      { id: 1, name: "Test", value: 100 },
      { id: 2, name: "Another", value: 200 },
    ];
    exportData(data, "test-file", "csv", {
      headers: ["ID", "Name", "Value"],
      rowMapper: (item) => [String(item.id), item.name, String(item.value)],
    });

    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(document.createElement).toHaveBeenCalledWith("a");
    expect(mockLink.click).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:url");
  });

  it("should handle empty data array", () => {
    const mockLink = createMockLink();
    vi.mocked(document.createElement).mockReturnValue(asAnchor(mockLink));
    vi.mocked(URL.createObjectURL).mockReturnValue("blob:url");

    exportData([], "test-file", "json");

    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(mockLink.click).toHaveBeenCalled();
  });

  it("should not export CSV without config", () => {
    const mockLink = createMockLink();
    vi.mocked(document.createElement).mockReturnValue(asAnchor(mockLink));

    exportData([{ id: 1 }], "test-file", "csv");

    expect(mockLink.click).not.toHaveBeenCalled();
  });

  it("should escape quotes in CSV data", () => {
    const mockLink = createMockLink();
    vi.mocked(document.createElement).mockReturnValue(asAnchor(mockLink));
    vi.mocked(URL.createObjectURL).mockReturnValue("blob:url");

    const data = [{ id: 1, name: 'Test "quoted"' }];
    exportData(data, "test-file", "csv", {
      headers: ["ID", "Name"],
      rowMapper: (item) => [String(item.id), item.name],
    });

    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(mockLink.click).toHaveBeenCalled();
  });

  it("neutralises spreadsheet formulas and keeps quoting valid", async () => {
    const mockLink = createMockLink();
    vi.mocked(document.createElement).mockReturnValue(asAnchor(mockLink));
    vi.mocked(URL.createObjectURL).mockReturnValue("blob:url");

    exportData([{ a: "=HYPERLINK(1)", b: '@cmd "x"', c: "plain, text", d: "-5" }], "f", "csv", {
      headers: ["A", "B", "C", "D"],
      rowMapper: (r) => [r.a, r.b, r.c, r.d],
    });

    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob);
    });
    expect(text.split("\n")[1]).toBe(`'=HYPERLINK(1),"'@cmd ""x""","plain, text",'-5`);
  });
});
