import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Vitest stubs CSS imports, so read the file itself (tests run from frontend/).
const css = readFileSync(
  resolve(process.cwd(), "src/pages/admin/components/dashboard-grid/dashboardGrid.css"),
  "utf8"
);

const forced = css.slice(css.indexOf("@media (forced-colors: active)"));

describe("dashboardGrid.css forced-colors block", () => {
  it("gives edit-mode frames, the placeholder and resize handles a system-color outline", () => {
    expect(css).toContain("@media (forced-colors: active)");
    expect(forced).toMatch(/\[data-edit-frame\]\s*\{[^}]*outline:\s*2px solid CanvasText/);
    expect(forced).toMatch(/react-grid-placeholder\s*\{[^}]*outline:[^;]*Highlight/);
    expect(forced).toMatch(/react-resizable-handle::after\s*\{[^}]*CanvasText/);
  });
});
