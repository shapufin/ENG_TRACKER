import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import axios, { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import api, { isMaintenanceError, setAccessToken } from "./api";

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

const b64url = (value: object) =>
  btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** An access token inside the 120s proactive-refresh window. */
const expiringToken = () =>
  `${b64url({ alg: "HS256" })}.${b64url({ exp: Math.floor(Date.now() / 1000) + 60 })}.sig`;

const statusPayload = {
  active: true,
  title: "Upgrade window",
  message: "Back shortly.",
  started_at: null,
  ends_at: null,
  updated_at: null,
  site_name: "Engineering Tracker",
  logo_url: null,
};

const originalAdapter = api.defaults.adapter;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("user", JSON.stringify({ id: 7, username: "employee" }));
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  setAccessToken(null);
  vi.restoreAllMocks();
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

  it("does not let the proactive refresh abort the maintenance status call", async () => {
    // The status endpoint ignores auth server-side, so a near-expiry access
    // token must not trigger the proactive refresh for it: the refresh answers
    // 503 during maintenance and the request would be rejected before it was
    // ever sent — the maintenance screen would never appear.
    const adapter = vi.fn(
      async (config: InternalAxiosRequestConfig) =>
        ({
          data: statusPayload,
          status: 200,
          statusText: "OK",
          headers: {},
          config,
        }) as AxiosResponse
    );
    api.defaults.adapter = adapter as never;
    vi.spyOn(axios, "post").mockRejectedValue(maintenanceError());
    setAccessToken(expiringToken());

    const response = await api.get("/dashboard/maintenance/");

    expect(response.data.active).toBe(true);
    expect(adapter).toHaveBeenCalledTimes(1);
  });
});
