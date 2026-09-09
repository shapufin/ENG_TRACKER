import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ImportDialog } from "./ImportDialog";
import type { ImportTarget } from "../types/dataImport";

const clientsTarget: ImportTarget = {
  target_key: "clients",
  display_name: "Clients",
  description: "Import or update the client catalog.",
  permission_scope: "manage",
  icon: "Building2",
  page_route: "/admin/clients",
  fields: [
    { key: "code", label: "Code", required: true, field_type: "string" },
    { key: "name", label: "Name", required: true, field_type: "string" },
  ],
  options: [
    {
      key: "update_existing",
      label: "Update existing records",
      option_type: "bool",
      default: false,
    },
  ],
  sample_rows: [],
  dedupe_keys: ["code"],
};

const getTargets = vi.fn();

vi.mock("../services/dataImportService", () => ({
  dataImportService: {
    getTargets: () => getTargets(),
    downloadTemplate: vi.fn().mockResolvedValue(undefined),
    listProfiles: vi.fn().mockResolvedValue([]),
    analyze: vi.fn(),
    preview: vi.fn(),
    commit: vi.fn(),
  },
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const renderDialog = (props: Partial<React.ComponentProps<typeof ImportDialog>> = {}) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ImportDialog targetKey="clients" open={true} onOpenChange={vi.fn()} {...props} />
    </QueryClientProvider>
  );
};

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

describe("ImportDialog", () => {
  it("titles itself with the target it is scoped to", async () => {
    renderDialog();
    expect(await screen.findByText("Import Clients")).toBeInTheDocument();
  });

  it("skips the target picker and opens on the upload step", async () => {
    renderDialog();
    expect(await screen.findByText("1. Upload file")).toBeInTheDocument();
    expect(screen.queryByText(/select target/i)).not.toBeInTheDocument();
  });

  it("offers the target's sample files", async () => {
    renderDialog();
    expect(await screen.findByRole("button", { name: /sample csv/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sample excel/i })).toBeInTheDocument();
  });

  it("renders nothing while closed", () => {
    renderDialog({ open: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("reports a target that is not available to this user", async () => {
    getTargets.mockResolvedValue({ targets: [] });
    renderDialog();
    await waitFor(() => expect(screen.getByText("Import not available")).toBeInTheDocument());
  });

  it("cannot advance past upload without a file", async () => {
    renderDialog();
    await screen.findByText("1. Upload file");
    expect(screen.getByRole("button", { name: /analyze/i })).toBeDisabled();
  });
});
