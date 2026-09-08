import { RefreshCw } from "lucide-react";
import { useServiceWorkerUpdate } from "@/hooks/useServiceWorkerUpdate";

export function ServiceWorkerUpdateNotice() {
  const { hasUpdate, applyUpdate } = useServiceWorkerUpdate();

  if (!hasUpdate) return null;

  return (
    <div
      className="fixed bottom-14 left-0 right-0 z-50 border-t border-primary/30 bg-primary/10 px-4 pb-[calc(0.5rem+var(--safe-area-bottom))] pt-2 backdrop-blur"
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 text-sm">
        <span>A new version of Engineering Tracker is ready.</span>
        <button
          type="button"
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
          onClick={applyUpdate}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Update now
        </button>
      </div>
    </div>
  );
}
