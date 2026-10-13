/**
 * Browser verification for the row-actions pill (PR #107 + #109).
 * Reuses the visual-verify.mjs auth pattern (JWT via manage.py shell,
 * refresh-cookie + localStorage user + mocked refresh endpoint).
 * Needs Django on 127.0.0.1:8000 + Vite on 127.0.0.1:5173.
 *
 * Run from frontend/:  node scripts/row-actions-pill-verify.mjs
 */
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";

const FRONTEND = process.cwd();
const REPO_ROOT = path.resolve(FRONTEND, "..");
const BASE = "http://127.0.0.1:5173";
const SHOTS = path.resolve(REPO_ROOT, "pill-verify-shots");
mkdirSync(SHOTS, { recursive: true });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
};

// ---- Token generation (visual-verify.mjs pattern) ----
function generateTokens(username) {
  const shellScript = `
import json, os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken
User = get_user_model()
user = User.objects.get(username=${JSON.stringify(username)})
refresh = RefreshToken.for_user(user)
print('===TOKENS_JSON_START===')
print(json.dumps({
    'access': str(refresh.access_token),
    'refresh': str(refresh),
    'user': {
        'id': user.id, 'username': user.username, 'email': user.email,
        'first_name': user.first_name, 'last_name': user.last_name,
        'is_staff': user.is_staff, 'is_superuser': user.is_superuser,
    },
}))
print('===TOKENS_JSON_END===')
`;
  const tmpFile = path.join(SHOTS, ".gen_tokens.py");
  writeFileSync(tmpFile, shellScript, "utf-8");
  try {
    const output = execSync(
      `"${path.join(REPO_ROOT, "venv", "Scripts", "python.exe")}" "${tmpFile}"`,
      {
        cwd: REPO_ROOT,
        encoding: "utf-8",
        timeout: 60_000,
        env: { ...process.env, PYTHONPATH: REPO_ROOT },
      }
    );
    const start = output.indexOf("===TOKENS_JSON_START===");
    const end = output.indexOf("===TOKENS_JSON_END===");
    if (start === -1 || end === -1) throw new Error("Token parse failed: " + output.slice(-500));
    return JSON.parse(output.slice(start + "===TOKENS_JSON_START===".length, end).trim());
  } finally {
    if (existsSync(tmpFile)) unlinkSync(tmpFile);
  }
}

async function createAuthContext(browser, viewport, tokens, theme, extra = {}) {
  const ctx = await browser.newContext({ viewport, colorScheme: theme, ...extra });
  await ctx.addCookies([
    {
      name: "refresh_token",
      value: tokens.refresh,
      domain: "127.0.0.1",
      path: "/api/auth/token/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await ctx.addInitScript(
    ({ userObj, themeName }) => {
      localStorage.setItem("user", JSON.stringify(userObj));
      localStorage.setItem("theme", themeName);
    },
    { userObj: tokens.user, themeName: theme }
  );
  await ctx.route("**/api/auth/token/refresh/", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ access: tokens.access }),
    })
  );
  return ctx;
}

const PILL = '[role="toolbar"][aria-label="Row actions"]';
const opacityOf = async (loc) =>
  parseFloat(await loc.evaluate((el) => getComputedStyle(el).opacity));
const inViewportX = (box, vw) => box && box.x >= -1 && box.x + box.width <= vw + 1;
const inClip = (box, clip) =>
  box && clip && box.x >= clip.left - 1 && box.x + box.width <= clip.right + 1;
// The table's own overflow-x-auto scroller (page may have others).
const tableScroller = (page) =>
  page
    .locator("tbody")
    .first()
    .locator("xpath=ancestor::div[contains(@class,'overflow-x-auto')][1]");

async function waitForTable(page) {
  await page.waitForSelector("tbody tr", { timeout: 30_000 });
  await page.waitForTimeout(1200); // data settles + pointer media query applied
}

