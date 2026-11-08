// SPDX-License-Identifier: MIT
// /v1/shots/:id/clips, /v1/films/:id/clips, /v1/clips and a shot's guide video — clips made by a fake video engine (the
// real one is the kit's runVideoFeature on LTX-2.3): each mode's request (one pass, the long take's two stages, a
// talking shot driven by its line's voice, drawn paths, a guide video), the clip saved and chosen, a choice by hand, a
// delete, the refusals. And the method's own pieces.
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { beforeEach, describe, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import { getDb, getState } from "../src/app_state.js";
import { clipPrompt, fitGuide, frameCount, modeOf, pathFrames, wavSeconds } from "../src/clips.js";
import { seedWorkspace } from "../src/database/seed.js";
import { addSound } from "../src/database/sounds.js";
import { filmDir } from "../src/files.js";
import { testClient, tmpDir, useHermeticKit } from "./helpers.js";

useHermeticKit();

let client;
let dataDir;
let made;
beforeEach(async () => {
  dataDir = tmpDir();
  made = [];
  const makeVideo = async (feature, request) => {
    made.push({ feature, ...request });
    return { bytes: Buffer.from(`webm-${made.length}`), fps: request.fps, frames: request.frames, format: "webm" };
  };
  const paintImage = async (feature, request) => sharp({ create: { width: request.width / 16, height: request.height / 16, channels: 3, background: "#333" } }).png().toBuffer();
  const run = async () => ({ content: JSON.stringify({ cards: [], extraPeople: 0, lettering: false, faults: [], match: 8, note: "" }) });
  client = testClient(await createApp(dataDir, { services: { makeVideo, paintImage, run } }));
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
});
