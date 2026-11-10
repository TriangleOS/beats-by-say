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
project. Merging to main deploys through `.github/workflows/deploy.yml`. See CLAUDE.md for the rules.
