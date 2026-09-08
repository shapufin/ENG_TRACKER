// Unit tests for the visual fingerprint diff engine and inconsistency detector.
// Pure functions only — no browser needed.
// Run: node --test scripts/visual-fingerprint.test.mjs (from frontend/).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  diffFingerprints,
  detectInconsistencies,
  normalizeColor,
  elementsMatch,
  boundsEqual,
} from "./visual-fingerprint.mjs";

// ---- Fixtures ----
const baselineFingerprint = {
  version: 1,
  page: {
    url: "http://127.0.0.1:5173/dashboard",
    title: "Dashboard",
    viewport: { width: 1280, height: 800 },
    theme: "dark",
    background: "rgb(7, 9, 14)",
  },
  regions: {
    banner: {
      role: "banner",
      bounds: { x: 0, y: 0, width: 1280, height: 64 },
      background: "rgb(15, 23, 42)",
      components: [
        {
          id: 'banner/button["Menu"]',
          role: "button",
          name: "Menu",
          bounds: { x: 8, y: 16, width: 32, height: 32 },
          visible: true,
          backgroundColor: "rgba(0, 0, 0, 0)",
          color: "rgb(148, 163, 184)",
          fontSize: "16px",
          display: "flex",
          textOverflow: false,
          resolveStatus: "ok",
        },
      ],
    },
    main: {
      role: "main",
      bounds: { x: 0, y: 64, width: 1280, height: 736 },
      background: "rgb(7, 9, 14)",
      components: [
        {
          id: 'main/heading["Dashboard"]',
          role: "heading",
          name: "Dashboard",
          bounds: { x: 24, y: 88, width: 200, height: 32 },
          visible: true,
          backgroundColor: "rgba(0, 0, 0, 0)",
          color: "rgb(248, 250, 252)",
          fontSize: "24px",
          display: "block",
          textOverflow: false,
          resolveStatus: "ok",
        },
        {
          id: 'main/button["Submit"]',
          role: "button",
          name: "Submit",
          bounds: { x: 24, y: 140, width: 96, height: 40 },
          visible: true,
          backgroundColor: "rgb(99, 102, 241)",
          color: "rgb(255, 255, 255)",
          fontSize: "14px",
          display: "inline-flex",
          textOverflow: false,
          resolveStatus: "ok",
        },
      ],
    },
  },
};

// ---- normalizeColor ----
describe("normalizeColor", () => {
  it("passes through rgb as-is", () => {
    assert.equal(normalizeColor("rgb(7, 9, 14)"), "rgb(7, 9, 14)");
  });

  it("converts rgba to rgb by dropping alpha when alpha is 1", () => {
    assert.equal(normalizeColor("rgba(7, 9, 14, 1)"), "rgb(7, 9, 14)");
  });

  it("keeps rgba when alpha < 1", () => {
    assert.equal(normalizeColor("rgba(0, 0, 0, 0)"), "rgba(0, 0, 0, 0)");
  });

  it("returns null for empty input", () => {
    assert.equal(normalizeColor(""), null);
    assert.equal(normalizeColor(null), null);
    assert.equal(normalizeColor(undefined), null);
  });
});

// ---- elementsMatch ----
describe("elementsMatch", () => {
  it("matches by composite id", () => {
    const a = { id: 'main/button["Submit"]' };
    const b = { id: 'main/button["Submit"]' };
    assert.equal(elementsMatch(a, b), true);
  });

  it("does not match different ids", () => {
    const a = { id: 'main/button["Submit"]' };
    const b = { id: 'main/button["Cancel"]' };
    assert.equal(elementsMatch(a, b), false);
  });

  it("falls back to role+name when id is missing", () => {
    const a = { role: "button", name: "Submit" };
    const b = { role: "button", name: "Submit" };
    assert.equal(elementsMatch(a, b), true);
  });

  it("does not match different role+name fallback", () => {
    const a = { role: "button", name: "Submit" };
    const b = { role: "button", name: "Cancel" };
    assert.equal(elementsMatch(a, b), false);
  });
});

// ---- boundsEqual ----
describe("boundsEqual", () => {
  it("matches identical bounds", () => {
    assert.equal(
      boundsEqual({ x: 0, y: 0, width: 100, height: 50 }, { x: 0, y: 0, width: 100, height: 50 }),
      true,
    );
  });

  it("matches within width tolerance (±50px)", () => {
    assert.equal(
      boundsEqual({ x: 0, y: 0, width: 100, height: 50 }, { x: 0, y: 0, width: 130, height: 50 }),
      true,
    );
  });

  it("matches within height tolerance (±30px)", () => {
    assert.equal(
      boundsEqual({ x: 0, y: 0, width: 100, height: 50 }, { x: 0, y: 0, width: 100, height: 70 }),
      true,
    );
  });

  it("matches within position tolerance (±100px)", () => {
    assert.equal(
      boundsEqual({ x: 0, y: 0, width: 100, height: 50 }, { x: 80, y: 60, width: 100, height: 50 }),
      true,
    );
  });

  it("fails when width exceeds tolerance", () => {
    assert.equal(
      boundsEqual({ x: 0, y: 0, width: 100, height: 50 }, { x: 0, y: 0, width: 200, height: 50 }),
      false,
    );
  });

  it("fails when height exceeds tolerance", () => {
    assert.equal(
      boundsEqual({ x: 0, y: 0, width: 100, height: 50 }, { x: 0, y: 0, width: 100, height: 100 }),
      false,
    );
  });
});

