import { describe, expect, it } from "vitest";
import { isAllowedCRAdminPath } from "./adminRouteGuards";

describe("isAllowedCRAdminPath", () => {
  it("allows /admin/users and nested users routes", () => {
    expect(isAllowedCRAdminPath("/admin/users")).toBe(true);
    expect(isAllowedCRAdminPath("/admin/users/123")).toBe(true);
  });

  it("allows control room admin routes", () => {
    expect(isAllowedCRAdminPath("/admin/control-room/access")).toBe(true);
  });

  it("blocks admin root and unrelated admin routes", () => {
    expect(isAllowedCRAdminPath("/admin")).toBe(false);
    expect(isAllowedCRAdminPath("/admin/overtime-logs")).toBe(false);
    expect(isAllowedCRAdminPath("/dashboard")).toBe(false);
  });
});
