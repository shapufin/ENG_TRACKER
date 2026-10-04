/**
 * Deterministic avatar color seed from a display name, so the same person
 * keeps the same `UserAvatar` palette entry on every surface.
 */
export const avatarSeed = (name: string): number =>
  [...name].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
