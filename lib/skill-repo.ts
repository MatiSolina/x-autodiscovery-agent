const STATE_RE = /<!-- state:(\{.*?\}) -->/;
const ENTRIES_MARKER = "<!-- entries -->";

export function parseState(newsMd: string): string | null {
  const m = newsMd.match(STATE_RE);
  if (!m) return null;
  try {
    return (JSON.parse(m[1]) as { last_tweet_id?: string }).last_tweet_id ?? null;
  } catch {
    return null;
  }
}

export function setState(newsMd: string, lastTweetId: string): string {
  const state = `<!-- state:${JSON.stringify({ last_tweet_id: lastTweetId })} -->`;
  return STATE_RE.test(newsMd) ? newsMd.replace(STATE_RE, state) : `${state}\n${newsMd}`;
}

export function prependEntries(newsMd: string, entries: string[]): string {
  if (entries.length === 0) return newsMd;
  if (!newsMd.includes(ENTRIES_MARKER)) {
    throw new Error("news.md is missing the <!-- entries --> marker");
  }
  const block = `${ENTRIES_MARKER}\n\n${entries.join("\n\n")}\n`;
  return newsMd.replace(ENTRIES_MARKER, block);
}

function repo() {
  return process.env.SKILL_REPO ?? "MatiSolina/x-autodiscovery";
}

async function ghFetch(path: string, init?: RequestInit) {
  if (!process.env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN is not set");
  const base = process.env.GITHUB_API_BASE ?? "https://api.github.com";
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      ...init?.headers,
    },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status} on ${path}`);
  return res.json();
}

async function readNewsFile(): Promise<{ content: string; sha: string }> {
  const data = (await ghFetch(`/repos/${repo()}/contents/news.md`)) as {
    content: string;
    sha: string;
  };
  return { content: Buffer.from(data.content, "base64").toString("utf8"), sha: data.sha };
}

export async function readState(): Promise<string | null> {
  const { content } = await readNewsFile();
  return parseState(content);
}

const TWEET_ID_RE = /status\/(\d+)/;

export async function publishUpdate(
  entries: string[],
  newestTweetId: string
): Promise<{ published: number }> {
  if (!/^\d+$/.test(newestTweetId)) {
    throw new Error(`newestTweetId must be a numeric tweet id, got: ${newestTweetId.slice(0, 50)}`);
  }
  const { content, sha } = await readNewsFile();
  const fresh = entries.filter((e) => {
    const id = e.match(TWEET_ID_RE)?.[1];
    return !id || !content.includes(`status/${id}`);
  });
  const updated = setState(prependEntries(content, fresh), newestTweetId);
  await ghFetch(`/repos/${repo()}/contents/news.md`, {
    method: "PUT",
    body: JSON.stringify({
      message: fresh.length
        ? `feat: ${fresh.length} new launch(es) from @vercel`
        : "chore: advance tweet cursor",
      content: Buffer.from(updated, "utf8").toString("base64"),
      sha,
    }),
  });
  return { published: fresh.length };
}
