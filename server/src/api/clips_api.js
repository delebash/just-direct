// SPDX-License-Identifier: MIT
// /v1/shots/:id/clips, /v1/clips and a shot's guide video — a shot's clips made by LTX-2.3 (clips.js holds the
// method), one chosen for the film; the guide video's frames read with the kit's FFmpeg.
//
//   GET    /v1/shots/:id/clips      → {items: Clip[]} the newest first, each with its video's address
//   GET    /v1/clips/:id/video      → the clip (WebM, with its sound) | 404
//   POST   /v1/shots/:id/clips      → 202 job (kind clip): the clip made from the shot's chosen first frame, chosen
//   POST   /v1/films/:id/clips      FilmClipsIn → 202 job (kind clips-film): every shot without a clip (or every shot)
//   POST   /v1/shots/:id/clip       ChooseClip → Shot | 404 | 422
//   DELETE /v1/clips/:id            → 204 | 404 — the shot's choice moves to its newest other clip
//   POST   /v1/clips/:id/lips       → 202 job (kind lips): a talking clip's mouth redrawn to its line's voice by LatentSync,
//                                   a new clip, chosen | 404 | 409 (turned off, not talking, no voice, no FFmpeg, too long)
//   POST   /v1/shots/:id/guide      multipart `file` (a video) → Shot (its guide's frame count) | 409 no FFmpeg | 415
//   DELETE /v1/shots/:id/guide      → Shot

