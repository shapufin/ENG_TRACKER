import type { User } from "@/types";

/**
 * Derives the full name of a user from their profile data.
 * Fallback to username if names are missing.
 */
export const deriveFullName = (user: User): string => {
  if (user.full_name?.trim()) return user.full_name;
  const parts = [user.first_name, user.last_name]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part && part.length));
  const joined = parts.join(" ").trim();
  return joined || user.username;
};
