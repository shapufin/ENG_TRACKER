import type { MyEprCycle } from "../../types/myRecords";

export const stepsOf = (c: MyEprCycle) => [
  { label: "Goal setting", at: c.goal_setting_completed_at },
  { label: "Mid-year", at: c.mid_year_completed_at },
  { label: "Final review", at: c.final_review_completed_at },
];
