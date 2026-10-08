import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { Users, Clock } from "lucide-react";
import { CommandPalette } from "./CommandPalette";
import { navItemToPaletteItem, type PaletteItem } from "./paletteItems";
import { pushRecent } from "./paletteRecents";
import { userService } from "@/services/userService";

vi.mock("@/services/userService", () => ({ userService: { getProfiles: vi.fn() } }));

const items: PaletteItem[] = [
  { path: "/admin/users", label: "Users", icon: Users, group: "People" },
  { path: "/admin/overtime-logs", label: "Overtime Logs", icon: Clock, group: "Operations" },
];

const Where = () => <div data-testid="where">{useLocation().pathname + useLocation().search}</div>;

const profile = (id: number, username: string, full: string, flags: object = {}) => ({
  id,
  user: { id, username, full_name: full },
  ...flags,
});

const setup = (props: Partial<React.ComponentProps<typeof CommandPalette>> = {}) => {
  const onOpenChange = vi.fn();
  render(
    <MemoryRouter initialEntries={["/admin"]}>
      <CommandPalette items={items} open onOpenChange={onOpenChange} {...props} />
      <Where />
    </MemoryRouter>
  );
  return { onOpenChange, input: screen.getByRole("combobox") };
};

beforeEach(() => {
  localStorage.clear();
  vi.mocked(userService.getProfiles).mockReset();
  vi.mocked(userService.getProfiles).mockResolvedValue({ count: 0, results: [] } as never);
});
afterEach(() => vi.useRealTimers());

describe("recents", () => {
  it("lists recent pages first when the query is empty, only those still in items", () => {
    pushRecent(7, "/admin/overtime-logs");
    pushRecent(7, "/admin/gone");
    setup({ userId: 7 });
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveTextContent("Overtime Logs");
    expect(screen.getByText("Recent")).toBeInTheDocument();
    expect(screen.queryByText(/gone/)).not.toBeInTheDocument();
    expect(options).toHaveLength(3); // recent + both pages in their groups
  });

  it("shows no Recent heading without a user id or history", () => {
    setup();
    expect(screen.queryByText("Recent")).not.toBeInTheDocument();
  });

  it("selecting a page records it as recent", () => {
    setup({ userId: 7 });
    fireEvent.click(screen.getByRole("option", { name: /Users/ }));
    expect(JSON.parse(localStorage.getItem("admin.palette.recents.7")!)).toEqual(["/admin/users"]);
  });
});

describe("user search", () => {
  it("does not search under 2 characters or when userSearch is off", async () => {
    vi.useFakeTimers();
    const { input } = setup({ userSearch: true });
    fireEvent.change(input, { target: { value: "a" } });
    await act(async () => void vi.advanceTimersByTime(400));
    expect(userService.getProfiles).not.toHaveBeenCalled();
  });

  it("never searches users when userSearch is false", async () => {
    vi.useFakeTimers();
    const { input } = setup();
    fireEvent.change(input, { target: { value: "ana" } });
    await act(async () => void vi.advanceTimersByTime(400));
    expect(userService.getProfiles).not.toHaveBeenCalled();
  });

  it("debounces to one request with search and page_size", async () => {
    vi.useFakeTimers();
    const { input } = setup({ userSearch: true });
    for (const v of ["an", "ana", "anas"]) fireEvent.change(input, { target: { value: v } });
    await act(async () => void vi.advanceTimersByTime(249));
    expect(userService.getProfiles).not.toHaveBeenCalled();
    await act(async () => void vi.advanceTimersByTime(2));
    expect(userService.getProfiles).toHaveBeenCalledTimes(1);
    expect(userService.getProfiles).toHaveBeenCalledWith({ search: "anas", page_size: 5 });
  });

  it("renders users and Enter opens the users page filtered to them", async () => {
    vi.useFakeTimers();
    vi.mocked(userService.getProfiles).mockResolvedValue({
      count: 1,
      results: [profile(1, "ana.lee", "Ana Lee")],
    } as never);
    const { input, onOpenChange } = setup({ userSearch: true });
    fireEvent.change(input, { target: { value: "ana" } });
    await act(async () => void vi.advanceTimersByTime(300));
    expect(screen.getByText("Users", { selector: "li" })).toBeInTheDocument();
    const user = screen.getByRole("option", { name: /Ana Lee/ });
    expect(user).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "ArrowDown" }); // from nothing-matching pages onto the user
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByTestId("where")).toHaveTextContent("/admin/users?q=ana.lee");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("adds the role tab for a team leader so the Users page can show them", async () => {
    vi.useFakeTimers();
    vi.mocked(userService.getProfiles).mockResolvedValue({
      count: 1,
      results: [profile(3, "tl.one", "TL One", { is_italian_tl_role: true })],
    } as never);
    const { input } = setup({ userSearch: true });
    fireEvent.change(input, { target: { value: "tl" } });
    await act(async () => void vi.advanceTimersByTime(300));
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByTestId("where")).toHaveTextContent("/admin/users?q=tl.one&role=italian_tl");
  });

  it("ignores a slow response for an older query", async () => {
    vi.useFakeTimers();
    let resolveOld: (v: unknown) => void = () => {};
    vi.mocked(userService.getProfiles)
      .mockImplementationOnce(() => new Promise((r) => (resolveOld = r)) as never)
      .mockResolvedValueOnce({ count: 1, results: [profile(2, "new.user", "New User")] } as never);
    const { input } = setup({ userSearch: true });
    fireEvent.change(input, { target: { value: "old" } });
    await act(async () => void vi.advanceTimersByTime(300));
    fireEvent.change(input, { target: { value: "new" } });
    await act(async () => void vi.advanceTimersByTime(300));
    await act(async () => resolveOld({ count: 1, results: [profile(1, "old.user", "Old User")] }));
    expect(screen.getByRole("option", { name: /New User/ })).toBeInTheDocument();
    expect(screen.queryByText(/Old User/)).not.toBeInTheDocument();
  });

  it("shows no users and does not crash when the search fails", async () => {
    vi.useFakeTimers();
    vi.mocked(userService.getProfiles).mockRejectedValue(new Error("boom"));
    const { input } = setup({ userSearch: true });
    fireEvent.change(input, { target: { value: "ana" } });
    await act(async () => void vi.advanceTimersByTime(300));
    expect(screen.getByText("No matches")).toBeInTheDocument();
  });
});

describe("navItemToPaletteItem", () => {
  it("maps the nav section to its label", () => {
    const mapped = navItemToPaletteItem({
      path: "/overtime",
      label: "Overtime",
      icon: Clock,
      section: "core",
    });
    expect(mapped).toMatchObject({ path: "/overtime", label: "Overtime", group: "Core Ops" });
  });
});
