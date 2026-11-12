import { describe, expect, it } from "vitest";
import { chatCompletion, workersAiCompletion } from "@/lib/llm.server";

describe("Workers AI fallback", () => {
  it("sends text-only messages with JSON mode and returns the object as text", async () => {
    let seen: Record<string, unknown> = {};
    const ai = {
      run: async (_model: string, input: Record<string, unknown>) => {
        seen = input;
        return { response: { title: "Night Drive", bpm: 140 } };
      },
    };
    const text = await workersAiCompletion(
      ai,
      [
        { role: "system", content: "Make a beat" },
        {
          role: "user",
          content: [
            { type: "text", text: "dark drill" },
            { type: "image_url", image_url: { url: "x" } },
          ],
        },
      ],
      true,
    );
    expect(JSON.parse(text)).toEqual({ title: "Night Drive", bpm: 140 });
    expect(seen["response_format"]).toEqual({ type: "json_object" });
    expect((seen["messages"] as { content: string }[])[1]!.content).toBe("dark drill\n");
  });

  it("still reports a missing backend outside the Workers runtime", async () => {
    const saved = { ...process.env };
    delete process.env["GEMINI_API_KEY"];
    delete process.env["TRIANGLE_LLM_URL"];
    await expect(chatCompletion([{ role: "user", content: "hi" }])).rejects.toThrow(
      /No AI backend/,
    );
    process.env = saved;
  });
});
