import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ImportDialog } from "./ImportDialog";

vi.mock("../services/dataImportService", () => ({
  dataImportService: {
    getTargets: () =>
      Promise.resolve({
        targets: [
          {
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
          },
        ],
      }),
    downloadTemplate: vi.fn(),
    listProfiles: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  );
});

afterEach(() => vi.unstubAllGlobals());

// Dialog contract: width comes from `size`, the shell is a bounded flex
// column, and DialogBody is the single scroll region.
describe("ImportDialog scroll contract", () => {
  it("is a bounded flex column with exactly one scroll region", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ImportDialog targetKey="clients" open onOpenChange={vi.fn()} />
      </QueryClientProvider>
    );
    await screen.findByText("Import Clients");

    const dialog = document.querySelector("[role='dialog']") as HTMLElement;
    expect(dialog.className).toContain("flex-col");
    expect(dialog.className).toContain("overflow-hidden");
    expect(dialog.className).not.toContain("overflow-y-auto");
    expect(document.querySelectorAll(".flex-1.overflow-y-auto")).toHaveLength(1);
  });

  it("sets its width through the size scale, not a max-w class", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ImportDialog targetKey="clients" open onOpenChange={vi.fn()} />
      </QueryClientProvider>
    );
    await screen.findByText("Import Clients");

    const dialog = document.querySelector("[role='dialog']") as HTMLElement;
    expect(dialog.className).toContain("max-w-4xl");
  });
});
