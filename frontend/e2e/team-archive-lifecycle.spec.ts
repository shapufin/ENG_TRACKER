/**
 * Team archive lifecycle, end to end (team lifecycle plan, phases 2 and 6).
 *
 * The fixture is a team (and one member) this spec owns, created in `beforeAll`
 * and removed in `afterAll`. It must not touch the shared seeded teams: the
 * `chromium` and `mobile-chromium` projects run this file concurrently, so each
 * gets its own probe team.
 */
import {
  expect,
  request,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
} from "@playwright/test";
import { E2E_CREDENTIALS, fetchApiToken, loginAsUser } from "./helpers";

const API_ORIGIN = "http://127.0.0.1:8000";

interface ApiRow {
  id: number;
  code?: string;
  username?: string;
  is_active?: boolean;
  teams?: number[];
}

let ctx: APIRequestContext;
let teamId = 0;
let memberId = 0;
let teamName = "";
let teamCode = "";
let username = "";

const asList = (data: unknown): ApiRow[] =>
  Array.isArray(data) ? (data as ApiRow[]) : ((data as { results?: ApiRow[] })?.results ?? []);

/** Row actions sit in a pill shown on hover; force past the sticky header overlay. */
async function clickRowAction(page: Page, row: Locator, name: string) {
  await row.scrollIntoViewIfNeeded();
  await row.hover();
  await page.getByRole("button", { name }).click({ force: true });
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const suffix = test.info().project.name === "mobile-chromium" ? "M" : "C";
  teamCode = `TARC${suffix}`;
  teamName = `Team Archive Probe ${suffix}`;
  username = `teamprobe_${suffix.toLowerCase()}`;

  const token = await fetchApiToken(E2E_CREDENTIALS.superuser);
  ctx = await request.newContext({
    baseURL: API_ORIGIN,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });

  // A team that was ever used cannot be deleted (it can only be archived), so the probe
  // is reused across runs: find it, make sure it is active, and put the member back.
  const found = asList(
    await (
      await ctx.get("/api/users/teams/", { params: { is_active: "all", search: teamCode } })
    ).json()
  ).find((row) => row.code === teamCode);
  if (found) {
    teamId = found.id;
    if (found.is_active === false) await ctx.post(`/api/users/teams/${teamId}/unarchive/`);
  } else {
    const created = await ctx.post("/api/users/teams/", {
      data: { name: teamName, code: teamCode },
    });
    expect(created.ok(), "creating the probe team must succeed").toBeTruthy();
    teamId = ((await created.json()) as { id: number }).id;
  }

  const existing = asList(
    await (await ctx.get("/api/users/users/", { params: { search: username } })).json()
  ).find((row) => row.username === username);
  if (existing) {
    memberId = existing.id;
    const put = await ctx.patch(`/api/users/users/${memberId}/update_user/`, {
      data: { teams: [teamId] },
    });
    expect(put.ok(), "putting the probe member back in the team must succeed").toBeTruthy();
  } else {
    const member = await ctx.post("/api/users/users/create_user/", {
      data: {
        username,
        email: `${username}@example.com`,
        password: "Probe-pass-2026!x",
        teams: [teamId],
      },
    });
    expect(member.ok(), "creating the probe member must succeed").toBeTruthy();
    memberId = ((await member.json()) as { id: number }).id;
  }
});

test.afterAll(async () => {
  if (ctx) {
    // Leave the probe team active for the next run.
    await ctx.post(`/api/users/teams/${teamId}/unarchive/`).catch(() => undefined);
    await ctx.dispose();
  }
});

test("the API refuses to delete a team that has members and says why", async () => {
  const refused = await ctx.delete(`/api/users/teams/${teamId}/`);
  expect(refused.status()).toBe(409);
  const body = (await refused.json()) as { blockers: string[]; counts: Record<string, number> };
  expect(body.counts.user_memberships).toBe(1);
  expect(body.blockers.length).toBeGreaterThan(0);
  expect((await ctx.get(`/api/users/teams/${teamId}/`)).status()).toBe(200);
});

test("archiving from the Teams page hides the team, unassigns members and keeps it under Archived", async ({
  page,
}) => {
  await loginAsUser(page, E2E_CREDENTIALS.superuser);
  await page.goto("/admin/teams");

  const row = page.getByRole("row", { name: new RegExp(teamName) });
  await clickRowAction(page, row, `Archive ${teamName}`);

  const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog"));
  await expect(dialog.getByText(/1 member will be unassigned/)).toBeVisible();
  await dialog.getByRole("button", { name: "Archive team" }).click();

  // The page follows the team to the Archived view instead of making it vanish.
  const archivedRow = page.getByRole("row", { name: new RegExp(teamName) });
  await expect(archivedRow.getByText("Archived", { exact: true })).toBeVisible();

  // API truth: archived, no members, and gone from the default list.
  const team = (await (await ctx.get(`/api/users/teams/${teamId}/`)).json()) as ApiRow;
  expect(team.is_active).toBe(false);
  const defaults = asList(
    await (await ctx.get("/api/users/teams/", { params: { page_size: 1000 } })).json()
  );
  expect(defaults.some((row) => row.id === teamId)).toBe(false);
  const profile = asList(
    await (await ctx.get("/api/users/profiles/", { params: { search: username } })).json()
  ).find((row) => row.id !== undefined);
  expect(profile?.teams ?? []).not.toContain(teamId);
});

test("the archived data dialog lists the team and offers delete only after typing the code", async ({
  page,
}) => {
  await loginAsUser(page, E2E_CREDENTIALS.superuser);
  await page.goto("/admin/teams");
  await page.getByRole("button", { name: /^Archived/ }).click();
  const row = page.getByRole("row", { name: new RegExp(teamName) });

  await clickRowAction(page, row, `Archived data of ${teamName}`);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(`${teamName}: team data`)).toBeVisible();
  await expect(dialog.getByText("Eligible for purge:")).toBeVisible();

  const remove = dialog.getByRole("button", { name: "Delete team" });
  await expect(remove).toBeDisabled();
  await dialog.getByLabel(`Type ${teamCode} to confirm`).fill(teamCode);
  await expect(remove).toBeEnabled();
  await dialog.getByRole("button", { name: "Close" }).first().click();
});

test("restoring a team brings it back under Active without its former members", async ({
  page,
}) => {
  await loginAsUser(page, E2E_CREDENTIALS.superuser);
  await page.goto("/admin/teams");
  await page.getByRole("button", { name: /^Archived/ }).click();
  const row = page.getByRole("row", { name: new RegExp(teamName) });

  await clickRowAction(page, row, `Restore ${teamName}`);
  await expect(page.getByRole("row", { name: new RegExp(teamName) })).toBeVisible();
  await expect(
    page.getByRole("row", { name: new RegExp(teamName) }).getByText("Archived", { exact: true })
  ).toHaveCount(0);

  const team = (await (await ctx.get(`/api/users/teams/${teamId}/`)).json()) as ApiRow;
  expect(team.is_active).toBe(true);
});
