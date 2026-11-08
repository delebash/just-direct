// SPDX-License-Identifier: MIT
// The AI stack's seed DATA for this app (app-structure §8) — handed to installLlm, written by the
// kit's seedLlm insert-if-missing, so an edit made in AI Settings is never overwritten.
//
//   - Engine presets: each owns provider + model + every tunable (temperature, top_p, samplers,
//     think). Their model ships EMPTY — Quick Setup or the user picks it (JustWrite's ruling,
//     2026-07-06: "no model is automatically set as default … this is all quick setup or
//     manual").
//   - Feature presets: each action → the preset it runs on (the one source of what it runs).
//   - The model catalog: the app's whole catalog (decision ④, 2026-08-05 — the kit's shared
//     catalog is empty); here JustWrite's three general chat rows, facts and all.
//   - Class tunes: measured launch settings per hardware class for those rows, and what each was
//     measured on (the identity map), so a tune applies whatever id an app gives the same file.
//
// Seed rows keep the kit's snake_case keys (its seeders read them).

export const DEFAULT_ENGINE_PRESETS = [
  // The catch-all: any action without a preset of its own runs here (DEFAULT_PRESET_ID).
  {
    id: "p_general",
    name: "General",
    provider_id: "local-llamacpp",
    model: "",
    temperature: 0.7,
    top_p: 0.95,
    position: 0,
    think: false,
    samplers: { min_p: "0.05" },
  },
  // A card's picture: FLUX.2 [klein] 4B on the kit's sd.cpp runtime, with the recipe measured for it (house-paint's
  // RESEARCH §9–§10: 4 steps, guidance 1, strength 1, euler). No seed here: each picture gets a new one (the route's),
  // so Paint again paints another.
  {
    id: "p_cards",
    name: "Card pictures",
    provider_id: "local-sdcpp",
    model: "flux2-klein-4b",
    kind: "image",
    params: { steps: 4, cfg: 1, strength: 1, sampler: "euler" },
    position: 1,
  },
  // The planner: thinking on with room to finish — the local "medium" level, 4,096 tokens (the kit's reasoning map),
  // the budget its test passed with; the test's 1,500 ran out before the answer every time (feasibility §J.3). A
  // thought that reaches the budget is closed and the answer still follows (the app's first real run, 2026-11-07:
  // seven tries of the cards pass, all answered, two of them at the budget). The model is the one the user sets up
  // (Quick Setup picks Gemma 4 26B-A4B on 8 GB, the model tested).
  {
    id: "p_plan",
    name: "Planning",
    provider_id: "local-llamacpp",
    model: "",
    temperature: 0.7,
    top_p: 0.95,
    position: 2,
    think: true,
    reasoning_effort: "medium",
    samplers: { min_p: "0.05" },
  },
  // A shot's first frames: FLUX.2 [klein] 4B with the shot's cards' pictures as references, its own preset so it can
  // be tuned apart from the cards' pictures (the same measured recipe to start).
  {
    id: "p_frames",
    name: "First frames",
    provider_id: "local-sdcpp",
    model: "flux2-klein-4b",
    kind: "image",
    params: { steps: 4, cfg: 1, strength: 1, sampler: "euler" },
    position: 3,
  },
  // The first-frame check: Qwen3-VL 8B looking at each frame, no thinking, no randomness (framecheck.js ran it at
  // temperature 0); its answer held to the run's schema.
  {
    id: "p_check",
    name: "First-frame check",
    provider_id: "local-llamacpp",
    model: "qwen3-vl-8b",
    temperature: 0,
    top_p: 1,
    position: 4,
    think: false,
  },
  // A shot's clip: LTX-2.3 distilled on the kit's sd.cpp runtime, its video provider — 8 steps, guidance 1 (the
  // distilled model's own; its timesteps are the row's), strength 1 from the first frame. Every clip a new seed.
  {
    id: "p_clips",
    name: "Clips",
    provider_id: "local-sdcpp-video",
    model: "ltx-2.3-22b-distilled",
    kind: "video",
    params: { steps: 8, cfg: 1, strength: 1, sampler: "euler" },
    position: 5,
  },
  // Music and sound effects: Stable Audio 3 on the kit's audio.cpp runtime, where the runtime places it.
  {
    id: "p_music",
    name: "Music",
    provider_id: "local-audiocpp-music",
    model: "stable-audio-3-medium",
    kind: "music",
    params: { placement: "auto" },
    position: 6,
  },
  {
    id: "p_effects",
    name: "Sound effects",
    provider_id: "local-audiocpp-sfx",
    model: "stable-audio-3-small-sfx",
    kind: "sfx",
    params: { placement: "auto" },
    position: 7,
  },
  // Songs: ACE-Step 1.5 Turbo on the same runtime's music provider.
  {
    id: "p_songs",
    name: "Songs",
    provider_id: "local-audiocpp-music",
    model: "ace-step-1.5-turbo",
    kind: "music",
    params: { placement: "auto" },
    position: 8,
  },
  // Lip repair: LatentSync on the runtime's lip-sync provider, where the runtime places it.
  {
    id: "p_lips",
    name: "Lip repair",
    provider_id: "local-audiocpp-lipsync",
    model: "latentsync-1.6",
    kind: "lipsync",
    params: { placement: "auto" },
    position: 9,
  },
];

