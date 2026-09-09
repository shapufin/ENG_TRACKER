import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { ImportCredentialsDialog } from "./ImportCredentialsDialog";
import type { CredentialRow } from "../types/dataImport";

const credentials: CredentialRow[] = [
  { username: "u1", email: "u1@example.com", password: "p1", generated: true },
];

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Scroll contract: the credential table lives in a bounded scroll region so
// the acknowledgement footer stays visible on short viewports.
describe("ImportCredentialsDialog scroll contract", () => {
  it("dialog is a bounded flex column with a scrollable table region", () => {
    render(
      <ImportCredentialsDialog open={true} onOpenChange={vi.fn()} credentials={credentials} />
    );
    const dlg = document.querySelector("[role='dialog']") as HTMLElement;
    expect(dlg.className).toContain("flex-col");
    expect(dlg.className).toContain("overflow-hidden");
    expect(dlg.className).not.toContain("overflow-y-auto");
    expect(document.querySelectorAll(".flex-1.overflow-y-auto").length).toBeGreaterThan(0);
  });
});
