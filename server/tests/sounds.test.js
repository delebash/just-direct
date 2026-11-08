// SPDX-License-Identifier: MIT
// A shot's line spoken in its character's voice, and the film's music and effects — fake voices and fake music (the
// real ones are the kit's audio.cpp runtime): the voice words sent, the line kept as the shot's (the old one gone), the
// whole film's lines, refusals said at once; music and effects made, placed, moved, deleted with their files.
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import { getDb, getState } from "../src/app_state.js";
import { updateCard } from "../src/database/films.js";
import { seedWorkspace } from "../src/database/seed.js";
import { filmDir } from "../src/files.js";
import { testClient, tmpDir, useHermeticKit } from "./helpers.js";

useHermeticKit();

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

let client;
let dataDir;
let spoken;
let made;
beforeEach(async () => {
  dataDir = tmpDir();
  spoken = [];
  made = [];
  const services = {
    voiceCheck: () => {},
    speak: async (model, request) => {
      spoken.push({ model, ...request });
      return wav(1.5);
    },
    makeAudio: async (feature, request) => {
      made.push({ feature, ...request });
      return { audio: wav(request.duration_seconds).toString("base64") };
    },
  };
  client = testClient(await createApp(dataDir, { services }));
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

async function scene() {
  const film = (await client.post("/v1/films", { json: { title: "Ferry" } })).json();
  const mara = (await client.post(`/v1/films/${film.id}/cards`, { json: { kind: "character", name: "Mara", voice: "a low, weathered woman's voice, dry" } })).json();
  const teo = (await client.post(`/v1/films/${film.id}/cards`, { json: { kind: "character", name: "Teo" } })).json();
  const shot = (await client.post(`/v1/films/${film.id}/shots`, { json: { action: "Mara speaks.", line: "This is the last crossing.", speakerId: mara.id } })).json();
  return { film, mara, teo, shot };
}

describe("a line spoken", () => {
  test("in the speaker's voice, from its card's words; kept as the shot's line, the old one gone", async () => {
    const { film, shot } = await scene();
    const first = await settle((await client.post(`/v1/shots/${shot.id}/line`, { json: {} })).json());
    expect(first.state).toBe("done");
    expect(spoken[0]).toMatchObject({ model: "qwen3-vd-1.7b-q8", input: "This is the last crossing.", language: "English", instructions: "a low, weathered woman's voice, dry" });
    expect(first.result).toMatchObject({ kind: "line", shotId: shot.id, seconds: 1.5 });
    const again = await settle((await client.post(`/v1/shots/${shot.id}/line`, { json: {} })).json());
    const items = (await client.get(`/v1/films/${film.id}/sounds`)).json().items;
    expect(items.map((s) => s.id)).toEqual([again.result.id]);
    expect(readdirSync(path.join(filmDir(dataDir, film.id), "sounds"))).toEqual([again.result.file]);
    const audio = await client.get(again.result.audioUrl);
    expect(audio.headers["content-type"]).toBe("audio/wav");
  });

  test("no Voice words: designed from the card's description, else the default voice; a shot with no line is a refusal", async () => {
    const { film, teo } = await scene();
    const shot = (await client.post(`/v1/films/${film.id}/shots`, { json: { line: "Is it still good?", speakerId: teo.id } })).json();
    await settle((await client.post(`/v1/shots/${shot.id}/line`, { json: {} })).json());
    expect(spoken[0].instructions).toBe("A natural, clear adult voice, calm and unhurried.");
    await client.patch(`/v1/cards/${teo.id}`, { json: { description: "a ten-year-old boy in a red hoodie" } });
    await settle((await client.post(`/v1/shots/${shot.id}/line`, { json: {} })).json());
    expect(spoken[1].instructions).toBe("The voice of Teo: a ten-year-old boy in a red hoodie");
    const silent = (await client.post(`/v1/films/${film.id}/shots`, { json: { action: "The lake." } })).json();
    const r = await settle((await client.post(`/v1/shots/${silent.id}/line`, { json: {} })).json());
    expect(r.error.title).toBe("The shot has no line");
  });

  test("a character with a voice recording is cloned from it: the cloning model, the recording, its words or none", async () => {
    const { film, mara, shot } = await scene();
    const checked = [];
    getState().services.voiceCheck = (model) => checked.push(model);
    // a recording on her card, with what it says (the store's own fields; the upload route has its own test)
    mkdirSync(path.join(filmDir(dataDir, film.id), "cards"), { recursive: true });
    writeFileSync(path.join(filmDir(dataDir, film.id), "cards", "mara-voice.wav"), wav(3));
    updateCard(getDb(), mara.id, { voiceSample: "mara-voice.wav", voiceSampleText: "I've run this ferry for forty years." });
    await settle((await client.post(`/v1/shots/${shot.id}/line`, { json: {} })).json());
    expect(checked).toEqual(["qwen3-base-1.7b-q8", "qwen3-base-1.7b-q8"]);
    expect(spoken[0]).toMatchObject({ model: "qwen3-base-1.7b-q8", input: "This is the last crossing.", reference_text: "I've run this ferry for forty years." });
    expect(spoken[0].voice_ref).toBe(path.join(filmDir(dataDir, film.id), "cards", "mara-voice.wav"));
    expect(spoken[0].instructions).toBeUndefined();
    // the words not known: her speaker's sound alone
    updateCard(getDb(), mara.id, { voiceSampleText: "" });
    await settle((await client.post(`/v1/shots/${shot.id}/line`, { json: {} })).json());
    expect(spoken[1].options).toEqual({ x_vector_only_mode: true });
    expect(spoken[1].reference_text).toBeUndefined();
  });

  test("a voice model that can't speak yet is refused at once, before any job", async () => {
    const { shot } = await scene();
    const { ApiError } = await import("@delebash/core/platform/errors");
    getState().services.voiceCheck = () => {
      throw new ApiError(409, "model-not-downloaded", "The voice model isn't downloaded", "Download it on the AI page's Speech tab.");
    };
    const r = await client.post(`/v1/shots/${shot.id}/line`, { json: {} });
    expect(r.statusCode).toBe(409);
    expect(r.json().type).toMatch(/model-not-downloaded$/);
  });

  test("the film's lines: every shot with a line and a speaker but no voice yet", async () => {
    const { film, shot, teo } = await scene();
    await client.post(`/v1/films/${film.id}/shots`, { json: { line: "Hello?", speakerId: teo.id } });
    await client.post(`/v1/films/${film.id}/shots`, { json: { line: "Nobody speaks this." } });
    await settle((await client.post(`/v1/shots/${shot.id}/line`, { json: {} })).json());
    spoken.length = 0;
    const done = await settle((await client.post(`/v1/films/${film.id}/lines`, { json: {} })).json());
    expect(done.result).toEqual({ spoken: 1 });
    expect(spoken.map((s) => s.input)).toEqual(["Hello?"]);
  });

  test("the film's lines ask only for the voice models they need: every speaker recorded, the design model never", async () => {
    const { film, mara } = await scene();
    mkdirSync(path.join(filmDir(dataDir, film.id), "cards"), { recursive: true });
    writeFileSync(path.join(filmDir(dataDir, film.id), "cards", "mara-voice.wav"), wav(3));
    updateCard(getDb(), mara.id, { voiceSample: "mara-voice.wav" });
    const checked = [];
    getState().services.voiceCheck = (model) => {
      checked.push(model);
      if (model === "qwen3-vd-1.7b-q8") throw new Error("the design model isn't downloaded");
    };
    const done = await settle((await client.post(`/v1/films/${film.id}/lines`, { json: {} })).json());
    expect(done.state).toBe("done");
    expect(new Set(checked)).toEqual(new Set(["qwen3-base-1.7b-q8"]));
  });
});

describe("music and effects", () => {
  test("made from words, placed in the cut, moved, made quieter, deleted with its file", async () => {
    const { film } = await scene();
    const music = await settle((await client.post(`/v1/films/${film.id}/sounds`, { json: { kind: "music", prompt: "a slow piano and cello cue, rain", start: 2 } })).json());
    expect(made[0]).toMatchObject({ feature: "sounds.music", text: "a slow piano and cello cue, rain", duration_seconds: 30, num_inference_steps: 8, guidance_scale: 1 });
    expect(music.result).toMatchObject({ kind: "music", start: 2, volume: 0.6, seconds: 30, fadeIn: 0, fadeOut: 2 });
    const fx = await settle((await client.post(`/v1/films/${film.id}/sounds`, { json: { kind: "effect", prompt: "a ship's horn", seconds: 4, start: 9.5 } })).json());
    expect(made[1]).toMatchObject({ feature: "sounds.effect", duration_seconds: 4 });
    expect(made[1].guidance_scale).toBeUndefined();
    expect(fx.result).toMatchObject({ kind: "effect", volume: 1, fadeIn: 0, fadeOut: 0 });
    const moved = await client.patch(`/v1/sounds/${music.result.id}`, { json: { start: 12, volume: 0.3 } });
    expect(moved.json()).toMatchObject({ start: 12, volume: 0.3, fadeOut: 2 });
    // its fades, in seconds; past the longest sound is refused under its field
    expect((await client.patch(`/v1/sounds/${music.result.id}`, { json: { fadeIn: 10, fadeOut: 0 } })).json()).toMatchObject({ fadeIn: 10, fadeOut: 0, start: 12 });
    expect((await client.patch(`/v1/sounds/${music.result.id}`, { json: { fadeIn: 61 } })).statusCode).toBe(422);
    expect((await client.get(`/v1/films/${film.id}/sounds`)).json().items.map((s) => s.kind)).toEqual(["effect", "music"]);
    expect((await client.delete(`/v1/sounds/${fx.result.id}`)).statusCode).toBe(204);
    expect(readdirSync(path.join(filmDir(dataDir, film.id), "sounds"))).toEqual([music.result.file]);
  });

  test("music with lyrics is a song: sung by the song feature on ACE-Step's text-to-music route, its lyrics kept", async () => {
    const { film } = await scene();
    const lyrics = "Still here, still here,\nthe ferry and me.";
    const song = await settle((await client.post(`/v1/films/${film.id}/sounds`, { json: { kind: "music", prompt: "warm acoustic folk, a woman's voice", lyrics, seconds: 40 } })).json());
    expect(made[0]).toMatchObject({ feature: "sounds.song", text: "warm acoustic folk, a woman's voice", lyrics, task_route: "text2music", duration_seconds: 40, num_inference_steps: 8 });
    expect(made[0].options).toEqual({ enable_thinking: false, use_cot_metas: false, use_cot_caption: false, use_cot_language: false });
    expect(song.result).toMatchObject({ kind: "music", lyrics, seconds: 40 });
    // blank lyrics are no song; an effect never sings
    await settle((await client.post(`/v1/films/${film.id}/sounds`, { json: { kind: "music", prompt: "rain", lyrics: "   " } })).json());
    await settle((await client.post(`/v1/films/${film.id}/sounds`, { json: { kind: "effect", prompt: "a horn", lyrics: "la la" } })).json());
    expect(made.slice(1).map((m) => [m.feature, m.lyrics])).toEqual([
      ["sounds.music", undefined],
      ["sounds.effect", undefined],
    ]);
    expect((await client.get(`/v1/films/${film.id}/sounds`)).json().items.map((s) => s.lyrics)).toEqual(expect.arrayContaining([lyrics, "", ""]));
  });

  test("words required, a length past 60 s refused, an unknown kind refused", async () => {
    const { film } = await scene();
    expect((await client.post(`/v1/films/${film.id}/sounds`, { json: { kind: "music", prompt: "" } })).statusCode).toBe(422);
    expect((await client.post(`/v1/films/${film.id}/sounds`, { json: { kind: "music", prompt: "x", seconds: 90 } })).statusCode).toBe(422);
    expect((await client.post(`/v1/films/${film.id}/sounds`, { json: { kind: "voice", prompt: "x" } })).statusCode).toBe(422);
  });

  test("an empty answer fails the job in words", async () => {
    const { film } = await scene();
    getState().services.makeAudio = async () => ({ audio: "" });
    const r = await settle((await client.post(`/v1/films/${film.id}/sounds`, { json: { kind: "effect", prompt: "x" } })).json());
    expect(r.error.title).toBe("The sound came back empty");
  });
});
