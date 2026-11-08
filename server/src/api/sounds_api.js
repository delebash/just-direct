// SPDX-License-Identifier: MIT
// /v1/shots/:id/line, /v1/films/:id/lines, /v1/films/:id/sounds and /v1/sounds — a shot's line spoken in its character's
// voice (Qwen3-TTS VoiceDesign on the kit's audio.cpp runtime, from the words on the character's card), and the film's
// music and sound effects (Stable Audio 3 through the kit's audio features), each placed in the cut at a start time.
//
//   POST   /v1/shots/:id/line       → 202 job (kind line): the line spoken, kept as the shot's (the old one goes)
//   POST   /v1/films/:id/lines      → 202 job (kind lines): every shot with a line and a speaker but no voice yet
//   GET    /v1/films/:id/sounds     → {items: Sound[]} the music and effects in start order, then the lines
//   POST   /v1/films/:id/sounds     SoundIn → 202 job (kind sound): music or an effect made and placed
//   GET    /v1/sounds/:id/audio     → the WAV | 404
//   PATCH  /v1/sounds/:id           SoundPatch → Sound (its start or its volume) | 404 | 422
//   DELETE /v1/sounds/:id           → 204 | 404

import { randomInt, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Hono, input } from "@delebash/core/platform";
import { ApiError, notFound } from "@delebash/core/platform/errors";
import { getLogger } from "@delebash/core/platform/log";
import { wavSeconds } from "@delebash/core/runner/audiocpp";
import { getDb, getState } from "../app_state.js";
import * as films from "../database/films.js";
import { SETTING_DEFAULTS } from "../database/seed.js";
import { getSetting } from "../database/settings.js";
import * as shots from "../database/shots.js";
import * as sounds from "../database/sounds.js";
import { fileName, filmFile, removeFile, writeWhole } from "../files.js";
import { IdParams } from "../schemas/films.js";
import { SoundIn, SoundPatch } from "../schemas/sounds.js";
import { mustFilm } from "./films_api.js";
import { mustShot } from "./shots_api.js";

const log = getLogger("just_direct.sounds");

const setting = (key) => getSetting(getDb(), key) ?? SETTING_DEFAULTS[key];
const clientOf = (c) => c.req.header("x-client-id") || null;

export const soundOut = (s) => ({ ...s, audioUrl: `/v1/sounds/${s.id}/audio` });

/** The voice model, refused with what is missing when it can't speak yet (services.js `voiceCheck`). */
function voiceReady() {
  const model = setting("voices.model");
  getState().services.voiceCheck(model);
  return model;
}

/** Speak `shot`'s line in its speaker's voice; the WAV kept as the shot's line (its old one removed). → the sound. */
async function speakLine(film, shot, { signal }) {
  const db = getDb();
  if (!shot.line.trim()) throw new ApiError(409, "no-line", "The shot has no line", "Write the words spoken in the shot first.");
  const speaker = shot.speakerId ? films.getCard(db, shot.speakerId) : null;
  const model = voiceReady();
  const instructions = (speaker?.voice || "").trim() || setting("voices.default");
  const wav = await getState().services.speak(model, { input: shot.line.trim(), language: setting("voices.language"), seed: randomInt(2147483647), instructions }, { signal });
  signal?.throwIfAborted();
  const id = randomUUID();
  const file = `${id}.wav`;
  await writeWhole(filmFile(getState().dataDir, film.id, "sounds", file), wav);
  if (!shots.getShot(db, shot.id)) {
    await removeFile(filmFile(getState().dataDir, film.id, "sounds", file));
    throw notFound(`There is no shot with the id ${shot.id}.`);
  }
  const old = sounds.lineOf(db, shot.id);
  const sound = sounds.addSound(db, { id, filmId: film.id, shotId: shot.id, kind: "line", prompt: shot.line.trim(), file, seconds: wavSeconds(wav) ?? 0 });
  if (old) {
    sounds.deleteSound(db, old.id);
    const name = fileName(old.file, "wav");
    if (name) await removeFile(filmFile(getState().dataDir, film.id, "sounds", name));
  }
  log.debug(`shot ${shot.id}: its line spoken, ${sound.seconds.toFixed(1)} s`);
  return sound;
}

