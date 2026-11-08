<script setup>
// SPDX-License-Identifier: MIT
// A film's Cut tab — the film as it will play: its shots in order on a simple timeline, each with its chosen clip, the
// trims off each end and how it goes into the next (a cut, a dissolve, a fade through black); the music and sound
// effects laid over it at a start time and a volume, each made from words (a server job); and Export the film, which
// joins it all into one MP4 (the kit's FFmpeg), played here and saved where the user picks. A shot with no clip yet is
// left out of the film, and says so. The PRD keeps a full editing suite out of scope: the MP4 can go on to one.
import { canSaveNatively, confirmDialog, EmptyState, get, Icon, LuEngineNeeded, pushToast, relativeTime, reportError, serverUrl, UiButton, UiField, UiInput, UiNumber, UiSegmented, UiSelect, UiServerImage, UiSlider, UiTag } from "@delebash/ui";
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useFilmsStore } from "../../stores/films.js";

const emit = defineEmits(["go"]);
const { t } = useI18n();
const films = useFilmsStore();

// the length of a dissolve or a fade between two shots (the server's cut.js TRANSITION_SECONDS)
const TRANSITION_SECONDS = 0.5;
// the shortest a trimmed piece can be (the server's cut_api.js holds a trim to this)
const SHORTEST = 0.5;

const ratio = computed(() => films.film.width / films.film.height);
// the shot editor's own words for them
const TRANSITIONS = computed(() => ["cut", "dissolve", "fade"].map((v) => ({ value: v, label: t(`shots.transitions.${v}`) })));

/** A shot's piece of the film: its clip's length less its trims — null without a clip. */
function pieceOf(s) {
  if (!s.clipId || !s.clipSeconds) return null;
  const trimIn = Math.min(s.trimIn, s.clipSeconds - SHORTEST);
  const trimOut = Math.min(s.trimOut, Math.max(0, s.clipSeconds - trimIn - SHORTEST));
  return Math.max(SHORTEST, s.clipSeconds - trimIn - trimOut);
}
const inFilm = computed(() => films.shots.filter((s) => pieceOf(s) !== null));
/** Where each shot in the film starts and how long it plays (a dissolve or a fade overlaps the one before). */
const layout = computed(() => {
  const out = [];
  let at = 0;
  inFilm.value.forEach((s, i) => {
    const length = pieceOf(s);
    if (i > 0) {
      const before = inFilm.value[i - 1];
      const d = before.transition === "cut" ? 0 : Math.min(TRANSITION_SECONDS, out[i - 1].length / 2, length / 2);
      at = out[i - 1].start + out[i - 1].length - d;
    }
    out.push({ shot: s, start: at, length });
  });
  return out;
});
const total = computed(() => {
  const last = layout.value.at(-1);
  return last ? last.start + last.length : 0;
});
const seconds = (n) => Math.round(n * 10) / 10;
const pct = (n) => `${total.value ? (100 * n) / total.value : 0}%`;
const numberOf = (s) => films.shots.findIndex((x) => x.id === s.id) + 1;

// ── the shots' trims and transitions, saved once the typing pauses ──
const timers = new Map();
function later(key, fn) {
  clearTimeout(timers.get(key));
  timers.set(
    key,
    setTimeout(async () => {
      timers.delete(key);
      try {
        await fn();
      } catch (e) {
        reportError(e);
      }
    }, 400),
  );
}
onBeforeUnmount(() => {
  for (const timer of timers.values()) clearTimeout(timer);
});
const shotNow = (s) => films.shots.find((x) => x.id === s.id) ?? s;
function setTrim(s, side, value) {
  if (value == null || !Number.isFinite(Number(value))) return;
  later(`${s.id}:${side}`, () => films.saveShot(shotNow(s), { [side]: Math.max(0, Number(value)) }));
}
async function setTransition(s, transition) {
  try {
    await films.saveShot(shotNow(s), { transition });
  } catch (e) {
    reportError(e);
  }
}
async function move(s, by) {
  try {
    await films.moveShot(shotNow(s), by);
  } catch (e) {
    reportError(e);
  }
}

