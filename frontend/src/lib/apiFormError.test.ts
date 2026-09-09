import { describe, it, expect } from "vitest";
import { extractApiErrorMessage } from "./apiFormError";

describe("extractApiErrorMessage", () => {
  it("returns the fallback when there is no response data", () => {
    expect(extractApiErrorMessage(new Error("boom"), "fallback")).toBe("boom");
    expect(extractApiErrorMessage({}, "fallback")).toBe("fallback");
    expect(extractApiErrorMessage(null, "fallback")).toBe("fallback");
  });

  it("reads data.error (legacy shape) first", () => {
    const err = { response: { data: { error: "legacy failure" } } };
    expect(extractApiErrorMessage(err, "fallback")).toBe("legacy failure");
  });

  it("reads data.detail for permission/throttling errors", () => {
    const err = { response: { data: { detail: "You do not have permission." } } };
    expect(extractApiErrorMessage(err, "fallback")).toBe("You do not have permission.");
  });

  it("reads data.non_field_errors array", () => {
    const err = { response: { data: { non_field_errors: ["already a member"] } } };
    expect(extractApiErrorMessage(err, "fallback")).toBe("already a member");
  });

  it("surfaces DRF field-level unique-constraint errors as 'field: message'", () => {
    // This is the regression case: Group.code unique violation returns
    // {"code": ["group with this code already exists."]} with no `detail`.
    const err = {
      response: {
        data: { code: ["group with this code already exists."] },
      },
    };
    expect(extractApiErrorMessage(err, "Could not create the group.")).toBe(
      "code: group with this code already exists."
    );
  });

  it("joins multiple field errors", () => {
    const err = {
      response: {
        data: {
          name: ["group with this name already exists."],
          code: ["group with this code already exists."],
        },
      },
    };
    const msg = extractApiErrorMessage(err, "fallback");
    expect(msg).toContain("name: group with this name already exists.");
    expect(msg).toContain("code: group with this code already exists.");
  });

  it("handles a bare string response body", () => {
    const err = { response: { data: "plain string error" } };
    expect(extractApiErrorMessage(err, "fallback")).toBe("plain string error");
  });

  it("handles an array response body", () => {
    const err = { response: { data: ["first error", "second error"] } };
    expect(extractApiErrorMessage(err, "fallback")).toBe("first error, second error");
  });

  it("falls back when data object has no recognised fields", () => {
    const err = { response: { data: { unrelated: null } } };
    expect(extractApiErrorMessage(err, "Could not create the group.")).toBe(
      "Could not create the group."
    );
  });
});
