import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";
import { OnboardingPage } from "./OnboardingPage";
import { onboardingService } from "../services/onboardingService";
import * as download from "@/lib/download";

const useAuthMock = vi.fn();
const canExportMock = vi.fn();
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => useAuthMock(),
}));
vi.mock("@/hooks/usePluginPermissions", () => ({
  usePluginPermissions: () => ({ canExport: canExportMock }),
}));

vi.mock("../components/FolderBrowser", () => ({
  FolderBrowser: ({ clientName, readOnly }: { clientName: string; readOnly?: boolean }) => (
    <div data-testid="folder-browser" data-readonly={String(!!readOnly)}>
      {clientName}
    </div>
  ),
}));

vi.mock("../services/onboardingService", () => ({
  onboardingService: {
    getClients: vi.fn(),
    getArchivedClients: vi.fn(),
    createClientExport: vi.fn(),
    createAllClientsExport: vi.fn(),
    getExport: vi.fn(),
    getExportDownloadUrl: vi.fn(),
  },
}));
vi.mock("@/lib/download", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/download")>()),
  navigateToDownload: vi.fn(),
}));

const renderPage = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <OnboardingPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe("OnboardingPage", () => {
  it("renders the empty state when the user has no assigned clients", () => {
    useAuthMock.mockReturnValue({ user: { client_ids: [] } });
    canExportMock.mockReturnValue(false);
    renderPage();
    expect(screen.getByText("No clients assigned")).toBeInTheDocument();
    expect(onboardingService.getClients).not.toHaveBeenCalled();
  });

  it("renders a distinct empty state when every assigned client is inactive", async () => {
    // client_ids has entries but the API returns none of them active —
    // without this state, the page rendered only the header with no body.
    useAuthMock.mockReturnValue({ user: { client_ids: [1] } });
    canExportMock.mockReturnValue(false);
    (onboardingService.getClients as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("No active clients")).toBeInTheDocument();
    });
  });

  it("renders the folder browser for the assigned client once loaded", async () => {
    useAuthMock.mockReturnValue({ user: { client_ids: [1] } });
    canExportMock.mockReturnValue(false);
    (onboardingService.getClients as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 1, name: "Acme", code: "ACME" },
    ]);
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("folder-browser")).toHaveTextContent("Acme");
    });
  });

  it("hides the archive toggle from a non-superuser", async () => {
    useAuthMock.mockReturnValue({ user: { client_ids: [1] } });
    canExportMock.mockReturnValue(false);
    (onboardingService.getClients as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 1, name: "Acme", code: "ACME" },
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByTestId("folder-browser")).toBeInTheDocument());
    expect(screen.queryByLabelText("Show archived clients")).not.toBeInTheDocument();
  });

  it("lets a superuser read archived onboarding, read-only, with no assignments", async () => {
    useAuthMock.mockReturnValue({ user: { client_ids: [], is_superuser: true } });
    canExportMock.mockReturnValue(true);
    (onboardingService.getClients as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 1, name: "Acme", code: "ACME" },
    ]);
    (onboardingService.getArchivedClients as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 2, name: "Old Co", code: "OLD" },
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByTestId("folder-browser")).toHaveTextContent("Acme"));

    fireEvent.click(screen.getByLabelText("Show archived clients"));

    await waitFor(() => expect(screen.getByTestId("folder-browser")).toHaveTextContent("Old Co"));
    expect(onboardingService.getArchivedClients).toHaveBeenCalled();
    expect(screen.getByTestId("folder-browser")).toHaveAttribute("data-readonly", "true");
    expect(screen.getByText(/Archived clients are read-only/)).toBeInTheDocument();
  });

  it("downloads the selected client's ZIP through the signed link", async () => {
    useAuthMock.mockReturnValue({ user: { client_ids: [1] } });
    canExportMock.mockReturnValue(true);
    (onboardingService.getClients as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 1, name: "Acme", code: "ACME" },
    ]);
    (onboardingService.createClientExport as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 8,
      status: "pending",
    });
    (onboardingService.getExport as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 8,
      status: "ready",
    });
    (onboardingService.getExportDownloadUrl as ReturnType<typeof vi.fn>).mockResolvedValue(
      "/api/x/download/?token=t"
    );
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Download Acme ZIP/ }));
    await waitFor(() => expect(onboardingService.createClientExport).toHaveBeenCalledWith(1));
    await waitFor(() =>
      expect(download.navigateToDownload).toHaveBeenCalledWith("/api/x/download/?token=t")
    );
  });

  it("offers Export all clients to a superuser only", async () => {
    useAuthMock.mockReturnValue({ user: { client_ids: [1], is_superuser: true } });
    canExportMock.mockReturnValue(true);
    (onboardingService.getClients as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 1, name: "Acme", code: "ACME" },
    ]);
    (onboardingService.createAllClientsExport as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 12,
      status: "pending",
    });
    (onboardingService.getExport as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 12,
      status: "failed",
      error: "disk full",
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Export all clients/ }));
    await waitFor(() => expect(onboardingService.createAllClientsExport).toHaveBeenCalled());
    expect(await screen.findByText(/disk full/)).toBeInTheDocument();
  });
});
