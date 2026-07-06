import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { parseState, setState, prependEntries, publishUpdate } from "./skill-repo";

const NEWS = `<!-- state:{"last_tweet_id":"100"} -->
# Latest Vercel launches

<!-- entries -->

## 2026-06-01 — Old Feature
Old body. https://x.com/vercel/status/100
`;

describe("puras", () => {
  it("parseState extrae el last_tweet_id", () => {
    expect(parseState(NEWS)).toBe("100");
  });

  it("parseState devuelve null sin comentario de estado", () => {
    expect(parseState("# nada")).toBeNull();
  });

  it("setState reemplaza el estado", () => {
    expect(setState(NEWS, "200")).toContain('<!-- state:{"last_tweet_id":"200"} -->');
    expect(setState(NEWS, "200")).not.toContain('"100"');
  });

  it("prependEntries inserta después del marker, antes de lo viejo", () => {
    const out = prependEntries(NEWS, ["## 2026-07-01 — New Feature\nBody."]);
    const iNew = out.indexOf("New Feature");
    const iOld = out.indexOf("Old Feature");
    expect(iNew).toBeGreaterThan(out.indexOf("<!-- entries -->"));
    expect(iNew).toBeLessThan(iOld);
  });

  it("prependEntries tira error si falta el marker y hay entradas", () => {
    expect(() => prependEntries("# sin marker", ["## x"])).toThrow(
      /missing the <!-- entries --> marker/
    );
  });
});

describe("publishUpdate", () => {
  beforeEach(() => {
    process.env.GITHUB_TOKEN = "test-token";
  });
  afterEach(() => vi.unstubAllGlobals());

  function stubGitHub() {
    const put = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "PUT") {
          put(url, JSON.parse(init.body as string));
          return { ok: true, status: 200, json: async () => ({}) };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ content: Buffer.from(NEWS).toString("base64"), sha: "abc" }),
        };
      })
    );
    return put;
  }

  it("prependea entradas nuevas, actualiza estado y manda sha", async () => {
    const put = stubGitHub();
    const r = await publishUpdate(
      ["## 2026-07-02 — Containers\nx. https://x.com/vercel/status/300"],
      "300"
    );
    expect(r.published).toBe(1);
    const body = put.mock.calls[0][1];
    expect(body.sha).toBe("abc");
    const decoded = Buffer.from(body.content, "base64").toString();
    expect(decoded).toContain("Containers");
    expect(decoded).toContain('"last_tweet_id":"300"');
  });

  it("rechaza newestTweetId no numérico (protege el comentario de estado)", async () => {
    stubGitHub();
    await expect(publishUpdate([], 'abc --> <!-- hack')).rejects.toThrow(/numeric tweet id/);
  });

  it("falla claro si GITHUB_TOKEN no está seteado", async () => {
    stubGitHub();
    delete process.env.GITHUB_TOKEN;
    await expect(publishUpdate([], "300")).rejects.toThrow(/GITHUB_TOKEN is not set/);
  });

  it("dedup: no re-publica un tweet ya presente", async () => {
    const put = stubGitHub();
    const r = await publishUpdate(["## dup\nya está. https://x.com/vercel/status/100"], "300");
    expect(r.published).toBe(0);
    const decoded = Buffer.from(put.mock.calls[0][1].content, "base64").toString();
    expect(decoded.match(/status\/100/g)!.length).toBe(1);
    expect(decoded).toContain('"last_tweet_id":"300"');
  });
});
