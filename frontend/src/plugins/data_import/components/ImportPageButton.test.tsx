import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ImportPageButton } from "./ImportPageButton";

const getTargets = vi.fn();

vi.mock("../services/dataImportService", () => ({
  dataImportService: {
    getTargets: () => getTargets(),
    downloadTemplate: vi.fn(),
    listProfiles: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const clientsTarget = {
  target_key: "clients",
  display_name: "Clients",
  description: "",
  permission_scope: "manage",
  icon: "Building2",
  page_route: "/admin/clients",
  fields: [{ key: "code", label: "Code", required: true, field_type: "string" }],
  options: [],
  sample_rows: [],
  dedupe_keys: ["code"],
};

const renderButton = (props = {}) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ImportPageButton targetKey="clients" {...props} />
    </QueryClientProvider>
  );

beforeEach(() => {
  getTargets.mockResolvedValue({ targets: [clientsTarget] });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("ImportPageButton", () => {
  it("shows the button when the target is available", async () => {
    renderButton();
    expect(await screen.findByRole("button", { name: /import/i })).toBeInTheDocument();
  });

  it("stays hidden when the target is not available to this user", async () => {
    getTargets.mockResolvedValue({ targets: [] });
    renderButton();
    await waitFor(() => expect(getTargets).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /import/i })).not.toBeInTheDocument();
  });

  it("stays hidden when the targets request fails (plugin disabled)", async () => {
    getTargets.mockRejectedValue(new Error("404"));
    renderButton();
    await waitFor(() => expect(getTargets).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /import/i })).not.toBeInTheDocument();
  });

  it("opens the scoped dialog", async () => {
    renderButton();
    fireEvent.click(await screen.findByRole("button", { name: /import/i }));
    expect(await screen.findByText("Import Clients")).toBeInTheDocument();
  });

  it("accepts a custom label", async () => {
    renderButton({ label: "Import Clients" });
    expect(await screen.findByRole("button", { name: "Import Clients" })).toBeInTheDocument();
  });
});
