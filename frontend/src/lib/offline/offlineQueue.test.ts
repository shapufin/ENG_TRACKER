import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  getQueue,
  getQueueCount,
  enqueue,
  dequeue,
  clearQueue,
  isOnline,
  flushQueue,
  onConnectivityChange,
  requestWithOfflineQueue,
  OfflineQueuedError,
  type QueuedMutation,
} from "./offlineQueue";

describe("offlineQueue", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("user", JSON.stringify({ id: 1 }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getQueue", () => {
    it("returns empty array when nothing queued", () => {
      expect(getQueue()).toEqual([]);
    });

    it("returns queued mutations from localStorage", () => {
      const item: QueuedMutation = {
        id: "test-1",
        url: "/api/overtime/logs/",
        method: "POST",
        body: { hours: 2 },
        headers: {},
        timestamp: Date.now(),
        description: "Overtime log",
      };
      localStorage.setItem("engtracker:offline-queue:v2:1", JSON.stringify([item]));
      expect(getQueue()).toHaveLength(1);
      expect(getQueue()[0].url).toBe("/api/overtime/logs/");
    });

    it("returns empty array on malformed localStorage", () => {
      localStorage.setItem("engtracker:offline-queue:v2:1", "not-json");
      expect(getQueue()).toEqual([]);
    });
  });

  describe("getQueueCount", () => {
    it("returns 0 when empty", () => {
      expect(getQueueCount()).toBe(0);
    });

    it("returns count of queued items", () => {
      enqueue({
        url: "/api/test/",
        method: "POST",
        body: {},
        headers: {},
        description: "Test",
      });
      expect(getQueueCount()).toBe(1);
    });
  });

  describe("enqueue", () => {
    it("adds a mutation to the queue with ID and timestamp", () => {
      const result = enqueue({
        url: "/api/overtime/logs/",
        method: "POST",
        body: { hours: 2 },
        headers: {},
        description: "Overtime log",
      });

      expect(result).not.toBeNull();
      expect(result?.id).toBeDefined();
      expect(result?.timestamp).toBeDefined();
      expect(getQueue()).toHaveLength(1);
    });

    it("returns null when queue is at max capacity", () => {
      // Fill queue to max (50)
      for (let i = 0; i < 50; i++) {
        enqueue({
          url: `/api/test/${i}/`,
          method: "POST",
          body: {},
          headers: {},
          description: `Test ${i}`,
        });
      }

      const overflow = enqueue({
        url: "/api/overflow/",
        method: "POST",
        body: {},
        headers: {},
        description: "Should fail",
      });

      expect(overflow).toBeNull();
      expect(getQueue()).toHaveLength(50);
    });
  });

  describe("dequeue", () => {
    it("removes a mutation by ID", () => {
      const item = enqueue({
        url: "/api/test/",
        method: "POST",
        body: {},
        headers: {},
        description: "Test",
      });
      expect(getQueue()).toHaveLength(1);

      dequeue(item!.id);
      expect(getQueue()).toHaveLength(0);
    });

    it("does nothing for unknown ID", () => {
      enqueue({
        url: "/api/test/",
        method: "POST",
        body: {},
        headers: {},
        description: "Test",
      });
      dequeue("nonexistent");
      expect(getQueue()).toHaveLength(1);
    });
  });

  describe("clearQueue", () => {
    it("removes all mutations", () => {
      enqueue({
        url: "/api/test/",
        method: "POST",
        body: {},
        headers: {},
        description: "Test",
      });
      enqueue({
        url: "/api/test2/",
        method: "POST",
        body: {},
        headers: {},
        description: "Test 2",
      });

      clearQueue();
      expect(getQueue()).toHaveLength(0);
      expect(getQueueCount()).toBe(0);
    });
  });

  describe("isOnline", () => {
    it("returns navigator.onLine value", () => {
      // navigator.onLine is true in jsdom by default
      expect(isOnline()).toBe(true);
    });
  });

  describe("flushQueue", () => {
    it("returns flushed=0 when queue is empty", async () => {
      const mockFetch = vi.fn();
      const result = await flushQueue(mockFetch);
      expect(result.flushed).toBe(0);
      expect(result.failed).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("flushes successful mutations and removes them from queue", async () => {
      enqueue({
        url: "/api/test/",
        method: "POST",
        body: { hours: 2 },
        headers: {},
        description: "Test",
      });

      const mockFetch = vi.fn().mockResolvedValue(new Response("{}", { status: 201 }));

      const result = await flushQueue(mockFetch);
      expect(result.flushed).toBe(1);
      expect(result.failed).toBeNull();
      expect(getQueue()).toHaveLength(0);
    });

    it("stops on network error and keeps remaining items", async () => {
      enqueue({
        url: "/api/test1/",
        method: "POST",
        body: {},
        headers: {},
        description: "Test 1",
      });
      enqueue({
        url: "/api/test2/",
        method: "POST",
        body: {},
        headers: {},
        description: "Test 2",
      });

      const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));

      const result = await flushQueue(mockFetch);
      expect(result.flushed).toBe(0);
      expect(result.failed).not.toBeNull();
      expect(getQueue()).toHaveLength(2);
    });

    it("keeps item in queue on 500 server error", async () => {
      enqueue({
        url: "/api/test/",
        method: "POST",
        body: {},
        headers: {},
        description: "Test",
      });

      const mockFetch = vi.fn().mockResolvedValue(new Response("Server error", { status: 500 }));

      const result = await flushQueue(mockFetch);
      expect(result.flushed).toBe(0);
      expect(result.failed).not.toBeNull();
      expect(getQueue()).toHaveLength(1);
    });

    it("removes item on 4xx client error (don't retry bad requests)", async () => {
      enqueue({
        url: "/api/test/",
        method: "POST",
        body: {},
        headers: {},
        description: "Test",
      });

      const mockFetch = vi.fn().mockResolvedValue(new Response("Bad request", { status: 400 }));

      const result = await flushQueue(mockFetch);
      expect(result.flushed).toBe(1);
      expect(getQueue()).toHaveLength(0);
    });
  });

  describe("requestWithOfflineQueue", () => {
    it("returns the request result when online", async () => {
      const result = await requestWithOfflineQueue(async () => "created", {
        url: "/overtime/logs/",
        method: "POST",
        body: { hours: 2 },
        headers: {},
        description: "Overtime submission",
      });
      expect(result).toBe("created");
      expect(getQueueCount()).toBe(0);
    });

    it("queues immediately when the browser is offline", async () => {
      Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
      const request = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

      await expect(
        requestWithOfflineQueue(request, {
          url: "/overtime/logs/",
          method: "POST",
          body: { hours: 2 },
          headers: {},
          description: "Overtime submission",
        })
      ).rejects.toBeInstanceOf(OfflineQueuedError);

      expect(request).not.toHaveBeenCalled();
      expect(getQueueCount()).toBe(1);
      Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    });
  });

  describe("onConnectivityChange", () => {
    it("subscribes to online/offline events", () => {
      const callback = vi.fn();
      const unsub = onConnectivityChange(callback);

      window.dispatchEvent(new Event("offline"));
      expect(callback).toHaveBeenCalledWith(false);

      window.dispatchEvent(new Event("online"));
      expect(callback).toHaveBeenCalledWith(true);

      unsub();
    });

    it("returns unsubscribe function", () => {
      const callback = vi.fn();
      const unsub = onConnectivityChange(callback);
      unsub();

      window.dispatchEvent(new Event("online"));
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("token-expiry and user isolation", () => {
    it("stops flush on 401 and keeps remaining items queued", async () => {
      enqueue({
        url: "/api/test/",
        method: "POST",
        body: {},
        headers: {},
        description: "Test 1",
      });
      enqueue({
        url: "/api/test2/",
        method: "POST",
        body: {},
        headers: {},
        description: "Test 2",
      });

      const mockFetch = vi.fn().mockResolvedValue(new Response("Unauthorized", { status: 401 }));
      const result = await flushQueue(mockFetch);

      expect(result.flushed).toBe(0);
      expect(result.failed).not.toBeNull();
      expect(getQueue()).toHaveLength(2);
    });

    it("stops flush on 403 and keeps remaining items queued", async () => {
      enqueue({
        url: "/api/test/",
        method: "POST",
        body: {},
        headers: {},
        description: "Test 1",
      });

      const mockFetch = vi.fn().mockResolvedValue(new Response("Forbidden", { status: 403 }));
      const result = await flushQueue(mockFetch);

      expect(result.flushed).toBe(0);
      expect(result.failed).not.toBeNull();
      expect(getQueue()).toHaveLength(1);
    });

    it("isolates queues per user", () => {
      localStorage.setItem("user", JSON.stringify({ id: 1 }));
      enqueue({
        url: "/api/user1/",
        method: "POST",
        body: {},
        headers: {},
        description: "User 1 mutation",
      });

      localStorage.setItem("user", JSON.stringify({ id: 2 }));
      expect(getQueue()).toEqual([]);

      enqueue({
        url: "/api/user2/",
        method: "POST",
        body: {},
        headers: {},
        description: "User 2 mutation",
      });

      expect(getQueue()).toHaveLength(1);
      expect(getQueue()[0].url).toBe("/api/user2/");

      localStorage.setItem("user", JSON.stringify({ id: 1 }));
      expect(getQueue()).toHaveLength(1);
      expect(getQueue()[0].url).toBe("/api/user1/");
    });

    it("rejects enqueue for anonymous user", () => {
      localStorage.removeItem("user");
      const result = enqueue({
        url: "/api/test/",
        method: "POST",
        body: {},
        headers: {},
        description: "Test",
      });
      expect(result).toBeNull();
    });

    it("clearQueue removes only the current user queue", () => {
      localStorage.setItem("user", JSON.stringify({ id: 1 }));
      enqueue({
        url: "/api/user1/",
        method: "POST",
        body: {},
        headers: {},
        description: "User 1",
      });

      localStorage.setItem("user", JSON.stringify({ id: 2 }));
      enqueue({
        url: "/api/user2/",
        method: "POST",
        body: {},
        headers: {},
        description: "User 2",
      });

      clearQueue();

      localStorage.setItem("user", JSON.stringify({ id: 1 }));
      expect(getQueue()).toHaveLength(1);
      expect(getQueue()[0].url).toBe("/api/user1/");
    });
  });
});
