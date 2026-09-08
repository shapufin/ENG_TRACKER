import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GlobalSettingsPage } from "./GlobalSettingsPage";

vi.mock("@/services/leaveService", () => ({
  leaveService: {
    getSettings: vi.fn().mockResolvedValue({
      default_yearly_leave_days: 21,
      carry_over_expiry_month: 3,
      carry_over_expiry_day: 31,
    }),
    updateSettings: vi.fn(),
  },
}));

const renderPage = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <GlobalSettingsPage />
    </QueryClientProvider>
  );
};

describe("GlobalSettingsPage", () => {
  it("associates setting labels with their inputs", async () => {
    // Audit 2026-09-07: <Label> had no htmlFor / inputs no id — the three
    // vacation-policy inputs had no programmatic accessible name.
    renderPage();
    expect(await screen.findByLabelText("Default Yearly Vacation Days")).toBeInTheDocument();
    expect(screen.getByLabelText("Carry-over Expiry Month")).toBeInTheDocument();
    expect(screen.getByLabelText("Carry-over Expiry Day")).toBeInTheDocument();
  });
});
