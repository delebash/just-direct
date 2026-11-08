// SPDX-License-Identifier: MIT
// /v1/films/:id/shots and /v1/shots — a film's shots, planned by the AI from its story and changed by hand (app-structure
// §15–§16). A hand change to a shot's content marks it `edited`; Carry it forward revises only the later shots nobody
// changed by hand. The planner's work is planner.js's; its runs are the kit's runAction (services.js `run`).
//
//   GET    /v1/films/:id/shots          → {items: Shot[]} in film order
//   POST   /v1/films/:id/shots          ShotIn → 201 Shot | 404 | 422
//   POST   /v1/films/:id/shots/order    ShotOrder → {items} | 404 | 422 (not every shot once)
//   PATCH  /v1/shots/:id                ShotPatch (If-Match) → Shot | 404 | 412 | 422
//   DELETE /v1/shots/:id                (If-Match) → 204 | 404 | 412
//   POST   /v1/films/:id/plan           PlanIn → 202 job (kind plan): new cards and the shots | 409 no-story · shots-exist
//   POST   /v1/shots/:id/carry          CarryIn → 202 job (kind carry): the later shots revised | 409 nothing-to-carry

import { rm } from "node:fs/promises";
import { Hono, input } from "@delebash/core/platform";
import { ApiError, notFound, RequestValidationError } from "@delebash/core/platform/errors";
import { getLogger } from "@delebash/core/platform/log";
import { checkIfMatch, etagOf } from "@delebash/core/platform/versions";
import { getDb, getState } from "../app_state.js";
import * as films from "../database/films.js";
import { clipFiles } from "../database/clips.js";
import { frameFiles } from "../database/frames.js";
import { SETTING_DEFAULTS } from "../database/seed.js";
import { getSetting } from "../database/settings.js";
import * as shots from "../database/shots.js";
import { soundFiles } from "../database/sounds.js";
import {
  ACTIONS,
  cardRefs,
  cardsSchema,
  cardsText,
  changeText,
  newCards,
  parseAnswer,
  reviseSchema,
  shotFrom,
  shotsFrom,
  shotsSchema,
  shotsText,
} from "../planner.js";
import { IdParams } from "../schemas/films.js";
import { CarryIn, PlanIn, ShotIn, ShotOrder, ShotPatch } from "../schemas/shots.js";
import { fileName, filmFile, removeFile, safeName } from "../files.js";
import { mustFilm } from "./films_api.js";

const log = getLogger("just_direct.shots");

const setting = (key) => getSetting(getDb(), key) ?? SETTING_DEFAULTS[key];
const clientOf = (c) => c.req.header("x-client-id") || null;

const SHOT_CHANGED = { type: "shot-changed", title: "This shot was changed in another window", detail: "Your change wasn't saved — the shot is shown as it is now" };
export const shotOut = (shot) => ({ ...shot, version: etagOf(shot) });

export function mustShot(id, ifMatch = undefined) {
  const shot = shots.getShot(getDb(), id);
  if (!shot) throw notFound(`There is no shot with the id ${id}.`);
  if (ifMatch !== undefined) checkIfMatch(ifMatch, etagOf(shot), SHOT_CHANGED);
  return shot;
}

/** A shot's card ids, place and speaker are its film's own cards (a 422 under the field that isn't). */
function checkCards(filmId, body) {
  const cards = new Map(films.listCards(getDb(), filmId).map((c) => [c.id, c]));
  const bad = (field, msg) => new RequestValidationError([{ loc: ["body", field], msg, type: "value_error" }]);
  for (const id of body.cardIds ?? []) if (!cards.has(id)) throw bad("cardIds", `There is no card ${id} in this film.`);
  if (body.placeId && cards.get(body.placeId)?.kind !== "place") throw bad("placeId", "The place must be one of the film's places.");
  if (body.speakerId && cards.get(body.speakerId)?.kind !== "character") throw bad("speakerId", "Who speaks must be one of the film's characters.");
}

/** The files the work on `shotIds` made (first frames, clips, lines, guide frames), as [part, name] — read before the
 *  shots go. */