async function main() {
  console.log("generating JWT for e2e_super...");
  const tokens = generateTokens("e2e_super");
  const browser = await chromium.launch();

  // ============ TEST A: fine pointer, /admin/users, 1440x900 ============
  {
    const ctx = await createAuthContext(browser, { width: 1440, height: 900 }, tokens, "light");
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`${BASE}/admin/users`, { waitUntil: "domcontentloaded" });
    await waitForTable(page);

    // A1: actions header collapsed (w-0, aria-hidden) => pill mode active
    const actionsTh = await page.locator('thead th[aria-hidden="true"]').count();
    const toolbars = await page.locator(PILL).count();
    check(
      "A1 pill mode active (collapsed actions th + per-row pill anchors)",
      actionsTh >= 1 && toolbars >= 1,
      `hiddenTh=${actionsTh} pillAnchors=${toolbars}`
    );

    // A2: no pill visible before hover
    const firstPill = page.locator(PILL).first();
    check("A2 pill hidden before hover", (await opacityOf(firstPill)) === 0);

    // A3: hover row -> pill visible, inside viewport, labelled buttons
    const row1 = page.locator("tbody tr").nth(0);
    await row1.hover({ position: { x: 400, y: 20 } });
    await page.waitForTimeout(300);
    const pillBox = await firstPill.boundingBox();
    check(
      "A3 pill reveals on hover",
      (await opacityOf(firstPill)) === 1,
      `box=${JSON.stringify(pillBox)}`
    );
    check("A4 pill fully inside 1440 viewport", inViewportX(pillBox, 1440));
    const labels = await firstPill.locator("button, a").allTextContents();
    check(
      "A5 pill buttons carry short labels (xl)",
      labels.some((t) => /edit/i.test(t)),
      labels.join("|").slice(0, 120)
    );
    await page.screenshot({ path: path.join(SHOTS, "a-hover-pill.png") });

    // A6: move to another row -> first pill hides, new row's pill shows
    const row3 = page.locator("tbody tr").nth(2);
    await row3.hover({ position: { x: 500, y: 20 } });
    await page.waitForTimeout(300);
    const pill3 = page.locator("tbody tr").nth(2).locator(PILL);
    check(
      "A6 hover moves pill (row1 off, row3 on)",
      (await opacityOf(firstPill)) === 0 && (await opacityOf(pill3)) === 1
    );

    // A7: keyboard focus reveals pill (focus-within)
    await page.mouse.move(10, 800); // leave all rows
    await page.waitForTimeout(250);
    await pill3.locator("button, a").first().focus();
    await page.waitForTimeout(300);
    check("A7 keyboard focus reveals pill", (await opacityOf(pill3)) === 1);

    // A8: pill click still works (stopPropagation doesn't break actions)
    await row1.hover({ position: { x: 400, y: 20 } });
    await page.waitForTimeout(250);
    await firstPill.getByRole("button", { name: /edit/i }).click();
    const dialogOpen = await page
      .locator('[role="dialog"]')
      .first()
      .isVisible()
      .catch(() => false);
    check("A8 Edit action opens dialog", dialogOpen);
    await page.keyboard.press("Escape");

    check(
      "A9 zero pageerrors on /admin/users",
      errors.length === 0,
      errors.slice(0, 2).join(" | ")
    );
    await ctx.close();
  }

  // ============ TEST B: container clip clamp (PR #109 + card-edge fix) ============
  {
    const ctx = await createAuthContext(browser, { width: 1440, height: 900 }, tokens, "light");
    const page = await ctx.newPage();
    await page.goto(`${BASE}/admin/users`, { waitUntil: "domcontentloaded" });
    await waitForTable(page);
    // The pill renders inside the table's overflow-x-auto content: the clip
    // bound is the SCROLLER's visible rect (~50px inside the viewport in the
    // admin shell), not window.innerWidth. The users table overflows
    // horizontally at 1440 (row ~1390px vs ~1076px scroller).
    // NOTE: offset is entry-anchored — moving WITHIN a row never recomputes
    // it, so each entry is preceded by a real mouse-leave.
    const edgeRow = page.locator("tbody tr").nth(4);
    const scroller = tableScroller(page);
    const sb = await scroller.boundingBox();
    // boundingBox returns {x,y,width,height} — normalize to clip edges.
    const clipRect = { left: sb.x, right: sb.x + sb.width, top: sb.y, bottom: sb.y + sb.height };

    // B1/B2: enter near the row's right edge → pill must stay inside the CLIP.
    // Raw mouse.move (not locator.hover): rows wider than the scroller make
    // Playwright's scrollIntoViewIfNeeded loop forever.
    const edgeRowBox = await edgeRow.boundingBox();
    const rowMidY = edgeRowBox.y + 15;
    const moveMouse = async (x, y) => {
      try {
        await page.mouse.move(x, y);
      } catch {
        const cdp = await ctx.newCDPSession(page);
        await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
      }
    };
    await moveMouse(clipRect.right - 6, rowMidY);
    await page.waitForTimeout(300);
    const edgePill = edgeRow.locator(PILL);
    const edgeBox = await edgePill.boundingBox();
    check(
      "B1 pill visible on right-edge entry",
      (await opacityOf(edgePill)) === 1,
      `box=${JSON.stringify(edgeBox)}`
    );
    check(
      "B2 pill clamped inside SCROLL CONTAINER on right-edge entry",
      inClip(edgeBox, clipRect),
      edgeBox
        ? `pill right=${(edgeBox.x + edgeBox.width).toFixed(0)} vs clip right=${clipRect.right.toFixed(0)}`
        : "no box"
    );
    await page.screenshot({ path: path.join(SHOTS, "b-edge-clamp.png") });

    // B3: left edge — leave the row first so a fresh mouseenter fires.
    await page.mouse.move(20, 840);
    await page.waitForTimeout(250);
    await page.mouse.move(edgeRowBox.x + 40, rowMidY);
    await page.waitForTimeout(300);
    const leftBox = await edgePill.boundingBox();
    check(
      "B3 pill inside viewport on left-edge entry",
      inViewportX(leftBox, 1440),
      leftBox ? `left=${leftBox.x.toFixed(0)}` : "no box"
    );

    // B4: scrolled RIGHT, enter near the clip's right edge → still inside clip
    // (the original bleed-off scenario, now against the real clip bound).
    await page.mouse.move(20, 840);
    await page.waitForTimeout(250);
    const canScroll = await scroller.evaluate((el) => el.scrollWidth > el.clientWidth);
    check("B4a table overflows horizontally at 1440", canScroll);
    if (canScroll) {
      await scroller.evaluate((el) => {
        el.scrollLeft = el.scrollWidth;
      });
      await page.waitForTimeout(300);
      const sRow = page.locator("tbody tr").nth(6);
      const sBox = await sRow.boundingBox();
      await page.mouse.move(clipRect.right - 6, sBox.y + 15);
      await page.waitForTimeout(300);
      const sPill = sRow.locator(PILL);
      const sPillBox = await sPill.boundingBox();
      check(
        "B4b pill inside clip after scrolling right",
        inClip(sPillBox, clipRect),
        sPillBox
          ? `pill right=${(sPillBox.x + sPillBox.width).toFixed(0)} vs clip ${clipRect.right.toFixed(0)}`
          : "no box"
      );
      // B5: scroll back left while still hovering → re-clamp keeps it in clip.
      await scroller.evaluate((el) => {
        el.scrollLeft = 0;
      });
      await page.waitForTimeout(300);
      const reclamp = await sPill.boundingBox();
      check(
        "B5 pill re-clamped inside clip after scrolling back",
        inClip(reclamp, clipRect),
        reclamp ? `pill right=${(reclamp.x + reclamp.width).toFixed(0)}` : "no box"
      );
      await page.screenshot({ path: path.join(SHOTS, "b5-scroll-reclamp.png") });
      await scroller.evaluate((el) => {
        el.scrollLeft = 0;
      });
    }
    await ctx.close();
  }

  // ============ TEST C: opt-out table keeps the column ============
  {
    const ctx = await createAuthContext(browser, { width: 1440, height: 900 }, tokens, "light");
    const page = await ctx.newPage();
    await page.goto(`${BASE}/admin/leave-requests`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    const rowCount = await page.locator("tbody tr").count();
    const hasRows = await page
      .locator("tbody tr td")
      .first()
      .isVisible()
      .catch(() => false);
    if (rowCount > 0 && hasRows) {
      const actionsHeader = page.locator(
        'thead th:has-text("Actions"), thead th span:has-text("Actions")'
      );
      const headerVisible = await actionsHeader
        .first()
        .isVisible()
        .catch(() => false);
      const toolbars = await page.locator(PILL).count();
      await page.locator("tbody tr").first().hover();
      await page.waitForTimeout(300);
      const anyVisiblePill = await page.locator(`${PILL}:visible`).count();
      check(
        "C1 opt-out table keeps Actions column (fine pointer)",
        headerVisible && toolbars === 0 && anyVisiblePill === 0,
        `header=${headerVisible} pillAnchors=${toolbars}`
      );
      await page.screenshot({ path: path.join(SHOTS, "c-optout-column.png") });
    } else {
      check(
        "C1 opt-out table keeps Actions column",
        false,
        "leave-requests table empty — could not verify"
      );
    }
    await ctx.close();
  }

  // ============ TEST D: coarse pointer keeps the column ============
  {
    const ctx = await createAuthContext(browser, { width: 820, height: 1100 }, tokens, "light", {
      hasTouch: true,
      isMobile: true,
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/admin/users`, { waitUntil: "domcontentloaded" });
    await waitForTable(page);
    const toolbars = await page.locator(PILL).count();
    const hiddenTh = await page.locator('thead th[aria-hidden="true"]').count();
    check(
      "D1 coarse pointer: no pill anchors, actions column rendered",
      toolbars === 0 && hiddenTh === 0,
      `pillAnchors=${toolbars} hiddenTh=${hiddenTh}`
    );
    await page.screenshot({ path: path.join(SHOTS, "d-coarse-column.png"), fullPage: false });
    await ctx.close();
  }

  // ============ TEST E: dark theme pill (tokens render, not transparent) ============
  {
    const ctx = await createAuthContext(browser, { width: 1440, height: 900 }, tokens, "dark");
    const page = await ctx.newPage();
    await page.goto(`${BASE}/admin/users`, { waitUntil: "domcontentloaded" });
    await waitForTable(page);
    await page
      .locator("tbody tr")
      .nth(1)
      .hover({ position: { x: 400, y: 20 } });
    await page.waitForTimeout(300);
    const pill = page.locator("tbody tr").nth(1).locator(PILL);
    const bg = await pill.evaluate((el) => getComputedStyle(el).backgroundColor);
    check(
      "E1 dark theme: pill renders with opaque surface",
      (await opacityOf(pill)) === 1 && !/rgba\(0, 0, 0, 0\)/.test(bg),
      `bg=${bg}`
    );
    await page.screenshot({ path: path.join(SHOTS, "e-dark-pill.png") });
    await ctx.close();
  }

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} checks passed. Shots: ${SHOTS}`
  );
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
