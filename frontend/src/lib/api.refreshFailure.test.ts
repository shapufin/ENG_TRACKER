import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import axios, { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import api, { getFreshAccessToken, isAuthRejection, setAccessToken } from "./api";
import { enqueue, getQueueCount } from "./offline/offlineQueue";

// Audit 2026-11-16 H1: only a 401/403 from the refresh endpoint is an auth failure.
// A network blip, a timeout, a 5xx or a 429 must keep the session and the offline queue.

const b64url = (value: object) =>
  btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const expiringToken = () =>
  `${b64url({ alg: "HS256" })}.${b64url({ exp: Math.floor(Date.now() / 1000) + 60 })}.sig`;

const refreshConfig = { method: "post", url: "/auth/token/refresh/" } as InternalAxiosRequestConfig;

const withStatus = (status: number, data: unknown = {}) =>
  new AxiosError("refresh failed", "ERR_BAD_RESPONSE", refreshConfig, null, {
    status,
    statusText: "x",
    data,
    headers: {},
    config: refreshConfig,
  } as AxiosResponse);

const networkError = () => new AxiosError("Network Error", "ERR_NETWORK", refreshConfig);
const timeoutError = () => new AxiosError("timeout", "ECONNABORTED", refreshConfig);

const originalAdapter = api.defaults.adapter;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("user", JSON.stringify({ id: 7, username: "employee" }));
  enqueue({
    url: "/plugins/overtime/logs/",
    method: "POST",
    body: { hours: 2 },
    headers: {},
    description: "Overtime",
  });
  api.defaults.adapter = async (config: InternalAxiosRequestConfig) =>
    ({ data: {}, status: 200, statusText: "OK", headers: {}, config }) as AxiosResponse;
  setAccessToken(expiringToken());
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  setAccessToken(null);
  vi.restoreAllMocks();
});

describe("a refresh that fails for a reason other than the credentials", () => {
  const cases: Array<[string, () => AxiosError]> = [
    ["a network error", networkError],
    ["a timeout", timeoutError],
    ["a 502", () => withStatus(502)],
    ["a 503 that is not maintenance", () => withStatus(503, { detail: "busy" })],
    ["a 500", () => withStatus(500)],
    ["a 429", () => withStatus(429)],
  ];

  it.each(cases)("keeps the session and the offline queue after %s", async (_name, make) => {
    vi.spyOn(axios, "post").mockRejectedValue(make());

    await expect(api.get("/users/users/me/")).rejects.toBeTruthy();

    expect(localStorage.getItem("user")).toContain("employee");
    expect(getQueueCount()).toBe(1);
  });

  it("does not delete the queue when the replay's token refresh fails", async () => {
    vi.spyOn(axios, "post").mockRejectedValue(networkError());

    expect(await getFreshAccessToken()).toBeNull();

    expect(getQueueCount()).toBe(1);
    expect(localStorage.getItem("user")).toContain("employee");
  });
});

describe("a refresh the server refuses", () => {
  it.each([401, 403])("a %i clears the session and the queue", async (status) => {
    vi.spyOn(axios, "post").mockRejectedValue(withStatus(status));

    await expect(api.get("/users/users/me/")).rejects.toBeTruthy();

    expect(localStorage.getItem("user")).toBeNull();
    expect(getQueueCount(("7"))).toBe(0);
  });
});

describe("the refresh call", () => {
  it("has a timeout, so one hung refresh cannot hold the cross-tab lock forever", async () => {
    const post = vi
      .spyOn(axios, "post")
      .mockResolvedValue({ data: { access: expiringToken().replace("sig", "ok") } });

    await api.get("/users/users/me/");

    expect(post.mock.calls[0][2]).toMatchObject({ timeout: 10_000, withCredentials: true });
  });
});

describe("isAuthRejection", () => {
  it("is true only for a 401 or 403 response", () => {
    expect(isAuthRejection(withStatus(401))).toBe(true);
    expect(isAuthRejection(withStatus(403))).toBe(true);
    expect(isAuthRejection(withStatus(500))).toBe(false);
    expect(isAuthRejection(networkError())).toBe(false);
    expect(isAuthRejection(new Error("x"))).toBe(false);
  });

  it("treats a 400 from the refresh endpoint (cookie missing or malformed) as a refusal", () => {
    expect(isAuthRejection(withStatus(400))).toBe(true);
  });

  it("does not treat a 400 from any other endpoint as a refusal", () => {
    const otherConfig = { method: "get", url: "/users/users/me/" } as InternalAxiosRequestConfig;
    const other = new AxiosError("bad", "ERR_BAD_REQUEST", otherConfig, null, {
      status: 400,
      statusText: "x",
      data: {},
      headers: {},
      config: otherConfig,
    } as AxiosResponse);
    expect(isAuthRejection(other)).toBe(false);
  });
});

describe("a refresh answered with 400", () => {
  it("clears the session and the queue", async () => {
    vi.spyOn(axios, "post").mockRejectedValue(withStatus(400));

    await expect(api.get("/users/users/me/")).rejects.toBeTruthy();

    expect(localStorage.getItem("user")).toBeNull();
    expect(getQueueCount("7")).toBe(0);
  });
});
