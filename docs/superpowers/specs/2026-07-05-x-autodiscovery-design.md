# x-autodiscovery — Design

**Fecha**: 2026-07-05 (revisado: pivot a eve.dev)
**Estado**: aprobado

## Problema

Vercel lanza productos/features todo el tiempo (esta semana: containers, WebSockets, Hydrogen agent-first). Los skills publicados (skills.sh, plugin oficial) quedan desactualizados por meses, y los usuarios que ya instalaron un skill nunca corren `skills update`. Resultado: los agents no saben qué cosas nuevas de Vercel pueden aprovechar.

## Solución

Un agente eve que escucha el X/Twitter de @vercel, detecta lanzamientos reales, investiga la documentación oficial y mantiene actualizado un skill público (`x-autodiscovery`) en skills.sh — con frescura en runtime para copias locales viejas.

## Componentes

Dos repos:

1. **Agente eve** (este repo, privado, deployado en Vercel Pro con `eve deploy`): el listener. eve (eve.dev, paquete `eve`) es filesystem-first y corre sobre el mismo Workflow SDK que WDK; sus schedules se convierten en Vercel Cron Jobs.
2. **`x-autodiscovery`** (repo GitHub público): el skill, registrado en skills.sh.

### Agente eve — listener

- **Trigger**: `agent/schedules/discover.md` con `cron: "*/15 * * * *"` (markdown/task mode, fire-and-forget). En Vercel se convierte en Cron Job automáticamente (UTC).
- **Comportamiento por corrida** (definido en `agent/instructions.md` + el prompt del schedule):
  1. Llama el tool `fetch_new_tweets`: lee el cursor embebido en `news.md` del repo del skill y pega a `GET https://api.x.com/2/users/4686835494/tweets?since_id=...` (user id de @vercel), bearer token, sin replies/RTs. Sin tweets nuevos → termina ahí (una vuelta de LLM barata; ~USD 1-3/mes a cadencia 15 min con GLM).
  2. Por cada tweet decide: ¿feature/producto/capability nueva o ruido? Partnerships, memes, RTs, hiring → descarta. En duda, descarta (falso negativo > ruido publicado).
  3. Para features, investiga con el tool `fetch_page` (links del tweet, `vercel.com/changelog`, `vercel.com/docs`) y redacta la entrada markdown con formato fijo.
  4. Llama `publish_update(entries, newestTweetId)` — SIEMPRE que haya tweets procesados, aunque no haya features, para avanzar el cursor. El tool dedupea por tweet id, prependea a `news.md` y commitea al repo público vía GitHub API.
- **Idempotencia**: dedup por tweet id dentro de `publish_update` (revisa el contenido actual antes de escribir). Estado (último tweet id) embebido en `news.md` como comentario HTML: un archivo, un commit atómico.
- **Modelo**: GLM 5.2 vía AI Gateway — `defineAgent({ model: "zai/glm-5.2" })` (slug a confirmar contra la lista del gateway). Es el modelo del loop del agente: clasifica, investiga y redacta. Swap = 1 línea.
- **Requisitos**: Node 24+ (instalado keg-only como `node@24` de Homebrew en la máquina de dev; `/opt/homebrew/opt/node@24/bin`).

### Skill `x-autodiscovery`

- **Baseline (one-shot, antes de publicar)**: `SKILL.md` inicial generado con el mapa actual de la plataforma — índice de productos de `vercel.com/docs` + backfill del changelog reciente (containers, WebSockets incluidos), organizado por temas.
- **Delta**: el agente mantiene `news.md` (archivo separado del SKILL.md) con entradas fechadas; el SKILL.md lo referencia como "Latest launches".
- **Frescura en runtime (decisión clave)**: la primera instrucción del SKILL.md le dice al agente que haga fetch de `https://raw.githubusercontent.com/MatiSolina/x-autodiscovery/main/news.md` para el estado más reciente, con fallback a la copia local si no hay red. Los usuarios con copias locales viejas ven lo último sin correr `skills update`. GitHub raw es el endpoint: cero infra propia.
- **Distribución**: `npx skills add MatiSolina/x-autodiscovery`. skills.sh sirve desde el repo; no hay paso de re-publicación.

## Env vars (Vercel, el agente eve)

- `X_BEARER_TOKEN` — X API (ya validado: lee el timeline de @vercel OK).
- `GITHUB_TOKEN` — token con permiso de contenido sobre el repo del skill (en dev, `gh auth token`; en prod idealmente fine-grained PAT solo para ese repo).
- `AI_GATEWAY_API_KEY` — AI Gateway (o `VERCEL_OIDC_TOKEN` vía `vercel link`).

(Ya no hay `CRON_SECRET`: los schedules de eve son internos, no exponen route pública.)

Nota de higiene: el bearer token y consumer key/secret pasaron por el chat durante el diseño; regenerarlos en el portal de X una vez deployado.

## Testing

- **Unit** (Vitest): `lib/x.ts` y `lib/skill-repo.ts` (parseo de estado, dedup, prepend, llamadas HTTP con fetch stubbeado); schemas de los tools.
- **End-to-end local**: `eve dev --no-ui` + `POST /eve/v1/dev/schedules/discover` (route de dispatch dev-only) contra X API real, GitHub real y GLM real → verificar que el commit llega al repo del skill y el cursor avanza.
- **Eval de criterio**: los tweets reales de esta semana como casos (Hydrogen/containers/WebSockets → publica; Mercedes F1 → descarta), verificados en la corrida e2e.

## Fuera de alcance (por ahora)

- xmcp en el path de producción: el tool llama la X API directo (mismo endpoint que xmcp usa por debajo). xmcp queda como herramienta interactiva de desarrollo.
- Canales de eve (Slack/web chat): el agente es headless; si después se quiere un canal para consultarlo, se agrega un archivo en `agent/channels/`.
- Otras fuentes (changelog RSS como trigger primario, otros handles como @nextjs): tools adicionales después.
