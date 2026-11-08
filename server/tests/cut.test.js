// SPDX-License-Identifier: MIT
// The film joined: FFmpeg's arguments for a piece and for the join (cuts, dissolves, fades, music laid over); and, where
// this computer has FFmpeg (the kit's pinned build the test bench installed, or JD_TEST_FFMPEG), a real join of two
// small clips with a line and music through the export route — its length and its streams read back by ffprobe.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import { getDb } from "../src/app_state.js";
import { joinArgs, pieceArgs, TRANSITION_SECONDS } from "../src/cut.js";
import { addClip } from "../src/database/clips.js";
import { seedWorkspace } from "../src/database/seed.js";
import { updateShot } from "../src/database/shots.js";
import { addSound } from "../src/database/sounds.js";
import { filmDir } from "../src/files.js";
import { testClient, tmpDir, useHermeticKit } from "./helpers.js";

useHermeticKit();

describe("the arguments", () => {
  const size = { width: 1280, height: 704, fps: 24 };
  test("a piece: its trims, the film's size and rate, the line's voice in place of the clip's sound", () => {
    const { args, length } = pieceArgs({ clip: "c.webm", line: "l.wav", seconds: 4, trimIn: 0.5, trimOut: 0.25 }, size, "p.mp4");
    expect(length).toBe(3.25);
    expect(args.slice(0, 9)).toEqual(["-v", "error", "-y", "-ss", "0.500", "-t", "3.250", "-i", "c.webm"]);
    expect(args).toContain("l.wav");
    const graph = args[args.indexOf("-filter_complex") + 1];
    expect(graph).toContain("scale=1280:704");
    expect(graph).toContain("fps=24");
    expect(graph).toContain("[1:a]aresample");
    expect(pieceArgs({ clip: "c.webm", line: null, seconds: 4 }, size, "p.mp4").args.join(" ")).toContain("[0:a]aresample");
  });
  test("the join: a cut concatenates, a dissolve and a fade cross over; music and effects laid over at their places", () => {
    const pieces = [
      { file: "a.mp4", length: 4, transition: "dissolve" },
      { file: "b.mp4", length: 3, transition: "fade" },
      { file: "c.mp4", length: 5, transition: "cut" },
      { file: "d.mp4", length: 2, transition: "cut" },
    ];
    const { args, length } = joinArgs(pieces, [{ file: "m.wav", start: 1.5, volume: 0.6 }], "film.mp4");
    expect(length).toBeCloseTo(4 + 3 + 5 + 2 - 2 * TRANSITION_SECONDS);
    const graph = args[args.indexOf("-filter_complex") + 1];
    expect(graph).toContain("xfade=transition=fade:duration=0.500:offset=3.500");
    expect(graph).toContain("xfade=transition=fadeblack:duration=0.500:offset=6.000");
    expect(graph).toContain("concat=n=2:v=1:a=1");
    expect(graph).toContain("[4:a]aresample=48000,aformat=channel_layouts=stereo,volume=0.600,adelay=1500|1500[s0]");
    expect(graph).toContain("amix=inputs=2:duration=first:normalize=0[mix]");
    expect(args.slice(args.indexOf("-map"), args.indexOf("-map") + 4)).toEqual(["-map", "[v3]", "-map", "[mix]"]);
  });
  test("a sound's fades: in from its start; out before it stops being heard — its end, or the film's first", () => {
    const pieces = [{ file: "a.mp4", length: 10, transition: "cut" }];
    const laid = [
      { file: "m.wav", start: 4, volume: 1, seconds: 30, fadeIn: 3, fadeOut: 2 }, // heard 6 s: out from 4 to 6
      { file: "e.wav", start: 1, volume: 1, seconds: 3, fadeIn: 0, fadeOut: 5 }, // a fade longer than the sound: all of it
    ];
    const { args } = joinArgs(pieces, laid, "film.mp4");
    const graph = args[args.indexOf("-filter_complex") + 1];
    expect(graph).toContain("[1:a]aresample=48000,aformat=channel_layouts=stereo,volume=1.000,afade=t=in:st=0:d=3.000,afade=t=out:st=4.000:d=2.000,adelay=4000|4000[s0]");
    expect(graph).toContain("[2:a]aresample=48000,aformat=channel_layouts=stereo,volume=1.000,afade=t=out:st=0.000:d=3.000,adelay=1000|1000[s1]");
  });
  test("one piece and nothing laid over: no graph, its own streams", () => {
    const { args } = joinArgs([{ file: "a.mp4", length: 4, transition: "cut" }], [], "film.mp4");
    expect(args).not.toContain("-filter_complex");
    expect(args.slice(args.indexOf("-map"), args.indexOf("-map") + 4)).toEqual(["-map", "0:v", "-map", "0:a"]);
  });
});

describe("the refusals", () => {
  test("without FFmpeg the export is refused before any job starts, saying where to install it", async () => {
    const client = testClient(await createApp(tmpDir()));
    seedWorkspace(getDb());
    const film = (await client.post("/v1/films", { json: { title: "No tool" } })).json();
    const shot = (await client.post(`/v1/films/${film.id}/shots`, { json: { action: "one" } })).json();
    const clip = addClip(getDb(), { shotId: shot.id, file: "a.webm", seed: 1, seconds: 3, recipe: {} });
    updateShot(getDb(), shot.id, { clipId: clip.id });
    const r = await client.post(`/v1/films/${film.id}/export`, { json: {} });
    expect(r.statusCode).toBe(409);
    expect(r.json()).toMatchObject({ title: "FFmpeg isn't installed" });
    expect((await client.get("/v1/jobs?kind=export")).json().jobs).toHaveLength(0);
  });
});

