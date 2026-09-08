import { describe, it, expect, vi, beforeEach } from "vitest";
import { exportData } from "./exportUtils";

type MockLink = { href: string; download: string; click: ReturnType<typeof vi.fn> };

const createMockLink = (): MockLink => ({ href: "", download: "", click: vi.fn() });
const asAnchor = (link: MockLink) => link as unknown as HTMLAnchorElement;

describe("exportData utility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.document = {
      createElement: vi.fn(),
    } as unknown as Document;
    globalThis.URL = {
      createObjectURL: vi.fn(),
      revokeObjectURL: vi.fn(),
    } as unknown as typeof URL;
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
});
