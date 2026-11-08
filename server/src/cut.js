// SPDX-License-Identifier: MIT
// The film's cut, joined into one MP4 by the kit's FFmpeg (runFfmpeg) — in two steps, so one odd clip never breaks the
// whole join: each shot's chosen clip made into an even piece (its trims, the film's size and frame rate, its sound —
// the line's own voice when it has one, else the clip's), then the pieces joined in order with each shot's transition
// (a cut, a dissolve, a fade through black) and the music and effects laid over at their start times and volumes.
// What a person edits is the shots' order, trims and transitions and the sounds' places (the Cut tab); a full editing
// suite is out of scope (the PRD), so the MP4 can go on to one.

/** The length of the dissolve or fade between two shots, in seconds. */
export const TRANSITION_SECONDS = 0.5;

/** One shot's piece: `clip` the clip's file, `line` the line's WAV or null, `trimIn`/`trimOut` seconds off each end,
 *  `seconds` the clip's length → FFmpeg's arguments to write `out`, and the piece's length. */
export function pieceArgs({ clip, line, seconds, trimIn = 0, trimOut = 0 }, { width, height, fps }, out) {
  const length = Math.max(0.5, seconds - trimIn - trimOut);
  const args = ["-v", "error", "-y", "-ss", trimIn.toFixed(3), "-t", length.toFixed(3), "-i", clip];
  // the line's voice from the shot's start, held to the piece's length; else the clip's own sound
  if (line) args.push("-i", line);
  const vf = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=${fps},format=yuv420p,setsar=1`;
  const af = `aresample=48000,aformat=channel_layouts=stereo,apad,atrim=0:${length.toFixed(3)}`;
  args.push("-filter_complex", `[0:v]${vf}[v];[${line ? 1 : 0}:a]${af}[a]`, "-map", "[v]", "-map", "[a]");
  args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out);
  return { args, length };
}

/** The same piece with silence for sound (a clip that has none). */
export function silentPieceArgs(piece, size, out) {
  const { args, length } = pieceArgs({ ...piece, line: null }, size, out);
  const at = args.indexOf("-filter_complex");
  const withSilence = [...args.slice(0, at), "-f", "lavfi", "-t", length.toFixed(3), "-i", "anullsrc=r=48000:cl=stereo"];
  return {
    args: [...withSilence, "-filter_complex", args[at + 1].replace(/\[0:a\]/, "[1:a]"), ...args.slice(at + 2)],
    length,
  };
}

/**
 * The join: `pieces` `[{file, length, transition}]` in order (a piece's `transition` is how it goes into the next),
 * `sounds` `[{file, start, volume, seconds, fadeIn, fadeOut}]` laid over → FFmpeg's arguments to write `out`, and the
 * film's length. A sound fades out before it stops being heard: its own end, or the film's when that comes first.
 */
export function joinArgs(pieces, sounds, out) {
  const args = ["-v", "error", "-y"];
  for (const p of pieces) args.push("-i", p.file);
  for (const s of sounds) args.push("-i", s.file);
  const graph = [];
  let v = "[0:v]";
  let a = "[0:a]";
  let length = pieces[0].length;
  for (let i = 1; i < pieces.length; i++) {
    const how = pieces[i - 1].transition;
    const d = Math.min(TRANSITION_SECONDS, pieces[i - 1].length / 2, pieces[i].length / 2);
    if (how === "cut" || d <= 0) {
      graph.push(`${v}${a}[${i}:v][${i}:a]concat=n=2:v=1:a=1[v${i}][a${i}]`);
      length += pieces[i].length;
    } else {
      const kind = how === "fade" ? "fadeblack" : "fade";
      graph.push(`${v}[${i}:v]xfade=transition=${kind}:duration=${d.toFixed(3)}:offset=${(length - d).toFixed(3)}[v${i}]`);
      graph.push(`${a}[${i}:a]acrossfade=d=${d.toFixed(3)}[a${i}]`);
      length += pieces[i].length - d;
    }
    v = `[v${i}]`;
    a = `[a${i}]`;
  }
  // the music and effects over the film's own sound, each from its start, at its volume, with its fades
  if (sounds.length) {
    const mixed = [a];
    sounds.forEach((s, k) => {
      const start = Math.max(0, s.start);
      const at = Math.round(start * 1000);
      const heard = Math.max(0, Math.min(Number(s.seconds) || Number.POSITIVE_INFINITY, length - start));
      const chain = ["aresample=48000", "aformat=channel_layouts=stereo", `volume=${Math.max(0, Math.min(1, s.volume)).toFixed(3)}`];
      const fadeIn = Math.min(Math.max(0, Number(s.fadeIn) || 0), heard);
      const fadeOut = Math.min(Math.max(0, Number(s.fadeOut) || 0), heard);
      if (fadeIn > 0) chain.push(`afade=t=in:st=0:d=${fadeIn.toFixed(3)}`);
      if (fadeOut > 0) chain.push(`afade=t=out:st=${(heard - fadeOut).toFixed(3)}:d=${fadeOut.toFixed(3)}`);
      chain.push(`adelay=${at}|${at}`);
      graph.push(`[${pieces.length + k}:a]${chain.join(",")}[s${k}]`);
      mixed.push(`[s${k}]`);
    });
    graph.push(`${mixed.join("")}amix=inputs=${mixed.length}:duration=first:normalize=0[mix]`);
    a = "[mix]";
  }
  if (graph.length) args.push("-filter_complex", graph.join(";"));
  // an input's own stream is named as one (0:v), a filter's output by its label ([v2])
  const map = (label) => (/^\[\d+:[av]\]$/.test(label) ? label.slice(1, -1) : label);
  args.push("-map", map(v), "-map", map(a));
  args.push("-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out);
  return { args, length };
}
