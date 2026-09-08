/**
 * CR-only admin (non-staff) is limited to Users and Control Room admin area.
 */
export const isAllowedCRAdminPath = (path: string): boolean =>
  path === "/admin/users" ||
  path.startsWith("/admin/users/") ||
  path.startsWith("/admin/control-room");
