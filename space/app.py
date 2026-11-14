"""
Beats by Say engine: an API-first ZeroGPU Space for beatsbysay.com.

  /generate  ACE-Step 1.5 (MIT) records instrumental takes from a brief.
  /separate  HT-Demucs (MIT) splits a take into drums, bass, other and vocals stems.

Mixing and mastering (SayMaster) runs in the artist's browser. GPU time is charged to whoever calls the
Space (each visitor's own free ZeroGPU quota), so requests are sized to what each job needs instead of
the 180 s the upstream demo asks for.
"""
import os
import time
import uuid

# The upstream package wraps its own functions in a fixed 180 s GPU request when SPACE_ID is set.
# Hide it while importing so only the right-sized requests below apply.
_space_id = os.environ.pop("SPACE_ID", None)
os.environ.setdefault("ZEROGPU", "1")  # keeps the planner's ZeroGPU code paths without SPACE_ID
import spaces  # noqa: E402  (must come before torch)
import torch  # noqa: E402
import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402
import gradio as gr  # noqa: E402
from acestep.handler import AceStepHandler  # noqa: E402
from acestep.llm_inference import LLMHandler  # noqa: E402
from acestep.inference import GenerationConfig, GenerationParams, generate_music  # noqa: E402

if _space_id:
    os.environ["SPACE_ID"] = _space_id

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "outputs")
os.makedirs(OUT, exist_ok=True)

DIT_MODEL = os.environ.get("BBS_DIT_MODEL", "acestep-v15-turbo")
LM_MODEL = os.environ.get("BBS_LM_MODEL", "acestep-5Hz-lm-1.7B")
DEMUCS_MODEL = os.environ.get("BBS_DEMUCS_MODEL", "htdemucs_ft")

print(f"Loading {DIT_MODEL} ...")
dit = AceStepHandler()
status, ok = dit.initialize_service(
    project_root=ROOT, config_path=DIT_MODEL, device="auto", use_flash_attention=False,
    compile_model=False, offload_to_cpu=False, offload_dit_to_cpu=False,
)
print(status)
if not ok:
    raise RuntimeError(f"ACE-Step failed to load: {status}")

lm = LLMHandler()
# The flash-attn3 kernels it prefers have no build for ZeroGPU's Blackwell GPUs ("no kernel image"); SDPA runs everywhere.
lm.get_best_attn_implementation = lambda: "sdpa"
lm_status, lm_ok = lm.initialize(
    checkpoint_dir=dit._get_checkpoint_dir(), lm_model_path=LM_MODEL, backend="pt",
    device="auto", offload_to_cpu=False, dtype=dit.dtype,
)
print(lm_status)

from demucs.pretrained import get_model  # noqa: E402
from demucs.apply import apply_model  # noqa: E402

separator = get_model(DEMUCS_MODEL)
separator.eval()
separator.to("cuda")
print(f"Loaded {DEMUCS_MODEL}: {separator.sources} at {separator.samplerate} Hz")


def _clean(old_seconds: int = 3 * 3600) -> None:
    now = time.time()
    for name in os.listdir(OUT):
        path = os.path.join(OUT, name)
        if now - os.path.getmtime(path) > old_seconds:
            try:
                os.remove(path)
            except OSError:
                pass


def _generate_seconds(caption, bpm, key, seconds, takes, plan, seed):
    # Measured on ZeroGPU: about 5 s of planning and 1 s of diffusion and decoding per 30 s take. 2-3x headroom.
    return int(min(120, 12 + float(seconds) * max(1, int(takes)) * (0.05 + (0.2 if plan else 0))))


