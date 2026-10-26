/**
 * Client archive lifecycle, end to end (plan `2026-10-26-client-archive.md`, phases A1-A5b).
 *
 * Covers the four surfaces that changed, against the real stack, and pairs every
 * UI expectation with the API answer that must hold regardless of the browser:
 *
 *  1. Clients admin page: archived rows, the archived-data dialog and its blockers.
 *  2. Archive / unarchive round-trip from the row actions.
 *  3. Overtime: the picker no longer offers an archived client, its existing
 *     record still renders it, and the API refuses a new record for it.
 *  4. Onboarding: superuser archived view is read-only and can download the ZIP.
 *
 * The fixture is a client this spec owns (`ARCPROBEC` / `ARCPROBEM`), created,
 * filled and archived in `beforeAll` and restored in `afterAll`. It must not
 * touch the shared seeded client: `chromium` and `mobile-chromium` run this file
 * concurrently, so a shared fixture would be archived and restored under itself.
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
const FOLDER_NAME = "Archive Probe";
const MARKER = "archive probe";

/** Only the fields these specs read; the API rows carry much more. */
interface ApiRow {
  id: number;
  code?: string;
  name?: string;
  username?: string;
}

let ctx: APIRequestContext;
let clientId = 0;
let logId: number | null = null;
let clientName = "";
let clientCode = "";

const asList = (data: unknown): ApiRow[] =>
  Array.isArray(data) ? (data as ApiRow[]) : ((data as { results?: ApiRow[] })?.results ?? []);

const json = async (response: { json: () => Promise<unknown> }) => response.json();

/**
 * Row actions live in a pill that is hidden until the row is hovered, and the
 * sticky table header can overlap the first row's action cell. Hover first, then
 * force the click past that overlay — the button itself is visible and enabled.
 */
async function clickRowAction(page: Page, row: Locator, name: string) {
  await row.scrollIntoViewIfNeeded();
  await row.hover();
  await page.getByRole("button", { name }).click({ force: true });
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  // One client per project, so two projects running this file cannot collide.
  const suffix = test.info().project.name === "mobile-chromium" ? "M" : "C";
  clientCode = `ARCPROBE${suffix}`;
  clientName = `Archive Probe ${suffix}`;

  const token = await fetchApiToken(E2E_CREDENTIALS.superuser);
  ctx = await request.newContext({
    baseURL: API_ORIGIN,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });

  const found = asList(
    await json(await ctx.get("/api/overtime/clients/", { params: { search: clientCode } }))
  ).find((row) => row.code === clientCode);
  if (found) {
    clientId = found.id;
    // A previous run may have left it archived; writes below need it active.
    await ctx.post(`/api/overtime/clients/${clientId}/unarchive/`);
  } else {
    const created = await ctx.post("/api/overtime/clients/", {
      data: { name: clientName, code: clientCode, description: MARKER },
    });
    expect(created.ok(), "creating the probe client must succeed").toBeTruthy();
    clientId = ((await created.json()) as { id: number }).id;
  }

  // Onboarding data has to exist before archiving: writes to an archived client
  // are refused on purpose, so the probe is uploaded while it is still active.
  let folders = asList(
    await json(
      await ctx.get("/api/plugins/onboarding/folders/", { params: { client_id: clientId } })
    )
  );
  if (!folders.some((folder) => folder.name === FOLDER_NAME)) {
    await ctx.post("/api/plugins/onboarding/folders/", {
      data: { client: clientId, parent: null, name: FOLDER_NAME },
    });
    folders = asList(
      await json(
        await ctx.get("/api/plugins/onboarding/folders/", { params: { client_id: clientId } })
      )
    );
  }
  const folder = folders.find((row) => row.name === FOLDER_NAME);
  const documents = asList(
    await json(
      await ctx.get("/api/plugins/onboarding/documents/", {
        params: { client_id: clientId, folder_id: folder!.id },
      })
    )
  );
  if (documents.length === 0) {
    await ctx.post("/api/plugins/onboarding/documents/", {
      multipart: {
        client: String(clientId),
        folder: String(folder!.id),
        file: { name: "archive-probe.txt", mimeType: "text/plain", buffer: Buffer.from(MARKER) },
      },
    });
  }

  // A current-month overtime row owned by the superuser, so the edit dialog has a
  // record that points at an archived client and the row is visible in their list.
  const superusers = asList(
    await json(await ctx.get("/api/users/users/", { params: { search: "e2e_super" } }))
  );
  const superuser = superusers.find((row) => row.username === "e2e_super");
  const created = await ctx.post("/api/overtime/logs/", {
    data: {
      user: superuser!.id,
      client: clientId,
      date: new Date().toISOString().slice(0, 10),
      hours: 1,
      description: MARKER,
      evidence_type: "other",
      evidence: MARKER,
    },
  });
  if (created.ok()) logId = ((await created.json()) as { id: number }).id;

  const archived = await ctx.post(`/api/overtime/clients/${clientId}/archive/`);
  expect(archived.ok(), "archive via API must succeed").toBeTruthy();
});

test.afterAll(async () => {
  if (ctx) {
    // Leave the probe client usable for the next run.
    await ctx.post(`/api/overtime/clients/${clientId}/unarchive/`).catch(() => undefined);
    await ctx.dispose();
  }
});

