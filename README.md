# x-autodiscovery-agent

[![test](https://github.com/MatiSolina/x-autodiscovery-agent/actions/workflows/test.yml/badge.svg)](https://github.com/MatiSolina/x-autodiscovery-agent/actions/workflows/test.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![skills.sh](https://skills.sh/b/MatiSolina/x-autodiscovery)](https://skills.sh/MatiSolina/x-autodiscovery)

An autonomous [eve](https://github.com/vercel/eve) agent that watches [@vercel](https://x.com/vercel) on X, detects real platform launches, researches the official docs, and keeps a public agent skill up to date — with zero humans in the loop.

It maintains [`MatiSolina/x-autodiscovery`](https://github.com/MatiSolina/x-autodiscovery), installable with:

```bash
npx skills add MatiSolina/x-autodiscovery
```

## How it works

Every 15 minutes (a cron schedule that compiles to a Vercel Cron Job):

1. **`fetch_new_tweets`** reads the cursor embedded in the skill's `news.md` and pulls newer posts from the X API (`since_id`, no replies/RTs).
2. The agent (GLM 5.2 via Vercel AI Gateway) classifies each post: **real developer-facing launch or not?** When in doubt, it discards — a missed post is cheaper than published noise.
3. For real launches, **`fetch_page`** reads the post's vercel.com links (or the changelog) so entries are written from official docs, not from the tweet alone.
4. **`publish_update`** dedupes by tweet id, prepends the dated entries to `news.md`, advances the cursor, and commits to the skill repo via the GitHub contents API.

Design choices worth stealing:

- **State lives inside the published markdown.** Line 1 of `news.md` is `<!-- state:{"last_tweet_id":"..."} -->`. One file, one commit, atomic. No database, no KV, no queue.
- **Installed copies never go stale.** The skill's first instruction tells the consuming agent to fetch the latest `news.md` from GitHub raw at runtime. GitHub is the endpoint; zero infra.
- **Untrusted input is contained.** Tweets and web pages feed an LLM that publishes to a repo people install, so `fetch_page` is locked to an https vercel.com/x.com allowlist (`lib/url-guard.ts`) with redirects blocked.

## Project layout

```
agent/
  agent.ts               # model config (gateway id string — swap models in 1 line)
  instructions.md        # the curation criteria + entry format
  tools/
    fetch_new_tweets.ts
    fetch_page.ts
    publish_update.ts
  schedules/
    discover.md          # cron: */15 * * * *
lib/
  x.ts                   # X API client
  skill-repo.ts          # cursor parsing, dedup, GitHub publishing
  url-guard.ts           # SSRF allowlist
```

That's the whole thing — an eve agent is just a folder.

## Build your own updater bot

Point this pattern at any account that announces things (a framework, a cloud, your own product):

1. `npx eve@latest init my-bot` (Node 24+).
2. Create the target skill repo with a seeded `news.md` (line 1: `<!-- state:{"last_tweet_id":"0"} -->`, then a `<!-- entries -->` marker).
3. Copy `lib/` and `agent/` from here; change the X user id in `lib/x.ts`, the repo in `lib/skill-repo.ts`, and the curation criteria in `agent/instructions.md`.
4. `cp .env.example .env` and fill it (X bearer token, GitHub token, gateway key).
5. Test locally: `npx eve dev --no-ui`, then `curl -X POST http://localhost:3000/eve/v1/dev/schedules/discover`.
6. Ship it: `npx eve deploy` — the schedule becomes a Vercel Cron Job automatically.

Run `npx vitest run` for the unit suite (22 tests).

## Cost

~USD 2/month: most runs find zero new posts and end after a single cheap LLM turn. X API requires a paid tier for timeline reads.

## How this was built

The full design spec and implementation plan live in [`docs/superpowers/`](docs/superpowers/) — from the original brainstorm (a Next.js + Workflow DevKit pipeline) to the pivot to eve, including the security review that added the SSRF guard. The whole thing was built and tested in a single [Claude Code](https://claude.com/claude-code) session.

## License

[Apache 2.0](LICENSE) — © 2026 Matías Solina. Fork it, point it at your favorite account, ship your own updater bot.
