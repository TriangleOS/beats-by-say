# Beats by Say

Describe or say the beat you hear and get an instrumental to record your own vocals over: a 16-step loop, a full
arranged song, WAV and stems downloads. Free while we build it. Part of Triangle OS, operated by Finsec Associates
Limited, trading as TriangleOS.

```bash
npm ci
npm run dev
npm run build && npx tsc --noEmit && npm test
```

Hosting is the Cloudflare Worker `beatsbysay`; sign-in and saved beats use the shared Triangle OS Supabase
project. Cloudflare Workers Builds deploys every push to main, as for Metarial and Lawbooks; server secrets live
in the Worker's settings, not in GitHub. See CLAUDE.md for the rules.

## SayMaster

The mixing and mastering engine (`src/lib/saymaster/`), running in the browser in a Web Worker:

- **Beat mode** (Studio, Songwriter): drums, bass and music stems are enhanced (transient shaping, mono low end with
  harmonics for small speakers, mud cuts), balanced to the genre, the bass ducks under the kick, a vocal pocket is
  left at 1.5-5 kHz, and the result is mastered 3 LU under release loudness. Delivers a vocal-ready beat, a clean
  beat with identical master settings, and the processed stems.
- **Song mode** (Songwriter, `/mastering`): the artist's lead and backing vocals get a vocal chain (gate, EQ,
  two-stage compression, split-band de-esser, presence, reverb, tempo-synced delay); the music ducks only while
  they sing; the song is mastered at release loudness. Delivers main, instrumental, acapella and TV mix, all with
  the main master's settings.
- **Master mode** (`/mastering`): any uploaded stereo file.
- Mastering chain: clean-up, adaptive tonal balance against a genre curve, 3-band Linkwitz-Riley compression, air
  exciter, mono lows and wide highs, saturation, glue, ITU-R BS.1770 loudness targeting and a look-ahead true-peak
  limiter. Output is 24-bit WAV and dithered 16-bit WAV with a JSON measurement report.

It is a TypeScript port of the Python SayMaster reference implementation; integrated loudness matches pyloudnorm
to 0.001 LU and every preset lands within 0.2 LU of target with true peak under the ceiling.
