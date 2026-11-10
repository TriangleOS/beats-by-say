import type { Stereo } from "./dsp";

/** Interleaved PCM WAV. 24-bit is written as-is; 16-bit gets TPDF dither. */
export function encodeWav(x: Stereo, sr: number, bits: 16 | 24): Uint8Array {
  const n = x[0].length;
  const bytesPer = bits / 8;
  const buf = new ArrayBuffer(44 + n * 2 * bytesPer);
  const v = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, 36 + n * 2 * bytesPer, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * 2 * bytesPer, true);
  v.setUint16(32, 2 * bytesPer, true);
  v.setUint16(34, bits, true);
  str(36, "data");
  v.setUint32(40, n * 2 * bytesPer, true);
  let o = 44;
  const lsb = bits === 16 ? 1 / 32768 : 0;
  const max = bits === 16 ? 32767 : 8388607;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 2; c++) {
      let s = x[c]![i]!;
      if (lsb) s += (Math.random() - Math.random()) * lsb;
      const q = Math.max(-max - 1, Math.min(max, Math.round(s * (max + 1))));
      if (bits === 16) v.setInt16(o, q, true);
      else {
        v.setUint8(o, q & 0xff);
        v.setUint8(o + 1, (q >> 8) & 0xff);
        v.setUint8(o + 2, (q >> 16) & 0xff);
      }
      o += bytesPer;
    }
  }
  return new Uint8Array(buf);
}

/** Reads 16/24/32-bit PCM or 32-bit float WAV into stereo float. Used by tests and as an upload fallback. */
export function decodeWav(bytes: Uint8Array): { audio: Stereo; sampleRate: number } {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 12,
    fmt = 1,
    ch = 2,
    sr = 44100,
    bits = 16;
  while (p + 8 <= v.byteLength) {
    const id = String.fromCharCode(
      v.getUint8(p),
      v.getUint8(p + 1),
      v.getUint8(p + 2),
      v.getUint8(p + 3),
    );
    const size = v.getUint32(p + 4, true);
    if (id === "fmt ") {
      fmt = v.getUint16(p + 8, true);
      ch = v.getUint16(p + 10, true);
      sr = v.getUint32(p + 12, true);
      bits = v.getUint16(p + 22, true);
      if (fmt === 0xfffe) fmt = v.getUint16(p + 32, true);
    } else if (id === "data") {
      const bps = bits / 8;
      const n = Math.floor(Math.min(size, v.byteLength - p - 8) / (bps * ch));
      const out: Stereo = [new Float32Array(n), new Float32Array(n)];
      let o = p + 8;
      for (let i = 0; i < n; i++) {
        for (let c = 0; c < ch; c++) {
          let s: number;
          if (fmt === 3) s = bits === 64 ? v.getFloat64(o, true) : v.getFloat32(o, true);
          else if (bits === 16) s = v.getInt16(o, true) / 32768;
          else if (bits === 24)
            s = (v.getUint8(o) | (v.getUint8(o + 1) << 8) | (v.getInt8(o + 2) << 16)) / 8388608;
          else if (bits === 32) s = v.getInt32(o, true) / 2147483648;
          else s = (v.getUint8(o) - 128) / 128;
          if (c < 2) out[c]![i] = s;
          o += bps;
        }
        if (ch === 1) out[1][i] = out[0][i]!;
      }
      return { audio: out, sampleRate: sr };
    }
    p += 8 + size + (size % 2);
  }
  throw new Error("Not a readable WAV file.");
}
