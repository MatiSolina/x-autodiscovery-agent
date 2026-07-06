# Launch posts — x-autodiscovery

## Post 1/3 (el principal)

Vercel is my favorite company but TBH, in the last few days alone they shipped like 10 important things: containers, WebSockets, VCR, Service Bindings, AI SDK 7...

I asked Claude which ones we could evaluate for our projects, and realized my agent didn't know about any of them yet. Neither did the official skills.

So I built a skill that keeps itself up to date: an autonomous agent watches @vercel 24/7 and updates the skill every time they ship.

Now agents always know what Vercel launched minutes after it happens.

Try it now:

🔗 npx skills add MatiSolina/x-autodiscovery
📦 https://www.skills.sh/matisolina/x-autodiscovery

(Ojo: nunca publicar empezando con "@vercel" — X lo trata como reply y le mata el alcance.)

## Post 2/3 (el cómo + fork it)

How it works: an agent built with eve (@evedev_) runs on a Vercel cron every 15 min → pulls new @vercel posts → detects real launches → reads the vercel.com docs → commits a changelog entry to the skill repo. Zero humans in the loop, ~$2/month.

Best part: the skill tells YOUR agent to fetch the latest version from GitHub raw at runtime — installed copies never go out of date.

Fork it and point it at any account you want to track:
⭐ https://github.com/MatiSolina/x-autodiscovery-agent

## Post 3/3 (la prueba + CTA)

The payoff: I asked my agent "can Vercel run my Docker container?" with the skill installed.

"Yes, since June 30 — rename it Dockerfile.vercel, bind $PORT, vercel deploy." With docs link and dated announcement.

My agents now evaluate Vercel launches the week they ship.

npx skills add MatiSolina/x-autodiscovery
📦 https://skills.sh/MatiSolina/x-autodiscovery

## Variante corta del Post 1 (si no tenés X Premium — cabe en 280)

Vercel shipped ~10 big things last week. My AI agents didn't know about any of them. Neither did the official skills.

So I built a skill that updates itself — an agent watches @vercel 24/7 and rewrites it on every launch.

npx skills add MatiSolina/x-autodiscovery

## Notas de publicación

- Publicar como thread (1 → 2 → 3 encadenados) para que el algoritmo los agrupe.
- Post 1 se sostiene solo: historia + solución + install. La mayoría no pasa de ahí.
- Adjuntar imagen en el post 3 si hay: screenshot de la respuesta del agente con el skill (la comparación visual es lo más compartible).
- Taguear @evedev_ solo en el post 2 (chance de RT; Vercel viene RTeando contenido de eve).
- Mejor horario: martes-jueves 9-11am ET (audiencia dev US).
- Después de publicar: responder el propio thread con el link al README "Build your own updater bot" si hay tracción.
