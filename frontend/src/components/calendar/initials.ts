export const getInitials = (value?: string) => {
  if (!value) return "--";
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "--";
  const parts = normalized.split(" ").filter(Boolean);
  if (parts.length === 1) {
    const letters = Array.from(parts[0]);
    const first = letters[0] ?? "";
    const second = letters[1] ?? "";
    const combined = `${first}${second}`.toUpperCase();
    return combined || "--";
  }
  const firstLetters = Array.from(parts[0]);
  const lastLetters = Array.from(parts[parts.length - 1]);
  const initials = `${firstLetters[0] ?? ""}${lastLetters[0] ?? ""}`.toUpperCase();
  return initials || "--";
};
