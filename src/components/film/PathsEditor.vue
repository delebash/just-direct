<script setup>
// SPDX-License-Identifier: MIT
// Draw where things move in a shot — over its first frame, each path a few points the clip's motion follows (a car's
// route, a blade's arc, a creature's flight, the camera's push). A click adds a point to the path being drawn; New path
// starts another; Undo takes the last point off; Clear removes them all. The points are kept in 0..1 of the frame and
// saved with the shot; the server spreads them over the clip's frames (the kit's motion-track drawer).
import { UiButton, useServerImage } from "@delebash/ui";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  // the first frame's server path, null when the shot has none (loaded through the kit's transport)
  picture: { type: String, default: null },
  ratio: { type: Number, default: 16 / 9 },
});
const emit = defineEmits(["update:modelValue"]);
const { t } = useI18n();
const { src } = useServerImage(() => props.picture || "");

// every path, and which one a click adds to
const tracks = ref(props.modelValue.map((tr) => tr.map((p) => ({ ...p }))));
const current = ref(Math.max(0, tracks.value.length - 1));
watch(
  () => props.modelValue,
  (v) => {
    if (JSON.stringify(v) !== JSON.stringify(tracks.value)) tracks.value = v.map((tr) => tr.map((p) => ({ ...p })));
  },
);
const COLOURS = ["#ff4d4d", "#4da3ff", "#ffd24d", "#5cd65c", "#d24dff", "#ff9f4d", "#4dffe1", "#ffffff"];
const emitAll = () => emit("update:modelValue", tracks.value.filter((tr) => tr.length).map((tr) => tr.map((p) => ({ ...p }))));

const box = ref(null);
function add(e) {
  const r = box.value.getBoundingClientRect();
  const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
  if (!tracks.value[current.value]) tracks.value[current.value] = [];
  if (tracks.value[current.value].length >= 32) return;
  tracks.value[current.value].push({ x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 });
  emitAll();
}
function newTrack() {
  if (tracks.value.length >= 8) return;
  if (tracks.value[current.value]?.length) tracks.value.push([]);
  current.value = tracks.value.length - 1;
}
function undo() {
  tracks.value[current.value]?.pop();
  if (!tracks.value[current.value]?.length && current.value > 0) {
    tracks.value.splice(current.value, 1);
    current.value = tracks.value.length - 1;
  }
  emitAll();
}
function clear() {
  tracks.value = [];
  current.value = 0;
  emitAll();
}
const lines = computed(() => tracks.value.map((tr) => tr.map((p) => `${p.x * 1000},${p.y * 1000}`).join(" ")));
</script>

<template>
  <div class="paths-editor">
    <div
      ref="box" class="paths-editor__canvas" :style="{ aspectRatio: ratio, backgroundImage: src ? `url(${src})` : undefined }"
      role="button" tabindex="0" :aria-label="t('paths.canvas')" @click="add"
    >
      <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
        <g v-for="(tr, i) in tracks" :key="i">
          <polyline :points="lines[i]" fill="none" :stroke="COLOURS[i % COLOURS.length]" stroke-width="6" vector-effect="non-scaling-stroke" />
          <circle v-for="(p, k) in tr" :key="k" :cx="p.x * 1000" :cy="p.y * 1000" :r="k === tr.length - 1 ? 9 : 6" :fill="COLOURS[i % COLOURS.length]" />
        </g>
      </svg>
    </div>
    <div class="paths-editor__tools">
      <span class="muted">{{ t("paths.counts", { tracks: tracks.filter((tr) => tr.length).length, points: tracks[current]?.length ?? 0 }) }}</span>
      <UiButton intent="secondary" size="small" :label="t('paths.newTrack')" :disabled="tracks.length >= 8" @click="newTrack" />
      <UiButton intent="ghost" size="small" :label="t('paths.undo')" :disabled="!tracks.length" @click="undo" />
      <UiButton intent="ghost" size="small" :label="t('paths.clear')" :disabled="!tracks.length" @click="clear" />
    </div>
    <p class="hint">{{ t("paths.hint") }}</p>
  </div>
</template>

<style scoped>
.paths-editor { display: flex; flex-direction: column; gap: 8px; max-width: 720px; }
.paths-editor__canvas { position: relative; width: 100%; background: var(--surface-2) center / cover no-repeat; border-radius: 6px; cursor: crosshair; overflow: hidden; }
.paths-editor__canvas:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.paths-editor__canvas svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.paths-editor__tools { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
</style>
