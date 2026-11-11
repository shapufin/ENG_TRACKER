import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import { HbprAssignmentsPage } from "./HbprAssignmentsPage";
import { hbprAssignmentService } from "@/services/hbprAssignmentService";
import api from "@/lib/api";

vi.mock("@/services/hbprAssignmentService", () => ({
  hbprAssignmentService: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    end: vi.fn(),
    reassign: vi.fn(),
  },
}));

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));

// Radix Select is unreliable to drive via fireEvent in JSDOM: render it flat.
vi.mock("@/components/ui/select", () => {
  const Ctx = React.createContext<{ onValueChange?: (v: string) => void }>({});
  return {
    Select: ({
      children,
      onValueChange,
    }: {
      children: React.ReactNode;
      onValueChange?: (v: string) => void;
    }) => <Ctx.Provider value={{ onValueChange }}>{children}</Ctx.Provider>,
    SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => {
      const ctx = React.useContext(Ctx);
      return (
        <button type="button" role="option" onClick={() => ctx.onValueChange?.(value)}>
          {children}
        </button>
      );
    },
    SelectTrigger: ({
      id,
      "aria-label": label,
      children,
    }: {
      id?: string;
      "aria-label"?: string;
      children: React.ReactNode;
    }) => (
      <button type="button" role="combobox" id={id} aria-label={label}>
        {children}
      </button>
    ),
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  };
});

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

const unsetAssignment = {
  id: 5,
  hbpr: 10,
  albanian_tl: 20,
  hbpr_detail: { id: 10, name: "Elda Partner" },
  albanian_tl_detail: { id: 20, name: "Enri Leader" },
  cadence: null,
  cadence_display: "Not set",
  cadence_missing: true,
  effective_from: "2026-01-01",
  effective_to: null,
  is_current: true,
  last_meeting_on: null,
  next_due_on: null,
  cadence_status: "cadence_not_set" as const,
  evidence_count: 0,
};

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <HbprAssignmentsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe("HbprAssignmentsPage optional cadence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue({
      data: {
        results: [
          { id: 10, first_name: "Elda", last_name: "Partner", roles: ["hbpr"] },
          { id: 20, first_name: "Enri", last_name: "Leader", roles: ["albanian_tl"] },
        ],
      },
    } as never);
  });

  it("creates an assignment without any cadence keys by default", async () => {
    vi.mocked(hbprAssignmentService.list).mockResolvedValue({ data: [unsetAssignment] } as never);
    vi.mocked(hbprAssignmentService.create).mockResolvedValue({ data: unsetAssignment } as never);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /new assignment/i }));

    expect(await screen.findByText("Set later by the Line Manager")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("option", { name: "Elda Partner" }));
    fireEvent.click(await screen.findByRole("option", { name: "Enri Leader" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(hbprAssignmentService.create).toHaveBeenCalled());
    const payload = vi.mocked(hbprAssignmentService.create).mock.calls[0][0];
    expect(payload).toMatchObject({ hbpr: 10, albanian_tl: 20 });
    expect(payload).not.toHaveProperty("cadence");
    expect(payload).not.toHaveProperty("cadence_day_of_week");
    expect(payload).not.toHaveProperty("cadence_nth_week");
  });

  it("sends the cadence once the admin picks one", async () => {
    vi.mocked(hbprAssignmentService.list).mockResolvedValue({ data: [unsetAssignment] } as never);
    vi.mocked(hbprAssignmentService.create).mockResolvedValue({ data: unsetAssignment } as never);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /new assignment/i }));
    fireEvent.click(await screen.findByRole("option", { name: "Elda Partner" }));
    fireEvent.click(await screen.findByRole("option", { name: "Enri Leader" }));
    fireEvent.click(screen.getByRole("option", { name: "Biweekly" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(hbprAssignmentService.create).toHaveBeenCalled());
    expect(vi.mocked(hbprAssignmentService.create).mock.calls[0][0]).toMatchObject({
      cadence: "biweekly",
      cadence_day_of_week: null,
      cadence_nth_week: null,
    });
  });

  it("shows a Not set badge for an assignment whose cadence is missing", async () => {
    vi.mocked(hbprAssignmentService.list).mockResolvedValue({ data: [unsetAssignment] } as never);
    renderPage();
    expect(await screen.findAllByText("Not set")).toHaveLength(2); // cadence + status badge
    expect(screen.getByText(/1 cadence not set yet/i)).toBeInTheDocument();
  });
});
