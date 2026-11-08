// SPDX-License-Identifier: MIT
// The sounds' requests — shared with the renderer (app-structure §15). Browser-safe: imports only the kit's
// `platform/schema`.

import { opt, strictObject, T } from "@delebash/core/platform/schema";

export const PROMPT_MAX = 600;
/** The longest sound made in one go: 60 s, the longest score the tests made (feasibility §J.3.1: 60 s in 6 s). */
export const SOUND_SECONDS_MAX = 60;
const Start = T.Number({ minimum: 0, maximum: 3600 });
const Volume = T.Number({ minimum: 0, maximum: 1 });

/** Music or an effect (POST /v1/films/:id/sounds): what it is, how long, where in the cut it starts, how loud. */
export const SoundIn = strictObject({
  kind: T.Union([T.Literal("music"), T.Literal("effect")]),
  prompt: T.String({ minLength: 1, maxLength: PROMPT_MAX }),
  seconds: opt(T.Integer({ minimum: 1, maximum: SOUND_SECONDS_MAX })),
  start: opt(Start),
  volume: opt(Volume),
});

/** A sound moved or made louder or quieter (PATCH /v1/sounds/:id). */
export const SoundPatch = strictObject({ start: opt(Start), volume: opt(Volume) });
