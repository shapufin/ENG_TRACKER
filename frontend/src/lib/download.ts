/**
 * Shared utilities for downloading streaming API responses as files.
 *
 * Used by the streaming CSV export endpoints (overtime/standby/audit-logs)
 * to trigger browser downloads from blob responses without duplicating the
 * createObjectURL → anchor click → revokeObjectURL pattern at every call site.
 */

/**
 * Trigger a browser download from an Axios blob response.
 *
 * Creates a temporary object URL, appends an invisible anchor, clicks it,
 * removes the anchor, and **revokes the object URL** to release memory.
 * Callers that forget to revoke leak memory — this utility makes that
 * impossible.
 *
 * @param data - The `response.data` from an Axios request with
 *   `responseType: "blob"`.
 * @param filename - The download filename (no date suffix is added).
 */
export const downloadBlobResponse = (data: BlobPart, filename: string): void => {
  const url = window.URL.createObjectURL(new Blob([data]));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

/**
 * Paginated fetch loop for DRF paginated list endpoints.
 *
 * Follows `next` links by incrementing `page` until the response has no
 * `next` or the safety valve is hit. Uses a configurable page size to
 * balance request count vs. memory per request.
 *
 * @param getUrl - A function returning the Axios request config (URL + params).
 *   The `page` param is injected on each iteration.
 * @param pageSize - Number of rows per page (default 500).
 * @param maxPages - Safety valve to prevent infinite loops if the API
 *   returns a self-referential `next` link (default 100 = 50k rows at
 *   page_size=500).
 * @returns All accumulated `results` arrays concatenated.
 */
export const paginatedFetchAll = async <T>(
  getUrl: (params: { page: number; page_size: number }) => Promise<{
    data: { results: T[]; next: string | null };
  }>,
  pageSize = 500,
  maxPages = 100
): Promise<T[]> => {
  const results: T[] = [];
  let page = 1;
  while (page <= maxPages) {
    const { data } = await getUrl({ page, page_size: pageSize });
    results.push(...data.results);
    if (!data.next) break;
    page += 1;
  }
  return results;
};
