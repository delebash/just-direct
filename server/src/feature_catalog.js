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
  // The planner (POST /v1/films/:id/plan, a job; planner.js): three passes on the same thinking preset, each answer held
  // to a schema built from the film — the cards, then the shots; and the revision after a hand edit (POST
  // /v1/shots/:id/carry). Gemma 4 26B-A4B with thinking on is what was tested (feasibility §J.3).
  FeatureCatalogEntry({
    key: "plan.cards",
    label: "Find the story's cards",
    hint: "Reads the story and makes a card for each character, place and prop it needs that the film doesn't have yet — the first step of Plan the shots.",
    group: "Planning",
  }),
  FeatureCatalogEntry({
    key: "plan.shots",
    label: "Plan the shots",
    hint: "Breaks the story into shots in order: how each is framed and moves, what happens, who and what is in it, the line spoken — Plan the shots on a film's Shots tab.",
    group: "Planning",
  }),
  FeatureCatalogEntry({
    key: "plan.revise",
    label: "Carry a change forward",
    hint: "After you change a shot by hand, rewrites the later shots your change affects — a prop that's gone, a coat now worn — and leaves the ones you changed yourself.",
    group: "Planning",
  }),
  // A shot's first frames (POST /v1/shots/:id/frames, POST /v1/films/:id/frames — jobs; frames.js): painted with the
  // shot's cards' pictures as references, then checked by a vision model and the best kept.
  FeatureCatalogEntry({
    key: "frames.paint",
    label: "Paint a shot's first frame",
    hint: "Paints the first frame of a shot from its words, with its characters', place's and props' pictures so they look the same as everywhere else — First frames on a film's Shots tab.",
    group: "First frames",
    kind: "image",
  }),
  FeatureCatalogEntry({
    key: "frames.check",
    label: "Check a first frame",
    hint: "Looks at each first frame painted for a shot — is everyone and everything there, anyone who shouldn't be, stray lettering, a distorted hand — and keeps the best one. Needs a model that can see pictures.",
    group: "First frames",
  }),
];
