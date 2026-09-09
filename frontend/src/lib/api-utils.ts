import type { PaginatedResponse } from "@/types";

export const normalizeList = <T>(data: T[] | PaginatedResponse<T>): T[] =>
  Array.isArray(data) ? data : (data.results ?? []);

export const extractResponseResults = <T>(response: { data: T[] | PaginatedResponse<T> }): T[] =>
  normalizeList(response.data);
