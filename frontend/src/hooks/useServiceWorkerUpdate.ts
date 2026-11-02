import { useCallback, useEffect, useState } from "react";

type ServiceWorkerUpdateEvent = CustomEvent<ServiceWorkerRegistration>;

export function useServiceWorkerUpdate(onReload: () => void = () => window.location.reload()) {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    const handleUpdate = (event: Event) => {
      setRegistration((event as ServiceWorkerUpdateEvent).detail);
    };
    window.addEventListener("service-worker-update", handleUpdate);
    return () => window.removeEventListener("service-worker-update", handleUpdate);
  }, []);

  const applyUpdate = useCallback(() => {
    let reloaded = false;
    const reload = () => {
      if (!reloaded) {
        reloaded = true;
        try {
          onReload();
        } catch {
          // jsdom navigation ignore
        }
      }
    };

    const waiting = registration?.waiting;
    if (waiting) {
      if (typeof navigator !== "undefined" && navigator.serviceWorker) {
        navigator.serviceWorker.addEventListener("controllerchange", reload, { once: true });
      }
      try {
        waiting.postMessage({ type: "SKIP_WAITING" });
      } catch {
        // fallback to reload if postMessage fails
      }
      setTimeout(reload, 800);
    } else {
      reload();
    }
  }, [registration, onReload]);

  return {
    hasUpdate: Boolean(registration?.waiting),
    applyUpdate,
  };
}
