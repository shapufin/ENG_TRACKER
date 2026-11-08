import { RefreshCw } from "lucide-react";
import { useServiceWorkerUpdate } from "@/hooks/useServiceWorkerUpdate";

export function ServiceWorkerUpdateNotice({ onReload }: { onReload?: () => void } = {}) {
  const { hasUpdate, applyUpdate } = useServiceWorkerUpdate(onReload);

  if (!hasUpdate) return null;

  return (
    <div
      className="border-primary/30 bg-primary/10 fixed right-0 bottom-[var(--bottom-nav-h,3.5rem)] left-0 z-50 border-t px-4 pt-2 pb-[calc(0.5rem+var(--safe-area-bottom))] backdrop-blur md:bottom-14"
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 text-sm">
        <span>A new version of Engineering Tracker is ready.</span>
        <button
          type="button"
          className="text-primary inline-flex items-center gap-1 font-medium hover:underline"
          onClick={applyUpdate}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Update now
        </button>
      </div>
    </div>
  );
}
