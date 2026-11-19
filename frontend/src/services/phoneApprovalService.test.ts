import { describe, it, expect, vi, beforeEach } from "vitest";
import api from "@/lib/api";
import {
  collectPhoneApproval,
  decideApproval,
  getApprovalRequest,
  listPhones,
  pairPhone,
  removePhone,
  renamePhone,
  requestPhoneApproval,
} from "./phoneApprovalService";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const mocked = api as unknown as Record<"get" | "post" | "patch" | "delete", ReturnType<typeof vi.fn>>;

beforeEach(() => {
  Object.values(mocked).forEach((fn) => fn.mockReset());
});

describe("phoneApprovalService", () => {
  it("asks for an approval with the password-step token and never uses a doubled api/ prefix", async () => {
    mocked.post.mockResolvedValue({ data: { request_id: "r1", number: 42 } });
    const data = await requestPhoneApproval("tok", "push");
    expect(mocked.post).toHaveBeenCalledWith("/auth/token/phone-request/", { mfa_token: "tok", via: "push" });
    expect(data.number).toBe(42);
  });

  it("collects with the request id and the PC's key, and returns a status or a session", async () => {
    mocked.post.mockResolvedValueOnce({ data: { status: "pending" } });
    expect(await collectPhoneApproval("tok", "r1", "key")).toEqual({ status: "pending" });
    expect(mocked.post).toHaveBeenCalledWith("/auth/token/phone-collect/", {
      mfa_token: "tok",
      request_id: "r1",
      collect_key: "key",
    });
    mocked.post.mockResolvedValueOnce({ data: { access: "a", user: { username: "ann" } } });
    expect(await collectPhoneApproval("tok", "r1", "key")).toMatchObject({ access: "a" });
  });

  it("reads and decides a request on the phone", async () => {
    mocked.get.mockResolvedValue({ data: { options: [1, 2, 3] } });
    expect((await getApprovalRequest("r1")).options).toEqual([1, 2, 3]);
    expect(mocked.get).toHaveBeenCalledWith("/auth/phone/requests/r1/");
    mocked.post.mockResolvedValue({ data: undefined });
    await decideApproval("r1", { decision: "deny" });
    expect(mocked.post).toHaveBeenCalledWith("/auth/phone/requests/r1/decide/", { decision: "deny" });
  });

  it("pairs, lists, renames and removes phones with the step-up password", async () => {
    mocked.post.mockResolvedValue({ data: { id: 5, name: "P" } });
    await pairPhone({ password: "pw", credentialId: 9, name: "P", pushEndpoint: "https://fcm.googleapis.com/x" });
    expect(mocked.post).toHaveBeenCalledWith("/auth/mfa/phones/", {
      password: "pw",
      code: "",
      credential_id: 9,
      name: "P",
      push_endpoint: "https://fcm.googleapis.com/x",
    });
    mocked.get.mockResolvedValue({ data: [{ id: 5 }] });
    expect(await listPhones()).toEqual([{ id: 5 }]);
    mocked.patch.mockResolvedValue({ data: { id: 5, name: "Work" } });
    await renamePhone(5, "Work", "pw");
    expect(mocked.patch).toHaveBeenCalledWith("/auth/mfa/phones/5/", { name: "Work", password: "pw", code: "" });
    mocked.delete.mockResolvedValue({});
    await removePhone(5, "pw", "123456");
    expect(mocked.delete).toHaveBeenCalledWith("/auth/mfa/phones/5/", { data: { password: "pw", code: "123456" } });
  });
});
