// SPDX-License-Identifier: MIT
// /v1/films and /v1/cards — a film and what it reuses in every shot (app-structure §15–§16; the template's notes area
// was the reference). A request is checked against its schema (schemas/films.js) by the kit's `input()`; a refusal is
// the kit's `notFound`/`ApiError`; the SQL is the store's (database/films.js); a film's files are files.js's.
//
//   GET    /v1/films                  → {items: Film[]} the most recently changed first, with card and shot counts
//   POST   /v1/films                  FilmIn → 201 Film | 422
//   GET    /v1/films/:id              → Film | 404
//   PATCH  /v1/films/:id              FilmPatch (If-Match) → Film | 404 | 412 | 422
//   DELETE /v1/films/:id              (If-Match) → 204 | 404 | 412 — its folder goes with it
//   GET    /v1/films/:id/cards        → {items: Card[]}
//   POST   /v1/films/:id/cards        CardIn → 201 Card | 404 | 422
//   PATCH  /v1/cards/:id              CardPatch (If-Match) → Card | 404 | 412 | 422
//   DELETE /v1/cards/:id              (If-Match) → 204 | 404 | 412
//   GET    /v1/cards/:id/picture      → the PNG | 404
//   POST   /v1/cards/:id/picture      multipart `file` (PNG, JPEG or WebP) → Card | 404 | 413 | 415 | 422
//   DELETE /v1/cards/:id/picture      → Card | 404
//   POST   /v1/cards/:id/paint        PaintIn → 202 job (kind card-paint): the picture painted by the AI, the card back
//   GET    /v1/cards/:id/voice-sample → the WAV | 404
//   POST   /v1/cards/:id/voice-sample multipart `file` (any audio FFmpeg reads), optional `text` (what it says) → Card |
//                                     404 | 409 (not a character, no FFmpeg) | 413 | 415 — its JustVoice voice made again
//                                     from the recording when next needed
//   DELETE /v1/cards/:id/voice-sample → Card | 404
//   POST   /v1/cards/:id/voice        → 202 job (kind card-voice): the character's voice made in JustVoice (voices.js), the
//                                     card back | 404 | 409 (not a character, JustVoice not running)
//   DELETE /v1/cards/:id/voice        → Card | 404 — the voice gone from JustVoice and the card
//   GET    /v1/cards/:id/voice-audition → the WAV JustVoice auditioned the voice with | 404

import { randomInt } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Hono, input, uploadLimit } from "@delebash/core/platform";
import { ApiError, notFound, RequestValidationError } from "@delebash/core/platform/errors";
import { getLogger } from "@delebash/core/platform/log";
import { checkIfMatch, etagOf } from "@delebash/core/platform/versions";
import { ffmpegReadiness, runFfmpeg } from "@delebash/core/runner/ffmpeg";
import sharp from "sharp";
import { getDb, getState } from "../app_state.js";
import * as films from "../database/films.js";
import { SETTING_DEFAULTS } from "../database/seed.js";
import { getSetting } from "../database/settings.js";
import { dropCardFromShots } from "../database/shots.js";
import { ensureFilmDirs, fileName, filmFile, newWorkDir, removeFile, removeFilmDirs, writeWhole } from "../files.js";
import { CardIn, CardPatch, FilmIn, FilmPatch, IdParams, PaintIn } from "../schemas/films.js";
import { ensureVoice, forgetVoice, mustReachJustVoice } from "../voices.js";

const log = getLogger("just_direct.films");

const setting = (key) => getSetting(getDb(), key) ?? SETTING_DEFAULTS[key];
const clientOf = (c) => c.req.header("x-client-id") || null;

// ── versions (If-Match, the kit's platform/versions.js) ───────────────────────────────────────────────────────────

const FILM_CHANGED = { type: "film-changed", title: "This film was changed in another window", detail: "Your change wasn't saved — the film is shown as it is now" };
const CARD_CHANGED = { type: "card-changed", title: "This card was changed in another window", detail: "Your change wasn't saved — the card is shown as it is now" };

const versioned = (row) => ({ ...row, version: etagOf(row) });

/** A card as the wire shows it: its version, and where its picture is read (the name in the address, so a new picture
 *  is a new address and never a cached old one). */
