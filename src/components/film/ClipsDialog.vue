<script setup>
// SPDX-License-Identifier: MIT
// A shot's clip — how it is made (the app's pick; one pass; a long take; led by drawn paths; led by a guide video), the
// paths drawn over its first frame or its guide video added, Make clip (a server job), and its clips to watch, choose
// and delete. The chosen clip is the one in the film. A video plays from the server's address with the app's Origin
// (crossorigin="anonymous" — app-structure §19).
import { AppModal, confirmDialog, EmptyState, Icon, reportError, serverUrl, UiButton, UiField, UiSelect, UiTag } from "@delebash/ui";
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useFilmsStore } from "../../stores/films.js";
import PathsEditor from "./PathsEditor.vue";

const props = defineProps({ shot: { type: Object, required: true } });
const emit = defineEmits(["close"]);
const { t } = useI18n();
const films = useFilmsStore();

const items = ref([]);
const loaded = ref(false);
const busy = ref(false);
const picker = ref(null);
const current = computed(() => films.shots.find((s) => s.id === props.shot.id) ?? props.shot);
const n = computed(() => films.shots.findIndex((s) => s.id === props.shot.id) + 1);
const ratio = computed(() => films.film.width / films.film.height);
const MODES = computed(() => ["auto", "one", "long", "paths", "guide"].map((m) => ({ value: m, label: t(`clips.modes.${m}`), hint: t(`clips.modeHints.${m}`) })));

async function load() {
  try {
    items.value = await films.clipsOf(props.shot);
    loaded.value = true;
  } catch (e) {
    reportError(e);
  }
}
onMounted(load);

async function setMode(mode) {
  try {
    await films.saveShot(current.value, { mode });
  } catch (e) {
    reportError(e);
  }
}
let pathsTimer = null;
function setPaths(paths) {
  clearTimeout(pathsTimer);
  // saved once the drawing pauses
  pathsTimer = setTimeout(async () => {
    try {
      await films.saveShot(current.value, { paths });
    } catch (e) {
      reportError(e);
    }
  }, 400);
}
async function onGuide(file) {
  if (!file) return;
  busy.value = true;
  try {
    await films.uploadGuide(current.value, file);
  } catch (e) {
    reportError(e);
  } finally {
    busy.value = false;
  }
}
async function removeGuide() {
  try {
    await films.removeGuide(current.value);
  } catch (e) {
    reportError(e);
  }
}
async function make() {
  try {
    await films.makeClip(current.value, t("clips.task", { n: n.value }));
    await load();
  } catch (e) {
    if (e?.name !== "AbortError") reportError(e);
  }
}
async function choose(c) {
  try {
    await films.chooseClip(current.value, c.id);
  } catch (e) {
    reportError(e);
  }
}
async function remove(c) {
  const yes = await confirmDialog({ title: t("clips.delete.title"), message: t("clips.delete.message"), confirmLabel: t("clips.delete.confirm"), danger: true });
  if (!yes) return;
  try {
    await films.deleteClip(c);
    await load();
  } catch (e) {
    reportError(e);
  }
}
</script>

<template>
  <AppModal :title="t('clips.title', { n })" :lede="current.action" max-width="1100px" @close="emit('close')">
    <div class="clips-dialog">
      <div class="clips-dialog__how">
        <UiField :label="t('clips.how')" layout="block" for="clip-mode">
          <UiSelect id="clip-mode" :model-value="current.mode" :options="MODES" width="name" @update:model-value="setMode" />
        </UiField>
        <p class="hint">{{ t(`clips.modeHints.${current.mode}`) }}</p>
      </div>

      <PathsEditor
        v-if="current.mode === 'paths'" :model-value="current.paths" :ratio="ratio"
        :picture="current.frameId ? `/v1/frames/${current.frameId}/picture` : null" @update:model-value="setPaths"
      />
      <div v-if="current.mode === 'guide'" class="clips-dialog__guide">
        <span v-if="current.guideFrames" class="muted">{{ t("clips.guideHas", { n: current.guideFrames }) }}</span>
        <span v-else class="muted">{{ t("clips.guideNone") }}</span>
        <UiButton intent="secondary" size="small" :disabled="busy" :label="busy ? t('clips.guideReading') : t('clips.guideAdd')" @click="picker?.pickFiles()" />
        <UiButton v-if="current.guideFrames" intent="ghost" size="small" :label="t('clips.guideRemove')" @click="removeGuide" />
        <q-file ref="picker" class="clips-dialog__file" :model-value="null" accept="video/*" :aria-label="t('clips.guideAdd')" @update:model-value="onGuide" />
      </div>
      <p v-if="!current.frameId" class="hint">{{ t("clips.noFrame") }}</p>

      <div class="clips-dialog__tools">
        <UiButton intent="primary" focusable-when-disabled :disabled="!!films.clipping[shot.id] || films.clippingFilm" :label="films.clipping[shot.id] ? t('clips.making') : items.length ? t('clips.makeAnother') : t('clips.make')" @click="make">
          <template #icon><Icon name="Play" :size="14" /></template>
        </UiButton>
      </div>

      <EmptyState v-if="loaded && !items.length" compact icon="Camera" :message="t('clips.none')" />
      <ul v-else class="clips-grid" role="list">
        <li v-for="c in items" :key="c.id" class="clip-tile" :class="{ 'clip-tile--chosen': current.clipId === c.id }">
          <video class="clip-tile__video" controls preload="metadata" crossorigin="anonymous" :src="serverUrl(c.videoUrl)" :aria-label="t('clips.alt', { n })" />
          <div class="clip-tile__facts">
            <UiTag v-if="current.clipId === c.id" intent="success" :value="t('clips.chosen')" />
            <span class="muted">{{ t("clips.facts", { s: Math.round(c.seconds * 10) / 10, mode: t(`clips.modes.${c.recipe.mode || "one"}`) }) }}</span>
            <span v-if="c.recipe.talking" class="muted">· {{ t("clips.talking") }}</span>
          </div>
          <div class="clip-tile__actions">
            <UiButton v-if="current.clipId !== c.id" intent="primary" size="small" :label="t('clips.use')" @click="choose(c)" />
            <UiButton intent="ghost" size="small" :label="t('clips.delete.action')" @click="remove(c)" />
          </div>
        </li>
      </ul>
    </div>
  </AppModal>
</template>

<style scoped>
.clips-dialog { display: flex; flex-direction: column; gap: 12px; }
.clips-dialog__how .hint { margin: 4px 0 0; }
.clips-dialog__guide { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.clips-dialog__file { display: none; }
.clips-grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
.clip-tile { display: flex; flex-direction: column; gap: 6px; border: 2px solid var(--border); border-radius: 8px; padding: 8px; }
.clip-tile--chosen { border-color: var(--accent); }
.clip-tile__video { width: 100%; border-radius: 6px; background: #000; }
.clip-tile__facts { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.clip-tile__actions { display: flex; gap: 6px; }
</style>
