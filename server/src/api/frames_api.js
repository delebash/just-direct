// SPDX-License-Identifier: MIT
// /v1/shots/:id/frames and /v1/frames — a shot's first frames: painted (a job), checked by the vision model, the best
// one chosen; a frame chosen by hand; a frame deleted (frames.js holds the method).
//
//   GET    /v1/shots/:id/frames     → {items: Frame[]} the best checked first, each with its picture's address
//   GET    /v1/frames/:id/picture   → the PNG | 404
//   POST   /v1/shots/:id/frames     FramesIn → 202 job (kind frames): `count` candidates painted, checked, the best chosen
//   POST   /v1/films/:id/frames     FilmFramesIn → 202 job (kind frames-film): every shot without a frame (or every shot)
//   POST   /v1/shots/:id/frame      ChooseFrame → Shot (its chosen frame) | 404 | 422
//   DELETE /v1/frames/:id           → 204 | 404 — the shot's choice moves to its best other frame

import { randomInt, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Hono, input } from "@delebash/core/platform";
import { notFound, RequestValidationError } from "@delebash/core/platform/errors";
import { getLogger } from "@delebash/core/platform/log";
import { getDb, getState } from "../app_state.js";
import * as films from "../database/films.js";
import * as frames from "../database/frames.js";
import { SETTING_DEFAULTS } from "../database/seed.js";
import { getSetting } from "../database/settings.js";
import * as shots from "../database/shots.js";
import { fileName, filmFile, removeFile, writeWhole } from "../files.js";
import { CHECK_ACTION, cardsToPaint, checkImage, checkSchema, checkVariables, expectedRefs, framePrompt, referenceCards, scoreOf, smallReference } from "../frames.js";
import { cardRefs, parseAnswer } from "../planner.js";
import { IdParams } from "../schemas/films.js";
import { ChooseFrame, FilmFramesIn, FramesIn } from "../schemas/frames.js";
import { mustFilm, paintCardPicture } from "./films_api.js";
import { mustShot, shotOut } from "./shots_api.js";

const log = getLogger("just_direct.frames");

const setting = (key) => getSetting(getDb(), key) ?? SETTING_DEFAULTS[key];
const clientOf = (c) => c.req.header("x-client-id") || null;

export const frameOut = (f, shot) => ({ ...f, pictureUrl: `/v1/frames/${f.id}/picture?v=${encodeURIComponent(f.file)}`, chosen: shot?.frameId === f.id });

/** Paint `count` first frames for `shot`: the shot's words, its cards' pictures as references. → the frames saved. */
async function paintFrames(film, shot, count, { signal, onEach }) {
  const { dataDir, services } = getState();
  const cards = films.listCards(getDb(), film.id);
  const prompt = framePrompt(setting("frames.prompt"), shot, cards, film);
  const refs = [];
  for (const card of referenceCards(shot, cards, setting("frames.maxReferences"))) {
    const name = fileName(card.picture, "png");
    if (!name) continue;
    try {
      refs.push(await smallReference(await readFile(filmFile(dataDir, film.id, "cards", name)), setting("frames.referencePixels")));
    } catch {
      // a card's picture file gone: painted without it
    }
  }
  const made = [];
  for (let i = 0; i < count; i++) {
    signal.throwIfAborted();
    const seed = randomInt(2147483647);
    const png = await services.paintImage("frames.paint", { prompt, width: film.width, height: film.height, refs, seed }, { signal, onProgress: ({ fraction }) => onEach?.(i, fraction || 0) });
    const id = randomUUID();
    const file = `${id}.png`;
    await writeWhole(filmFile(dataDir, film.id, "frames", file), png);
    // the shot gone while it painted: the picture goes too
    if (!shots.getShot(getDb(), shot.id)) {
      await removeFile(filmFile(dataDir, film.id, "frames", file));
      throw notFound(`There is no shot with the id ${shot.id}.`);
    }
    made.push({ frame: frames.addFrame(getDb(), { id, shotId: shot.id, file, seed }), png });
    onEach?.(i, 1);
  }
  return made;
}

