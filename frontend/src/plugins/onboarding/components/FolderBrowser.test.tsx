import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";
import { FolderBrowser } from "./FolderBrowser";
import { onboardingService } from "../services/onboardingService";
import type { Document, Folder } from "../types/onboarding";

vi.mock("@/context/PluginContext", () => ({
  usePlugins: () => ({
    activePlugins: [{ name: "onboarding", settings: { office_editor_enabled: true } }],
  }),
}));

vi.mock("../services/onboardingService", () => ({
  onboardingService: {
    getFolders: vi.fn(),
    getDocuments: vi.fn(),
    createFolder: vi.fn(),
    renameFolder: vi.fn(),
    deleteFolder: vi.fn(),
    moveFolder: vi.fn(),
    uploadDocument: vi.fn(),
    renameDocument: vi.fn(),
    deleteDocument: vi.fn(),
    moveDocument: vi.fn(),
    downloadDocument: vi.fn(),
    search: vi.fn(),
  },
}));

const folder = (overrides: Partial<Folder> = {}): Folder => ({
  id: 1,
  client: 1,
  parent: null,
  name: "Contracts",
  created_by: null,
  created_by_name: null,
  updated_by: null,
  updated_by_name: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  child_count: 0,
  document_count: 0,
  ...overrides,
});

