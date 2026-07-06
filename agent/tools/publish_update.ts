import { defineTool } from "eve/tools";
import { z } from "zod";
import { publishUpdate } from "../../lib/skill-repo.js";

export default defineTool({
  description:
    "Publish new launch entries to the skill repo and advance the tweet cursor. ALWAYS call this once at the end of a run that had tweets, even with entries: [] (advances the cursor). Deduplicates by tweet id.",
  inputSchema: z.object({
    entries: z
      .array(z.string())
      .describe("Markdown entries in the exact format from instructions, newest tweet first"),
    newestTweetId: z.string().describe("id of the newest tweet fetched this run"),
  }),
  async execute({ entries, newestTweetId }) {
    return publishUpdate(entries, newestTweetId);
  },
});