/** Paint the pictures of the cards `todo`'s frames will take as references and that have none yet (frames.js
 *  `cardsToPaint`); a card already being painted is left to its own job. `onEach(i, n, fraction)`. → how many. */
async function paintMissingCards(film, todo, { signal, onEach }) {
  const running = (id) => getState().jobs?.running?.("card-paint", id);
  const missing = cardsToPaint(todo, films.listCards(getDb(), film.id), setting("frames.maxReferences")).filter((c) => !running(c.id));
  for (const [i, card] of missing.entries()) {
    signal.throwIfAborted();
    await paintCardPicture(card.id, film, { signal, onProgress: (f) => onEach?.(i, missing.length, f) });
  }
  if (missing.length) log.info(`film ${film.id}: ${missing.length} card pictures painted for its first frames`);
  return missing.length;
}

/** Check `made` frames of `shot` with the vision model; a check that can't run leaves them unchecked and says why. */
async function checkFrames(film, shot, made, { signal }) {
  if (!setting("frames.check") || !made.length) return { checked: false, why: "" };
  const { services } = getState();
  const cards = films.listCards(getDb(), film.id);
  const { byId } = cardRefs(cards);
  const variables = checkVariables(shot, cards, byId);
  const expected = expectedRefs(shot, cards, byId);
  const schema = JSON.stringify(checkSchema(expected));
  try {
    for (const m of made) {
      signal.throwIfAborted();
      const r = await services.run({ action: CHECK_ACTION, variables, jsonSchema: schema, images: [await checkImage(m.png)], maxTokens: 800 }, { signal });
      const { score, verdict } = scoreOf(parseAnswer(r?.content), expected);
      m.frame = frames.setVerdict(getDb(), m.frame.id, { score, verdict });
    }
    return { checked: true, why: "" };
  } catch (e) {
    if (signal.aborted) throw e;
    log.warning(`shot ${shot.id}: the first-frame check didn't run (${e?.message || e})`);
    return { checked: false, why: e?.title || e?.message || String(e) };
  }
}

/** The best of `made` (checked: the highest score; unchecked: the first) becomes the shot's frame. */
function chooseBest(shot, made) {
  if (!made.length) return shots.getShot(getDb(), shot.id);
  const best = [...made].sort((a, b) => (b.frame.score ?? Number.NEGATIVE_INFINITY) - (a.frame.score ?? Number.NEGATIVE_INFINITY))[0];
  return shots.updateShot(getDb(), shot.id, { frameId: best.frame.id });
}

/** The film's first frames (a job's body — the toolbar's first frames, and Make the film's frames step): every shot
 *  without one, or every shot (`all`). The cards' missing pictures first (the same picture model), then every shot
 *  painted, then every one checked: the card holds one model at a time, so the picture model and the vision model
 *  change places twice, not twice a shot. → `{shots, cardsPainted, checked, checkSkipped}`. */
export async function paintFilmFrames(film, { all = false } = {}, { signal, progress, update }) {
  const count = setting("frames.candidates");
  const todo = shots.listShots(getDb(), film.id).filter((s) => all || !s.frameId);
  update({ filmId: film.id, shots: todo.length });
  const cardsPainted = await paintMissingCards(film, todo, { signal, onEach: (i, n, f) => progress((0.15 * (i + f)) / n, "cards") });
  const from = cardsPainted ? 0.15 : 0;
  const painted = [];
  for (const [i, s] of todo.entries()) {
    const now = shots.getShot(getDb(), s.id);
    if (!now) continue;
    const made = await paintFrames(film, now, count, { signal, onEach: (k, f) => progress(from + ((0.8 - from) * (i + (k + f) / count)) / todo.length, "painting") });
    painted.push({ shot: now, made });
  }
  let checked = 0;
  let skipped = "";
  for (const [i, p] of painted.entries()) {
    progress(0.8 + (0.2 * i) / Math.max(1, painted.length), "checking");
    if (!skipped) {
      const r = await checkFrames(film, p.shot, p.made, { signal });
      if (r.checked) checked++;
      else skipped = r.why;
    }
    if (shots.getShot(getDb(), p.shot.id)) chooseBest(p.shot, p.made);
  }
  return { shots: painted.length, cardsPainted, checked, checkSkipped: skipped };
}

