import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ImportHistoryTab } from "./ImportHistoryTab";
import type { ImportBatch, ImportTarget } from "../types/dataImport";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

const batch = {
  id: 1,
  target_key: "user_skills",
  profile: null,
  original_filename: "skills.csv",
  total_rows: 3,
  created_count: 3,
  updated_count: 0,
  skipped_count: 0,
  error_count: 0,
  row_errors: [],
  created_at: "2026-10-15T13:08:09.123456+02:00",
} as ImportBatch;

const targets = [{ target_key: "user_skills", display_name: "User skills" }] as ImportTarget[];

describe("ImportHistoryTab", () => {
  it("shows the target's display name instead of its slug", () => {
    render(<ImportHistoryTab batches={[batch]} targets={targets} />);
    expect(screen.getByText("User skills")).toBeInTheDocument();
    expect(screen.queryByText("user_skills")).toBeNull();
  });

  it("falls back to the slug when the target is unknown", () => {
    render(<ImportHistoryTab batches={[batch]} targets={[]} />);
    expect(screen.getByText("user_skills")).toBeInTheDocument();
  });

  it("formats the timestamp compactly, not as raw ISO", () => {
    render(<ImportHistoryTab batches={[batch]} targets={targets} />);
    expect(screen.getByText(/^15\/10\/2026 \d{2}:\d{2}$/)).toBeInTheDocument();
    expect(screen.queryByText(/T13:08/)).toBeNull();
  });
});
