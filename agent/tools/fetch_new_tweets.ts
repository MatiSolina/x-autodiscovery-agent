import { defineTool } from "eve/tools";
import { z } from "zod";
import { fetchNewTweets } from "../../lib/x.js";
import { readState } from "../../lib/skill-repo.js";

export default defineTool({
  description:
    "Fetch tweets from @vercel newer than the last processed cursor. Returns newest-first. Empty array means nothing new — finish the run.",
  inputSchema: z.object({}),
  async execute() {
    const sinceId = await readState();
    const tweets = await fetchNewTweets(sinceId);
    return { count: tweets.length, tweets };
  },
});
