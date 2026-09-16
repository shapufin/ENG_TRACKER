import { describe, it, expect, beforeEach } from "vitest";
import { getLastUploadSelection, saveLastUploadSelection } from "./lastUploadSelection";

describe("lastUploadSelection", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns null when nothing was ever saved", () => {
    expect(getLastUploadSelection(1, new Set([1]), new Set([1]))).toBeNull();
  });

  it("round-trips a saved selection when everything is still valid", () => {
    saveLastUploadSelection(1, { profileId: 5, clientIds: [10, 11] });
    const result = getLastUploadSelection(1, new Set([5]), new Set([10, 11]));
    expect(result).toEqual({ profileId: 5, clientIds: [10, 11] });
  });

  it("drops a profile that is no longer valid, but keeps valid clients", () => {
    saveLastUploadSelection(1, { profileId: 5, clientIds: [10, 11] });
    const result = getLastUploadSelection(1, new Set([99]), new Set([10, 11]));
    expect(result).toEqual({ profileId: null, clientIds: [10, 11] });
  });

  it("drops clients that are no longer valid, but keeps a valid profile", () => {
    saveLastUploadSelection(1, { profileId: 5, clientIds: [10, 11] });
    const result = getLastUploadSelection(1, new Set([5]), new Set([10]));
    expect(result).toEqual({ profileId: 5, clientIds: [10] });
  });

  it("returns null when nothing about the saved selection is still valid", () => {
    saveLastUploadSelection(1, { profileId: 5, clientIds: [10] });
    const result = getLastUploadSelection(1, new Set([99]), new Set([100]));
    expect(result).toBeNull();
  });

  it("scopes storage per user — one user's selection never leaks to another", () => {
    saveLastUploadSelection(1, { profileId: 5, clientIds: [10] });
    expect(getLastUploadSelection(2, new Set([5]), new Set([10]))).toBeNull();
  });

  it("tolerates corrupted storage instead of throwing", () => {
    window.localStorage.setItem("ticket_kpi_last_upload_selection:1", "{not json");
    expect(getLastUploadSelection(1, new Set([1]), new Set([1]))).toBeNull();
  });
});
