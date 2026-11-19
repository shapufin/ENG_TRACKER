/**
 * Phone approval sign-in click-through (item 90, spec 2026-11-19).
 *
 * Two browser contexts: the "phone" has Chromium's virtual authenticator (a platform passkey with
 * user verification) and pairs itself in Settings; the "PC" signs in with the password, asks for
 * phone approval and reads the approval URL the QR code carries. Real push delivery cannot be
 * simulated here (no push service), so notifications are refused on purpose and the QR path is
 * exercised; the push payload is covered by the backend tests and runbook 5.9.
 *
 * WebAuthn refuses an IP address as the RP ID, so everything runs at http://localhost:5173 (the
 * dev defaults of WEBAUTHN_RP_ID/WEBAUTHN_ORIGINS), like passkeys.spec.ts. Each project uses its own
 * account because the desktop and mobile projects run in parallel against one database.
 */
import { execFileSync } from "node:child_process";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { E2E_CREDENTIALS } from "./helpers";

const APP = "http://localhost:5173";
let USER = E2E_CREDENTIALS.controlRoom;

const resetFactors = () => {
  // Fail loudly: a silent failed reset leaves a paired phone behind and the next run sees it.
  execFileSync("python", ["manage.py", "reset_user_mfa", USER.username], {
    cwd: "..",
    env: { ...process.env, DJANGO_SETTINGS_MODULE: "config.settings_e2e" },
    stdio: "pipe",
    shell: process.platform === "win32",
  });
};

async function passwordStep(page: Page) {
  await page.goto(`${APP}/login`);
  await page.fill("#username", USER.username);
  await page.fill("#password", USER.password);
  await page.click('button[type="submit"]');
}

/** The "phone": signs in, creates a passkey on its virtual authenticator and pairs it. */
async function pairedPhone(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ permissions: [] });
  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send("WebAuthn.enable");
  await client.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await passwordStep(page);
  await page.waitForURL((url) => !url.pathname.includes("/login"));
  await page.goto(`${APP}/settings`);
  await page.getByRole("button", { name: "Set up this phone" }).click();
  const dialog = page.getByRole("dialog", { name: "Set up this phone" });
  await dialog.getByLabel("Name").fill("E2E phone");
  await dialog.getByLabel("Password").fill(USER.password);
  await dialog.getByRole("button", { name: "Set up phone" }).click();
  await expect(page.locator("#phones").getByText("E2E phone", { exact: true })).toBeVisible();
  return page;
}

/** The "PC": password step, then "Approve on my phone"; returns the request the server created. */
async function askForApproval(pc: Page) {
  await passwordStep(pc);
  const requested = pc.waitForResponse((r) => r.url().includes("/auth/token/phone-request/") && r.ok());
  await pc.getByRole("button", { name: "Approve on my phone" }).click();
  const request = (await (await requested).json()) as { number: number; approve_url: string };
  await expect(pc.getByLabel(`Your number is ${request.number}`)).toBeVisible();
  // Notifications are refused in this run, so the QR code is shown at once.
  await expect(pc.getByAltText(/QR code to approve this sign-in/i)).toBeVisible();
  return request;
}

test.describe("Phone approval", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  // Playwright requires the destructuring pattern in the first argument, even when it is empty.
  // eslint-disable-next-line no-empty-pattern
  test.beforeAll(({}, testInfo) => {
    USER = testInfo.project.name === "mobile-chromium" ? E2E_CREDENTIALS.hbpr : E2E_CREDENTIALS.controlRoom;
    resetFactors();
  });
  test.afterAll(resetFactors);

  test("the phone approves a PC sign-in with the right number", async ({ browser }) => {
    const phone = await pairedPhone(browser);
    const pc = await (await browser.newContext()).newPage();
    const errors: string[] = [];
    pc.on("console", (m) => {
      if (m.type() === "error" && !/favicon|Failed to load resource/i.test(m.text())) errors.push(m.text());
    });

    const request = await askForApproval(pc);
    await phone.goto(request.approve_url);
    await expect(phone.getByText(new RegExp(USER.username))).toBeVisible();
    await phone.getByRole("button", { name: `Number ${request.number}` }).click();
    await expect(phone.getByText(/Approved\. Go back to your computer/)).toBeVisible();

    await pc.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15_000 });
    expect(errors).toEqual([]);
    await phone.context().close();
    await pc.context().close();
  });

  test("a wrong number cancels the request and the PC stays signed out", async ({ browser }) => {
    // Start clean: the first test's phone (and its authenticator) is gone, and a paired account
    // would ask the new "phone" for approval just to sign in.
    resetFactors();
    const phone = await pairedPhone(browser);
    const pc = await (await browser.newContext()).newPage();
    const request = await askForApproval(pc);
    await phone.goto(request.approve_url);
    const numbers = phone.getByRole("button", { name: /^Number \d+$/ });
    await expect(numbers).toHaveCount(3);
    const options = await numbers.all();
    let wrongButton = null;
    for (const option of options) {
      if ((await option.getAttribute("aria-label")) !== `Number ${request.number}`) wrongButton = option;
    }
    await wrongButton!.click();
    await expect(phone.getByRole("alert")).toContainText(/not the number on your computer/i);

    await expect(pc.getByRole("alert")).toContainText(/denied on your phone/i, { timeout: 15_000 });
    await expect(pc).toHaveURL(/\/login/);
    await phone.context().close();
    await pc.context().close();
  });

  test("an account without a paired phone signs in exactly as before", async ({ page }) => {
    resetFactors();
    await passwordStep(page);
    await page.waitForURL((url) => !url.pathname.includes("/login"));
    await expect(page.getByRole("button", { name: "Approve on my phone" })).toHaveCount(0);
  });
});
