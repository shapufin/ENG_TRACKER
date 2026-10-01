const firstString = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim()) return value;
  if (Array.isArray(value)) return firstString(value[0]);
  return null;
};

/** Surface the server's own message (DRF `error`, `detail`, or the first field error). */
export const errorMessage = (error: unknown, fallback = "Something went wrong. Please try again."): string => {
  const data = (error as { response?: { data?: unknown } } | null)?.response?.data;
  if (data && typeof data === "object" && !(data instanceof Blob)) {
    const body = data as Record<string, unknown>;
    for (const value of [body.error, body.detail, ...Object.values(body)]) {
      const message = firstString(value);
      if (message) return message;
    }
  }
  return fallback;
};
