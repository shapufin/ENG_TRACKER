import { describe, it, expect } from "vitest";
import { extractFieldErrors } from "./useFormErrorHandler";

const apiError = (data: unknown) => ({ response: { data } }) as never;

describe("extractFieldErrors", () => {
  it("joins list messages per field", () => {
    expect(
      extractFieldErrors(
        apiError({ username: ["Taken."], password: ["Too short.", "Too common."] })
      )
    ).toEqual({ username: "Taken.", password: "Too short. Too common." });
  });

  it("keeps plain string values", () => {
    expect(extractFieldErrors(apiError({ error: "Nope" }))).toEqual({ error: "Nope" });
  });

  it("returns an empty map when there is no object body", () => {
    expect(extractFieldErrors(apiError("boom"))).toEqual({});
    expect(extractFieldErrors(undefined as never)).toEqual({});
  });
});
