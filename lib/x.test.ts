import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchNewTweets } from "./x";

afterEach(() => vi.unstubAllGlobals());

function stubFetch(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("fetchNewTweets", () => {
  it("devuelve tweets y pasa since_id", async () => {
    const fn = stubFetch(200, { data: [{ id: "2", text: "hola" }] });
    const tweets = await fetchNewTweets("1");
    expect(tweets).toEqual([{ id: "2", text: "hola" }]);
    const url = fn.mock.calls[0][0] as string;
    expect(url).toContain("since_id=1");
    expect(url).toContain("exclude=replies%2Cretweets");
  });

  it("devuelve [] cuando no hay data", async () => {
    stubFetch(200, { meta: { result_count: 0 } });
    expect(await fetchNewTweets("1")).toEqual([]);
  });

  it("omite since_id en primera corrida", async () => {
    const fn = stubFetch(200, { data: [] });
    await fetchNewTweets(null);
    expect(fn.mock.calls[0][0] as string).not.toContain("since_id");
  });

  it("lanza error con status en fallas", async () => {
    stubFetch(429, {});
    await expect(fetchNewTweets(null)).rejects.toThrow("X API 429");
  });
});
