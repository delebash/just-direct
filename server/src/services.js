// SPDX-License-Identifier: MIT
// The AI work the routes call, in one place so a test passes fakes (createApp's `services`; house-paint's services.js
// is the donor). Each one is the kit's own run — the feature's preset picks the engine and model (app-structure §19):
// nothing here starts an engine or names a model.

import { buildLlmConfig, runAction, stores } from "@delebash/core/llm";
import { imageFeatureReadiness, runImageFeature, runVideoFeature, videoFeatureReadiness } from "@delebash/core/llm/image_dispatch";
import { runAudioFeature } from "@delebash/core/llm/speech_dispatch";
import { ffmpegReadiness } from "@delebash/core/runner/ffmpeg";
import * as lifecycle from "@delebash/core/runner/lifecycle";
import { stopRuntimeServers } from "@delebash/core/runner/runtime_service";
import { justVoice } from "./justvoice.js";

/** The routes' AI work; `overrides` replaces some (a test's fake painter or planner). */
export function createServices(overrides = {}) {
  return {
    /** What Make the film needs that isn't installed, in the words the refusal names it — `[]` when all is ready (the
     *  kit's readiness of the first frames' and the clips' features, and FFmpeg's). */
    filmNeeds: () => {
      const missing = [];
      if (!imageFeatureReadiness("frames.paint").ready) missing.push("the picture model (First frames)");
      if (!videoFeatureReadiness("clips.make").ready) missing.push("the clip model (Clips)");
      if (!ffmpegReadiness().ready) missing.push("FFmpeg (the export)");
      return missing;
    },
    /** Paint a picture with image feature `feature`: `request` `{prompt, width, height, refs, seed}` (PNG Buffers) →
     *  a PNG Buffer. `onProgress({fraction})`, `signal` cancels. */
    paintImage: (feature, request, opts = {}) => runImageFeature(feature, request, opts),
    /** Run a chat action (the kit's RunRequest: `action`, `variables`, `jsonSchema`, `maxTokens`, `images`) → the
     *  answer as the routes read it: `{content, finishReason, completionTokens}`. The kit's runAction answers its
     *  LLMResponse (`text`, `finish_reason`, `completion_tokens`); only /v1/ai/run renames `text` to `content`, so the
     *  names are mapped here, in one place (the app read `content` from runAction until the first real run, 2026-11-07:
     *  every plan and every frame check failed while the fakes passed). `signal` cancels. */
    run: async (body, opts = {}) => {
      const r = await runAction(stores.getPromptStore(), buildLlmConfig(), body, opts);
      return { content: r?.text ?? "", finishReason: r?.finish_reason ?? "", completionTokens: r?.completion_tokens ?? 0 };
    },
    /** Make a clip with video feature `feature` (runVideoFeature's request: prompt, size, frames, fps, init, guide,
     *  audio, loras by slot, params) → `{bytes, fps, frames}`, the WebM with its sound. */
    makeVideo: (feature, request, opts = {}) => runVideoFeature(feature, request, opts),
    /** Make music, an effect or a lip repair with audio feature `feature` (its preset's model): `request` audio.cpp's own
     *  (`text`, `duration_seconds`, `audio_base64`, `options`, …), `opts.timeout` seconds → its result (`audio`, a Base64
     *  WAV; LatentSync's `artifacts`). */
    makeAudio: (feature, request, opts = {}) => runAudioFeature(feature, request, opts),
    /** JustVoice's client at `base` (Settings → Voices) — the characters' voices come from it (justvoice.js). */
    voices: (base) => justVoice(base),
    /** Let go of everything this app holds on the graphics card — before JustVoice speaks a batch (the user, 2026-11-08:
     *  "just unload your model first ... then you can reload your models"): the language model's server, and every other
     *  runtime's (pictures, clips, music) — the pair a reset uses (data_admin.js); each loads again when next needed. */
    freeCard: async () => {
      try {
        await lifecycle.getService().stop();
      } catch {
        // none running
      }
      await stopRuntimeServers();
    },
    ...overrides,
  };
}
