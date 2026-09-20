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
    // White on #DC2626 measures 4.83:1 (AA). Previous pin 0 84% 48% was
    // replaced by the white-theme accent refinement (2026-09-20).
    expect(lightBlock).toContain("--destructive: 0 72% 51%");
  });

  it("matches the white-theme accent palette (2026-09-20 refinement)", () => {
    // Primary CTA #2563EB: white text measures 5.17:1 (AA).
    expect(lightBlock).toContain("--primary: 221 83% 53%");
    expect(lightBlock).toContain("--primary-hover: 224 76% 48%");
    // Solid info is sky-700 #0369A1 (5.93:1), NOT sky-600 #0284C7 (4.10:1,
    // fails AA for the white-text today badge). Tinted info surfaces still
    // use the sky-600 family with dark sky text.
    expect(lightBlock).toContain("--info: 201 96% 32%");
    expect(lightBlock).toContain("--tone-info-text: 201 90% 27%");
    // Crisp slate dividers #E2E8F0. --line-subtle is deliberately a step
    // darker (≈#E7E9EE, not #F1F5F9): the same token draws hairlines on
    // white cards AND on the 96%-tinted app background (PageShell header),
    // where #F1F5F9 vanishes. Track backgrounds on sunken surfaces read as
    // a groove either way; divider function wins over track framing.
    expect(lightBlock).toContain("--border: 214 32% 91%");
    expect(lightBlock).toContain("--line-subtle: 220 18% 92%");
  });

  it("keeps tone-danger in the red family (2026-09-20 refinement)", () => {
    // Previous text 347 77% 41% was rose; red-700 0 74% 42% matches the new
    // destructive base. Info surface opacity 0.12 (not the usual 0.15)
    // blends sky-600 to ≈ sky-50 #F0F9FF over white — the mockup banner bg.
    expect(lightBlock).toContain("--tone-danger-text: 0 74% 42%");
    expect(lightBlock).toContain("--tone-info-surface: 199 98% 39% / 0.12");
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

  it("proves the AA claims by computing contrast (not just pinning strings)", () => {
    const toRgb = (
      h: number,
      s: number,
      l: number,
    ): [number, number, number] => {
      const hh = h / 360;
      const ss = s / 100;
      const ll = l / 100;
      const c = (1 - Math.abs(2 * ll - 1)) * ss;
      const x = c * (1 - Math.abs((((hh * 360) / 60) % 2) - 1));
      const m = ll - c / 2;
      const sector = Math.floor(hh * 6);
      const [r, g, b] =
        sector === 0
          ? [c, x, 0]
          : sector === 1
            ? [x, c, 0]
            : sector === 2
              ? [0, c, x]
              : sector === 3
                ? [0, x, c]
                : sector === 4
                  ? [x, 0, c]
                  : [c, 0, x];
      return [r + m, g + m, b + m];
    };
    const lin = (v: number) =>
      v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    const luminance = (h: number, s: number, l: number) => {
      const [r, g, b] = toRgb(h, s, l).map(lin);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (l1: number, l2: number) =>
      (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const white = luminance(0, 0, 100);
    // Solid-button pairs: white text on primary / destructive / info.
    expect(ratio(white, luminance(221, 83, 53))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(white, luminance(0, 72, 51))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(white, luminance(201, 96, 32))).toBeGreaterThanOrEqual(4.5);
    // Tinted info surface: 12% sky-600 over a white card, dark sky text.
    const [sr, sg, sb] = toRgb(199, 98, 39);
    const surface = [0.12 * sr + 0.88, 0.12 * sg + 0.88, 0.12 * sb + 0.88].map(
      lin,
    );
    const surfaceLum =
      0.2126 * surface[0] + 0.7152 * surface[1] + 0.0722 * surface[2];
    expect(ratio(luminance(201, 90, 27), surfaceLum)).toBeGreaterThanOrEqual(
      4.5,
    );
  });
});