const FFMPEG =
  process.env.JD_TEST_FFMPEG || "E:\\Dev\\Web\\test-just-direct\\ai-cache\\kit-ffmpeg\\ffmpeg\\9.0.2\\cpu\\ffmpeg-9.0.2-essentials_build\\bin\\ffmpeg.exe";
const FFPROBE = path.join(path.dirname(FFMPEG), process.platform === "win32" ? "ffprobe.exe" : "ffprobe");
const real = existsSync(FFMPEG) && existsSync(FFPROBE);

describe.skipIf(!real)("a real join, with this computer's FFmpeg", () => {
  let client;
  let dataDir;
  beforeEach(async () => {
    dataDir = tmpDir();
    client = testClient(await createApp(dataDir));
    seedWorkspace(getDb());
    // the user's own FFmpeg, as the AI page's FFmpeg tab sets it
    const r = await client.put("/v1/ai/runtimes/ffmpeg/settings", { json: { settings: { path: FFMPEG } } });
    expect(r.statusCode).toBe(200);
  });
  const make = (args) => execFileSync(FFMPEG, ["-v", "error", "-y", ...args]);
  const probe = (file) => JSON.parse(execFileSync(FFPROBE, ["-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name,width,height", "-of", "json", file]).toString());

  test("two clips, a dissolve, the first one's line and music over both: one MP4 of the right length", { timeout: 120_000 }, async () => {
    const made = await client.post("/v1/films", { json: { title: "Join test", width: 512, height: 384 } });
    expect(made.statusCode).toBe(201);
    const film = made.json();
    const dir = filmDir(dataDir, film.id);
    mkdirSync(path.join(dir, "clips"), { recursive: true });
    mkdirSync(path.join(dir, "sounds"), { recursive: true });
    const clip = (name, seconds, colour) =>
      make(["-f", "lavfi", "-i", `color=${colour}:s=192x128:r=24:d=${seconds}`, "-f", "lavfi", "-i", `sine=f=300:d=${seconds}`, "-c:v", "libvpx-vp9", "-b:v", "200k", "-c:a", "libopus", "-shortest", path.join(dir, "clips", name)]);
    clip("a.webm", 3, "red");
    clip("b.webm", 2, "blue");
    make(["-f", "lavfi", "-i", "sine=f=500:d=1.5", path.join(dir, "sounds", "line.wav")]);
    make(["-f", "lavfi", "-i", "sine=f=200:d=10", path.join(dir, "sounds", "music.wav")]);
    const s1 = (await client.post(`/v1/films/${film.id}/shots`, { json: { action: "one", transition: "dissolve", seconds: 3 } })).json();
    const s2 = (await client.post(`/v1/films/${film.id}/shots`, { json: { action: "two", seconds: 2 } })).json();
    const c1 = addClip(getDb(), { shotId: s1.id, file: "a.webm", seed: 1, seconds: 3, recipe: {} });
    const c2 = addClip(getDb(), { shotId: s2.id, file: "b.webm", seed: 2, seconds: 2, recipe: {} });
    updateShot(getDb(), s1.id, { clipId: c1.id, trimIn: 0.5 });
    updateShot(getDb(), s2.id, { clipId: c2.id });
    addSound(getDb(), { filmId: film.id, shotId: s1.id, kind: "line", file: "line.wav", seconds: 1.5 });
    addSound(getDb(), { filmId: film.id, kind: "music", file: "music.wav", seconds: 10, start: 0.5, volume: 0.5 });

    const job = (await client.post(`/v1/films/${film.id}/export`, { json: {} })).json();
    let done;
    for (let i = 0; i < 1200 && !done; i++) {
      const r = (await client.get(`/v1/jobs/${job.id}`)).json();
      if (r.state !== "running") done = r;
      else await new Promise((res) => setTimeout(res, 50));
    }
    expect(done.state, JSON.stringify(done.error)).toBe("done");
    // 2.5 s (trimmed) + 2 s − the 0.5 s dissolve
    expect(done.result.seconds).toBeCloseTo(4, 1);
    const info = (await client.get(`/v1/films/${film.id}/export`)).json();
    const file = path.join(dataDir, "exports", film.id, info.file);
    const p = probe(file);
    expect(Number(p.format.duration)).toBeGreaterThan(3.8);
    expect(Number(p.format.duration)).toBeLessThan(4.3);
    expect(p.streams.map((s) => s.codec_type).sort()).toEqual(["audio", "video"]);
    expect(p.streams.find((s) => s.codec_type === "video")).toMatchObject({ codec_name: "h264", width: 512, height: 384 });
    const video = await client.get(info.videoUrl);
    expect(video.headers["content-type"]).toBe("video/mp4");
    expect(video.rawPayload.length).toBeGreaterThan(1000);
  });

  test("no clip in the film is a refusal", async () => {
    const film = (await client.post("/v1/films", { json: { title: "Empty" } })).json();
    expect((await client.post(`/v1/films/${film.id}/export`, { json: {} })).statusCode).toBe(409);
  });
});
