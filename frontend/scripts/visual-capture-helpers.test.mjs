// Smallest capture-helper test: pure heading-match contract only.
// Run: node --test scripts/visual-capture-helpers.test.mjs (from frontend/).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { headingMatches } from "./visual-capture-helpers.mjs";

describe("headingMatches", () => {
  it("string expectation uses substring match", () => {
    assert.equal(headingMatches("Overtime", "Overtime"), true);
    assert.equal(headingMatches("Overtime", "Manage Overtime Logs"), true);
    assert.equal(headingMatches("Overtime", "Standby"), false);
  });

  it("RegExp expectation is tested, not stringified", () => {
    assert.equal(headingMatches(/Dashboard/, "Team Leader Dashboard"), true);
    assert.equal(headingMatches(/^Payroll Run \d{4}-\d{2}/, "Payroll Run 2026-08"), true);
    assert.equal(headingMatches(/^Payroll Run \d{4}-\d{2}/, "Payroll Runs"), false);
    assert.equal(headingMatches(/Schedule List|Filters|Members/, "Filters | Members"), true);
  });

  it("null/undefined headings never match", () => {
    assert.equal(headingMatches("Dashboard", null), false);
    assert.equal(headingMatches(/Dashboard/, undefined), false);
  });
});
