# x-autodiscovery Implementation Plan (eve.dev)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agente eve deployado en Vercel Pro que escucha el X de @vercel cada 15 min, detecta features nuevas, investiga sus docs y pushea actualizaciones al skill público `MatiSolina/x-autodiscovery` en skills.sh.

**Architecture:** eve (filesystem-first, durable). Un schedule markdown (cron */15) dispara al agente; el agente usa 3 tools tipados: `fetch_new_tweets` (cursor + X API), `fetch_page` (research en vercel.com), `publish_update` (dedup + commit a GitHub). Estado embebido en `news.md` como comentario HTML. Criterio de curación en `instructions.md`.

**Tech Stack:** eve (`npm i eve`), AI SDK (`ai`), `zod`, Vitest, GLM 5.2 vía AI Gateway, GitHub contents API con fetch plano, Node 24.

## Global Constraints

- Nombres de repo/skill: **x-autodiscovery** — la palabra "vercel" NO va en nombres (marca). Sí en contenido.
- Repo del skill: `MatiSolina/x-autodiscovery` (público). El agente vive en este repo (`x-vercel`, privado).
- Node 24 obligatorio: prefijar TODOS los comandos npm/npx/node/eve con `export PATH=/opt/homebrew/opt/node@24/bin:$PATH`.
- Modelo: GLM 5.2 vía gateway; slug exacto se confirma en Task 1 y se usa en `agent/agent.ts`.
- Contenido publicado (SKILL.md, news.md) en inglés; docs internos en español.
- Env (en `.env` local, ya existe con `X_BEARER_TOKEN`): `X_BEARER_TOKEN`, `GITHUB_TOKEN` (usar `gh auth token` en dev), `AI_GATEWAY_API_KEY`.
- En duda el agente descarta (falso negativo > ruido publicado).
- eve docs de referencia: `/private/tmp/claude-501/-Users-mati-Clientes-x-vercel/e1a2c5d0-84ed-42a1-9927-5b9201d3b3b6/scratchpad/eve-docs/node_modules/eve/docs/` (v0.5.4). Ante cualquier duda de API de eve, leer ahí.
- Commits terminan con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Scaffold eve + confirmar slug GLM

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `agent/agent.ts`, `agent/instructions.md` (mínimo, se completa en Task 4)
- Modify: `.gitignore`, `.env` (agregar `GITHUB_TOKEN`, `AI_GATEWAY_API_KEY` si falta)

**Interfaces:**
- Produces: proyecto eve que compila (`eve build`), `pnpm test` corre Vitest, `MODEL` decidido y escrito en `agent/agent.ts`.

- [ ] **Step 1: package.json + deps**

```json
{
  "name": "x-autodiscovery-agent",
  "private": true,
  "type": "module",
  "engines": { "node": "24.x" },
  "scripts": {
    "dev": "eve dev",
    "build": "eve build",
    "test": "vitest run"
  }
}
```

Run: `export PATH=/opt/homebrew/opt/node@24/bin:$PATH && npm install eve@latest ai zod && npm install -D vitest typescript @types/node`
Expected: instala sin errores.

- [ ] **Step 2: tsconfig.json y vitest.config.ts**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "esModuleInterop": true
  },
  "include": ["agent/**/*.ts", "lib/**/*.ts"]
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["lib/**/*.test.ts"] },
});
```

- [ ] **Step 3: Confirmar slug GLM 5.2 en el gateway**

Si `.env` no tiene `AI_GATEWAY_API_KEY`: crearla — `vercel link` + `vercel env pull` o pedirla al dashboard (AI Gateway → API keys). Luego:

Run: `curl -s https://ai-gateway.vercel.sh/v1/models -H "Authorization: Bearer $(grep AI_GATEWAY_API_KEY .env | cut -d= -f2)" | python3 -c "import json,sys; [print(m['id']) for m in json.load(sys.stdin)['data'] if 'glm' in m['id'].lower()]"`
Expected: lista de slugs GLM. Elegir el de la versión 5.2 (esperado ~`zai/glm-5.2`). Si no existe 5.2, usar el GLM más nuevo listado y anotarlo en el reporte de la task.

- [ ] **Step 4: agent/agent.ts + instructions.md mínimo**

