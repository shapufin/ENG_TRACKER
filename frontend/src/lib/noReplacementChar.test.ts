import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const REPLACEMENT = String.fromCodePoint(0xfffd);

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });

describe("source encoding", () => {
  it("has no U+FFFD replacement character in any .ts/.tsx under src", () => {
    const offenders = walk(join(process.cwd(), "src")).filter((f) =>
      readFileSync(f, "utf8").includes(REPLACEMENT)
    );
    expect(offenders).toEqual([]);
  });
});
