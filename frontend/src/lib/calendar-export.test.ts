import { describe, it, expect, vi, afterEach } from "vitest";
import { exportToCSV, exportToICal } from "./calendar-export";
import type { CalendarEvent } from "@/components/calendar/types";

const baseEvent: CalendarEvent = {
  id: "1",
  title: "Meeting",
  start: "2024-06-01",
  end: "2024-06-02",
  type: "vacation",
  status: "approved",
  userName: "Alice Smith",
  days: 2,
  hours: 16,
  description: 'Team "offsite"',
} as CalendarEvent;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const mockAnchor = () => {
  vi.spyOn(document, "createElement").mockReturnValue({
    click: vi.fn(),
    setAttribute: vi.fn(),
    style: {},
  } as unknown as HTMLAnchorElement);
  vi.spyOn(document.body, "appendChild").mockReturnValue(undefined as any);
  vi.spyOn(document.body, "removeChild").mockReturnValue(undefined as any);
};

const captureCsv = (events: CalendarEvent[]): string => {
  let captured = "";
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
  // Intercept the Blob constructor to capture content
  const origBlob = globalThis.Blob;
  vi.stubGlobal(
    "Blob",
    class MockBlob extends origBlob {
      constructor(parts: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options);
        captured = (parts?.[0] as string) ?? "";
      }
    }
  );
  mockAnchor();
  exportToCSV(events, "events");
  vi.unstubAllGlobals();
  return captured;
};

describe("exportToCSV", () => {
  it("downloads CSV with events", () => {
    const click = vi.fn();
    vi.spyOn(document, "createElement").mockReturnValue({
      click,
      setAttribute: vi.fn(),
      style: {},
    } as unknown as HTMLAnchorElement);
    vi.spyOn(document.body, "appendChild").mockReturnValue(undefined as any);
    vi.spyOn(document.body, "removeChild").mockReturnValue(undefined as any);
    exportToCSV([baseEvent], "events");
    expect(click).toHaveBeenCalled();
  });

  it("handles empty events", () => {
    const click = vi.fn();
    vi.spyOn(document, "createElement").mockReturnValue({
      click,
      setAttribute: vi.fn(),
      style: {},
    } as unknown as HTMLAnchorElement);
    vi.spyOn(document.body, "appendChild").mockReturnValue(undefined as any);
    vi.spyOn(document.body, "removeChild").mockReturnValue(undefined as any);
    exportToCSV([], "empty");
    expect(click).toHaveBeenCalled();
  });

  it("escapes embedded quotes and neutralises formula prefixes in title and user name", () => {
    const csv = captureCsv([
      { ...baseEvent, title: 'a"b,c', userName: '=HYPERLINK("x")' } as CalendarEvent,
    ]);
    const lines = csv.split("\n");
    const dataLine = lines[1];
    expect(dataLine).toContain('"a""b,c"');
    expect(dataLine).toContain('"\'=HYPERLINK(""x"")"');
  });
});

describe("exportToICal", () => {
  it("downloads ICS with events", () => {
    const click = vi.fn();
    vi.spyOn(document, "createElement").mockReturnValue({
      click,
      setAttribute: vi.fn(),
      style: {},
    } as unknown as HTMLAnchorElement);
    vi.spyOn(document.body, "appendChild").mockReturnValue(undefined as any);
    vi.spyOn(document.body, "removeChild").mockReturnValue(undefined as any);
    exportToICal([baseEvent], "calendar");
    expect(click).toHaveBeenCalled();
  });
});
