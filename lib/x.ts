export type Tweet = {
  id: string;
  text: string;
  created_at?: string;
  entities?: { urls?: { expanded_url: string }[] };
};

const VERCEL_USER_ID = "4686835494"; // @vercel

export async function fetchNewTweets(sinceId: string | null): Promise<Tweet[]> {
  const base = process.env.X_API_BASE ?? "https://api.x.com";
  const params = new URLSearchParams({
    max_results: "25",
    exclude: "replies,retweets",
    "tweet.fields": "created_at,entities",
  });
  if (sinceId) params.set("since_id", sinceId);

  const res = await fetch(`${base}/2/users/${VERCEL_USER_ID}/tweets?${params}`, {
    headers: { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` },
  });
  if (!res.ok) throw new Error(`X API ${res.status}`);
  const body = (await res.json()) as { data?: Tweet[] };
  return body.data ?? [];
}
