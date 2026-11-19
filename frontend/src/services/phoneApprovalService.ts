import api from "@/lib/api";
import type { AuthResponse, PairedPhone, PhoneApprovalStart, PhoneApprovalState, PhoneApprovalView } from "@/types";

/** Phone approval sign-in (spec 2026-11-19). Every path is relative to the axios baseURL (`/api`). */
const PHONES = "/auth/mfa/phones";

/** PC, after the password step: ask the paired phone to approve. `qr` skips the push. */
export async function requestPhoneApproval(
  mfaToken: string,
  via: "push" | "qr"
): Promise<PhoneApprovalStart> {
  const { data } = await api.post<PhoneApprovalStart>("/auth/token/phone-request/", {
    mfa_token: mfaToken,
    via,
  });
  return data;
}

/** PC poll: a status while waiting, or the normal sign-in response once the phone approved. */
export async function collectPhoneApproval(
  mfaToken: string,
  requestId: string,
  collectKey: string
): Promise<AuthResponse | { status: PhoneApprovalState }> {
  const { data } = await api.post<AuthResponse | { status: PhoneApprovalState }>(
    "/auth/token/phone-collect/",
    { mfa_token: mfaToken, request_id: requestId, collect_key: collectKey }
  );
  return data;
}

/** Phone: the three numbers, who is signing in, and the assertion options. */
export async function getApprovalRequest(requestId: string): Promise<PhoneApprovalView> {
  const { data } = await api.get<PhoneApprovalView>(`/auth/phone/requests/${requestId}/`);
  return data;
}

export type ApprovalDecision =
  | { decision: "deny" }
  | { decision: "approve"; number: number; response: unknown };

export async function decideApproval(requestId: string, body: ApprovalDecision): Promise<void> {
  await api.post(`/auth/phone/requests/${requestId}/decide/`, body);
}

/** Settings: pair a passkey created on this phone. The password (and code) are re-proved first. */
export async function pairPhone(input: {
  password: string;
  code?: string;
  credentialId: number;
  name: string;
  pushEndpoint?: string;
}): Promise<PairedPhone> {
  const { data } = await api.post<PairedPhone>(`${PHONES}/`, {
    password: input.password,
    code: input.code ?? "",
    credential_id: input.credentialId,
    name: input.name,
    push_endpoint: input.pushEndpoint ?? "",
  });
  return data;
}

/** The push endpoint of this browser's current subscription, or "" (no push: QR only). */
export async function currentPushEndpoint(): Promise<string> {
  try {
    const registration = await navigator.serviceWorker?.ready;
    const subscription = await registration?.pushManager.getSubscription();
    return subscription?.endpoint ?? "";
  } catch {
    return "";
  }
}

export async function listPhones(): Promise<PairedPhone[]> {
  const { data } = await api.get<PairedPhone[]>(`${PHONES}/`);
  return data;
}

export async function renamePhone(id: number, name: string, password: string, code = ""): Promise<PairedPhone> {
  const { data } = await api.patch<PairedPhone>(`${PHONES}/${id}/`, { name, password, code });
  return data;
}

export async function removePhone(id: number, password: string, code = ""): Promise<void> {
  await api.delete(`${PHONES}/${id}/`, { data: { password, code } });
}
