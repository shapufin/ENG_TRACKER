import { describe, it, expect, beforeEach, vi } from "vitest";
import { pushRecent, readRecents } from "./paletteRecents";

beforeEach(() => localStorage.clear());

describe("paletteRecents", () => {
  it("returns nothing when empty", () => {
    expect(readRecents(1)).toEqual([]);
  });

  it("puts the newest first and dedupes", () => {
    pushRecent(1, "/a");
    pushRecent(1, "/b");
    expect(pushRecent(1, "/a")).toEqual(["/a", "/b"]);
    expect(readRecents(1)).toEqual(["/a", "/b"]);
  });

  it("caps at five", () => {
    for (const p of ["/1", "/2", "/3", "/4", "/5", "/6"]) pushRecent(1, p);
    expect(readRecents(1)).toEqual(["/6", "/5", "/4", "/3", "/2"]);
  });

  it("keeps users separate", () => {
    pushRecent(1, "/a");
    pushRecent(2, "/b");
    expect(readRecents(1)).toEqual(["/a"]);
    expect(readRecents(2)).toEqual(["/b"]);
  });

  it("never writes or reads without a user id", () => {
    expect(pushRecent(undefined, "/a")).toEqual([]);
    expect(readRecents(undefined)).toEqual([]);
    expect(localStorage.length).toBe(0);
  });

  it("survives localStorage throwing", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readRecents(1)).toEqual([]);
    expect(() => pushRecent(1, "/a")).not.toThrow();
    get.mockRestore();
    set.mockRestore();
  });

  it("ignores corrupt stored data", () => {
    localStorage.setItem("admin.palette.recents.1", "{not json");
    expect(readRecents(1)).toEqual([]);
    localStorage.setItem("admin.palette.recents.1", JSON.stringify([1, "/ok", null]));
    expect(readRecents(1)).toEqual(["/ok"]);
  });
});
