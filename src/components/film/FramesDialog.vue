<script setup>
// SPDX-License-Identifier: MIT
// A shot's first frames side by side — each with what the vision check said of it (its score, who it missed, anyone
// who shouldn't be there, lettering, faults, its note) — to choose another by hand, delete one, or paint more. The
// chosen one is what the shot's clip starts from.
import { AppModal, confirmDialog, EmptyState, Icon, reportError, UiButton, UiServerImage, UiTag } from "@delebash/ui";
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useFilmsStore } from "../../stores/films.js";

const props = defineProps({ shot: { type: Object, required: true } });
const emit = defineEmits(["close"]);
const { t } = useI18n();
const films = useFilmsStore();

const items = ref([]);
const loaded = ref(false);
const modal = ref(null);
// the shot as the store has it now (its chosen frame changes here)
const current = computed(() => films.shots.find((s) => s.id === props.shot.id) ?? props.shot);
const n = computed(() => films.shots.findIndex((s) => s.id === props.shot.id) + 1);
const ratio = computed(() => films.film.width / films.film.height);

async function load() {
  try {
    items.value = await films.framesOf(props.shot);
    loaded.value = true;
  } catch (e) {
    reportError(e);
  }
}
onMounted(load);

const missingNames = (f) => (f.verdict?.missing ?? []).length;

async function choose(f) {
  try {
    await films.chooseFrame(current.value, f.id);
  } catch (e) {
    reportError(e);
  }
}
async function remove(f) {
  const yes = await confirmDialog({ title: t("frames.delete.title"), message: t("frames.delete.message"), confirmLabel: t("frames.delete.confirm"), danger: true });
  if (!yes) return;
  try {
    await films.deleteFrame(f);
    await load();
  } catch (e) {
    reportError(e);
  }
}
async function more() {
  try {
    await films.paintFrames(current.value, t("frames.task", { n: n.value }));
    await load();
  } catch (e) {
    if (e?.name !== "AbortError") reportError(e);
  }
}
</script>

<template>
  <AppModal ref="modal" :title="t('frames.title', { n })" :lede="current.action" max-width="1100px" @close="emit('close')">
    <div class="frames-dialog">
      <div class="frames-dialog__tools">
        <UiButton intent="secondary" focusable-when-disabled :disabled="!!films.framing[shot.id]" :label="films.framing[shot.id] ? t('frames.painting') : t('frames.more')" @click="more">
          <template #icon><Icon name="Sparkle" :size="14" /></template>
        </UiButton>
      </div>
      <EmptyState v-if="loaded && !items.length" compact icon="Image" :message="t('frames.none')" />
      <ul v-else class="frames-grid" role="list">
        <li v-for="f in items" :key="f.id" class="frame-tile" :class="{ 'frame-tile--chosen': current.frameId === f.id }">
          <UiServerImage :path="f.pictureUrl" :ratio="ratio" fit="cover" :alt="t('frames.alt', { n })" />
          <div class="frame-tile__facts">
            <UiTag v-if="current.frameId === f.id" intent="success" :value="t('frames.chosen')" />
            <span v-if="f.score !== null" class="frame-tile__score">{{ t("frames.score", { s: Math.round(f.score * 10) / 10 }) }}</span>
            <span v-else class="muted">{{ t("frames.unchecked") }}</span>
          </div>
          <p v-if="f.verdict" class="frame-tile__note">
            <span v-if="missingNames(f)">{{ t("frames.missing", { n: missingNames(f) }) }} </span>
            <span v-if="f.verdict.extraPeople">{{ t("frames.extra", { n: f.verdict.extraPeople }) }} </span>
            <span v-if="f.verdict.lettering">{{ t("frames.lettering") }} </span>
            <span v-if="f.verdict.faults?.length">{{ f.verdict.faults.join(", ") }}. </span>
            <span class="muted">{{ f.verdict.note }}</span>
          </p>
          <div class="frame-tile__actions">
            <UiButton v-if="current.frameId !== f.id" intent="primary" size="small" :label="t('frames.use')" @click="choose(f)" />
            <UiButton intent="ghost" size="small" :label="t('frames.delete.action')" @click="remove(f)" />
          </div>
        </li>
      </ul>
    </div>
  </AppModal>
</template>

<style scoped>
.frames-dialog { display: flex; flex-direction: column; gap: 12px; }
.frames-grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
.frame-tile { display: flex; flex-direction: column; gap: 6px; border: 2px solid var(--border); border-radius: 8px; padding: 8px; }
.frame-tile--chosen { border-color: var(--accent); }
.frame-tile__facts { display: flex; gap: 8px; align-items: center; }
.frame-tile__score { font-weight: 600; }
.frame-tile__note { margin: 0; font-size: 12.5px; overflow-wrap: anywhere; }
.frame-tile__actions { display: flex; gap: 6px; }
</style>
