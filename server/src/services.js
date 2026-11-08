// SPDX-License-Identifier: MIT
// The AI work the routes call, in one place so a test passes fakes (createApp's `services`; house-paint's services.js
// is the donor). Each one is the kit's own run — the feature's preset picks the engine and model (app-structure §19):
// nothing here starts an engine or names a model.

import { buildLlmConfig, runAction, runImageFeature, runVideoFeature, stores } from "@delebash/core/llm";

/** The routes' AI work; `overrides` replaces some (a test's fake painter or planner). */
export function createServices(overrides = {}) {
  return {
    /** Paint a picture with image feature `feature`: `request` `{prompt, width, height, refs, seed}` (PNG Buffers) →
     *  a PNG Buffer. `onProgress({fraction})`, `signal` cancels. */
    paintImage: (feature, request, opts = {}) => runImageFeature(feature, request, opts),
    /** Run a chat action (the kit's RunRequest: `action`, `variables`, `jsonSchema`, `maxTokens`, `images`) → its
     *  LLMResponse (`content`). `signal` cancels. */
    run: (body, opts = {}) => runAction(stores.getPromptStore(), buildLlmConfig(), body, opts),
    /** Make a clip with video feature `feature` (runVideoFeature's request: prompt, size, frames, fps, init, guide,
     *  audio, loras by slot, params) → `{bytes, fps, frames}`, the WebM with its sound. */
    makeVideo: (feature, request, opts = {}) => runVideoFeature(feature, request, opts),
    ...overrides,
  };
}