test("the API keeps every record and refuses to delete an archived client", async () => {
  const lifecycle = (await json(await ctx.get(`/api/overtime/clients/${clientId}/lifecycle/`))) as {
    is_active: boolean;
    can_delete: boolean;
    counts: Record<string, number>;
  };
  expect(lifecycle.is_active).toBe(false);
  expect(lifecycle.can_delete).toBe(false);
  expect(lifecycle.counts.overtime_logs).toBeGreaterThan(0);

  const refused = await ctx.delete(`/api/overtime/clients/${clientId}/`);
  expect(refused.status()).toBe(409);
  const body = (await refused.json()) as { counts: Record<string, number> };
  expect(body.counts.overtime_logs).toBeGreaterThan(0);

  // The client row is still there — a refused delete must not half-apply.
  const still = await ctx.get(`/api/overtime/clients/${clientId}/`);
  expect(still.status()).toBe(200);
});

test("the API refuses a new record for an archived client", async () => {
  const superusers = asList(
    await json(await ctx.get("/api/users/users/", { params: { search: "e2e_super" } }))
  );
  const superuser = superusers.find((row) => row.username === "e2e_super");
  const response = await ctx.post("/api/overtime/logs/", {
    data: {
      user: superuser!.id,
      client: clientId,
      date: new Date().toISOString().slice(0, 10),
      hours: 1,
      description: "must be refused",
      evidence_type: "other",
      evidence: "e2e",
    },
  });
  expect(response.status()).toBe(400);
  expect(JSON.stringify(await response.json())).toContain("archived");
});

test("the Clients page shows the archived client and explains why it cannot be deleted", async ({
  page,
}) => {
  await loginAsUser(page, E2E_CREDENTIALS.superuser);
  await page.goto("/admin/clients");

  // The page defaults to Active; archived clients live behind the status filter.
  await page.getByRole("button", { name: /^Archived/ }).click();
  const row = page.getByRole("row", { name: new RegExp(clientName) });
  await expect(row.getByText("Archived", { exact: true })).toBeVisible();

  await clickRowAction(page, row, `Archived data ${clientName}`);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(`${clientName}: archived data`)).toBeVisible();

  // Records kept, and a blocker instead of a delete button.
  await expect(dialog.getByText("Records kept")).toBeVisible();
  await expect(dialog.getByText("Overtime logs")).toBeVisible();
  await expect(dialog.getByText("Cannot be deleted yet")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Delete client" })).toHaveCount(0);

  // The onboarding panel offers the export that unlocks a later purge.
  await expect(dialog.getByRole("button", { name: "Download ZIP" })).toBeVisible();
});

test("archiving and unarchiving round-trip from the row actions", async ({ page }) => {
  await loginAsUser(page, E2E_CREDENTIALS.superuser);
  await page.goto("/admin/clients");
  await page.getByRole("button", { name: /^Archived/ }).click();
  const row = page.getByRole("row", { name: new RegExp(clientName) });

  // Unarchiving follows the row back to Active, so it never disappears either.
  await clickRowAction(page, row, `Unarchive ${clientName}`);
  await expect(row.getByText("Active", { exact: true })).toBeVisible();

  await clickRowAction(page, row, `Archive ${clientName}`);
  await page.getByRole("button", { name: "Archive client" }).click();
  await expect(row.getByText("Archived", { exact: true })).toBeVisible();
});

test("the overtime picker no longer offers the archived client", async ({ page }) => {
  await loginAsUser(page, E2E_CREDENTIALS.superuser);
  await page.goto("/overtime");

  await page.getByRole("button", { name: "Add Entry" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Select client", { exact: true }).click();
  await expect(page.getByRole("option").first()).toBeVisible();
  await expect(page.getByRole("option", { name: clientName })).toHaveCount(0);
});

test("an existing record still shows the client that archiving removed from the picker", async ({
  page,
}) => {
  test.skip(!logId, "the current-month probe row could not be created");
  await loginAsUser(page, E2E_CREDENTIALS.superuser);
  await page.goto("/overtime");

  // The table animates in; force skips the stability wait that never settles.
  const editButton = page.getByRole("button", { name: `Edit ${logId}` });
  await expect(editButton).toBeAttached();
  await editButton.click({ force: true });

  const editDialog = page.getByRole("dialog");
  // The client field is not blank: it shows the record's own (now archived) client.
  await expect(editDialog.getByRole("combobox").first()).toContainText(clientName);
});

test("a superuser can read an archived client's onboarding, read-only, and download it", async ({
  page,
}) => {
  await loginAsUser(page, E2E_CREDENTIALS.superuser);
  await page.goto("/onboarding");

  await page.getByRole("switch", { name: "Show archived clients" }).click();
  await expect(page.getByText(/Archived clients are read-only/)).toBeVisible();

  // Every write control is gone for an archived client.
  await expect(page.getByRole("button", { name: "New folder" })).toHaveCount(0);

  const download = page.waitForEvent("download", { timeout: 20_000 });
  await page.getByRole("button", { name: `Download ${clientName} ZIP` }).click();
  await download;
});
