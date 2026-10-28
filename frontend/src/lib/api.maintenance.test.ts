import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import api, { isMaintenanceError } from "./api";
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";

const maintenanceError = () => {
  const config = { method: "get", url: "/users/users/me/" } as InternalAxiosRequestConfig;
  const response = {
    status: 503,
    statusText: "Service Unavailable",
    data: { detail: "closed", code: "maintenance" },
    headers: {},
    config,
  } as AxiosResponse;
  return new AxiosError("closed", "ERR_BAD_RESPONSE", config, null, response);
};

const originalAdapter = api.defaults.adapter;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("user", JSON.stringify({ id: 7, username: "employee" }));
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

describe("isMaintenanceError", () => {
  it("recognises the backend's 503 maintenance contract", () => {
    expect(isMaintenanceError(maintenanceError())).toBe(true);
  });

  it("ignores a plain 503", () => {
    const error = maintenanceError();
    error.response!.data = { detail: "unavailable" };
    expect(isMaintenanceError(error)).toBe(false);
  });

  it("ignores non-axios errors", () => {
    expect(isMaintenanceError(new Error("boom"))).toBe(false);
  });
});

describe("api interceptor during maintenance", () => {
  it("rejects a 503 instead of serving it from the offline cache", async () => {
    api.defaults.adapter = async () => Promise.reject(maintenanceError());
    const onMaintenance = vi.fn();
    window.addEventListener("maintenance:active", onMaintenance);

    await expect(api.get("/users/users/me/")).rejects.toBeTruthy();

    expect(onMaintenance).toHaveBeenCalledTimes(1);
    window.removeEventListener("maintenance:active", onMaintenance);
  });

  it("keeps the stored session (maintenance is not an auth failure)", async () => {
    api.defaults.adapter = async () => Promise.reject(maintenanceError());

    await expect(api.get("/users/users/me/")).rejects.toBeTruthy();

    expect(localStorage.getItem("user")).toContain("employee");
  });
});