@spaces.GPU(duration=_generate_seconds)
def generate(caption: str, bpm: float, key: str, seconds: float, takes: int, plan: bool, seed: int):
    """Records instrumental takes. Returns a list of FLAC files and the settings used."""
    _clean()
    caption = (caption or "").strip()[:500]
    if not caption:
        raise gr.Error("Describe the beat first.")
    seconds = float(min(max(seconds or 60, 10), 180))
    takes = int(min(max(takes or 2, 1), 2))
    params = GenerationParams(
        task_type="text2music",
        caption=caption,
        lyrics="[Instrumental]",
        instrumental=True,
        bpm=int(bpm) if bpm and bpm > 0 else None,
        keyscale=(key or "").strip(),
        timesignature="4",
        duration=seconds,
        inference_steps=8,
        guidance_scale=7.0,
        shift=3.0,
        seed=int(seed) if seed is not None else -1,
        thinking=bool(plan) and lm.llm_initialized,
        use_cot_metas=False,
        use_cot_caption=False,
        use_cot_language=False,
    )
    config = GenerationConfig(
        batch_size=takes,
        use_random_seed=(seed is None or int(seed) < 0),
        seeds=[int(seed)] if seed is not None and int(seed) >= 0 else None,
        audio_format="flac",
    )
    result = generate_music(dit, lm, params=params, config=config, save_dir=OUT)
    if not result.success:
        raise gr.Error(result.error or result.status_message or "Generation failed.")
    files = [a["path"] for a in result.audios if a.get("path")]
    if not files:
        raise gr.Error("No audio came back. Try again.")
    ids = []
    for path in files:
        take_id = uuid.uuid4().hex
        os.replace(path, os.path.join(OUT, f"{take_id}.flac"))
        ids.append(take_id)
    return [os.path.join(OUT, f"{i}.flac") for i in ids], {"takes": ids, "model": DIT_MODEL, "planned": params.thinking}


def _separate_seconds(take_id: str):
    return 25


@spaces.GPU(duration=_separate_seconds)
def separate(take_id: str):
    """Splits a take made by /generate into stems. Returns drums, bass, other and vocals as FLAC files."""
    take_id = "".join(c for c in (take_id or "") if c in "0123456789abcdef")
    path = os.path.join(OUT, f"{take_id}.flac")
    if not take_id or not os.path.exists(path):
        raise gr.Error("That take has expired. Make the beat again.")
    audio, sr = sf.read(path, dtype="float32", always_2d=True)
    wav = torch.from_numpy(audio.T.copy())
    if wav.shape[0] == 1:
        wav = wav.repeat(2, 1)
    if sr != separator.samplerate:
        import julius

        wav = julius.resample_frac(wav, sr, separator.samplerate)
    ref = wav.mean(0)
    mean, std = ref.mean(), ref.std() + 1e-8
    with torch.no_grad():
        out = apply_model(separator, ((wav - mean) / std)[None].to("cuda"), shifts=1, split=True, overlap=0.25)[0]
    out = (out * std + mean).cpu().numpy()
    files = []
    for name, stem in zip(separator.sources, out):
        p = os.path.join(OUT, f"{take_id}-{name}.flac")
        sf.write(p, stem.T, separator.samplerate, subtype="PCM_24")
        files.append(p)
    return files, {"stems": list(separator.sources), "sample_rate": separator.samplerate}


with gr.Blocks(title="Beats by Say engine") as demo:
    gr.Markdown(
        "# Beats by Say engine\n"
        "Instrumentals from [ACE-Step 1.5](https://github.com/ace-step/ACE-Step-1.5) (MIT) and stems from "
        "[HT-Demucs](https://github.com/adefossez/demucs) (MIT), for [beatsbysay.com](https://beatsbysay.com). "
        "Runs on Hugging Face ZeroGPU: each visitor's GPU time comes from their own free daily allowance."
    )
    with gr.Row():
        caption = gr.Textbox(label="Caption", value="dark UK drill, sliding 808s, cold piano, punchy drums")
        bpm = gr.Number(label="BPM", value=142)
        key = gr.Textbox(label="Key", value="F minor")
    with gr.Row():
        seconds = gr.Slider(10, 180, value=60, step=5, label="Seconds")
        takes = gr.Slider(1, 2, value=2, step=1, label="Takes")
        plan = gr.Checkbox(value=True, label="Plan the arrangement (5Hz LM)")
        seed = gr.Number(value=-1, label="Seed (-1 random)", precision=0)
    go = gr.Button("Generate", variant="primary")
    take_files = gr.Files(label="Takes")
    take_info = gr.JSON(label="Details")
    go.click(generate, [caption, bpm, key, seconds, takes, plan, seed], [take_files, take_info], api_name="generate")

    take_id = gr.Textbox(label="Take id (from Details)")
    split = gr.Button("Split into stems")
    stem_files = gr.Files(label="Stems")
    stem_info = gr.JSON(label="Stem details")
    split.click(separate, [take_id], [stem_files, stem_info], api_name="separate")

demo.queue(max_size=40, default_concurrency_limit=1)
demo.launch(server_name="0.0.0.0", server_port=7860, show_error=True, allowed_paths=[OUT])
