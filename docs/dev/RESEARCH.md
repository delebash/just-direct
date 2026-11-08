<!-- SPDX-License-Identifier: MIT -->
# Research register — what we already know, and where the proof is

**Read the section for your subject before researching anything** — before reading code to answer
a question, before measuring, before briefing an agent. Then look in `docs/plans` for anything
newer. The shared stack's facts (the kit, llama.cpp, Quasar, Electron, the memory arbiter) are in
[the kit's register](../../../just-core/docs/dev/RESEARCH.md); this one holds the app's own subjects.

## The rule (family-wide, decided 2026-10-04)

The user: *"why do we keep re researching stuff, we need a primary research doc that we point to so
we dont keep duplicating or forgeting what we have done in the past"* — approved "your rec on all
go". The kit's register carries the rule in full; in short:

- **Before research:** read the subject's section here and look in `docs/plans`. An agent's brief
  carries that section and the line *"don't re-derive these; re-check one only if the code it cites
  changed after its date"*.
- **After research:** its facts land here in the same change. A research doc with no entry here is
  not done. The family guard (check 15) fails any `docs/plans/YYYY-MM-DD-*.md` dated 2026-10-04 or
  later that this page does not link, and any link here that points nowhere.
- One fact per bullet, then *how it was checked and when* (measured · code · web · git · record ·
  agent), then where the proof is. A fact that turns out wrong is rewritten, ending "(was: … until
  <date>)".

## Subjects

### Everything proven before the app (the kit's register)

JustDirect's research was done before the app existed and lives in the kit's `docs/plans/`: the feasibility record
(`2026-10-24-just-direct-feasibility.md` — §J the proof list, §J.4 the list per machine), the action and movie-shot
research (`2026-10-31-just-direct-research-action.md`), the handoff (`2026-10-31-just-direct-handoff.md`), the
motion-track spec (`2026-11-06-motion-tracks-spec.md`) and the six research files of 2026-10-30 (consistency, talking,
long takes, scene, images, planner and audio). The kit's own register holds the engine facts (§11 sd.cpp video, §12
audio.cpp, §13 FFmpeg). Read those before researching anything here.

### The v1 plan

- [docs/plans/2026-11-07-v1.md](../plans/2026-11-07-v1.md) — how v1 is built: its standards table, the two kit
  changes it needs, its decisions with their attacks, its milestones (record, 2026-11-07).