export function cardOut(card) {
  const v = versioned(card);
  return {
    ...v,
    pictureUrl: card.picture ? `/v1/cards/${card.id}/picture?v=${encodeURIComponent(card.picture)}` : null,
    voiceSampleUrl: card.voiceSample ? `/v1/cards/${card.id}/voice-sample?v=${encodeURIComponent(card.voiceSample)}` : null,
    voiceAuditionUrl: card.voiceInfo?.audition ? `/v1/cards/${card.id}/voice-audition?v=${encodeURIComponent(card.voiceInfo.audition)}` : null,
  };
}

export function mustFilm(id, ifMatch = undefined) {
  const film = films.getFilm(getDb(), id);
  if (!film) throw notFound(`There is no film with the id ${id}.`);
  if (ifMatch !== undefined) checkIfMatch(ifMatch, etagOf(film), FILM_CHANGED);
  return film;
}

export function mustCard(id, ifMatch = undefined) {
  const card = films.getCard(getDb(), id);
  if (!card) throw notFound(`There is no card with the id ${id}.`);
  if (ifMatch !== undefined) checkIfMatch(ifMatch, etagOf(card), CARD_CHANGED);
  return card;
}

// ── a card's picture ──────────────────────────────────────────────────────────────────────────────────────────────

/** A card's picture size: a character 3:4 (a full-length reference), a prop square, a place or a look the film's shape;
 *  the long side the setting's, both sides multiples of 64 (sd.cpp's sizes). */
export function pictureSize(kind, film, side) {
  const snap = (n) => Math.max(64, Math.round(n / 64) * 64);
  if (kind === "character") return { width: snap((side * 3) / 4), height: side };
  if (kind === "prop") return { width: side, height: side };
  const wide = film.width >= film.height;
  return wide ? { width: side, height: snap((side * film.height) / film.width) } : { width: snap((side * film.width) / film.height), height: side };
}

/** The words a card's picture is painted from: its kind's template with {name}, {description} and {look} filled in. */
export function picturePrompt(template, card, film) {
  const fill = { name: card.name, description: card.description || card.name, look: film.look || "" };
  return String(template)
    .replace(/\{(name|description|look)\}/g, (_, k) => fill[k])
    .replace(/\s+\./g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Save `png` as card `cardId`'s new picture: a new file, the row pointed at it, the old file removed. The card gone
 *  meanwhile: the file goes too, and a 404. */
async function savePicture(cardId, filmId, png) {
  const db = getDb();
  const { dataDir } = getState();
  const name = `${cardId}-${Date.now().toString(36)}${randomInt(1000).toString(36)}.png`;
  const file = filmFile(dataDir, filmId, "cards", name);
  await writeWhole(file, png);
  const before = films.getCard(db, cardId);
  const card = before ? films.updateCard(db, cardId, { picture: name }) : null;
  if (!card) {
    await removeFile(file);
    throw notFound(`There is no card with the id ${cardId}.`);
  }
  const old = fileName(before.picture, "png");
  if (old && old !== name) await removeFile(filmFile(dataDir, filmId, "cards", old));
  return card;
}

/** Paint `card`'s picture from its words as they are now and keep it (the old one goes). `onProgress(fraction)`,
 *  `signal` cancels. → the card. The Cards tab's Paint and the first frames' missing pictures both paint this way. */
export async function paintCardPicture(cardId, film, { seed = randomInt(2147483647), signal = null, onProgress = null } = {}) {
  const now = mustCard(cardId); // the words as they are when it starts
  const prompt = picturePrompt(setting(`cards.prompt.${now.kind}`), now, film);
  const size = pictureSize(now.kind, film, setting("cards.pictureSide"));
  const png = await getState().services.paintImage("cards.paint", { prompt, ...size, seed }, { signal, onProgress: ({ fraction }) => onProgress?.(fraction || 0) });
  signal?.throwIfAborted();
  return savePicture(cardId, film.id, png);
}

const refuseFile = (msg, type) => new RequestValidationError([{ loc: ["body", "file"], msg, type }]);

/** A picture file as a PNG the engines take: turned upright (EXIF), at most 2048 px on its long side. */
async function toPng(bytes) {
  try {
    return await sharp(bytes).rotate().resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true }).png().toBuffer();
  } catch {
    throw new ApiError(415, "not-a-picture", "Not a picture", "Use a PNG, JPEG or WebP picture.");
  }
}

