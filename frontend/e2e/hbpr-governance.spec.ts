/**
 * HBPR ↔ Albanian-TL governance: end-to-end role isolation.
 *
 * Covers the whole redesigned surface against the real stack:
 *  - an HBPR-only user gets `/hbpr` and is denied/hidden everywhere else;
 *  - the assigned Albanian TL sees the partnership and authors the evidence;
 *  - an admin manages the assignments;
 *  - a plain employee never sees HBPR governance data.
 *
 * The API assertions matter more than the UI ones: every client-side gate here
 * is presentation only, so each UI expectation is paired with the endpoint the
 * API must refuse regardless of what the browser renders.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";
import { E2E_CREDENTIALS, fetchApiToken, loginAsUser } from "./helpers";

const API = "http://127.0.0.1:8000";

/** The backend's calendar day: Django runs with TIME_ZONE="UTC", not the host's zone. */
const serverToday = () => new Date().toISOString().slice(0, 10);

async function settle(page: import("@playwright/test").Page) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(300);
}

/** One row of the HBPR assignment API, as the test asserts on it. */
interface ApiAssignmentRow {
  albanian_tl_detail?: { name?: string };
}

/** Either a DRF paginated envelope or a bare array, depending on the endpoint. */
type ApiBody = { results?: ApiAssignmentRow[] } | ApiAssignmentRow[] | null;

