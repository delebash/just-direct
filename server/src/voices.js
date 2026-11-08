// SPDX-License-Identifier: MIT
// The characters' voices — each one JustVoice's (justvoice.js; the voice decision, docs/plans/2026-11-08-justvoice-voices.md),
// kept on the character's card: made once from who they are (JustVoice's tested recipe: described, designed once, its
// audition kept as a clip voice, every line cloned from it), or cloned from the recording on the card. A line is spoken
// in its speaker's voice, with how it is said (the shot's delivery and emotion). Speaking a film's lines lets go of
// JustDirect's own models first and asks JustVoice for one batch (the user, 2026-11-08: "just unload your model first,
// make sure you do a batch to jv ... then you can reload your models").

import { randomInt, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { ApiError, notFound } from "@delebash/core/platform/errors";
import { getLogger } from "@delebash/core/platform/log";
import { wavSeconds } from "@delebash/core/runner/audiocpp";
import { getDb, getState } from "./app_state.js";
import * as films from "./database/films.js";
import { SETTING_DEFAULTS } from "./database/seed.js";
import { getSetting } from "./database/settings.js";
import * as shots from "./database/shots.js";
import * as sounds from "./database/sounds.js";
import { fileName, filmFile, removeFile, writeWhole } from "./files.js";

const log = getLogger("just_direct.voices");

const setting = (key) => getSetting(getDb(), key) ?? SETTING_DEFAULTS[key];

/** JustVoice's client at the address Settings → Voices names. */
export const justVoice = () => getState().services.voices(setting("voices.justvoiceUrl"));

/** Refused before a job starts when JustVoice doesn't answer — the client's own words, at once. */
export async function mustReachJustVoice() {
  const jv = justVoice();
  if (!(await jv.health())) {
    throw new ApiError(409, "justvoice-offline", "JustVoice isn't running", `Voices come from JustVoice: open it, or start its server (justvoice-server serve). JustDirect looked for it at ${jv.base}.`);
  }
  return jv;
}

/** Who a character is, in the words their voice is made from: the card's description and its Voice words. */
/** Whether `card`'s words changed since its voice was made from them (its description or Voice words) — the voice is
 *  then made again on Make it again; a voice from a recording never is. */
export const voiceStale = (card) => card.voiceInfo?.source === "made" && card.voiceInfo.madeFrom != null && card.voiceInfo.madeFrom !== whoTheyAre(card);

function whoTheyAre(card) {
  const description = String(card.description ?? "").trim();
  const voice = String(card.voice ?? "").trim();
  if (description && voice) return `${/[.!?]$/.test(description) ? description : `${description}.`} Their voice: ${voice}`;
  return description || voice;
}

/** The lines `card` speaks in the film, in order. */
const linesOf = (filmId, cardId) =>
  shots
    .listShots(getDb(), filmId)
    .filter((s) => s.speakerId === cardId && s.line.trim())
    .map((s) => s.line.trim());

/** The licence words JustVoice gave a model (`{commercial, summary, url}`), as the card keeps them. */
const licenceOf = (m) => (m ? { model: m.model ?? m.name ?? "", name: m.name ?? m.model ?? "", commercial: m.commercial ?? "", summary: m.summary ?? "", url: m.url ?? "" } : null);

/** A voice JustDirect made, gone from JustVoice and from the card (its audition file too). */
export async function forgetVoice(card) {
  if (card.voiceId) {
    await justVoice()
      .deleteVoice(card.voiceId)
      .catch((e) => log.warning(`card ${card.id}: its JustVoice voice wasn't deleted (${e?.message ?? e}); left there`));
  }
  const audition = fileName(card.voiceInfo?.audition, "wav");
  if (audition) await removeFile(filmFile(getState().dataDir, card.filmId, "cards", audition));
  return films.updateCard(getDb(), card.id, { voiceId: null, voiceInfo: {} });
}

/**
 * `card`'s voice, made in JustVoice when it has none: cloned from the card's recording when it has one, else made from who
 * they are — the description, their lines and the story's opening, in models that allow commercial use (JustDirect's
 * default route, the PRD). Its audition is kept in the film's cards folder. → the card with its voice.
 */
export async function ensureVoice(film, card, { signal, onProgress } = {}) {
  if (card.voiceId) return card;
  if (card.kind !== "character") throw new ApiError(409, "not-a-character", "Only a character speaks", "A line's speaker is a character card.");
  const jv = justVoice();
  const language = setting("voices.locale");
  const { dataDir } = getState();
  let voiceId;
  let info;
  const sample = fileName(card.voiceSample, "wav");
  if (sample) {
    const wav = await readFile(filmFile(dataDir, film.id, "cards", sample));
    const row = await jv.cloneVoice({ name: `${card.name} · ${film.title}`, wav, transcript: card.voiceSampleText.trim(), language }, { signal });
    voiceId = row.id;
    info = { source: "recording", clone: licenceOf({ ...(row.licence ?? {}), model: row.model, name: row.model_name ?? row.model }) };
  } else {
    const r = await jv.characterVoice(
      {
        name: `${card.name} · ${film.title}`,
        description: whoTheyAre(card) || card.name,
        lines: linesOf(film.id, card.id).slice(0, 20),
        context: String(film.story ?? "").trim().slice(0, 600),
        language,
        commercial_use: true,
      },
      { signal, onProgress },
    );
    voiceId = r.voice_id;
    info = {
      source: "made",
      // the card's words it was made from: a change to them shows on the card (voiceStale)
      madeFrom: whoTheyAre(card),
      description: r.description ?? "",
      gender: r.gender ?? null,
      describedBy: r.described_by ?? null,
      design: licenceOf(r.design),
      clone: licenceOf(r.clone),
      // the line it was designed speaking — what its audition says
      auditionLine: r.audition ?? "",
    };
    if (r.audition_url) {
      const name = `${card.id}-audition-${randomUUID().slice(0, 8)}.wav`;
      await writeWhole(filmFile(dataDir, film.id, "cards", name), await jv.fetchFile(r.audition_url, { signal }));
      info.audition = name;
    }
  }
  signal?.throwIfAborted();
  const now = films.getCard(getDb(), card.id);
  if (!now) {
    await jv.deleteVoice(voiceId).catch(() => {});
    throw notFound(`There is no card with the id ${card.id}.`);
  }
  log.info(`card ${card.id}: its voice made in JustVoice (${info.source})`);
  return films.updateCard(getDb(), card.id, { voiceId, voiceInfo: info });
}

/** What JustVoice is asked to say for `shot`: its line in its speaker's voice, how it is said, a new seed. */
export const lineRequest = (shot, speaker) => ({
  voice: speaker.voiceId,
  input: shot.line.trim(),
  ...(shot.delivery?.trim() ? { instructions: shot.delivery.trim() } : {}),
  ...(shot.emotion ? { emotion: shot.emotion } : {}),
  seed: randomInt(2147483647),
});

/** `wav` kept as `shot`'s line — the old one removed. → the sound. */
export async function keepLine(film, shot, wav) {
  const db = getDb();
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
  return sound;
}

/** The speaker of `shot` — refused when the line has none (a voice is a character's). */
export function speakerOf(shot) {
  const speaker = shot.speakerId ? films.getCard(getDb(), shot.speakerId) : null;
  if (!speaker) throw new ApiError(409, "no-speaker", "The line has no speaker", "Choose who says it: a line is spoken in its character's voice.");
  return speaker;
}

/** One shot's line spoken (a job's body — Speak). → the sound. */
export async function speakShot(film, shot, { signal, progress }) {
  if (!shot.line.trim()) throw new ApiError(409, "no-line", "The shot has no line", "Write the words spoken in the shot first.");
  const speaker = await ensureVoice(film, speakerOf(shot), { signal, onProgress: (f) => progress?.(0.6 * f, "voice") });
  progress?.(0.65, "speaking");
  const wav = await justVoice().speak(lineRequest(shot, speaker), { signal });
  signal?.throwIfAborted();
  return keepLine(film, mustShotNow(shot.id), wav);
}

const mustShotNow = (id) => {
  const s = shots.getShot(getDb(), id);
  if (!s) throw notFound(`There is no shot with the id ${id}.`);
  return s;
};

/** The shots whose line hasn't been spoken yet: a line, a speaker, no voice on file. */
export const unspokenShots = (filmId) => shots.listShots(getDb(), filmId).filter((s) => s.line.trim() && s.speakerId && !sounds.lineOf(getDb(), s.id));

/**
 * The film's unspoken lines (a job's body — Speak lines, and Make the film's voices step): every speaker's voice made
 * first, then JustDirect's own models let go of the card and the lines asked of JustVoice as one batch, which lets go of
 * the card when it ends. → `{spoken, voicesMade, failed: [{shotId, why}]}`.
 */
export async function speakFilm(film, { signal, progress, update }) {
  const todo = unspokenShots(film.id);
  update?.({ filmId: film.id, shots: todo.length });
  if (!todo.length) return { spoken: 0, voicesMade: 0, failed: [] };
  // 1. every speaker's voice
  const speakerIds = [...new Set(todo.map((s) => s.speakerId))];
  const voiced = new Map();
  let voicesMade = 0;
  for (const [i, id] of speakerIds.entries()) {
    const card = films.getCard(getDb(), id);
    if (!card) continue;
    const had = card.voiceId;
    voiced.set(id, await ensureVoice(film, card, { signal, onProgress: (f) => progress?.((0.3 * (i + f)) / speakerIds.length, "voices") }));
    if (!had) voicesMade++;
  }
  // 2. the card handed over, the lines in one batch
  progress?.(0.32, "speaking");
  await getState().services.freeCard();
  const asked = todo.filter((s) => voiced.get(s.speakerId)?.voiceId);
  const lines = asked.map((s) => ({ id: s.id, ...lineRequest(s, voiced.get(s.speakerId)) }));
  const said = await justVoice().speakBatch(lines, { signal, onProgress: (f) => progress?.(0.32 + 0.6 * f, "speaking") });
  // 3. each line kept as its shot's
  let spoken = 0;
  const failed = [];
  for (const r of said) {
    const shot = shots.getShot(getDb(), r.id);
    if (!shot) continue;
    if (!r.wav) {
      failed.push({ shotId: r.id, why: r.error || "JustVoice didn't speak it" });
      continue;
    }
    await keepLine(film, shot, r.wav);
    spoken++;
  }
  log.info(`film ${film.id}: ${spoken} lines spoken by JustVoice, ${voicesMade} voices made, ${failed.length} failed`);
  return { spoken, voicesMade, failed };
}
