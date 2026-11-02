import type { BeatSpec } from "./beat-spec";

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Builds an LMMS (.mmp) project that loads the exported stem WAVs as
 * audio-file tracks, one per instrument, at the beat's tempo. Open the file
 * in LMMS (free, lmms.io) alongside the stems folder and the full
 * arrangement is ready to mix.
 */
export function buildLmmsProject(
  spec: BeatSpec,
  stems: { file: string; name: string }[],
  bars: number,
): string {
  // LMMS counts time in ticks: 48 per quarter note, 192 per 4/4 bar.
  const totalTicks = bars * 192;
  const tracks = stems
    .map(
      (stem) => `      <track type="0" name="${xmlEscape(stem.name)}" muted="0" solo="0">
        <instrumenttrack vol="100" pan="0" pitch="0" pitchrange="1" fxch="0" basenote="57">
          <instrument name="audiofileprocessor">
            <audiofileprocessor src="${xmlEscape(stem.file)}" amp="100" reversed="0" loop="0" sframe="0" eframe="0"/>
          </instrument>
        </instrumenttrack>
        <pattern type="1" steps="16" pos="0" len="${totalTicks}" name="${xmlEscape(stem.name)}">
          <note key="57" pos="0" len="${totalTicks}" vol="100" pan="0"/>
        </pattern>
      </track>`,
    )
    .join("\n");

  return `<?xml version="1.0"?>
<!DOCTYPE lmms-project>
<lmms-project version="1.2" creator="Beats by Say" creatorversion="1.0" type="song">
  <head timesig_numerator="4" timesig_denominator="4" bpm="${spec.bpm}" masterpitch="0" mastervol="100"/>
  <song>
    <trackcontainer width="600" x="5" y="5" maximized="0" height="300" visible="1" type="song">
${tracks}
    </trackcontainer>
  </song>
</lmms-project>
`;
}
