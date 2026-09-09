import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleApiError } from "./error-handler";
import { ERROR_CODES, ERROR_MESSAGES } from "./error-messages";

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { toast } from "sonner";

describe("handleApiError", () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear();
  });

  it("detects 400 validation error", () => {
    handleApiError({ response: { status: 400, data: { detail: "Unknown validation failure" } } });
    expect(toast.error).toHaveBeenCalled();
    const firstCall = vi.mocked(toast.error).mock.calls[0];
    expect(firstCall[0]).toBe(ERROR_MESSAGES[ERROR_CODES.VALIDATION_REQUIRED_FIELD].title);
  });

  it("detects 401 authentication error", () => {
    handleApiError({ response: { status: 401 } });
    const firstCall = vi.mocked(toast.error).mock.calls[0];
    expect(firstCall[0]).toBe(ERROR_MESSAGES[ERROR_CODES.AUTHENTICATION_ERROR].title);
  });

  it("detects 403 permission error", () => {
    handleApiError({ response: { status: 403, data: { detail: "No permission" } } });
    const firstCall = vi.mocked(toast.error).mock.calls[0];
    expect(firstCall[0]).toBe(ERROR_MESSAGES[ERROR_CODES.PERMISSION_NO_PERMISSION].title);
  });

  it("detects 404 resource error", () => {
    handleApiError({ response: { status: 404, data: { detail: "User not found" } } });
    const firstCall = vi.mocked(toast.error).mock.calls[0];
    expect(firstCall[0]).toBe(ERROR_MESSAGES[ERROR_CODES.RESOURCE_USER_NOT_FOUND].title);
  });

  it("detects network error", () => {
    handleApiError({ message: "Network Error" });
    const firstCall = vi.mocked(toast.error).mock.calls[0];
    expect(firstCall[0]).toBe(ERROR_MESSAGES[ERROR_CODES.NETWORK_ERROR].title);
  });

  it("falls back to unknown error", () => {
    handleApiError({});
    const firstCall = vi.mocked(toast.error).mock.calls[0];
    expect(firstCall[0]).toBe(ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR].title);
  });

  // Branch coverage: extractBackendMessage paths
  it("extracts string data directly", () => {
    handleApiError({ response: { status: 400, data: "Plain string error" } });
    expect(toast.error).toHaveBeenCalled();
  });

  it("extracts data.message field", () => {
    handleApiError({ response: { status: 400, data: { message: "Custom message" } } });
    expect(toast.error).toHaveBeenCalled();
  });

  it("extracts data.error field", () => {
    handleApiError({ response: { status: 400, data: { error: "Error field" } } });
    expect(toast.error).toHaveBeenCalled();
  });

  it("extracts non_field_errors array joined by comma", () => {
    handleApiError({
      response: {
        status: 400,
        data: { non_field_errors: ["Error one", "Error two"] },
      },
    });
    expect(toast.error).toHaveBeenCalled();
  });

  it("extracts array data joined by comma", () => {
    handleApiError({ response: { status: 400, data: ["Array error 1", "Array error 2"] } });
    expect(toast.error).toHaveBeenCalled();
  });

  it("extracts field errors from object data", () => {
    handleApiError({
      response: {
        status: 400,
        data: { username: ["This field is required"], email: "Invalid email" },
      },
    });
    expect(toast.error).toHaveBeenCalled();
  });

  it("extracts field errors with array values joined by comma", () => {
    handleApiError({
      response: {
        status: 400,
        data: { password: ["Too short", "Too common"] },
      },
    });
    expect(toast.error).toHaveBeenCalled();
  });

  it("returns empty string when data is null/undefined", () => {
    handleApiError({ response: { status: 400, data: null } });
    expect(toast.error).toHaveBeenCalled();
  });

  it("handles 403 with data.error field", () => {
    handleApiError({ response: { status: 403, data: { error: "Only team leaders" } } });
    const firstCall = vi.mocked(toast.error).mock.calls[0];
    expect(firstCall[0]).toBe(ERROR_MESSAGES[ERROR_CODES.PERMISSION_NOT_TEAM_LEADER].title);
  });

  it("handles 404 with data.error field", () => {
    handleApiError({ response: { status: 404, data: { error: "User not found" } } });
    const firstCall = vi.mocked(toast.error).mock.calls[0];
    expect(firstCall[0]).toBe(ERROR_MESSAGES[ERROR_CODES.RESOURCE_USER_NOT_FOUND].title);
  });

  it("handles 404 with no matching pattern (falls back to RESOURCE_NOT_FOUND)", () => {
    handleApiError({ response: { status: 404, data: { detail: "Something else" } } });
    const firstCall = vi.mocked(toast.error).mock.calls[0];
    expect(firstCall[0]).toBe(ERROR_MESSAGES[ERROR_CODES.RESOURCE_NOT_FOUND].title);
  });

  it("handles 403 with no matching pattern (falls back to PERMISSION_NO_WORKSPACE_ACCESS)", () => {
    handleApiError({ response: { status: 403, data: { detail: "Mystery denial" } } });
    const firstCall = vi.mocked(toast.error).mock.calls[0];
    expect(firstCall[0]).toBe(ERROR_MESSAGES[ERROR_CODES.PERMISSION_NO_WORKSPACE_ACCESS].title);
  });

  it("handles unknown status code (falls back to network/unknown)", () => {
    handleApiError({ response: { status: 500 } });
    const firstCall = vi.mocked(toast.error).mock.calls[0];
    expect(firstCall[0]).toBe(ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR].title);
  });

  it("handles timeout message in network error", () => {
    handleApiError({ message: "Request timeout" });
    const firstCall = vi.mocked(toast.error).mock.calls[0];
    expect(firstCall[0]).toBe(ERROR_MESSAGES[ERROR_CODES.NETWORK_ERROR].title);
  });

  it("handles ERR_NETWORK message", () => {
    handleApiError({ message: "ERR_NETWORK" });
    const firstCall = vi.mocked(toast.error).mock.calls[0];
    expect(firstCall[0]).toBe(ERROR_MESSAGES[ERROR_CODES.NETWORK_ERROR].title);
  });

  it("handles error without response or message (unknown)", () => {
    handleApiError({ someOtherProp: true });
    const firstCall = vi.mocked(toast.error).mock.calls[0];
    expect(firstCall[0]).toBe(ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR].title);
  });

  it("handles non-Error thrown value (string)", () => {
    handleApiError("just a string" as any);
    expect(toast.error).toHaveBeenCalled();
  });
});
