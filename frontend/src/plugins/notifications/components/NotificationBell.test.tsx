import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NotificationBell from "./NotificationBell";
import { notificationService } from "../service";
import type { NotificationRecord } from "../service";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("../service", () => ({
  notificationService: {
    getNotifications: vi.fn(),
    getUnreadCount: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
  },
}));

const baseNotification: NotificationRecord = {
  id: 1,
  title: "Test",
  message: "Test message",
  is_read: false,
  created_at: new Date().toISOString(),
  link: "/dashboard",
} as NotificationRecord;

describe("NotificationBell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders empty state", async () => {
    vi.mocked(notificationService.getNotifications).mockResolvedValue([]);
    vi.mocked(notificationService.getUnreadCount).mockResolvedValue({ count: 0 });
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByText("No new notifications")).toBeInTheDocument());
  });

  it("shows unread badge and notification list", async () => {
    vi.mocked(notificationService.getNotifications).mockResolvedValue([baseNotification]);
    vi.mocked(notificationService.getUnreadCount).mockResolvedValue({ count: 5 });
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText("5")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByText("Test")).toBeInTheDocument());
  });

  it("marks a notification as read", async () => {
    vi.mocked(notificationService.getNotifications).mockResolvedValue([baseNotification]);
    vi.mocked(notificationService.getUnreadCount).mockResolvedValue({ count: 1 });
    vi.mocked(notificationService.markAsRead).mockResolvedValue(undefined);
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByText("Mark read")).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByText("Mark read"));
    });
    expect(notificationService.markAsRead).toHaveBeenCalledWith(1);
  });

  it("marks all as read", async () => {
    vi.mocked(notificationService.getNotifications).mockResolvedValue([baseNotification]);
    vi.mocked(notificationService.getUnreadCount).mockResolvedValue({ count: 1 });
    vi.mocked(notificationService.markAllAsRead).mockResolvedValue(undefined);
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByText("Mark all as read")).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByText("Mark all as read"));
    });
    expect(notificationService.markAllAsRead).toHaveBeenCalled();
  });

  it("navigates when clicking a notification with link", async () => {
    vi.mocked(notificationService.getNotifications).mockResolvedValue([baseNotification]);
    vi.mocked(notificationService.getUnreadCount).mockResolvedValue({ count: 1 });
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByText("Test")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Test"));
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
  });

  it("navigates to all notifications", async () => {
    vi.mocked(notificationService.getNotifications).mockResolvedValue([]);
    vi.mocked(notificationService.getUnreadCount).mockResolvedValue({ count: 0 });
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByText("View all notifications")).toBeInTheDocument());
    fireEvent.click(screen.getByText("View all notifications"));
    expect(mockNavigate).toHaveBeenCalledWith("/notifications");
  });

  it("handles non-array data from service", async () => {
    vi.mocked(notificationService.getNotifications).mockResolvedValue(undefined as any);
    vi.mocked(notificationService.getUnreadCount).mockResolvedValue({ count: 0 });
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByText("No new notifications")).toBeInTheDocument());
  });

  it("gives the icon-only bell trigger an accessible name", async () => {
    // Audit 2026-09-07: the bell renders on every page as an unnamed
    // icon-only button — screen readers announced it as bare "button".
    vi.mocked(notificationService.getNotifications).mockResolvedValue([]);
    vi.mocked(notificationService.getUnreadCount).mockResolvedValue({ count: 0 });
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );
    expect(screen.getByRole("button", { name: /notifications/i })).toBeInTheDocument();
  });
});