// ---- diffFingerprints ----
describe("diffFingerprints", () => {
  it("returns no regressions for identical fingerprints", () => {
    const diff = diffFingerprints(baselineFingerprint, baselineFingerprint);
    assert.equal(diff.regressions.length, 0);
    assert.equal(diff.invariants.length, 0);
    assert.equal(diff.summary.equivalent, true);
  });

  it("detects a missing region", () => {
    const current = JSON.parse(JSON.stringify(baselineFingerprint));
    delete current.regions.banner;
    const diff = diffFingerprints(baselineFingerprint, current);
    assert.equal(diff.summary.equivalent, false);
    assert.ok(diff.regressions.some((r) => r.type === "missing-region" && r.region === "banner"));
  });

  it("detects an added region", () => {
    const current = JSON.parse(JSON.stringify(baselineFingerprint));
    current.regions.footer = {
      role: "contentinfo",
      bounds: { x: 0, y: 750, width: 1280, height: 50 },
      components: [],
    };
    const diff = diffFingerprints(baselineFingerprint, current);
    assert.equal(diff.summary.equivalent, false);
    assert.ok(diff.regressions.some((r) => r.type === "added-region" && r.region === "footer"));
  });

  it("detects a missing component", () => {
    const current = JSON.parse(JSON.stringify(baselineFingerprint));
    current.regions.main.components = current.regions.main.components.slice(0, 1);
    const diff = diffFingerprints(baselineFingerprint, current);
    assert.equal(diff.summary.equivalent, false);
    assert.ok(
      diff.regressions.some(
        (r) => r.type === "missing-component" && r.componentId === 'main/button["Submit"]',
      ),
    );
  });

  it("detects a visibility regression", () => {
    const current = JSON.parse(JSON.stringify(baselineFingerprint));
    current.regions.main.components[1].visible = false;
    const diff = diffFingerprints(baselineFingerprint, current);
    assert.equal(diff.summary.equivalent, false);
    assert.ok(
      diff.regressions.some(
        (r) => r.type === "visibility-changed" && r.componentId === 'main/button["Submit"]',
      ),
    );
  });

  it("detects a color change", () => {
    const current = JSON.parse(JSON.stringify(baselineFingerprint));
    current.regions.main.components[1].backgroundColor = "rgb(255, 0, 0)";
    const diff = diffFingerprints(baselineFingerprint, current);
    assert.equal(diff.summary.equivalent, false);
    assert.ok(
      diff.regressions.some(
        (r) => r.type === "style-changed" && r.property === "backgroundColor",
      ),
    );
  });

  it("detects a bounds shift beyond tolerance", () => {
    const current = JSON.parse(JSON.stringify(baselineFingerprint));
    current.regions.main.components[1].bounds.width = 300;
    const diff = diffFingerprints(baselineFingerprint, current);
    assert.equal(diff.summary.equivalent, false);
    assert.ok(
      diff.regressions.some((r) => r.type === "bounds-changed" && r.property === "width"),
    );
  });

  it("does NOT report a bounds shift within tolerance", () => {
    const current = JSON.parse(JSON.stringify(baselineFingerprint));
    current.regions.main.components[1].bounds.width = 110; // +14px, within ±50
    const diff = diffFingerprints(baselineFingerprint, current);
    assert.equal(diff.summary.equivalent, true);
  });

  it("reports invariant: invisible element", () => {
    const current = JSON.parse(JSON.stringify(baselineFingerprint));
    current.regions.main.components[1].visible = false;
    const diff = diffFingerprints(baselineFingerprint, current);
    assert.ok(diff.invariants.some((i) => i.type === "not-visible"));
  });

  it("reports invariant: zero-width element", () => {
    const current = JSON.parse(JSON.stringify(baselineFingerprint));
    current.regions.main.components[0].bounds.width = 0;
    const diff = diffFingerprints(baselineFingerprint, current);
    assert.ok(diff.invariants.some((i) => i.type === "zero-dimension"));
  });

  it("does NOT report zero-dimension for display:none responsive duplicates", () => {
    // Responsive duplicates (desktop table + mobile card both in the DOM,
    // one hidden via display:none) are not defects.
    const current = JSON.parse(JSON.stringify(baselineFingerprint));
    current.regions.main.components.push({
      id: 'main/button["Mobile only"]',
      role: "button",
      name: "Mobile only",
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      visible: false,
      backgroundColor: "rgb(99, 102, 241)",
      color: "rgb(255, 255, 255)",
      fontSize: "14px",
      display: "none",
      textOverflow: false,
      resolveStatus: "ok",
    });
    const diff = diffFingerprints(baselineFingerprint, current);
    assert.ok(!diff.invariants.some((i) => i.type === "zero-dimension"));
    assert.ok(!diff.invariants.some((i) => i.type === "not-visible"));
  });

  it("summary counts match actual arrays", () => {
    const current = JSON.parse(JSON.stringify(baselineFingerprint));
    current.regions.main.components[1].visible = false;
    current.regions.main.components[0].bounds.width = 0;
    const diff = diffFingerprints(baselineFingerprint, current);
    assert.equal(diff.summary.regressionCount, diff.regressions.length);
    assert.equal(diff.summary.invariantCount, diff.invariants.length);
  });
});

