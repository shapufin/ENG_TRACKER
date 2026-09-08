import { useCallback, useEffect, useState } from "react";

type ServiceWorkerUpdateEvent = CustomEvent<ServiceWorkerRegistration>;

export function useServiceWorkerUpdate() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    const handleUpdate = (event: Event) => {
      setRegistration((event as ServiceWorkerUpdateEvent).detail);
    };
    window.addEventListener("service-worker-update", handleUpdate);
    return () => window.removeEventListener("service-worker-update", handleUpdate);
  }, []);

  const applyUpdate = useCallback(() => {
    const waiting = registration?.waiting;
    if (!waiting) return;

    const reload = () => window.location.reload();
    navigator.serviceWorker?.addEventListener("controllerchange", reload, { once: true });
    waiting.postMessage({ type: "SKIP_WAITING" });
  }, [registration]);

  return {
    hasUpdate: Boolean(registration?.waiting),
    applyUpdate,
  };
}
