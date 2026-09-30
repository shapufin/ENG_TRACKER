import { afterEach, describe, expect, it, vi } from "vitest";
import { withRefreshLock } from "./api";

const originalLocks = Object.getOwnPropertyDescriptor(navigator, "locks");

function stubLocks(value: unknown) {
  Object.defineProperty(navigator, "locks", { value, configurable: true });
}

afterEach(() => {
  if (originalLocks) Object.defineProperty(navigator, "locks", originalLocks);
  else delete (navigator as unknown as Record<string, unknown>).locks;
});

describe("withRefreshLock", () => {
  it("runs the task directly when the Web Locks API is unavailable", async () => {
    stubLocks(undefined);
    await expect(withRefreshLock(async () => "refreshed")).resolves.toBe("refreshed");
  });

  it("takes one named exclusive lock so concurrent tabs refresh one after another", async () => {
    // Minimal Web Locks stand-in: exclusive locks per name, granted in request order.
    const queues = new Map<string, Promise<unknown>>();
    const request = vi.fn((name: string, task: () => Promise<unknown>) => {
      const previous = queues.get(name) ?? Promise.resolve();
      const next = previous.then(task, task);
      queues.set(name, next.catch(() => undefined));
      return next;
    });
    stubLocks({ request });

    const log: string[] = [];
    const refresh = (label: string) =>
      withRefreshLock(async () => {
        log.push(`${label}:start`);
        await new Promise((resolve) => setTimeout(resolve, 10));
        log.push(`${label}:end`);
        return label;
      });

    await Promise.all([refresh("A"), refresh("B")]);

    expect(log).toEqual(["A:start", "A:end", "B:start", "B:end"]);
    expect(new Set(request.mock.calls.map(([name]) => name)).size).toBe(1);
  });

  it("propagates a failing refresh and releases the lock for the next caller", async () => {
    stubLocks(undefined);
    await expect(
      withRefreshLock(async () => {
        throw new Error("401");
      })
    ).rejects.toThrow("401");
    await expect(withRefreshLock(async () => "ok")).resolves.toBe("ok");
  });
});