export const DEFAULT_FEATURE_PRESETS = {
  "cards.paint": "p_cards",
  "plan.cards": "p_plan",
  "plan.shots": "p_plan",
  "plan.revise": "p_plan",
  "frames.paint": "p_frames",
  "frames.check": "p_check",
  "clips.make": "p_clips",
  "clips.lips": "p_lips",
  "sounds.music": "p_music",
  "sounds.effect": "p_effects",
  "sounds.song": "p_songs",
};

export const DEFAULT_PRESET_ID = "p_general";

// ── The model catalog — JustWrite's general chat rows (justwrite-app
// server/src/seed_presets.js: DEFAULT_MODEL_CATALOG_EXTRA's Gemma 4 26B-A4B and
// JW_CURATED_CATALOG's Gemma 4 12B and E4B, as of 2026-10-17). The facts are JustWrite's audited
// ones, unchanged: repos, quants and licences verified through the Hugging Face API (2026-07-06,
// Apache-2.0 on Google's own repos and the repackager's), the size/architecture fields read from
// each pinned quant's GGUF header (2026-07-07/08, the path Read-from-link uses), samplers the
// file's own recommended set. Changed here: `position` (this catalog's own order) and the
// user-facing `notes` (JustWrite's spoke of writing). Re-run the seed-facts audit whenever a row
// changes. E4B's drafter is recorded but OFF (`mtp: false`) on purpose — JustWrite's stop sign:
// the only head found is a third-party one never loaded against these weights.
export const MODEL_CATALOG = [
  {
    id: "gemma-4-26b-a4b-qat",
    name: "Gemma 4 26B-A4B (QAT)",
    hf_repo: "unsloth/gemma-4-26B-A4B-it-qat-GGUF",
    quant: "UD-Q4_K_XL",
    total_params: "26B",
    active_params: "4B",
    mtp: true,
    output_bytes: 415247360,
    layers_nonexp_bytes: 971592640,
    exps_bytes: 12846382080,
    sliding_window: 1024,
    kv_global_bytes_per_token: 10240.0,
    kv_windowed_bytes_per_token: 102400.0,
    expert_byte_share: 0.9388753056,
    expert_used_count: 8,
    embedding_length: 2816,
    head_count: 16,
    n_kv_heads: 16,
    block_count: 30,
    size_bytes: 14249047104,
    size_label: "128x2.6B",
    est_vram_mb: 17032,
    type: "moe",
    mtp_draft_file: "MTP/mtp-gemma-4-26B-A4B-it-Q4_0.gguf",
    mtp_draft_quant: "Q4_0",
    samplers: { top_k: "64", top_p: "0.95", temperature: "1" },
    trained_ctx: 262144,
    tier: "low-vram-moe",
    license: "Apache-2.0",
    quality_rank: 5,
    position: 0,
    architecture: "gemma4",
    experts: 128,
    description: "26B mixture-of-experts model · 256k context · MTP draft for faster generation · UD-Q4_K_XL (QAT)",
    notes:
      "The recommended all-rounder — one setup covers every AI feature. " +
      "Runs on 8 GB graphics cards and up; thinking is managed per task automatically.",
  },
  {
    id: "gemma-4-12b-qat",
    name: "Gemma 4 12B (QAT)",
    hf_repo: "unsloth/gemma-4-12B-it-qat-GGUF",
    quant: "UD-Q4_K_XL",
    total_params: "12B",
    mtp: true,
    output_bytes: 566246400,
    layers_nonexp_bytes: 6134285824,
    sliding_window: 1024,
    kv_global_bytes_per_token: 8192.0,
    kv_windowed_bytes_per_token: 163840.0,
    embedding_length: 3840,
    head_count: 16,
    n_kv_heads: 16,
    block_count: 48,
    est_vram_mb: 10403,
    mtp_draft_file: "MTP/mtp-gemma-4-12B-it-Q4_0.gguf",
    mtp_draft_quant: "Q4_0",
    trained_ctx: 262144,
    samplers: { top_k: "64", top_p: "0.95", temperature: "1" },
    tier: "mid",
    license: "Apache-2.0",
    position: 1,
    quality_rank: 22,
    architecture: "gemma4",
    experts: 0,
    size_label: "12B",
    size_bytes: 6716356800,
    description: "12B model · 256k context · MTP draft for faster generation · UD-Q4_K_XL (QAT)",
    notes: "The lighter, faster pick — runs fully on a 10-12 GB graphics card (tight on 8 GB) and needs little system RAM.",
  },
  {
    id: "gemma-4-e4b-qat",
    name: "Gemma 4 E4B (QAT)",
    hf_repo: "unsloth/gemma-4-E4B-it-qat-GGUF",
    quant: "UD-Q4_K_XL",
    total_params: "E4B",
    mtp: false,
    output_bytes: 377497600,
    layers_nonexp_bytes: 2221443392,
    sliding_window: 512,
    kv_global_bytes_per_token: 14336.0,
    kv_windowed_bytes_per_token: 35840.0,
    embedding_length: 2560,
    head_count: 8,
    n_kv_heads: 2,
    block_count: 42,
    mtp_draft_quant: "Q4_K_S",
    mtp_draft_file: "gemma-4-E4B-it-assistant.Q4_K_S.gguf",
    mtp_draft_repo: "AtomicChat/gemma-4-E4B-it-assistant-GGUF",
    est_vram_mb: 5211,
    size_bytes: 4215695776,
    size_label: "7.5B",
    trained_ctx: 131072,
    samplers: { top_k: "64", top_p: "0.95", temperature: "1" },
    tier: "mid",
    license: "Apache-2.0",
    position: 2,
    quality_rank: 23,
    architecture: "gemma4",
    experts: 0,
    description: "E4B model · 128k context · UD-Q4_K_XL (QAT)",
    notes:
      "Made for laptops with integrated graphics, where the GPU shares system memory. Small and quick, and holds its quality well for the size.",
  },
  // The first-frame check's eyes: Qwen3-VL 8B Instruct with its vision projector (the kit loads `mmproj` beside it), the
  // pair the handoff's framecheck.js ran — it agreed with Claude's eye on 16 of 16 first frames. Qwen's own GGUF repo,
  // Apache-2.0; sizes from the Hugging Face API at f982a07559d4 (2026-11-07), matching the probe's files byte for byte.
  {
    id: "qwen3-vl-8b",
    name: "Qwen3-VL 8B Instruct (vision)",
    hf_repo: "Qwen/Qwen3-VL-8B-Instruct-GGUF",
    quant: "Q4_K_M",
    mmproj: "mmproj-Qwen3VL-8B-Instruct-F16",
    total_params: "8B",
    mtp: false,
    type: "dense",
    size_bytes: 5027784800,
    size_label: "8B",
    est_vram_mb: 7200,
    tier: "mid",
    license: "Apache-2.0",
    position: 3,
    quality_rank: 30,
    architecture: "qwen3vl",
    experts: 0,
    description: "8B vision-language model · Q4_K_M with its F16 vision projector",
    notes: "Looks at pictures: checks each first frame against its shot and keeps the best. About 6.2 GB with its projector.",
  },
];

