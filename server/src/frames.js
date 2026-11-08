// SPDX-License-Identifier: MIT
// A shot's first frame — painted from the shot's words with its cards' pictures as references (FLUX.2 [klein] 4B's
// references: cast, set and prop held in one frame, feasibility §J.2), then checked by a local vision model, which the
// handoff measured agreeing with Claude's eye on 16 of 16 frames (Qwen3-VL-8B, E:\Dev\Web\test-just-direct\
// framecheck.js). klein adds stray people and objects on many seeds, so several candidates are painted and the check
// keeps the one that matches the shot.

import sharp from "sharp";
import { SIZES } from "./schemas/shots.js";

export const CHECK_ACTION = "frames.check";

/** What the check may name as a fault (the faults the action research's reviews found in klein's frames). */
export const FAULTS = Object.freeze(["extra limbs or fingers", "distorted face", "doubled object", "floating object", "blurry or smeared", "unwanted text"]);

/** The check's prompt row (seed_feature_prompts.js — editable in the AI page's Lab); each run sends its schema. */
export const CHECK_PROMPT = {
  feature: CHECK_ACTION,
  system:
    "You check the first frame of a film shot against what the shot should show. Look at the whole picture carefully. For each expected card say whether it is clearly visible and looks as described. Count the people in the picture who are not among the expected characters. Say whether readable text or lettering appears anywhere — signs, logos, captions, number plates. List the faults you can see, from the allowed list only. Then rate from 0 to 10 how well the picture works as this shot's first frame. Write one short sentence on what is wrong, or that it is right.",
  user_template: "THE SHOT: {{shot}}\n\nEXPECTED:\n{{expected}}",
  json_mode: true,
};

const sentence = (s) => {
  const t = String(s ?? "").trim();
  return t && !/[.!?]$/.test(t) ? `${t}.` : t;
};
const sizeWords = (size) => (SIZES.includes(size) ? `A ${size} shot.` : "");

/** The cards a shot shows, as the frame's words name them: its list, then its place and its speaker if the list missed
 *  them (a look is the film's style, not something in the frame). */
const shownCards = (shot, cards) =>
  [...new Set([...shot.cardIds, shot.placeId, shot.line ? shot.speakerId : null].filter(Boolean))].map((id) => cards.find((c) => c.id === id)).filter((c) => c && c.kind !== "look");

/**
 * The words a first frame is painted from: the template (Settings) with {size}, {action}, {cards} — each card the shot
 * shows, by name and look — and {look}, the film's look and the shot's look cards.
 */
export function framePrompt(template, shot, cards, film) {
  const looks = shot.cardIds.map((id) => cards.find((c) => c.id === id)).filter((c) => c?.kind === "look");
  const fill = {
    size: sizeWords(shot.size),
    action: sentence(shot.action),
    cards: shownCards(shot, cards)
      .map((c) => sentence(c.description ? `${c.name}: ${c.description}` : c.name))
      .join(" "),
    look: [film.look, ...looks.map((c) => c.description || c.name)].map(sentence).filter(Boolean).join(" "),
  };
  return String(template)
    .replace(/\{(size|action|cards|look)\}/g, (_, k) => fill[k])
    .replace(/\s+\./g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** The cards whose pictures go with the frame as references, at most `max`: who speaks first, then the other
 *  characters in the shot's order, then its place, then its props. Only cards with a picture. */
export function referenceCards(shot, cards, max) {
  const shown = shownCards(shot, cards).filter((c) => c.picture);
  const rank = (c) => (c.id === shot.speakerId ? 0 : c.kind === "character" ? 1 : c.kind === "place" ? 2 : 3);
  return [...shown].sort((a, b) => rank(a) - rank(b) || shown.indexOf(a) - shown.indexOf(b)).slice(0, max);
}

/** A reference picture made small (at most `pixels` of it): klein reads small references as well by eye and in
 *  under half the time (20 s against 45–49 s at 1280×704, feasibility §J.2's `vae_input_max_pixels=262144`). */
export async function smallReference(png, pixels) {
  const meta = await sharp(png).metadata();
  const area = (meta.width || 1) * (meta.height || 1);
  if (area <= pixels) return png;
  const k = Math.sqrt(pixels / area);
  return sharp(png)
    .resize({ width: Math.max(16, Math.floor(meta.width * k)), height: Math.max(16, Math.floor(meta.height * k)) })
    .png()
    .toBuffer();
}

// ── the check ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** What the check reads: the shot in words, and the cards it should see (each by a short name). */
/** The short names of the cards the check should find in a shot's frame. */
export const expectedRefs = (shot, cards, byId) => shownCards(shot, cards).map((c) => byId.get(c.id));

export function checkVariables(shot, cards, byId) {
  const expected = shownCards(shot, cards);
  return {
    shot: [sizeWords(shot.size), sentence(shot.action)].filter(Boolean).join(" ") || "A film shot.",
    expected: expected.length ? expected.map((c) => JSON.stringify({ card: byId.get(c.id), kind: c.kind, looks: c.description || c.name })).join("\n") : "(nothing in particular)",
  };
}

export function checkSchema(refs) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["cards", "extraPeople", "lettering", "faults", "match", "note"],
    properties: {
      cards: refs.length
        ? {
            type: "array",
            maxItems: refs.length,
            items: { type: "object", additionalProperties: false, required: ["card", "visible"], properties: { card: { enum: refs }, visible: { type: "boolean" } } },
          }
        : { type: "array", maxItems: 0 },
      extraPeople: { type: "integer", minimum: 0, maximum: 30 },
      lettering: { type: "boolean" },
      faults: { type: "array", maxItems: FAULTS.length, items: { enum: [...FAULTS] } },
      match: { type: "integer", minimum: 0, maximum: 10 },
      note: { type: "string" },
    },
  };
}

/**
 * The check's answer as a verdict and a score (higher is better): its 0–10 match, less 3 for each expected card it
 * didn't see, 2 for each person who shouldn't be there (at most three counted), 2 for lettering and 1.5 for each
 * fault. A card the answer doesn't mention counts as not seen.
 */
export function scoreOf(answer, expectedRefs) {
  const seen = new Map((Array.isArray(answer?.cards) ? answer.cards : []).map((c) => [c?.card, c?.visible === true]));
  const missing = expectedRefs.filter((r) => !seen.get(r));
  const extra = Math.max(0, Math.min(30, Math.round(Number(answer?.extraPeople) || 0)));
  const lettering = answer?.lettering === true;
  const faults = (Array.isArray(answer?.faults) ? answer.faults : []).filter((f) => FAULTS.includes(f));
  const match = Math.max(0, Math.min(10, Math.round(Number(answer?.match) || 0)));
  const score = match - 3 * missing.length - 2 * Math.min(extra, 3) - (lettering ? 2 : 0) - 1.5 * faults.length;
  return { score, verdict: { match, missing, extraPeople: extra, lettering, faults, note: String(answer?.note ?? "").slice(0, 300) } };
}

/** A frame as the check sees it: at most 1024 px on its long side (the vision model's own scale), a data URL. */
export async function checkImage(png) {
  const small = await sharp(png).resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true }).png().toBuffer();
  return `data:image/png;base64,${small.toString("base64")}`;
}
