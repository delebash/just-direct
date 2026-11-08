// SPDX-License-Identifier: MIT
// /v1/films/:id/export — the film joined into one MP4 (cut.js holds how), kept beside the film's folder until the next
// export replaces it (exports are made again from the clips, so they stay out of the backup — files.js).
//
//   POST /v1/films/:id/export          → 202 job (kind export): every shot with a clip, in order → the export | 409 no clips
//   GET  /v1/films/:id/export          → {file, seconds, createdAt, videoUrl, name} | 404 none yet
//   GET  /v1/films/:id/export/video    → the MP4 | 404

import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Hono, input } from "@delebash/core/platform";
import { ApiError, notFound } from "@delebash/core/platform/errors";
import { getLogger } from "@delebash/core/platform/log";
import { ffmpegReadiness, runFfmpeg } from "@delebash/core/runner/ffmpeg";
import { getDb, getState } from "../app_state.js";
import * as clips from "../database/clips.js";
import { SETTING_DEFAULTS } from "../database/seed.js";
import { getSetting } from "../database/settings.js";
import * as shots from "../database/shots.js";
import * as sounds from "../database/sounds.js";
import { exportDir, fileName, filmFile } from "../files.js";
import { joinArgs, pieceArgs, silentPieceArgs } from "../cut.js";
import { IdParams } from "../schemas/films.js";
import { mustFilm } from "./films_api.js";

const log = getLogger("just_direct.cut");

const setting = (key) => getSetting(getDb(), key) ?? SETTING_DEFAULTS[key];
const clientOf = (c) => c.req.header("x-client-id") || null;

/** The film's title as a file name. */
const slug = (s) =>
  String(s)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "film";

/** The newest export of a film: `{file, path, seconds?, createdAt}` or null. */
function latestExport(filmId) {
  const dir = exportDir(getState().dataDir, filmId);
  if (!existsSync(dir)) return null;
  const names = readdirSync(dir).filter((n) => /^[A-Za-z0-9_-]{1,80}\.mp4$/.test(n));
  const all = names.map((n) => ({ file: n, path: path.join(dir, n), at: statSync(path.join(dir, n)).mtimeMs })).sort((a, b) => b.at - a.at);
  return all[0] ?? null;
}

export function router() {
  const app = new Hono();

  app.post("/v1/films/:id/export", input({ params: IdParams }), (c) => {
    const film = mustFilm(c.req.valid("param").id);
    const withClips = shots.listShots(getDb(), film.id).filter((s) => s.clipId);
    if (!withClips.length) throw new ApiError(409, "no-clips", "No shot has a clip yet", "Make the shots' clips first — the film is joined from them.");
    if (!ffmpegReadiness().ready) throw new ApiError(409, "engine-not-installed", "FFmpeg isn't installed", "Install FFmpeg on the AI page's FFmpeg tab — the film is joined with it.");
    const job = getState().jobs.start(
      { kind: "export", key: film.id, label: film.title, failTitle: "The film wasn't joined", clientId: clientOf(c) },
      async ({ signal, progress, update }) => {
        const db = getDb();
        const { dataDir } = getState();
        const all = shots.listShots(db, film.id);
        const todo = all.filter((s) => s.clipId && clips.getClip(db, s.clipId));
        update({ filmId: film.id, shots: todo.length, skipped: all.length - todo.length });
        const out = exportDir(dataDir, film.id);
        const work = path.join(out, "work");
        rmSync(work, { recursive: true, force: true });
        mkdirSync(work, { recursive: true });
        try {
          const size = { width: film.width, height: film.height, fps: setting("clips.fps") };
          const pieces = [];
          for (const [i, s] of todo.entries()) {
            progress((0.8 * i) / todo.length, "pieces");
            const clip = clips.getClip(db, s.clipId);
            const line = sounds.lineOf(db, s.id);
            const lineName = fileName(line?.file, "wav");
            const piece = {
              clip: filmFile(dataDir, film.id, "clips", fileName(clip.file, "webm")),
              line: lineName ? filmFile(dataDir, film.id, "sounds", lineName) : null,
              seconds: clip.seconds,
              trimIn: Math.min(s.trimIn, clip.seconds - 0.5),
              trimOut: Math.min(s.trimOut, Math.max(0, clip.seconds - s.trimIn - 0.5)),
            };
            const file = path.join(work, `${String(i).padStart(4, "0")}.mp4`);
            let made = pieceArgs(piece, size, file);
            try {
              await runFfmpeg(made.args, { signal });
            } catch (e) {
              if (signal.aborted) throw e;
              // a clip with no sound of its own: silence in its place
              made = silentPieceArgs(piece, size, file);
              await runFfmpeg(made.args, { signal });
            }
            pieces.push({ file, length: made.length, transition: s.transition });
          }
          progress(0.82, "joining");
          const laid = sounds
            .listSounds(db, film.id)
            .filter((x) => x.kind !== "line")
            .map((x) => ({ file: filmFile(dataDir, film.id, "sounds", fileName(x.file, "wav")), start: x.start, volume: x.volume }));
          const name = `${slug(film.title)}-${Date.now().toString(36)}.mp4`;
          const { args, length } = joinArgs(pieces, laid, path.join(out, name));
          await runFfmpeg(args, { signal, timeoutMs: 60 * 60_000 });
          // the export before it goes: one per film
          for (const n of readdirSync(out)) if (n.endsWith(".mp4") && n !== name) rmSync(path.join(out, n), { force: true });
          log.info(`film ${film.id} exported: ${pieces.length} shots, ${length.toFixed(1)} s`);
          return { file: name, seconds: length, shots: pieces.length, skipped: all.length - todo.length, videoUrl: `/v1/films/${film.id}/export/video?v=${encodeURIComponent(name)}` };
        } finally {
          rmSync(work, { recursive: true, force: true });
        }
      },
    );
    return c.json(job, 202);
  });

  app.get("/v1/films/:id/export", input({ params: IdParams }), (c) => {
    const film = mustFilm(c.req.valid("param").id);
    const at = latestExport(film.id);
    if (!at) throw notFound("This film hasn't been exported yet.");
    return c.json({ file: at.file, createdAt: new Date(at.at).toISOString(), name: `${slug(film.title)}.mp4`, videoUrl: `/v1/films/${film.id}/export/video?v=${encodeURIComponent(at.file)}` });
  });

  app.get("/v1/films/:id/export/video", input({ params: IdParams }), async (c) => {
    const film = mustFilm(c.req.valid("param").id);
    const at = latestExport(film.id);
    if (!at) throw notFound("This film hasn't been exported yet.");
    return c.body(await readFile(at.path), 200, { "content-type": "video/mp4", "content-disposition": `attachment; filename="${slug(film.title)}.mp4"` });
  });

  return app;
}
