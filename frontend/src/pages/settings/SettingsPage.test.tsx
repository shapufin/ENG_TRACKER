import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SettingsPage } from "./SettingsPage";
import * as useAuth from "@/context/AuthContext";
import * as usePermissions from "@/context/PermissionContext";
import * as usePlugins from "@/context/PluginContext";
import { toast } from "sonner";

const navigate = vi.fn();
const logout = vi.fn();
const refreshUser = vi.fn().mockResolvedValue({});

vi.mock("@/context/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("@/context/PermissionContext", () => ({ usePermissions: vi.fn() }));
vi.mock("@/context/PluginContext", () => ({ usePlugins: vi.fn() }));
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));
vi.mock("@/components/ui/ThemeToggle", () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}));
vi.mock("./components/MyClientsSection", () => ({
  MyClientsSection: () => <div data-testid="my-clients" />,
}));
vi.mock("./components/ClientAssignmentSection", () => ({
  ClientAssignmentSection: () => <div data-testid="client-assignment" />,
}));
vi.mock("./components/NotificationPreferencesSection", () => ({
  NotificationPreferencesSection: () => <div data-testid="notification-preferences" />,
}));
vi.mock("@/plugins/control_room/hooks/useControlRoomAccess", () => ({
  useControlRoomMe: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn() } }));

const user = {
  username: "alice",
  email: "a@b.com",
  first_name: "Alice",
  last_name: "A",
  is_staff: true,
  is_hr: true,
  is_team_leader: true,
};

const defaultPermissions = { isCRUser: false };

beforeEach(() => {
  vi.mocked(usePlugins.usePlugins).mockReturnValue({
    activePlugins: [{ name: "notifications" }],
  } as any);
});

