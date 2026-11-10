/**
 * Shared studio-grade DSP core. Every instrument and the master chain run on
 * BaseAudioContext, so live playback (AudioContext) and file rendering
 * (OfflineAudioContext) produce the same sound.
 */
import { noteToFreq, type BeatSpec, type FxSettings } from "../beat-spec";

export type MasterChain = {
  /** Dry instrument bus. */
  input: GainNode;
  /** Feed the convolver reverb. */
  reverbSend: GainNode;
  /** Feed the dotted-eighth delay. */
  delaySend: GainNode;
};

function makeImpulse(ctx: BaseAudioContext, seconds: number, decay: number) {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return buffer;
}

function softClipCurve(drive: number) {
  const k = 1 + drive * 30;
  const curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) {
    const x = i / 511.5 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}

export function createMasterChain(
  ctx: BaseAudioContext,
  fx: FxSettings,
  stepDur: number,
  out: AudioNode = ctx.destination,
): MasterChain {
  const input = ctx.createGain();
  input.gain.value = 1;

  const shaper = ctx.createWaveShaper();
  shaper.curve = softClipCurve(fx.drive);
  shaper.oversample = "2x";

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 18;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.18;

  const master = ctx.createGain();
  master.gain.value = 0.85;
  input.connect(shaper);
  shaper.connect(comp);
  comp.connect(master);
  master.connect(out);

  // Reverb: generated stereo impulse, ~2.2s tail.
  const reverbSend = ctx.createGain();
  reverbSend.gain.value = fx.reverb;
  const conv = ctx.createConvolver();
  conv.buffer = makeImpulse(ctx, 2.2, 2.4);
  const revOut = ctx.createGain();
  revOut.gain.value = 0.8;
  input.connect(reverbSend);
  reverbSend.connect(conv);
  conv.connect(revOut);
  revOut.connect(master);

  // Dotted-eighth feedback delay, darkened so it sits behind the dry signal.
  const delaySend = ctx.createGain();
  delaySend.gain.value = fx.delay;
  const delay = ctx.createDelay(2);
  delay.delayTime.value = stepDur * 3;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.32;
  const dampen = ctx.createBiquadFilter();
  dampen.type = "lowpass";
  dampen.frequency.value = 3200;
  const delOut = ctx.createGain();
  delOut.gain.value = 0.5;
  input.connect(delaySend);
  delaySend.connect(delay);
  delay.connect(dampen);
  dampen.connect(feedback);
  feedback.connect(delay);
  dampen.connect(delOut);
  delOut.connect(master);

  return { input, reverbSend, delaySend };
}

/** Humanised velocity so repeated hits don't sound machine-gunned. */
function vel(base: number) {
  return base * (0.88 + Math.random() * 0.12);
}

function noiseSource(ctx: BaseAudioContext, seconds = 0.5) {
  const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * seconds)), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  return src;
}

type Sends = { reverb?: number; delay?: number };

function connectWithSends(
  ctx: BaseAudioContext,
  node: AudioNode,
  chain: MasterChain,
  sends?: Sends,
) {
  node.connect(chain.input);
  if (sends?.reverb) {
    const g = ctx.createGain();
    g.gain.value = sends.reverb;
    node.connect(g);
    g.connect(chain.reverbSend);
  }
  if (sends?.delay) {
    const g = ctx.createGain();
    g.gain.value = sends.delay;
    node.connect(g);
    g.connect(chain.delaySend);
  }
}

