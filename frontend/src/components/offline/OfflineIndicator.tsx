/**
 * OfflineIndicator — shows a banner when the user is offline or has
 * pending mutations waiting to sync.
 *
 * Renders nothing when online AND queue is empty (zero visual footprint).
 */

import { CloudOff, RefreshCw } from "lucide-react";
import { useOfflineStatus } from "@/lib/offline/useOfflineStatus";
import { hasStaleOfflineData } from "@/lib/offline/offlineApiCache";
import { cn } from "@/lib/utils";

export function OfflineIndicator() {
  const { isOnline, pendingCount, isFlushing, hasStaleData, flush } = useOfflineStatus();
  const showingStaleData = hasStaleData || hasStaleOfflineData();

  // Online + no pending + no cached fallback: render nothing
  if (isOnline && pendingCount === 0 && !showingStaleData) return null;

  if (isOnline && pendingCount === 0 && showingStaleData) {
    return (
      <div
        className="border-border fixed right-0 bottom-0 left-0 z-50 border-t bg-amber-500/10 px-4 pt-2 pb-[calc(0.5rem+var(--safe-area-bottom))] backdrop-blur"
        role="status"
        aria-live="polite"
      >
        <div className="text-tone-warning-text mx-auto max-w-4xl text-sm">
          Showing saved data from your last connection. Reconnect to refresh.
        </div>
      </div>
    );
  }

  // Online + pending: show "syncing" or "sync now" bar
  if (isOnline && pendingCount > 0) {
    return (
      <div
        className="border-border bg-card/95 fixed right-0 bottom-0 left-0 z-50 border-t px-4 pt-2 pb-[calc(0.5rem+var(--safe-area-bottom))] backdrop-blur"
        role="status"
        aria-live="polite"
      >
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            {isFlushing ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>
                  Syncing {pendingCount} pending change{pendingCount > 1 ? "s" : ""}…
                </span>
              </>
            ) : (
              <>
                <CloudOff className="h-4 w-4" />
                <span>
                  {pendingCount} change{pendingCount > 1 ? "s" : ""} waiting to sync
                </span>
              </>
            )}
          </div>
          {!isFlushing && (
            <button onClick={flush} className="text-primary text-xs font-medium hover:underline">
              Sync now
            </button>
          )}
        </div>
      </div>
    );
  }

  // Offline: show "you are offline" banner
  return (
    <div
      className={cn(
        "border-border bg-destructive/10 fixed right-0 bottom-0 left-0 z-50 border-t px-4 pt-2 pb-[calc(0.5rem+var(--safe-area-bottom))] backdrop-blur"
      )}
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
        <div className="text-destructive flex items-center gap-2 text-sm">
          <CloudOff className="h-4 w-4" />
          <span>
            {showingStaleData
              ? "You're offline — showing saved data from your last connection"
              : "You're offline — changes will sync when connected"}
            {pendingCount > 0 && ` (${pendingCount} pending)`}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * InlineOfflineBadge — compact badge for forms/buttons.
 * Shows when offline, useful inside submit buttons.
 */
export function InlineOfflineBadge() {
  const { isOnline } = useOfflineStatus();
  if (isOnline) return null;

  return (
    <span className="bg-muted text-muted-foreground ml-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs">
      <CloudOff className="h-3 w-3" />
      Queued
    </span>
  );
}
