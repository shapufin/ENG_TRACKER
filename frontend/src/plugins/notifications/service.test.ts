import { describe, it, expect, vi, beforeEach } from "vitest";
import api from "@/lib/api";
import { notificationService } from "./service";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() },
}));

vi.mock("@/lib/api-utils", () => ({ extractResponseResults: (r: any) => r.data }));

const BASE = "/plugins/notifications/notifications";

beforeEach(() => vi.clearAllMocks());

describe("notificationService URL contracts", () => {
  it("getNotifications calls /plugins/notifications/notifications/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] } as any);
    await notificationService.getNotifications();
    expect(api.get).toHaveBeenCalledWith(`${BASE}/`);
  });

  it("markAsRead POSTs to /plugins/notifications/notifications/:id/mark_read/", async () => {
    vi.mocked(api.post).mockResolvedValue({} as any);
    await notificationService.markAsRead(1);
    expect(api.post).toHaveBeenCalledWith(`${BASE}/1/mark_read/`);
  });

  it("markAllAsRead POSTs to /plugins/notifications/notifications/mark_all_read/", async () => {
    vi.mocked(api.post).mockResolvedValue({} as any);
    await notificationService.markAllAsRead();
    expect(api.post).toHaveBeenCalledWith(`${BASE}/mark_all_read/`);
  });

  it("getUnreadCount calls /plugins/notifications/notifications/unread_count/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { count: 0 } } as any);
    await notificationService.getUnreadCount();
    expect(api.get).toHaveBeenCalledWith(`${BASE}/unread_count/`);
  });

  it("getPreferences calls /plugins/notifications/notifications/preferences/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] } as any);
    await notificationService.getPreferences();
    expect(api.get).toHaveBeenCalledWith(`${BASE}/preferences/`);
  });

  it("never uses /api/ prefix", () => {
    expect(BASE).not.toContain("/api/");
  });
});
