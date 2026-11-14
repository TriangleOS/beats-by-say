import { describe, expect, it } from "vitest";
import {
  SOURCE_ROLE,
  engineBrief,
  explain,
  gpuRequest,
  parseEvents,
  takesFor,
} from "@/lib/studio-engine";

describe("studio engine", () => {
  it("writes a caption under ACE-Step's limit with the beat sheet's genre first", () => {
    const b = engineBrief("x".repeat(2000), {
      genre: "UK drill",
      bpm: 142,
      key: "F minor",
      mood: "cold",
    });
    expect(b.preset).toBe("drill");
    expect(b.caption.length).toBeLessThanOrEqual(500);
    expect(b.caption.startsWith("UK drill, cold")).toBe(true);
    expect(b.caption).toMatch(/no vocals/);
    expect(b.bpm).toBe(142);
  });

  it("keeps GPU requests inside a visitor's free daily allowance", () => {
    expect(gpuRequest(60, 2)).toBeLessThanOrEqual(115);
    expect(takesFor(60)).toBe(2);
    expect(takesFor(120)).toBe(1);
    for (const s of [30, 60, 90, 120]) expect(gpuRequest(s, takesFor(s))).toBeLessThanOrEqual(120);
  });

  it("parses Gradio queue events across chunk boundaries", () => {
    const one = 'data: {"msg":"estimation","rank":2}\n\ndata: {"msg":"process_com';
    const a = parseEvents(one);
    expect(a.messages).toEqual([{ msg: "estimation", rank: 2 }]);
    const b = parseEvents(a.rest + 'pleted","success":true,"output":{"data":[1]}}\n\n');
    expect(b.messages[0]).toMatchObject({ msg: "process_completed", output: { data: [1] } });
    expect(b.rest).toBe("");
  });

  it("explains quota errors plainly", () => {
    expect(
      explain(
        "You have exceeded your ZeroGPU quota (180s requested vs. 100s left). Try again in 23:59:21.",
      ),
    ).toMatch(/resets in 23:59:21/);
  });

  it("maps Demucs sources to SayMaster roles", () => {
    expect(SOURCE_ROLE.drums).toBe("drums");
    expect(SOURCE_ROLE.bass).toBe("bass");
    expect(SOURCE_ROLE.other).toBe("music");
  });
});
