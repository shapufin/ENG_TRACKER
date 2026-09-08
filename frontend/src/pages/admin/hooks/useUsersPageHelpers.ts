import type { UserProfile } from "@/types";

type TLFilter = "all" | "italian_tl" | "albanian_tl" | "no_tl";

export const filterUsersByTL = (rows: UserProfile[], tlFilter: TLFilter) => {
  if (tlFilter === "italian_tl") return rows.filter((r) => r.italian_tl);
  if (tlFilter === "albanian_tl") return rows.filter((r) => r.albanian_tl);
  if (tlFilter === "no_tl") return rows.filter((r) => !r.italian_tl && !r.albanian_tl);
  return rows;
};
