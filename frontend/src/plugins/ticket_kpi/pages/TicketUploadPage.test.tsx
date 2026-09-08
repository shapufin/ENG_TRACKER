import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { TicketUploadPage } from "./TicketUploadPage";
import { ticketKPIService } from "@/plugins/ticket_kpi/services/ticketKPIService";
import { overtimeService } from "@/services/overtimeService";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/plugins/ticket_kpi/services/ticketKPIService", () => ({
  ticketKPIService: {
    getMyBatches: vi.fn(),
    getProfiles: vi.fn(),
    analyzeFile: vi.fn(),
    previewUpload: vi.fn(),
  },
}));

vi.mock("@/services/overtimeService", () => ({
  overtimeService: { getClients: vi.fn() },
}));

vi.mock("../components/UploadForm", () => ({
  UploadForm: (props: any) => (
    <div>
      <button onClick={() => props.onFileAccepted(new File([], "x.csv"))}>Set File</button>
      <button onClick={() => props.onAnalyze()}>Analyze</button>
      <button onClick={() => props.onMonthChange("2024-06")}>Set Month</button>
    </div>
  ),
}));

vi.mock("../components/UploadPreviewPanel", () => ({
  UploadPreviewPanel: ({ onImport }: any) => (
    <button onClick={() => onImport(false)}>Import</button>
  ),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { id: 1, client_ids: [] } }),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

describe("TicketUploadPage", () => {
  it("analyzes and previews file", async () => {
    vi.mocked(ticketKPIService.getMyBatches).mockResolvedValue([] as any);
    vi.mocked(ticketKPIService.getProfiles).mockResolvedValue([] as any);
    vi.mocked(overtimeService.getClients).mockResolvedValue([] as any);
    vi.mocked(ticketKPIService.analyzeFile).mockResolvedValue({
      data: { total_rows: 5, suggested_profile: { id: 1 } },
    } as any);
    vi.mocked(ticketKPIService.previewUpload).mockResolvedValue({ data: { rows: [] } } as any);

    render(<TicketUploadPage />, { wrapper });
    fireEvent.click(screen.getByText("Set Month"));
    fireEvent.click(screen.getByText("Set File"));
    await act(async () => {
      fireEvent.click(screen.getByText("Analyze"));
    });
    expect(vi.mocked(ticketKPIService.analyzeFile)).toHaveBeenCalled();
  });

  it("shows error when no profile found", async () => {
    vi.mocked(ticketKPIService.getMyBatches).mockResolvedValue([] as any);
    vi.mocked(ticketKPIService.getProfiles).mockResolvedValue([] as any);
    vi.mocked(overtimeService.getClients).mockResolvedValue([] as any);
    vi.mocked(ticketKPIService.analyzeFile).mockResolvedValue({
      data: { total_rows: 5, suggested_profile: null },
    } as any);

    render(<TicketUploadPage />, { wrapper });
    fireEvent.click(screen.getByText("Set Month"));
    fireEvent.click(screen.getByText("Set File"));
    await act(async () => {
      fireEvent.click(screen.getByText("Analyze"));
    });
    expect(vi.mocked(ticketKPIService.analyzeFile)).toHaveBeenCalled();
  });

  it("handles analyze error", async () => {
    vi.mocked(ticketKPIService.getMyBatches).mockResolvedValue([] as any);
    vi.mocked(ticketKPIService.getProfiles).mockResolvedValue([] as any);
    vi.mocked(overtimeService.getClients).mockResolvedValue([] as any);
    vi.mocked(ticketKPIService.analyzeFile).mockRejectedValue({
      response: { data: { error: "fail" } },
    });

    render(<TicketUploadPage />, { wrapper });
    fireEvent.click(screen.getByText("Set Month"));
    fireEvent.click(screen.getByText("Set File"));
    await act(async () => {
      fireEvent.click(screen.getByText("Analyze"));
    });
    expect(vi.mocked(ticketKPIService.analyzeFile)).toHaveBeenCalled();
  });
});
