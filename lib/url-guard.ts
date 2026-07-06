const ALLOWED_HOSTS = new Set(["vercel.com", "x.com", "t.co"]);

/**
 * Allowlist guard against SSRF: only https URLs whose host is vercel.com,
 * x.com, t.co, or a subdomain of vercel.com are permitted. Everything else
 * (http, IP literals, localhost, other hosts, malformed URLs) is rejected.
 */
export function isAllowedUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  return ALLOWED_HOSTS.has(host) || host.endsWith(".vercel.com");
}
