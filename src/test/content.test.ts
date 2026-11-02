import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FALLBACK_SPEC, normalizeSpec, noteToFreq } from "@/lib/beat-spec";
import { buildLmmsProject } from "@/lib/lmms";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "test" ? [] : files(p);
    return /\.(tsx?|css)$/.test(name) && !name.endsWith(".gen.ts") ? [p] : [];
  });
}
const source = files("src").map((f) => [f, readFileSync(f, "utf8")] as const);
const clientSource = source.filter(([f]) => !f.endsWith(".server.ts"));

const BANNED: [RegExp, string][] = [
  [/lovable/i, "Lovable"],
  [/\b114 stores\b|\d+ stores and (streaming )?services/i, "store distribution claims"],
  [/keep 100%|100% of your rights|you own 100%/i, "100% ownership promises"],
  [/no ai stigma|nothing to declare/i, "AI non-disclosure claims"],
  [/paddle/i, "Paddle checkout"],
  [/data never leaves the UK/i, "UK residency claim"],
  [/world.?s first|exclusive licen/i, "exclusive or world-first claims"],
  [/[£$]\s?\d/, "prices"],
];

describe("site copy", () => {
  for (const [re, what] of BANNED) {
    it(`has no ${what}`, () => {
      expect(source.filter(([, text]) => re.test(text)).map(([f]) => f)).toEqual([]);
    });
  }

  it("keeps AI keys out of browser code", () => {
    expect(clientSource.filter(([, t]) => /GEMINI_API_KEY|generativelanguage/.test(t)).map(([f]) => f)).toEqual([]);
  });

  it("uses only the shared beatsbysay_ tables", () => {
    for (const [f, text] of source) {
      for (const m of text.matchAll(/\.from\(["'`]([a-z_]+)["'`]\)/g)) expect(m[1], f).toMatch(/^beatsbysay_/);
    }
  });

  it("names the operator", () => {
    expect(source.map(([, t]) => t).join("\n")).toContain("Finsec Associates Limited, trading as TriangleOS");
  });
});

describe("beat engine", () => {
  it("fills missing fields and clamps ranges", () => {
    const spec = normalizeSpec({ bpm: 999, kick: "x", fx: { reverb: 5, delay: -1, drive: 0.2 } } as never);
    expect(spec.bpm).toBe(200);
    expect(spec.kick).toHaveLength(16);
    expect(spec.fx.reverb).toBe(1);
    expect(spec.fx.delay).toBe(0);
    expect(spec.bassSteps).toHaveLength(16);
  });

  it("turns notes into frequencies", () => {
    expect(noteToFreq("A4")).toBeCloseTo(440);
    expect(noteToFreq("nope")).toBeNull();
  });

  it("writes an LMMS project at the beat's tempo", () => {
    const xml = buildLmmsProject(FALLBACK_SPEC, [{ file: "01-kick.wav", name: "Kick & <co>" }], 4);
    expect(xml).toContain(`bpm="${FALLBACK_SPEC.bpm}"`);
    expect(xml).toContain("Kick &amp; &lt;co&gt;");
  });
});
