// SPDX-License-Identifier: MIT
// The shots requests and answers — shared with the renderer's forms (app-structure §15). Browser-safe: this file
// imports only the kit's `platform/schema`.

import { nullable, opt, strictObject, T } from "@delebash/core/platform/schema";
import { Id } from "./films.js";

export const ACTION_MAX = 1200;
export const LINE_MAX = 600;
export const CAMERA_MAX = 120;
/** The longest shot: LTX-2.3's longest take on 8 GB is 13 s (feasibility §J.3.2); a shot's length is whole and half
 *  seconds. */
export const SECONDS_MIN = 1;
export const SECONDS_MAX = 13;

/** How a shot is framed, widest first — the planner's words and the shot list's. */
export const SIZES = Object.freeze(["extreme wide", "wide", "medium", "medium close-up", "close-up", "extreme close-up"]);
export const TRANSITIONS = Object.freeze(["cut", "dissolve", "fade"]);

const Size = T.Union([T.Literal(""), ...SIZES.map((s) => T.Literal(s))]);
const Transition = T.Union(TRANSITIONS.map((s) => T.Literal(s)));
const Seconds = T.Number({ minimum: SECONDS_MIN, maximum: SECONDS_MAX, multipleOf: 0.5 });
const CardIds = T.Array(Id, { maxItems: 12 });

const fields = {
  placeId: opt(nullable(Id)),
  cardIds: opt(CardIds),
  size: opt(Size),
  camera: opt(T.String({ maxLength: CAMERA_MAX })),
  action: opt(T.String({ maxLength: ACTION_MAX })),
  line: opt(T.String({ maxLength: LINE_MAX })),
  speakerId: opt(nullable(Id)),
  seconds: opt(Seconds),
  transition: opt(Transition),
};

/** A new shot (POST /v1/films/:id/shots): after the shot `after`, else at the end. */
export const ShotIn = strictObject({ ...fields, after: opt(nullable(Id)) });

/** How a shot's clip is made (database/schema.js migration 2). */
export const MODES = Object.freeze(["auto", "one", "long", "paths", "guide"]);
const Point = strictObject({ x: T.Number({ minimum: 0, maximum: 1 }), y: T.Number({ minimum: 0, maximum: 1 }) });
/** Drawn paths: up to 8 tracks, each up to 32 control points in 0..1 of the frame. */
export const Paths = T.Array(T.Array(Point, { minItems: 1, maxItems: 32 }), { maxItems: 8 });

/** A change to a shot (PATCH /v1/shots/:id): its content (a hand edit), how its clip is made, or its cut (the trims). */
export const ShotPatch = strictObject({
  ...fields,
  mode: opt(T.Union(MODES.map((m) => T.Literal(m)))),
  paths: opt(Paths),
  trimIn: opt(T.Number({ minimum: 0, maximum: SECONDS_MAX })),
  trimOut: opt(T.Number({ minimum: 0, maximum: SECONDS_MAX })),
});

/** The film's shots in a new order (POST /v1/films/:id/shots/order). */
export const ShotOrder = strictObject({ ids: T.Array(Id, { minItems: 1, maxItems: 500 }) });

/** Plan the film (POST /v1/films/:id/plan): `replace` the shots it has, frames and clips with them. */
export const PlanIn = strictObject({ replace: opt(T.Boolean(), false) });

/** Carry a hand edit into the later shots (POST /v1/shots/:id/carry): what changed, in the user's words, beside the
 *  edit itself. */
export const CarryIn = strictObject({ note: opt(T.String({ maxLength: 600 }), "") });
