// SPDX-License-Identifier: MIT
// JustVoice's client (justvoice.js) against a stand-in JustVoice server in its client API's shapes (docs/plans/
// 2026-11-08-justvoice-voices.md): who asks on every call, a voice job followed to its end, a line in OpenAI's speech
// shape, a batch's lines each fetched, a clone, a delete that finds nothing, JustVoice not answering, a cancel.
import { describe, expect, test } from "vitest";
import { justVoice } from "../src/justvoice.js";

const BASE = "http://127.0.0.1:17494";
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const wavBytes = (n) => new Response(Buffer.alloc(n, 7), { status: 200, headers: { "content-type": "audio/wav" } });

/** A stand-in JustVoice: `routes` maps "METHOD /path" to (body, call) → Response; every call is kept. */
function server(routes) {
  const calls = [];
  const fetchFn = async (url, init = {}) => {
    const u = new URL(url);
    const key = `${init.method || "GET"} ${u.pathname}`;
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ key, body, headers: init.headers ?? {} });
    const route = routes[key];
    if (!route) return json({ title: "Not found" }, 404);
    return route(body, calls);
  };
  return { calls, fetchFn };
}

describe("JustVoice's client", () => {
  test("health: its client API's version; nothing answering is null", async () => {
    const up = server({ "GET /v1/health": () => json({ status: "ok", client_api: 1 }) });
    expect(await justVoice(`${BASE}/`, { fetchFn: up.fetchFn }).health()).toEqual({ clientApi: 1 });
    expect(up.calls[0].headers["x-client"]).toBe("JustDirect");
    const down = justVoice(BASE, { fetchFn: async () => Promise.reject(new TypeError("fetch failed")) });
    expect(await down.health()).toBeNull();
  });

  test("a character's voice: the body sent, its job followed to the result", async () => {
    let polls = 0;
    const s = server({
      "POST /v1/character-voices": () => json({ id: "job1", kind: "character-voice", state: "running", progress: 0 }, 202),
      "GET /v1/jobs/job1": () => (++polls < 2 ? json({ id: "job1", state: "running", progress: 0.5 }) : json({ id: "job1", state: "done", result: { voice_id: "v9", audition_url: "/a.wav" } })),
    });
    const seen = [];
    const r = await justVoice(BASE, { fetchFn: s.fetchFn }).characterVoice({ name: "Mara", description: "a captain", language: "en-US", commercial_use: true }, { onProgress: (f) => seen.push(f) });
    expect(r).toEqual({ voice_id: "v9", audition_url: "/a.wav" });
    expect(s.calls[0].body).toEqual({ name: "Mara", description: "a captain", language: "en-US", commercial_use: true });
    expect(seen).toContain(0.5);
  }, 10_000);

  test("a job that fails says JustVoice's own words", async () => {
    const s = server({
      "POST /v1/character-voices": () => json({ id: "j", state: "error", error: { title: "No commercial cloner", detail: "Breeze TTS 2 needs a separate licence." } }, 202),
    });
    await expect(justVoice(BASE, { fetchFn: s.fetchFn }).characterVoice({ name: "M" })).rejects.toMatchObject({ statusCode: 502, title: "No commercial cloner" });
  });

  test("a refusal (409 problem+json) comes back as JustDirect's, with its title", async () => {
    const s = server({ "POST /v1/character-voices": () => json({ title: "Qwen3-TTS can't speak sw-KE", detail: "it speaks en, zh" }, 409) });
    await expect(justVoice(BASE, { fetchFn: s.fetchFn }).characterVoice({ name: "M" })).rejects.toMatchObject({ statusCode: 409, title: "Qwen3-TTS can't speak sw-KE", detail: "it speaks en, zh" });
  });

  test("a line in OpenAI's speech shape: the WAV back; delivery and emotion only when given", async () => {
    const s = server({ "POST /v1/audio/speech": () => wavBytes(48) });
    const jv = justVoice(BASE, { fetchFn: s.fetchFn });
    const wav = await jv.speak({ voice: "v9", input: "Hello.", instructions: "softly", emotion: "sad", seed: 3 });
    expect(wav.length).toBe(48);
    expect(s.calls[0].body).toEqual({ input: "Hello.", voice: "v9", response_format: "wav", instructions: "softly", emotion: "sad", seed: 3 });
    await jv.speak({ voice: "v9", input: "Plain." });
    expect(s.calls[1].body).toEqual({ input: "Plain.", voice: "v9", response_format: "wav" });
  });

  test("a batch: one job letting go of the card at its end; each line's WAV fetched; a failed line kept with its error", async () => {
    const s = server({
      "POST /v1/audio/speech/batch": () => json({ id: "b1", kind: "speech-batch", state: "done", result: { lines: [{ id: "s1", seconds: 1.2 }, { id: "s2", error: "too long" }, { id: "s3", url: `${BASE}/files/s3.wav`, seconds: 2 }] } }, 202),
      "GET /v1/audio/speech/batch/b1/lines/s1.wav": () => wavBytes(10),
      "GET /files/s3.wav": () => wavBytes(20),
    });
    const out = await justVoice(BASE, { fetchFn: s.fetchFn }).speakBatch([{ id: "s1", voice: "v1", input: "a" }, { id: "s2", voice: "v1", input: "b" }, { id: "s3", voice: "v2", input: "c" }]);
    expect(s.calls[0].body.release).toBe(true);
    expect(out.map((l) => [l.id, l.wav?.length ?? null, l.error])).toEqual([
      ["s1", 10, null],
      ["s2", null, "too long"],
      ["s3", 20, null],
    ]);
  });

  test("a clone: its words when known, else its sound alone; a delete that finds nothing is fine", async () => {
    const s = server({ "POST /v1/voices/clone": () => json({ id: "rec1" }, 201), "DELETE /v1/voices/rec1": () => json({}, 404) });
    const jv = justVoice(BASE, { fetchFn: s.fetchFn });
    await jv.cloneVoice({ name: "Mara", wav: Buffer.from("RIFF"), transcript: "forty years", language: "en-US" });
    await jv.cloneVoice({ name: "Mara", wav: Buffer.from("RIFF"), transcript: "", language: "en-US" });
    expect(s.calls[0].body).toMatchObject({ name: "Mara", ref_wav_b64: Buffer.from("RIFF").toString("base64"), transcript: "forty years", language: "en-US" });
    expect(s.calls[1].body.xvector_only).toBe(true);
    expect(s.calls[1].body.transcript).toBeUndefined();
    await expect(jv.deleteVoice("rec1")).resolves.toBeUndefined();
  });

  test("not answering: a 409 naming where it looked", async () => {
    const jv = justVoice(BASE, { fetchFn: async () => Promise.reject(new TypeError("fetch failed")) });
    await expect(jv.speak({ voice: "v", input: "x" })).rejects.toMatchObject({ statusCode: 409, title: "JustVoice isn't running" });
    await expect(jv.speak({ voice: "v", input: "x" })).rejects.toHaveProperty("detail", expect.stringContaining(BASE));
  });

  test("a cancel stops the job in JustVoice too", async () => {
    const s = server({
      "POST /v1/character-voices": () => json({ id: "j2", state: "running", progress: 0 }, 202),
      "GET /v1/jobs/j2": () => json({ id: "j2", state: "running", progress: 0.1 }),
      "DELETE /v1/jobs/j2": () => json({}, 200),
    });
    const ac = new AbortController();
    const run = justVoice(BASE, { fetchFn: s.fetchFn }).characterVoice({ name: "M" }, { signal: ac.signal });
    setTimeout(() => ac.abort(), 50);
    await expect(run).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 20));
    expect(s.calls.some((c) => c.key === "DELETE /v1/jobs/j2")).toBe(true);
  });
});
