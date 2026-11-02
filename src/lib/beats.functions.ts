import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { normalizeSpec, type BeatSpec } from "./beat-spec";

// The model writes a beat sheet (patterns, notes, mix); the browser's own audio engine plays and renders it.
const SYSTEM = `You are a professional beatmaker producing instrumental backing tracks (no vocals) for recording artists.
Turn the artist's request into ONE bar of a 16-step loop plus a 4-bar chord progression, with a full production mix.
Reply with one JSON object only, with exactly these keys:
title (short name), bpm (50-200), key (e.g. "F minor"), mood (2-4 words), genre (sub-genre), description (one sentence),
swing (0-0.6), kick, snare, clap, hat, openHat, perc (each exactly 16 characters of "x" = hit or "-" = rest),
bassSteps (16 entries, each "-" or a note like "C2", "Eb2", "F#1"; octave 1-2),
chordNotes (4 strings, each a bar of space-separated notes like "C3 Eb3 G3 Bb3"; octave 2-4),
melody (16 entries, each "-" or a note like "C4"; octave 3-5; sparse, mostly rests so the vocalist has room),
fx {reverb, delay, drive} each 0-1, mix {kick, snare, clap, hats, perc, bass, chords, melody} each 0-1.
Guidance:
- swing: 0 for rigid trap/drill, 0.12-0.2 for boom bap and R&B, up to 0.35 for swung grooves.
- fx: reverb 0.1-0.4 (higher for ambient/cinematic), delay 0-0.3, drive 0.1-0.5 (higher for gritty genres).
- mix: kick and bass loudest, hats and percussion lower.
- Match the genre's real drum vocabulary: drill = sliding 808 bass notes and off-grid hats; boom bap = swung kicks and snare on 5 and 13; afrobeats = syncopated perc and log-drum-style bass.
- Leave space for vocals: avoid busy melodies in the vocal range.`;

const Input = z.object({ prompt: z.string().min(2).max(2000), token: z.string().min(10).max(4000) });

export const generateBeat = createServerFn({ method: "POST" })
  .validator((input: unknown) => Input.parse(input))
  .handler(async ({ data }): Promise<{ spec: BeatSpec; prompt: string }> => {
    const { userIdFromToken } = await import("./user.server");
    await userIdFromToken(data.token);
    const { chatCompletion, parseJsonReply } = await import("./llm.server");
    const reply = await chatCompletion(
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: data.prompt },
      ],
      { json: true },
    );
    return { spec: normalizeSpec(parseJsonReply<Partial<BeatSpec>>(reply)), prompt: data.prompt };
  });
