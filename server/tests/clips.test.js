// SPDX-License-Identifier: MIT
// /v1/shots/:id/clips, /v1/films/:id/clips, /v1/clips and a shot's guide video — clips made by a fake video engine (the
// real one is the kit's runVideoFeature on LTX-2.3): each mode's request (one pass, the long take's two stages, a
// talking shot driven by its line's voice, drawn paths, a guide video), the clip saved and chosen, a choice by hand, a
// delete, the refusals. And the method's own pieces.
import { constants } from "node:buffer";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { beforeEach, describe, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import { getDb, getState } from "../src/app_state.js";
import { clipPrompt, fitGuide, fitVoiceArgs, frameCount, lipClipArgs, lipFramesMax, modeOf, pathFrames, wavSeconds } from "../src/clips.js";
import { addClip } from "../src/database/clips.js";
import { seedWorkspace } from "../src/database/seed.js";
import { addSound } from "../src/database/sounds.js";
import { filmDir } from "../src/files.js";
import { testClient, tmpDir, useHermeticKit } from "./helpers.js";

useHermeticKit();

// LatentSync's answer as audio.cpp's server writes it (app/server/server_protocol.cpp write_artifact_json): the frames as
// one Base64 payload of raw rgb24, every meta value a string — as many frames as its voice lasts, and one more
// (src/community_models/latentsync/pipeline.cpp, its output frames from the voice's features)
const LIP = { width: 64, height: 64, fps: 24 };
const lipAnswer = (frames) => ({
  artifacts: [
    {
      id: "latentsync_video_rgb24",
      kind: "custom",
      payload: Buffer.alloc(LIP.width * LIP.height * 3 * frames, 90).toString("base64"),
      meta: { extension: "rgb", mime: "application/octet-stream", format: "rgb24", width: "64", height: "64", frames: String(frames), fps: "24" },
    },
  ],
});

let client;
let dataDir;
let made;
let lipped;
beforeEach(async () => {
  dataDir = tmpDir();
  made = [];
  lipped = [];
  const makeVideo = async (feature, request) => {
    made.push({ feature, ...request });
    return { bytes: Buffer.from(`webm-${made.length}`), fps: request.fps, frames: request.frames, format: "webm" };
  };
  const makeAudio = async (feature, request, opts) => {
    lipped.push({ feature, request, opts });
    return lipAnswer(Math.floor(wavSeconds(Buffer.from(request.audio_base64, "base64")) * LIP.fps) + 1);
  };
  const paintImage = async (feature, request) => sharp({ create: { width: request.width / 16, height: request.height / 16, channels: 3, background: "#333" } }).png().toBuffer();
  const run = async () => ({ content: JSON.stringify({ cards: [], extraPeople: 0, lettering: false, faults: [], match: 8, note: "" }) });
  client = testClient(await createApp(dataDir, { services: { makeVideo, makeAudio, paintImage, run } }));
  seedWorkspace(getDb());
});

async function settle(job) {
  for (let i = 0; i < 300; i++) {
    const r = (await client.get(`/v1/jobs/${job.id}`)).json();
    if (r.state !== "running") return r;
    await new Promise((res) => setTimeout(res, 10));
  }
  throw new Error("the job never ended");
}
/** A WAV of `seconds` of silence at 24 kHz mono 16-bit. */
function wav(seconds) {
  const rate = 24000;
  const data = Buffer.alloc(Math.round(seconds * rate) * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

async function filmWithShot(shot = {}) {
  const film = (await client.post("/v1/films", { json: { title: "Ferry", look: "moody 35mm film" } })).json();
  const mara = (await client.post(`/v1/films/${film.id}/cards`, { json: { kind: "character", name: "Mara", description: "grey braid, yellow coat" } })).json();
  const s = (await client.post(`/v1/films/${film.id}/shots`, { json: { size: "medium", camera: "slow push in", action: "Mara paints over the boat's name", cardIds: [mara.id], seconds: 4, ...shot } })).json();
  return { film, mara, shot: s };
}
const makeClip = async (shotId) => settle((await client.post(`/v1/shots/${shotId}/clips`, { json: {} })).json());

// this computer's FFmpeg — the kit's pinned build the test bench installed, or JD_TEST_FFMPEG
const FFMPEG =
  process.env.JD_TEST_FFMPEG || "E:\\Dev\\Web\\test-just-direct\\ai-cache\\kit-ffmpeg\\ffmpeg\\9.0.2\\cpu\\ffmpeg-9.0.2-essentials_build\\bin\\ffmpeg.exe";
const FFPROBE = path.join(path.dirname(FFMPEG), process.platform === "win32" ? "ffprobe.exe" : "ffprobe");
const realFfmpeg = existsSync(FFMPEG) && existsSync(FFPROBE);

describe("a shot's clip", () => {
  test("one pass from its chosen first frame: the film's size, 8n+1 frames at 24 a second; saved and chosen", async () => {
    const { film, shot } = await filmWithShot();
    await settle((await client.post(`/v1/shots/${shot.id}/frames`, { json: { count: 1 } })).json());
    const done = await makeClip(shot.id);
    expect(done.state).toBe("done");
    expect(made[0]).toMatchObject({ feature: "clips.make", width: 1280, height: 704, frames: 97, fps: 24 });
    expect(made[0].init).toBeInstanceOf(Buffer);
    expect(made[0].loras).toBeUndefined();
    expect(made[0].prompt).toBe("Mara paints over the boat's name. The camera: slow push in. Mara: grey braid, yellow coat. moody 35mm film.");
    expect(done.result.clip).toMatchObject({ chosen: true, seconds: 97 / 24 });
    expect(done.result.clip.recipe).toMatchObject({ mode: "one", talking: false, frames: 97 });
    const video = await client.get(done.result.clip.videoUrl);
    expect(video.headers["content-type"]).toBe("video/webm");
    expect(video.body).toBe("webm-1");
    expect(readdirSync(path.join(filmDir(dataDir, film.id), "clips"))).toHaveLength(1);
    // the shot carries its chosen clip's length (the Cut tab's trims)
    expect((await client.get(`/v1/films/${film.id}/shots`)).json().items[0].clipSeconds).toBeCloseTo(97 / 24);
  });

  test("a long take past 5 s: half size, then the x2 upscale pass to the film's size, the first frame made small", async () => {
    const { shot } = await filmWithShot({ seconds: 10 });
    await settle((await client.post(`/v1/shots/${shot.id}/frames`, { json: { count: 1 } })).json());
    await makeClip(shot.id);
    expect(made[0]).toMatchObject({ width: 640, height: 384, frames: 241 });
    expect(made[0].params.hires).toEqual({ width: 1280, height: 704, steps: 3, sigmas: [0.909375, 0.725, 0.421875, 0.0] });
    expect((await sharp(made[0].init).metadata()).width).toBe(640);
  });

  test("talking: the line's voice drives the clip, at least as long as the voice", async () => {
    const { film, mara, shot } = await filmWithShot({ line: "This is the last crossing, for good.", speakerId: null, seconds: 3 });
    await client.patch(`/v1/shots/${shot.id}`, { json: { speakerId: mara.id } });
    const dir = path.join(filmDir(dataDir, film.id), "sounds");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "line1.wav"), wav(4.2));
    addSound(getDb(), { filmId: film.id, shotId: shot.id, kind: "line", file: "line1.wav", seconds: 4.2 });
    const done = await makeClip(shot.id);
    expect(made[0].audio).toBeInstanceOf(Buffer);
    expect(made[0].frames).toBe(frameCount(4.5, 24)); // 4.2 s and a breath
    expect(made[0].prompt).toContain('Mara says: "This is the last crossing, for good."');
    expect(done.result.clip.recipe).toMatchObject({ talking: true });
  });

  test("talking: a line longer than the longest clip makes the longest clip, never more", async () => {
    const { film, shot } = await filmWithShot({ line: "A very long speech.", seconds: 3 });
    const dir = path.join(filmDir(dataDir, film.id), "sounds");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "long.wav"), wav(20));
    addSound(getDb(), { filmId: film.id, shotId: shot.id, kind: "line", file: "long.wav", seconds: 20 });
    await makeClip(shot.id);
    expect(made[0].frames).toBe(frameCount(13, 24));
  });

  test("drawn paths: the Motion Track LoRA with a frame per clip frame; none drawn is a refusal", async () => {
    const { shot } = await filmWithShot({ seconds: 2 });
    const noPaths = await client.patch(`/v1/shots/${shot.id}`, { json: { mode: "paths" } });
    expect(noPaths.json().mode).toBe("paths");
    const refused = await makeClip(shot.id);
    expect(refused.state).toBe("error");
    expect(refused.error.title).toBe("The shot has no drawn paths");
    await client.patch(`/v1/shots/${shot.id}`, { json: { paths: [[{ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }]] } });
    await makeClip(shot.id);
    expect(made[0].loras).toEqual([{ slot: "lora_motion", multiplier: 1 }]);
    expect(made[0].guide).toHaveLength(49);
    expect((await sharp(made[0].guide[0]).metadata()).width).toBe(1280);
  });

  test("a guide video: refused without FFmpeg; its frames, when there, lead the Union Control LoRA", async () => {
    const { film, shot } = await filmWithShot({ seconds: 2 });
    const form = new FormData();
    form.append("file", new Blob([Buffer.from("not really a video")], { type: "video/mp4" }), "guide.mp4");
    const r = await client.app.request(`http://testserver/v1/shots/${shot.id}/guide`, { method: "POST", body: form, headers: { host: "testserver" } });
    expect(r.status).toBe(409);
    // the frames as the upload would leave them
    const dir = path.join(filmDir(dataDir, film.id), "guides", shot.id);
    mkdirSync(dir, { recursive: true });
    const png = await sharp({ create: { width: 1280, height: 704, channels: 3, background: "#777" } }).png().toBuffer();
    for (let i = 0; i < 10; i++) writeFileSync(path.join(dir, `${String(i).padStart(5, "0")}.png`), png);
    await client.patch(`/v1/shots/${shot.id}`, { json: { mode: "guide" } });
    await makeClip(shot.id);
    expect(made[0].loras).toEqual([{ slot: "lora_union", multiplier: 1 }]);
    expect(made[0].guide).toHaveLength(49); // its 10 frames, the last held
    // taken off: the frames go, the mode back to the app's pick
    const off = await client.delete(`/v1/shots/${shot.id}/guide`);
    expect(off.json()).toMatchObject({ mode: "auto", guideFrames: 0 });
  });

  test.skipIf(!realFfmpeg)("an upright guide video is read whole, centred on black — a take's skeleton keeps its head and feet", { timeout: 60_000 }, async () => {
    expect((await client.put("/v1/ai/runtimes/ffmpeg/settings", { json: { settings: { path: FFMPEG } } })).statusCode).toBe(200);
    const { film, shot } = await filmWithShot({ seconds: 2 });
    // a phone's upright take: 1 s of white at 180×320, 30 a second (a motion capture take's pose file's rate)
    const src = path.join(tmpDir(), "upright.mp4");
    execFileSync(FFMPEG, ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=white:s=180x320:r=30:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", src]);
    const form = new FormData();
    form.append("file", new Blob([readFileSync(src)], { type: "video/mp4" }), "upright.mp4");
    const r = await client.app.request(`http://testserver/v1/shots/${shot.id}/guide`, { method: "POST", body: form, headers: { host: "testserver" } });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ mode: "guide", guideFrames: 24 }); // 1 s at the clips' 24 a second
    const first = path.join(filmDir(dataDir, film.id), "guides", shot.id, "00000.png");
    const { data, info } = await sharp(first).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([film.width, film.height]);
    const at = (x, y) => data[(y * info.width + x) * info.channels];
    // the middle's top and bottom rows are the video's (nothing cut), the sides the black it is centred on
    expect(at(info.width / 2, 0)).toBeGreaterThan(200);
    expect(at(info.width / 2, info.height - 1)).toBeGreaterThan(200);
    expect(at(0, info.height / 2)).toBeLessThan(30);
    expect(at(info.width - 1, info.height / 2)).toBeLessThan(30);
  });

  test("chosen by hand; another shot's clip refused; a deleted chosen clip hands the choice on; a deleted shot takes its clips", async () => {
    const { film, shot } = await filmWithShot();
    const first = (await makeClip(shot.id)).result.clip;
    const second = (await makeClip(shot.id)).result.clip;
    expect((await client.get(`/v1/films/${film.id}/shots`)).json().items[0].clipId).toBe(second.id);
    expect((await client.post(`/v1/shots/${shot.id}/clip`, { json: { clipId: first.id } })).json().clipId).toBe(first.id);
    const other = (await client.post(`/v1/films/${film.id}/shots`, { json: { action: "x" } })).json();
    expect((await client.post(`/v1/shots/${other.id}/clip`, { json: { clipId: first.id } })).statusCode).toBe(422);
    expect((await client.delete(`/v1/clips/${first.id}`)).statusCode).toBe(204);
    expect((await client.get(`/v1/films/${film.id}/shots`)).json().items[0].clipId).toBe(second.id);
    expect((await client.delete(`/v1/shots/${shot.id}`)).statusCode).toBe(204);
    expect(readdirSync(path.join(filmDir(dataDir, film.id), "clips"))).toEqual([]);
  });

  test("the film's clips: every shot without one; a shot that can't be made is named and the rest go on", async () => {
    const { film, shot } = await filmWithShot();
    const second = (await client.post(`/v1/films/${film.id}/shots`, { json: { action: "The lake" } })).json();
    await client.patch(`/v1/shots/${second.id}`, { json: { mode: "paths" } }); // nothing drawn: refused
    const done = await settle((await client.post(`/v1/films/${film.id}/clips`, { json: {} })).json());
    expect(done.result).toMatchObject({ shots: 2, made: 1, failed: [{ shotId: second.id, why: "The shot has no drawn paths" }] });
    expect((await client.get(`/v1/shots/${shot.id}/clips`)).json().items).toHaveLength(1);
    // the engine's own failure stops the job
    getState().services.makeVideo = async () => {
      throw Object.assign(new Error("install the engine"), { title: "The video engine isn't installed" });
    };
    const failed = await settle((await client.post(`/v1/films/${film.id}/clips`, { json: { all: true } })).json());
    expect(failed.error.title).toBe("The video engine isn't installed");
  });
});

