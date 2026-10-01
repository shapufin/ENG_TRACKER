import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Tailwind 4 inlines CSS `@import`s without letting Vite rewrite their url(); the font files
// were never emitted and every font 404ed in production. Fonts must be imported from JS.
describe("font imports", () => {
  const read = (file: string) => readFileSync(resolve(__dirname, "..", file), "utf-8");

  it("index.css does not @import fontsource CSS", () => {
    expect(read("index.css")).not.toMatch(/@import\s+["']@fontsource/);
  });

  it("main.tsx imports the fontsource CSS", () => {
    expect(read("main.tsx")).toMatch(/import\s+["']@fontsource-variable\/plus-jakarta-sans["']/);
    expect(read("main.tsx")).toMatch(/import\s+["']@fontsource\/jetbrains-mono\/400\.css["']/);
  });
});
