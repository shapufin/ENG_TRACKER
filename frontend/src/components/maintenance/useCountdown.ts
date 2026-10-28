import { useEffect, useState } from "react";

const pad = (n: number) => String(n).padStart(2, "0");

export interface Countdown {
  /** False when there is no expected end (open-ended window). */
  hasDeadline: boolean;
  /** "2d 04h 12m" above a day, "04:12:33" below it. */
  label: string;
  /** The deadline passed while the user was on the page. */
  expired: boolean;
  /** Absolute deadline, formatted for the browser's zone. */
  deadlineLabel: string | null;
}

const formatDeadline = (date: Date) =>
  date.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Ticks once a second only while a deadline exists. */
export const useCountdown = (endsAt: string | null): Countdown => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!endsAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [endsAt]);

  if (!endsAt) {
    return { hasDeadline: false, label: "", expired: false, deadlineLabel: null };
  }

  const target = new Date(endsAt).getTime();
  if (Number.isNaN(target)) {
    return { hasDeadline: false, label: "", expired: false, deadlineLabel: null };
  }

  const deadlineLabel = formatDeadline(new Date(target));
  const remaining = Math.max(0, target - now);
  if (remaining === 0) {
    return { hasDeadline: true, label: "", expired: true, deadlineLabel };
  }

  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    hasDeadline: true,
    label: days > 0 ? `${days}d ${pad(hours)}h ${pad(minutes)}m` : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`,
    expired: false,
    deadlineLabel,
  };
};
