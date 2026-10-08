import { describe, it, expect } from "vitest";
import type { UserProfile } from "@/types";
import { userRoleTab } from "./paletteItems";

const profile = (over: Record<string, unknown> = {}, user: Record<string, unknown> = {}) =>
  ({
    is_hr_user: false,
    user: { roles: [], is_cr_admin: false, ...user },
    ...over,
  }) as unknown as UserProfile;

describe("userRoleTab", () => {
  it("plain employee", () => expect(userRoleTab(profile())).toBe("employee"));

  it("follows the Users page precedence for people with several roles", () => {
    expect(userRoleTab(profile({ is_albanian_tl_role: true, is_italian_tl_role: true }))).toBe(
      "albanian_tl"
    );
    expect(userRoleTab(profile({ is_italian_tl_role: true, is_hr_user: true }))).toBe("italian_tl");
  });

  it("finds HBPR and Control Room admins, which have no profile flag", () => {
    expect(userRoleTab(profile({}, { roles: ["hbpr"] }))).toBe("hbpr");
    expect(userRoleTab(profile({}, { is_cr_admin: true }))).toBe("cr_admin");
  });

  it("HR before HBPR before CR admin", () => {
    expect(userRoleTab(profile({ is_hr_user: true }, { roles: ["hbpr"], is_cr_admin: true }))).toBe(
      "hr"
    );
    expect(userRoleTab(profile({}, { roles: ["hbpr"], is_cr_admin: true }))).toBe("hbpr");
  });

  it("tolerates missing role data", () => {
    expect(userRoleTab({ user: {} } as unknown as UserProfile)).toBe("employee");
  });
});
