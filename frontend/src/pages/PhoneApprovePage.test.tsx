import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { PhoneApprovePage } from "./PhoneApprovePage";
import { PasskeyCancelledError } from "@/services/passkeyService";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

vi.mock("framer-motion", () => ({
  motion: { div: ({ children }: { children: React.ReactNode }) => <div>{children}</div> },
  useReducedMotion: () => false,
}));

const supported = vi.hoisted(() => ({ value: true }));
const getAssertionMock = vi.hoisted(() => vi.fn());
vi.mock("@/services/passkeyService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/passkeyService")>()),
  isPasskeySupported: () => supported.value,
  getAssertion: getAssertionMock,
}));

const getApprovalRequestMock = vi.fn();
const decideApprovalMock = vi.fn();
vi.mock("@/services/phoneApprovalService", () => ({
  getApprovalRequest: (...args: unknown[]) => getApprovalRequestMock(...args),
  decideApproval: (...args: unknown[]) => decideApprovalMock(...args),
}));

const view = {
  options: [17, 42, 63],
  requester: { agent: "Chrome on Windows", ip: "203.0.113.9", at: "2026-11-19T10:00:00Z" },
  username: "ann",
  assertion: { challenge: "AQID", allowCredentials: [] },
  expires_in: 100,
};
const apiError = (code: string, detail: string) => ({ response: { data: { code, detail } } });

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/phone-approve/req-1"]}>
      <Routes>
        <Route path="/phone-approve/:requestId" element={<PhoneApprovePage />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  supported.value = true;
  getApprovalRequestMock.mockReset().mockResolvedValue(view);
  decideApprovalMock.mockReset().mockResolvedValue(undefined);
  getAssertionMock.mockReset().mockResolvedValue({ id: "cred" });
});

describe("PhoneApprovePage", () => {
  it("shows who is signing in from which browser and the three numbers", async () => {
    renderPage();
    expect(await screen.findByText(/ann/)).toBeInTheDocument();
    expect(screen.getByText(/Chrome on Windows/)).toBeInTheDocument();
    for (const n of view.options)
      expect(screen.getByRole("button", { name: `Number ${n}` })).toBeInTheDocument();
    expect(getApprovalRequestMock).toHaveBeenCalledWith("req-1");
  });

  it("approves with the tapped number and the biometric assertion, and never signs the phone in", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Number 42" }));
    await waitFor(() =>
      expect(decideApprovalMock).toHaveBeenCalledWith("req-1", {
        decision: "approve",
        number: 42,
        response: { id: "cred" },
      })
    );
    expect(getAssertionMock).toHaveBeenCalledWith(view.assertion);
    expect(await screen.findByText(/Approved\. Go back to your computer/)).toBeInTheDocument();
  });

  it("sends a wrong tap as chosen and says nothing was approved", async () => {
    decideApprovalMock.mockRejectedValue(
      apiError(
        "wrong_number",
        "That is not the number on your computer. The request was cancelled."
      )
    );
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Number 17" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/not the number on your computer/);
    expect(screen.getByText(/Nothing was approved/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Number 42" })).not.toBeInTheDocument();
  });

  it("lets the person retry after dismissing the biometric prompt, sending nothing", async () => {
    getAssertionMock.mockRejectedValueOnce(new PasskeyCancelledError());
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Number 42" }));
    expect(await screen.findByText(/Tap a number to try again/)).toBeInTheDocument();
    expect(decideApprovalMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Number 42" }));
    await waitFor(() => expect(decideApprovalMock).toHaveBeenCalledTimes(1));
  });

  it("denies with 'Not me' and needs no biometric", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "This is not me" }));
    await waitFor(() =>
      expect(decideApprovalMock).toHaveBeenCalledWith("req-1", { decision: "deny" })
    );
    expect(getAssertionMock).not.toHaveBeenCalled();
    expect(await screen.findByText(/Nothing was approved/)).toBeInTheDocument();
  });

  it("shows a clear message for an expired or unknown request, without a stack trace", async () => {
    getApprovalRequestMock.mockRejectedValue(
      apiError("request_expired", "This request expired. Start again on your computer.")
    );
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This request expired. Start again on your computer."
    );
    expect(screen.queryByRole("button", { name: /Number/ })).not.toBeInTheDocument();
  });

  it("explains an unsupported browser instead of showing dead buttons", async () => {
    supported.value = false;
    renderPage();
    expect(await screen.findByText(/cannot approve sign-ins/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Number/ })).not.toBeInTheDocument();
  });
});