// ── Class tunes — JustWrite's JW_CLASS_TUNES rows for these three models (the 8 GB/32 GB and
// 32 GB integrated-GPU rows measured on the author's boxes, the 16 GB integrated E4B row on that
// laptop's own run, the rest the dGPU band recommendations — JustWrite's file says which is
// which and why). Copied as they are.
const MIRROR = { ctx_len: "32768", batch_size: "512", ubatch_size: "512", reasoning_budget: "1024" };

export const CLASS_TUNES = [
  {
    model_id: "gemma-4-26b-a4b-qat",
    class_key: "dgpu-vram8|ram32",
    switches: { n_gpu_layers: "99", n_cpu_moe: "21", ...MIRROR, threads: "8" },
  },
  {
    model_id: "gemma-4-26b-a4b-qat",
    class_key: "igpu-mem32",
    switches: { n_gpu_layers: "99", n_cpu_moe: "0", ...MIRROR, flash_attn: "off" },
  },
  { model_id: "gemma-4-26b-a4b-qat", class_key: "dgpu-vram16|ram32", switches: { ...MIRROR } },
  { model_id: "gemma-4-26b-a4b-qat", class_key: "dgpu-vram16|ram64", switches: { ...MIRROR } },
  { model_id: "gemma-4-26b-a4b-qat", class_key: "dgpu-vram24|ram32", switches: { n_gpu_layers: "99", n_cpu_moe: "0", ...MIRROR } },
  { model_id: "gemma-4-26b-a4b-qat", class_key: "dgpu-vram24|ram64", switches: { n_gpu_layers: "99", n_cpu_moe: "0", ...MIRROR } },
  { model_id: "gemma-4-e4b-qat", class_key: "igpu-mem16", switches: { n_gpu_layers: "99", ...MIRROR, flash_attn: "off" } },
  { model_id: "gemma-4-12b-qat", class_key: "dgpu-vram8|ram16", switches: { n_gpu_layers: "99", ...MIRROR } },
  { model_id: "gemma-4-12b-qat", class_key: "dgpu-vram12|ram16", switches: { n_gpu_layers: "99", ...MIRROR } },
  { model_id: "gemma-4-12b-qat", class_key: "dgpu-vram12|ram32", switches: { n_gpu_layers: "99", ...MIRROR } },
  { model_id: "gemma-4-12b-qat", class_key: "dgpu-vram12|ram64", switches: { n_gpu_layers: "99", ...MIRROR } },
  { model_id: "gemma-4-12b-qat", class_key: "dgpu-vram16|ram16", switches: { n_gpu_layers: "99", ...MIRROR } },
];

