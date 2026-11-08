// SPDX-License-Identifier: MIT
// The clips' requests — shared with the renderer (app-structure §15). Browser-safe: imports only the kit's
// `platform/schema`.

import { nullable, opt, strictObject, T } from "@delebash/core/platform/schema";
import { Id } from "./films.js";

/** Make the film's clips (POST /v1/films/:id/clips): every shot, else only those without one. */
export const FilmClipsIn = strictObject({ all: opt(T.Boolean(), false) });

/** Choose a shot's clip (POST /v1/shots/:id/clip); null takes it off. */
export const ChooseClip = strictObject({ clipId: nullable(Id) });