// ── music and sound effects ──
const form = reactive({ kind: "music", prompt: "", seconds: null, start: 0 });
const KINDS = computed(() => [
  { value: "music", label: t("cut.sounds.kinds.music") },
  { value: "effect", label: t("cut.sounds.kinds.effect") },
]);
const feature = computed(() => (form.kind === "music" ? "sounds.music" : "sounds.effect"));
// the model a sound is made with, and its licence (the feature's readiness names them)
const madeWith = ref(null);
async function readModel() {
  try {
    const r = await get(`/v1/ai/features/${encodeURIComponent(feature.value)}/readiness`);
    madeWith.value = r.modelState ? { name: r.modelState.name || r.model, license: r.modelState.license || "" } : null;
  } catch {
    madeWith.value = null;
  }
}
watch(feature, readModel);
onMounted(readModel);

async function makeSound() {
  const input = { kind: form.kind, prompt: form.prompt.trim(), start: Math.max(0, Number(form.start) || 0) };
  if (form.seconds) input.seconds = Number(form.seconds);
  try {
    const made = await films.makeSound(input, t(form.kind === "music" ? "cut.sounds.musicTask" : "cut.sounds.effectTask", { title: films.film.title }));
    if (made) {
      pushToast({ kind: "success", title: t(form.kind === "music" ? "cut.sounds.musicDone" : "cut.sounds.effectDone", { s: seconds(made.seconds) }) });
      form.prompt = "";
    }
  } catch (e) {
    if (e?.name !== "AbortError") reportError(e);
  }
}
function setStart(sound, value) {
  if (value == null || !Number.isFinite(Number(value))) return;
  later(`${sound.id}:start`, () => films.saveSound(sound, { start: Math.max(0, Number(value)) }));
}
// a volume while its slider is dragged: saved when it is let go
const dragged = reactive({});
async function setVolume(sound, volume) {
  try {
    await films.saveSound(sound, { volume: Number(volume) });
  } catch (e) {
    reportError(e);
  } finally {
    delete dragged[sound.id];
  }
}
async function removeSound(sound) {
  const yes = await confirmDialog({ title: t("cut.sounds.delete.title"), message: t("cut.sounds.delete.message", { what: sound.prompt }), confirmLabel: t("cut.sounds.delete.confirm"), danger: true });
  if (!yes) return;
  try {
    await films.deleteSound(sound);
  } catch (e) {
    reportError(e);
  }
}

// ── the export ──
onMounted(() => films.loadExport().catch(reportError));
async function exportFilm() {
  try {
    const r = await films.exportFilm(t("cut.export.task", { title: films.film.title }));
    if (r) pushToast({ kind: "success", title: t("cut.export.done", { s: seconds(r.seconds), n: r.shots }), description: r.skipped ? t("cut.export.skipped", { n: r.skipped }) : undefined });
  } catch (e) {
    if (e?.name !== "AbortError") reportError(e);
  }
}
async function saveExport() {
  try {
    const r = await films.saveExport({ title: t("cut.export.saveTitle"), filterName: t("cut.export.fileKind") });
    if (r?.ok) pushToast({ kind: "success", title: r.path ? t("cut.export.saved", { path: r.path }) : t("cut.export.downloaded") });
  } catch (e) {
    reportError(e);
  }
}
const saveLabel = computed(() => (canSaveNatively() ? t("cut.export.save") : t("cut.export.download")));
</script>

