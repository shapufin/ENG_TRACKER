import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SidebarUserProfile } from "./SidebarUserProfile";

describe("SidebarUserProfile", () => {
  it("renders full_name when provided", () => {
    render(
      <SidebarUserProfile
        user={{
          full_name: "Alice Smith",
          first_name: "Alice",
          last_name: "Smith",
          username: "asmith",
        }}
        collapsed={false}
      />
    );
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
  });

  it("falls back to first_name + last_name when full_name is empty", () => {
    render(
      <SidebarUserProfile
        user={{ first_name: "Bob", last_name: "Jones", username: "bjones" }}
        collapsed={false}
      />
    );
    expect(screen.getByText("Bob Jones")).toBeInTheDocument();
  });

  it("falls back to username when first_name and last_name are empty (CR user case)", () => {
    render(
      <SidebarUserProfile
        user={{ first_name: "", last_name: "", username: "cr_user1" }}
        collapsed={false}
      />
    );
    expect(screen.getByText("cr_user1")).toBeInTheDocument();
    expect(screen.queryByText("Guest")).not.toBeInTheDocument();
  });

  it("falls back to username when no name fields are provided", () => {
    render(<SidebarUserProfile user={{ username: "cr_operator" }} collapsed={false} />);
    expect(screen.getByText("cr_operator")).toBeInTheDocument();
  });

  it("renders Guest only when user is null", () => {
    render(<SidebarUserProfile user={null} collapsed={false} />);
    expect(screen.getByText("Guest")).toBeInTheDocument();
  });

  it("renders Guest when user is undefined", () => {
    render(<SidebarUserProfile user={undefined} collapsed={false} />);
    expect(screen.getByText("Guest")).toBeInTheDocument();
  });

  it("hides details when collapsed", () => {
    render(
      <SidebarUserProfile
        user={{ first_name: "Alice", last_name: "Smith", username: "asmith" }}
        collapsed={true}
      />
    );
    expect(screen.queryByText("Alice Smith")).not.toBeInTheDocument();
  });

  it("provides title attributes on truncated name and email for accessible full-value path", () => {
    render(
      <SidebarUserProfile
        user={{ full_name: "Alice Smith", email: "alice.smith@very-long-domain.example.com" }}
        collapsed={false}
      />
    );
    const nameEl = screen.getByText("Alice Smith");
    expect(nameEl).toHaveAttribute("title", "Alice Smith");
    const emailEl = screen.getByText("alice.smith@very-long-domain.example.com");
    expect(emailEl).toHaveAttribute("title", "alice.smith@very-long-domain.example.com");
  });
});
