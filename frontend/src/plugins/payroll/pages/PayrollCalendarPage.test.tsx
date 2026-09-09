import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PayrollCalendarPage } from "./PayrollCalendarPage";
import * as payrollService from "../services/payrollService";
import * as usePluginPermissions from "@/hooks/usePluginPermissions";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual };
});

vi.mock("@/hooks/usePluginPermissions", () => ({
  usePluginPermissions: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/error-handler", () => ({
  handleApiError: vi.fn(),
}));

// Mock Radix Select with a native <select> so tests can change values
// deterministically without dealing with portals/pointer events.
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, id, children }: any) => (
    <select
      data-testid="select"
      id={id}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
  SelectTrigger: () => null,
  SelectValue: () => null,
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

const mockCalendar = {
  id: 1,
  country: "AL",
  year: 2026,
  is_active: true,
  source: "Official",
  workdays: [
    {
      id: 1,
      calendar: 1,
      date: "2026-01-01",
      is_working_day: false,
      is_holiday: true,
      holiday_name: "New Year",
      standard_hours: "0",
      override_note: "",
    },
    {
      id: 2,
      calendar: 1,
      date: "2026-01-02",
      is_working_day: true,
      is_holiday: false,
      holiday_name: "",
      standard_hours: "8",
      override_note: "",
    },
  ],
  workday_count: 365,
  working_day_count: 250,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};

const mockMonthSummary = {
  year: 2026,
  month: 1,
  total_days: 31,
  working_days: 22,
  holiday_count: 1,
  standard_hours: "176",
  holidays: [{ date: "2026-01-01", name: "New Year" }],
};

/** Switch the month <select> to the given 1-based month number.
 * The year select is rendered first (index 0), the month select second (index 1). */
const changeMonth = (month: number) => {
  const selects = screen.getAllByTestId("select");
  fireEvent.change(selects[1], { target: { value: String(month) } });
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(usePluginPermissions.usePluginPermissions).mockReturnValue({
    canManage: () => false,
    canView: () => true,
    canConfigure: () => true,
    canExport: () => false,
    permissions: [],
    hasPermission: () => false,
    error: null,
    isLoading: false,
  });
  vi.spyOn(payrollService.payrollService, "getWorkCalendarMonthSummary").mockResolvedValue(
    mockMonthSummary
  );
  vi.spyOn(payrollService.payrollService, "addHoliday").mockResolvedValue(mockCalendar.workdays[0]);
  vi.spyOn(payrollService.payrollService, "updateHoliday").mockResolvedValue(
    mockCalendar.workdays[0]
  );
  vi.spyOn(payrollService.payrollService, "removeHoliday").mockResolvedValue(undefined);
});

describe("PayrollCalendarPage", () => {
  it("renders loading state", () => {
    vi.spyOn(payrollService.payrollService, "getWorkCalendars").mockReturnValue(
      new Promise(() => {}) as any
    );
    render(
      <MemoryRouter>
        <PayrollCalendarPage />
      </MemoryRouter>,
      { wrapper }
    );
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("renders error state", async () => {
    vi.spyOn(payrollService.payrollService, "getWorkCalendars").mockRejectedValue(
      new Error("fail")
    );
    render(
      <MemoryRouter>
        <PayrollCalendarPage />
      </MemoryRouter>,
      { wrapper }
    );
    await waitFor(() => {
      expect(screen.getByText("Failed to load work calendars")).toBeInTheDocument();
    });
  });

  it("renders empty state", async () => {
    vi.spyOn(payrollService.payrollService, "getWorkCalendars").mockResolvedValue([]);
    render(
      <MemoryRouter>
        <PayrollCalendarPage />
      </MemoryRouter>,
      { wrapper }
    );
    await waitFor(() => {
      expect(screen.getByText(/No work calendars found/)).toBeInTheDocument();
    });
  });

  it("renders calendars from API", async () => {
    vi.spyOn(payrollService.payrollService, "getWorkCalendars").mockResolvedValue([mockCalendar]);
    render(
      <MemoryRouter>
        <PayrollCalendarPage />
      </MemoryRouter>,
      { wrapper }
    );
    await waitFor(() => {
      expect(screen.getByText("AL 2026")).toBeInTheDocument();
    });
    // Switch to January so the per-month summary is rendered deterministically.
    changeMonth(1);
    await waitFor(() => {
      expect(screen.getByText("22")).toBeInTheDocument();
    });
  });

  it("hides regenerate button when permission denied", async () => {
    vi.mocked(usePluginPermissions.usePluginPermissions).mockReturnValue({
      canManage: () => false,
      canView: () => true,
      canConfigure: () => false,
      canExport: () => false,
      permissions: [],
      hasPermission: () => false,
      error: null,
      isLoading: false,
    });
    vi.spyOn(payrollService.payrollService, "getWorkCalendars").mockResolvedValue([mockCalendar]);
    render(
      <MemoryRouter>
        <PayrollCalendarPage />
      </MemoryRouter>,
      { wrapper }
    );
    await waitFor(() => {
      expect(screen.queryByText("Regenerate")).not.toBeInTheDocument();
    });
  });

  it("renders the month grid with day numbers", async () => {
    vi.spyOn(payrollService.payrollService, "getWorkCalendars").mockResolvedValue([mockCalendar]);
    render(
      <MemoryRouter>
        <PayrollCalendarPage />
      </MemoryRouter>,
      { wrapper }
    );
    await waitFor(() => {
      expect(screen.getByText("AL 2026")).toBeInTheDocument();
    });
    // Switch to January (the month the mock workdays belong to).
    changeMonth(1);
    // January has 31 days — verify a few day numbers render in the grid.
    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText("31")).toBeInTheDocument();
    // The holiday name should render inside its grid cell (and the holiday table).
    expect(screen.getAllByText("New Year").length).toBeGreaterThan(0);
  });

  it("opens the add holiday dialog and submits", async () => {
    vi.spyOn(payrollService.payrollService, "getWorkCalendars").mockResolvedValue([mockCalendar]);
    render(
      <MemoryRouter>
        <PayrollCalendarPage />
      </MemoryRouter>,
      { wrapper }
    );
    await waitFor(() => {
      expect(screen.getByText("AL 2026")).toBeInTheDocument();
    });

    // Open the Add Holiday dialog (button is unique while dialog is closed).
    fireEvent.click(screen.getByRole("button", { name: "Add Holiday" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Add a holiday to the work calendar.")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Date")).toBeInTheDocument();

    // Fill in the date + name inputs.
    fireEvent.change(within(dialog).getByLabelText("Date"), {
      target: { value: "2026-01-06" },
    });
    fireEvent.change(within(dialog).getByLabelText("Holiday Name"), {
      target: { value: "Epiphany" },
    });

    // Submit via the button inside the dialog.
    fireEvent.click(within(dialog).getByRole("button", { name: "Add Holiday" }));

    await waitFor(() => {
      expect(payrollService.payrollService.addHoliday).toHaveBeenCalledWith(
        1,
        "2026-01-06",
        "Epiphany"
      );
    });
  });
});
