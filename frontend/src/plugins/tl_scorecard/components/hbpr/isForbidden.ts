export const isForbidden = (error: unknown): boolean =>
  (error as { response?: { status?: number } } | null)?.response?.status === 403;
