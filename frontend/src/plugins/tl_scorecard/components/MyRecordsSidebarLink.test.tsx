import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MyRecordsSidebarLink from "./MyRecordsSidebarLink";

vi.mock("@/components/layout/SidebarNavLink", () => ({
  SidebarNavLink: ({ label, to, isActive }: { label: string; to: string; isActive: boolean }) => (
    <a href={to} data-active={isActive}>
      {label}
    </a>
  ),
}));

describe("MyRecordsSidebarLink", () => {
  it("renders for any user and marks itself active on /my-records", () => {
    render(
      <MemoryRouter initialEntries={["/my-records"]}>
        <MyRecordsSidebarLink />
      </MemoryRouter>
    );
    const link = screen.getByText("My records");
    expect(link).toHaveAttribute("href", "/my-records");
    expect(link).toHaveAttribute("data-active", "true");
  });
});
