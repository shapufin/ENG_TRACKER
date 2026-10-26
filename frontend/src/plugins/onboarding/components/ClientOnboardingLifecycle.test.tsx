import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ClientOnboardingLifecycle from "./ClientOnboardingLifecycle";
import { onboardingService } from "../services/onboardingService";
import * as download from "@/lib/download";

vi.mock("../services/onboardingService", () => ({
  onboardingService: {
    getClientLifecycle: vi.fn(),
    createClientExport: vi.fn(),
    getExport: vi.fn(),
    getExportDownloadUrl: vi.fn(),
    purgeClientOnboarding: vi.fn(),
  },
}));
vi.mock("@/lib/download", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/download")>()),
  navigateToDownload: vi.fn(),
}));

const client = { id: 3, name: "Old", code: "OLD", description: "", is_active: false, created_at: "" };

const info = (overrides = {}) => ({
  can_purge: true,
  blockers: [],
  folders: 2,
  documents: 5,
  latest_export: null,
  ...overrides,
});

const renderIt = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ClientOnboardingLifecycle client={client} />
    </QueryClientProvider>
  );
};

describe("ClientOnboardingLifecycle", () => {
  beforeEach(() => vi.clearAllMocks());

  it("says when there is nothing to export or purge", async () => {
    vi.mocked(onboardingService.getClientLifecycle).mockResolvedValue(
      info({ folders: 0, documents: 0, can_purge: false, blockers: ["There is no onboarding data to purge."] })
    );
    renderIt();
    expect(await screen.findByText("No onboarding data")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download ZIP" })).not.toBeInTheDocument();
  });

  it("downloads the ZIP: request, wait until ready, then follow the single-use link", async () => {
    vi.mocked(onboardingService.getClientLifecycle).mockResolvedValue(info());
    vi.mocked(onboardingService.createClientExport).mockResolvedValue({ id: 9, status: "pending" } as any);
    vi.mocked(onboardingService.getExport).mockResolvedValue({ id: 9, status: "ready" } as any);
    vi.mocked(onboardingService.getExportDownloadUrl).mockResolvedValue("/api/x/download/?token=t");
    renderIt();
    fireEvent.click(await screen.findByRole("button", { name: "Download ZIP" }));
    await waitFor(() => expect(onboardingService.createClientExport).toHaveBeenCalledWith(3));
    await waitFor(() =>
      expect(download.navigateToDownload).toHaveBeenCalledWith("/api/x/download/?token=t")
    );
    expect(download.navigateToDownload).toHaveBeenCalledTimes(1);
  });

  it("reports a failed export instead of waiting forever", async () => {
    vi.mocked(onboardingService.getClientLifecycle).mockResolvedValue(info());
    vi.mocked(onboardingService.createClientExport).mockResolvedValue({ id: 9, status: "pending" } as any);
    vi.mocked(onboardingService.getExport).mockResolvedValue({
      id: 9,
      status: "failed",
      error: "disk full",
    } as any);
    renderIt();
    fireEvent.click(await screen.findByRole("button", { name: "Download ZIP" }));
    expect(await screen.findByText(/disk full/)).toBeInTheDocument();
    expect(download.navigateToDownload).not.toHaveBeenCalled();
  });

  it("explains why the purge is blocked and keeps it disabled", async () => {
    vi.mocked(onboardingService.getClientLifecycle).mockResolvedValue(
      info({ can_purge: false, blockers: ["No fresh export: download the ZIP first."] })
    );
    renderIt();
    expect(await screen.findByText(/No fresh export/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Purge onboarding data" })).toBeDisabled();
  });

  it("purges only after the client code is typed", async () => {
    vi.mocked(onboardingService.getClientLifecycle).mockResolvedValue(info());
    vi.mocked(onboardingService.purgeClientOnboarding).mockResolvedValue({ folders: 2, documents: 5 });
    renderIt();
    const button = await screen.findByRole("button", { name: "Purge onboarding data" });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Type OLD to purge/), { target: { value: "OLD" } });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await waitFor(() => expect(onboardingService.purgeClientOnboarding).toHaveBeenCalledWith(3, "OLD"));
  });
});