`agent/agent.ts` (con el slug confirmado del Step 3):
```ts
import { defineAgent } from "eve";

export default defineAgent({
  model: "zai/glm-5.2",
});
```

`agent/instructions.md` (placeholder funcional, Task 4 lo completa):
```markdown
You are x-autodiscovery, a headless agent that watches @vercel on X and
maintains a public skill with new Vercel platform launches.
```

- [ ] **Step 5: Verificar build**

Run: `export PATH=/opt/homebrew/opt/node@24/bin:$PATH && npx eve build 2>&1 | tail -5`
Expected: build OK (sin tools todavía, agente mínimo válido). Si eve pide algo más (p. ej. archivo faltante), leer el error y los docs bundled y resolver.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: scaffold eve agent with GLM model

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Cliente X API (`lib/x.ts`)

**Files:**
- Create: `lib/x.ts`
- Test: `lib/x.test.ts`

**Interfaces:**
- Produces: `type Tweet = { id: string; text: string; created_at?: string; entities?: { urls?: { expanded_url: string }[] } }` y `fetchNewTweets(sinceId: string | null): Promise<Tweet[]>`. Tweets llegan newest-first. Errores: `Error` con mensaje `X API <status>`.

- [ ] **Step 1: Test que falla**

`lib/x.test.ts`:
```ts
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
```

- [ ] **Step 2: Verificar que falla**

Run: `export PATH=/opt/homebrew/opt/node@24/bin:$PATH && npx vitest run lib/x.test.ts`
Expected: FAIL — `Cannot find module './x'`.

- [ ] **Step 3: Implementación**

`lib/x.ts`:
```ts
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
```

- [ ] **Step 4: Verificar que pasa**

Run: `export PATH=/opt/homebrew/opt/node@24/bin:$PATH && npx vitest run lib/x.test.ts`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/x.ts lib/x.test.ts
git commit -m "feat: X API client for @vercel timeline

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Repo del skill — estado y publicación (`lib/skill-repo.ts`)

**Files:**
- Create: `lib/skill-repo.ts`
- Test: `lib/skill-repo.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - Puras: `parseState(newsMd: string): string | null`, `setState(newsMd: string, lastTweetId: string): string`, `prependEntries(newsMd: string, entries: string[]): string`.
  - IO: `readState(): Promise<string | null>`, `publishUpdate(entries: string[], newestTweetId: string): Promise<{ published: number }>`.
- Formato de `news.md` (el repo del skill DEBE respetarlo, ver Task 5):

```markdown
<!-- state:{"last_tweet_id":"0"} -->
# Latest Vercel launches

<!-- entries -->

## 2026-07-02 — Example Feature
...
```

- [ ] **Step 1: Tests que fallan**

`lib/skill-repo.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from "vitest";
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
});

