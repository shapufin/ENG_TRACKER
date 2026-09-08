import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CRByTeamView } from "./CRByTeamView";
import { mockCoverage, mockRoster } from "./crTestFixtures";

vi.mock("@/components/ui/GlassCard", () => ({
  GlassCard: ({ children }: any) => <div data-testid="glass-card">{children}</div>,
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: any) => <span data-testid="badge">{children}</span>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, ...rest }: any) => (
    <button type="button" onClick={onClick} {...rest}>
      {children}
    </button>
  ),
}));

describe("CRByTeamView", () => {
  it("renders a card per team that has roster rows", () => {
    render(<CRByTeamView coverage={mockCoverage} roster={mockRoster} />);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("shows empty state when roster is empty (no teams derived)", () => {
    render(<CRByTeamView coverage={[]} roster={[]} />);
    expect(screen.getByText(/No teams in scope/i)).toBeInTheDocument();
  });

  it("groups roster rows by team name and shows user names", () => {
    render(<CRByTeamView coverage={mockCoverage} roster={mockRoster} />);
    // Alice is in Alpha, Bob is in Beta.
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("shows overnight moon icon for overnight users", () => {
    const { container } = render(<CRByTeamView coverage={mockCoverage} roster={mockRoster} />);
    // Bob's row is overnight (is_overnight: true).
    const moons = container.querySelectorAll(".lucide-moon");
    expect(moons.length).toBeGreaterThanOrEqual(1);
  });

  it("does not show coverage percent badge (removed per user feedback)", () => {
    render(<CRByTeamView coverage={mockCoverage} roster={mockRoster} />);
    expect(screen.queryByText("80%")).not.toBeInTheDocument();
    expect(screen.queryByText("100%")).not.toBeInTheDocument();
  });

  it("does not show shifts badge per user (removed per user feedback)", () => {
    render(<CRByTeamView coverage={mockCoverage} roster={mockRoster} />);
    // No "shift"/"shifts" badge text should appear.
    expect(screen.queryByText(/shifts?/i)).not.toBeInTheDocument();
  });
});