describe("the method", () => {
  test("frames are 8n+1, at least 9", () => {
    expect([frameCount(4, 24), frameCount(5, 24), frameCount(10, 24), frameCount(13, 24), frameCount(0.1, 24)]).toEqual([97, 121, 241, 313, 9]);
  });
  test("the app's pick: one pass up to 121 frames, a long take past it; the shot's own mode wins", () => {
    expect(modeOf({ mode: "auto" }, 121)).toBe("one");
    expect(modeOf({ mode: "auto" }, 129)).toBe("long");
    expect(modeOf({ mode: "paths" }, 300)).toBe("paths");
  });
  test("the words leave no stray dot when parts are empty; a look card joins the film's look", () => {
    const cards = [{ id: "n", kind: "look", name: "Noir", description: "hard shadows" }];
    expect(clipPrompt("{action} {camera} {cards} {line} {look}", { action: "Rain", camera: "", cardIds: ["n"], line: "" }, cards, { look: "" })).toBe("Rain. hard shadows.");
  });
  test("drawn paths spread over the frames, at the size asked", async () => {
    const frames = await pathFrames([[{ x: 0, y: 0 }, { x: 1, y: 1 }]], { frames: 9, width: 256, height: 128 });
    expect(frames).toHaveLength(9);
    expect(await sharp(frames[8]).metadata()).toMatchObject({ width: 256, height: 128 });
  });
  test("a WAV's length from its header; anything else is 0", () => {
    expect(wavSeconds(wav(2.5))).toBeCloseTo(2.5);
    expect(wavSeconds(Buffer.from("nope"))).toBe(0);
  });
  test("a guide fitted: the last frame held, or the rest cut", () => {
    expect(fitGuide(["a", "b"], 4)).toEqual(["a", "b", "b", "b"]);
    expect(fitGuide(["a", "b", "c"], 2)).toEqual(["a", "b"]);
    expect(fitGuide([], 3)).toEqual([]);
  });
  test("lip repair's longest clip: its frames' Base64 fits one JavaScript string — about 6 s at 1280×704", () => {
    const most = lipFramesMax(1280, 704);
    expect(most * 1280 * 704 * 4).toBeLessThan(constants.MAX_STRING_LENGTH);
    expect(most / 24).toBeGreaterThan(5);
    expect(lipFramesMax(640, 352)).toBeGreaterThan(4 * most - 4);
  });
  test("lip repair's join: the raw frames at their size and rate, the clip's count of them, the voice as the sound, a WebM", () => {
    const args = lipClipArgs({ raw: "f.rgb", width: 64, height: 32, fps: 24, frames: 97, voice: "v.wav" }, "out.webm");
    expect(args.join(" ")).toContain("-f rawvideo -pix_fmt rgb24 -s 64x32 -r 24 -i f.rgb -i v.wav -map 0:v:0 -map 1:a:0 -frames:v 97");
    expect(args.at(-1)).toBe("out.webm");
  });
  test("lip repair's voice: padded with silence, or cut, to the clip's length", () => {
    expect(fitVoiceArgs("line.wav", 97 / 24, "v.wav").join(" ")).toBe("-v error -y -i line.wav -af apad -t 4.042 -c:a pcm_s16le v.wav");
  });
});

