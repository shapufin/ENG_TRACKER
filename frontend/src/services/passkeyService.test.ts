import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import api from "@/lib/api";
import {
  PasskeyCancelledError,
  authenticateWithPasskey,
  base64urlToBuffer,
  bufferToBase64url,
  isPasskeySupported,
  listPasskeys,
  registerPasskey,
  registerPasskeyAtLogin,
  removePasskey,
  renamePasskey,
} from "./passkeyService";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const bytes = (...values: number[]) => new Uint8Array(values).buffer;

const creationOptions = {
  challenge: "AQID",
  rp: { id: "localhost", name: "Engineering Tracker" },
  user: { id: "AQ", name: "ann", displayName: "Ann" },
  pubKeyCredParams: [{ type: "public-key", alg: -7 }],
  excludeCredentials: [{ id: "BAU", type: "public-key" }],
  authenticatorSelection: { userVerification: "required" },
  attestation: "none",
};

const requestOptions = {
  challenge: "AQID",
  rpId: "localhost",
  allowCredentials: [{ id: "BAU", type: "public-key", transports: ["internal"] }],
  userVerification: "required",
};

const created = {
  id: "BAU",
  rawId: bytes(4, 5),
  type: "public-key",
  authenticatorAttachment: "platform",
  response: {
    clientDataJSON: bytes(1, 2),
    attestationObject: bytes(3, 4),
    getTransports: () => ["internal"],
  },
  getClientExtensionResults: () => ({}),
};

const asserted = {
  id: "BAU",
  rawId: bytes(4, 5),
  type: "public-key",
  response: {
    clientDataJSON: bytes(1, 2),
    authenticatorData: bytes(9, 9),
    signature: bytes(7, 7),
    userHandle: bytes(1),
  },
  getClientExtensionResults: () => ({}),
};

