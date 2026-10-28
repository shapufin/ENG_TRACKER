import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { API_BASE_URL } from "./constants";
import { clearOfflineUserData } from "./offline/offlineQueue";
import { cacheResponse, getCachedResponse } from "./offline/offlineApiCache";

/**
 * Site-wide maintenance (503 + `code: "maintenance"` from the backend).
 *
 * This is NOT an auth failure: the user's tokens are still valid, the platform
 * is simply closed. Callers must not log out or fall back to cached data.
 */
export function isMaintenanceError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const response = error.response;
  return (
    response?.status === 503 &&
    (response.data as { code?: string } | undefined)?.code === "maintenance"
  );
}

export const MAINTENANCE_ACTIVE_EVENT = "maintenance:active";

const announceMaintenance = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(MAINTENANCE_ACTIVE_EVENT));
  }
};

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10_000,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

// JWT token utilities
function decodeToken(token: string): { exp: number } | null {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

function isTokenExpiringSoon(token: string, bufferSeconds: number = 120): boolean {
  const decoded = decodeToken(token);
  if (!decoded?.exp) return true;
  const expiryTime = decoded.exp * 1000;
  const currentTime = Date.now();
  return expiryTime - currentTime < bufferSeconds * 1000;
}

// Token refresh state
let refreshPromise: Promise<string> | null = null;
let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

function clearAuthAndRedirect() {
  clearOfflineUserData();
  localStorage.removeItem("user");
  accessToken = null;
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
}

/**
 * Refresh tokens rotate and the old one is blacklisted, so two tabs that refresh at the same
 * moment (a restored multi-tab session, two windows) race on the same cookie and the loser is
 * logged out. The Web Locks API serialises refreshes across tabs: the second tab waits, then
 * refreshes with the cookie the first tab just rotated. Browsers without it (and jsdom) fall
 * back to an unlocked call.
 */
export function withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  return locks ? locks.request("engtracker-token-refresh", task) : task();
}

async function performTokenRefresh(): Promise<string> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const { data } = await withRefreshLock(() =>
        axios.post(`${API_BASE_URL}/auth/token/refresh/`, {}, { withCredentials: true })
      );
      accessToken = data.access;
      return data.access;
    } catch (error) {
      // Maintenance is not an auth failure: keep the session so it resumes
      // when the platform reopens.
      if (isMaintenanceError(error)) {
        announceMaintenance();
      } else {
        clearAuthAndRedirect();
      }
      throw error;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// Request interceptor: attach access token and refresh proactively if expiring
api.interceptors.request.use(
  // fallow-ignore-next-line complexity
  async (config: InternalAxiosRequestConfig) => {
    let token = accessToken;

    // Proactive token refresh: if token is expiring soon, refresh before request
    if (token && isTokenExpiringSoon(token) && !config.url?.includes("/auth/token/refresh/")) {
      if (!refreshPromise) {
        try {
          token = await performTokenRefresh();
        } catch (error) {
          // Refresh failed. A maintenance 503 keeps the session (the gate
          // shows the maintenance screen); anything else is an auth failure.
          if (!isMaintenanceError(error)) {
            clearAuthAndRedirect();
            return Promise.reject(new Error("Token refresh failed"));
          }
          return Promise.reject(error);
        }
      } else {
        token = await performTokenRefresh();
      }
    }

    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: refresh token on 401 (reactive fallback)
api.interceptors.response.use(
  (response) =>
    response.config.method?.toLowerCase() === "get" ? cacheResponse(response) : response,
  // fallow-ignore-next-line complexity
  async (error: AxiosError) => {
    // Maintenance must never be answered from the offline cache: the cached
    // body is stale data from before the platform closed, and swallowing the
    // 503 would keep the maintenance screen from appearing.
    if (isMaintenanceError(error)) {
      announceMaintenance();
      return Promise.reject(error);
    }
    const isGet = error.config?.method?.toLowerCase() === "get";
    const isNetworkOrServerDown =
      !error.response || [502, 503, 504].includes(error.response.status);
    if (isGet && isNetworkOrServerDown && error.config) {
      const cached = getCachedResponse(error.config);
      if (cached) return cached;
    }
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;

      // Skip refresh for auth endpoints to prevent infinite loops
      if (originalRequest.url?.includes("/auth/token/") || window.location.pathname === "/login") {
        clearAuthAndRedirect();
        return Promise.reject(error);
      }

      if (!refreshPromise) {
        try {
          const newToken = await performTokenRefresh();
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
          }
          return api(originalRequest);
        } catch (refreshError) {
          if (!isMaintenanceError(refreshError)) clearAuthAndRedirect();
          return Promise.reject(refreshError);
        }
      }

      try {
        const token = await performTokenRefresh();
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${token}`;
        }
        return api(originalRequest);
      } catch (refreshError) {
        if (!isMaintenanceError(refreshError)) clearAuthAndRedirect();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
