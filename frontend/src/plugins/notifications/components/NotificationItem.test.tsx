import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { NotificationItem } from "./NotificationItem";
import type { NotificationRecord } from "../service";

const base: NotificationRecord = {
  id: 1,
  title: "Month closed",
  message: "Something happened",
  notification_type: "info",
  is_read: false,
  created_at: "2026-10-30T10:00:00Z",
  dedupe_key: "period-close:1:user:2",
};

const renderItem = (n: NotificationRecord) =>
  render(
    <MemoryRouter>
      <NotificationItem notification={n} onMarkRead={vi.fn()} />
    </MemoryRouter>
  );

describe("NotificationItem", () => {
  it("renders an ordinary notification without the urgent treatment", () => {
    renderItem(base);
    expect(screen.queryByText("Urgent action")).not.toBeInTheDocument();
  });

  it("flags the month-closure reminder as urgent", () => {
    renderItem({
      ...base,
      notification_type: "error",
      title: "Urgent: finalize October 2026 approvals",
      dedupe_key: "tl-urgent-close:2026-10:user:5",
    });
    expect(screen.getByText("Urgent action")).toBeInTheDocument();
  });

  it("does not treat every error notification as urgent", () => {
    renderItem({ ...base, notification_type: "error", dedupe_key: null });
    expect(screen.queryByText("Urgent action")).not.toBeInTheDocument();
  });
});
