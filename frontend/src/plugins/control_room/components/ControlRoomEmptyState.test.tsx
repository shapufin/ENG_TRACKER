import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ControlRoomEmptyState } from "./ControlRoomEmptyState";

describe("ControlRoomEmptyState", () => {
  it("renders no_access state with correct title and message", () => {
    render(<ControlRoomEmptyState reason="no_access" />);
    expect(screen.getByText("No Control Room Access")).toBeInTheDocument();
    expect(screen.getByText(/do not have a Control Room access record/i)).toBeInTheDocument();
  });

  it("renders no_teams state with correct title and message", () => {
    render(<ControlRoomEmptyState reason="no_teams" />);
    expect(screen.getByText("No Teams Assigned")).toBeInTheDocument();
    expect(screen.getByText(/An administrator must assign teams/i)).toBeInTheDocument();
  });

  it("renders no_data state with correct title and message", () => {
    render(<ControlRoomEmptyState reason="no_data" />);
    expect(screen.getByText("No Standby Data")).toBeInTheDocument();
    expect(screen.getByText(/No standby entries match/i)).toBeInTheDocument();
  });

  it("renders error state with correct title and message", () => {
    render(<ControlRoomEmptyState reason="error" />);
    expect(screen.getByText("Query Failed")).toBeInTheDocument();
    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument();
  });

  it("renders an icon for each state", () => {
    const reasons = ["no_access", "no_teams", "no_data", "error"] as const;
    for (const reason of reasons) {
      const { container } = render(<ControlRoomEmptyState reason={reason} />);
      expect(container.querySelector("svg")).toBeInTheDocument();
    }
  });
});