<template>
  <div class="cut-panel">
    <EmptyState
      v-if="!films.shots.length" icon="Film" :title="t('cut.empty.title')" :message="t('cut.empty.message')"
      :action-label="t('cut.empty.toShots')" @action="emit('go', 'shots')"
    />
    <template v-else>
      <div class="cut-panel__tools">
        <UiButton
          intent="primary" focusable-when-disabled :disabled="films.exporting || !inFilm.length"
          :label="films.exporting ? t('cut.export.running') : t('cut.export.button')" :title="inFilm.length ? t('cut.export.hint') : t('cut.export.needsClips')" @click="exportFilm"
        >
          <template #icon><Icon name="Export" :size="14" /></template>
        </UiButton>
        <span class="muted">{{ t("cut.total", { n: inFilm.length, of: films.shots.length, s: seconds(total) }) }}</span>
      </div>

      <section v-if="films.exported" class="cut-export" :aria-label="t('cut.export.label')">
        <video class="cut-export__video" controls preload="metadata" crossorigin="anonymous" :src="serverUrl(films.exported.videoUrl)" :aria-label="t('cut.export.alt')" />
        <div class="cut-export__facts">
          <span class="muted">{{ t("cut.export.made", { when: relativeTime(films.exported.createdAt) }) }}</span>
          <UiButton intent="secondary" size="small" :label="saveLabel" @click="saveExport">
            <template #icon><Icon name="Download" :size="14" /></template>
          </UiButton>
        </div>
      </section>

      <div v-if="inFilm.length" class="cut-timeline" role="img" :aria-label="t('cut.timeline.label', { n: inFilm.length, s: seconds(total) })">
        <div class="cut-timeline__track">
          <span
            v-for="p in layout" :key="p.shot.id" class="cut-timeline__piece" :class="`cut-timeline__piece--${p.shot.transition}`"
            :style="{ left: pct(p.start), width: pct(p.length) }" :title="t('cut.timeline.piece', { n: numberOf(p.shot), s: seconds(p.length) })"
          >{{ numberOf(p.shot) }}</span>
        </div>
        <div v-if="films.laidSounds.length" class="cut-timeline__track cut-timeline__track--sounds">
          <span
            v-for="x in films.laidSounds" :key="x.id" class="cut-timeline__sound" :class="`cut-timeline__sound--${x.kind}`"
            :style="{ left: pct(Math.min(x.start, total)), width: pct(Math.max(0, Math.min(x.seconds, total - x.start))) }" :title="x.prompt"
          />
        </div>
      </div>

      <h2 class="cut-panel__heading">{{ t("cut.shotsHeading") }}</h2>
      <ol class="cut-list">
        <li v-for="(s, i) in films.shots" :key="s.id" class="cut-row" :class="{ 'cut-row--out': pieceOf(s) === null }">
          <span class="cut-row__n" aria-hidden="true">{{ i + 1 }}</span>
          <span class="cut-row__frame">
            <UiServerImage v-if="s.frameId" :path="`/v1/frames/${s.frameId}/picture`" :ratio="ratio" fit="cover" :alt="t('frames.alt', { n: i + 1 })" />
            <span v-else class="cut-row__noframe" :style="{ aspectRatio: ratio }"><Icon name="Image" :size="16" /></span>
          </span>
          <div class="cut-row__body">
            <p class="cut-row__action">{{ s.action || t("shots.noAction") }}</p>
            <p v-if="pieceOf(s) !== null" class="muted cut-row__facts">{{ t("cut.plays", { s: seconds(pieceOf(s)), of: seconds(s.clipSeconds) }) }}</p>
            <p v-else class="cut-row__facts">
              <UiTag intent="secondary" :value="t('cut.noClip')" />
              <UiButton intent="ghost" size="small" :label="t('cut.toShots')" @click="emit('go', 'shots')" />
            </p>
          </div>
          <div v-if="pieceOf(s) !== null" class="cut-row__edit">
            <UiField :label="t('cut.trimIn')" layout="block" :for="`trim-in-${s.id}`">
              <UiNumber :id="`trim-in-${s.id}`" :model-value="s.trimIn" :min="0" :max="Math.max(0, s.clipSeconds - SHORTEST)" :step="0.1" width="num" @update:model-value="(v) => setTrim(s, 'trimIn', v)" />
            </UiField>
            <UiField :label="t('cut.trimOut')" layout="block" :for="`trim-out-${s.id}`">
              <UiNumber :id="`trim-out-${s.id}`" :model-value="s.trimOut" :min="0" :max="Math.max(0, s.clipSeconds - SHORTEST)" :step="0.1" width="num" @update:model-value="(v) => setTrim(s, 'trimOut', v)" />
            </UiField>
            <UiField v-if="i < films.shots.length - 1" :label="t('shots.fields.transition')" layout="block" :for="`transition-${s.id}`">
              <UiSelect :id="`transition-${s.id}`" :model-value="s.transition" :options="TRANSITIONS" width="fit" @update:model-value="(v) => setTransition(s, v)" />
            </UiField>
          </div>
          <div class="cut-row__move">
            <UiButton intent="ghost" size="icon" :disabled="i === 0" :aria-label="t('shots.moveUp', { n: i + 1 })" :title="t('shots.moveUp', { n: i + 1 })" @click="move(s, -1)">
              <template #icon><Icon name="ArrowUp" :size="14" /></template>
            </UiButton>
            <UiButton intent="ghost" size="icon" :disabled="i === films.shots.length - 1" :aria-label="t('shots.moveDown', { n: i + 1 })" :title="t('shots.moveDown', { n: i + 1 })" @click="move(s, 1)">
              <template #icon><Icon name="ArrowDown" :size="14" /></template>
            </UiButton>
          </div>
        </li>
      </ol>

      <h2 class="cut-panel__heading">{{ t("cut.sounds.heading") }}</h2>
      <p class="hint cut-panel__lede">{{ t("cut.sounds.lede") }}</p>
      <LuEngineNeeded :key="feature" :feature="feature" :label="form.kind === 'music' ? t('cut.sounds.musicFeature') : t('cut.sounds.effectFeature')" />
      <form class="cut-sound-form" @submit.prevent="makeSound">
        <UiSegmented v-model="form.kind" :options="KINDS" :aria-label="t('cut.sounds.kind')" />
        <UiField class="cut-sound-form__prompt" :label="t('cut.sounds.prompt')" layout="block" for="sound-prompt">
          <UiInput id="sound-prompt" v-model="form.prompt" width="prose" :placeholder="form.kind === 'music' ? t('cut.sounds.musicPlaceholder') : t('cut.sounds.effectPlaceholder')" />
        </UiField>
        <UiField :label="t('cut.sounds.seconds')" layout="block" for="sound-seconds">
          <UiNumber id="sound-seconds" v-model="form.seconds" :min="1" :max="60" :step="1" width="num" :placeholder="t('cut.sounds.secondsDefault')" />
        </UiField>
        <UiField :label="t('cut.sounds.start')" layout="block" for="sound-start">
          <UiNumber id="sound-start" v-model="form.start" :min="0" :step="0.5" width="num" />
        </UiField>
        <UiButton type="submit" intent="primary" focusable-when-disabled :disabled="!form.prompt.trim()" :label="films.makingSounds ? t('cut.sounds.makingMore') : t('cut.sounds.make')">
          <template #icon><Icon name="Waveform" :size="14" /></template>
        </UiButton>
      </form>
      <p v-if="madeWith" class="hint">{{ t("cut.sounds.madeWith", { model: madeWith.name }) }}<template v-if="madeWith.license"> · {{ madeWith.license }}</template></p>

      <EmptyState v-if="!films.laidSounds.length" compact icon="Waveform" :message="t('cut.sounds.none')" />
      <ul v-else class="cut-sounds" role="list">
        <li v-for="x in films.laidSounds" :key="x.id" class="cut-sound">
          <UiTag :intent="x.kind === 'music' ? 'info' : 'accent2'" :value="t(`cut.sounds.kinds.${x.kind}`)" />
          <div class="cut-sound__body">
            <p class="cut-sound__prompt">{{ x.prompt }}</p>
            <audio controls preload="none" crossorigin="anonymous" :src="serverUrl(x.audioUrl)" :aria-label="t('cut.sounds.play', { what: x.prompt })" />
          </div>
          <UiField :label="t('cut.sounds.start')" layout="block" :for="`start-${x.id}`">
            <UiNumber :id="`start-${x.id}`" :model-value="x.start" :min="0" :step="0.5" width="num" @update:model-value="(v) => setStart(x, v)" />
          </UiField>
          <UiField :label="t('cut.sounds.volume')" layout="block" :for="`volume-${x.id}`">
            <UiSlider
              :id="`volume-${x.id}`" :model-value="dragged[x.id] ?? x.volume" :min="0" :max="1" :step="0.05" width="short"
              @update:model-value="(v) => (dragged[x.id] = v)" @change="(v) => setVolume(x, v)"
            />
          </UiField>
          <span class="muted">{{ t("cut.sounds.length", { s: seconds(x.seconds) }) }}</span>
          <UiButton intent="ghost" size="icon" :aria-label="t('cut.sounds.delete.action', { what: x.prompt })" :title="t('cut.sounds.delete.action', { what: x.prompt })" @click="removeSound(x)">
            <template #icon><Icon name="Trash" :size="14" /></template>
          </UiButton>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.cut-panel { display: flex; flex-direction: column; gap: 14px; }
