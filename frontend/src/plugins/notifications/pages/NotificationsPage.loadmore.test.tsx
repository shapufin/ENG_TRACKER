import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { NotificationsPage } from "./NotificationsPage";
import { notificationService, type NotificationRecord } from "../service";

vi.mock("../service", () => ({
  notificationService: {
    getNotificationPage: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
  },
}));

const make = (id: number, title: string): NotificationRecord => ({
  id,
  title,
  message: "m",
  notification_type: "info",
  is_read: true,
  created_at: new Date().toISOString(),
});

describe("NotificationsPage load more", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the next server page after Load more and hides the control on the last page", async () => {
    vi.mocked(notificationService.getNotificationPage)
      .mockResolvedValueOnce({ results: [make(2, "Newer one")], hasMore: true })
      .mockResolvedValueOnce({ results: [make(1, "Older one")], hasMore: false });

    render(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>
    );

    await screen.findByText("Newer one");
    expect(screen.queryByText("Older one")).not.toBeInTheDocument();
    expect(notificationService.getNotificationPage).toHaveBeenLastCalledWith(1);

    fireEvent.click(screen.getByRole("button", { name: /load more/i }));

    await screen.findByText("Older one");
    expect(screen.getByText("Newer one")).toBeInTheDocument();
    expect(notificationService.getNotificationPage).toHaveBeenLastCalledWith(2);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument()
    );
  });
});
