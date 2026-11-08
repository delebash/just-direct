// SPDX-License-Identifier: MIT
// The films and cards requests and answers — shared with the renderer's forms (app-structure §15): the routes check a
// body against them (the kit's `input()`), the screens build their form rules from the same objects
// (`just-direct-server/schemas/films.js`). Browser-safe: this file imports only the kit's `platform/schema`.

import { opt, strictObject, T } from "@delebash/core/platform/schema";

export const TITLE_MAX = 120;
export const STORY_MAX = 20000;
export const LOOK_MAX = 600;
export const NAME_MAX = 80;
export const DESCRIPTION_MAX = 2000;
export const VOICE_MAX = 600;

/** The picture sizes a film may have: sd.cpp's video wants both sides a multiple of 64 (LTX-2.3; the guides' half-size
 *  stage needs it, feasibility §J.3), so the sizes are steps of 64. */
export const SIDE_MIN = 384;
export const SIDE_MAX = 1920;
const Side = T.Integer({ minimum: SIDE_MIN, maximum: SIDE_MAX, multipleOf: 64 });

const Title = T.String({ minLength: 1, maxLength: TITLE_MAX });
const Story = T.String({ maxLength: STORY_MAX });
const Look = T.String({ maxLength: LOOK_MAX });

export const Id = T.String({ minLength: 1, maxLength: 64, pattern: "^[A-Za-z0-9_-]+$" });
export const IdParams = T.Object({ id: Id });

/** A new film (POST /v1/films): its size defaults to the app's setting. */
export const FilmIn = strictObject({
  title: Title,
  story: opt(Story, ""),
  look: opt(Look, ""),
  width: opt(Side),
  height: opt(Side),
});

/** A change to a film (PATCH /v1/films/:id). */
export const FilmPatch = strictObject({
  title: opt(Title),
  story: opt(Story),
  look: opt(Look),
  width: opt(Side),
  height: opt(Side),
});

export const CardKind = T.Union([T.Literal("character"), T.Literal("place"), T.Literal("prop"), T.Literal("look")]);
const Name = T.String({ minLength: 1, maxLength: NAME_MAX });
const Description = T.String({ maxLength: DESCRIPTION_MAX });
const Voice = T.String({ maxLength: VOICE_MAX });

/** A new card (POST /v1/films/:id/cards). */
export const CardIn = strictObject({
  kind: CardKind,
  name: Name,
  description: opt(Description, ""),
  voice: opt(Voice, ""),
});

/** A change to a card (PATCH /v1/cards/:id). */
export const CardPatch = strictObject({
  name: opt(Name),
  description: opt(Description),
  voice: opt(Voice),
});

/** Paint a card's picture (POST /v1/cards/:id/paint): a seed to repeat one, else a new one. */
export const PaintIn = strictObject({
  seed: opt(T.Integer({ minimum: 0, maximum: 2147483647 })),
});