import { randomInt, randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { Hono, input, uploadLimit } from "@delebash/core/platform";
import { ApiError, notFound, RequestValidationError } from "@delebash/core/platform/errors";
import { getLogger } from "@delebash/core/platform/log";
import { ffmpegExe, runFfmpeg } from "@delebash/core/runner/ffmpeg";
import sharp from "sharp";
import { getDb, getState } from "../app_state.js";
import { clipPrompt, fitGuide, frameCount, half, LONG_TAKE_HIRES, lipClipArgs, lipFramesMax, modeOf, pathFrames, wavSeconds } from "../clips.js";
import * as clips from "../database/clips.js";
import * as films from "../database/films.js";
import * as frames from "../database/frames.js";
import { SETTING_DEFAULTS } from "../database/seed.js";
import { getSetting } from "../database/settings.js";
import * as shots from "../database/shots.js";
import * as sounds from "../database/sounds.js";
import { fileName, filmDir, filmFile, newWorkDir, removeFile, writeWhole } from "../files.js";
import { IdParams } from "../schemas/films.js";
import { ChooseClip, FilmClipsIn } from "../schemas/clips.js";
import { SECONDS_MAX } from "../schemas/shots.js";
import { mustFilm } from "./films_api.js";
import { mustShot, shotOut } from "./shots_api.js";

const log = getLogger("just_direct.clips");

const setting = (key) => getSetting(getDb(), key) ?? SETTING_DEFAULTS[key];
const clientOf = (c) => c.req.header("x-client-id") || null;

export const clipOut = (clip, shot) => ({ ...clip, videoUrl: `/v1/clips/${clip.id}/video`, chosen: shot?.clipId === clip.id });

const guideDir = (filmId, shotId) => path.join(filmDir(getState().dataDir, filmId), "guides", shotId);
async function guideFrames(filmId, shotId) {
  const dir = guideDir(filmId, shotId);
  let names = [];
  try {
    names = readdirSync(dir).filter((n) => /^\d{5}\.png$/.test(n)).sort();
  } catch {
    return [];
  }
  return Promise.all(names.map((n) => readFile(path.join(dir, n))));
}

/** The video request for `shot` (runVideoFeature's), and what it is (`mode`, `frames`, `seconds`) for its recipe. */
async function clipRequest(film, shot) {
  const db = getDb();
  const { dataDir } = getState();
  const fps = setting("clips.fps");
  const cards = films.listCards(db, film.id);
  // the shot's line, spoken by its voice, drives the clip when there is one (audio-to-video)
  const line = shot.line ? sounds.lineOf(db, shot.id) : null;
  let audio = null;
  if (line) {
    try {
      audio = await readFile(filmFile(dataDir, film.id, "sounds", line.file));
    } catch {
      audio = null;
    }
  }
  // long enough for the line, never past the longest clip LTX makes
  const seconds = audio ? Math.min(SECONDS_MAX, Math.max(shot.seconds, wavSeconds(audio) + 0.3)) : shot.seconds;
  const count = frameCount(seconds, fps);
  const mode = modeOf(shot, count);
  const request = {
    prompt: clipPrompt(setting("clips.prompt"), shot, cards, film),
    negativePrompt: setting("clips.negative"),
    width: film.width,
    height: film.height,
    frames: count,
    fps,
    seed: randomInt(2147483647),
    params: {},
  };
  // the chosen first frame
  const frame = shot.frameId ? frames.getFrame(db, shot.frameId) : null;
  const frameName = fileName(frame?.file, "png");
  if (frameName) request.init = await readFile(filmFile(dataDir, film.id, "frames", frameName));
  if (audio) request.audio = audio;
  if (mode === "long") {
    request.width = half(film.width);
    request.height = half(film.height);
    request.params.hires = { width: film.width, height: film.height, ...LONG_TAKE_HIRES };
    // the first frame at the first stage's size
    if (request.init) request.init = await sharp(request.init).resize(request.width, request.height).png().toBuffer();
  } else if (mode === "paths") {
    if (!shot.paths.length) throw new ApiError(409, "no-paths", "The shot has no drawn paths", "Draw where things move on the shot's first frame, or choose another way to make its clip.");
    request.loras = [{ slot: "lora_motion", multiplier: 1 }];
    request.guide = await pathFrames(shot.paths, { frames: count, width: film.width, height: film.height });
  } else if (mode === "guide") {
    const guide = await guideFrames(film.id, shot.id);
    if (!guide.length) throw new ApiError(409, "no-guide", "The shot has no guide video", "Add a guide video to the shot, or choose another way to make its clip.");
    request.loras = [{ slot: "lora_union", multiplier: 1 }];
    request.guide = fitGuide(guide, count);
  }
  return { request, mode, frames: count, seconds: count / fps, talking: !!audio };
}

/** Make one clip for `shot`: the request, the engine's run, the WebM saved, the clip chosen. → the clip. */
async function makeClip(film, shot, { signal, progress }) {
  const { request, mode, frames: count, talking } = await clipRequest(film, shot);
  const out = await getState().services.makeVideo("clips.make", request, { signal, onProgress: ({ fraction }) => progress?.(fraction || 0) });
  signal.throwIfAborted();
  const id = randomUUID();
  const file = `${id}.webm`;
  await writeWhole(filmFile(getState().dataDir, film.id, "clips", file), out.bytes);
  if (!shots.getShot(getDb(), shot.id)) {
    await removeFile(filmFile(getState().dataDir, film.id, "clips", file));
    throw notFound(`There is no shot with the id ${shot.id}.`);
  }
  const fps = out.fps || request.fps;
  const made = out.frames || count;
  const clip = clips.addClip(getDb(), {
    id,
    shotId: shot.id,
    file,
    seed: request.seed,
    seconds: made / fps,
    recipe: { mode, talking, width: film.width, height: film.height, frames: made, fps, prompt: request.prompt, firstFrame: shot.frameId ?? null },
  });
  shots.updateShot(getDb(), shot.id, { clipId: clip.id });
  log.info(`shot ${shot.id}: a ${mode} clip, ${made} frames`);
  return clip;
}

/** The film's clips, one shot after another (a job's body — Make clips, and Make the film's clips step): every shot
 *  without one, or every shot (`all`). One shot's refusal (no paths drawn, no guide) doesn't stop the others; the
 *  engine's own failure does. → `{shots, made, failed}`. */
export async function makeFilmClips(film, { all = false } = {}, { signal, progress, update }) {
  const todo = shots.listShots(getDb(), film.id).filter((s) => all || !s.clipId);
  update({ filmId: film.id, shots: todo.length });
  let made = 0;
  const failed = [];
  for (const [i, s] of todo.entries()) {
    const now = shots.getShot(getDb(), s.id);
    if (!now) continue;
    update({ at: i + 1 });
    try {
      await makeClip(film, now, { signal, progress: (f) => progress((i + f) / todo.length, "making") });
      made++;
    } catch (e) {
      if (signal.aborted) throw e;
      if (!(e instanceof ApiError && e.statusCode === 409)) throw e;
      failed.push({ shotId: s.id, why: e.title });
    }
  }
  return { shots: todo.length, made, failed };
}

export function router() {
  const app = new Hono();

  app.get("/v1/shots/:id/clips", input({ params: IdParams }), (c) => {
    const shot = mustShot(c.req.valid("param").id);
    return c.json({ items: clips.listClips(getDb(), shot.id).map((k) => clipOut(k, shot)) });
  });

  app.get("/v1/clips/:id/video", input({ params: IdParams }), async (c) => {
    const clip = clips.getClip(getDb(), c.req.valid("param").id);
    const shot = clip ? shots.getShot(getDb(), clip.shotId) : null;
    const name = fileName(clip?.file, "webm");
    if (!shot || !name) throw notFound("There is no such clip.");
    let bytes;
    try {
      bytes = await readFile(filmFile(getState().dataDir, shot.filmId, "clips", name));
    } catch {
      throw notFound("This clip's file is missing.");
    }
    return c.body(bytes, 200, { "content-type": "video/webm", "cache-control": "private, max-age=31536000, immutable" });
  });

  app.post("/v1/shots/:id/clips", input({ params: IdParams }), (c) => {
    const shot = mustShot(c.req.valid("param").id);
    const film = mustFilm(shot.filmId);
    const job = getState().jobs.start(
      { kind: "clip", key: shot.id, label: film.title, failTitle: "The clip didn't finish", clientId: clientOf(c) },
      async ({ signal, progress, update }) => {
        update({ filmId: film.id, shotId: shot.id });
        const clip = await makeClip(film, mustShot(shot.id), { signal, progress: (f) => progress(0.98 * f, "making") });
        return { clip: clipOut(clip, shots.getShot(getDb(), shot.id)), shot: shotOut(shots.getShot(getDb(), shot.id)) };
      },
    );
    return c.json(job, 202);
  });

  app.post("/v1/films/:id/clips", input({ params: IdParams, body: FilmClipsIn }), (c) => {
    const film = mustFilm(c.req.valid("param").id);
    const { all = false } = c.req.valid("json") ?? {};
    const job = getState().jobs.start(
      { kind: "clips-film", key: film.id, label: film.title, failTitle: "The clips didn't finish", clientId: clientOf(c) },
      (ctx) => makeFilmClips(film, { all }, ctx),
    );
    return c.json(job, 202);
  });

  app.post("/v1/shots/:id/clip", input({ params: IdParams, body: ChooseClip }), (c) => {
    const shot = mustShot(c.req.valid("param").id);
    const { clipId } = c.req.valid("json");
    if (clipId && clips.getClip(getDb(), clipId)?.shotId !== shot.id) {
      throw new RequestValidationError([{ loc: ["body", "clipId"], msg: "That clip isn't one of this shot's.", type: "value_error" }]);
    }
    return c.json(shotOut(shots.updateShot(getDb(), shot.id, { clipId: clipId ?? null })));
  });

  app.delete("/v1/clips/:id", input({ params: IdParams }), async (c) => {
    const clip = clips.getClip(getDb(), c.req.valid("param").id);
    const shot = clip ? shots.getShot(getDb(), clip.shotId) : null;
    if (!shot) throw notFound("There is no such clip.");
    clips.deleteClip(getDb(), clip.id);
    if (shot.clipId === clip.id) shots.updateShot(getDb(), shot.id, { clipId: clips.listClips(getDb(), shot.id)[0]?.id ?? null });
    const name = fileName(clip.file, "webm");
    if (name) await removeFile(filmFile(getState().dataDir, shot.filmId, "clips", name));
    return c.body(null, 204);
  });

  // lip repair: LatentSync redraws a talking clip's mouth to its line's voice; its frames and that voice made into a new
  // clip by the kit's FFmpeg, chosen for the shot (the old one kept). Offered only when Settings → Clips turns it on.
  app.post("/v1/clips/:id/lips", input({ params: IdParams }), (c) => {
    const clip = clips.getClip(getDb(), c.req.valid("param").id);
    const shot = clip ? shots.getShot(getDb(), clip.shotId) : null;
    const clipName = fileName(clip?.file, "webm");
    if (!shot || !clipName) throw notFound("There is no such clip.");
    const film = mustFilm(shot.filmId);
    if (!setting("clips.lipRepair")) throw new ApiError(409, "lips-off", "Lip repair is off", "Turn on Offer lip repair on talking clips in Settings → General, under Clips.");
    if (!clip.recipe?.talking) throw new ApiError(409, "not-talking", "This clip has no voice to match", "Lip repair redraws a talking clip's mouth to its line: speak the shot's line, then make its clip.");
    const voiceName = fileName(sounds.lineOf(getDb(), shot.id)?.file, "wav");
    if (!voiceName) throw new ApiError(409, "no-line", "The shot's line has no voice", "Speak the shot's line first.");
    if (!ffmpegExe()) throw new ApiError(409, "engine-not-installed", "FFmpeg isn't installed", "Install FFmpeg on the AI page's FFmpeg tab — the repaired clip is made with it.");
    const { width, height, frames, fps } = clip.recipe;
    const most = lipFramesMax(width, height);
    if (frames > most) {
      throw new ApiError(409, "too-long", "This clip is too long to repair", `Lip repair takes up to ${(most / fps).toFixed(1)} s of a ${width}×${height} clip; this one is ${(frames / fps).toFixed(1)} s.`);
    }
    const job = getState().jobs.start(
      { kind: "lips", key: clip.id, label: film.title, failTitle: "The lips weren't repaired", clientId: clientOf(c) },
      async ({ signal, progress, update }) => {
        update({ filmId: film.id, shotId: shot.id, clipId: clip.id });
        progress(0.02, "repairing");
        const { dataDir } = getState();
        const voice = filmFile(dataDir, film.id, "sounds", voiceName);
        const seed = randomInt(2147483647);
        const request = {
          audio_base64: (await readFile(voice)).toString("base64"),
          options: {
            reference_video_file: filmFile(dataDir, film.id, "clips", clipName),
            fps,
            num_inference_steps: setting("clips.lipSteps"),
            guidance_scale: setting("clips.lipGuidance"),
            seed,
          },
        };
        // many minutes a clip on an 8 GB card (about 100 s a second of clip on a large one, the kit's RESEARCH): the
        // engine is given three hours before the request is called failed
        const result = await getState().services.makeAudio("clips.lips", request, { timeout: 3 * 3600 });
        signal.throwIfAborted();
        const art = (result?.artifacts ?? []).find((a) => a?.meta?.format === "rgb24" && a?.payload);
        if (!art) throw new ApiError(502, "no-frames", "The repaired frames came back empty", "Try again.");
        const size = { width: Number(art.meta.width), height: Number(art.meta.height), frames: Number(art.meta.frames), fps: Number(art.meta.fps) || fps };
        const work = newWorkDir(dataDir);
        try {
          const raw = path.join(work, "frames.rgb");
          writeFileSync(raw, Buffer.from(String(art.payload), "base64"));
          progress(0.95, "joining");
          const id = randomUUID();
          const file = `${id}.webm`;
          const out = path.join(work, file);
          await runFfmpeg(lipClipArgs({ raw, ...size, voice }, out), { signal });
          await writeWhole(filmFile(dataDir, film.id, "clips", file), await readFile(out));
          if (!shots.getShot(getDb(), shot.id)) {
            await removeFile(filmFile(dataDir, film.id, "clips", file));
            throw notFound(`There is no shot with the id ${shot.id}.`);
          }
          const made = clips.addClip(getDb(), { id, shotId: shot.id, file, seed, seconds: size.frames / size.fps, recipe: { ...clip.recipe, ...size, mode: "lips", repairedFrom: clip.id } });
          shots.updateShot(getDb(), shot.id, { clipId: made.id });
          log.info(`shot ${shot.id}: its clip's lips repaired, ${size.frames} frames`);
          return { clip: clipOut(made, shots.getShot(getDb(), shot.id)), shot: shotOut(shots.getShot(getDb(), shot.id)) };
        } finally {
          rmSync(work, { recursive: true, force: true });
        }
      },
    );
    return c.json(job, 202);
  });

  // a guide video: its frames read at the film's size and the clips' frame rate by the kit's FFmpeg, kept as PNGs
  const maxGuideBytes = () => setting("clips.maxGuideMegabytes") * 1024 * 1024;
  app.post("/v1/shots/:id/guide", uploadLimit(() => maxGuideBytes() + 64 * 1024, { slug: "file-too-large", title: "File too large" }), input({ params: IdParams }), async (c) => {
    const shot = mustShot(c.req.valid("param").id);
    const film = mustFilm(shot.filmId);
    if (!ffmpegExe()) throw new ApiError(409, "engine-not-installed", "FFmpeg isn't installed", "Install FFmpeg on the AI page's FFmpeg tab — the guide video's frames are read with it.");
    let form;
    try {
      form = await c.req.parseBody();
    } catch {
      form = {};
    }
    const file = form.file;
    if (!(file instanceof Blob)) throw new RequestValidationError([{ loc: ["body", "file"], msg: "Field required", type: "missing" }]);
    const work = newWorkDir(getState().dataDir);
    try {
      const src = path.join(work, "in.video");
      writeFileSync(src, Buffer.from(await file.arrayBuffer()));
      mkdirSync(path.join(work, "out"));
      const fps = setting("clips.fps");
      const most = frameCount(13, fps);
      try {
        await runFfmpeg(["-v", "error", "-y", "-i", src, "-vf", `fps=${fps},scale=${film.width}:${film.height}:force_original_aspect_ratio=increase,crop=${film.width}:${film.height}`, "-frames:v", String(most), path.join(work, "out", "%05d.png")]);
      } catch {
        throw new ApiError(415, "not-a-video", "Not a video FFmpeg can read", "Use an MP4, WebM or MOV video.");
      }
      const names = readdirSync(path.join(work, "out")).filter((n) => n.endsWith(".png")).sort();
      if (!names.length) throw new ApiError(415, "not-a-video", "The video has no frames", "Use an MP4, WebM or MOV video.");
      const dir = guideDir(film.id, shot.id);
      await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      mkdirSync(dir, { recursive: true });
      for (const [i, n] of names.entries()) writeFileSync(path.join(dir, `${String(i).padStart(5, "0")}.png`), await readFile(path.join(work, "out", n)));
      return c.json(shotOut(shots.updateShot(getDb(), shot.id, { guideFrames: names.length, mode: "guide" })));
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  app.delete("/v1/shots/:id/guide", input({ params: IdParams }), async (c) => {
    const shot = mustShot(c.req.valid("param").id);
    await rm(guideDir(shot.filmId, shot.id), { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => {});
    return c.json(shotOut(shots.updateShot(getDb(), shot.id, { guideFrames: 0, ...(shot.mode === "guide" ? { mode: "auto" } : {}) })));
  });

  return app;
}

