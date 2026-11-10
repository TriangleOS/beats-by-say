/**
 * SayMaster pipelines.
 *
 * Beat mode (production-first, what the vocalist takes to the booth):
 *   stems -> enhance -> balance + sidechain -> vocal pocket -> master 3 LU under release loudness.
 *   Delivers a vocal-ready master, a clean master with identical settings, and the enhanced stems.
 *
 * Song mode (the vocalist's recorded vocals finish the record):
 *   stems -> enhance -> balance + sidechain -> vocal chain -> dynamic pocket -> vocals placed -> release master.
 *   Delivers main, instrumental, acapella and TV mix, all with the main master's settings.
 *
 * Master mode: a single stereo file (an uploaded beat or mix), mastered without stems.
 */
import { analyse, master, type Analysis, type MasterReport } from "./master";
import { fit, len, peak, scale, sum, type Stereo } from "./dsp";
import { PRESETS, VOCAL_HEADROOM_LU, type PresetName } from "./presets";
import {
  balance,
  dynamicPocket,
  enhance,
  placeVocals,
  sidechainBass,
  staticPocket,
  vocalBuses,
  type RoleStems,
} from "./production";

export type Progress = (stage: string, done: number, total: number) => void;

export type Report = {
  mode: "beat" | "song" | "master";
  preset: PresetName;
  presetLabel: string;
  balanceMovesDb?: Record<string, number>;
  before?: Analysis;
  after: Analysis;
  master: Omit<MasterReport, "settings">;
};

export type Output = { name: string; audio: Stereo };
export type Result = { outputs: Output[]; stems: Output[]; report: Report };

const noop: Progress = () => {};
const strip = (r: MasterReport) => {
  const { settings: _s, ...rest } = r;
  return rest;
};

/** Stems share one gain so they still sum to the mix, peaking at -1 dBFS together. */
function stemPack(stems: RoleStems): Output[] {
  const entries = Object.entries(stems).filter((e): e is [string, Stereo] => !!e[1]);
  const pk = Math.max(
    1e-9,
    peak(sum(...entries.map(([, s]) => s))),
    ...entries.map(([, s]) => peak(s)),
  );
  const g = 10 ** (-1 / 20) / pk;
  return entries.map(([role, s]) => ({ name: role, audio: scale(s, g) }));
}

/** `reference` is what the artist would otherwise download (the plain export); it fills the report's "before". */
export function produceBeat(
  raw: RoleStems,
  sr: number,
  preset: PresetName,
  progress: Progress = noop,
  reference?: Stereo,
): Result {
  progress("Enhancing stems", 1, 5);
  const before = reference ? analyse(reference, sr) : undefined;
  const enhanced = enhance(raw, sr, preset);
  progress("Mixing", 2, 5);
  const bal = balance(enhanced, sr, preset);
  const stems = sidechainBass(bal.stems, sr);
  const clean = sum(stems.drums, stems.bass, stems.music, stems.mix);
  const pocket = sum(
    stems.drums,
    stems.bass,
    stems.music ? staticPocket(stems.music, sr) : null,
    stems.mix ? staticPocket(stems.mix, sr) : null,
  );
  progress("Mastering", 3, 5);
  const target = PRESETS[preset].lufs - VOCAL_HEADROOM_LU;
  const main = master(pocket, sr, preset, { lufs: target });
  progress("Matching the clean version", 4, 5);
  const alt = master(clean, sr, preset, { lufs: target, replay: main.report.settings });
  progress("Checking the master", 5, 5);
  return {
    outputs: [
      { name: "beat-vocal-ready", audio: main.y },
      { name: "beat-clean", audio: alt.y },
    ],
    stems: stemPack(stems),
    report: {
      mode: "beat",
      preset,
      presetLabel: PRESETS[preset].label,
      balanceMovesDb: bal.moves,
      before,
      after: analyse(main.y, sr),
      master: strip(main.report),
    },
  };
}

export function finishSong(
  raw: RoleStems,
  leads: Stereo[],
  backs: Stereo[],
  sr: number,
  preset: PresetName,
  bpm: number,
  progress: Progress = noop,
  lufsTarget?: number,
): Result {
  if (!leads.length) throw new Error("Add at least one lead vocal.");
  progress("Enhancing stems", 1, 6);
  const enhanced = enhance(raw, sr, preset);
  const bal = balance(enhanced, sr, preset);
  let stems = sidechainBass(bal.stems, sr);
  progress("Processing vocals", 2, 6);
  let { lead, back } = vocalBuses(leads, backs, sr, bpm);
  const n = Math.max(
    ...Object.values(stems).map((s) => (s ? len(s) : 0)),
    lead ? len(lead) : 0,
    back ? len(back) : 0,
  );
  stems = Object.fromEntries(
    Object.entries(stems).map(([k, v]) => [k, v ? fit(v, n) : v]),
  ) as RoleStems;
  lead = lead ? fit(lead, n) : null;
  back = back ? fit(back, n) : null;
  progress("Mixing vocals into the beat", 3, 6);
  const vox = sum(lead, back);
  if (stems.music) stems = { ...stems, music: dynamicPocket(stems.music, vox, sr) };
  if (stems.mix) stems = { ...stems, mix: dynamicPocket(stems.mix, vox, sr) };
  const beat = sum(stems.drums, stems.bass, stems.music, stems.mix);
  ({ lead, back } = placeVocals(beat, lead, back, sr, preset));
  progress("Mastering the song", 4, 6);
  const main = master(sum(beat, lead, back), sr, preset, { lufs: lufsTarget });
  progress("Matching instrumental, acapella and TV mix", 5, 6);
  const replay = { lufs: lufsTarget, replay: main.report.settings };
  const outputs: Output[] = [
    { name: "main", audio: main.y },
    { name: "instrumental", audio: master(beat, sr, preset, replay).y },
    { name: "acapella", audio: master(sum(lead, back), sr, preset, replay).y },
  ];
  if (back) outputs.push({ name: "tv-mix", audio: master(sum(beat, back), sr, preset, replay).y });
  progress("Checking the master", 6, 6);
  return {
    outputs,
    stems: stemPack({
      ...stems,
      ...(lead ? { "lead-vocal": lead } : {}),
      ...(back ? { "backing-vocals": back } : {}),
    } as RoleStems),
    report: {
      mode: "song",
      preset,
      presetLabel: PRESETS[preset].label,
      balanceMovesDb: bal.moves,
      after: analyse(main.y, sr),
      master: strip(main.report),
    },
  };
}

export function masterFile(
  x: Stereo,
  sr: number,
  preset: PresetName,
  progress: Progress = noop,
  lufsTarget?: number,
): Result {
  progress("Analysing", 1, 3);
  const before = analyse(x, sr);
  progress("Mastering", 2, 3);
  const m = master(x, sr, preset, { lufs: lufsTarget });
  progress("Checking the master", 3, 3);
  return {
    outputs: [{ name: "master", audio: m.y }],
    stems: [],
    report: {
      mode: "master",
      preset,
      presetLabel: PRESETS[preset].label,
      before,
      after: analyse(m.y, sr),
      master: strip(m.report),
    },
  };
}
