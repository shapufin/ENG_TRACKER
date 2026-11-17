/**
 * The two full-page browser navigations the app needs. They live here so tests can replace
 * them with `vi.mock("@/lib/pageNavigation")` instead of redefining `window.location`, which a
 * VM-isolated test context (vitest `pool: "vmThreads"`) does not allow.
 */
export const reloadPage = (): void => window.location.reload();

export const goToPath = (path: string): void => {
  window.location.href = path;
};