describe("SettingsPage", () => {
  it("does not request notification preferences when the plugin is inactive", () => {
    vi.mocked(usePlugins.usePlugins).mockReturnValue({ activePlugins: [] } as any);
    vi.mocked(useAuth.useAuth).mockReturnValue({ user, logout, refreshUser } as any);
    vi.mocked(usePermissions.usePermissions).mockReturnValue(defaultPermissions as any);

    render(<SettingsPage />);

    expect(screen.queryByText("Notification Preferences")).not.toBeInTheDocument();
  });

  it("renders profile and badges", () => {
    vi.mocked(useAuth.useAuth).mockReturnValue({ user, logout, refreshUser } as any);
    vi.mocked(usePermissions.usePermissions).mockReturnValue(defaultPermissions as any);
    render(<SettingsPage />);
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("HR")).toBeInTheDocument();
    expect(screen.getByText("Team Leader")).toBeInTheDocument();
  });

  it("renders user badge when no roles", () => {
    vi.mocked(useAuth.useAuth).mockReturnValue({
      user: { username: "bob" },
      logout,
      refreshUser,
    } as any);
    vi.mocked(usePermissions.usePermissions).mockReturnValue(defaultPermissions as any);
    render(<SettingsPage />);
    expect(screen.getByText("User")).toBeInTheDocument();
  });

  const getPasswordInputs = () =>
    document.querySelectorAll('input[type="password"]') as NodeListOf<HTMLInputElement>;

  it("validates password change", () => {
    vi.mocked(useAuth.useAuth).mockReturnValue({ user, logout, refreshUser } as any);
    vi.mocked(usePermissions.usePermissions).mockReturnValue(defaultPermissions as any);
    render(<SettingsPage />);
    const inputs = getPasswordInputs();
    fireEvent.change(inputs[0], { target: { value: "old" } });
    fireEvent.change(inputs[1], { target: { value: "new1" } });
    fireEvent.change(inputs[2], { target: { value: "new2" } });
    fireEvent.click(screen.getByText("Update Password"));
    expect(toast.error).toHaveBeenCalledWith("New passwords do not match");
  });

  it("validates password length", () => {
    vi.mocked(useAuth.useAuth).mockReturnValue({ user, logout, refreshUser } as any);
    vi.mocked(usePermissions.usePermissions).mockReturnValue(defaultPermissions as any);
    render(<SettingsPage />);
    const inputs = getPasswordInputs();
    fireEvent.change(inputs[0], { target: { value: "old" } });
    fireEvent.change(inputs[1], { target: { value: "short" } });
    fireEvent.change(inputs[2], { target: { value: "short" } });
    fireEvent.click(screen.getByText("Update Password"));
    expect(toast.error).toHaveBeenCalledWith("Password must be at least 8 characters");
  });

  it("submits valid password change", () => {
    vi.mocked(useAuth.useAuth).mockReturnValue({ user, logout, refreshUser } as any);
    vi.mocked(usePermissions.usePermissions).mockReturnValue(defaultPermissions as any);
    render(<SettingsPage />);
    const inputs = getPasswordInputs();
    fireEvent.change(inputs[0], { target: { value: "oldpass" } });
    fireEvent.change(inputs[1], { target: { value: "newpassword" } });
    fireEvent.change(inputs[2], { target: { value: "newpassword" } });
    fireEvent.click(screen.getByText("Update Password"));
    expect(toast.info).toHaveBeenCalled();
  });

  it("logs out", () => {
    vi.mocked(useAuth.useAuth).mockReturnValue({ user, logout, refreshUser } as any);
    vi.mocked(usePermissions.usePermissions).mockReturnValue(defaultPermissions as any);
    render(<SettingsPage />);
    fireEvent.click(screen.getByText("Log Out"));
    expect(logout).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/login");
  });

  it("associates password field labels with their inputs", () => {
    // Audit 2026-09-07: <Label> had no htmlFor and inputs had no id, so the
    // password fields had no programmatic accessible name.
    vi.mocked(useAuth.useAuth).mockReturnValue({ user, logout, refreshUser } as any);
    vi.mocked(usePermissions.usePermissions).mockReturnValue(defaultPermissions as any);
    render(<SettingsPage />);
    expect(screen.getByLabelText("Current Password")).toBe(getPasswordInputs()[0]);
    expect(screen.getByLabelText("New Password")).toBe(getPasswordInputs()[1]);
    expect(screen.getByLabelText("Confirm New Password")).toBe(getPasswordInputs()[2]);
  });

  // CR user settings — MyClientsSection hidden, CR Scope card shown,
  // "CR User" badge displayed. See CONTEXT.md rule 11.
  it("CR user: hides My Clients section and shows CR User badge", async () => {
    const { useControlRoomMe } = await import("@/plugins/control_room/hooks/useControlRoomAccess");
    vi.mocked(useControlRoomMe).mockReturnValue({
      data: {
        has_access: true,
        is_global: false,
        team_ids: [1],
        access: {
          id: 1,
          user: 10,
          username: "lediana",
          user_name: "Lediana Korra",
          email: "l@b.com",
          first_name: "Lediana",
          last_name: "Korra",
          phone: "",
          is_active: true,
          display_name: "Lediana",
          timezone: "UTC",
          team_scopes: [
            {
              id: 1,
              access: 1,
              team: 1,
              team_name: "MSC_TEAM",
              team_code: "MSC",
              include_subteams: false,
              created_at: "",
            },
          ],
          team_ids: [1],
          created_by: null,
          created_by_name: null,
          updated_by: null,
          updated_by_name: null,
          created_at: "",
          updated_at: "",
        },
      },
      isLoading: false,
    } as any);

    vi.mocked(useAuth.useAuth).mockReturnValue({
      user: { username: "lediana", has_control_room_access: true },
      logout,
      refreshUser,
    } as any);
    vi.mocked(usePermissions.usePermissions).mockReturnValue({ isCRUser: true } as any);

    render(<SettingsPage />);

    // CR User badge is shown
    expect(screen.getByText("CR User")).toBeInTheDocument();
    // CR Admin badge is NOT shown (they are not a CR admin)
    expect(screen.queryByText("CR Admin")).not.toBeInTheDocument();
    // My Clients and notification settings are NOT rendered
    expect(screen.queryByTestId("my-clients")).not.toBeInTheDocument();
    expect(screen.queryByTestId("notification-preferences")).not.toBeInTheDocument();
    // Control Room Scope card is shown with the team name
    expect(screen.getByText("Control Room Scope")).toBeInTheDocument();
    expect(screen.getByText("MSC_TEAM")).toBeInTheDocument();
  });

  it("CR user with no teams shows empty-state message", async () => {
    const { useControlRoomMe } = await import("@/plugins/control_room/hooks/useControlRoomAccess");
    vi.mocked(useControlRoomMe).mockReturnValue({
      data: {
        has_access: true,
        is_global: false,
        team_ids: [],
        access: {
          id: 1,
          user: 10,
          username: "lediana",
          user_name: "Lediana Korra",
          email: "l@b.com",
          first_name: "Lediana",
          last_name: "Korra",
          phone: "",
          is_active: true,
          display_name: "Lediana",
          timezone: "UTC",
          team_scopes: [],
          team_ids: [],
          created_by: null,
          created_by_name: null,
          updated_by: null,
          updated_by_name: null,
          created_at: "",
          updated_at: "",
        },
      },
      isLoading: false,
    } as any);

    vi.mocked(useAuth.useAuth).mockReturnValue({
      user: { username: "lediana", has_control_room_access: true },
      logout,
      refreshUser,
    } as any);
    vi.mocked(usePermissions.usePermissions).mockReturnValue({ isCRUser: true } as any);

    render(<SettingsPage />);
    expect(screen.getByText(/No teams assigned/i)).toBeInTheDocument();
  });

  it("CR user: API error shows error message, not 'No teams assigned'", async () => {
    const { useControlRoomMe } = await import("@/plugins/control_room/hooks/useControlRoomAccess");
    vi.mocked(useControlRoomMe).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as any);

    vi.mocked(useAuth.useAuth).mockReturnValue({
      user: { username: "lediana", has_control_room_access: true },
      logout,
      refreshUser,
    } as any);
    vi.mocked(usePermissions.usePermissions).mockReturnValue({ isCRUser: true } as any);

    render(<SettingsPage />);
    expect(screen.getByText(/Could not load your team scope/i)).toBeInTheDocument();
    expect(screen.queryByText(/No teams assigned/i)).not.toBeInTheDocument();
  });

  it("non-CR user: shows My Clients section, no CR Scope card", () => {
    vi.mocked(useAuth.useAuth).mockReturnValue({ user, logout, refreshUser } as any);
    vi.mocked(usePermissions.usePermissions).mockReturnValue(defaultPermissions as any);
    render(<SettingsPage />);
    expect(screen.getByTestId("my-clients")).toBeInTheDocument();
    expect(screen.queryByText("Control Room Scope")).not.toBeInTheDocument();
    expect(screen.queryByText("CR User")).not.toBeInTheDocument();
  });

  it("CR admin: hides My Clients, notification preferences, and CR Scope card", () => {
    vi.mocked(useAuth.useAuth).mockReturnValue({
      user: { username: "cr-admin", is_cr_admin: true },
      logout,
      refreshUser,
    } as any);
    vi.mocked(usePermissions.usePermissions).mockReturnValue({
      isCRAdmin: true,
      isAdmin: false,
      isSuperuser: false,
      isHR: false,
      isTeamLeader: false,
      isCRUser: false,
    } as any);

    render(<SettingsPage />);

    expect(screen.queryByTestId("my-clients")).not.toBeInTheDocument();
    expect(screen.queryByTestId("notification-preferences")).not.toBeInTheDocument();
    // CR Scope card is for CR users only, not CR admins
    expect(screen.queryByText("Control Room Scope")).not.toBeInTheDocument();
    // CR Admin badge is shown (not "Admin" — they are not staff)
    expect(screen.getByText("CR Admin")).toBeInTheDocument();
  });

  it("team leader: shows the Client Assignment card", () => {
    vi.mocked(useAuth.useAuth).mockReturnValue({ user, logout, refreshUser } as any);
    vi.mocked(usePermissions.usePermissions).mockReturnValue({
      isTeamLeader: true,
      isCRUser: false,
    } as any);
    render(<SettingsPage />);
    expect(screen.getByTestId("client-assignment")).toBeInTheDocument();
  });

  it("non-TL: hides the Client Assignment card", () => {
    vi.mocked(useAuth.useAuth).mockReturnValue({ user, logout, refreshUser } as any);
    vi.mocked(usePermissions.usePermissions).mockReturnValue(defaultPermissions as any);
    render(<SettingsPage />);
    expect(screen.queryByTestId("client-assignment")).not.toBeInTheDocument();
  });

  it("CR-scoped TL: hides the Client Assignment card", () => {
    vi.mocked(useAuth.useAuth).mockReturnValue({ user, logout, refreshUser } as any);
    vi.mocked(usePermissions.usePermissions).mockReturnValue({
      isTeamLeader: true,
      isCRUser: true,
    } as any);
    render(<SettingsPage />);
    expect(screen.queryByTestId("client-assignment")).not.toBeInTheDocument();
  });
});
