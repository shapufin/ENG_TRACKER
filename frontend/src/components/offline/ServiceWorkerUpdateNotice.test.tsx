import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { ServiceWorkerUpdateNotice } from "./ServiceWorkerUpdateNotice";

describe("ServiceWorkerUpdateNotice", () => {
  it("is hidden until a waiting worker is announced", () => {
    const { container } = render(<ServiceWorkerUpdateNotice />);
    expect(container).toBeEmptyDOMElement();
  });

  it("asks the waiting worker to activate after user action", async () => {
    const postMessage = vi.fn();
    const registration = {
      waiting: { postMessage },
    } as unknown as ServiceWorkerRegistration;
    render(<ServiceWorkerUpdateNotice />);

    act(() => {
      window.dispatchEvent(new CustomEvent("service-worker-update", { detail: registration }));
    });
    const updateButton = await screen.findByRole("button", { name: /update now/i });
    fireEvent.click(updateButton);

    expect(postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  });

  it("reloads via fallback timer if controllerchange does not fire", () => {
    vi.useFakeTimers();
    try {
      const postMessage = vi.fn();
      const reload = vi.fn();
      const registration = {
        waiting: { postMessage },
      } as unknown as ServiceWorkerRegistration;

      render(<ServiceWorkerUpdateNotice onReload={reload} />);

      act(() => {
        window.dispatchEvent(new CustomEvent("service-worker-update", { detail: registration }));
      });
      const updateButton = screen.getByRole("button", { name: /update now/i });
      fireEvent.click(updateButton);

      expect(postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
      expect(reload).not.toHaveBeenCalled();

      // Fast-forward past fallback timeout (800ms)
      act(() => {
        vi.advanceTimersByTime(850);
      });

      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reloads on controllerchange when event fires", () => {
    const postMessage = vi.fn();
    const reload = vi.fn();
    const registration = {
      waiting: { postMessage },
    } as unknown as ServiceWorkerRegistration;

    const listeners: Record<string, ((event: Event) => void)[]> = {};
    const mockServiceWorker = {
      addEventListener: vi.fn((event: string, handler: (event: Event) => void) => {
        listeners[event] = listeners[event] || [];
        listeners[event].push(handler);
      }),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn((event: Event) => {
        (listeners[event.type] || []).forEach((cb) => cb(event));
        return true;
      }),
    };
    Object.defineProperty(navigator, "serviceWorker", {
      value: mockServiceWorker,
      configurable: true,
      writable: true,
    });

    render(<ServiceWorkerUpdateNotice onReload={reload} />);

    act(() => {
      window.dispatchEvent(new CustomEvent("service-worker-update", { detail: registration }));
    });
    const updateButton = screen.getByRole("button", { name: /update now/i });
    fireEvent.click(updateButton);

    expect(postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(reload).not.toHaveBeenCalled();

    // Trigger controllerchange
    act(() => {
      mockServiceWorker.dispatchEvent(new Event("controllerchange"));
    });

    expect(reload).toHaveBeenCalledTimes(1);
  });
});
