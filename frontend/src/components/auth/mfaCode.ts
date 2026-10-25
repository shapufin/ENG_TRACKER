/** Keeps only what the code can contain, so a pasted "123 456" or "abcd-efgh" is accepted as typed. */
export const cleanMfaCode = (raw: string, kind: "totp" | "backup") =>
  kind === "totp"
    ? raw.replace(/\D/g, "").slice(0, 6)
    : raw
        .toUpperCase()
        .replace(/[^A-Z0-9-]/g, "")
        .slice(0, 14);