describe("lip repair", () => {
  /** A talking clip of `shot`: its line's voice on file, a clip made from it (`frames` long at 1280×704). */
  async function talkingClip({ frames = null, voice = true, voiceSeconds = 3.2 } = {}) {
    const { film, mara, shot } = await filmWithShot({ line: "This is the last crossing, for good.", seconds: 3 });
    await client.patch(`/v1/shots/${shot.id}`, { json: { speakerId: mara.id } });
    if (voice) {
      const dir = path.join(filmDir(dataDir, film.id), "sounds");
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, "line1.wav"), wav(voiceSeconds));
      addSound(getDb(), { filmId: film.id, shotId: shot.id, kind: "line", file: "line1.wav", seconds: voiceSeconds });
    }
    if (frames) {
      const clip = addClip(getDb(), { shotId: shot.id, file: "long.webm", seed: 1, seconds: frames / 24, recipe: { mode: "one", talking: true, width: 1280, height: 704, frames, fps: 24 } });
      return { film, shot, clip };
    }
    const done = await makeClip(shot.id);
    return { film, shot, clip: done.result.clip };
  }
  const repair = (clip) => client.post(`/v1/clips/${clip.id}/lips`, { json: {} });
  const turnOn = () => client.patch("/v1/settings", { json: { "clips.lipRepair": true } });

  test("off until Settings turns it on; then only a talking clip with its line's voice, and only with FFmpeg", async () => {
    const { shot, clip } = await talkingClip();
    expect((await repair(clip)).json()).toMatchObject({ status: 409, title: "Lip repair is off" });
    await turnOn();
    // a clip that isn't talking
    const quiet = addClip(getDb(), { shotId: shot.id, file: "q.webm", seed: 1, seconds: 3, recipe: { mode: "one", talking: false, width: 1280, height: 704, frames: 73, fps: 24 } });
    expect((await repair(quiet)).json()).toMatchObject({ title: "This clip has no voice to match" });
    expect((await repair(clip)).json()).toMatchObject({ status: 409, title: "FFmpeg isn't installed" });
    expect((await client.post("/v1/clips/nope/lips", { json: {} })).statusCode).toBe(404);
    // a talking shot whose line has no voice on file
    const mute = await talkingClip({ frames: 73, voice: false });
    expect((await repair(mute.clip)).json()).toMatchObject({ title: "The shot's line has no voice" });
    expect(lipped).toHaveLength(0);
  });

  describe.skipIf(!realFfmpeg)("with this computer's FFmpeg", () => {
    beforeEach(async () => {
      expect((await client.put("/v1/ai/runtimes/ffmpeg/settings", { json: { settings: { path: FFMPEG } } })).statusCode).toBe(200);
      await turnOn();
    });

    test("LatentSync's frames and the line's voice make a new clip of the clip's own length, chosen; the old one kept", { timeout: 60_000 }, async () => {
      // a 3 s shot's clip: 73 frames; its line's voice 3.2 s, longer than the clip
      const { film, shot, clip } = await talkingClip();
      expect(clip.recipe.frames).toBe(73);
      const done = await settle((await repair(clip)).json());
      expect(done.state).toBe("done");
      // the request: the line's voice cut to the clip's length, the clip as LatentSync's video, the settings' steps and
      // guidance, the clip's rate
      expect(lipped[0].feature).toBe("clips.lips");
      const sent = Buffer.from(lipped[0].request.audio_base64, "base64");
      expect(sent.toString("ascii", 0, 4)).toBe("RIFF");
      expect(wavSeconds(sent)).toBeCloseTo(73 / 24, 2);
      expect(lipped[0].request.options).toMatchObject({ reference_video_file: path.join(filmDir(dataDir, film.id), "clips", clip.file), fps: 24, num_inference_steps: 20, guidance_scale: 1.5 });
      expect(lipped[0].opts.timeout).toBeGreaterThan(3600);
      // LatentSync answers 74 frames for it; the clip keeps its own 73, so the shot's timing and trims don't move
      const fixed = done.result.clip;
      expect(fixed).toMatchObject({ chosen: true, seconds: 73 / 24 });
      expect(fixed.recipe).toMatchObject({ mode: "lips", talking: true, width: 64, height: 64, frames: 73, repairedFrom: clip.id });
      expect(done.result.shot.clipId).toBe(fixed.id);
      expect((await client.get(`/v1/shots/${shot.id}/clips`)).json().items.map((c) => c.id).sort()).toEqual([clip.id, fixed.id].sort());
      // a real WebM: the frames as VP9, the voice as Opus, as long as the clip
      const file = path.join(filmDir(dataDir, film.id), "clips", `${fixed.id}.webm`);
      const probe = JSON.parse(execFileSync(FFPROBE, ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height:format=duration", "-of", "json", file]).toString());
      expect(probe.streams).toEqual(
        expect.arrayContaining([expect.objectContaining({ codec_type: "video", codec_name: "vp9", width: 64, height: 64 }), expect.objectContaining({ codec_type: "audio", codec_name: "opus" })]),
      );
      expect(Number(probe.format.duration)).toBeCloseTo(73 / 24, 1);
      // nothing left in the scratch folder
      expect(readdirSync(path.join(dataDir, "work"))).toHaveLength(0);
    });

    test("a line shorter than its clip is padded with silence: the repaired clip still runs the clip's length", { timeout: 60_000 }, async () => {
      const { clip } = await talkingClip({ voiceSeconds: 1.5 });
      const done = await settle((await repair(clip)).json());
      expect(done.state).toBe("done");
      expect(wavSeconds(Buffer.from(lipped[0].request.audio_base64, "base64"))).toBeCloseTo(73 / 24, 2);
      expect(done.result.clip).toMatchObject({ seconds: 73 / 24 });
      expect(done.result.clip.recipe.frames).toBe(73);
    });

    test("a clip longer than one answer can carry is refused before LatentSync runs", async () => {
      const { clip } = await talkingClip({ frames: lipFramesMax(1280, 704) + 8 });
      expect((await repair(clip)).json()).toMatchObject({ status: 409, title: "This clip is too long to repair" });
      expect(lipped).toHaveLength(0);
    });
  });
});
