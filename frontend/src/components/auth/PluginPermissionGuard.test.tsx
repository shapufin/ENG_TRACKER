import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PluginPermissionGuard } from "./PluginPermissionGuard";
import * as useAuth from "@/context/AuthContext";
import * as usePluginPermissions from "@/hooks/usePluginPermissions";

vi.mock("@/context/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("@/hooks/usePluginPermissions", () => ({ usePluginPermissions: vi.fn() }));

const mockedAuth = (overrides: any = {}) => ({ isAuthenticated: true, user: null, ...overrides });
const mockedPermissions = (overrides: any = {}) => ({
  isLoading: false,
  hasPermission: () => false,
  ...overrides,
});

describe("PluginPermissionGuard", () => {
  it("renders fallback when unauthenticated", () => {
    vi.mocked(useAuth.useAuth).mockReturnValue(mockedAuth({ isAuthenticated: false }));
    vi.mocked(usePluginPermissions.usePluginPermissions).mockReturnValue(mockedPermissions());
    render(
      <PluginPermissionGuard pluginName="p" fallback={<div data-testid="fallback">Fallback</div>}>
        Content
      </PluginPermissionGuard>
    );
    expect(screen.getByTestId("fallback")).toBeInTheDocument();
  });

  it("renders auth required without fallback", () => {
    vi.mocked(useAuth.useAuth).mockReturnValue(mockedAuth({ isAuthenticated: false }));
    vi.mocked(usePluginPermissions.usePluginPermissions).mockReturnValue(mockedPermissions());
    render(<PluginPermissionGuard pluginName="p">Content</PluginPermissionGuard>);
    expect(screen.getByText("Authentication Required")).toBeInTheDocument();
  });

  it("renders loading state", () => {
    vi.mocked(useAuth.useAuth).mockReturnValue(mockedAuth());
    vi.mocked(usePluginPermissions.usePluginPermissions).mockReturnValue(
      mockedPermissions({ isLoading: true })
    );
    render(<PluginPermissionGuard pluginName="p">Content</PluginPermissionGuard>);
    expect(screen.getByText("Loading permissions...")).toBeInTheDocument();
  });

  it("renders children for staff", () => {
    vi.mocked(useAuth.useAuth).mockReturnValue(mockedAuth({ user: { is_staff: true } }));
    vi.mocked(usePluginPermissions.usePluginPermissions).mockReturnValue(mockedPermissions());
    render(<PluginPermissionGuard pluginName="p">Content</PluginPermissionGuard>);
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("renders children when has permission", () => {
    vi.mocked(useAuth.useAuth).mockReturnValue(mockedAuth());
    vi.mocked(usePluginPermissions.usePluginPermissions).mockReturnValue(
      mockedPermissions({ hasPermission: () => true })
    );
    render(<PluginPermissionGuard pluginName="p">Content</PluginPermissionGuard>);
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("renders access denied without fallback", () => {
    vi.mocked(useAuth.useAuth).mockReturnValue(mockedAuth());
    vi.mocked(usePluginPermissions.usePluginPermissions).mockReturnValue(mockedPermissions());
    render(
      <PluginPermissionGuard pluginName="p" action="manage">
        Content
      </PluginPermissionGuard>
    );
    expect(screen.getByText("Access Denied")).toBeInTheDocument();
  });

  it("renders fallback when access denied", () => {
    vi.mocked(useAuth.useAuth).mockReturnValue(mockedAuth());
    vi.mocked(usePluginPermissions.usePluginPermissions).mockReturnValue(mockedPermissions());
    render(
      <PluginPermissionGuard pluginName="p" fallback={<div data-testid="fallback">Fallback</div>}>
        Content
      </PluginPermissionGuard>
    );
    expect(screen.getByTestId("fallback")).toBeInTheDocument();
  });
});
