# Beats by Say — working notes for Claude

Beats by Say, voice-first beat making for recording artists, part of Triangle OS. Moved off Lovable in November 2026.

## Rules

- Stack: TanStack Start (React 19, Vite) built by nitro for Cloudflare Pages (project `beatsbysay`, preset
  `cloudflare-pages`). Supabase (shared Triangle OS project `kvpnvqmgxbqxfwqdrrmm`) for sign-in and saved beats.
  No Lovable packages or Bun lockfiles.
- The project is shared, so every table starts with `beatsbysay_`. Never add triggers on `auth.users`; the artist
  name lives in the user's own metadata. Types are hand-written in `src/integrations/supabase/types.ts`.
- The browser never holds AI keys. Beat sheets and arrangements come from `chatCompletion()` in
  `src/lib/llm.server.ts` (Triangle LLM first, then free Gemini), behind a signed-in check
  (`src/lib/user.server.ts`). Audio is synthesised and rendered in the browser (`src/lib/engine/dsp.ts`).
  Voice briefs use the browser's speech recognition (`src/lib/speech.ts`).
- Say plainly what works: studio, voice briefs, songwriter, WAV/stems downloads and saved beats are free.
  Marketplace, distribution, royalties and a recorded-sound engine are planned. No "keep 100%", store counts,
  "no AI stigma", prices or fake partners. No "data never leaves the UK". Operator wording:
  "Finsec Associates Limited, trading as TriangleOS".
- Database changes go in a new file in `supabase/migrations/`; never edit an applied migration. The deploy workflow
  re-runs every migration on each deploy, so each file must be safe to run twice.

## Deploying

Every push to main runs `.github/workflows/deploy.yml`: `scripts/go-live.mjs` runs the migrations, adds sign-in
redirect URLs, creates the Pages project, saves `GEMINI_API_KEY` on it, adds the custom domain when the `DOMAIN`
repository variable is set, then `wrangler pages deploy dist`. Secrets: `CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_ACCESS_TOKEN`, `GEMINI_API_KEY`.

## Checks before pushing

```bash
npm run build        # also regenerates src/routeTree.gen.ts
npx tsc --noEmit
npm test
```
