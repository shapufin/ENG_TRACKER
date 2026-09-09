import { clearOfflineApiCache } from "./offlineApiCache";

/**
 * Offline Mutation Queue
 *
 * When the user submits a form (overtime, standby, leave) while offline,
 * the mutation is saved to localStorage. When connectivity returns,
 * the queue is flushed — each pending mutation is replayed in order.
 *
 * This is a frontend-only utility. No backend changes needed.
 * The queue is per-user (keyed by user ID) to avoid cross-user leakage.
 */

export interface QueuedMutation {
  id: string;
  url: string;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  body: unknown;
  headers: Record<string, string>;
  timestamp: number;
  description: string;
  userId?: string;
  idempotencyKey?: string;
}

function getUserScope(): string {
  try {
    const stored = localStorage.getItem("user");
    const user = stored ? JSON.parse(stored) : null;
    return user?.id != null ? String(user.id) : "anonymous";
  } catch {
    return "anonymous";
  }
}

function queueKey(userId = getUserScope()): string {
  return `${QUEUE_KEY_PREFIX}${userId}`;
}

function writeQueue(queue: QueuedMutation[], userId = getUserScope()): void {
  try {
    localStorage.setItem(queueKey(userId), JSON.stringify(queue));
  } catch {
    throw new Error("Offline storage is full. Reconnect before submitting more changes.");
  }
}

const QUEUE_KEY_PREFIX = "engtracker:offline-queue:v2:";
const LEGACY_QUEUE_KEY = "engtracker:offline-queue";
const MAX_QUEUE_SIZE = 50;
const FLUSH_LOCK_TTL = 30_000;

export class OfflineQueuedError extends Error {
  constructor(description: string) {
    super(`${description} was saved and will sync when you are online.`);
    this.name = "OfflineQueuedError";
  }
}

function isNetworkFailure(error: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  if (error instanceof TypeError) return true;
  if (typeof error !== "object" || error === null) return false;

  const candidate = error as { response?: unknown; request?: unknown; code?: string };
  return (
    candidate.code === "ERR_NETWORK" ||
    candidate.code === "ERR_CANCELED" ||
    ("response" in candidate && candidate.response == null) ||
    ("request" in candidate && candidate.request != null && !candidate.response)
  );
}

/**
 * Read all queued mutations.
 */
export function getQueue(userId = getUserScope()): QueuedMutation[] {
  try {
    const raw = localStorage.getItem(queueKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Get count of pending mutations (for UI badge).
 */
export function getQueueCount(userId = getUserScope()): number {
  return getQueue(userId).length;
}

/**
 * Add a mutation to the offline queue.
 * Returns the queued item, or null if the queue is full.
 */
export function enqueue(mutation: Omit<QueuedMutation, "id" | "timestamp">): QueuedMutation | null {
  const userId = getUserScope();
  if (userId === "anonymous") return null;
  const queue = getQueue(userId);
  if (queue.length >= MAX_QUEUE_SIZE) return null;

  const item: QueuedMutation = {
    ...mutation,
    userId,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    idempotencyKey:
      typeof crypto?.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`,
    timestamp: Date.now(),
  };

  queue.push(item);
  writeQueue(queue, userId);
  return item;
}

/**
 * Remove a mutation from the queue by ID.
 */
export function dequeue(id: string, userId = getUserScope()): void {
  const queue = getQueue(userId).filter((m) => m.id !== id);
  writeQueue(queue, userId);
}

/**
 * Clear the entire queue (e.g., on logout).
 */
export function clearQueue(userId = getUserScope()): void {
  localStorage.removeItem(queueKey(userId));
}

export function migrateLegacyQueue(userId = getUserScope()): void {
  const legacy = localStorage.getItem(LEGACY_QUEUE_KEY);
  if (!legacy || userId === "anonymous") return;
  try {
    const items = JSON.parse(legacy);
    if (Array.isArray(items) && getQueue(userId).length === 0) writeQueue(items, userId);
  } finally {
    localStorage.removeItem(LEGACY_QUEUE_KEY);
  }
}

export function clearOfflineUserData(): void {
  clearQueue();
  clearOfflineApiCache();
  if (typeof navigator !== "undefined" && navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({ type: "CLEAR_USER_DATA" });
  }
}

function queueMutationOrThrow(mutation: Omit<QueuedMutation, "id" | "timestamp">): never {
  const queued = enqueue(mutation);
  if (!queued) {
    throw new Error("Offline queue is full. Reconnect before submitting more changes.");
  }
  throw new OfflineQueuedError(mutation.description);
}

export async function requestWithOfflineQueue<T>(
  request: () => Promise<T>,
  mutation: Omit<QueuedMutation, "id" | "timestamp">
): Promise<T> {
  // Browser offline state is authoritative. Avoid waiting on an Axios
  // request that may hang while the network stack transitions offline.
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    queueMutationOrThrow(mutation);
  }

  try {
    return await request();
  } catch (error) {
    // Any failed request without an HTTP response is a transport failure;
    // queue it even when a browser/adapter uses a nonstandard error shape.
    if (
      isNetworkFailure(error) ||
      (typeof error === "object" && error !== null && !(error as { response?: unknown }).response)
    ) {
      queueMutationOrThrow(mutation);
    }
    throw error;
  }
}

/**
 * Check if the browser is online.
 */
export function isOnline(): boolean {
  return navigator.onLine;
}

/**
 * Flush the queue: replay each mutation in order.
 * Stops on first failure (so remaining items stay queued for next attempt).
 * Returns the number of successfully flushed items.
 */
export async function flushQueue(
  fetchFn: (url: string, options: RequestInit) => Promise<Response>
): Promise<{ flushed: number; failed: QueuedMutation | null }> {
  const userId = getUserScope();
  const lockKey = `${QUEUE_KEY_PREFIX}${userId}:flush-lock`;
  const existingLock = Number(localStorage.getItem(lockKey) || 0);
  if (existingLock && Date.now() - existingLock < FLUSH_LOCK_TTL) {
    return { flushed: 0, failed: null };
  }
  localStorage.setItem(lockKey, String(Date.now()));

  const queue = getQueue(userId);
  if (queue.length === 0) {
    localStorage.removeItem(lockKey);
    return { flushed: 0, failed: null };
  }

  let flushed = 0;
  try {
    for (const item of queue) {
      try {
        const response = await fetchFn(item.url, {
          method: item.method,
          headers: {
            "Content-Type": "application/json",
            ...(item.idempotencyKey ? { "Idempotency-Key": item.idempotencyKey } : {}),
            ...item.headers,
          },
          body: item.body ? JSON.stringify(item.body) : undefined,
        });

        if (!response.ok && (response.status === 401 || response.status === 403)) {
          return { flushed, failed: item };
        }
        if (!response.ok && response.status >= 500) {
          return { flushed, failed: item };
        }

        dequeue(item.id, item.userId);
        flushed++;
      } catch {
        return { flushed, failed: item };
      }
    }

    return { flushed, failed: null };
  } finally {
    localStorage.removeItem(lockKey);
  }
}

/**
 * Subscribe to online/offline events.
 * Returns an unsubscribe function.
 */
export function onConnectivityChange(callback: (online: boolean) => void): () => void {
  const handleOnline = () => callback(true);
  const handleOffline = () => callback(false);

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  return () => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
  };
}
