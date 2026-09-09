/**
 * useOfflineStatus — React hook that tracks online/offline state
 * and the count of pending offline mutations.
 *
 * Usage:
 *   const { isOnline, pendingCount } = useOfflineStatus();
 *
 * The hook re-renders when:
 * - Browser goes online/offline
 * - A mutation is enqueued while offline
 * - The queue is flushed (pendingCount drops to 0)
 */

import { useState, useEffect, useCallback } from "react";
import {
  isOnline,
  getQueueCount,
  onConnectivityChange,
  flushQueue,
  migrateLegacyQueue,
} from "./offlineQueue";
import { hasStaleOfflineData } from "./offlineApiCache";
import { API_BASE_URL } from "@/lib/constants";

const API_BASE = API_BASE_URL;

function fetchQueuedMutation(url: string, options: RequestInit): Promise<Response> {
  const token = localStorage.getItem("access_token");
  return fetch(API_BASE + url, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

export interface OfflineStatus {
  isOnline: boolean;
  pendingCount: number;
  isFlushing: boolean;
  hasStaleData: boolean;
  flush: () => Promise<void>;
}

export function useOfflineStatus(): OfflineStatus {
  const [online, setOnline] = useState(isOnline());
  const [pendingCount, setPendingCount] = useState(getQueueCount());
  const [hasStaleData, setHasStaleData] = useState(hasStaleOfflineData());

  useEffect(() => {
    migrateLegacyQueue();
  }, []);
  const [isFlushing, setIsFlushing] = useState(false);

  const updateCount = useCallback(() => {
    setPendingCount(getQueueCount());
    setHasStaleData(hasStaleOfflineData());
  }, []);

  useEffect(() => {
    const unsub = onConnectivityChange((isConnected) => {
      setOnline(isConnected);
      if (isConnected) {
        // Auto-flush when coming back online
        setIsFlushing(true);
        flushQueue(fetchQueuedMutation).finally(() => {
          setIsFlushing(false);
          updateCount();
        });
      }
    });

    // Also poll queue count every 2s (covers enqueue from other tabs)
    const interval = setInterval(updateCount, 2000);

    return () => {
      unsub();
      clearInterval(interval);
    };
  }, [updateCount]);

  const flush = useCallback(async () => {
    setIsFlushing(true);
    try {
      await flushQueue(fetchQueuedMutation);
    } finally {
      setIsFlushing(false);
      updateCount();
    }
  }, [updateCount]);

  return {
    isOnline: online,
    pendingCount,
    isFlushing,
    hasStaleData,
    flush,
  };
}
