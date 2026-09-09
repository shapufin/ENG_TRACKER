// Read VITE_API_URL (set by the Docker build arg of the same name).
// Falls back to the dev server URL when the env var is absent (local dev,
// Vitest jsdom). In production Docker, VITE_API_URL=/api so the browser
// makes same-origin requests that nginx proxies to the backend.
export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";
