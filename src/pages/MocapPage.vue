<script setup>
// SPDX-License-Identifier: MIT
// Motion capture — the kit's screen (MocapArea: a video of one person made into animation files, and live webcam
// tracking), mounted here as the user planned it (2026-11-07: "mocap is ONE screen inside JustDirect … the screen lives
// in the kit, so JustStage can share it"). It is imported by path, not from the kit's index, so an app without three.js
// and MediaPipe keeps building (the kit's brief, just-mocap docs/plans/2026-11-08-justdirect-mocap-brief.md).
import { PaneHeader, pageFlow } from "@delebash/ui";
import MocapArea from "@delebash/ui/views/MocapArea.vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
</script>

<template>
  <q-page :style-fn="pageFlow" class="page page--content">
    <PaneHeader :title="t('mocap.title')" help-key="motion-capture" />
    <MocapArea />
  </q-page>
</template>
