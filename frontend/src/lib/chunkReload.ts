// A tab opened before a deploy asks for lazy chunks whose hashed files are gone.
// Reload once to pick up the new index.html; the guard stops a reload loop when
// the chunk is genuinely missing.
export const RELOAD_FLAG = "chunk-reload-at";
const GUARD_MS = 30_000;

export function handlePreloadError(event: Event, reload: () => void = () => window.location.reload()) {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_FLAG) ?? 0);
    if (Date.now() - last < GUARD_MS) return;
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
  } catch {
    return;
  }
  event.preventDefault();
  reload();
}
