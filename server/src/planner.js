// SPDX-License-Identifier: MIT
// The planner — a film's story turned into cards and shots, and a hand edit carried into the later shots. The design
// and its prompts are the ones that passed JustDirect's planner test (the kit's feasibility record §J.3, 2026-10-31:
// three passes, each answer held to a JSON schema built for the run, thinking on — revisions correct on 3 of 3 plans,
// about 6 minutes a plan on Gemma 4 26B-A4B; E:\Dev\Web\test-just-direct\planner\planner-test.js). Changed from the
// test: the cards' kinds are the app's (character, place, prop, look), a character carries a voice, a shot's size and
// camera move are fields of their own (the test put them at the start of its prompt), a shot names who speaks its line,
// and the planner keeps the cards the film already has.
//
// The prompts are the actions' rows (seed_feature_prompts.js — editable in the AI page's Lab); each run's schema is
// built here from the film (RunRequest `jsonSchema`): a shot's cards can only be the film's own. What comes back is
// repaired, not trusted: unknown names dropped, a card a shot's words name added (the test's one miss per plan),
// a spoken line given time to be spoken.

import { CARD_KINDS } from "./database/films.js";
import { DELIVERY_MAX, EMOTIONS, SECONDS_MAX, SIZES, TRANSITIONS } from "./schemas/shots.js";

export const ACTIONS = Object.freeze({ cards: "plan.cards", shots: "plan.shots", revise: "plan.revise" });

const ROLE = "You are a film director's first assistant. Use only what the story gives. Never invent characters, places or plot.";

/** The three actions' prompt rows (seed_feature_prompts.js). Each run sends its schema; the rows' own is empty. */
export const PLANNER_PROMPTS = {
  [ACTIONS.cards]: {
    feature: ACTIONS.cards,
    system: `${ROLE} Make one card for each character, each place where the story happens (kind "place") and each object that matters to the story (kind "prop"); add a card of kind "look" only when the story names a visual style. A description says only what the thing looks like — never what happens there or who uses it — with every look detail the story gives, so a picture can be painted from it alone: a place says what kind of place it is and where, as the story gives or plainly means it (a ship captain's cabin is aboard her ship), and its light; a prop says its shape, colour and material. For a character, voice is one plain sentence a voice actor could read, saying how they sound from what the story gives — their age, whether a man, woman, boy or girl, their manner — such as "an older woman's low, weathered voice, calm and dry"; never a list or brackets. The film already has the cards listed under HAS: never make them again.`,
    user_template: "STORY:\n{{story}}\n\nHAS:\n{{cards}}",
    json_mode: true,
  },
  [ACTIONS.shots]: {
    feature: ACTIONS.shots,
    system: `${ROLE} Break the whole story into shots in story order — as many as the story needs, at most {{maxShots}}. Direct it like a film: vary wide, medium and close shots, use a close-up for each key object and reaction, and choose the transition that serves the moment. For each shot: place is the card of the place it happens in; cards lists every card seen or named in the shot, its place included; size is how it is framed; camera is the camera's move in a few words ("static", "slow push in", "pan left", "tracking beside her", "handheld"); action says what happens in one or two sentences, never repeating a card's look; line is the words spoken in the shot, or "" if none, and speaker the card of who speaks it, or ""; delivery is how the line is said, in a few words an actor could play ("quietly, holding back tears"), and emotion the one word for it from the list, both "" when there is no line; seconds is how long the shot runs, long enough to speak its line.`,
    user_template: "STORY:\n{{story}}\n\nCARDS:\n{{cards}}",
    json_mode: true,
  },
  [ACTIONS.revise]: {
    feature: ACTIONS.revise,
    system: `${ROLE} The user changed one shot by hand and it is now final; never touch it or anything before it. Go through every shot listed as EDITABLE, in order, and ask what the change means there: an object that is gone must leave the shot, a change to a character carries into every later shot that shows them. Rewrite each such shot in full and keep the rest of its text. Return only the shots you change, each with its own number. Say why in one sentence.`,
    user_template: "CARDS:\n{{cards}}\n\nSHOTS:\n{{shots}}\n\nTHE CHANGE (shot {{number}} is now final):\n{{change}}\n\nEDITABLE: {{editable}}",
    json_mode: true,
  },
};

// ── the film as the planner reads it: each card a short name of its own ──────────────────────────────────────────

const slug = (s) =>
  String(s)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32) || "card";

/** Each card's short name for the planner (`ref`): its name as a slug, made unique. → {refs: Map ref→card, byId: Map
 *  id→ref}. */
export function cardRefs(cards) {
  const refs = new Map();
  const byId = new Map();
  for (const c of cards) {
    let ref = slug(c.name);
    for (let n = 2; refs.has(ref); n++) ref = `${slug(c.name)}_${n}`;
    refs.set(ref, c);
    byId.set(c.id, ref);
  }
  return { refs, byId };
}

