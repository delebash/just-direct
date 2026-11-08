// SPDX-License-Identifier: MIT
// The app's AI features — what AI Settings → "Routing by feature" lists (app-structure §8), handed
// to installLlm. Each feature's ACTION points at an engine preset (seed_presets.js
// DEFAULT_FEATURE_PRESETS) that owns the provider, the model and every tunable; its prompt row is
// seed_feature_prompts.js. A feature is registered the day it calls the engine — a routing row
// for a feature that can't route is a lie (§11).
//
// `label` and `hint` are the words the user meets (the copy law, §11): outcomes, never internal
// terms. They are database seed data, English for now (§11: vue-i18n can't reach seeded rows yet).

import { FeatureCatalogEntry } from "@delebash/core/llm";

export const FEATURE_CATALOG = [
  // A card's picture (POST /v1/cards/:id/paint, a job): FLUX.2 [klein] 4B on the kit's stable-diffusion.cpp runtime,
  // from the card's words and its kind's template (Settings → Pictures).
  FeatureCatalogEntry({
    key: "cards.paint",
    label: "Paint a card's picture",
    hint: "Paints the picture of a character, place, prop or look from its description — Paint on a film's Cards tab. Every shot that has the card uses its picture to keep it the same.",
    group: "Cards",
    kind: "image",
  }),
];
