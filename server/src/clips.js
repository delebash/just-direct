// SPDX-License-Identifier: MIT
// A shot's clip — LTX-2.3 on the kit's sd.cpp runtime (runVideoFeature), the recipes proven on an 8 GB card (the kit's
// feasibility record §J.3, the action research §3.11–§3.16):
//   - one pass at the film's size, 8 distilled steps — the default (the user's third review: "one pass is the default");
//   - a long take past 5 s: half size, then LTX's x2 upscaler and a short refine (3 steps) — up to 13 s at 720p;
//   - talking: one pass with the line's voice as the driving track (audio-to-video), the mouth drawn to it;
//   - drawn paths: the Motion Track LoRA with the kit's motion-track frames (cars, blades, creatures, the camera);
//   - a guide video: the Union Control LoRA with the video's frames (depth, pose or edges from a 3D tool).
// Every one starts from the shot's chosen first frame when it has one.

import { drawMotionTracks, sampleTrack } from "@delebash/core/runner/motion_tracks";
import sharp from "sharp";
import { SIZES } from "./schemas/shots.js";

/** LTX takes 8n+1 frames: the nearest to `seconds` at `fps`, at least 9. */
export const frameCount = (seconds, fps) => Math.max(9, 8 * Math.round((seconds * fps) / 8) + 1);

/** The longest one-pass clip (in frames) that fits an 8 GB card at 720p: 121 (5 s at 24 fps — feasibility §J.3). */
export const ONE_PASS_MAX_FRAMES = 121;

/** How a shot's clip is made: its own mode, else the app's pick — a long take past what one pass holds, otherwise one
 *  pass (a talking shot is one pass with its voice when it has a line spoken and its voice made). */
export function modeOf(shot, frames) {
  if (shot.mode && shot.mode !== "auto") return shot.mode;
  return frames > ONE_PASS_MAX_FRAMES ? "long" : "one";
}

const sentence = (s) => {
  const t = String(s ?? "").trim();
  return t && !/[.!?]$/.test(t) ? `${t}.` : t;
};

/**
 * The words a clip is made from: the template (Settings) with {action}, {camera} ("The camera …"), {cards} (each card
 * the shot shows, by name and look), {line} (who says what — LTX speaks it, or follows the voice it is given) and
 * {look}. The action research found the video model follows a move it is told in words, and places its people by
 * their looks; a look card is the film's style.
 */
export function clipPrompt(template, shot, cards, film) {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const shown = [...new Set([...shot.cardIds, shot.placeId, shot.line ? shot.speakerId : null].filter(Boolean))].map((id) => byId.get(id)).filter((c) => c && c.kind !== "look");
  const looks = shot.cardIds.map((id) => byId.get(id)).filter((c) => c?.kind === "look");
  const speaker = shot.speakerId ? byId.get(shot.speakerId)?.name : "";
  const fill = {
    action: sentence(shot.action),
    camera: shot.camera ? sentence(`The camera: ${shot.camera}`) : "",
    size: SIZES.includes(shot.size) ? `A ${shot.size} shot.` : "",
    cards: shown.map((c) => sentence(c.description ? `${c.name}: ${c.description}` : c.name)).join(" "),
    line: shot.line ? `${speaker || "Someone"} says: "${String(shot.line).trim()}"` : "",
    look: [film.look, ...looks.map((c) => c.description || c.name)].map(sentence).filter(Boolean).join(" "),
  };
  return String(template)
    .replace(/\{(action|camera|size|cards|line|look)\}/g, (_, k) => fill[k])
    .replace(/\s+\./g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** A shot's drawn paths as the Motion Track LoRA's guide frames (PNG Buffers, `frames` of them at `width`×`height`):
 *  each track's control points (0..1 of the frame) spread over the clip's frames by the kit's sampling. */
export async function pathFrames(paths, { frames, width, height }) {
  const tracks = paths.filter((t) => t.length).map((t) => sampleTrack(t.map((p) => ({ x: p.x * (width - 1), y: p.y * (height - 1) })), frames));
  const drawn = drawMotionTracks({ tracks, width, height });
  const out = [];
  for (const raw of drawn.frames) out.push(await sharp(raw, { raw: { width: drawn.width, height: drawn.height, channels: 3 } }).png().toBuffer());
  return out;
}

/** A guide video's frames fitted to the clip: as many as it has frames (the last held, or the rest cut). */
export function fitGuide(frames, count) {
  if (!frames.length) return [];
  return Array.from({ length: count }, (_, i) => frames[Math.min(i, frames.length - 1)]);
}

/** A WAV's length in seconds (its header's byte rate and data size), or 0 when it isn't one. */
export function wavSeconds(buf) {
  try {
    if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") return 0;
    let at = 12;
    let byteRate = 0;
    while (at + 8 <= buf.length) {
      const id = buf.toString("ascii", at, at + 4);
      const size = buf.readUInt32LE(at + 4);
      if (id === "fmt ") byteRate = buf.readUInt32LE(at + 16);
      if (id === "data") return byteRate ? Math.min(size, buf.length - at - 8) / byteRate : 0;
      at += 8 + size + (size % 2);
    }
  } catch {
    // not a WAV
  }
  return 0;
}

/** Half of a side, on the 64 grid LTX takes (a long take's first stage). */
export const half = (side) => Math.max(64, Math.round(side / 2 / 64) * 64);

/** The long take's second stage: LTX's x2 upscaler at the film's size, 3 refine steps on the distilled model's last
 *  timesteps (the handoff's long-take recipe, `--hires-steps 3 --hires-sigmas 0.909375,0.725,0.421875,0.0`). */
export const LONG_TAKE_HIRES = Object.freeze({ steps: 3, sigmas: Object.freeze([0.909375, 0.725, 0.421875, 0.0]) });
