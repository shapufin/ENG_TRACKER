/**
 * Passkeys (WebAuthn) click-through with Chromium's virtual authenticator.
 *
 * WebAuthn refuses an IP address as the RP ID, so this spec runs at
 * http://localhost:5173 (the dev defaults of WEBAUTHN_RP_ID/WEBAUTHN_ORIGINS),
 * not at the 127.0.0.1 baseURL the other specs use.
 *
 * Flow: logon prompt -> add a passkey -> rename -> sign in with it -> sign in with a
 * code instead -> remove it. The account's second factors are reset around the run so
 * the shared e2e database stays clean.
 */
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { expect, request, test, type CDPSession, type Page } from "@playwright/test";
import { E2E_CREDENTIALS } from "./helpers";

const APP = "http://localhost:5173";
const API = "http://127.0.0.1:8000";
// The desktop and mobile projects run in parallel workers against one database, so each uses its own
// account; sharing one would mix their passkeys and collide on SQLite writes.
let USER = E2E_CREDENTIALS.employeeB;

const base32Decode = (input: string): Buffer => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of input.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
};

/** RFC 6238 code for `step` (30 s). The server accepts one step either side and rejects replays. */
const totp = (secret: string, step: number): string => {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const value = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(value).padStart(6, "0");
};

const currentStep = () => Math.floor(Date.now() / 1000 / 30);

/** Break-glass reset used for cleanup: removes the app, backup codes and every passkey. */
const resetFactors = () => {
  // Fail loudly: a silent failed reset leaves passkeys behind and the next run sees duplicates.
  execFileSync("py", ["-3.14", "manage.py", "reset_user_mfa", USER.username], {
    cwd: "..",
    env: { ...process.env, DJANGO_SETTINGS_MODULE: "config.settings_e2e" },
    stdio: "pipe",
  });
};

async function addVirtualAuthenticator(page: Page): Promise<CDPSession> {
  const client = await page.context().newCDPSession(page);
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
  return client;
}

async function passwordStep(page: Page) {
  await page.goto(`${APP}/login`);
  await page.fill("#username", USER.username);
  await page.fill("#password", USER.password);
  await page.click('button[type="submit"]');
}

async function logout(page: Page) {
  await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.includes("Logout"));
    if (!button) throw new Error("Logout button not found");
    (button as HTMLButtonElement).click();
  });
  const confirm = page.getByRole("button", { name: "Log out anyway" });
  if (await confirm.isVisible({ timeout: 1_500 }).catch(() => false)) await confirm.click();
  await page.waitForURL(/\/login/);
}

test.describe("Passkeys", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  // Playwright requires the destructuring pattern in the first argument, even when it is empty.
  // eslint-disable-next-line no-empty-pattern
  test.beforeAll(({}, testInfo) => {
    USER = testInfo.project.name === "mobile-chromium" ? E2E_CREDENTIALS.employeeC : E2E_CREDENTIALS.employeeB;
    resetFactors();
  });
  test.afterAll(resetFactors);

  test("add, rename, sign in with a passkey, fall back to a code, remove", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && !/favicon|Failed to load resource/i.test(message.text())) {
        consoleErrors.push(message.text());
      }
    });
    await addVirtualAuthenticator(page);

    // 1. The logon prompt offers a passkey first and lands on the add dialog.
    await passwordStep(page);
    await page.waitForURL((url) => !url.pathname.includes("/login"));
    await page.getByRole("button", { name: /set up face id or fingerprint/i }).click();
    await page.waitForURL(/\/settings/);
    const addDialog = page.getByRole("dialog", { name: "Add a passkey" });
    await expect(addDialog).toBeVisible();
    await addDialog.getByLabel("Name").fill("E2E laptop");
    await addDialog.getByLabel("Password").fill(USER.password);
    await addDialog.getByRole("button", { name: "Add passkey" }).click();
    await expect(page.locator("#passkeys").getByText("E2E laptop", { exact: true })).toBeVisible();
    await expect(page.getByText("Never used")).toBeVisible();

    // 2. Rename it.
    await page.getByRole("button", { name: "Rename passkey E2E laptop" }).click();
    const renameDialog = page.getByRole("dialog", { name: "Rename passkey" });
    await renameDialog.getByLabel("Name").fill("E2E desk");
    await renameDialog.getByLabel("Password").fill(USER.password);
    await renameDialog.getByRole("button", { name: "Save name" }).click();
    await expect(page.locator("#passkeys").getByText("E2E desk", { exact: true })).toBeVisible();

    // 3. Sign out and back in with the passkey: one tap, no code field.
    await logout(page);
    await passwordStep(page);
    await expect(page.getByRole("heading", { name: "Two-factor authentication" })).toBeVisible();
    await expect(page.getByLabel("6-digit code")).toHaveCount(0);
    await page.getByRole("button", { name: /use face id or fingerprint/i }).click();
    await page.waitForURL((url) => !url.pathname.includes("/login"));
    await expect(page).toHaveURL(/\/dashboard/);

    // 4. Turn the authenticator app on through the API (the signed-in session's token), then
    //    sign in with a code instead of the passkey.
    const api = await request.newContext({ baseURL: API });
    const token = await page.evaluate(async (origin) => {
      const refreshed = await fetch(`${origin}/api/auth/token/refresh/`, { method: "POST", credentials: "include" });
      return (await refreshed.json()).access as string;
    }, APP);
    const headers = { Authorization: `Bearer ${token}` };
    const setup = await (await api.post("/api/auth/mfa/setup/", { headers, data: { password: USER.password } })).json();
    const activated = await api.post("/api/auth/mfa/activate/", {
      headers,
      data: { code: totp(setup.secret, currentStep()) },
    });
    expect(activated.ok()).toBeTruthy();

    await logout(page);
    await passwordStep(page);
    await page.getByRole("button", { name: "Use a code instead" }).click();
    const signInStep = currentStep() + 1;
    await page.getByLabel("6-digit code").fill(totp(setup.secret, signInStep));
    await page.getByRole("button", { name: "Verify" }).click();
    await page.waitForURL(/\/dashboard/);

    // 5. Remove the passkey: password plus the app code (the app is on).
    await page.goto(`${APP}/settings`);
    await page.getByRole("button", { name: "Remove passkey E2E desk" }).click();
    const removeDialog = page.getByRole("dialog", { name: "Remove passkey" });
    await removeDialog.getByLabel("Password").fill(USER.password);
    // A code works once and only if its step is newer than the last one used (and within one step of
    // the server clock), so wait until the clock reaches that step, then use the step after it.
    while (currentStep() < signInStep) await page.waitForTimeout(1_000);
    await removeDialog.getByLabel(/code from your authenticator app/i).fill(totp(setup.secret, currentStep() + 1));
    await removeDialog.getByRole("button", { name: "Remove passkey" }).click();
    await expect(page.locator("#passkeys").getByText("E2E desk", { exact: true })).toHaveCount(0);

    await api.dispose();
    expect(consoleErrors).toEqual([]);
  });
});
