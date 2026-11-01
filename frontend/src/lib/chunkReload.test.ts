import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handlePreloadError, RELOAD_FLAG } from "./chunkReload";

describe("handlePreloadError", () => {
  const reload = vi.fn();
  const event = () => {
    const e = new Event("vite:preloadError", { cancelable: true });
    return e;
  };

  beforeEach(() => {
    sessionStorage.clear();
    reload.mockClear();
  });
  afterEach(() => sessionStorage.clear());

  it("reloads once and prevents the error from surfacing", () => {
    const e = event();
    handlePreloadError(e, reload);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);
    expect(sessionStorage.getItem(RELOAD_FLAG)).not.toBeNull();
  });

  it("does not reload again right after a reload (no loop)", () => {
    handlePreloadError(event(), reload);
    const second = event();
    handlePreloadError(second, reload);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(second.defaultPrevented).toBe(false);
  });

  it("reloads again once the guard window has passed", () => {
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now() - 60_000));
    handlePreloadError(event(), reload);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