/** The cards as the planner reads them (one JSON line each). */
export const cardsText = (cards, byId) =>
  cards.length ? cards.map((c) => JSON.stringify({ card: byId.get(c.id), kind: c.kind, name: c.name, description: c.description })).join("\n") : "(none)";

/** The shots as a revision reads them, numbered from 1. */
export function shotsText(shots, byId) {
  return shots
    .map((s, i) =>
      JSON.stringify({
        number: i + 1,
        place: s.placeId ? (byId.get(s.placeId) ?? "") : "",
        cards: s.cardIds.map((id) => byId.get(id)).filter(Boolean),
        size: s.size,
        camera: s.camera,
        action: s.action,
        line: s.line,
        speaker: s.speakerId ? (byId.get(s.speakerId) ?? "") : "",
        delivery: s.delivery,
        emotion: s.emotion,
        seconds: Math.round(s.seconds),
      }),
    )
    .join("\n");
}

// ── the schemas, built for the run ────────────────────────────────────────────────────────────────────────────────

const str = { type: "string" };
const oneOf = (values) => ({ enum: values.length ? values : [""] });
/** Words the model must write: a string at least `min` characters long. */
const words = (min) => ({ type: "string", minLength: min });
const NONE = Object.freeze({ enum: [""] });

/** The cards pass's answer. A character's voice stays optional here: held by the schema (`anyOf` a character with
 *  voice words or another card with none), the model wrote "Not provided." to fill it and made 3 cards where it had
 *  made 8 and 9 — the places' setting and every prop gone (measured 2026-11-08, RESEARCH). An empty voice is JustVoice's
 *  to describe from the card's looks (voices.js `whoTheyAre`). */
export function cardsSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["cards"],
    properties: {
      cards: {
        type: "array",
        maxItems: 24,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["kind", "name", "description", "voice"],
          properties: { kind: { enum: [...CARD_KINDS] }, name: str, description: str, voice: str },
        },
      },
    },
  };
}

/** A shot of the shots and revise passes. A shot with a line has its speaker, its delivery and its feeling, and one
 *  without has none of them — held by the schema, as `anyOf` the two shapes (the prompt alone left a line's delivery and
 *  feeling "" on one of two real plans, 2026-11-08). With no character to speak, only the shape without. */
function shotItem(refs, placeRefs, speakerRefs, withNumber = null) {
  const shape = (spoken) => {
    const props = {
      ...(withNumber ? { number: { enum: withNumber } } : {}),
      place: oneOf([...placeRefs, ""]),
      cards: refs.length ? { type: "array", maxItems: 8, items: { enum: refs } } : { type: "array", maxItems: 0 },
      size: { enum: [...SIZES] },
      camera: str,
      action: words(3),
      line: spoken ? words(1) : NONE,
      speaker: spoken ? { enum: speakerRefs } : NONE,
      delivery: spoken ? words(3) : NONE,
      emotion: spoken ? { enum: [...EMOTIONS] } : NONE,
      seconds: { type: "integer", minimum: 2, maximum: 10 },
      transition: { enum: [...TRANSITIONS] },
    };
    return { type: "object", additionalProperties: false, required: Object.keys(props), properties: props };
  };
  return speakerRefs.length ? { anyOf: [shape(true), shape(false)] } : shape(false);
}

const refsOf = (cards, byId, kinds) => cards.filter((c) => !kinds || kinds.includes(c.kind)).map((c) => byId.get(c.id));

export function shotsSchema(cards, byId, maxShots) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["shots"],
    properties: {
      shots: { type: "array", minItems: 1, maxItems: maxShots, items: shotItem(refsOf(cards, byId), refsOf(cards, byId, ["place"]), refsOf(cards, byId, ["character"])) },
    },
  };
}

export function reviseSchema(cards, byId, editable) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["why", "shots"],
    properties: {
      why: str,
      shots: { type: "array", maxItems: editable.length, items: shotItem(refsOf(cards, byId), refsOf(cards, byId, ["place"]), refsOf(cards, byId, ["character"]), editable) },
    },
  };
}

// ── what comes back, repaired ─────────────────────────────────────────────────────────────────────────────────────

/** The model's answer as an object: its JSON (a fenced block's too), or an error saying the answer was unusable. */
export function parseAnswer(content) {
  const text = String(content ?? "")
    .trim()
    .replace(/^```(?:json)?\s*|\s*```$/g, "");
  try {
    const v = JSON.parse(text);
    if (v && typeof v === "object") return v;
  } catch {
    // below
  }
  throw Object.assign(new Error("The planner's answer wasn't the plan it was asked for — try again, or use a stronger model on the AI page."), {
    title: "The plan didn't come back whole",
  });
}

