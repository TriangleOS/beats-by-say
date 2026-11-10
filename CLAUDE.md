# Beats by Say — working notes for Claude

Beats by Say, voice-first beat making for recording artists, part of Triangle OS. Moved off Lovable in November 2026.

## Rules

- Stack: TanStack Start (React 19, Vite) built by nitro into a Cloudflare Worker named `beatsbysay` (preset
  `cloudflare-module`, same setup as Metarial and Lawbooks; free plan: 3 MB gzipped, 10 ms CPU). Supabase (shared
  Triangle OS project `kvpnvqmgxbqxfwqdrrmm`) for sign-in and saved beats. No Lovable packages or Bun lockfiles.
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
- SayMaster (`src/lib/saymaster/`) is the mixing and mastering engine: pure TypeScript on Float32Arrays, run in a
  Web Worker (`worker.ts`, started by `client.ts`), never on the server (the Worker's 10 ms CPU limit). Studio and
  Songwriter render drums, bass and music groups (`renderRoleStems`, `renderSongRoleStems` in `src/lib/render.ts`)
  and send them through `produceBeat`; song mode (`finishSong`) adds the artist's uploaded vocals; `/mastering`
  masters uploads. Loudness is ITU-R BS.1770 (matches pyloudnorm) and the limiter is true-peak, so keep
  `src/test/saymaster.test.ts` passing when touching the DSP. Copy says what it measurably does; no
  "Grammy", "A-list" or "studio-grade guaranteed" claims.
- Database changes go in a new file in `supabase/migrations/`; never edit an applied migration. The deploy workflow
  re-runs every migration on each deploy, so each file must be safe to run twice.

## Deploying

Deploys as the Cloudflare Worker `beatsbysay` (`npm run build`, then `npx wrangler deploy`). Every push to main
runs `.github/workflows/deploy.yml`: `scripts/go-live.mjs pre` runs the migrations and adds sign-in redirect URLs,
`wrangler deploy` publishes the Worker, then `scripts/go-live.mjs post` saves server secrets on the Worker (only
when missing) and, when the `DOMAIN` repository variable is set, removes the old Lovable DNS records and attaches
the domain to the Worker. Server secrets live in the Worker's settings, never in the repo. Repository secrets:
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_ACCESS_TOKEN`, `GEMINI_API_KEY` (optional
`TRIANGLE_LLM_URL`, `TRIANGLE_LLM_API_KEY`).

## Checks before pushing

```bash
npm run build        # also regenerates src/routeTree.gen.ts
npx tsc --noEmit
npm test
```
