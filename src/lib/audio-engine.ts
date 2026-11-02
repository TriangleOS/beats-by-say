import { normalizeSpec, type BeatSpec } from "./beat-spec";
import { createMasterChain, scheduleBar, type MasterChain } from "./engine/dsp";

export class BeatPlayer {
  private ctx: AudioContext | null = null;
  private chain: MasterChain | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private bar = 0;
  private nextTime = 0;
  private lastBassFreq: number | null = null;
  private spec: BeatSpec | null = null;
  onStep: ((step: number) => void) | null = null;

  async play(input: BeatSpec) {
    this.stop();
    const spec = normalizeSpec(input);
    this.spec = spec;
    const ctx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    await ctx.resume();
    const stepDur = 60 / spec.bpm / 4;
    this.chain = createMasterChain(ctx, spec.fx, stepDur);
    this.ctx = ctx;
    this.bar = 0;
    this.lastBassFreq = null;
    this.nextTime = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  private schedule() {
    const ctx = this.ctx;
    const chain = this.chain;
    const spec = this.spec;
    if (!ctx || !chain || !spec) return;
    const stepDur = 60 / spec.bpm / 4;
    const barDur = stepDur * 16;
    while (this.nextTime < ctx.currentTime + 0.2) {
      const t0 = this.nextTime;
      const bar = this.bar;
      this.lastBassFreq = scheduleBar(
        ctx,
        chain,
        spec,
        "full-mix",
        bar,
        t0,
        stepDur,
        this.lastBassFreq,
      );

      if (this.onStep) {
        for (let i = 0; i < 16; i++) {
          const swingOffset = i % 2 === 1 ? spec.swing * stepDur * 0.5 : 0;
          const delay = (t0 + i * stepDur + swingOffset - ctx.currentTime) * 1000;
          setTimeout(() => this.onStep?.(i), Math.max(0, delay));
        }
      }

      this.nextTime += barDur;
      this.bar += 1;
    }
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.ctx) void this.ctx.close();
    this.ctx = null;
    this.chain = null;
  }

  get isPlaying() {
    return this.timer !== null;
  }
}