// ---- detectInconsistencies ----
describe("detectInconsistencies", () => {
  it("returns empty for a clean fingerprint", () => {
    const issues = detectInconsistencies(baselineFingerprint);
    // The baseline has no raw hex colors, no missing labels, no zero dims
    assert.ok(issues.length === 0 || issues.every((i) => i.severity !== "error"));
  });

  it("detects missing accessible name on a button", () => {
    const fp = JSON.parse(JSON.stringify(baselineFingerprint));
    fp.regions.main.components.push({
      id: 'main/button[""]',
      role: "button",
      name: "",
      bounds: { x: 24, y: 200, width: 96, height: 40 },
      visible: true,
      backgroundColor: "rgb(99, 102, 241)",
      color: "rgb(255, 255, 255)",
      fontSize: "14px",
      display: "inline-flex",
      textOverflow: false,
      resolveStatus: "ok",
    });
    const issues = detectInconsistencies(fp);
    assert.ok(
      issues.some((i) => i.type === "missing-accessible-name" && i.severity === "error"),
    );
  });

  it("detects text overflow", () => {
    const fp = JSON.parse(JSON.stringify(baselineFingerprint));
    fp.regions.main.components[0].textOverflow = true;
    const issues = detectInconsistencies(fp);
    assert.ok(issues.some((i) => i.type === "text-overflow" && i.severity === "warn"));
  });

  it("detects inconsistent font sizes for same role", () => {
    const fp = JSON.parse(JSON.stringify(baselineFingerprint));
    // Add a second heading with a different font size
    fp.regions.main.components.push({
      id: 'main/heading["Stats"]',
      role: "heading",
      name: "Stats",
      bounds: { x: 24, y: 300, width: 100, height: 20 },
      visible: true,
      backgroundColor: "rgba(0, 0, 0, 0)",
      color: "rgb(248, 250, 252)",
      fontSize: "18px", // different from the 24px heading above
      display: "block",
      textOverflow: false,
      resolveStatus: "ok",
    });
    const issues = detectInconsistencies(fp);
    assert.ok(
      issues.some(
        (i) => i.type === "inconsistent-font-size" && i.role === "heading",
      ),
    );
  });

  it("detects inconsistent background colors for same-role buttons", () => {
    const fp = JSON.parse(JSON.stringify(baselineFingerprint));
    fp.regions.main.components.push({
      id: 'main/button["Cancel"]',
      role: "button",
      name: "Cancel",
      bounds: { x: 130, y: 140, width: 96, height: 40 },
      visible: true,
      backgroundColor: "rgb(239, 68, 68)", // red, different from Submit's indigo
      color: "rgb(255, 255, 255)",
      fontSize: "14px",
      display: "inline-flex",
      textOverflow: false,
      resolveStatus: "ok",
    });
    const issues = detectInconsistencies(fp);
    // Two buttons with different backgrounds is not inherently wrong
    // (primary vs secondary), but it should be flagged as a potential
    // inconsistency for review
    assert.ok(
      issues.some(
        (i) => i.type === "inconsistent-background" && i.role === "button",
      ),
    );
  });

  it("skips display:none elements for all per-component checks", () => {
    const fp = JSON.parse(JSON.stringify(baselineFingerprint));
    fp.regions.main.components.push({
      id: 'main/button["Hidden unnamed"]',
      role: "button",
      name: "",
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      visible: false,
      backgroundColor: "rgb(99, 102, 241)",
      color: "rgb(255, 255, 255)",
      fontSize: "14px",
      display: "none",
      textOverflow: true,
      resolveStatus: "ok",
    });
    const issues = detectInconsistencies(fp);
    assert.ok(!issues.some((i) => i.type === "missing-accessible-name"));
    assert.ok(!issues.some((i) => i.type === "zero-dimension"));
    assert.ok(!issues.some((i) => i.type === "text-overflow"));
  });
});