const workFiles = (shotIds) => [
  ...frameFiles(getDb(), shotIds).map((n) => ["frames", n]),
  ...clipFiles(getDb(), shotIds).map((n) => ["clips", n]),
  ...soundFiles(getDb(), shotIds).map((n) => ["sounds", n]),
  ...shotIds.map((id) => ["guides", id]),
];
/** Remove a film's work files (a stray one left is harmless). */
async function removeWork(filmId, files) {
  for (const [part, name] of files) {
    if (part === "guides") {
      await rm(filmFile(getState().dataDir, filmId, "guides", safeName(name)), { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => {});
      continue;
    }
    const ok = fileName(name, part === "clips" ? "webm" : part === "sounds" ? "wav" : "png");
    if (ok) await removeFile(filmFile(getState().dataDir, filmId, part, ok));
  }
}

/** Run one planner pass: the action, its variables, its schema for this run → the parsed answer. */
async function pass(action, variables, schema, { signal }) {
  const { services } = getState();
  const r = await services.run({ action, variables, jsonSchema: JSON.stringify(schema), maxTokens: setting("planner.maxTokens") }, { signal });
  return parseAnswer(r?.content);
}

export function router() {
  const app = new Hono();

  app.get("/v1/films/:id/shots", input({ params: IdParams }), (c) => {
    const film = mustFilm(c.req.valid("param").id);
    return c.json({ items: shots.listShots(getDb(), film.id).map(shotOut) });
  });

  app.post("/v1/films/:id/shots", input({ params: IdParams, body: ShotIn }), (c) => {
    const film = mustFilm(c.req.valid("param").id);
    const { after = null, ...body } = c.req.valid("json");
    checkCards(film.id, body);
    if (after && shots.getShot(getDb(), after)?.filmId !== film.id) throw notFound(`There is no shot ${after} in this film.`);
    const shot = shots.createShot(getDb(), film.id, { seconds: 4, ...body }, { after });
    return c.json(shotOut(shot), 201);
  });

  app.post("/v1/films/:id/shots/order", input({ params: IdParams, body: ShotOrder }), (c) => {
    const film = mustFilm(c.req.valid("param").id);
    if (!shots.orderShots(getDb(), film.id, c.req.valid("json").ids)) {
      throw new RequestValidationError([{ loc: ["body", "ids"], msg: "The order must name every shot of the film once.", type: "value_error" }]);
    }
    return c.json({ items: shots.listShots(getDb(), film.id).map(shotOut) });
  });

  app.patch("/v1/shots/:id", input({ params: IdParams, body: ShotPatch }), (c) => {
    const { id } = c.req.valid("param");
    const before = mustShot(id, c.req.header("if-match") ?? null);
    const body = c.req.valid("json");
    checkCards(before.filmId, body);
    // a change to what the shot shows or says is a hand edit: a revision keeps it
    const content = shots.CONTENT_FIELDS.some((k) => body[k] !== undefined && JSON.stringify(body[k]) !== JSON.stringify(before[k]));
    const shot = shots.updateShot(getDb(), id, body, { edited: content ? true : null });
    if (!shot) throw notFound(`There is no shot with the id ${id}.`);
    return c.json(shotOut(shot));
  });

  app.delete("/v1/shots/:id", input({ params: IdParams }), async (c) => {
    const { id } = c.req.valid("param");
    const shot = mustShot(id, c.req.header("if-match") ?? null);
    // its work stops first, and its files go after it
    for (const job of getState().jobs?.list() ?? []) if (job.data?.shotId === id) getState().jobs.cancel(job.id);
    const files = workFiles([id]);
    if (!shots.deleteShot(getDb(), id)) throw notFound(`There is no shot with the id ${id}.`);
    await removeWork(shot.filmId, files);
    return c.body(null, 204);
  });

  app.post("/v1/films/:id/plan", input({ params: IdParams, body: PlanIn }), (c) => {
    const film = mustFilm(c.req.valid("param").id);
    const { replace } = c.req.valid("json") ?? {};
    if (!film.story.trim()) throw new ApiError(409, "no-story", "The film has no story yet", "Write the story on the Story tab first — the shots are planned from it.");
    if (shots.listShots(getDb(), film.id).length && !replace) {
      throw new ApiError(409, "shots-exist", "The film already has shots", "Planning again replaces them, with their first frames and clips.", {
        withWork: shots.shotsHaveWork(getDb(), film.id),
      });
    }
    const job = getState().jobs.start(
      { kind: "plan", key: film.id, label: film.title, failTitle: "The plan didn't finish", clientId: clientOf(c) },
      async ({ signal, progress, update }) => {
        update({ filmId: film.id, phase: "cards" });
        progress(0.02, "cards");
        // 1. the cards the story needs that the film doesn't have yet
        const story = mustFilm(film.id).story;
        const have = films.listCards(getDb(), film.id);
        const before = cardRefs(have);
        const cardsAnswer = await pass(ACTIONS.cards, { story, cards: cardsText(have, before.byId) }, cardsSchema(), { signal });
        signal.throwIfAborted();
        const added = newCards(cardsAnswer, have).map((card) => films.createCard(getDb(), film.id, card));
        // 2. the shots, from the story and every card
        update({ phase: "shots", cardsAdded: added.length });
        progress(0.3, "shots");
        const cards = films.listCards(getDb(), film.id);
        const { refs, byId } = cardRefs(cards);
        const maxShots = setting("planner.maxShots");
        const shotsAnswer = await pass(ACTIONS.shots, { story, cards: cardsText(cards, byId), maxShots }, shotsSchema(cards, byId, maxShots), { signal });
        signal.throwIfAborted();
        const planned = shotsFrom(shotsAnswer, cards, refs, { wordsPerSecond: setting("planner.wordsPerSecond") });
        const files = workFiles(shots.listShots(getDb(), film.id).map((s) => s.id));
        const saved = shots.replaceShots(getDb(), film.id, planned);
        await removeWork(film.id, files);
        log.info(`film ${film.id} planned: ${saved.length} shots, ${added.length} new cards`);
        return { cardsAdded: added.length, shots: saved.length };
      },
    );
    return c.json(job, 202);
  });

  app.post("/v1/shots/:id/carry", input({ params: IdParams, body: CarryIn }), (c) => {
    const shot = mustShot(c.req.valid("param").id);
    const { note = "" } = c.req.valid("json") ?? {};
    const all = shots.listShots(getDb(), shot.filmId);
    const at = all.findIndex((s) => s.id === shot.id);
    // the later shots nobody changed by hand
    const editable = all.slice(at + 1).filter((s) => !s.edited);
    if (!editable.length) throw new ApiError(409, "nothing-to-carry", "There's nothing to carry the change into", "Every later shot was changed by hand, or this is the last shot.");
    const film = mustFilm(shot.filmId);
    const job = getState().jobs.start(
      { kind: "carry", key: film.id, label: film.title, failTitle: "The change wasn't carried forward", clientId: clientOf(c) },
      async ({ signal, progress, update }) => {
        update({ filmId: film.id, shotId: shot.id });
        progress(0.05, "revising");
        const cards = films.listCards(getDb(), film.id);
        const { refs, byId } = cardRefs(cards);
        const now = mustShot(shot.id);
        const numbers = editable.map((s) => all.indexOf(s) + 1);
        const answer = await pass(
          ACTIONS.revise,
          { cards: cardsText(cards, byId), shots: shotsText(all, byId), number: at + 1, change: changeText(now, byId, note), editable: numbers.join(", ") },
          reviseSchema(cards, byId, numbers),
          { signal },
        );
        signal.throwIfAborted();
        const changed = [];
        for (const item of Array.isArray(answer?.shots) ? answer.shots : []) {
          const target = editable[numbers.indexOf(item?.number)];
          // gone, or changed by hand meanwhile: left as it is
          const current = target ? shots.getShot(getDb(), target.id) : null;
          if (!current || current.edited) continue;
          const revised = shotFrom(item, cards, refs, { wordsPerSecond: setting("planner.wordsPerSecond") });
          shots.updateShot(getDb(), current.id, revised, { edited: false });
          changed.push(current.id);
        }
        return { why: String(answer?.why ?? "").slice(0, 600), changed };
      },
    );
    return c.json(job, 202);
  });

  return app;
}