.cut-panel__tools { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.cut-panel__heading { font-size: 15px; margin: 10px 0 0; }
.cut-panel__lede { margin: -8px 0 0; }
.cut-export { display: flex; flex-direction: column; gap: 6px; max-width: 720px; }
.cut-export__video { width: 100%; border-radius: 8px; background: #000; }
.cut-export__facts { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.cut-timeline { display: flex; flex-direction: column; gap: 4px; max-width: 980px; }
.cut-timeline__track { position: relative; height: 28px; background: var(--surface-2); border-radius: 6px; overflow: hidden; }
.cut-timeline__track--sounds { height: 12px; }
.cut-timeline__piece {
  position: absolute; top: 0; bottom: 0; display: grid; place-items: center; font-size: 12px; font-weight: 600;
  background: var(--accent); color: var(--accent-ink, #fff); border-right: 2px solid var(--surface); box-sizing: border-box;
}
.cut-timeline__piece:nth-child(even) { filter: brightness(0.85); }
.cut-timeline__sound { position: absolute; top: 2px; bottom: 2px; border-radius: 3px; background: var(--muted); opacity: 0.7; }
.cut-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; max-width: 980px; }
.cut-row { display: flex; gap: 12px; align-items: flex-start; border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; background: var(--surface); }
.cut-row--out { opacity: 0.75; }
.cut-row__n { font-weight: 700; min-width: 24px; color: var(--muted); padding-top: 1px; }
.cut-row__frame { width: 120px; flex: 0 0 120px; border-radius: 6px; overflow: hidden; }
.cut-row__noframe { display: grid; place-items: center; width: 100%; background: var(--surface-2); color: var(--muted); }
.cut-row__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.cut-row__action { margin: 0; overflow-wrap: anywhere; }
.cut-row__facts { margin: 0; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; font-size: 12.5px; }
.cut-row__edit { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; }
.cut-row__move { display: flex; gap: 2px; }
.cut-sound-form { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; max-width: 980px; }
/* a description is prose: about 60 characters wide, never squeezed by the row */
.cut-sound-form__prompt { flex: 0 1 60ch; min-width: min(60ch, 100%); }
.cut-sounds { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; max-width: 980px; }
.cut-sound { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; background: var(--surface); }
.cut-sound__body { flex: 1; min-width: 220px; display: flex; flex-direction: column; gap: 4px; }
.cut-sound__prompt { margin: 0; overflow-wrap: anywhere; }
.cut-sound__body audio { height: 32px; width: 280px; max-width: 100%; }
</style>
