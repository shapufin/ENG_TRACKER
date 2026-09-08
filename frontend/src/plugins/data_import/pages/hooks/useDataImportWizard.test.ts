import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDataImportWizard } from "./useDataImportWizard";
import { dataImportService } from "../../services/dataImportService";
import type { AnalyzeResult, PreviewResult, CommitResult } from "../../types/dataImport";

vi.mock("../../services/dataImportService", () => ({
  dataImportService: {
    analyze: vi.fn(),
    preview: vi.fn(),
    commit: vi.fn(),
  },
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const makeAnalyzeResult = (overrides?: Partial<AnalyzeResult>): AnalyzeResult => ({
  target_key: "users",
  filename: "users.csv",
  detected_columns: ["Username", "Email"],
  detected_values: { Username: ["u1"], Email: ["u1@example.com"] },
  suggested_mapping: { username: "Username", email: "Email" },
  profiles: [],
  total_rows: 1,
  ...overrides,
});

const makePreviewResult = (overrides?: Partial<PreviewResult>): PreviewResult => ({
  summary: { total: 1, valid: 1, warning: 0, error: 0, skipped: 0 },
  rows: [
    {
      row_index: 1,
      status: "valid",
      errors: [],
      warnings: [],
      preview: { username: "u1", email: "u1@example.com" },
    },
  ],
  total_rows: 1,
  ...overrides,
});

const makeCommitResult = (overrides?: Partial<CommitResult>): CommitResult => ({
  summary: { total: 1, created: 1, updated: 0, skipped: 0, error: 0 },
  row_errors: [],
  credentials: [],
  ...overrides,
});

describe("useDataImportWizard", () => {
  it("starts at target step with empty mapping", () => {
    const { result } = renderHook(() => useDataImportWizard());
    expect(result.current.state.step).toBe("target");
    expect(result.current.state.targetKey).toBeNull();
    expect(result.current.state.fieldMapping).toEqual({});
  });

  it("transitions target -> upload and resets mapping", () => {
    const { result } = renderHook(() => useDataImportWizard());
    act(() => result.current.selectedTarget("users"));
    expect(result.current.state.step).toBe("upload");
    expect(result.current.state.targetKey).toBe("users");
  });

  it("analyzes file and moves to map step on success", async () => {
    vi.mocked(dataImportService.analyze).mockResolvedValue(makeAnalyzeResult());

    const { result } = renderHook(() => useDataImportWizard());
    const file = new File(["Username,Email\nu1,u1@example.com"], "users.csv", {
      type: "text/csv",
    });

    act(() => result.current.selectedTarget("users"));
    act(() => result.current.setFile(file));
    await act(async () => {
      await result.current.analyze();
    });

    expect(result.current.state.step).toBe("map");
    expect(result.current.state.detectedColumns).toEqual(["Username", "Email"]);
    expect(result.current.state.fieldMapping).toEqual({
      username: "Username",
      email: "Email",
    });
  });

  it("updates field mapping and default values", () => {
    const { result } = renderHook(() => useDataImportWizard());
    act(() => result.current.setFieldMapping("username", "Username"));
    act(() => result.current.setDefaultValue("is_hr", true));

    expect(result.current.state.fieldMapping.username).toBe("Username");
    expect(result.current.state.defaultValues.is_hr).toBe(true);
  });

  it("stores detected values after analyze", async () => {
    vi.mocked(dataImportService.analyze).mockResolvedValue(makeAnalyzeResult());

    const { result } = renderHook(() => useDataImportWizard());
    act(() => result.current.selectedTarget("users"));
    act(() => result.current.setFile(new File([""], "users.csv")));
    await act(async () => {
      await result.current.analyze();
    });

    expect(result.current.state.detectedValues).toEqual({
      Username: ["u1"],
      Email: ["u1@example.com"],
    });
  });

  it("updates value transforms", () => {
    const { result } = renderHook(() => useDataImportWizard());
    act(() => result.current.setValueTransform("leave_type", "PTO", "vacation"));

    expect(result.current.state.options.value_transforms).toEqual({
      leave_type: { PTO: "vacation" },
    });

    act(() => result.current.setValueTransform("leave_type", "PTO", null));
    expect(result.current.state.options.value_transforms?.leave_type).toEqual({});
  });

  it("previews import and moves to preview step on success", async () => {
    vi.mocked(dataImportService.preview).mockResolvedValue(makePreviewResult());

    const { result } = renderHook(() => useDataImportWizard());
    act(() => result.current.selectedTarget("users"));
    act(() => result.current.setFile(new File([""], "users.csv")));
    act(() => result.current.setFieldMapping("username", "Username"));
    await act(async () => {
      await result.current.preview();
    });

    expect(result.current.state.step).toBe("preview");
    expect(result.current.state.previewResult?.summary.valid).toBe(1);
  });

  it("commits import and moves to result step", async () => {
    vi.mocked(dataImportService.commit).mockResolvedValue(makeCommitResult());

    const { result } = renderHook(() => useDataImportWizard());
    act(() => result.current.selectedTarget("users"));
    act(() => result.current.setFile(new File([""], "users.csv")));
    act(() => result.current.setFieldMapping("username", "Username"));
    await act(async () => {
      await result.current.commit();
    });

    expect(result.current.state.step).toBe("result");
    expect(result.current.state.commitResult?.summary.created).toBe(1);
  });

  it("resets to initial state", () => {
    const { result } = renderHook(() => useDataImportWizard());
    act(() => result.current.selectedTarget("users"));
    act(() => result.current.reset());
    expect(result.current.state.step).toBe("target");
    expect(result.current.state.targetKey).toBeNull();
  });
});
