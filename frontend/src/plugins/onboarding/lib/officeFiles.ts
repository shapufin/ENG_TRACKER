const EDITABLE_OFFICE_EXTENSIONS = ["doc", "docx", "xls", "xlsx", "ppt", "pptx"];

export const isEditableOffice = (name: string): boolean => {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return EDITABLE_OFFICE_EXTENSIONS.includes(ext);
};
