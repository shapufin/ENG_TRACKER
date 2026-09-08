import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AuditLogDetailDialog } from "./AuditLogDetailDialog";

const log = {
  timestamp: "2024-01-01T00:00:00Z",
  user_name: "Alice",
  action: "create",
  action_display: "Created",
  model_name: "User",
  model_name_display: "User",
  object_repr: "User 1",
  changes_summary: "Changed name",
  ip_address: "127.0.0.1",
  user_agent: "Mozilla",
} as any;

describe("AuditLogDetailDialog", () => {
  it("renders log details", () => {
    const onClose = vi.fn();
    render(<AuditLogDetailDialog log={log} onClose={onClose} />);
    expect(screen.getByText("Audit Log Details")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Created")).toBeInTheDocument();
    expect(screen.getByText("Changed name")).toBeInTheDocument();
  });

  it("renders system defaults when fields are missing", () => {
    const onClose = vi.fn();
    render(
      <AuditLogDetailDialog
        log={{ ...log, user_name: "", action_display: "", changes_summary: "" } as any}
        onClose={onClose}
      />
    );
    expect(screen.getByText("System")).toBeInTheDocument();
    expect(screen.getByText("create")).toBeInTheDocument();
  });

  it("calls onClose when dialog closes", () => {
    const onClose = vi.fn();
    render(<AuditLogDetailDialog log={log} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
