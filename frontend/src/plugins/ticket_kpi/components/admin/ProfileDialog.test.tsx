import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProfileDialog } from "./ProfileDialog";
import { useProfileDialogState } from "./useProfileDialogState";
import { ticketKPIService } from "@/plugins/ticket_kpi/services/ticketKPIService";

vi.mock("./useProfileDialogState", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./useProfileDialogState")>();
  return {
    ...actual,
    useProfileDialogState: vi.fn(),
  };
});
vi.mock("./ProfileClientAssignment", () => ({
  ProfileClientAssignment: () => <div data-testid="client-assignment" />,
}));
vi.mock("./ProfileAutoDetectSection", () => ({
  ProfileAutoDetectSection: ({ onAutoDetect }: { onAutoDetect: () => void }) => (
    <button onClick={onAutoDetect}>Auto Detect</button>
  ),
}));
vi.mock("../FieldMappingGrid", () => ({
  FieldMappingGrid: () => <div data-testid="field-mapping" />,
}));
vi.mock("./ProfileTransformsSection", () => ({
  ProfileTransformsSection: () => <div data-testid="transforms" />,
}));
vi.mock("@/plugins/ticket_kpi/services/ticketKPIService", () => ({
  ticketKPIService: { autoDetect: vi.fn() },
}));

const baseState = {
  formName: "Test Profile",
  setFormName: vi.fn(),
  formDesc: "",
  setFormDesc: vi.fn(),
  formActive: true,
  setFormActive: vi.fn(),
  formGlobal: false,
  setFormGlobal: vi.fn(),
  fieldMapping: {},
  setFieldMapping: vi.fn(),
  statusTransforms: {},
  setStatusTransforms: vi.fn(),
  priorityTransforms: {},
  setPriorityTransforms: vi.fn(),
  computeRes: false,
  setComputeRes: vi.fn(),
  computeSla: false,
  setComputeSla: vi.fn(),
  assignedClientIds: [],
  setAssignedClientIds: vi.fn(),
  sampleFile: null,
  setSampleFile: vi.fn(),
  isAutoDetecting: false,
  setIsAutoDetecting: vi.fn(),
  buildPayload: () => ({ name: "Test" }),
};

describe("ProfileDialog", () => {
  it("renders create profile dialog", () => {
    vi.mocked(useProfileDialogState).mockReturnValue(baseState as any);
    render(
      <ProfileDialog
        open={true}
        onOpenChange={vi.fn()}
        profile={null}
        clients={[]}
        onSave={vi.fn()}
        isPending={false}
      />
    );
    expect(screen.getByText("Create Profile")).toBeInTheDocument();
  });

  it("calls onSave when create clicked", () => {
    const onSave = vi.fn();
    vi.mocked(useProfileDialogState).mockReturnValue(baseState as any);
    render(
      <ProfileDialog
        open={true}
        onOpenChange={vi.fn()}
        profile={null}
        clients={[]}
        onSave={onSave}
        isPending={false}
      />
    );
    fireEvent.click(screen.getByText("Create"));
    expect(onSave).toHaveBeenCalled();
  });

  it("auto-detects fields successfully", async () => {
    vi.mocked(ticketKPIService.autoDetect).mockResolvedValue({
      data: { suggested_mapping: { a: 1 }, total_rows: 10 },
    } as any);
    const setFieldMapping = vi.fn();
    const setIsAutoDetecting = vi.fn();
    vi.mocked(useProfileDialogState).mockReturnValue({
      ...baseState,
      sampleFile: new File([], "x.csv"),
      setFieldMapping,
      setIsAutoDetecting,
    } as any);
    render(
      <ProfileDialog
        open={true}
        onOpenChange={vi.fn()}
        profile={null}
        clients={[]}
        onSave={vi.fn()}
        isPending={false}
      />
    );
    fireEvent.click(screen.getByText("Auto Detect"));
    await expect(vi.mocked(ticketKPIService.autoDetect)).toHaveBeenCalled();
  });

  it("handles auto-detect error", async () => {
    vi.mocked(ticketKPIService.autoDetect).mockRejectedValue(new Error("fail"));
    const setIsAutoDetecting = vi.fn();
    vi.mocked(useProfileDialogState).mockReturnValue({
      ...baseState,
      sampleFile: new File([], "x.csv"),
      setIsAutoDetecting,
    } as any);
    render(
      <ProfileDialog
        open={true}
        onOpenChange={vi.fn()}
        profile={null}
        clients={[]}
        onSave={vi.fn()}
        isPending={false}
      />
    );
    fireEvent.click(screen.getByText("Auto Detect"));
    await expect(vi.mocked(ticketKPIService.autoDetect)).toHaveBeenCalled();
  });

  it("warns when no fields detected", async () => {
    vi.mocked(ticketKPIService.autoDetect).mockResolvedValue({
      data: { suggested_mapping: {}, total_rows: 0 },
    } as any);
    const setIsAutoDetecting = vi.fn();
    vi.mocked(useProfileDialogState).mockReturnValue({
      ...baseState,
      sampleFile: new File([], "x.csv"),
      setIsAutoDetecting,
    } as any);
    render(
      <ProfileDialog
        open={true}
        onOpenChange={vi.fn()}
        profile={null}
        clients={[]}
        onSave={vi.fn()}
        isPending={false}
      />
    );
    fireEvent.click(screen.getByText("Auto Detect"));
    await expect(vi.mocked(ticketKPIService.autoDetect)).toHaveBeenCalled();
  });
});
