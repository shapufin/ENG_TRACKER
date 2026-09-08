export interface TeamSummary {
  id: number;
  name: string;
  code: string;
  calendar_group?: string;
}

export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name?: string;
  is_staff?: boolean;
  is_superuser?: boolean;
  is_italian_tl_role?: boolean;
  is_albanian_tl_role?: boolean;
  is_team_leader?: boolean;
  is_hr?: boolean;
  is_cr_admin?: boolean;
  roles?: string[];
  has_control_room_access?: boolean;
  hire_date?: string | null;
  team?: TeamSummary | null;
  teams?: TeamSummary[];
  techs?: Array<{ id: number; name: string; code: string }>;
  client_ids?: number[];
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface AuthResponse {
  access: string;
  refresh?: string;
  user: User;
}
