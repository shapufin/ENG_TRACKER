/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

const darkStart = css.indexOf(".dark");
if (darkStart === -1) throw new Error("index.css is missing the .dark block");
const lightBlock = css.slice(0, darkStart);
// NOTE: darkBlock terminates at the FIRST `}` after `.dark`. Keep the `.dark`
// token list flat — a nested rule, or a `}` inside a comment, truncates this
// slice and cascades misleading failures across every assertion below.
const darkBlock = css.slice(
  darkStart,
  css.indexOf("}", darkStart) === -1 ? css.length : css.indexOf("}", darkStart)
);

/**
 * Pins the Obsidian-Slate token remap (plan-obsidian-slate-theme-refactor-
 * 2026-09-02). These values must stay in sync with the mockup palette in
 * `Time Tracker UI Project/assets/tokens.css`.
 */
describe("theme tokens (Obsidian-Slate remap)", () => {
  it("uses the mockup dark surface ramp", () => {
    expect(darkBlock).toContain("--card: 221 38% 8%");
    expect(darkBlock).toContain("--popover: 221 37% 9.5%");
    expect(darkBlock).toContain("--card-raised: 221 33% 11.5%");
    expect(darkBlock).toContain("--surface-sunken: 221 40% 5.5%");
    expect(darkBlock).toContain("--secondary: 221 33% 15.5%");
    expect(darkBlock).toContain("--muted: 221 33% 14.5%");
  });

  it("keeps the already-exact canvas/border/primary values", () => {
    expect(darkBlock).toContain("--background: 223 33% 4%");
    expect(darkBlock).toContain("--border: 219 28% 19%");
    expect(darkBlock).toContain("--line-subtle: 220 28% 15%");
    expect(darkBlock).toContain("--primary: 262 83% 58%");
  });

  it("keeps dark primary-foreground light enough for WCAG AA on primary", () => {
    // Regression guard: near-black foreground on the violet primary measured
    // 3.41:1 (fails AA 4.5:1) — the foreground must be light (≥ 4.5:1).
    expect(darkBlock).toContain("--primary-foreground: 0 0% 100%");
    expect(darkBlock).not.toContain("--primary-foreground: 220 20% 6%");
  });

  it("defines the new input/focus tokens in both modes", () => {
    expect(darkBlock).toContain("--input-bg: 220 40% 6%");
    expect(darkBlock).toContain("--border-focus: 219 45% 34%");
    expect(darkBlock).toContain("--focus: 217 91% 60%");
    expect(lightBlock).toContain("--input-bg: 0 0% 100%");
    expect(lightBlock).toContain("--border-focus: 221 70% 65%");
    expect(lightBlock).toContain("--focus: 221 83% 53%");
  });

  it("removes the pre-remap surface values", () => {
    expect(css).not.toContain("--card: 222 33% 8%");
    expect(css).not.toContain("--card-raised: 222 31% 11%");
    expect(css).not.toContain("--surface-sunken: 222 39% 6%");
    expect(css).not.toContain("--secondary: 222 29% 16%");
    expect(css).not.toContain("--accent: 222 29% 16%");
  });

  it("preserves the WCAG-pinned values", () => {
    expect(darkBlock).toContain("--muted-foreground: 220 10% 63%");
    expect(lightBlock).toContain("--destructive: 0 84% 48%");
  });

  it("defines the surface radius scale in both modes", () => {
    for (const block of [lightBlock, darkBlock]) {
      expect(block).toContain("--radius-control: 0.75rem");
      expect(block).toContain("--radius-surface: 1rem");
      expect(block).toContain("--radius-dialog: 1.5rem");
    }
  });

  it("defines the overlay token in both modes", () => {
    expect(lightBlock).toContain("--overlay: 222 47% 11% / 0.60");
    expect(darkBlock).toContain("--overlay: 0 0% 0% / 0.68");
  });

  it("defines the dark status ramp per the sharper-contrast refinement", () => {
    expect(darkBlock).toContain("--success: 158 64% 52%");
    expect(darkBlock).toContain("--warning: 43 96% 56%");
    expect(darkBlock).toContain("--destructive: 0 78% 52%");
    expect(darkBlock).toContain("--info: 213 94% 68%");
  });

  it("keeps --radius unchanged (drives rounded-lg/md/sm app-wide)", () => {
    expect(lightBlock).toContain("--radius: 0.625rem");
  });
});
