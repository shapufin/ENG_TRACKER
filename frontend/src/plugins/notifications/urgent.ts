import type { NotificationRecord } from "./service";

/** The server marks an urgent month-closure reminder with this dedupe-key prefix. */
const URGENT_DEDUPE_PREFIX = "tl-urgent-close:";

export const isUrgentNotification = (notification: NotificationRecord): boolean =>
  notification.dedupe_key?.startsWith(URGENT_DEDUPE_PREFIX) === true;