// What the tunes were measured on — the file, not the id an app gives it.
export const CLASS_TUNE_IDENTITY = {
  "gemma-4-26b-a4b-qat": { hf_repo: "unsloth/gemma-4-26B-A4B-it-qat-GGUF", quant: "UD-Q4_K_XL" },
  "gemma-4-12b-qat": { hf_repo: "unsloth/gemma-4-12B-it-qat-GGUF", quant: "UD-Q4_K_XL" },
  "gemma-4-e4b-qat": { hf_repo: "unsloth/gemma-4-E4B-it-qat-GGUF", quant: "UD-Q4_K_XL" },
};

// ── The picture model, for the kit's stable-diffusion.cpp runtime (installLlm `runtimeModels`): FLUX.2 [klein] 4B —
// house-paint's row (its seed_presets.js FLUX2_KLEIN), the same pinned files and hashes, so a computer that has
// house-paint shares the download through the family's cache. All three files Apache-2.0, pinned to the Hugging Face
// commit they were checked at; `sha256` the LFS object id. It holds a card's picture and a shot's first frame with up
// to three references (cast, place, prop) at 1280×704 in 45–49 s on an 8 GB card, 7.1–7.2 GB of it, and about 15 GB of
// the computer's memory (feasibility §J.2); peak 6.41 GB for a picture without references.
export const FLUX2_KLEIN = {
  runtime: "sdcpp",
  id: "flux2-klein-4b",
  name: "FLUX.2 [klein] 4B",
  license: "Apache-2.0",
  files: [
    {
      slot: "diffusion_model",
      repo: "leejet/FLUX.2-klein-4B-GGUF",
      revision: "3b1f5a9dc3abb32238b053aeb3d823c30afdacbd",
      path: "flux-2-klein-4b-Q8_0.gguf",
      sha256: "0bba6951258ec8f92d51114a8fa13e66828297bfff58a738f52729b3ef66fa28",
      bytes: 4300629440,
    },
    {
      slot: "llm",
      repo: "unsloth/Qwen3-4B-GGUF",
      revision: "22c9fc8a8c7700b76a1789366280a6a5a1ad1120",
      path: "Qwen3-4B-Q8_0.gguf",
      sha256: "eed555233267a33c7e8ee31682762cc7751b3f6d224039086e0e846f05fffa5d",
      bytes: 4280405792,
    },
    {
      slot: "vae",
      repo: "black-forest-labs/FLUX.2-klein-4B",
      revision: "e7b7dc27f91deacad38e78976d1f2b499d76a294",
      path: "vae/diffusion_pytorch_model.safetensors",
      sha256: "ca70d2202afe6415bdbcb8793ba8cd99fd159cfe6192381504d6c4d3036e0f04",
      bytes: 168120878,
    },
  ],
  peakVramMb: 7200,
  minRamMb: 15 * 1024,
  refSpeed: { cuda12: 30, cpu: 900 },
};

