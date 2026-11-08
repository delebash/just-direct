// SPDX-License-Identifier: MIT
// JustVoice's client — the character voices JustDirect speaks with come from JustVoice's server (the app or its headless
// `justvoice-server serve`), the family's one voice studio: JustDirect is its client, as a game tool would be (the voice
// decision, docs/plans/2026-11-08-justvoice-voices.md; JustVoice's docs/dev/client-api.md holds the shapes). Every call
// says who asks (`X-Client: JustDirect`, kept as the voice's `made_by`). A long call is a JustVoice job, followed here
// until it ends; a cancel stops it there too. JustVoice not answering is a 409 naming the address looked at.

import { ApiError } from "@delebash/core/platform/errors";

const CLIENT = "JustDirect";
const POLL_MS = 1000;

/** Wait `ms`, or until `signal` aborts (its listener taken off either way). */
function pause(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    const onAbort = () => {
      clearTimeout(t);
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** JustVoice isn't answering at `base`. */
const offline = (base) =>
  new ApiError(409, "justvoice-offline", "JustVoice isn't running", `Voices come from JustVoice: open it, or start its server (justvoice-server serve). JustDirect looked for it at ${base}.`);

/** What JustVoice refused, in its own words (a problem+json body), as JustDirect's refusal. */
async function refusal(r, what) {
  let body = {};
  try {
    body = await r.json();
  } catch {
    // not JSON
  }
  const title = body.title || body.detail?.title || `JustVoice couldn't ${what}`;
  const detail = typeof body.detail === "string" ? body.detail : body.detail?.message || body.message || `It answered ${r.status}.`;
  return new ApiError(r.status === 404 ? 404 : r.status >= 500 ? 502 : 409, "justvoice-refused", title, detail);
}

/** The client for the JustVoice server at `base` (http://127.0.0.1:17494). `fetchFn` is a seam for tests. */
export function justVoice(base, { fetchFn = fetch } = {}) {
  const root = String(base || "").replace(/\/+$/, "");
  const call = async (method, p, { json, signal, what = "answer" } = {}) => {
    let r;
    try {
      r = await fetchFn(`${root}${p}`, {
        method,
        headers: { "x-client": CLIENT, ...(json !== undefined ? { "content-type": "application/json" } : {}) },
        body: json !== undefined ? JSON.stringify(json) : undefined,
        signal,
      });
    } catch (e) {
      if (signal?.aborted) throw e;
      throw offline(root);
    }
    if (!r.ok) throw await refusal(r, what);
    return r;
  };
  const getJson = async (p, opts) => (await call("GET", p, opts)).json();

  /** Follow JustVoice job `job` until it ends → its result; `onProgress(fraction)`; `signal` stops it there too. */
  async function follow(job, { signal, onProgress, what }) {
    const stop = () => call("DELETE", `/v1/jobs/${encodeURIComponent(job.id)}`).catch(() => {});
    signal?.addEventListener("abort", stop, { once: true });
    try {
      let j = job;
      while (j.state === "running" || j.state === "queued") {
        onProgress?.(Number(j.progress) || 0);
        await pause(POLL_MS, signal);
        j = await getJson(`/v1/jobs/${encodeURIComponent(job.id)}`, { signal, what });
      }
      if (j.state !== "done") throw new ApiError(502, "justvoice-failed", j.error?.title || `JustVoice couldn't ${what}`, j.error?.detail || j.error?.message || `Its job ended ${j.state}.`);
      return j.result;
    } finally {
      signal?.removeEventListener("abort", stop);
    }
  }

  return {
    base: root,
    /** Whether JustVoice answers, and the client API it speaks (`client_api`, 1 and up) — null when it doesn't answer. */
    async health() {
      try {
        const h = await getJson("/v1/health");
        return { clientApi: Number(h.client_api) || 0 };
      } catch {
        return null;
      }
    },
    /** A character's voice made from who they are (JustVoice's tested recipe: described, designed once, its audition kept
     *  as a clip voice, cloned for every line) → `{voice_id, name, gender, description, described_by, design, clone,
     *  audition_url}`. `body`: `{name, description, lines, context, language, gender, commercial_use}`. */
    async characterVoice(body, { signal, onProgress } = {}) {
      const job = await (await call("POST", "/v1/character-voices", { json: body, signal, what: "make the voice" })).json();
      return follow(job, { signal, onProgress, what: "make the voice" });
    },
    /** One line spoken (OpenAI's /v1/audio/speech shape) → the WAV. */
    async speak({ voice, input, instructions, emotion, seed }, { signal } = {}) {
      const json = { input, voice, response_format: "wav", ...(instructions ? { instructions } : {}), ...(emotion ? { emotion } : {}), ...(seed != null ? { seed } : {}) };
      return Buffer.from(await (await call("POST", "/v1/audio/speech", { json, signal, what: "speak the line" })).arrayBuffer());
    },
    /** Lines spoken as one batch, JustVoice letting go of the card at its end → `[{id, wav, seconds, error}]` (a line it
     *  couldn't speak has its `error` and no `wav`). `lines`: `[{id, voice, input, instructions, emotion, seed}]`. */
    async speakBatch(lines, { signal, onProgress } = {}) {
      const job = await (await call("POST", "/v1/audio/speech/batch", { json: { lines, release: true }, signal, what: "speak the lines" })).json();
      try {
        const result = await follow(job, { signal, onProgress, what: "speak the lines" });
        const out = [];
        for (const line of result?.lines ?? []) {
          if (line.error) {
            out.push({ id: line.id, wav: null, seconds: 0, error: String(line.error) });
            continue;
          }
          const url = line.url || `/v1/audio/speech/batch/${encodeURIComponent(job.id)}/lines/${encodeURIComponent(line.id)}.wav`;
          const r = await call("GET", url.startsWith("http") ? url.slice(root.length) : url, { signal, what: "send a line" });
          out.push({ id: line.id, wav: Buffer.from(await r.arrayBuffer()), seconds: Number(line.seconds) || 0, error: null });
        }
        return out;
      } finally {
        // the batch's files kept until fetched, then let go (JustVoice's client API: an ended job's batch stays until
        // deleted, or a day)
        await call("DELETE", `/v1/audio/speech/batch/${encodeURIComponent(job.id)}`, { what: "forget the batch" }).catch(() => {});
      }
    },
    /** A voice cloned from a recording (a WAV) → JustVoice's voice row. */
    async cloneVoice({ name, wav, transcript, language, gender }, { signal } = {}) {
      const json = { name, ref_wav_b64: Buffer.from(wav).toString("base64"), language, ...(transcript ? { transcript } : { xvector_only: true }), ...(gender ? { gender } : {}) };
      return (await call("POST", "/v1/voices/clone", { json, signal, what: "clone the voice" })).json();
    },
    /** A file JustVoice serves (a voice's audition) → its bytes. */
    async fetchFile(p, { signal } = {}) {
      return Buffer.from(await (await call("GET", p.startsWith("http") ? p.slice(root.length) : p, { signal, what: "send the file" })).arrayBuffer());
    },
    /** A voice JustDirect made, gone from JustVoice (one already gone is fine). */
    async deleteVoice(id) {
      try {
        await call("DELETE", `/v1/voices/${encodeURIComponent(id)}`, { what: "delete the voice" });
      } catch (e) {
        if (e?.statusCode !== 404) throw e;
      }
    },
  };
}
