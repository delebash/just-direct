<script setup>
// SPDX-License-Identifier: MIT
// A film's Shots tab — its shots in film order. Plan the shots asks the AI to plan the film from its story (the cards it
// needs, then the shots — a server job on the AI tasks strip); planning again replaces the shots, so it asks first,
// naming what goes with them. Each shot is edited by hand in ShotDialog; after a hand edit the tab offers to carry the
// change into the later shots nobody changed by hand (the planner's revision), with a note in the user's own words.
import { confirmDialog, EmptyState, Icon, LuEngineNeeded, pushToast, reportError, UiBanner, UiButton, UiInput, UiServerImage, UiTag } from "@delebash/ui";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useFilmsStore } from "../../stores/films.js";
import FramesDialog from "./FramesDialog.vue";
import ShotDialog from "./ShotDialog.vue";

const emit = defineEmits(["go"]);
const { t } = useI18n();
const films = useFilmsStore();

// the shot being edited: false closed, null a new one, or the shot
const editing = ref(false);
// the shot changed by hand that can be carried forward, and the user's note on it
const changed = ref(null);
const note = ref("");
// the shot whose first frames are open
const framesOf = ref(null);
const ratio = computed(() => films.film.width / films.film.height);
const missingFrames = computed(() => films.shots.filter((s) => !s.frameId).length);

/** What a frames job's end says: how many were checked, or why the check didn't run. */
function framesDone(r) {
  if (!r) return;
  if (r.checkSkipped) pushToast({ kind: "warning", title: t("frames.checkSkipped"), description: r.checkSkipped });
}
async function paintFrames(shot) {
  try {
    framesDone(await films.paintFrames(shot, t("frames.task", { n: shot.position + 1 })));
  } catch (e) {
    if (e?.name !== "AbortError") reportError(e);
  }
}
async function paintAllFrames() {
  try {
    const r = await films.paintAllFrames(t("frames.allTask", { title: films.film.title }), { all: !missingFrames.value });
    framesDone(r);
    if (r) pushToast({ kind: "success", title: t("frames.allDone", { n: r.shots }) });
  } catch (e) {
    if (e?.name !== "AbortError") reportError(e);
  }
}

const nameOf = (id) => films.cardById(id)?.name ?? "";
const hasStory = computed(() => !!films.film?.story?.trim());
const laterUnedited = (shot) => films.shots.slice(shot.position + 1).some((s) => !s.edited);

async function plan() {
  let replace = false;
  if (films.shots.length) {
    const yes = await confirmDialog({
      title: t("shots.plan.againTitle"),
      message: t("shots.plan.againMessage", { n: films.shots.length }),
      confirmLabel: t("shots.plan.againConfirm"),
      danger: true,
    });
    if (!yes) return;
    replace = true;
  }
  try {
    const r = await films.plan(t("shots.plan.task", { title: films.film.title }), { replace });
    if (r) pushToast({ kind: "success", title: t("shots.plan.done", { shots: r.shots, cards: r.cardsAdded }) });
    changed.value = null;
  } catch (e) {
    if (e?.name !== "AbortError") reportError(e);
  }
}

function onSaved(shot, { created }) {
  if (!created && laterUnedited(films.shots.find((s) => s.id === shot.id) ?? shot)) {
    changed.value = shot;
    note.value = "";
  }
}

async function carry() {
  const shot = changed.value;
  try {
    const r = await films.carry(shot, note.value, t("shots.carry.task", { n: shot.position + 1 }));
    changed.value = null;
    if (r) pushToast({ kind: "success", title: r.changed.length ? t("shots.carry.done", { n: r.changed.length }) : t("shots.carry.none"), description: r.why || undefined });
  } catch (e) {
    if (e?.name !== "AbortError") reportError(e);
  }
}

async function remove(shot) {
  const yes = await confirmDialog({
    title: t("shots.delete.title"),
    message: t("shots.delete.message", { n: shot.position + 1 }),
    confirmLabel: t("shots.delete.confirm"),
    danger: true,
  });
  if (!yes) return;
  try {
    await films.removeShot(shot);
    if (changed.value?.id === shot.id) changed.value = null;
  } catch (e) {
    reportError(e);
  }
}

async function move(shot, by) {
  try {
    await films.moveShot(shot, by);
  } catch (e) {
    reportError(e);
  }
}
</script>