export function router() {
  const app = new Hono();

  app.get("/v1/shots/:id/frames", input({ params: IdParams }), (c) => {
    const shot = mustShot(c.req.valid("param").id);
    return c.json({ items: frames.listFrames(getDb(), shot.id).map((f) => frameOut(f, shot)) });
  });

  app.get("/v1/frames/:id/picture", input({ params: IdParams }), async (c) => {
    const frame = frames.getFrame(getDb(), c.req.valid("param").id);
    const shot = frame ? shots.getShot(getDb(), frame.shotId) : null;
    const name = fileName(frame?.file, "png");
    if (!shot || !name) throw notFound("There is no such frame.");
    let bytes;
    try {
      bytes = await readFile(filmFile(getState().dataDir, shot.filmId, "frames", name));
    } catch {
      throw notFound("This frame's picture file is missing.");
    }
    return c.body(bytes, 200, { "content-type": "image/png", "cache-control": "private, max-age=31536000, immutable" });
  });

  app.post("/v1/shots/:id/frames", input({ params: IdParams, body: FramesIn }), (c) => {
    const shot = mustShot(c.req.valid("param").id);
    const film = mustFilm(shot.filmId);
    const count = c.req.valid("json")?.count ?? setting("frames.candidates");
    const job = getState().jobs.start(
      { kind: "frames", key: shot.id, label: film.title, failTitle: "The first frames didn't finish", clientId: clientOf(c) },
      async ({ signal, progress, update }) => {
        update({ filmId: film.id, shotId: shot.id });
        const now = mustShot(shot.id);
        const cardsPainted = await paintMissingCards(film, [now], { signal, onEach: (i, n, f) => progress((0.2 * (i + f)) / n, "cards") });
        const from = cardsPainted ? 0.2 : 0;
        const made = await paintFrames(film, now, count, { signal, onEach: (i, f) => progress(from + ((0.85 - from) * (i + f)) / count, "painting") });
        progress(0.86, "checking");
        const check = await checkFrames(film, now, made, { signal });
        const chosen = chooseBest(now, made);
        return { shot: shotOut(chosen), frames: made.length, cardsPainted, checked: check.checked, checkSkipped: check.why };
      },
    );
    return c.json(job, 202);
  });

  app.post("/v1/films/:id/frames", input({ params: IdParams, body: FilmFramesIn }), (c) => {
    const film = mustFilm(c.req.valid("param").id);
    const { all = false } = c.req.valid("json") ?? {};
    const job = getState().jobs.start(
      { kind: "frames-film", key: film.id, label: film.title, failTitle: "The first frames didn't finish", clientId: clientOf(c) },
      (ctx) => paintFilmFrames(film, { all }, ctx),
    );
    return c.json(job, 202);
  });

  app.post("/v1/shots/:id/frame", input({ params: IdParams, body: ChooseFrame }), (c) => {
    const shot = mustShot(c.req.valid("param").id);
    const { frameId } = c.req.valid("json");
    if (frameId && frames.getFrame(getDb(), frameId)?.shotId !== shot.id) {
      throw new RequestValidationError([{ loc: ["body", "frameId"], msg: "That frame isn't one of this shot's.", type: "value_error" }]);
    }
    return c.json(shotOut(shots.updateShot(getDb(), shot.id, { frameId: frameId ?? null })));
  });

  app.delete("/v1/frames/:id", input({ params: IdParams }), async (c) => {
    const frame = frames.getFrame(getDb(), c.req.valid("param").id);
    const shot = frame ? shots.getShot(getDb(), frame.shotId) : null;
    if (!shot) throw notFound("There is no such frame.");
    frames.deleteFrame(getDb(), frame.id);
    if (shot.frameId === frame.id) shots.updateShot(getDb(), shot.id, { frameId: frames.listFrames(getDb(), shot.id)[0]?.id ?? null });
    const name = fileName(frame.file, "png");
    if (name) await removeFile(filmFile(getState().dataDir, shot.filmId, "frames", name));
    return c.body(null, 204);
  });

  return app;
}