const doc = (overrides: Partial<Document> = {}): Document => ({
  id: 1,
  client: 1,
  folder: null,
  name: "invoice.pdf",
  size_bytes: 2048,
  uploaded_by: null,
  uploaded_by_name: null,
  updated_by: null,
  updated_by_name: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

const LocationDisplay = () => {
  const location = useLocation();
  return <div data-testid="location-pathname">{location.pathname}</div>;
};

const renderBrowser = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <FolderBrowser clientId={1} clientName="Acme" />
        <LocationDisplay />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe("FolderBrowser", () => {
  it("renders the empty state when the current folder has no folders or files", async () => {
    (onboardingService.getFolders as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (onboardingService.getDocuments as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    renderBrowser();
    await waitFor(() => {
      expect(screen.getByText("This folder is empty")).toBeInTheDocument();
    });
  });

  it("renders folder and document tiles when data is present", async () => {
    (onboardingService.getFolders as ReturnType<typeof vi.fn>).mockResolvedValue([folder()]);
    (onboardingService.getDocuments as ReturnType<typeof vi.fn>).mockResolvedValue([doc()]);
    renderBrowser();
    await waitFor(() => {
      expect(screen.getByText("Contracts")).toBeInTheDocument();
      expect(screen.getByText("invoice.pdf")).toBeInTheDocument();
    });
    expect(screen.queryByText("This folder is empty")).not.toBeInTheDocument();
  });

  it("navigates into a folder via breadcrumb when its tile is clicked", async () => {
    (onboardingService.getFolders as ReturnType<typeof vi.fn>).mockResolvedValue([folder()]);
    (onboardingService.getDocuments as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    renderBrowser();
    await waitFor(() => expect(screen.getByText("Contracts")).toBeInTheDocument());
    screen.getByText("Contracts").click();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Contracts/ })).toBeInTheDocument();
    });
  });

  it("switches to search results after typing, and back to browsing when cleared", async () => {
    (onboardingService.getFolders as ReturnType<typeof vi.fn>).mockResolvedValue([folder()]);
    (onboardingService.getDocuments as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (onboardingService.search as ReturnType<typeof vi.fn>).mockResolvedValue({
      folders: [{ id: 9, name: "Legal Docs", parent: null, path: null, ancestors: [] }],
      documents: [],
    });
    renderBrowser();
    await waitFor(() => expect(screen.getByText("Contracts")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Search folders and files"), {
      target: { value: "legal" },
    });
    await waitFor(() => {
      expect(screen.getByText("Legal Docs")).toBeInTheDocument();
    });
    expect(screen.queryByText("Contracts")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Clear search"));
    await waitFor(() => {
      expect(screen.getByText("Contracts")).toBeInTheDocument();
    });
    expect(screen.queryByText("Legal Docs")).not.toBeInTheDocument();
  });

  it("opening a search folder result jumps into it and clears the search", async () => {
    (onboardingService.getFolders as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (onboardingService.getDocuments as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (onboardingService.search as ReturnType<typeof vi.fn>).mockResolvedValue({
      folders: [
        {
          id: 9,
          name: "Legal Docs",
          parent: 5,
          path: "Parent",
          ancestors: [{ id: 5, name: "Parent" }],
        },
      ],
      documents: [],
    });
    renderBrowser();

    fireEvent.change(screen.getByLabelText("Search folders and files"), {
      target: { value: "legal" },
    });
    await waitFor(() => expect(screen.getByText("Legal Docs")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Legal Docs"));

    await waitFor(() => {
      // Full trail reconstructed from `ancestors` (not just a single crumb
      // for the matched folder) — both the ancestor and the folder itself
      // appear as breadcrumb buttons.
      expect(screen.getByRole("button", { name: /Parent/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Legal Docs/ })).toBeInTheDocument();
    });
    expect((screen.getByLabelText("Search folders and files") as HTMLInputElement).value).toBe("");
  });

  it("shows the last editor's name in the detail panel when the item has been edited", async () => {
    (onboardingService.getFolders as ReturnType<typeof vi.fn>).mockResolvedValue([
      folder({ created_by_name: "Jane Doe", updated_by_name: "Alex Editor" }),
    ]);
    (onboardingService.getDocuments as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    renderBrowser();
    await waitFor(() => expect(screen.getByText("Contracts")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("View details for Contracts"));

    const panel = screen.getByLabelText("Item details");
    expect(within(panel).getByText("Alex Editor")).toBeInTheDocument();
    expect(within(panel).getByText("Modified on")).toBeInTheDocument();
  });

  it("opens the detail panel with creator/timestamp info when a folder's Info button is clicked", async () => {
    (onboardingService.getFolders as ReturnType<typeof vi.fn>).mockResolvedValue([
      folder({ created_by_name: "Jane Doe", child_count: 2, document_count: 3 }),
    ]);
    (onboardingService.getDocuments as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    renderBrowser();
    await waitFor(() => expect(screen.getByText("Contracts")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("View details for Contracts"));

    expect(screen.getByLabelText("Item details")).toBeInTheDocument();
    expect(screen.getByText("2 folders, 3 files")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });

  it("closes the detail panel via its Close button", async () => {
    (onboardingService.getFolders as ReturnType<typeof vi.fn>).mockResolvedValue([folder()]);
    (onboardingService.getDocuments as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    renderBrowser();
    await waitFor(() => expect(screen.getByText("Contracts")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("View details for Contracts"));
    expect(screen.getByLabelText("Item details")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Close details panel"));
    expect(screen.queryByLabelText("Item details")).not.toBeInTheDocument();
  });

  it("opens the detail panel for a document showing size and a Download action", async () => {
    (onboardingService.getFolders as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (onboardingService.getDocuments as ReturnType<typeof vi.fn>).mockResolvedValue([
      doc({ name: "invoice.pdf", size_bytes: 2048, uploaded_by_name: "Alex" }),
    ]);
    renderBrowser();
    await waitFor(() => expect(screen.getByText("invoice.pdf")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("View details for invoice.pdf"));

    const panel = screen.getByLabelText("Item details");
    expect(within(panel).getByText("2.0 KB")).toBeInTheDocument();
    expect(within(panel).getByText("Alex")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Download" })).toBeInTheDocument();
  });

  it("shows a Preview button for PDF documents but not for other file types", async () => {
    (onboardingService.getFolders as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (onboardingService.getDocuments as ReturnType<typeof vi.fn>).mockResolvedValue([
      doc({ id: 1, name: "contract.pdf" }),
      doc({ id: 2, name: "notes.docx" }),
    ]);
    renderBrowser();
    await waitFor(() => expect(screen.getByText("contract.pdf")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("View details for contract.pdf"));
    expect(within(screen.getByLabelText("Item details")).getByRole("button", { name: "Preview" })).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Close details panel"));
    fireEvent.click(screen.getByLabelText("View details for notes.docx"));
    expect(
      within(screen.getByLabelText("Item details")).queryByRole("button", { name: "Preview" })
    ).not.toBeInTheDocument();
  });

  it("shows an Edit button for office documents when the editor is enabled, and navigates to the editor page on click", async () => {
    (onboardingService.getFolders as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (onboardingService.getDocuments as ReturnType<typeof vi.fn>).mockResolvedValue([
      doc({ id: 7, name: "notes.docx" }),
      doc({ id: 8, name: "contract.pdf" }),
    ]);
    renderBrowser();
    await waitFor(() => expect(screen.getByText("notes.docx")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("View details for notes.docx"));
    const editButton = within(screen.getByLabelText("Item details")).getByRole("button", {
      name: "Edit",
    });
    expect(editButton).toBeInTheDocument();
    fireEvent.click(editButton);
    expect(screen.getByTestId("location-pathname").textContent).toBe(
      "/onboarding/documents/7/edit"
    );

    fireEvent.click(screen.getByLabelText("Close details panel"));
    fireEvent.click(screen.getByLabelText("View details for contract.pdf"));
    expect(
      within(screen.getByLabelText("Item details")).queryByRole("button", { name: "Edit" })
    ).not.toBeInTheDocument();
  });

  it("hides the Edit button when the office editor plugin setting is off", async () => {
    vi.doMock("@/context/PluginContext", () => ({
      usePlugins: () => ({
        activePlugins: [{ name: "onboarding", settings: { office_editor_enabled: false } }],
      }),
    }));
    vi.resetModules();
    const { FolderBrowser: FreshFolderBrowser } = await import("./FolderBrowser");
    (onboardingService.getFolders as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (onboardingService.getDocuments as ReturnType<typeof vi.fn>).mockResolvedValue([
      doc({ id: 7, name: "notes.docx" }),
    ]);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <FreshFolderBrowser clientId={1} clientName="Acme" />
        </MemoryRouter>
      </QueryClientProvider>
    );
    await waitFor(() => expect(screen.getByText("notes.docx")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("View details for notes.docx"));
    expect(
      within(screen.getByLabelText("Item details")).queryByRole("button", { name: "Edit" })
    ).not.toBeInTheDocument();
  });

  it("opens a blank tab synchronously (gesture-safe), then redirects it to the PDF's object URL", async () => {
    const blob = new Blob(["%PDF-1.4"], { type: "application/pdf" });
    (onboardingService.getFolders as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (onboardingService.getDocuments as ReturnType<typeof vi.fn>).mockResolvedValue([
      doc({ name: "contract.pdf" }),
    ]);
    (onboardingService.downloadDocument as ReturnType<typeof vi.fn>).mockResolvedValue(blob);
    const createObjectURL = vi.fn(() => "blob:mock-url");
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL: vi.fn() });
    const fakeTab = { location: { href: "" }, close: vi.fn() };
    const windowOpen = vi.spyOn(window, "open").mockReturnValue(fakeTab as unknown as Window);

    renderBrowser();
    await waitFor(() => expect(screen.getByText("contract.pdf")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("View details for contract.pdf"));
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    // Opened blank, synchronously, before the blob fetch resolves.
    expect(windowOpen).toHaveBeenCalledWith("", "_blank", "noopener");
    await waitFor(() => expect(fakeTab.location.href).toBe("blob:mock-url"));
    windowOpen.mockRestore();
    vi.unstubAllGlobals();
  });

  it("shows a toast and closes the blank tab when the preview fetch fails", async () => {
    (onboardingService.getFolders as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (onboardingService.getDocuments as ReturnType<typeof vi.fn>).mockResolvedValue([
      doc({ name: "contract.pdf" }),
    ]);
    (onboardingService.downloadDocument as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));
    const fakeTab = { location: { href: "" }, close: vi.fn() };
    const windowOpen = vi.spyOn(window, "open").mockReturnValue(fakeTab as unknown as Window);

    renderBrowser();
    await waitFor(() => expect(screen.getByText("contract.pdf")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("View details for contract.pdf"));
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    await waitFor(() => expect(fakeTab.close).toHaveBeenCalled());
    windowOpen.mockRestore();
  });
});
