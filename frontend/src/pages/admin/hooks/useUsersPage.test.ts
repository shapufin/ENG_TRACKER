import { describe, expect, it } from "vitest";
import { buildRolePayload } from "./useUsersPage";

const baseForm = {
  is_hbpr: false,
  teams: [3],
  techs: [7],
  tech_levels: { 7: 2 },
  albanian_tl: "12",
  italian_tl: "none",
  is_hr_user: false,
  is_italian_tl_role: true,
  is_albanian_tl_role: false,
  is_cr_admin: true,
};

describe("buildRolePayload", () => {
  it("sends assignments and the full role set for a normal user", () => {
    const payload = buildRolePayload(baseForm);

    expect(payload).toMatchObject({
      teams: [3],
      techs: [{ tech: 7, level: 2 }],
      albanian_tl: 12,
      italian_tl: null,
      is_italian_tl_role: true,
      is_albanian_tl_role: false,
      is_cr_admin: true,
    });
    expect(payload.roles).toEqual(["italian_tl", "cr_admin"]);
  });

  it("omits hidden assignment keys entirely for an HBPR user", () => {
    const payload = buildRolePayload({ ...baseForm, is_hbpr: true });

    // Absent key = unchanged server-side; sending empties would clear.
    for (const key of ["teams", "techs", "albanian_tl", "italian_tl"] as const) {
      expect(payload).not.toHaveProperty(key);
    }
  });

  it("forces hidden role flags off and drops them from the roles array", () => {
    const payload = buildRolePayload({ ...baseForm, is_hbpr: true });

    expect(payload.is_italian_tl_role).toBe(false);
    expect(payload.is_albanian_tl_role).toBe(false);
    expect(payload.is_cr_admin).toBe(false);
    expect(payload.roles).toEqual(["hbpr"]);
  });

  it("keeps HR alongside HBPR when the HR switch is on", () => {
    const payload = buildRolePayload({ ...baseForm, is_hbpr: true, is_hr_user: true });
    expect(payload.roles).toEqual(["hr", "hbpr"]);
  });

  it("keeps hbpr out of the roles array when it is off for a normal user", () => {
    const payload = buildRolePayload(baseForm);
    expect(payload.roles).not.toContain("hbpr");
  });
});