/** Layered kick: pitch-dropped sub sine + click transient. */
export function kick(ctx: BaseAudioContext, chain: MasterChain, t: number, level = 1) {
  const v = vel(level);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.setValueAtTime(160, t);
  osc.frequency.exponentialRampToValueAtTime(42, t + 0.11);
  gain.gain.setValueAtTime(v, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
  osc.connect(gain);
  connectWithSends(ctx, gain, chain);
  osc.start(t);
  osc.stop(t + 0.45);

  const click = noiseSource(ctx, 0.05);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1500;
  const cg = ctx.createGain();
  cg.gain.setValueAtTime(v * 0.35, t);
  cg.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
  click.connect(hp);
  hp.connect(cg);
  connectWithSends(ctx, cg, chain);
  click.start(t);
  click.stop(t + 0.05);
}

/** Snare: bandpassed noise crack + 190Hz body. */
export function snare(ctx: BaseAudioContext, chain: MasterChain, t: number, level = 1) {
  const v = vel(level);
  const noise = noiseSource(ctx, 0.3);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1800;
  bp.Q.value = 0.9;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(v * 0.7, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.19);
  noise.connect(bp);
  bp.connect(ng);
  connectWithSends(ctx, ng, chain, { reverb: 0.35 });
  noise.start(t);
  noise.stop(t + 0.25);

  const body = ctx.createOscillator();
  body.type = "triangle";
  body.frequency.setValueAtTime(195, t);
  body.frequency.exponentialRampToValueAtTime(140, t + 0.08);
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(v * 0.5, t);
  bg.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
  body.connect(bg);
  connectWithSends(ctx, bg, chain);
  body.start(t);
  body.stop(t + 0.15);
}

/** Clap: three tight noise bursts through a bandpass. */
export function clap(ctx: BaseAudioContext, chain: MasterChain, t: number, level = 1) {
  const v = vel(level);
  for (let burst = 0; burst < 3; burst++) {
    const bt = t + burst * 0.011;
    const noise = noiseSource(ctx, 0.3);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1250;
    bp.Q.value = 1.6;
    const g = ctx.createGain();
    const peak = burst === 2 ? v * 0.8 : v * 0.45;
    g.gain.setValueAtTime(peak, bt);
    g.gain.exponentialRampToValueAtTime(0.001, bt + (burst === 2 ? 0.28 : 0.04));
    noise.connect(bp);
    bp.connect(g);
    connectWithSends(ctx, g, chain, { reverb: 0.5 });
    noise.start(bt);
    noise.stop(bt + 0.32);
  }
}

/** Metallic hat: highpassed noise + detuned square partials. */
export function hat(
  ctx: BaseAudioContext,
  chain: MasterChain,
  t: number,
  open: boolean,
  level = 1,
) {
  const v = vel(level);
  const dur = open ? 0.32 : 0.05;
  const noise = noiseSource(ctx, dur + 0.05);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 7800;
  const g = ctx.createGain();
  g.gain.setValueAtTime(v * 0.4, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  noise.connect(hp);
  hp.connect(g);
  connectWithSends(ctx, g, chain, open ? { reverb: 0.25 } : undefined);
  noise.start(t);
  noise.stop(t + dur + 0.05);

  for (const f of [9210, 11430, 13770]) {
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = f * (0.99 + Math.random() * 0.02);
    const og = ctx.createGain();
    og.gain.setValueAtTime(v * 0.05, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.6);
    osc.connect(og);
    connectWithSends(ctx, og, chain);
    osc.start(t);
    osc.stop(t + dur);
  }
}

/** Short percussion tick — woodblock-ish tuned knock. */
export function perc(ctx: BaseAudioContext, chain: MasterChain, t: number, level = 1) {
  const v = vel(level);
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(820 + Math.random() * 120, t);
  osc.frequency.exponentialRampToValueAtTime(420, t + 0.05);
  const g = ctx.createGain();
  g.gain.setValueAtTime(v * 0.5, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  osc.connect(g);
  connectWithSends(ctx, g, chain, { delay: 0.3 });
  osc.start(t);
  osc.stop(t + 0.12);
}

/**
 * 808 / sub bass with glide. Pass the previous note's frequency as glideFrom
 * for sliding 808s; the note sustains for `dur` seconds with a saturated edge.
 */
export function bass808(
  ctx: BaseAudioContext,
  chain: MasterChain,
  t: number,
  note: string,
  dur: number,
  level = 1,
  glideFrom?: number | null,
) {
  const freq = noteToFreq(note);
  if (!freq) return null;
  const v = vel(level);
  const osc = ctx.createOscillator();
  osc.type = "sine";
  if (glideFrom && Math.abs(glideFrom - freq) > 1) {
    osc.frequency.setValueAtTime(glideFrom, t);
    osc.frequency.exponentialRampToValueAtTime(freq, t + 0.06);
  } else {
    osc.frequency.setValueAtTime(freq, t);
  }

  const drive = ctx.createWaveShaper();
  drive.curve = softClipCurve(0.35);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 520;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(v * 0.85, t + 0.015);
  g.gain.setValueAtTime(v * 0.85, t + Math.max(0.02, dur - 0.08));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  osc.connect(drive);
  drive.connect(lp);
  lp.connect(g);
  connectWithSends(ctx, g, chain);
  osc.start(t);
  osc.stop(t + dur + 0.05);
  return freq;
}

/** Warm detuned pad/stab chord: stacked saws through an opening lowpass. */
export function chordPad(
  ctx: BaseAudioContext,
  chain: MasterChain,
  t: number,
  notes: string[],
  dur: number,
  level = 1,
) {
  const v = vel(level);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(700, t);
  lp.frequency.linearRampToValueAtTime(2400, t + dur * 0.4);
  lp.frequency.linearRampToValueAtTime(900, t + dur);
  lp.Q.value = 0.8;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(v * 0.16, t + 0.09);
  g.gain.setValueAtTime(v * 0.16, t + Math.max(0.1, dur - 0.25));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  lp.connect(g);
  connectWithSends(ctx, g, chain, { reverb: 0.55, delay: 0.12 });

  for (const note of notes) {
    const freq = noteToFreq(note);
    if (!freq) continue;
    for (const detune of [-7, 6]) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      osc.detune.value = detune;
      osc.connect(lp);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }
    const sub = ctx.createOscillator();
    sub.type = "triangle";
    sub.frequency.value = freq;
    const sg = ctx.createGain();
    sg.gain.value = 0.5;
    sub.connect(sg);
    sg.connect(lp);
    sub.start(t);
    sub.stop(t + dur + 0.05);
  }
}

/** FM pluck melody with a built-in delay tail. */
export function melodyPluck(
  ctx: BaseAudioContext,
  chain: MasterChain,
  t: number,
  note: string,
  dur: number,
  level = 1,
) {
  const freq = noteToFreq(note);
  if (!freq) return;
  const v = vel(level);

  const carrier = ctx.createOscillator();
  carrier.type = "sine";
  carrier.frequency.value = freq;
  const mod = ctx.createOscillator();
  mod.type = "sine";
  mod.frequency.value = freq * 2.01;
  const modGain = ctx.createGain();
  modGain.gain.setValueAtTime(freq * 1.8, t);
  modGain.gain.exponentialRampToValueAtTime(freq * 0.05, t + Math.min(dur, 0.35));
  mod.connect(modGain);
  modGain.connect(carrier.frequency);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(v * 0.4, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  carrier.connect(g);
  connectWithSends(ctx, g, chain, { reverb: 0.3, delay: 0.55 });
  carrier.start(t);
  mod.start(t);
  carrier.stop(t + dur + 0.05);
  mod.stop(t + dur + 0.05);
}

export type StemName =
  | "full-mix"
  | "kick"
  | "snare"
  | "clap"
  | "hats"
  | "open-hat"
  | "perc"
  | "bass"
  | "chords"
  | "melody"
  | "vocal-guide";

export const STEMS: StemName[] = [
  "full-mix",
  "kick",
  "snare",
  "clap",
  "hats",
  "open-hat",
  "perc",
  "bass",
  "chords",
  "melody",
  "vocal-guide",
];

/** Schedules one 16-step bar of the spec at absolute time `t0`. */
export function scheduleBar(
  ctx: BaseAudioContext,
  chain: MasterChain,
  spec: BeatSpec,
  stem: StemName | readonly StemName[],
  bar: number,
  t0: number,
  stepDur: number,
  lastBassFreq: number | null,
): number | null {
  // A list of stems renders that group together (SayMaster renders drums, bass and music groups).
  const wants = (part: StemName) =>
    Array.isArray(stem) ? stem.includes(part) : stem === "full-mix" || stem === part;
  const barDur = stepDur * 16;

  if (stem !== "vocal-guide") {
    for (let i = 0; i < 16; i++) {
      const swingOffset = i % 2 === 1 ? spec.swing * stepDur * 0.5 : 0;
      const t = t0 + i * stepDur + swingOffset;

      if (wants("kick") && spec.kick[i] === "x") kick(ctx, chain, t, spec.mix.kick);
      if (wants("snare") && spec.snare[i] === "x") snare(ctx, chain, t, spec.mix.snare);
      if (wants("clap") && spec.clap[i] === "x") clap(ctx, chain, t, spec.mix.clap);
      if (wants("hats") && spec.hat[i] === "x") hat(ctx, chain, t, false, spec.mix.hats);
      if (wants("open-hat") && spec.openHat[i] === "x") hat(ctx, chain, t, true, spec.mix.hats);
      if (wants("perc") && spec.perc[i] === "x") perc(ctx, chain, t, spec.mix.perc);

      const bassNote = spec.bassSteps[i];
      if (wants("bass") && bassNote && bassNote !== "-") {
        const freq = bass808(ctx, chain, t, bassNote, stepDur * 3, spec.mix.bass, lastBassFreq);
        if (freq) lastBassFreq = freq;
      }

      const melodyNote = spec.melody[i];
      if (wants("melody") && melodyNote && melodyNote !== "-") {
        melodyPluck(ctx, chain, t, melodyNote, stepDur * 2.2, spec.mix.melody);
      }
    }

    if (wants("chords")) {
      const chord = spec.chordNotes[bar % spec.chordNotes.length] ?? "";
      const notes = chord.split(/[\s,]+/).filter(Boolean);
      if (notes.length > 0) chordPad(ctx, chain, t0, notes, barDur * 0.96, spec.mix.chords);
    }
  }

  return lastBassFreq;
}
