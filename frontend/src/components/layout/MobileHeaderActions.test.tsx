import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MobileHeaderActions } from "./MobileHeaderActions";

const renderActions = (onOpenSearch = vi.fn(), onLogout = vi.fn()) => {
  render(
    <MemoryRouter>
      <MobileHeaderActions
        user={{ first_name: "Ada", last_name: "Lovelace", username: "ada" }}
        roleSubtitle="Employee"
        onOpenSearch={onOpenSearch}
        onLogout={onLogout}
      />
    </MemoryRouter>
  );
  return { onOpenSearch, onLogout };
};

describe("MobileHeaderActions", () => {
  it("opens the page launcher from a 44px search button", () => {
    const { onOpenSearch } = renderActions();
    const search = screen.getByRole("button", { name: "Search pages" });
    expect(search).toHaveClass("h-11", "w-11");
    fireEvent.click(search);
    expect(onOpenSearch).toHaveBeenCalledTimes(1);
  });

  it("offers the account menu with logout", () => {
    const { onLogout } = renderActions();
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    fireEvent.click(screen.getByRole("button", { name: /logout/i }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});
