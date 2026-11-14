import { afterEach, describe, expect, it, vi } from "vitest";
import { allowedAudioUrl, instrumentalStatus, stemStatus, studioBrief } from "@/lib/studio.server";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const reply = (data: unknown) =>
  vi.fn(async () => new Response(JSON.stringify({ code: 200, msg: "success", data })));

describe("studio engine", () => {
  it("builds an instrumental brief within the service's limits", () => {
    const b = studioBrief("x".repeat(3000), {
      title: "T".repeat(120),
      bpm: 142,
      key: "F minor",
      mood: "cold",
      genre: "UK drill",
    } as never);
    expect(b.preset).toBe("drill");
    expect(b.style.length).toBeLessThanOrEqual(1000);
    expect(b.title.length).toBeLessThanOrEqual(80);
    expect(b.style).toContain("142 BPM");
    expect(b.negativeTags).toMatch(/vocals/);
  });

  it("only proxies the music service's audio hosts", () => {
    expect(allowedAudioUrl("https://file.aiquickdraw.com/a.mp3")).not.toBeNull();
    expect(allowedAudioUrl("https://cdn1.suno.ai/a.mp3")).not.toBeNull();
    expect(allowedAudioUrl("http://file.aiquickdraw.com/a.mp3")).toBeNull();
    expect(allowedAudioUrl("https://evil.com/?file.aiquickdraw.com")).toBeNull();
    expect(allowedAudioUrl("https://aiquickdraw.com.evil.com/a")).toBeNull();
    expect(allowedAudioUrl("not a url")).toBeNull();
  });

  it("reads generation status", async () => {
    vi.stubEnv("SUNOAPI_KEY", "k");
    vi.stubGlobal(
      "fetch",
      reply({
        status: "FIRST_SUCCESS",
        response: {
          sunoData: [
            { id: "a1", audioUrl: "https://file.aiquickdraw.com/1.mp3", duration: 120 },
            { id: "a2" },
          ],
        },
      }),
    );
    const r = await instrumentalStatus("t1");
    expect(r.state).toBe("partial");
    expect(r.tracks.map((t) => t.id)).toEqual(["a1"]);
  });

  it("groups instrument stems into SayMaster roles and skips vocals", async () => {
    vi.stubEnv("SUNOAPI_KEY", "k");
    vi.stubGlobal(
      "fetch",
      reply({
        successFlag: "SUCCESS",
        response: {
          drumsUrl: "https://x.aiquickdraw.com/d.mp3",
          percussionUrl: "https://x.aiquickdraw.com/p.mp3",
          bassUrl: "https://x.aiquickdraw.com/b.mp3",
          synthUrl: "https://x.aiquickdraw.com/s.mp3",
          vocalUrl: "https://x.aiquickdraw.com/v.mp3",
          guitarUrl: null,
        },
      }),
    );
    const r = await stemStatus("s1");
    expect(r.state).toBe("done");
    expect(r.stems.map((s) => `${s.name}:${s.role}`).sort()).toEqual([
      "bass:bass",
      "drums:drums",
      "percussion:drums",
      "synth:music",
    ]);
  });

  it("reports failures and refuses without a key", async () => {
    vi.stubEnv("SUNOAPI_KEY", "k");
    vi.stubGlobal("fetch", reply({ successFlag: "GENERATE_AUDIO_FAILED", errorMessage: "nope" }));
    expect((await stemStatus("s1")).state).toBe("failed");
    vi.stubEnv("SUNOAPI_KEY", "");
    await expect(instrumentalStatus("t")).rejects.toThrow(/switched on/);
  });
});
