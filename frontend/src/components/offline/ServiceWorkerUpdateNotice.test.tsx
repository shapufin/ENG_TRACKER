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
});
