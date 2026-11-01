import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

type FetchHandler = (event: {
  request: { method: string; url: string; mode: string };
  respondWith: (p: Promise<Response>) => void;
}) => void;

const code = readFileSync("public/sw.js", "utf8");

describe("service worker static caching", () => {
  const put = vi.fn();
  let handler: FetchHandler;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    put.mockClear();
    fetchMock = vi.fn();
    const self = {
      location: { origin: "https://app.test" },
      addEventListener: (name: string, fn: FetchHandler) => {
        if (name === "fetch") handler = fn;
      },
    };
    const caches = { match: async () => undefined, open: async () => ({ put }) };
    new Function("self", "caches", "fetch", code)(self, caches, fetchMock);
  });

  const run = async (response: Response | Error) => {
    if (response instanceof Error) fetchMock.mockRejectedValue(response);
    else fetchMock.mockResolvedValue(response);
    let result: Promise<Response> | undefined;
    handler({
      request: { method: "GET", url: "https://app.test/assets/x.js", mode: "no-cors" },
      respondWith: (p) => (result = p),
    });
    return result!;
  };

  const html = (status: number) =>
    new Response("<html></html>", { status, headers: { "content-type": "text/html" } });

  it("does not cache an HTML 200 served for a script", async () => {
    const res = await run(html(200));
    expect(res.status).toBe(200);
    expect(put).not.toHaveBeenCalled();
  });

  it("passes a 404 through uncached", async () => {
    const res = await run(html(404));
    expect(res.status).toBe(404);
    expect(put).not.toHaveBeenCalled();
  });

  it("returns a network error, not a fake 503, when fetch rejects", async () => {
    const res = await run(new TypeError("offline"));
    expect(res.type).toBe("error");
  });

  it("caches a real script response", async () => {
    const res = await run(
      new Response("x", { status: 200, headers: { "content-type": "application/javascript" } })
    );
    expect(res.status).toBe(200);
    expect(put).toHaveBeenCalledTimes(1);
  });
});
