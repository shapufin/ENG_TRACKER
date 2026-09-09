import DOMPurify from "dompurify";

export const sanitizeHtml = (dirty: string | undefined | null): string => {
  if (!dirty) return "";
  return DOMPurify.sanitize(dirty, {
    USE_PROFILES: { html: true },
    RETURN_TRUSTED_TYPE: false,
    FORBID_ATTR: ["style"],
  }) as string;
};
