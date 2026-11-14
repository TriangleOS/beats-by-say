---
title: Beats by Say engine
emoji: 🎛️
colorFrom: yellow
colorTo: gray
sdk: gradio
sdk_version: 6.2.0
python_version: 3.11
app_file: app.py
pinned: false
license: mit
short_description: ACE-Step 1.5 beats and Demucs stems for beatsbysay.com
models:
  - ACE-Step/Ace-Step1.5
  - ACE-Step/acestep-5Hz-lm-1.7B
---

API-first engine for [beatsbysay.com](https://beatsbysay.com), duplicated from
[ACE-Step/Ace-Step-v1.5](https://huggingface.co/spaces/ACE-Step/Ace-Step-v1.5) (MIT) with a slim app:

- `/generate` (caption, bpm, key, seconds, takes, plan, seed) → instrumental takes as FLAC
- `/separate` (take_id) → drums, bass, other, vocals stems from [HT-Demucs](https://github.com/adefossez/demucs) (MIT)

Hardware: ZeroGPU. GPU time is charged to each caller's own daily allowance.
