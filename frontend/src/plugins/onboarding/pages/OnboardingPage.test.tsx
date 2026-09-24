import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";
import { OnboardingPage } from "./OnboardingPage";
import { onboardingService } from "../services/onboardingService";

const useAuthMock = vi.fn();
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("../components/FolderBrowser", () => ({
  FolderBrowser: ({ clientName }: { clientName: string }) => (
    <div data-testid="folder-browser">{clientName}</div>
  ),
}));

vi.mock("../services/onboardingService", () => ({
  onboardingService: { getClients: vi.fn() },
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
    renderPage();
    expect(screen.getByText("No clients assigned")).toBeInTheDocument();
    expect(onboardingService.getClients).not.toHaveBeenCalled();
  });

  it("renders a distinct empty state when every assigned client is inactive", async () => {
    // client_ids has entries but the API returns none of them active —
    // without this state, the page rendered only the header with no body.
    useAuthMock.mockReturnValue({ user: { client_ids: [1] } });
    (onboardingService.getClients as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("No active clients")).toBeInTheDocument();
    });
  });

  it("renders the folder browser for the assigned client once loaded", async () => {
    useAuthMock.mockReturnValue({ user: { client_ids: [1] } });
    (onboardingService.getClients as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 1, name: "Acme", code: "ACME" },
    ]);
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("folder-browser")).toHaveTextContent("Acme");
    });
  });
});
