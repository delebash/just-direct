// SPDX-License-Identifier: MIT
// The first frames' requests — shared with the renderer (app-structure §15). Browser-safe: imports only the kit's
// `platform/schema`.

import { nullable, opt, strictObject, T } from "@delebash/core/platform/schema";
import { Id } from "./films.js";

/** Paint a shot's first frames (POST /v1/shots/:id/frames): how many, else the setting's. */
export const FramesIn = strictObject({ count: opt(T.Integer({ minimum: 1, maximum: 8 })) });

/** Paint the film's first frames (POST /v1/films/:id/frames): every shot, else only those without one. */
export const FilmFramesIn = strictObject({ all: opt(T.Boolean(), false) });

/** Choose a shot's first frame (POST /v1/shots/:id/frame); null takes it off. */
export const ChooseFrame = strictObject({ frameId: nullable(Id) });
