import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { AuditLogDetailDialog } from "./AuditLogDetailDialog";

const longText = "x".repeat(400);

const log = {
  timestamp: "2024-01-01T00:00:00Z",
  user_name: "Alice",
  action: "update",
  action_display: "Updated",
  model_name: "User",
  model_name_display: "User",
  object_repr: `User object with a very long representation ${longText}`,
  changes_summary: longText,
  ip_address: "127.0.0.1",
  user_agent: `Mozilla/5.0 (very long agent string) ${longText}`,
} as any;

// Scroll contract: unbounded read-only content must be height-guarded with
// word-wrapping so long values never force horizontal overflow.
describe("AuditLogDetailDialog scroll contract", () => {
  it("dialog is a bounded flex column with a scrollable body", () => {
    render(<AuditLogDetailDialog log={log} onClose={vi.fn()} />);
    const dlg = document.querySelector("[role='dialog']") as HTMLElement;
    expect(dlg.className).toContain("flex-col");
    expect(dlg.className).toContain("overflow-hidden");
    expect(dlg.className).not.toContain("overflow-y-auto");
    expect(document.querySelectorAll(".flex-1.overflow-y-auto").length).toBeGreaterThan(0);
  });

  it("long values wrap instead of overflowing", () => {
    render(<AuditLogDetailDialog log={log} onClose={vi.fn()} />);
    const dlg = document.querySelector("[role='dialog']") as HTMLElement;
    expect(dlg.querySelectorAll(".break-words").length).toBeGreaterThan(0);
  });
});