const clean = (s, max) => String(s ?? "").trim().slice(0, max);

/** A character's voice as the planner wrote it, or "" when it says too little to make a voice from: its brackets and
 *  quotes gone, fewer than two words left (the first real run's `(sixties, "", "")`). JustVoice makes the voice from the
 *  card's description and these words (voices.js `ensureVoice`). */
export function plannedVoice(text) {
  const s = clean(text, 600)
    .replace(/["“”()[\]{}]/g, " ")
    .replace(/(\s*,)+/g, ",")
    .replace(/^[\s,]+|[\s,]+$/g, "")
    .replace(/\s{2,}/g, " ");
  return s.split(/[\s,]+/).filter((w) => /\p{L}/u.test(w)).length >= 2 ? s : "";
}

/** New cards from the cards pass: valid kinds, a name, none the film has (by name, any case), none twice. */
export function newCards(answer, existing) {
  const have = new Set(existing.map((c) => c.name.trim().toLowerCase()));
  const out = [];
  for (const c of Array.isArray(answer?.cards) ? answer.cards : []) {
    const name = clean(c?.name, 80);
    if (!name || !CARD_KINDS.includes(c?.kind) || have.has(name.toLowerCase())) continue;
    have.add(name.toLowerCase());
    out.push({ kind: c.kind, name, description: clean(c.description, 2000), voice: c.kind === "character" ? plannedVoice(c.voice) : "" });
  }
  return out;
}

/** A word in `text` that is a card's name (whole words, any case). */
const names = (text, card) => new RegExp(`(^|[^\\p{L}\\p{N}])${card.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\p{N}])`, "iu").test(text);

/**
 * One shot of the planner's answer as the app keeps it: card refs turned into ids (an unknown one dropped), its place
 * and speaker among its cards, any card its words name added, its length long enough to speak its line at
 * `wordsPerSecond`, at most SECONDS_MAX.
 */
export function shotFrom(item, cards, refs, { wordsPerSecond }) {
  const id = (ref, kind) => {
    const c = refs.get(String(ref ?? ""));
    return c && (!kind || c.kind === kind) ? c.id : null;
  };
  const placeId = id(item?.place, "place");
  const speakerId = id(item?.speaker, "character");
  const action = clean(item?.action, 1200);
  const line = clean(item?.line, 600);
  const ids = new Set((Array.isArray(item?.cards) ? item.cards : []).map((r) => id(r)).filter(Boolean));
  if (placeId) ids.add(placeId);
  if (speakerId) ids.add(speakerId);
  // the card a shot's words name but its list misses (the planner test's one miss per plan)
  for (const c of cards) if (!ids.has(c.id) && c.kind !== "look" && names(`${action} ${line}`, c)) ids.add(c.id);
  let seconds = Number.isFinite(item?.seconds) ? item.seconds : 4;
  const words = line ? line.split(/\s+/).filter(Boolean).length : 0;
  if (words) seconds = Math.max(seconds, Math.ceil(words / wordsPerSecond) + 1);
  seconds = Math.min(SECONDS_MAX, Math.max(2, Math.round(seconds)));
  return {
    placeId,
    cardIds: [...ids],
    size: SIZES.includes(item?.size) ? item.size : "",
    camera: clean(item?.camera, 120),
    action,
    line,
    speakerId: line ? speakerId : null,
    // how the line is said, only with a line (JustVoice takes both: some models only a label)
    delivery: line ? clean(item?.delivery, DELIVERY_MAX) : "",
    emotion: line && EMOTIONS.includes(item?.emotion) ? item.emotion : "",
    seconds,
    transition: TRANSITIONS.includes(item?.transition) ? item.transition : "cut",
  };
}

/** The shots pass's answer as shots; an empty plan is an error. */
export function shotsFrom(answer, cards, refs, opts) {
  const items = Array.isArray(answer?.shots) ? answer.shots : [];
  const shots = items.map((item) => shotFrom(item, cards, refs, opts)).filter((s) => s.action || s.line);
  if (!shots.length) throw Object.assign(new Error("The planner made no shots from this story."), { title: "The plan came back empty" });
  return shots;
}

/** A hand edit in words, for the revision: the shot as it is now, and what the user said. */
export function changeText(shot, byId, note) {
  const parts = [`Size: ${shot.size || "-"}. Camera: ${shot.camera || "-"}. Action: ${shot.action || "-"}.`];
  if (shot.line) parts.push(`Line (${shot.speakerId ? byId.get(shot.speakerId) : "someone"}): "${shot.line}".`);
  const cards = shot.cardIds.map((id) => byId.get(id)).filter(Boolean);
  if (cards.length) parts.push(`Cards: ${cards.join(", ")}.`);
  if (note) parts.push(`The user says: ${note}`);
  return parts.join(" ");
}