<template>
  <div class="shots-panel">
    <div class="shots-panel__tools">
      <UiButton
        :intent="films.shots.length ? 'secondary' : 'primary'" focusable-when-disabled :disabled="films.planning || !hasStory"
        :label="films.planning ? t('shots.plan.running') : films.shots.length ? t('shots.plan.again') : t('shots.plan.button')"
        :title="hasStory ? t('shots.plan.hint') : t('shots.plan.needsStory')" @click="plan"
      >
        <template #icon><Icon name="Sparkle" :size="14" /></template>
      </UiButton>
      <UiButton intent="secondary" :label="t('shots.add')" @click="editing = null">
        <template #icon><Icon name="Plus" :size="14" /></template>
      </UiButton>
      <UiButton
        v-if="films.shots.length" intent="secondary" focusable-when-disabled :disabled="films.framingFilm"
        :label="films.framingFilm ? t('frames.painting') : missingFrames ? t('frames.paintAll', { n: missingFrames }) : t('frames.paintAllAgain')"
        :title="t('frames.paintAllHint')" @click="paintAllFrames"
      >
        <template #icon><Icon name="Image" :size="14" /></template>
      </UiButton>
      <span v-if="films.shots.length" class="muted">{{ t("shots.total", { n: films.shots.length, s: films.shots.reduce((a, s) => a + s.seconds, 0) }) }}</span>
    </div>

    <LuEngineNeeded v-if="films.shots.length" feature="frames.paint" :label="t('frames.feature')" />

    <UiBanner v-if="changed" intent="info" class="shots-panel__carry">
      <span>{{ t("shots.carry.offer", { n: changed.position + 1 }) }}</span>
      <UiInput v-model="note" width="prose" :placeholder="t('shots.carry.notePlaceholder')" :aria-label="t('shots.carry.note')" />
      <template #action>
        <UiButton intent="primary" size="small" focusable-when-disabled :disabled="!!films.carrying" :label="films.carrying ? t('shots.carry.running') : t('shots.carry.button')" @click="carry" />
        <UiButton intent="ghost" size="small" :label="t('shots.carry.dismiss')" @click="changed = null" />
      </template>
    </UiBanner>

    <EmptyState
      v-if="!films.shots.length" icon="Camera"
      :title="t('shots.empty.title')" :message="hasStory ? t('shots.empty.message') : t('shots.empty.noStory')"
      :action-label="hasStory ? t('shots.plan.button') : t('shots.empty.writeStory')" @action="hasStory ? plan() : emit('go', 'story')"
    />
    <ol v-else class="shot-list">
      <li v-for="(s, i) in films.shots" :key="s.id" class="shot-row">
        <span class="shot-row__n" aria-hidden="true">{{ i + 1 }}</span>
        <button type="button" class="shot-row__frame" :aria-label="t('frames.open', { n: i + 1 })" @click="framesOf = s">
          <UiServerImage v-if="s.frameId" :path="`/v1/frames/${s.frameId}/picture`" :ratio="ratio" fit="cover" :alt="t('frames.alt', { n: i + 1 })" />
          <span v-else class="shot-row__noframe" :style="{ aspectRatio: ratio }"><Icon name="Image" :size="18" /></span>
        </button>
        <div class="shot-row__body">
          <div class="shot-row__head">
            <strong>{{ s.size ? t(`shots.sizes.${s.size.replace(/[ -]/g, "_")}`) : t("shots.noSize") }}</strong>
            <span v-if="s.camera" class="muted">· {{ s.camera }}</span>
            <span class="muted">· {{ t("shots.seconds", { s: s.seconds }) }}</span>
            <UiTag v-if="s.edited" intent="secondary" :value="t('shots.editedTag')" :title="t('shots.editedHint')" />
          </div>
          <p class="shot-row__action">{{ s.action || t("shots.noAction") }}</p>
          <p v-if="s.line" class="shot-row__line">
            <span class="muted">{{ nameOf(s.speakerId) || t("shots.someone") }}:</span> “{{ s.line }}”
          </p>
          <p v-if="s.cardIds.length" class="shot-row__cards muted">{{ s.cardIds.map(nameOf).filter(Boolean).join(" · ") }}</p>
        </div>
        <div class="shot-row__actions">
          <UiButton
            intent="ghost" size="icon" focusable-when-disabled :disabled="!!films.framing[s.id] || films.framingFilm"
            :aria-label="t('frames.paintOne', { n: i + 1 })" :title="films.framing[s.id] ? t('frames.painting') : t('frames.paintOne', { n: i + 1 })" @click="paintFrames(s)"
          >
            <template #icon><Icon name="Sparkle" :size="14" /></template>
          </UiButton>
          <UiButton intent="ghost" size="icon" :disabled="i === 0" :aria-label="t('shots.moveUp', { n: i + 1 })" :title="t('shots.moveUp', { n: i + 1 })" @click="move(s, -1)">
            <template #icon><Icon name="ArrowUp" :size="14" /></template>
          </UiButton>
          <UiButton intent="ghost" size="icon" :disabled="i === films.shots.length - 1" :aria-label="t('shots.moveDown', { n: i + 1 })" :title="t('shots.moveDown', { n: i + 1 })" @click="move(s, 1)">
            <template #icon><Icon name="ArrowDown" :size="14" /></template>
          </UiButton>
          <UiButton intent="ghost" size="icon" :aria-label="t('shots.edit', { n: i + 1 })" :title="t('shots.edit', { n: i + 1 })" @click="editing = s">
            <template #icon><Icon name="Pencil" :size="14" /></template>
          </UiButton>
          <UiButton intent="ghost" size="icon" :aria-label="t('shots.delete.action', { n: i + 1 })" :title="t('shots.delete.action', { n: i + 1 })" @click="remove(s)">
            <template #icon><Icon name="Trash" :size="14" /></template>
          </UiButton>
        </div>
      </li>
    </ol>

    <ShotDialog v-if="editing !== false" :shot="editing" @saved="onSaved" @close="editing = false" />
    <FramesDialog v-if="framesOf" :shot="framesOf" @close="framesOf = null" />
  </div>
</template>

<style scoped>
.shots-panel { display: flex; flex-direction: column; gap: 14px; }
.shots-panel__tools { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.shots-panel__carry :deep(.ui-input) { margin-top: 6px; }
.shot-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; max-width: 980px; }
.shot-row { display: flex; gap: 12px; align-items: flex-start; border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; background: var(--surface); }
.shot-row__n { font-weight: 700; min-width: 24px; color: var(--muted); padding-top: 1px; }
.shot-row__frame { all: unset; box-sizing: border-box; width: 160px; flex: 0 0 160px; cursor: pointer; border-radius: 6px; overflow: hidden; }
.shot-row__frame:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.shot-row__noframe { display: grid; place-items: center; width: 100%; background: var(--surface-2); color: var(--muted); }
.shot-row__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.shot-row__head { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.shot-row__action, .shot-row__line, .shot-row__cards { margin: 0; overflow-wrap: anywhere; }
.shot-row__cards { font-size: 12.5px; }
.shot-row__actions { display: flex; gap: 2px; }
</style>