export function router() {
  const app = new Hono();

  app.post("/v1/shots/:id/line", input({ params: IdParams }), (c) => {
    const shot = mustShot(c.req.valid("param").id);
    const film = mustFilm(shot.filmId);
    voiceReady(); // refused at once when it can't run, not after the job starts
    const job = getState().jobs.start(
      { kind: "line", key: shot.id, label: film.title, failTitle: "The line wasn't spoken", clientId: clientOf(c) },
      async ({ signal, progress, update }) => {
        update({ filmId: film.id, shotId: shot.id });
        progress(0.05, "speaking");
        return soundOut(await speakLine(film, mustShot(shot.id), { signal }));
      },
    );
    return c.json(job, 202);
  });

  app.post("/v1/films/:id/lines", input({ params: IdParams }), (c) => {
    const film = mustFilm(c.req.valid("param").id);
    voiceReady();
    const job = getState().jobs.start(
      { kind: "lines", key: film.id, label: film.title, failTitle: "The lines weren't spoken", clientId: clientOf(c) },
      async ({ signal, progress, update }) => {
        const todo = shots.listShots(getDb(), film.id).filter((s) => s.line.trim() && s.speakerId && !sounds.lineOf(getDb(), s.id));
        update({ filmId: film.id, shots: todo.length });
        for (const [i, s] of todo.entries()) {
          progress(i / Math.max(1, todo.length), "speaking");
          const now = shots.getShot(getDb(), s.id);
          if (now) await speakLine(film, now, { signal });
        }
        return { spoken: todo.length };
      },
    );
    return c.json(job, 202);
  });

  app.get("/v1/films/:id/sounds", input({ params: IdParams }), (c) => {
    const film = mustFilm(c.req.valid("param").id);
    return c.json({ items: sounds.listSounds(getDb(), film.id).map(soundOut) });
  });

  app.post("/v1/films/:id/sounds", input({ params: IdParams, body: SoundIn }), (c) => {
    const film = mustFilm(c.req.valid("param").id);
    const body = c.req.valid("json");
    const feature = body.kind === "music" ? "sounds.music" : "sounds.effect";
    const seconds = body.seconds ?? setting(body.kind === "music" ? "sounds.musicSeconds" : "sounds.effectSeconds");
    const job = getState().jobs.start(
      { kind: "sound", key: `${film.id}:${randomUUID()}`, label: film.title, failTitle: body.kind === "music" ? "The music wasn't made" : "The sound effect wasn't made", clientId: clientOf(c) },
      async ({ signal, progress, update }) => {
        update({ filmId: film.id, kind: body.kind });
        progress(0.05, "making");
        const result = await getState().services.makeAudio(feature, {
          text: body.prompt,
          duration_seconds: seconds,
          num_inference_steps: setting("sounds.steps"),
          ...(body.kind === "music" ? { guidance_scale: 1.0 } : {}),
          seed: randomInt(2147483647),
        });
        signal.throwIfAborted();
        const wav = Buffer.from(String(result?.audio ?? ""), "base64");
        const made = wavSeconds(wav);
        if (!made) throw new ApiError(502, "no-audio", "The sound came back empty", "Try again, or with other words.");
        const id = randomUUID();
        const file = `${id}.wav`;
        await writeWhole(filmFile(getState().dataDir, film.id, "sounds", file), wav);
        return soundOut(sounds.addSound(getDb(), { id, filmId: film.id, shotId: null, kind: body.kind, prompt: body.prompt, file, seconds: made, start: body.start ?? 0, volume: body.volume ?? (body.kind === "music" ? 0.6 : 1) }));
      },
    );
    return c.json(job, 202);
  });

  app.get("/v1/sounds/:id/audio", input({ params: IdParams }), async (c) => {
    const sound = sounds.getSound(getDb(), c.req.valid("param").id);
    const name = fileName(sound?.file, "wav");
    if (!sound || !name) throw notFound("There is no such sound.");
    let bytes;
    try {
      bytes = await readFile(filmFile(getState().dataDir, sound.filmId, "sounds", name));
    } catch {
      throw notFound("This sound's file is missing.");
    }
    return c.body(bytes, 200, { "content-type": "audio/wav", "cache-control": "private, max-age=31536000, immutable" });
  });

  app.patch("/v1/sounds/:id", input({ params: IdParams, body: SoundPatch }), (c) => {
    const sound = sounds.getSound(getDb(), c.req.valid("param").id);
    if (!sound) throw notFound("There is no such sound.");
    return c.json(soundOut(sounds.updateSound(getDb(), sound.id, c.req.valid("json"))));
  });

  app.delete("/v1/sounds/:id", input({ params: IdParams }), async (c) => {
    const sound = sounds.getSound(getDb(), c.req.valid("param").id);
    if (!sound) throw notFound("There is no such sound.");
    sounds.deleteSound(getDb(), sound.id);
    const name = fileName(sound.file, "wav");
    if (name) await removeFile(filmFile(getState().dataDir, sound.filmId, "sounds", name));
    return c.body(null, 204);
  });

  return app;
}