async function get(
  request: APIRequestContext,
  token: string,
  path: string
): Promise<{ status: number; body: ApiBody }> {
  const response = await request.get(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = response.ok() ? ((await response.json().catch(() => null)) as ApiBody) : null;
  return { status: response.status(), body };
}

/** The endpoints the app itself calls to decide what a role may render. */
const DENIED_PLUGINS_FOR_HBPR = [
  "engagement",
  "organigrama",
  "skills",
  "ticket_kpi",
  "analytics",
  "control_room",
];

test.describe("HBPR-only user", () => {
  test.describe.configure({ timeout: 180_000 });

  test("lands on the workspace and is denied the unrelated plugin metadata", async ({
    page,
    request,
  }) => {
    const token = await fetchApiToken(E2E_CREDENTIALS.hbpr);

    const meta = await get(request, token, "/api/plugins/management/active_metadata/");
    expect(meta.status).toBe(200);
    const enabled = (meta.body as { name: string }[]).map((row) => row.name);
    expect(enabled).toContain("tl_scorecard");
    for (const denied of DENIED_PLUGINS_FOR_HBPR) {
      expect(enabled, `${denied} must not be active for an HBPR`).not.toContain(denied);
    }

    await loginAsUser(page, E2E_CREDENTIALS.hbpr);
    await page.goto("/hbpr");
    await settle(page);
    await expect(page.getByRole("heading", { name: "HBPR Workspace" })).toBeVisible();
    // Either the attention surface or the assignment-free onboarding state.
    await expect(
      page
        .getByText("Needs your attention")
        .or(page.getByText("No Albanian team leaders assigned yet"))
    ).toBeVisible();
  });

  test("sidebar shows the HBPR workspace and none of the denied surfaces", async ({ page }) => {
    await loginAsUser(page, E2E_CREDENTIALS.hbpr);
    await page.goto("/hbpr");
    await settle(page);

    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(nav.getByRole("menuitem", { name: "HBPR Workspace" })).toBeVisible();
    // Every one of these is a dead link for an HBPR: the API refuses the
    // surface, so the route never registers or the guard bounces it. The
    // Dashboard item is also gone — an HBPR's home IS /hbpr, so the link
    // would only bounce straight here.
    for (const hidden of [
      "Dashboard",
      "TL Scorecard",
      "Calendar",
      "Leave",
      "My records",
      "Organigrama",
      "Skills",
      "Ticket KPI",
      "Overtime",
      "Standby",
    ]) {
      await expect(nav.getByRole("menuitem", { name: hidden }), hidden).toHaveCount(0);
    }
  });

  test("is redirected away from the TL scorecard, calendar and leave routes", async ({ page }) => {
    await loginAsUser(page, E2E_CREDENTIALS.hbpr);

    await page.goto("/tl-scorecard");
    await settle(page);
    expect(new URL(page.url()).pathname).toBe("/hbpr");

    for (const route of ["/calendar", "/leave-management"]) {
      await page.goto(route);
      await settle(page);
      // Denied surfaces bounce straight to their home — the /hbpr workspace.
      expect(new URL(page.url()).pathname, route).toBe("/hbpr");
    }
  });

  test("reads governance records but never an employee one-on-one", async ({ request }) => {
    const token = await fetchApiToken(E2E_CREDENTIALS.hbpr);

    const overview = await get(request, token, "/api/plugins/tl_scorecard/hbpr/overview/");
    expect(overview.status).toBe(200);
    // The seeded AL TL is the only assignment.
    expect(overview.body.leaders.map((l: { name: string }) => l.name)).toEqual(["E2E TeamLeaderB"]);

    const meetings = await get(request, token, "/api/plugins/tl_scorecard/meetings/");
    expect(meetings.status).toBe(200);
    const rows = meetings.body.results ?? meetings.body;
    for (const row of rows) {
      expect(row.meeting_type, "an HBPR must never read a one-on-one").not.toBe("one_on_one");
    }
  });

  test("downloads the evidence export for an assigned leader", async ({ request }) => {
    const token = await fetchApiToken(E2E_CREDENTIALS.hbpr);

    const overview = await get(request, token, "/api/plugins/tl_scorecard/hbpr/overview/");
    expect(overview.status).toBe(200);
    const leaderId = overview.body.leaders[0]?.id as number | undefined;
    expect(leaderId, "the seeded assignment must surface its AL TL").toBeDefined();

    const response = await request.get(
      `${API}/api/plugins/tl_scorecard/export/?leader_id=${leaderId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"] ?? "").toMatch(/spreadsheet|excel|octet-stream/i);
    expect((await response.body()).length, "the workbook must not be empty").toBeGreaterThan(0);
  });

  test("persists per-channel notification preference toggles", async ({ request }) => {
    const token = await fetchApiToken(E2E_CREDENTIALS.hbpr);
    const auth = { Authorization: `Bearer ${token}` };
    const prefsUrl = `${API}/api/plugins/notifications/notifications/preferences/`;

    const initial = await get(
      request,
      token,
      "/api/plugins/notifications/notifications/preferences/"
    );
    expect(initial.status).toBe(200);
    const group = (initial.body.results ?? initial.body).find(
      (row: { event_type: string }) => row.event_type === "hbpr_meetings"
    );
    expect(group, "HBPR governance groups must be configurable for an HBPR").toBeDefined();

    const flipped = {
      event_type: "hbpr_meetings",
      in_app_enabled: !group.in_app_enabled,
      push_enabled: !group.push_enabled,
    };
    expect((await request.patch(prefsUrl, { headers: auth, data: flipped })).status()).toBe(200);

    const reread = await get(
      request,
      token,
      "/api/plugins/notifications/notifications/preferences/"
    );
    const persisted = (reread.body.results ?? reread.body).find(
      (row: { event_type: string }) => row.event_type === "hbpr_meetings"
    );
    expect(persisted.in_app_enabled, "in-app toggle must persist").toBe(flipped.in_app_enabled);
    expect(persisted.push_enabled, "push toggle must persist independently").toBe(
      flipped.push_enabled
    );

    // Leave the seed state as it was found.
    await request.patch(prefsUrl, {
      headers: auth,
      data: {
        event_type: "hbpr_meetings",
        in_app_enabled: group.in_app_enabled,
        push_enabled: group.push_enabled,
      },
    });
  });

  test("cannot decide a promotion or approve a PIP", async ({ request }) => {
    const token = await fetchApiToken(E2E_CREDENTIALS.hbpr);
    const auth = { Authorization: `Bearer ${token}` };

    // Permission is checked before object lookup, so a missing id still 403s.
    const decide = await request.post(
      `${API}/api/plugins/tl_scorecard/promotion-flags/999999/decide/`,
      {
        headers: auth,
        data: { status: "promoted" },
      }
    );
    expect(decide.status()).toBe(403);

    const approve = await request.post(
      `${API}/api/plugins/tl_scorecard/pip-records/999999/approve/`,
      {
        headers: auth,
      }
    );
    expect(approve.status()).toBe(403);
  });
});

test.describe("Assigned Albanian TL", () => {
  test.describe.configure({ timeout: 180_000 });

  test("sees the HBPR partnership and can author evidence", async ({ page, request }) => {
    const token = await fetchApiToken(E2E_CREDENTIALS.albanianTeamLeader);

    const partnership = await get(request, token, "/api/plugins/tl_scorecard/partnership/");
    expect(partnership.status).toBe(200);
    expect(partnership.body.assignment).not.toBeNull();
    expect(partnership.body.assignment.hbpr.name).toBe("E2E HBPR");
    const assignmentId = partnership.body.assignment.id as number;

    await loginAsUser(page, E2E_CREDENTIALS.albanianTeamLeader);
    await page.goto("/tl-scorecard?tab=evidence");
    await settle(page);
    await expect(page.getByRole("heading", { name: "HBPR partnership" })).toBeVisible();
    await expect(page.getByText("E2E HBPR")).toBeVisible();
    await expect(page.getByRole("button", { name: /add log entry/i })).toBeVisible();

    // The authoring path the button opens, exercised through the API.
    const created = await request.post(`${API}/api/plugins/tl_scorecard/hbpr-evidence/`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        assignment: assignmentId,
        kind: "cadence_meeting",
        occurred_on: new Date().toISOString().slice(0, 10),
        shared_summary: "E2E cadence meeting",
      },
    });
    expect(created.status()).toBe(201);
    const createdRow = (await created.json()) as { id: number };

    // The governance loop closes: the assigned HBPR reads what the AL TL wrote.
    const hbprToken = await fetchApiToken(E2E_CREDENTIALS.hbpr);
    const hbprView = await get(
      request,
      hbprToken,
      `/api/plugins/tl_scorecard/hbpr-evidence/?assignment=${assignmentId}`
    );
    expect(hbprView.status).toBe(200);
    const evidenceRows = hbprView.body.results ?? hbprView.body;
    expect(
      evidenceRows.some((row: { id: number }) => row.id === createdRow.id),
      "the assigned HBPR must see the evidence its AL TL authored"
    ).toBe(true);
  });

  test("cannot approve a PIP, decide a promotion, or move evidence to another assignment", async ({
    request,
  }) => {
    const token = await fetchApiToken(E2E_CREDENTIALS.albanianTeamLeader);
    const auth = { Authorization: `Bearer ${token}` };

    const decide = await request.post(
      `${API}/api/plugins/tl_scorecard/promotion-flags/999999/decide/`,
      {
        headers: auth,
        data: { status: "promoted" },
      }
    );
    expect(decide.status()).toBe(403);

    const approve = await request.post(
      `${API}/api/plugins/tl_scorecard/pip-records/999999/approve/`,
      {
        headers: auth,
      }
    );
    expect(approve.status()).toBe(403);

    const evidence = await get(request, token, "/api/plugins/tl_scorecard/hbpr-evidence/");
    const rows = evidence.body.results ?? evidence.body;
    if (rows.length > 0) {
      const move = await request.patch(
        `${API}/api/plugins/tl_scorecard/hbpr-evidence/${rows[0].id}/`,
        { headers: auth, data: { assignment: 999999 } }
      );
      expect(move.status()).toBe(400);
    }
  });
});

test.describe("Admin", () => {
  test.describe.configure({ timeout: 180_000 });

  test("manages HBPR assignments from the admin page", async ({ page, request }) => {
    const token = await fetchApiToken(E2E_CREDENTIALS.admin);

    const assignments = await get(request, token, "/api/users/hbpr-assignments/");
    expect(assignments.status).toBe(200);
    const rows = Array.isArray(assignments.body)
      ? assignments.body
      : (assignments.body?.results ?? []);
    expect(rows.some((row) => row.albanian_tl_detail?.name === "E2E TeamLeaderB")).toBe(true);

    await loginAsUser(page, E2E_CREDENTIALS.admin);
    await page.goto("/admin/hbpr-assignments");
    await settle(page);
    await expect(page.getByRole("heading", { name: /HBPR assignments/i })).toBeVisible();
    // History is retained, so the pair may appear in more than one row.
    await expect(page.getByRole("cell", { name: "E2E TeamLeaderB" }).first()).toBeVisible();
  });

  test("runs the assignment lifecycle: duplicate rejected, reassign, no delete", async ({
    request,
  }) => {
    const token = await fetchApiToken(E2E_CREDENTIALS.admin);
    const auth = { Authorization: `Bearer ${token}` };
    const base = `${API}/api/users/hbpr-assignments/`;

    const list = await get(request, token, "/api/users/hbpr-assignments/?current=true");
    expect(list.status).toBe(200);
    const open = (list.body.results ?? list.body).find(
      (row: { albanian_tl_detail?: { name: string } }) =>
        row.albanian_tl_detail?.name === "E2E TeamLeaderB"
    );
    expect(open, "the seeded assignment must be current").toBeDefined();
    // Each reassign moves the open range's start forward a day. Re-running
    // without a reseed (`prepare_e2e_db`) eventually pushes it past today, which
    // would drop the HBPR's scope and fail every later test — so stop here with
    // an instruction instead of corrupting the fixture.
    test.skip(
      open.effective_from >= serverToday(),
      "Seeded assignment is at/after today: run `python manage.py prepare_e2e_db` to reseed."
    );
    const hbprId = open.hbpr_detail?.id ?? open.hbpr;
    const tlId = open.albanian_tl_detail?.id ?? open.albanian_tl;

    // One open assignment per AL TL: a second create is a structured 400.
    const duplicate = await request.post(base, {
      headers: auth,
      data: {
        hbpr: hbprId,
        albanian_tl: tlId,
        cadence: "weekly",
        effective_from: new Date().toISOString().slice(0, 10),
      },
    });
    expect(duplicate.status()).toBe(400);

    // Reassign closes the current range and creates its replacement in one
    // transaction. Starting the replacement the day after the current
    // assignment began keeps the pair current on every re-run.
    const nextStart = new Date(`${open.effective_from}T00:00:00Z`);
    nextStart.setUTCDate(nextStart.getUTCDate() + 1);
    const reassign = await request.post(`${base}${open.id}/reassign/`, {
      headers: auth,
      data: {
        new_hbpr: hbprId,
        cadence: "weekly",
        effective_from: nextStart.toISOString().slice(0, 10),
      },
    });
    expect(reassign.status()).toBe(200);
    const replacement = (await reassign.json()) as { id: number; is_current: boolean };
    expect(replacement.is_current).toBe(true);

    // The closed row is retained as history, never deleted.
    const history = await get(request, token, "/api/users/hbpr-assignments/?current=false");
    expect(history.status).toBe(200);
    expect(
      (history.body.results ?? history.body).some((row: { id: number }) => row.id === open.id)
    ).toBe(true);

    // Destructive delete stays unavailable — evidence holds a PROTECT FK.
    const destroy = await request.delete(`${base}${replacement.id}/`, { headers: auth });
    expect(destroy.status()).toBe(400);
  });
});

/** `user_id` claim of a SimpleJWT access token. */
const userIdFromToken = (token: string): number =>
  JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).user_id;

test.describe("Employee one-on-ones stay private through every door", () => {
  test.describe.configure({ timeout: 180_000 });

  test("an HBPR cannot reach a planted one-on-one, its attendees, or its aggregate", async ({
    request,
  }) => {
    const tlToken = await fetchApiToken(E2E_CREDENTIALS.albanianTeamLeader);
    const tlAuth = { Authorization: `Bearer ${tlToken}` };
    const employeeId = userIdFromToken(await fetchApiToken(E2E_CREDENTIALS.employeeC));
    const today = serverToday();

    const meeting = await request.post(`${API}/api/plugins/tl_scorecard/meetings/`, {
      headers: tlAuth,
      data: { meeting_type: "one_on_one", counterparty: employeeId, occurred_on: today },
    });
    expect(meeting.status()).toBe(201);
    const meetingId = ((await meeting.json()) as { id: number }).id;

    const attendee = await request.post(`${API}/api/plugins/tl_scorecard/meeting-attendees/`, {
      headers: tlAuth,
      data: { meeting: meetingId, user: employeeId, role: "observer" },
    });
    expect(attendee.status()).toBe(201);
    const attendeeId = ((await attendee.json()) as { id: number }).id;

    const hbprToken = await fetchApiToken(E2E_CREDENTIALS.hbpr);
    const ids = async (path: string) => {
      const res = await get(request, hbprToken, path);
      expect(res.status, path).toBe(200);
      return ((res.body.results ?? res.body) as { id: number }[]).map((row) => row.id);
    };

    // List and detail: omitted, and a guessed id is indistinguishable from a
    // missing row (404, never 403).
    expect(await ids("/api/plugins/tl_scorecard/meetings/")).not.toContain(meetingId);
    expect(
      (await get(request, hbprToken, `/api/plugins/tl_scorecard/meetings/${meetingId}/`)).status
    ).toBe(404);
    // The server-paged workspace endpoint reuses the same scope: no one-on-one there either.
    const paged = await get(
      request,
      hbprToken,
      "/api/plugins/tl_scorecard/hbpr/records/?kind=meetings&limit=100"
    );
    expect(paged.status).toBe(200);
    expect((paged.body.results as { id: number }[]).map((row) => row.id)).not.toContain(meetingId);
    expect(await ids("/api/plugins/tl_scorecard/meeting-attendees/")).not.toContain(attendeeId);
    expect(
      (await get(request, hbprToken, `/api/plugins/tl_scorecard/meeting-attendees/${attendeeId}/`))
        .status
    ).toBe(404);

    // The compliance percentage is derived from one-on-ones: hidden from the
    // HBPR, still shown to the owner who now has one logged this month.
    const tlId = userIdFromToken(tlToken);
    const asHbpr = await get(
      request,
      hbprToken,
      `/api/plugins/tl_scorecard/scorecard/?leader_id=${tlId}`
    );
    expect(asHbpr.status).toBe(200);
    expect(asHbpr.body.meetings.one_on_one_compliance_pct).toBeNull();
    const asOwner = await get(request, tlToken, "/api/plugins/tl_scorecard/scorecard/");
    expect(asOwner.status).toBe(200);
    expect(asOwner.body.meetings.one_on_one_compliance_pct).not.toBeNull();
  });

  test("staff audit governance evidence but cannot author it", async ({ request }) => {
    const token = await fetchApiToken(E2E_CREDENTIALS.admin);
    const assignments = await get(request, token, "/api/users/hbpr-assignments/?current=true");
    expect(assignments.status).toBe(200);
    const open = (assignments.body.results ?? assignments.body)[0] as { id: number };
    expect(open, "the seeded assignment must be current").toBeDefined();

    const response = await request.post(`${API}/api/plugins/tl_scorecard/hbpr-evidence/`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        assignment: open.id,
        kind: "cadence_meeting",
        occurred_on: serverToday(),
        shared_summary: "staff must not author this",
      },
    });
    expect(response.status()).toBe(403);
  });
});

test.describe("Plain employee", () => {
  test.describe.configure({ timeout: 180_000 });

  test("has no HBPR surface and is refused the workspace data", async ({ page, request }) => {
    const token = await fetchApiToken(E2E_CREDENTIALS.employeeC);
    const overview = await get(request, token, "/api/plugins/tl_scorecard/hbpr/overview/");
    expect(overview.status).toBe(403);

    await loginAsUser(page, E2E_CREDENTIALS.employeeC);
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(nav.getByRole("menuitem", { name: "HBPR Workspace" })).toHaveCount(0);

    // The route is not registered for an ungranted user (only the self-service
    // `/my-records` is), so `/hbpr` falls through the catch-all to home rather
    // than rendering a page the API would refuse anyway.
    await page.goto("/hbpr");
    await settle(page);
    expect(new URL(page.url()).pathname).toBe("/dashboard");
    await expect(page.getByRole("heading", { name: "HBPR Workspace" })).toHaveCount(0);
  });
});
