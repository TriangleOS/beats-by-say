import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

type SectionParts = { drums: boolean; hats: boolean; bass: boolean; chords: boolean; melody: boolean };

const full = { drums: true, hats: true, bass: true, chords: true, melody: true };

export type ArrangedSection = {
  name: string;
  bars: number;
  parts: SectionParts;
};

const DEFAULT_SECTIONS: ArrangedSection[] = [
  { name: "Intro", bars: 4, parts: { ...full, drums: false, bass: false, melody: false } },
  { name: "Verse 1", bars: 8, parts: { ...full, melody: false } },
  { name: "Pre-chorus", bars: 4, parts: { ...full } },
  { name: "Chorus 1", bars: 8, parts: { ...full } },
  { name: "Verse 2", bars: 8, parts: { ...full, melody: false } },
  { name: "Chorus 2", bars: 8, parts: { ...full } },
  { name: "Bridge", bars: 4, parts: { ...full, drums: false, hats: false } },
  { name: "Final chorus", bars: 8, parts: { ...full } },
  { name: "Outro", bars: 4, parts: { ...full, drums: false, bass: false, melody: false } },
];

const SYSTEM = `You are a song arranger for instrumental backing tracks (never vocals).
Given a beat and the artist's brief, lay out a full song structure a singer or rapper can record over.
Rules:
- 5 to 12 sections in playing order, using names like Intro, Verse 1, Pre-chorus, Chorus 1, Bridge, Outro.
- bars must be 2, 4, 8 or 16. Total song length should land between 2 and 4 minutes.
- Drop instruments in intros, bridges and outros so the arrangement breathes.
- Choruses are the fullest sections. Leave space for a lead vocal throughout.
Reply with one JSON object only: {"sections": [{"name", "bars", "drums", "hats", "bass", "chords", "melody"}]},
where drums, hats, bass, chords and melody are true or false for whether that part plays in the section.`;

function clampBars(value: unknown) {
  const n = Math.round(Number(value) || 4);
  if (n <= 2) return 2;
  if (n <= 4) return 4;
  if (n <= 8) return 8;
  return 16;
}

export const arrangeSong = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        brief: z.string().min(2).max(2000),
        title: z.string().max(200).optional(),
        bpm: z.number().min(40).max(220).optional(),
        key: z.string().max(60).optional(),
        token: z.string().min(10).max(4000),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ sections: ArrangedSection[]; source: "ai" | "default" }> => {
    const { userIdFromToken } = await import("./user.server");
    await userIdFromToken(data.token);
    try {
      const { chatCompletion, parseJsonReply } = await import("./llm.server");
      const reply = await chatCompletion(
        [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: `Beat: ${data.title ?? "untitled"} · ${data.bpm ?? 90} BPM · ${data.key ?? "unknown key"}.
Artist brief: ${data.brief}`,
          },
        ],
        { json: true },
      );
      const parsed = parseJsonReply<{ sections?: Array<Record<string, unknown>> }>(reply);
      const sections = (parsed.sections ?? []).slice(0, 12).map((s) => ({
        name: typeof s["name"] === "string" && s["name"].trim() ? s["name"].trim() : "Section",
        bars: clampBars(s["bars"]),
        parts: {
          drums: s["drums"] !== false,
          hats: s["hats"] !== false,
          bass: s["bass"] !== false,
          chords: s["chords"] !== false,
          melody: s["melody"] !== false,
        },
      }));
      if (sections.length < 3) return { sections: DEFAULT_SECTIONS, source: "default" };
      return { sections, source: "ai" };
    } catch (error) {
      console.error("Arrangement failed, using the default:", error);
      return { sections: DEFAULT_SECTIONS, source: "default" };
    }
  });

export const defaultArrangement = DEFAULT_SECTIONS;