const credentials = { create: vi.fn(), get: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("PublicKeyCredential", class {});
  vi.stubGlobal("isSecureContext", true);
  Object.defineProperty(navigator, "credentials", { value: credentials, configurable: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("base64url helpers", () => {
  it("round-trips bytes, including values that need padding and url-safe characters", () => {
    const input = new Uint8Array([251, 255, 190, 0, 1]);
    const encoded = bufferToBase64url(input.buffer);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(new Uint8Array(base64urlToBuffer(encoded))).toEqual(input);
  });
});

describe("isPasskeySupported", () => {
  it("is false without the WebAuthn API", () => {
    vi.stubGlobal("PublicKeyCredential", undefined);
    expect(isPasskeySupported()).toBe(false);
  });

  it("is false in an insecure context", () => {
    vi.stubGlobal("isSecureContext", false);
    expect(isPasskeySupported()).toBe(false);
  });

  it("is true with the API in a secure context", () => {
    expect(isPasskeySupported()).toBe(true);
  });
});

describe("registerPasskey", () => {
  it("asks the server for options, creates the credential and posts it encoded", async () => {
    vi.mocked(api.post)
      .mockResolvedValueOnce({ data: creationOptions } as never)
      .mockResolvedValueOnce({ data: { id: 3, name: "Phone" } } as never);
    credentials.create.mockResolvedValue(created);

    const result = await registerPasskey("pw", "Phone");

    expect(api.post).toHaveBeenNthCalledWith(1, "/auth/mfa/passkeys/options/", { password: "pw" });
    const publicKey = credentials.create.mock.calls[0][0].publicKey;
    expect(publicKey.challenge).toBeInstanceOf(ArrayBuffer);
    expect(publicKey.user.id).toBeInstanceOf(ArrayBuffer);
    expect(publicKey.excludeCredentials[0].id).toBeInstanceOf(ArrayBuffer);
    expect(api.post).toHaveBeenNthCalledWith(2, "/auth/mfa/passkeys/register/", {
      name: "Phone",
      response: {
        id: "BAU",
        rawId: "BAU",
        type: "public-key",
        authenticatorAttachment: "platform",
        clientExtensionResults: {},
        response: {
          clientDataJSON: "AQI",
          attestationObject: "AwQ",
          transports: ["internal"],
        },
      },
    });
    expect(result).toEqual({ id: 3, name: "Phone" });
  });

  it("registers at sign-in through the login routes", async () => {
    vi.mocked(api.post)
      .mockResolvedValueOnce({ data: creationOptions } as never)
      .mockResolvedValueOnce({ data: { access: "a" } } as never);
    credentials.create.mockResolvedValue(created);

    const result = await registerPasskeyAtLogin("tok", "Phone");

    expect(api.post).toHaveBeenNthCalledWith(1, "/auth/mfa/login/passkey-options/", {
      mfa_token: "tok",
    });
    expect(vi.mocked(api.post).mock.calls[1][0]).toBe("/auth/mfa/login/passkey-register/");
    expect(vi.mocked(api.post).mock.calls[1][1]).toMatchObject({ mfa_token: "tok", name: "Phone" });
    expect(result).toEqual({ access: "a" });
  });
});

describe("authenticateWithPasskey", () => {
  it("fetches options, signs with the passkey and returns the session", async () => {
    vi.mocked(api.post)
      .mockResolvedValueOnce({ data: requestOptions } as never)
      .mockResolvedValueOnce({ data: { access: "a", user: { id: 1 } } } as never);
    credentials.get.mockResolvedValue(asserted);

    const session = await authenticateWithPasskey("tok");

    expect(api.post).toHaveBeenNthCalledWith(1, "/auth/token/passkey-options/", { mfa_token: "tok" });
    const publicKey = credentials.get.mock.calls[0][0].publicKey;
    expect(publicKey.challenge).toBeInstanceOf(ArrayBuffer);
    expect(publicKey.allowCredentials[0].id).toBeInstanceOf(ArrayBuffer);
    expect(vi.mocked(api.post).mock.calls[1][0]).toBe("/auth/token/passkey-verify/");
    expect(vi.mocked(api.post).mock.calls[1][1]).toMatchObject({
      mfa_token: "tok",
      response: {
        id: "BAU",
        rawId: "BAU",
        type: "public-key",
        response: {
          clientDataJSON: "AQI",
          authenticatorData: "CQk",
          signature: "Bwc",
          userHandle: "AQ",
        },
      },
    });
    expect(session).toEqual({ access: "a", user: { id: 1 } });
  });

  it("turns a dismissed prompt into PasskeyCancelledError", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: requestOptions } as never);
    credentials.get.mockRejectedValue(new DOMException("dismissed", "NotAllowedError"));

    await expect(authenticateWithPasskey("tok")).rejects.toBeInstanceOf(PasskeyCancelledError);
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it("does not report an unexpected error as a cancellation", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: requestOptions } as never);
    credentials.get.mockRejectedValue(new Error("boom"));

    const failure = await authenticateWithPasskey("tok").catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(PasskeyCancelledError);
  });

  it("fails clearly when the browser returns no credential", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: requestOptions } as never);
    credentials.get.mockResolvedValue(null);

    await expect(authenticateWithPasskey("tok")).rejects.toBeInstanceOf(PasskeyCancelledError);
  });
});

describe("management URL contracts", () => {
  it("lists, renames and removes under /auth/mfa/passkeys/ (no /api prefix)", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] } as never);
    vi.mocked(api.patch).mockResolvedValue({ data: { id: 5, name: "New" } } as never);
    vi.mocked(api.delete).mockResolvedValue({} as never);

    await listPasskeys();
    await renamePasskey(5, "New", "pw", "123456");
    await removePasskey(5, "pw");

    expect(api.get).toHaveBeenCalledWith("/auth/mfa/passkeys/");
    expect(api.patch).toHaveBeenCalledWith("/auth/mfa/passkeys/5/", {
      name: "New",
      password: "pw",
      code: "123456",
    });
    expect(api.delete).toHaveBeenCalledWith("/auth/mfa/passkeys/5/", {
      data: { password: "pw", code: "" },
    });
  });
});
