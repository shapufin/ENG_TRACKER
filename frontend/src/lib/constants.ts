// Read VITE_API_URL (set by the Docker build arg of the same name).
// Falls back to the dev server URL when the env var is absent (local dev,
// Vitest jsdom). In production Docker, VITE_API_URL=/api so the browser
// makes same-origin requests that nginx proxies to the backend.
//
// The fallback host matches whatever hostname the page itself was loaded
// from (localhost or 127.0.0.1), not a hardcoded one. The backend's JWT
// refresh cookie is `SameSite=Lax`, so if the frontend is opened at
// localhost:5173 while requests hardcode 127.0.0.1:8000, the browser
// treats it as cross-site and silently drops the cookie on the way back —
// refresh then 400s and the session appears to log itself out on reload.
export const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  `http://${typeof window !== "undefined" ? window.location.hostname : "localhost"}:8000/api`;
