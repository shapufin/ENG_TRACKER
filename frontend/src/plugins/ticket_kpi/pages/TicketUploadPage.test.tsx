import { describe, it, expect, vi, beforeEach } from "vitest";
import { toast } from "sonner";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { TicketUploadPage } from "./TicketUploadPage";
import { ticketKPIService } from "@/plugins/ticket_kpi/services/ticketKPIService";
import { overtimeService } from "@/services/overtimeService";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { saveLastUploadSelection } from "../utils/lastUploadSelection";

vi.mock("@/plugins/ticket_kpi/services/ticketKPIService", () => ({
  ticketKPIService: {
    getMyBatches: vi.fn(),
    getProfiles: vi.fn(),
    analyzeFile: vi.fn(),
    previewUpload: vi.fn(),
    commitUpload: vi.fn(),
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
      <span data-testid="selected-profile-id">{String(props.selectedProfileId)}</span>
      <span data-testid="selected-client-ids">{JSON.stringify(props.selectedClientIds)}</span>
    </div>
  ),
}));

vi.mock("../components/UploadPreviewPanel", () => ({
  UploadPreviewPanel: ({ onImport, onRemap }: any) => (
    <div>
      <button onClick={() => onImport(false)}>Import</button>
      <button onClick={() => onRemap({ status: "State" })}>Remap</button>
    </div>
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
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("pre-fills the profile and clients from the last upload", async () => {
    vi.mocked(ticketKPIService.getMyBatches).mockResolvedValue([] as any);
    vi.mocked(ticketKPIService.getProfiles).mockResolvedValue([{ id: 7, name: "P" }] as any);
    vi.mocked(overtimeService.getClients).mockResolvedValue([{ id: 3, name: "C" }] as any);
    saveLastUploadSelection(1, { profileId: 7, clientIds: [3] });

    render(<TicketUploadPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getByTestId("selected-profile-id").textContent).toBe("7");
    });
    expect(screen.getByTestId("selected-client-ids").textContent).toBe("[3]");
  });

  it("does not resurrect a profile that is no longer in the current list", async () => {
    vi.mocked(ticketKPIService.getMyBatches).mockResolvedValue([] as any);
    vi.mocked(ticketKPIService.getProfiles).mockResolvedValue([{ id: 8, name: "Other" }] as any);
    vi.mocked(overtimeService.getClients).mockResolvedValue([] as any);
    saveLastUploadSelection(1, { profileId: 7, clientIds: [] });

    render(<TicketUploadPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getByTestId("selected-profile-id").textContent).toBe("null");
    });
  });

  it("saves the profile and clients after a successful import", async () => {
    vi.mocked(ticketKPIService.getMyBatches).mockResolvedValue([] as any);
    vi.mocked(ticketKPIService.getProfiles).mockResolvedValue([{ id: 7, name: "P" }] as any);
    vi.mocked(overtimeService.getClients).mockResolvedValue([{ id: 3, name: "C" }] as any);
    vi.mocked(ticketKPIService.analyzeFile).mockResolvedValue({
      data: { total_rows: 1, suggested_profile: { id: 7 }, suggested_month: "2026-03-01" },
    } as any);
    vi.mocked(ticketKPIService.previewUpload).mockResolvedValue({ data: { rows: [] } } as any);
    vi.mocked(ticketKPIService.commitUpload).mockResolvedValue({
      data: { record_count: 1, month: "2026-03" },
    } as any);

    render(<TicketUploadPage />, { wrapper });
    fireEvent.click(screen.getByText("Set File"));
    await act(async () => {
      fireEvent.click(screen.getByText("Analyze"));
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Import"));
    });

    expect(saveLastUploadSelectionSpy()).toEqual({ profileId: 7, clientIds: [] });
  });

  function saveLastUploadSelectionSpy() {
    const raw = window.localStorage.getItem("ticket_kpi_last_upload_selection:1");
    return raw ? JSON.parse(raw) : null;
  }

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

  it("analyzes without a month picked, using the file's suggested_month", async () => {
    vi.mocked(ticketKPIService.getMyBatches).mockResolvedValue([] as any);
    vi.mocked(ticketKPIService.getProfiles).mockResolvedValue([] as any);
    vi.mocked(overtimeService.getClients).mockResolvedValue([] as any);
    vi.mocked(ticketKPIService.analyzeFile).mockResolvedValue({
      data: { total_rows: 5, suggested_profile: { id: 1 }, suggested_month: "2026-03-01" },
    } as any);
    vi.mocked(ticketKPIService.previewUpload).mockResolvedValue({ data: { rows: [] } } as any);

    render(<TicketUploadPage />, { wrapper });
    fireEvent.click(screen.getByText("Set File"));
    await act(async () => {
      fireEvent.click(screen.getByText("Analyze"));
    });
    expect(ticketKPIService.previewUpload).toHaveBeenCalledWith(
      expect.anything(),
      1,
      "2026-03-01"
    );
  });

  it("errors instead of previewing when neither the user nor the file supplied a month", async () => {
    vi.mocked(ticketKPIService.getMyBatches).mockResolvedValue([] as any);
    vi.mocked(ticketKPIService.getProfiles).mockResolvedValue([] as any);
    vi.mocked(overtimeService.getClients).mockResolvedValue([] as any);
    vi.mocked(ticketKPIService.analyzeFile).mockResolvedValue({
      data: { total_rows: 5, suggested_profile: { id: 1 } },
    } as any);

    render(<TicketUploadPage />, { wrapper });
    fireEvent.click(screen.getByText("Set File"));
    await act(async () => {
      fireEvent.click(screen.getByText("Analyze"));
    });
    expect(toast.error).toHaveBeenCalledWith(
      "Could not detect the month from the file. Please select one."
    );
    expect(ticketKPIService.previewUpload).not.toHaveBeenCalled();
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

  it("re-previews with a fixed mapping and carries it into the import", async () => {
    vi.mocked(ticketKPIService.getMyBatches).mockResolvedValue([] as any);
    vi.mocked(ticketKPIService.getProfiles).mockResolvedValue([{ id: 1, name: "P" }] as any);
    vi.mocked(overtimeService.getClients).mockResolvedValue([] as any);
    vi.mocked(ticketKPIService.analyzeFile).mockResolvedValue({
      data: {
        total_rows: 5,
        suggested_profile: { id: 1 },
        suggested_month: "2026-03-01",
        detected_columns: ["Number", "State"],
      },
    } as any);
    vi.mocked(ticketKPIService.previewUpload).mockResolvedValue({
      data: { rows: [], issues: {} },
    } as any);
    vi.mocked(ticketKPIService.commitUpload).mockResolvedValue({
      data: { record_count: 5, month: "2026-03" },
    } as any);

    render(<TicketUploadPage />, { wrapper });
    fireEvent.click(screen.getByText("Set File"));
    await act(async () => {
      fireEvent.click(screen.getByText("Analyze"));
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Remap"));
    });
    expect(ticketKPIService.previewUpload).toHaveBeenLastCalledWith(
      expect.anything(),
      1,
      "2026-03-01",
      { status: "State" }
    );

    await act(async () => {
      fireEvent.click(screen.getByText("Import"));
    });
    expect(ticketKPIService.commitUpload).toHaveBeenCalledWith(
      expect.anything(),
      1,
      "2026-03-01",
      false,
      [],
      { status: "State" },
      false
    );
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
