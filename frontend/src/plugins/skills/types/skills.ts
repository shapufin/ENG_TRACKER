/** TypeScript types for the Skills plugin. */

/** Shared view-mode union for the Skills Team page toolbar + state. */
export type SkillsViewMode = "matrix" | "dense" | "heatmap" | "list";

export interface SkillCategory {
  id: number;
  name: string;
  code: string;
  description: string;
  is_active: boolean;
  skill_count?: number;
  created_at: string;
  updated_at: string;
}

export interface Skill {
  id: number;
  category: number;
  category_name?: string;
  category_code?: string;
  name: string;
  code: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserSkill {
  id: number;
  user: number;
  username?: string;
  skill: number;
  skill_name?: string;
  skill_code?: string;
  category_name?: string;
  category_code?: string;
  level: number;
  notes: string;
  last_updated_by: number | null;
  last_updated_by_name?: string | null;
  last_updated_at: string;
  created_at: string;
}

export interface SkillRatingHistory {
  id: number;
  user_skill: number | null;
  user: number | null;
  username?: string | null;
  skill: number | null;
  skill_name?: string | null;
  old_level: number | null;
  new_level: number | null;
  changed_by: number | null;
  changed_by_name?: string | null;
  source: string;
  changed_at: string;
}

export interface TeamMatrixRow {
  user_id: number;
  username: string;
  /** Display name (falls back to username when first/last name are unset). */
  full_name?: string;
  skills: {
    user_skill_id: number;
    skill_id: number;
    skill_name: string;
    category_name: string;
    level: number;
  }[];
}

export interface SkillCoverage {
  skill_id: number;
  skill_name: string;
  category_name: string;
  team_count: number;
  avg_level: number;
}

export interface SkillMatrixFilters {
  category?: string;
  skill_id?: number[];
  min_level?: number;
  max_level?: number;
  search?: string;
  page?: number;
  page_size?: number;
}

export interface SkillListFilters {
  category?: string;
  search?: string;
  active?: boolean;
}

export interface UserSkillFilters {
  skill_id?: number;
  category?: string;
  min_level?: number;
  max_level?: number;
}
