const EDITABLE_OFFICE_EXTENSIONS = ["doc", "docx", "xls", "xlsx", "ppt", "pptx"];

export const isEditableOffice = (name: string): boolean => {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return EDITABLE_OFFICE_EXTENSIONS.includes(ext);
};

/** Only PDFs render natively in a browser tab. Word/Excel/images have no
 * built-in in-browser viewer here yet — download remains the only option
 * for those until an office-document viewer is wired up. */
export const isPreviewable = (name: string): boolean => name.toLowerCase().endsWith(".pdf");
