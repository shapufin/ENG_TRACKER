import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NotificationsPage } from "./NotificationsPage";

vi.mock("./hooks/useNotificationsPage", () => ({
  useNotificationsPage: () => ({
    notifications: [],
    isLoading: false,
    searchQuery: "",
    setSearchQuery: vi.fn(),
    filteredNotifications: [],
    handleMarkRead: vi.fn(),
    handleMarkAllRead: vi.fn(),
  }),
}));

describe("NotificationsPage modernization", () => {
  it("uses a GlassCard notification surface and icon-centered empty state", () => {
    const { container } = render(<NotificationsPage />);

    expect(container.querySelector(".shadow-glass")).toBeInTheDocument();
    expect(screen.getByText("No notifications found.")).toBeInTheDocument();
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("uses the mockup page-header treatment (font-black title, bottom border)", () => {
    render(<NotificationsPage />);

    const title = screen.getByRole("heading", { level: 1, name: "Notifications" });
    expect(title.className).toContain("font-black");
    expect(title.className).not.toContain("sm:text-3xl");

    const headerRow = title.closest(".border-b");
    expect(headerRow).toBeTruthy();
    expect(headerRow?.className).toContain("pb-3");
    expect(headerRow?.className).toContain("border-line-subtle");
  });
});
