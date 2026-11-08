// SPDX-License-Identifier: MIT
// /v1/films/:id/make — Make the film: every step a film still lacks, in order, as one job (JustVoice's one-click
// audiobook is the family's precedent, its book_run.js). The steps are the ones their own buttons run, each doing only
// what's missing — so the run never undoes a hand edit, and after a stop or a failure it carries on where it ended:
//   1. the plan, when the film has no shots (Plan the shots);
//   2. the first frames of every shot without one, their cards' missing pictures first (the toolbar's first frames);
//   3. the clips of every shot without one (Make clips);
//   4. the export (Export the film).
// The voices step joins between 2 and 3 when JustDirect speaks through JustVoice (docs/plans/2026-11-08-justvoice-voices.md);
// until then a talking shot's clip speaks its line itself (LTX-2.3). Music and effects stay the Cut tab's.
//
//   POST /v1/films/:id/make → 202 job (kind film): {steps: [{step, done, ...its own result}]} | 404 | 409 (no story and
//                             no shots; what a step needs that isn't installed)

import { Hono, input } from "@delebash/core/platform";
import { ApiError } from "@delebash/core/platform/errors";
import { getLogger } from "@delebash/core/platform/log";
import { getDb, getState } from "../app_state.js";
import * as shots from "../database/shots.js";
import { IdParams } from "../schemas/films.js";
import { makeFilmClips } from "./clips_api.js";
import { joinFilm } from "./cut_api.js";
import { mustFilm } from "./films_api.js";
import { paintFilmFrames } from "./frames_api.js";
import { planFilm } from "./shots_api.js";

const log = getLogger("just_direct.film_run");

const clientOf = (c) => c.req.header("x-client-id") || null;

/** The run's steps, each its share of the run's progress and its body. */
export const STEPS = Object.freeze([
  { step: "plan", share: 0.1, needed: (film) => !shots.listShots(getDb(), film.id).length, run: (film, ctx) => planFilm(film, ctx) },
  { step: "frames", share: 0.25, needed: (film) => shots.listShots(getDb(), film.id).some((s) => !s.frameId), run: (film, ctx) => paintFilmFrames(film, {}, ctx) },
  { step: "clips", share: 0.6, needed: (film) => shots.listShots(getDb(), film.id).some((s) => !s.clipId), run: (film, ctx) => makeFilmClips(film, {}, ctx) },
  { step: "export", share: 0.05, needed: (film) => shots.listShots(getDb(), film.id).some((s) => s.clipId), run: (film, ctx) => joinFilm(film, ctx) },
]);

export function router() {
  const app = new Hono();

  app.post("/v1/films/:id/make", input({ params: IdParams }), (c) => {
    const film = mustFilm(c.req.valid("param").id);
    if (!film.story.trim() && !shots.listShots(getDb(), film.id).length) {
      throw new ApiError(409, "no-story", "The film has no story yet", "Write the story on the Story tab first — the film is planned from it.");
    }
    // what it needs installed is said before it starts, never hours in
    const missing = getState().services.filmNeeds();
    if (missing.length) throw new ApiError(409, "engine-not-installed", "Something the film needs isn't installed", `Install ${missing.join(", ")} on the AI page first.`, { missing });
    const job = getState().jobs.start(
      { kind: "film", key: film.id, label: film.title, failTitle: "The film wasn't finished", clientId: clientOf(c) },
      async ({ signal, progress, update }) => {
        update({ filmId: film.id });
        const done = [];
        let at = 0;
        for (const s of STEPS) {
          signal.throwIfAborted();
          const now = mustFilm(film.id);
          if (!s.needed(now)) {
            done.push({ step: s.step, done: false });
            at += s.share;
            continue;
          }
          update({ step: s.step });
          const from = at;
          // the step's own progress and words, inside its share of the run's
          const ctx = { signal, progress: (f, stage) => progress(from + s.share * Math.max(0, Math.min(1, f)), `${s.step}: ${stage ?? ""}`), update };
          const result = await s.run(now, ctx);
          done.push({ step: s.step, done: true, ...result });
          at += s.share;
          progress(at, s.step);
        }
        log.info(`film ${film.id} made: ${done.filter((d) => d.done).map((d) => d.step).join(", ") || "nothing left to do"}`);
        return { steps: done };
      },
    );
    return c.json(job, 202);
  });

  return app;
}
