import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MaintenancePage } from "./MaintenancePage";
import type { MaintenanceStatus } from "@/types";

const base: MaintenanceStatus = {
  active: true,
  title: "Upgrade window",
  message: "We are moving the database.",
  started_at: "2026-10-27T20:00:00Z",
  ends_at: null,
  updated_at: "2026-10-27T20:00:00Z",
  site_name: "Engineering Tracker",
  logo_url: null,
};

const renderPage = (status: Partial<MaintenanceStatus> = {}, variant?: "full" | "preview") =>
  render(
    <MemoryRouter>
      <MaintenancePage status={{ ...base, ...status }} variant={variant} />
    </MemoryRouter>
  );

afterEach(() => {
  vi.useRealTimers();
});

describe("MaintenancePage", () => {
  it("renders the admin copy, the site name and the status pill", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Upgrade window" })).toBeInTheDocument();
    expect(screen.getByText("We are moving the database.")).toBeInTheDocument();
    expect(screen.getByText("Engineering Tracker")).toBeInTheDocument();
    expect(screen.getByText("Maintenance in progress")).toBeInTheDocument();
  });

  it("falls back to default copy when the admin left the fields empty", () => {
    renderPage({ title: "", message: "" });

    expect(screen.getByRole("heading", { name: "Scheduled maintenance" })).toBeInTheDocument();
    expect(screen.getByText(/We're updating the platform/)).toBeInTheDocument();
  });

  it("shows an open-ended message when there is no expected end", () => {
    renderPage({ ends_at: null });

    expect(screen.getByText(/as soon as the update is complete/)).toBeInTheDocument();
    expect(screen.queryByText("Expected back in")).not.toBeInTheDocument();
  });

  it("counts down in hours when the deadline is under a day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T10:00:00Z"));
    renderPage({ ends_at: "2026-10-27T12:30:05Z" });

    expect(screen.getByText("Expected back in")).toBeInTheDocument();
    expect(screen.getByText("02:30:05")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText("02:30:04")).toBeInTheDocument();
  });

  it("does not announce the ticking value to screen readers", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T10:00:00Z"));
    renderPage({ ends_at: "2026-10-27T12:30:05Z" });

    // The ticking clock is hidden from assistive tech; the live region carries
    // only the static deadline, so it is announced once, not every second.
    expect(screen.getByText("02:30:05")).toHaveAttribute("aria-hidden", "true");
    const live = screen.getByRole("status");
    expect(live.textContent).toContain("Around");
    expect(live.textContent).not.toContain("02:30:05");
  });

  it("counts down in days for a longer window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T10:00:00Z"));
    renderPage({ ends_at: "2026-10-29T14:15:00Z" });

    expect(screen.getByText("2d 04h 15m")).toBeInTheDocument();
  });

  it("offers a way back to the admin sign-in form", () => {
    renderPage();

    expect(screen.getByRole("link", { name: /Administrator sign in/i })).toHaveAttribute(
      "href",
      "/login?admin=1"
    );
  });

  it("drops the viewport height in the admin preview", () => {
    const { container } = renderPage({}, "preview");

    expect(container.firstElementChild).not.toHaveClass("min-h-screen");
  });

  it("renders the uploaded logo when present", () => {
    const { container } = renderPage({ logo_url: "https://example.test/logo.png" });

    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.test/logo.png"
    );
  });
});
