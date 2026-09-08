import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMutationHandlers,
  createApprovalHandlers,
  createRejectionHandlers,
  createCreateHandlers,
  createUpdateHandlers,
  createDeleteHandlers,
} from "./useMutationHandlers";

// Mock the dependencies
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
  },
}));

vi.mock("@/lib/error-handler", () => ({
  handleApiError: vi.fn(),
}));

import { toast } from "sonner";
import { handleApiError } from "@/lib/error-handler";

describe("useMutationHandlers", async () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  describe("createMutationHandlers", async () => {
    it("should call refresh function on success", async () => {
      const refreshFn = vi.fn();
      const handlers = createMutationHandlers(refreshFn, "Success");
      await handlers.onSuccess();
      expect(refreshFn).toHaveBeenCalled();
    });

    it("should show success toast on success", async () => {
      const refreshFn = vi.fn();
      const handlers = createMutationHandlers(refreshFn, "Custom Message");
      await handlers.onSuccess();
      expect(toast.success).toHaveBeenCalledWith("Custom Message");
    });

    it("should call onSuccess callback", async () => {
      const refreshFn = vi.fn();
      const onSuccess = vi.fn();
      const handlers = createMutationHandlers(refreshFn, "Success", { onSuccess });
      await handlers.onSuccess();
      expect(onSuccess).toHaveBeenCalled();
    });

    it("should handle error with handleApiError", async () => {
      const refreshFn = vi.fn();
      const error = new Error("Test error");
      const handlers = createMutationHandlers(refreshFn, "Success");
      handlers.onError(error);
      expect(handleApiError).toHaveBeenCalledWith(error);
    });

    it("should call onError callback", async () => {
      const refreshFn = vi.fn();
      const onError = vi.fn();
      const error = new Error("Test error");
      const handlers = createMutationHandlers(refreshFn, "Success", { onError });
      handlers.onError(error);
      expect(onError).toHaveBeenCalledWith(error);
    });

    it("should use default success message", async () => {
      const refreshFn = vi.fn();
      const handlers = createMutationHandlers(refreshFn);
      await handlers.onSuccess();
      expect(toast.success).toHaveBeenCalledWith("Operation successful");
    });
  });

  describe("createApprovalHandlers", async () => {
    it("should use 'Approved' as success message", async () => {
      const refreshFn = vi.fn();
      const handlers = createApprovalHandlers(refreshFn);
      await handlers.onSuccess();
      expect(toast.success).toHaveBeenCalledWith("Approved");
    });
  });

  describe("createRejectionHandlers", async () => {
    it("should use 'Rejected' as success message", async () => {
      const refreshFn = vi.fn();
      const handlers = createRejectionHandlers(refreshFn);
      await handlers.onSuccess();
      expect(toast.success).toHaveBeenCalledWith("Rejected");
    });
  });

  describe("createCreateHandlers", async () => {
    it("should use 'Request created' as default message", async () => {
      const refreshFn = vi.fn();
      const handlers = createCreateHandlers(refreshFn);
      await handlers.onSuccess();
      expect(toast.success).toHaveBeenCalledWith("Request created");
    });

    it("should use custom resource name", async () => {
      const refreshFn = vi.fn();
      const handlers = createCreateHandlers(refreshFn, "Leave");
      await handlers.onSuccess();
      expect(toast.success).toHaveBeenCalledWith("Leave created");
    });
  });

  describe("createUpdateHandlers", async () => {
    it("should use 'Request updated' as default message", async () => {
      const refreshFn = vi.fn();
      const handlers = createUpdateHandlers(refreshFn);
      await handlers.onSuccess();
      expect(toast.success).toHaveBeenCalledWith("Request updated");
    });

    it("should use custom resource name", async () => {
      const refreshFn = vi.fn();
      const handlers = createUpdateHandlers(refreshFn, "Overtime");
      await handlers.onSuccess();
      expect(toast.success).toHaveBeenCalledWith("Overtime updated");
    });
  });

  describe("createDeleteHandlers", async () => {
    it("should use 'Request deleted' as default message", async () => {
      const refreshFn = vi.fn();
      const handlers = createDeleteHandlers(refreshFn);
      await handlers.onSuccess();
      expect(toast.success).toHaveBeenCalledWith("Request deleted");
    });

    it("should use custom resource name", async () => {
      const refreshFn = vi.fn();
      const handlers = createDeleteHandlers(refreshFn, "Standby");
      await handlers.onSuccess();
      expect(toast.success).toHaveBeenCalledWith("Standby deleted");
    });
  });
});
