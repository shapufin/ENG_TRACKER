import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WeeklyGeneratorDialog } from "./WeeklyGeneratorDialog";

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

interface PreviewEntry {
  date: string;
  start: string;
  end: string;
  hours: number;
  isWeekend: boolean;
  isEdited: boolean;
}

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    open: true,
    onOpenChange: vi.fn(),
    weeklyForm: {
      start_date: "",
      start_time: "22:00",
      end_time: "06:00",
      weekend_24h: false,
      user: "",
      description: "",
      client_ids: [] as number[],
    },
    weeklyPreview: [] as PreviewEntry[],
    users: [],
    clients: [{ id: 1, name: "E2E Test Client" }],
    isAdmin: false,
    isSubmitting: false,
    onSubmit: vi.fn(),
    onPatchWeeklyForm: vi.fn(),
    onUpdatePreviewRow: vi.fn(),
    onResetPreviewRow: vi.fn(),
    ...overrides,
  };
}

describe("WeeklyGeneratorDialog", () => {
  it("renders the weekend toggle as an accessible switch with an unchanged boolean payload", () => {
    const onPatchWeeklyForm = vi.fn();
    render(<WeeklyGeneratorDialog {...makeProps({ onPatchWeeklyForm })} />);

    const toggle = screen.getByRole("switch", { name: /weekend 24h/i });
    expect(toggle).not.toBeChecked();

    fireEvent.click(toggle);
    expect(onPatchWeeklyForm).toHaveBeenCalledWith({ weekend_24h: true });
  });

  it("gives every client checkbox an accessible name", () => {
    render(
      <WeeklyGeneratorDialog
        {...makeProps({
          clients: [
            { id: 1, name: "E2E Test Client" },
            { id: 2, name: "Second Client" },
          ],
        })}
      />
    );

    expect(screen.getByRole("checkbox", { name: "E2E Test Client" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Second Client" })).toBeInTheDocument();
  });

  it("uses an opaque blurred header surface in the preview table", () => {
    const weeklyPreview: PreviewEntry[] = [
      {
        date: "2026-08-31",
        start: "22:00",
        end: "06:00",
        hours: 8,
        isWeekend: true,
        isEdited: false,
      },
    ];
    render(<WeeklyGeneratorDialog {...makeProps({ weeklyPreview })} />);

    // Radix Dialog portals to document.body, so query the document.
    const thead = document.querySelector("thead");
    expect(thead?.className).toContain("bg-muted/90");
    expect(thead?.className).toContain("backdrop-blur-sm");
  });
});
