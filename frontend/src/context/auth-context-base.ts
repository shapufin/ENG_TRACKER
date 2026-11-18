import { createContext } from "react";
import type { User, LoginCredentials, AuthResponse, LoginResponse, MfaSetupData } from "@/types";

export interface AuthContextType {
  user: User | null;
  /** Resolves with a session, or with a second-factor challenge (no session yet). */
  login: (credentials: LoginCredentials) => Promise<LoginResponse>;
  /** Finish an MFA sign-in with a 6-digit or backup code. */
  verifyMfa: (mfaToken: string, code: string) => Promise<AuthResponse>;
  /** Finish an MFA sign-in with a passkey (Face ID, fingerprint or device PIN). */
  verifyPasskey: (mfaToken: string) => Promise<AuthResponse>;
  /** Enrol a passkey as the required second factor and sign in. */
  finishLoginPasskeySetup: (mfaToken: string, name: string) => Promise<AuthResponse>;
  /** Seed + QR for an account that must enrol before it can sign in. */
  startLoginSetup: (mfaToken: string) => Promise<MfaSetupData>;
  /** Confirm the first code of a required enrolment; signs in and returns the backup codes. */
  finishLoginSetup: (mfaToken: string, code: string) => Promise<AuthResponse>;
  logout: () => void;
  /** Manual log out: asks first when changes made offline have not been sent yet. */
  requestLogout: (after?: () => void) => void;
  /** Re-fetch the current user from `/users/me/` and update context state. */
  refreshUser: () => Promise<User | null>;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