// ── The clip model, for the kit's stable-diffusion.cpp runtime (kind video): LTX-2.3 22B distilled 1.1 at Q4_K_M with
// its parts — Gemma 3 12B as the text encoder, the text connectors, the video and audio VAEs — LTX's x2 spatial
// upscaler for the long take's second stage, and Lightricks' two guide LoRAs, Union Control (depth, pose, edges) and
// Motion Track Control (drawn paths), both at half-size references (ref0.5). The files and hashes are the ones the
// proof clips ran on (E:\Dev\Web\test-just-direct\rows.js; the LoRAs read from the Hugging Face API 2026-11-07, their
// sizes matching the downloaded copies). Licences: LTX-2.3 and its LoRAs the LTX-2 Community License (commercial use
// free under US$10M a year in revenue; no rights claimed in output); Gemma 3 the Gemma Terms of Use (commercial use
// allowed, no revenue limit, bound to Google's prohibited-use policy). The way it runs on 8 GB (`spec`): Gemma on the
// processor, the weights streamed from the drive, the distilled model's 8 timesteps, VAE tiling (feasibility §J.3,
// kit-video2.js); its peak on the card 7.3 GB.
const LTX_REPO = { repo: "unsloth/LTX-2.3-GGUF", revision: "96e8ed4925ead3db9ff4d0084f165ef6a74f28d0" };
export const LTX_23 = {
  runtime: "sdcpp",
  id: "ltx-2.3-22b-distilled",
  name: "LTX-2.3 22B distilled (video with sound)",
  kind: "video",
  license: "LTX-2 Community License · Gemma Terms of Use",
  files: [
    { slot: "diffusion_model", ...LTX_REPO, path: "distilled-1.1/ltx-2.3-22b-distilled-1.1-Q4_K_M.gguf", sha256: "5d09efdc0b8ec2054c44a05366cd7c6634ffa333b379b1f8baf018a78974b73d", bytes: 14194441248 },
    { slot: "llm", repo: "unsloth/gemma-3-12b-it-GGUF", revision: "d15e4c7dc21dc55d56bf8549db57a71ad8a2a35d", path: "gemma-3-12b-it-Q4_K_M.gguf", sha256: "15b8fd9d8672cd4240c178c217ca781409291f34e353d2e913b29c7602ceb3ff", bytes: 7300778336 },
    { slot: "embeddings_connectors", ...LTX_REPO, path: "text_encoders/ltx-2.3-22b-distilled_embeddings_connectors.safetensors", sha256: "c61cbb396e2a8175d8b2da51f0fdac885a4ccd22c9f64dafa5aa2c455dc8a507", bytes: 2312144712 },
    { slot: "vae", ...LTX_REPO, path: "vae/ltx-2.3-22b-distilled_video_vae.safetensors", sha256: "e68d6d8f8a42942ac9b862cc315beb3bc30805a8876c7ad63ba5bf7a2b8e168a", bytes: 1452256522 },
    { slot: "audio_vae", ...LTX_REPO, path: "vae/ltx-2.3-22b-distilled_audio_vae.safetensors", sha256: "3cd6a6eb8cb28f5ecc12f1f3126952b2a3d2b0b42ad3270e63cefafafe0d9b57", bytes: 364853140 },
    { slot: "upscaler", repo: "Lightricks/LTX-2.3", revision: "c1521179de480464f366a98a9d9b2acc4cc097b9", path: "ltx-2.3-spatial-upscaler-x2-1.1.safetensors", sha256: "5f416311fa8172b65af67530758964708d29a317b830d689a51143b7f91913ed", bytes: 995743560 },
    { slot: "lora_union", repo: "Lightricks/LTX-2.3-22b-IC-LoRA-Union-Control", revision: "20a580c8606c06a0988d40375a61309e0fe5893d", path: "ltx-2.3-22b-ic-lora-union-control-ref0.5.safetensors", sha256: "a1b888a87f661d27f08b394ae559e8e1050be33900bcc36a5cdf659e48f88d18", bytes: 654465352 },
    { slot: "lora_motion", repo: "Lightricks/LTX-2.3-22b-IC-LoRA-Motion-Track-Control", revision: "022bf183b6da565fd2e2800e135ba0b46db57d32", path: "ltx-2.3-22b-ic-lora-motion-track-control-ref0.5.safetensors", sha256: "e279807ee3aa3db1ce60188d665ff83342860367dcd6bac19f8bd5a99a9e1dca", bytes: 327309314 },
  ],
  peakVramMb: 7300,
  minRamMb: 20 * 1024,
  spec: {
    backend: "te=cpu",
    paramsBackend: "diffusion=disk,te=disk",
    params: {
      sigmas: [1.0, 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0],
      vaeTiling: { enabled: true, tile_size_w: 384, tile_size_h: 384, target_overlap: 0.125 },
    },
  },
};

