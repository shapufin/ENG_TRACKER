import type { UserTechAssignment } from "./index";

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
  /** Active clients and techs a person works on; only the calendar's `workspace_users` sends them. */
  clients_detail?: Array<{ id: number; name: string; code: string }>;
  techs_detail?: Array<{ id: number; name: string; code: string }>;
  /** Same shape as UserSerializer.techs, so login and /me/ agree. The JWT's
   * own claim is flatter (level_code) but is never read as the user object. */
  techs?: UserTechAssignment[];
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
  /** Only on the response that finishes an enrolment at sign-in; shown once. */
  backup_codes?: string[];
}

/** A correct password is not a session yet: the server asks for a second step first. */
export interface MfaChallenge {
  mfa_token: string;
  /** Enrolled: enter the 6-digit code (or a backup code). */
  mfa_required?: boolean;
  /** Required for this account but not set up: enrol before signing in. */
  mfa_setup_required?: boolean;
}

export type LoginResponse = AuthResponse | MfaChallenge;

export const isMfaChallenge = (response: LoginResponse): response is MfaChallenge =>
  "mfa_token" in response;

export interface MfaSetupData {
  secret: string;
  otpauth_uri: string;
  qr_svg: string;
}

export interface MfaStatus {
  enabled: boolean;
  required: boolean;
  required_by: "global" | "user" | null;
  backup_codes_remaining: number;
}