describe("publishUpdate", () => {
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

  it("dedup: no re-publica un tweet ya presente", async () => {
    const put = stubGitHub();
    const r = await publishUpdate(["## dup\nya está. https://x.com/vercel/status/100"], "300");
    expect(r.published).toBe(0);
    const decoded = Buffer.from(put.mock.calls[0][1].content, "base64").toString();
    expect(decoded.match(/status\/100/g)!.length).toBe(1);
    expect(decoded).toContain('"last_tweet_id":"300"');
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `export PATH=/opt/homebrew/opt/node@24/bin:$PATH && npx vitest run lib/skill-repo.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementación**

`lib/skill-repo.ts`:
```ts
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
  const block = `${ENTRIES_MARKER}\n\n${entries.join("\n\n")}\n`;
  return newsMd.replace(ENTRIES_MARKER, block);
}

function repo() {
  return process.env.SKILL_REPO ?? "MatiSolina/x-autodiscovery";
}

async function ghFetch(path: string, init?: RequestInit) {
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
```

- [ ] **Step 4: Verificar que pasa**

Run: `export PATH=/opt/homebrew/opt/node@24/bin:$PATH && npx vitest run lib/skill-repo.test.ts`
Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/skill-repo.ts lib/skill-repo.test.ts
git commit -m "feat: skill repo state + publish via GitHub contents API

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Tools, instructions y schedule del agente

**Files:**
- Create: `agent/tools/fetch_new_tweets.ts`, `agent/tools/fetch_page.ts`, `agent/tools/publish_update.ts`, `agent/schedules/discover.md`
- Modify: `agent/instructions.md`

**Interfaces:**
- Consumes: `fetchNewTweets`/`Tweet` (Task 2), `readState`/`publishUpdate` (Task 3).
- Produces: agente completo que buildea. Tools visibles para el modelo: `fetch_new_tweets` (sin input), `fetch_page` (`{ url }`), `publish_update` (`{ entries: string[], newestTweetId: string }`).

- [ ] **Step 1: Tools**

`agent/tools/fetch_new_tweets.ts`:
```ts
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
```

`agent/tools/fetch_page.ts`:
```ts
import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description:
    "Fetch a web page (vercel.com docs, changelog, blog) and return its readable text, for researching a launch before writing its entry.",
  inputSchema: z.object({ url: z.string().url() }),
  async execute({ url }) {
    const res = await fetch(url, { headers: { "User-Agent": "x-autodiscovery/1.0" } });
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
```

`agent/tools/publish_update.ts`:
```ts
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
```

- [ ] **Step 2: instructions.md completo**

`agent/instructions.md`:
```markdown
You are x-autodiscovery, a headless agent. You watch the official @vercel X
timeline and maintain a public skill (a markdown knowledge file installed by
AI coding agents) with new Vercel platform launches.

## Run procedure

1. Call `fetch_new_tweets`. If `count` is 0, finish immediately — do not call
   anything else and do not produce output.
2. For each tweet, decide: is it announcing a NEW Vercel platform feature,
   product, or capability developers can use?
   - YES examples: new runtime capability (containers, WebSockets), new
     product (queues, sandbox), new SDK/framework support, major rebuilds
     with new capabilities.
   - NO: sports/brand partnerships, events, hiring, memes, retweets or
     amplification of third-party content, generic marketing, customer
     stories.
   - When in doubt: NO. A missed tweet is cheaper than published noise.
3. For each YES tweet, research before writing: call `fetch_page` on the
   tweet's vercel.com links; if it has none, try
   https://vercel.com/changelog. Prefer facts from pages over the tweet.
   If sources lack detail, keep the entry short — never invent.
4. Write one entry per YES tweet, EXACTLY this format (date from the tweet's
   created_at, YYYY-MM-DD):

   ## YYYY-MM-DD — Feature Name
   **What it is:** 1-2 sentences.
   **Why you'd use it:** 1-2 sentences, developer-focused.
   **Docs:** best vercel.com URL found, or https://vercel.com/changelog
   **Announcement:** https://x.com/vercel/status/TWEET_ID

5. Call `publish_update` exactly once with all entries (newest first) and
   `newestTweetId` = id of the first tweet returned by `fetch_new_tweets`.
   If no tweet was a feature, still call it with `entries: []`.

## Style

Entries are read by AI coding agents deciding whether Vercel covers a need.
Be concrete and factual. English only.
```

- [ ] **Step 3: Schedule**

`agent/schedules/discover.md`:
```markdown
---
cron: "*/15 * * * *"
---

Run the discovery procedure from your instructions: fetch new @vercel tweets,
curate launches, publish the update.
```

- [ ] **Step 4: Verificar build + unit tests**

Run: `export PATH=/opt/homebrew/opt/node@24/bin:$PATH && npx eve build 2>&1 | tail -5 && npx vitest run`
Expected: build OK (descubre 3 tools y 1 schedule), unit tests PASS. Si el build falla por las rutas de import (`.js` vs sin extensión), leer el error y ajustar según lo que exija el bundler de eve.

- [ ] **Step 5: Commit**

```bash
git add agent/ lib/
git commit -m "feat: discovery tools, instructions and 15-min schedule

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Repo del skill con baseline

**Files:**
- Create (en repo NUEVO `MatiSolina/x-autodiscovery`, clonado en `/Users/mati/Clientes/x-autodiscovery`): `SKILL.md`, `news.md`, `README.md`

**Interfaces:**
- Consumes: formato de `news.md` de Task 3 (comentario de estado + `<!-- entries -->`).
- Produces: repo público instalable con `npx skills add MatiSolina/x-autodiscovery`.

- [ ] **Step 1: Crear el repo**

```bash
cd /Users/mati/Clientes
gh repo create MatiSolina/x-autodiscovery --public --description "Auto-updating skill: what's new on the Vercel platform, sourced from @vercel" --clone
cd x-autodiscovery
```

- [ ] **Step 2: Recolectar el baseline**

Fetchear y leer (con curl o WebFetch):
- `https://vercel.com/changelog` — últimos ~3 meses (incluye containers, WebSockets y lo de esta semana)
- `https://vercel.com/docs` — índice de productos

Con eso escribir el platform map del Step 3 y las entradas seed del Step 4. Criterio: cada ítem con link a docs oficial; nada de memoria — todo de las páginas fetcheadas.

- [ ] **Step 3: SKILL.md**

Estructura obligatoria (`<PLATFORM MAP>` se completa con el material del Step 2):
```markdown
---
name: x-autodiscovery
description: Auto-updated map of Vercel platform capabilities and new launches. Use when building on or deploying to Vercel, when wondering if Vercel has a feature (containers, WebSockets, queues, sandboxes, AI, etc.), or when asked "what's new on Vercel".
---

# Vercel Platform Autodiscovery

## Freshness protocol (do this first)

This skill updates itself upstream several times a week. Before relying on
the local copy, fetch the latest launches:

    https://raw.githubusercontent.com/MatiSolina/x-autodiscovery/main/news.md

If the fetch fails (offline), fall back to the bundled news.md — but tell
the user it may be stale.

## Platform map (baseline: 2026-07-05)

<PLATFORM MAP: secciones por área — Compute, Networking, Storage, AI,
Workflows/Queues, Security, DX — cada feature con 1 línea y link a docs>

## Latest launches

See news.md (or the fetched fresh copy) for dated entries, newest first.
```

- [ ] **Step 4: news.md seed**

```markdown
<!-- state:{"last_tweet_id":"0"} -->
# Latest Vercel launches

<!-- entries -->

<ENTRADAS del changelog reciente en el formato del instructions.md (Task 4),
más nuevas arriba, incluyendo containers y WebSockets. En las entradas seed,
**Announcement** lleva la URL del changelog en vez del tweet.>
```

Nota: `last_tweet_id: "0"` sin `since_id` hace que la primera corrida procese los últimos 25 tweets — backfill automático; el dedup por tweet id no cubre los seeds (usan URL de changelog), así que puede haber 1-2 duplicados semánticos tras la primera corrida — aceptable, se limpian a mano.

- [ ] **Step 5: README.md + push**

`README.md`: ~5 líneas — qué es, `npx skills add MatiSolina/x-autodiscovery`, cómo se actualiza (agente eve que escucha @vercel cada 15 min).

```bash
git add -A && git commit -m "feat: baseline skill with platform map and seeded news

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push -u origin main
```

- [ ] **Step 6: Verificar instalación**

Run: `cd $(mktemp -d) && npx -y skills@latest add MatiSolina/x-autodiscovery -y 2>&1 | tail -5`
Expected: instala sin errores; el SKILL.md instalado contiene "Freshness protocol".

---

### Task 6: E2E local — corrida real del schedule

**Files:**
- Modify: ninguno (operación)

**Interfaces:**
- Consumes: todo lo anterior. Requiere `.env` con `X_BEARER_TOKEN`, `AI_GATEWAY_API_KEY`, y `GITHUB_TOKEN=$(gh auth token)`.
- Produces: evidencia de que el pipeline entero funciona (commit real en el repo del skill).

- [ ] **Step 1: Completar .env**

```bash
cd /Users/mati/Clientes/x-vercel
grep -q GITHUB_TOKEN .env || echo "GITHUB_TOKEN=$(gh auth token)" >> .env
grep AI_GATEWAY_API_KEY .env || echo "FALTA AI_GATEWAY_API_KEY"
```
Si falta la key del gateway, obtenerla (dashboard Vercel → AI Gateway) antes de seguir.

- [ ] **Step 2: Levantar dev server headless**

Run (background): `export PATH=/opt/homebrew/opt/node@24/bin:$PATH && npx eve dev --no-ui`
Expected: server local en :3000 (ver output). eve dev NO dispara schedules por cron — se disparan a mano con la dispatch route.

- [ ] **Step 3: Disparar el schedule**

Run: `curl -s -X POST http://localhost:3000/eve/v1/dev/schedules/discover`
Expected: `{ "scheduleId": "discover", "sessionIds": ["..."] }`.

- [ ] **Step 4: Observar la sesión**

Run: `curl -sN http://localhost:3000/eve/v1/session/<sessionId>/stream | head -100` (o seguir los logs del dev server).
Expected: el agente llama `fetch_new_tweets` (primera corrida: ~25 tweets de backfill), clasifica, investiga con `fetch_page`, y llama `publish_update`. Sesión termina sin error.

- [ ] **Step 5: Verificar el efecto real**

```bash
gh api repos/MatiSolina/x-autodiscovery/commits --jq '.[0].commit.message'
gh api repos/MatiSolina/x-autodiscovery/contents/news.md -H "Accept: application/vnd.github.raw" | head -60
```
Expected: commit nuevo (`feat: N new launch(es)...`); `news.md` con cursor avanzado (`last_tweet_id` ≠ "0") y entradas correctas: Hydrogen/containers/WebSockets presentes si estaban en los 25 tweets; NADA de Mercedes F1. Revisar calidad de la prosa; si una entrada es mala, ajustar `instructions.md` y repetir Steps 3-5 (el dedup evita duplicados).

- [ ] **Step 6: Matar dev server + commit de ajustes**

```bash
git add -A && git commit -m "test: e2e run against live skill repo" --allow-empty
```
(con el trailer Co-Authored-By)

---

### Task 7: Deploy a Vercel

**Files:**
- Modify: ninguno (operación)

**Interfaces:**
- Produces: agente en producción con cron activo cada 15 min.

- [ ] **Step 1: Link no interactivo**

Run: `export PATH=/opt/homebrew/opt/node@24/bin:$PATH && vercel link --project x-autodiscovery-agent --yes`
Expected: proyecto linkeado (crea si no existe). Si el team requiere selección, usar `vercel link --yes` con `--scope <team>` del `vercel whoami`.

- [ ] **Step 2: Env vars de producción**

```bash
grep X_BEARER_TOKEN .env | cut -d= -f2- | vercel env add X_BEARER_TOKEN production
gh auth token | vercel env add GITHUB_TOKEN production
grep AI_GATEWAY_API_KEY .env | cut -d= -f2- | vercel env add AI_GATEWAY_API_KEY production
```

- [ ] **Step 3: Deploy**

Run: `export PATH=/opt/homebrew/opt/node@24/bin:$PATH && npx eve deploy 2>&1 | tail -10`
Expected: deploy a producción OK. (`eve deploy` = `vercel deploy --prod` + env pull.)

- [ ] **Step 4: Verificar cron**

Run: `vercel crons ls 2>/dev/null || echo "verificar en dashboard: Settings → Cron Jobs"`
Expected: cron `*/15 * * * *` registrado para el schedule discover.

- [ ] **Step 5: Verificar corrida de producción**

Esperar al próximo tick de 15 min (usar sleep/monitor) y:
```bash
gh api repos/MatiSolina/x-autodiscovery/commits --jq '.[0:2][] | .commit.message + " | " + .commit.author.date'
```
Expected: un commit nuevo del tick de producción (aunque sea `chore: advance tweet cursor` si no hubo tweets). Con eso el sistema está vivo end-to-end.

- [ ] **Step 6: Higiene final**

- Recordar al usuario: regenerar el X bearer token y consumer key/secret en developer.x.com (pasaron por el chat) y actualizar `vercel env` + `.env`.
- Commit final del repo del agente.

---

## Self-review (hecho al escribir)

- **Cobertura del spec**: schedule 15 min (T4/T7), X API (T2), cursor+dedup+publish (T3), tools+criterio+formato (T4), baseline+freshness (T5), e2e con evidencia real (T6), deploy+cron vivo (T7). Modelo GLM en agent.ts (T1).
- **Tipos consistentes**: `Tweet`, firmas de lib y tools verificadas entre tasks.
- **Sin placeholders** salvo los dos generativos explícitos de T5 (platform map y seeds, producidos fetcheando el changelog en ejecución, con criterio definido).
- **Riesgo conocido**: APIs de eve en preview — ante cualquier discrepancia, los docs bundled en el scratchpad son la fuente de verdad.
