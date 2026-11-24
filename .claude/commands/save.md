---
description: Save a short hand-off so the next session starts without re-reading the repo
---
Write `.claude/session/HANDOFF.md` in the project root (create the folder; overwrite the file). Keep it under 40 lines:

## Task
One line: what we are doing and why.
## State
Branch, what works, what is half-done, tests run and result.
## Next
The exact next action, then the 2–3 after it.
## Key files
`path` — one line each, only files the next session must touch.
## Decisions
Only choices made this session with a one-line reason. Skip if none.

If a decision is a lasting project rule, also propose one line for the project's CLAUDE.md and ask before writing it.
Do not paste code or logs into the hand-off. Reply with one line: "Saved hand-off."
