// SPDX-License-Identifier: MIT
// A character's voice from a recording (/v1/cards/:id/voice-sample): refused on a card that isn't a character and
// without FFmpeg; and, where this computer has FFmpeg (the kit's pinned build the test bench installed, or
// JD_TEST_FFMPEG), a real recording read into the voice model's 24 kHz mono, kept with what it says, replaced, played,
// taken off, and gone with its card.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import { getDb } from "../src/app_state.js";
import { seedWorkspace } from "../src/database/seed.js";
import { filmDir } from "../src/files.js";
import { testClient, tmpDir, useHermeticKit } from "./helpers.js";

useHermeticKit();

const FFMPEG =
  process.env.JD_TEST_FFMPEG || "E:\\Dev\\Web\\test-just-direct\\ai-cache\\kit-ffmpeg\\ffmpeg\\9.0.2\\cpu\\ffmpeg-9.0.2-essentials_build\\bin\\ffmpeg.exe";

let client;
let dataDir;
beforeEach(async () => {
  dataDir = tmpDir();
  client = testClient(await createApp(dataDir));
  seedWorkspace(getDb());
});

const upload = (cardId, bytes, text) => {
  const form = new FormData();
  form.append("file", new Blob([bytes]), "voice.mp3");
  if (text !== undefined) form.append("text", text);
  return client.app.request(`http://testserver/v1/cards/${cardId}/voice-sample`, { method: "POST", body: form, headers: { host: "testserver" } });
};
async function cards() {
  const film = (await client.post("/v1/films", { json: { title: "Ferry" } })).json();
  const mara = (await client.post(`/v1/films/${film.id}/cards`, { json: { kind: "character", name: "Mara" } })).json();
  const pier = (await client.post(`/v1/films/${film.id}/cards`, { json: { kind: "place", name: "Pier" } })).json();
  return { film, mara, pier };
}

test("only a character takes a voice recording; without FFmpeg it is refused, saying where to install it", async () => {
  const { mara, pier } = await cards();
  const notOne = await upload(pier.id, Buffer.from("x"));
  expect(notOne.status).toBe(409);
  expect((await notOne.json()).title).toBe("Only a character speaks");
  const noTool = await upload(mara.id, Buffer.from("x"));
  expect(noTool.status).toBe(409);
  expect((await noTool.json()).title).toBe("FFmpeg isn't installed");
});

describe.skipIf(!existsSync(FFMPEG))("a real recording, with this computer's FFmpeg", () => {
  beforeEach(async () => {
    const r = await client.put("/v1/ai/runtimes/ffmpeg/settings", { json: { settings: { path: FFMPEG } } });
    expect(r.statusCode).toBe(200);
  });
  // a 4 s stereo MP3 at 44.1 kHz, as a phone might record it
  const mp3 = () => execFileSync(FFMPEG, ["-v", "error", "-f", "lavfi", "-i", "sine=f=220:d=4:sample_rate=44100", "-ac", "2", "-f", "mp3", "-"]);

  test("read into 24 kHz mono with its words; replaced; played; taken off; gone with its card", { timeout: 60_000 }, async () => {
    const { film, mara } = await cards();
    const first = await upload(mara.id, mp3(), "  I've run this ferry for forty years. ");
    expect(first.status).toBe(200);
    const card = await first.json();
    expect(card).toMatchObject({ voiceSampleText: "I've run this ferry for forty years." });
    expect(card.voiceSampleUrl).toMatch(/^\/v1\/cards\/.+\/voice-sample\?v=/);
    const dir = path.join(filmDir(dataDir, film.id), "cards");
    const wav = readFileSync(path.join(dir, card.voiceSample));
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.readUInt16LE(22)).toBe(1); // mono
    expect(wav.readUInt32LE(24)).toBe(24000); // 24 kHz

    // a new recording replaces the old one, file and all; no words this time
    const second = await (await upload(mara.id, mp3())).json();
    expect(second.voiceSampleText).toBe("");
    expect(readdirSync(dir)).toEqual([second.voiceSample]);
    const played = await client.get(second.voiceSampleUrl);
    expect(played.headers["content-type"]).toBe("audio/wav");

    // not audio at all
    const junk = await upload(mara.id, Buffer.from("not a recording"));
    expect(junk.status).toBe(415);

    const off = (await client.delete(`/v1/cards/${mara.id}/voice-sample`)).json();
    expect(off).toMatchObject({ voiceSample: null, voiceSampleUrl: null, voiceSampleText: "" });
    expect(readdirSync(dir)).toEqual([]);

    await upload(mara.id, mp3());
    expect(readdirSync(dir)).toHaveLength(1);
    expect((await client.delete(`/v1/cards/${mara.id}`)).statusCode).toBe(204);
    expect(readdirSync(dir)).toEqual([]);
  });
});
