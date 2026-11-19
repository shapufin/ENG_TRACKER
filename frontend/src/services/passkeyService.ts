import api from "@/lib/api";
import type { AuthResponse, Passkey } from "@/types";

/** The person dismissed the browser's prompt (or it timed out): not an error to show. */
export class PasskeyCancelledError extends Error {
  constructor() {
    super("Passkey prompt dismissed");
    this.name = "PasskeyCancelledError";
  }
}

const MFA = "/auth/mfa/passkeys";

export function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64urlToBuffer(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** WebAuthn needs the API and a secure context (https, or localhost in development). */
export function isPasskeySupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof PublicKeyCredential !== "undefined" &&
    window.isSecureContext === true &&
    !!navigator.credentials
  );
}

type Descriptor = { id: string; type: string; transports?: string[] };

const decodeDescriptor = (d: Descriptor) => ({ ...d, id: base64urlToBuffer(d.id) });

// The server sends JSON; the browser API wants ArrayBuffers for every binary field.
type CreationOptionsJSON = {
  challenge: string;
  user: { id: string; name: string; displayName: string };
  excludeCredentials?: Descriptor[];
  [key: string]: unknown;
};
type RequestOptionsJSON = {
  challenge: string;
  allowCredentials?: Descriptor[];
  [key: string]: unknown;
};

const isDismissal = (error: unknown): boolean =>
  error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "AbortError");

async function runPrompt<T>(prompt: () => Promise<T | null>): Promise<T> {
  try {
    const result = await prompt();
    if (!result) throw new PasskeyCancelledError();
    return result;
  } catch (error) {
    if (isDismissal(error)) throw new PasskeyCancelledError();
    throw error;
  }
}

async function createCredential(options: CreationOptionsJSON) {
  const publicKey = {
    ...options,
    challenge: base64urlToBuffer(options.challenge),
    user: { ...options.user, id: base64urlToBuffer(options.user.id) },
    excludeCredentials: (options.excludeCredentials ?? []).map(decodeDescriptor),
  } as unknown as PublicKeyCredentialCreationOptions;
  const credential = await runPrompt(
    () => navigator.credentials.create({ publicKey }) as Promise<PublicKeyCredential | null>
  );
  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
    clientExtensionResults: credential.getClientExtensionResults(),
    response: {
      clientDataJSON: bufferToBase64url(response.clientDataJSON),
      attestationObject: bufferToBase64url(response.attestationObject),
      transports: response.getTransports?.() ?? [],
    },
  };
}

export async function getAssertion(options: RequestOptionsJSON) {
  const publicKey = {
    ...options,
    challenge: base64urlToBuffer(options.challenge),
    allowCredentials: (options.allowCredentials ?? []).map(decodeDescriptor),
  } as unknown as PublicKeyCredentialRequestOptions;
  const credential = await runPrompt(
    () => navigator.credentials.get({ publicKey }) as Promise<PublicKeyCredential | null>
  );
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    clientExtensionResults: credential.getClientExtensionResults(),
    response: {
      clientDataJSON: bufferToBase64url(response.clientDataJSON),
      authenticatorData: bufferToBase64url(response.authenticatorData),
      signature: bufferToBase64url(response.signature),
      ...(response.userHandle ? { userHandle: bufferToBase64url(response.userHandle) } : {}),
    },
  };
}

/** Settings: add a passkey to the signed-in account. The password is re-proved first. */
export async function registerPasskey(password: string, name: string): Promise<Passkey> {
  const { data: options } = await api.post<CreationOptionsJSON>(`${MFA}/options/`, { password });
  const response = await createCredential(options);
  const { data } = await api.post<Passkey>(`${MFA}/register/`, { response, name });
  return data;
}

/** Forced enrolment at sign-in: register a passkey and finish signing in. */
export async function registerPasskeyAtLogin(mfaToken: string, name: string): Promise<AuthResponse> {
  const { data: options } = await api.post<CreationOptionsJSON>("/auth/mfa/login/passkey-options/", {
    mfa_token: mfaToken,
  });
  const response = await createCredential(options);
  const { data } = await api.post<AuthResponse>("/auth/mfa/login/passkey-register/", {
    mfa_token: mfaToken,
    response,
    name,
  });
  return data;
}

/** Sign-in second step: one Face ID, fingerprint or PIN prompt, no code to type. */
export async function authenticateWithPasskey(mfaToken: string): Promise<AuthResponse> {
  const { data: options } = await api.post<RequestOptionsJSON>("/auth/token/passkey-options/", {
    mfa_token: mfaToken,
  });
  const response = await getAssertion(options);
  const { data } = await api.post<AuthResponse>("/auth/token/passkey-verify/", {
    mfa_token: mfaToken,
    response,
  });
  return data;
}

export async function listPasskeys(): Promise<Passkey[]> {
  const { data } = await api.get<Passkey[]>(`${MFA}/`);
  return data;
}

export async function renamePasskey(
  id: number,
  name: string,
  password: string,
  code = ""
): Promise<Passkey> {
  const { data } = await api.patch<Passkey>(`${MFA}/${id}/`, { name, password, code });
  return data;
}

export async function removePasskey(id: number, password: string, code = ""): Promise<void> {
  await api.delete(`${MFA}/${id}/`, { data: { password, code } });
}
