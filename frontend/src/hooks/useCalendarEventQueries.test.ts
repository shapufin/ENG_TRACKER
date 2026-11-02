import { describe, expect, it } from "vitest";
import { isTruncatedPage } from "./useCalendarEventQueries";

describe("isTruncatedPage", () => {
  it("is true when the server has more rows than it returned", () => {
    expect(isTruncatedPage({ count: 10050, results: new Array(10000).fill(0) })).toBe(true);
  });

  it("is false for a complete page, an empty page or no data", () => {
    expect(isTruncatedPage({ count: 3, results: [1, 2, 3] })).toBe(false);
    expect(isTruncatedPage({ count: 0, results: [] })).toBe(false);
    expect(isTruncatedPage(undefined)).toBe(false);
    expect(isTruncatedPage({ results: [1] })).toBe(false);
  });
});
