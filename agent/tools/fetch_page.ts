import { defineTool } from "eve/tools";
import { z } from "zod";
import { isAllowedUrl } from "../../lib/url-guard";

export default defineTool({
  description:
    "Fetch a web page and return its readable text, for researching a launch before writing its entry. Only vercel.com (and subdomains), x.com and t.co pages are fetchable; any other host is blocked.",
  inputSchema: z.object({ url: z.string().url() }),
  async execute({ url }) {
    if (!isAllowedUrl(url)) return { url, error: "blocked: host not allowed", text: "" };
    const res = await fetch(url, {
      headers: { "User-Agent": "x-autodiscovery/1.0" },
      redirect: "manual",
    });
    if (res.status >= 300 && res.status < 400) return { url, error: "redirect blocked", text: "" };
    if (!res.ok) return { url, error: `HTTP ${res.status}`, text: "" };
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 15_000);
    return { url, text };
  },
});