// ── Music, sound effects and lip repair, for the kit's audio.cpp runtime (the characters' voices are JustVoice's —
// justvoice.js). Music and effects are Stable Audio 3 Medium and Small SFX at Q8 (feasibility §J.3.1: 30 s of score in
// 4–4.5 s, 10 s of effects in 2 s on 8 GB; the user's review: the score "use as is", the effects "use with edits"), from
// audio.cpp's own GGUF repository pinned at 73ce4162 (sizes and LFS hashes from the Hugging Face API, 2026-11-07, matching
// the downloaded copies' sizes); licence the Stability AI Community License — free for commercial use under US$1M a year in
// revenue. Both run with audio.cpp's memory saver on, as tested. Their memory on the card is an estimate (the file and
// room to work: audio.cpp's catalog gives none and the tests didn't capture it) until the kit measures a load.
const AUDIOCPP_GGUF = { repo: "audio-cpp/audio.cpp-gguf", revision: "73ce4162f6cce370dd533c6782b772135c1b2a8e" };
const STABLE_AUDIO_SPEC = { family: "stable_audio", task: "gen", sessionOptions: { "stable_audio.mem_saver": "true" } };
export const STABLE_AUDIO_MUSIC = {
  runtime: "audiocpp",
  id: "stable-audio-3-medium",
  name: "Stable Audio 3 Medium (music)",
  kind: "music",
  license: "Stability AI Community License",
  files: [{ slot: "model", ...AUDIOCPP_GGUF, path: "Stable-Audio-3-Medium-GGUF/stable-audio-3-medium-q8_0.gguf", sha256: "d239eba564bd049b6fc0b103ee51cf179dc1a836ac7904c0d50088c6d45018a3", bytes: 3582601408 }],
  peakVramMb: 6144,
  minRamMb: 0,
  refSpeed: {},
  spec: STABLE_AUDIO_SPEC,
};
// Songs — music with sung lyrics: ACE-Step 1.5 Turbo at Q8, one package from audio.cpp's GGUF repository at the same
// pinned revision (size and LFS hash from the Hugging Face API, 2026-11-07, matching the copy on this PC byte for byte);
// licence MIT (huggingface.co/ACE-Step/Ace-Step1.5, read 2026-11-07). Feasibility §J.3.1: 60 s in 12 s on 8 GB, the
// user's review "use with edits"; run with its memory saver, as tested. Its memory on the card is an estimate (the
// file and room to work) until the kit measures a load.
export const ACE_STEP_SONGS = {
  runtime: "audiocpp",
  id: "ace-step-1.5-turbo",
  name: "ACE-Step 1.5 Turbo (songs)",
  kind: "music",
  license: "MIT",
  files: [{ slot: "model", ...AUDIOCPP_GGUF, path: "ACE-Step1.5-GGUF/turbo/ace-step-1.5-turbo-q8_0.gguf", sha256: "1f0015f81c10a1182531e6207c7aeaa060b8cad3470a2f88daa3cb74ed636e63", bytes: 6185468096 }],
  peakVramMb: 7168,
  minRamMb: 0,
  refSpeed: {},
  spec: { family: "ace_step", task: "gen", sessionOptions: { "ace_step.mem_saver": "true" } },
};
// Lip repair: LatentSync 1.6 at Q8 (its U-Net; the rest F16), one GGUF holding the U-Net, Whisper Tiny, the SD VAE, the
// SCRFD face detector, the 106-point landmark model and the face mask (its card, read 2026-11-08); size and LFS hash from
// the Hugging Face API at this revision, matching the copy on this PC. Licence: LatentSync's Apache-2.0, but the card:
// "This package contains InsightFace face detection and landmark weights restricted to non-commercial research"
// (github.com/deepinsight/insightface#license). Run with its memory saver; its memory on the card is the measurement on a
// large card (9,144 MiB, the kit's RESEARCH) until the kit measures a load here.
export const LATENTSYNC = {
  runtime: "audiocpp",
  id: "latentsync-1.6",
  name: "LatentSync 1.6 (lip repair)",
  kind: "lipsync",
  license: "Non-commercial research (InsightFace's face weights) · Apache-2.0 (LatentSync)",
  files: [
    {
      slot: "model",
      repo: "audio-cpp/LatentSync-1.6-GGUF",
      revision: "937b95aa98518dff8728541a8a38b94985d90dd1",
      path: "latentsync-1.6-q8_0-f16.gguf",
      sha256: "a1bf72c22ab9fe24202f4d4ecff7e9d8076957b111844dd256d5b90e8c53e4a0",
      bytes: 2097768128,
    },
  ],
  peakVramMb: 9144,
  minRamMb: 0,
  refSpeed: {},
  spec: { family: "latentsync", task: "gen", sessionOptions: { "latentsync.mem_saver": "true" } },
};
export const STABLE_AUDIO_EFFECTS = {
  runtime: "audiocpp",
  id: "stable-audio-3-small-sfx",
  name: "Stable Audio 3 Small SFX (sound effects)",
  kind: "sfx",
  license: "Stability AI Community License",
  files: [{ slot: "model", ...AUDIOCPP_GGUF, path: "Stable-Audio-3-Small-SFX-GGUF/stable-audio-3-small-sfx-q8_0.gguf", sha256: "bfe435d2c5841868a7025433929ee250e51e491be369a279f341221539c71841", bytes: 1683576512 }],
  peakVramMb: 3072,
  minRamMb: 0,
  refSpeed: {},
  spec: STABLE_AUDIO_SPEC,
};