// ── routes ────────────────────────────────────────────────────────────────────────────────────────────────────────

export function router() {
  const app = new Hono();

  app.get("/v1/films", (c) => c.json({ items: films.listFilms(getDb()).map(versioned) }));

  app.post("/v1/films", input({ body: FilmIn }), (c) => {
    const body = c.req.valid("json");
    const film = films.createFilm(getDb(), { ...body, width: body.width ?? setting("films.width"), height: body.height ?? setting("films.height") });
    ensureFilmDirs(getState().dataDir, film.id);
    log.debug(`film ${film.id} created`);
    return c.json(versioned(film), 201);
  });

  app.get("/v1/films/:id", input({ params: IdParams }), (c) => {
    const v = versioned(mustFilm(c.req.valid("param").id));
    c.header("ETag", v.version);
    return c.json(v);
  });

  app.patch("/v1/films/:id", input({ params: IdParams, body: FilmPatch }), (c) => {
    const { id } = c.req.valid("param");
    mustFilm(id, c.req.header("if-match") ?? null);
    const film = films.updateFilm(getDb(), id, c.req.valid("json"));
    if (!film) throw notFound(`There is no film with the id ${id}.`);
    const v = versioned(film);
    c.header("ETag", v.version);
    return c.json(v);
  });

  app.delete("/v1/films/:id", input({ params: IdParams }), async (c) => {
    const { id } = c.req.valid("param");
    mustFilm(id, c.req.header("if-match") ?? null);
    // its work stops first: a picture or a clip being made for it would land in a folder that is gone
    for (const job of getState().jobs?.list() ?? []) if (job.data?.filmId === id) getState().jobs.cancel(job.id);
    if (!films.deleteFilm(getDb(), id)) throw notFound(`There is no film with the id ${id}.`);
    await removeFilmDirs(getState().dataDir, id);
    log.debug(`film ${id} deleted`);
    return c.body(null, 204);
  });

  app.get("/v1/films/:id/cards", input({ params: IdParams }), (c) => {
    const film = mustFilm(c.req.valid("param").id);
    return c.json({ items: films.listCards(getDb(), film.id).map(cardOut) });
  });

  app.post("/v1/films/:id/cards", input({ params: IdParams, body: CardIn }), (c) => {
    const film = mustFilm(c.req.valid("param").id);
    const card = films.createCard(getDb(), film.id, c.req.valid("json"));
    log.debug(`card ${card.id} added to film ${film.id}`);
    return c.json(cardOut(card), 201);
  });

  app.patch("/v1/cards/:id", input({ params: IdParams, body: CardPatch }), (c) => {
    const { id } = c.req.valid("param");
    mustCard(id, c.req.header("if-match") ?? null);
    const card = films.updateCard(getDb(), id, c.req.valid("json"));
    if (!card) throw notFound(`There is no card with the id ${id}.`);
    return c.json(cardOut(card));
  });

  app.delete("/v1/cards/:id", input({ params: IdParams }), async (c) => {
    const { id } = c.req.valid("param");
    const card = mustCard(id, c.req.header("if-match") ?? null);
    const running = getState().jobs?.running("card-paint", id);
    if (running) getState().jobs.cancel(running.id);
    // it leaves the shots that named it (their card list, place or speaker), and its voice leaves JustVoice
    dropCardFromShots(getDb(), card.filmId, id);
    if (card.voiceId) await forgetVoice(card);
    if (!films.deleteCard(getDb(), id)) throw notFound(`There is no card with the id ${id}.`);
    for (const name of [fileName(card.picture, "png"), fileName(card.voiceSample, "wav")]) {
      if (name) await removeFile(filmFile(getState().dataDir, card.filmId, "cards", name));
    }
    return c.body(null, 204);
  });

  // ── a character's voice, made in JustVoice (voices.js) ──
  app.post("/v1/cards/:id/voice", input({ params: IdParams }), async (c) => {
    const card = mustCard(c.req.valid("param").id);
    if (card.kind !== "character") throw new ApiError(409, "not-a-character", "Only a character speaks", "A voice is made for a character's card.");
    const film = mustFilm(card.filmId);
    await mustReachJustVoice();
    const job = getState().jobs.start(
      { kind: "card-voice", key: card.id, label: card.name, failTitle: "The voice wasn't made", clientId: clientOf(c) },
      async ({ signal, progress, update }) => {
        update({ filmId: film.id, cardId: card.id });
        progress(0.02, "voice");
        // made again: the voice it had goes first
        const now = mustCard(card.id);
        const fresh = now.voiceId ? await forgetVoice(now) : now;
        return cardOut(await ensureVoice(film, fresh, { signal, onProgress: (f) => progress(0.02 + 0.96 * f, "voice") }));
      },
    );
    return c.json(job, 202);
  });

  app.delete("/v1/cards/:id/voice", input({ params: IdParams }), async (c) => {
    const card = mustCard(c.req.valid("param").id);
    return c.json(cardOut(card.voiceId || card.voiceInfo?.audition ? await forgetVoice(card) : card));
  });

  app.get("/v1/cards/:id/voice-audition", input({ params: IdParams }), async (c) => {
    const card = mustCard(c.req.valid("param").id);
    const name = fileName(card.voiceInfo?.audition, "wav");
    if (!name) throw notFound("This card's voice has no audition.");
    let bytes;
    try {
      bytes = await readFile(filmFile(getState().dataDir, card.filmId, "cards", name));
    } catch {
      throw notFound("This card's voice audition is missing.");
    }
    return c.body(bytes, 200, { "content-type": "audio/wav", "cache-control": "private, max-age=31536000, immutable" });
  });

  // ── a character's voice from a recording ──
  app.get("/v1/cards/:id/voice-sample", input({ params: IdParams }), async (c) => {
    const card = mustCard(c.req.valid("param").id);
    const name = fileName(card.voiceSample, "wav");
    if (!name) throw notFound("This card has no voice recording.");
    let bytes;
    try {
      bytes = await readFile(filmFile(getState().dataDir, card.filmId, "cards", name));
    } catch {
      throw notFound("This card's voice recording is missing.");
    }
    return c.body(bytes, 200, { "content-type": "audio/wav", "cache-control": "private, max-age=31536000, immutable" });
  });

  const maxSampleBytes = () => setting("voices.maxSampleMegabytes") * 1024 * 1024;
  app.post(
    "/v1/cards/:id/voice-sample",
    uploadLimit(() => maxSampleBytes() + 64 * 1024, { slug: "file-too-large", title: "File too large" }),
    input({ params: IdParams }),
    async (c) => {
      const card = mustCard(c.req.valid("param").id);
      if (card.kind !== "character") throw new ApiError(409, "not-a-character", "Only a character speaks", "A voice recording goes on a character's card.");
      if (!ffmpegReadiness().ready) throw new ApiError(409, "engine-not-installed", "FFmpeg isn't installed", "Install FFmpeg on the AI page's FFmpeg tab — the recording is read with it.");
      let form;
      try {
        form = await c.req.parseBody();
      } catch {
        form = {};
      }
      const file = form.file;
      if (!(file instanceof Blob)) throw refuseFile("Field required", "missing");
      if (file.size > maxSampleBytes()) throw new ApiError(413, "file-too-large", "File too large", `The recording is over ${setting("voices.maxSampleMegabytes")} MB.`);
      const text = String(form.text ?? "").trim().slice(0, 1000);
      // FFmpeg reads whatever it is (WAV, MP3, M4A, the window's own recording) into a 24 kHz mono WAV for JustVoice, at
      // most the setting's seconds; the old recording goes once the new one is in place
      const work = newWorkDir(getState().dataDir);
      const name = `${card.id}-voice-${Date.now().toString(36)}${randomInt(1000).toString(36)}.wav`;
      try {
        const src = path.join(work, "in");
        writeFileSync(src, Buffer.from(await file.arrayBuffer()));
        const out = path.join(work, "out.wav");
        try {
          await runFfmpeg(["-v", "error", "-y", "-i", src, "-vn", "-ac", "1", "-ar", "24000", "-t", String(setting("voices.sampleSeconds")), "-c:a", "pcm_s16le", out]);
        } catch {
          throw new ApiError(415, "not-audio", "Not a recording FFmpeg can read", "Use a WAV, MP3 or M4A recording.");
        }
        await writeWhole(filmFile(getState().dataDir, card.filmId, "cards", name), await readFile(out));
      } finally {
        rmSync(work, { recursive: true, force: true });
      }
      const before = mustCard(card.id);
      // the voice it had is made again from the recording when next needed
      if (before.voiceId) await forgetVoice(before);
      const after = films.updateCard(getDb(), card.id, { voiceSample: name, voiceSampleText: text });
      const old = fileName(before.voiceSample, "wav");
      if (old && old !== name) await removeFile(filmFile(getState().dataDir, card.filmId, "cards", old));
      log.debug(`card ${card.id}: a voice recording`);
      return c.json(cardOut(after));
    },
  );

  app.delete("/v1/cards/:id/voice-sample", input({ params: IdParams }), async (c) => {
    const card = mustCard(c.req.valid("param").id);
    const old = fileName(card.voiceSample, "wav");
    // a voice cloned from the recording goes with it
    if (card.voiceId && card.voiceInfo?.source === "recording") await forgetVoice(card);
    const after = films.updateCard(getDb(), card.id, { voiceSample: null, voiceSampleText: "" });
    if (old) await removeFile(filmFile(getState().dataDir, card.filmId, "cards", old));
    return c.json(cardOut(after));
  });

  app.get("/v1/cards/:id/picture", input({ params: IdParams }), async (c) => {
    const card = mustCard(c.req.valid("param").id);
    const name = fileName(card.picture, "png");
    if (!name) throw notFound("This card has no picture.");
    let bytes;
    try {
      bytes = await readFile(filmFile(getState().dataDir, card.filmId, "cards", name));
    } catch {
      throw notFound("This card's picture file is missing.");
    }
    // the address names the file (?v=), so one address is always the same picture
    return c.body(bytes, 200, { "content-type": "image/png", "cache-control": "private, max-age=31536000, immutable" });
  });

  const maxPictureBytes = () => setting("cards.maxPictureMegabytes") * 1024 * 1024;
  app.post(
    "/v1/cards/:id/picture",
    uploadLimit(() => maxPictureBytes() + 64 * 1024, { slug: "file-too-large", title: "File too large" }),
    input({ params: IdParams }),
    async (c) => {
      const card = mustCard(c.req.valid("param").id);
      let form;
      try {
        form = await c.req.parseBody();
      } catch {
        form = {};
      }
      const file = form.file;
      if (!(file instanceof Blob)) throw refuseFile("Field required", "missing");
      if (file.size > maxPictureBytes()) throw new ApiError(413, "file-too-large", "File too large", `The picture is over ${setting("cards.maxPictureMegabytes")} MB.`);
      const png = await toPng(Buffer.from(await file.arrayBuffer()));
      return c.json(cardOut(await savePicture(card.id, card.filmId, png)));
    },
  );

  app.delete("/v1/cards/:id/picture", input({ params: IdParams }), async (c) => {
    const card = mustCard(c.req.valid("param").id);
    const old = fileName(card.picture, "png");
    const after = films.updateCard(getDb(), card.id, { picture: null });
    if (old) await removeFile(filmFile(getState().dataDir, card.filmId, "cards", old));
    return c.json(cardOut(after));
  });

  app.post("/v1/cards/:id/paint", input({ params: IdParams, body: PaintIn }), (c) => {
    const card = mustCard(c.req.valid("param").id);
    const film = mustFilm(card.filmId);
    const seed = c.req.valid("json")?.seed ?? randomInt(2147483647);
    const job = getState().jobs.start(
      { kind: "card-paint", key: card.id, label: card.name, failTitle: "The picture didn't finish", clientId: clientOf(c), meta: { seed } },
      async ({ signal, progress, update }) => {
        update({ filmId: film.id, cardId: card.id, seed });
        progress(0.02, "painting");
        return cardOut(await paintCardPicture(card.id, film, { seed, signal, onProgress: (f) => progress(0.02 + 0.93 * f, "painting") }));
      },
    );
    return c.json(job, 202);
  });

  return app;
}
