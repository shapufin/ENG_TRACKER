import { describe, it, expect, vi, beforeEach } from "vitest";
import { toast } from "sonner";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { TicketUploadPage } from "./TicketUploadPage";
import { ticketKPIService } from "@/plugins/ticket_kpi/services/ticketKPIService";
import { overtimeService } from "@/services/overtimeService";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { userService } from "@/services/userService";
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

vi.mock("@/services/userService", () => ({
  userService: { getUser: vi.fn(), getMyTeamMembers: vi.fn() },
}));

vi.mock("@/services/overtimeService", () => ({
  overtimeService: { getActiveClients: vi.fn() },
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

const auth = vi.hoisted(() => ({
  user: { id: 1, client_ids: [3] as number[], is_staff: false, is_superuser: false },
}));
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: auth.user }),
}));

const wrapperAt =
  (entry: string) =>
  ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[entry]}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
const wrapper = wrapperAt("/ticket-kpi/upload");

describe("TicketUploadPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    auth.user = { id: 1, client_ids: [3], is_staff: false, is_superuser: false };
  });

  it("shows an empty state instead of the form when the user has no client", async () => {
    auth.user = { id: 1, client_ids: [], is_staff: false, is_superuser: false };
    vi.mocked(ticketKPIService.getProfiles).mockResolvedValue([] as any);
    vi.mocked(overtimeService.getActiveClients).mockResolvedValue([{ id: 3, name: "C" }] as any);

    render(<TicketUploadPage />, { wrapper });

    expect(screen.getByText("No client assigned yet")).toBeTruthy();
    expect(screen.queryByText("Set File")).toBeNull();
  });

  describe("importing for a member (?for=)", () => {
    const forMember = wrapperAt("/ticket-kpi/upload?for=9");
    const setup = (memberClients: number[]) => {
      vi.mocked(ticketKPIService.getProfiles).mockResolvedValue([{ id: 7, name: "P" }] as any);
      vi.mocked(overtimeService.getActiveClients).mockResolvedValue([
        { id: 3, name: "C3" },
        { id: 4, name: "C4" },
      ] as any);
      vi.mocked(userService.getUser).mockResolvedValue({
        id: 9,
        username: "ana",
        first_name: "Ana",
        last_name: "Ndreu",
      } as any);
      vi.mocked(userService.getMyTeamMembers).mockResolvedValue([
        {
          user: { id: 9, username: "ana", first_name: "Ana", last_name: "Ndreu" },
          clients: memberClients,
        },
      ] as any);
      auth.user = { id: 1, client_ids: [3, 4], is_staff: false, is_superuser: false };
    };

    it("names the member and sends target_user_id with the preview", async () => {
      setup([3]);
      vi.mocked(ticketKPIService.analyzeFile).mockResolvedValue({
        data: {
          detected_columns: [],
          total_rows: 2,
          suggested_month: "2026-03-01",
          suggested_profile: { id: 7 },
        },
      } as any);
      vi.mocked(ticketKPIService.previewUpload).mockResolvedValue({ data: { errors: [] } } as any);

      render(<TicketUploadPage />, { wrapper: forMember });
      expect(
        await screen.findByText(/Importing the monthly ticket export for Ana Ndreu/)
      ).toBeTruthy();
      fireEvent.click(screen.getByText("Set File"));
      await act(async () => {
        fireEvent.click(screen.getByText("Analyze"));
      });
      expect(ticketKPIService.previewUpload).toHaveBeenCalledWith(
        expect.anything(),
        7,
        "2026-03-01",
        undefined,
        undefined,
        9
      );
    });

    it("shows the member's no-client state, not the leader's clients", async () => {
      setup([]);
      render(<TicketUploadPage />, { wrapper: forMember });
      expect(await screen.findByText(/This member has no client assigned/)).toBeTruthy();
      expect(screen.queryByText("Set File")).toBeNull();
    });

    it("does not read or write the remembered selection for a member import", async () => {
      setup([3]);
      saveLastUploadSelection(1, { profileId: 7, clientIds: [3] });
      render(<TicketUploadPage />, { wrapper: forMember });
      await screen.findByText(/Importing the monthly ticket export for/);
      expect(screen.getByTestId("selected-profile-id").textContent).toBe("null");
    });
  });

  it("lets an admin without assigned clients import", async () => {
    auth.user = { id: 1, client_ids: [], is_staff: true, is_superuser: false };
    vi.mocked(ticketKPIService.getProfiles).mockResolvedValue([] as any);
    vi.mocked(overtimeService.getActiveClients).mockResolvedValue([{ id: 3, name: "C" }] as any);

    render(<TicketUploadPage />, { wrapper });

    expect(screen.queryByText("No client assigned yet")).toBeNull();
    expect(screen.getByText("Set File")).toBeTruthy();
  });

  it("pre-fills the profile and clients from the last upload", async () => {
    vi.mocked(ticketKPIService.getMyBatches).mockResolvedValue([] as any);
    vi.mocked(ticketKPIService.getProfiles).mockResolvedValue([{ id: 7, name: "P" }] as any);
    vi.mocked(overtimeService.getActiveClients).mockResolvedValue([{ id: 3, name: "C" }] as any);
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
    vi.mocked(overtimeService.getActiveClients).mockResolvedValue([] as any);
    saveLastUploadSelection(1, { profileId: 7, clientIds: [] });

    render(<TicketUploadPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getByTestId("selected-profile-id").textContent).toBe("null");
    });
  });

  it("saves the profile and clients after a successful import", async () => {
    vi.mocked(ticketKPIService.getMyBatches).mockResolvedValue([] as any);
    vi.mocked(ticketKPIService.getProfiles).mockResolvedValue([{ id: 7, name: "P" }] as any);
    vi.mocked(overtimeService.getActiveClients).mockResolvedValue([{ id: 3, name: "C" }] as any);
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
    vi.mocked(overtimeService.getActiveClients).mockResolvedValue([] as any);
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
    vi.mocked(overtimeService.getActiveClients).mockResolvedValue([] as any);
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
      "2026-03-01",
      undefined,
      undefined,
      undefined
    );
  });

  it("errors instead of previewing when neither the user nor the file supplied a month", async () => {
    vi.mocked(ticketKPIService.getMyBatches).mockResolvedValue([] as any);
    vi.mocked(ticketKPIService.getProfiles).mockResolvedValue([] as any);
    vi.mocked(overtimeService.getActiveClients).mockResolvedValue([] as any);
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
    vi.mocked(overtimeService.getActiveClients).mockResolvedValue([] as any);
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
    vi.mocked(overtimeService.getActiveClients).mockResolvedValue([] as any);
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
      { status: "State" },
      {},
      undefined
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
      false,
      {},
      undefined
    );
  });

  it("handles analyze error", async () => {
    vi.mocked(ticketKPIService.getMyBatches).mockResolvedValue([] as any);
    vi.mocked(ticketKPIService.getProfiles).mockResolvedValue([] as any);
    vi.mocked(overtimeService.getActiveClients).mockResolvedValue([] as any);
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
