// Voice briefs use the browser's own speech recognition (free, nothing is uploaded by us).
// Chrome, Edge and Safari support it; other browsers fall back to typing.
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function recognitionClass(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w["SpeechRecognition"] ?? w["webkitSpeechRecognition"] ?? null) as (new () => Recognition) | null;
}

export const speechSupported = () => recognitionClass() !== null;

/** Starts listening; calls onText with the full transcript when the speaker stops. Returns a stop function. */
export function listen(onText: (text: string) => void, onError: (message: string) => void, onEnd: () => void) {
  const Cls = recognitionClass();
  if (!Cls) {
    onError("Voice isn't supported in this browser. Type your brief instead.");
    onEnd();
    return () => {};
  }
  const rec = new Cls();
  rec.lang = navigator.language || "en-GB";
  rec.interimResults = false;
  rec.continuous = false;
  let text = "";
  rec.onresult = (e) => {
    text = Array.from(e.results).map((r) => r[0]?.transcript ?? "").join(" ").trim();
  };
  rec.onerror = (e) => onError(e.error === "not-allowed" ? "Microphone access is needed for voice briefs." : "Didn't catch that. Try again.");
  rec.onend = () => {
    if (text) onText(text);
    onEnd();
  };
  rec.start();
  return () => rec.stop();
}
