import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { SidebarProfileMenu } from "./SidebarProfileMenu";

const setTheme = vi.fn();
vi.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({ theme: "dark", setTheme, resolved: "dark" }),
}));
vi.mock("@/hooks/useInstallPrompt", () => ({ useInstallPrompt: vi.fn() }));
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

const mockInstall = (canShowInstallButton: boolean, over: Record<string, unknown> = {}) =>
  vi.mocked(useInstallPrompt).mockReturnValue({
    isIOS: false,
    isFirefox: false,
    isStandalone: false,
    isInstallable: true,
    canShowInstallGuidance: true,
    canShowInstallButton,
    promptInstall: vi.fn().mockResolvedValue(true),
    dismiss: vi.fn(),
    ...over,
  });

const user = { full_name: "Alice Smith", email: "alice@example.com" };

const renderMenu = (props: Partial<React.ComponentProps<typeof SidebarProfileMenu>> = {}) =>
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route
          path="/"
          element={
            <SidebarProfileMenu user={user} collapsed={false} onLogout={vi.fn()} {...props} />
          }
        />
        <Route path="/settings" element={<div>Settings page</div>} />
      </Routes>
    </MemoryRouter>
  );

const openMenu = () => {
  const trigger = screen.getByRole("button", { name: /Account menu/ });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "Enter" });
};

describe("SidebarProfileMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInstall(true);
  });

  it("footer is a single profile row with the name and no email", () => {
    renderMenu();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Account menu, Alice Smith" })).toBeInTheDocument();
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.queryByText("alice@example.com")).not.toBeInTheDocument();
  });

  it("collapsed rail shows only the avatar with an accessible name", () => {
    renderMenu({ collapsed: true });
    expect(screen.queryByText("Alice Smith")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Account menu, Alice Smith" })).toBeInTheDocument();
  });

  it("profile menu holds theme, settings and log out", () => {
    renderMenu();
    openMenu();
    expect(screen.getByRole("menuitem", { name: "Light theme" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Dark theme" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "System theme" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Settings/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Log out/ })).toBeInTheDocument();
  });

  it("choosing a theme calls setTheme", () => {
    renderMenu();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Light theme" }));
    expect(setTheme).toHaveBeenCalledWith("light");
  });

  it("log out from the menu runs the same logout handler", async () => {
    const onLogout = vi.fn();
    renderMenu({ onLogout });
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Log out/ }));
    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1));
  });

  it("logout runs only after the menu has closed, so its confirm dialog can take focus", async () => {
    const Host = () => {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <SidebarProfileMenu user={user} collapsed={false} onLogout={() => setOpen(true)} />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogTitle>Unsent changes</DialogTitle>
              <DialogDescription>Lost if you log out</DialogDescription>
              <button type="button">Log out anyway</button>
            </DialogContent>
          </Dialog>
        </>
      );
    };
    render(
      <MemoryRouter>
        <Host />
      </MemoryRouter>
    );
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Log out/ }));
    const confirm = await screen.findByRole("button", { name: "Log out anyway" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    confirm.focus();
    expect(document.activeElement).toBe(confirm);
  });

  it("settings item navigates to /settings", () => {
    renderMenu();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Settings/ }));
    expect(screen.getByText("Settings page")).toBeInTheDocument();
  });

  it("shows the install item when install is available", () => {
    renderMenu();
    openMenu();
    expect(screen.getByRole("menuitem", { name: /Install app/ })).toBeInTheDocument();
  });

  it("install item hidden when install is unavailable", () => {
    mockInstall(false);
    renderMenu();
    openMenu();
    expect(screen.queryByRole("menuitem", { name: /Install app/ })).not.toBeInTheDocument();
  });

  it("installs directly when the browser offers the native prompt", async () => {
    const promptInstall = vi.fn().mockResolvedValue(true);
    mockInstall(true, { promptInstall });
    renderMenu();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Install app/ }));
    await waitFor(() => expect(promptInstall).toHaveBeenCalledOnce());
  });

  it("shows iOS instructions in a dialog with the scroll contract", async () => {
    mockInstall(true, { isIOS: true, isInstallable: false });
    renderMenu();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Install app/ }));
    expect(await screen.findByText("Install Engineering Tracker")).toBeInTheDocument();
    expect(screen.getByText("Add to Home Screen")).toBeInTheDocument();
    const dlg = document.querySelector("[role='dialog']") as HTMLElement;
    expect(dlg.className).toContain("flex-col");
    expect(dlg.className).toContain("overflow-hidden");
    expect(dlg.className).toContain("max-h-[90vh]");
  });

  it("shows Firefox guidance when not installable", async () => {
    mockInstall(true, { isFirefox: true, isInstallable: false });
    renderMenu();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Install app/ }));
    expect(await screen.findByText(/Install site as app/)).toBeInTheDocument();
    expect(screen.getByText(/Chrome/)).toBeInTheDocument();
  });

  it("returns focus to the profile trigger when the install dialog closes", async () => {
    mockInstall(true, { isIOS: true, isInstallable: false });
    renderMenu();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Install app/ }));
    await screen.findByText("Install Engineering Tracker");
    fireEvent.keyDown(document.querySelector("[role='dialog']") as HTMLElement, {
      key: "Escape",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: /Account menu/ }))
    );
  });
});
