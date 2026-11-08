<script setup>
// SPDX-License-Identifier: MIT
// Settings → General — the app's own settings (/v1/settings, a schema per key; family rule 1: a
// value a user might change is a seeded row, never a constant). The §15 form: the rules are the
// route's own schema (`schemaRules(SettingsPatch)` from the server package), a 422 lands under its
// field (`fieldErrors`), any other failure goes through `reportError`, Save is disabled while it
// runs and sits on the row of the fields it saves — one card per group, each its own form.
import { fieldErrors, reportError, schemaRules, UiButton, UiField, UiInput, UiNumber, UiTextarea, UiToggle } from "@delebash/ui";
import { SettingsPatch } from "just-direct-server/schemas/settings.js";
import { nextTick, onMounted, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useSettingsStore } from "../../stores/settings.js";

const { t } = useI18n();
const settings = useSettingsStore();

const GROUPS = [
  // a new film's picture size (wide; its tall and square shapes follow)
  {
    id: "films",
    title: "settings.general.filmsTitle",
    hint: "settings.general.filmsHint",
    fields: [
      { key: "films.width", id: "setting-film-width", label: "settings.general.filmWidth", step: 64 },
      { key: "films.height", id: "setting-film-height", label: "settings.general.filmHeight", step: 64 },
    ],
  },
  // a card's picture: the long side it is painted at, the largest file it takes
  {
    id: "cards",
    title: "settings.general.cardsTitle",
    hint: "settings.general.cardsHint",
    fields: [
      { key: "cards.pictureSide", id: "setting-picture-side", label: "settings.general.pictureSide", step: 64 },
      { key: "cards.maxPictureMegabytes", id: "setting-max-picture", label: "settings.general.maxPictureMegabytes" },
    ],
  },
  // the planner: the most shots a plan may have, the room each answer has, how fast a line is spoken
  {
    id: "planner",
    title: "settings.general.plannerTitle",
    hint: "settings.general.plannerHint",
    fields: [
      { key: "planner.maxShots", id: "setting-max-shots", label: "settings.general.maxShots" },
      { key: "planner.maxTokens", id: "setting-max-tokens", label: "settings.general.maxTokens", step: 500 },
      { key: "planner.wordsPerSecond", id: "setting-words-per-second", label: "settings.general.wordsPerSecond", step: 0.1 },
    ],
  },
  // first frames: how many candidates, how many references and how small
  {
    id: "frames",
    title: "settings.general.framesTitle",
    hint: "settings.general.framesHint",
    fields: [
      { key: "frames.candidates", id: "setting-frame-candidates", label: "settings.general.frameCandidates" },
      { key: "frames.maxReferences", id: "setting-frame-references", label: "settings.general.frameReferences" },
      { key: "frames.referencePixels", id: "setting-frame-pixels", label: "settings.general.framePixels", step: 4096 },
      { key: "frames.check", id: "setting-frame-check", label: "settings.general.frameCheck", type: "toggle" },
    ],
  },
  // clips: the frame rate and the largest guide video
  {
    id: "clips",
    title: "settings.general.clipsTitle",
    hint: "settings.general.clipsHint",
    fields: [
      { key: "clips.fps", id: "setting-clip-fps", label: "settings.general.clipFps" },
      { key: "clips.maxGuideMegabytes", id: "setting-clip-guide", label: "settings.general.clipGuideMegabytes" },
      { key: "clips.lipRepair", id: "setting-clip-lips", label: "settings.general.clipLipRepair", type: "toggle" },
      { key: "clips.lipSteps", id: "setting-clip-lip-steps", label: "settings.general.clipLipSteps" },
      { key: "clips.lipGuidance", id: "setting-clip-lip-guidance", label: "settings.general.clipLipGuidance", step: 0.1 },
    ],
  },
  // the lines' voices: where JustVoice is (they come from it), the lines' language, a recording's limits
  {
    id: "voices",
    title: "settings.general.voicesTitle",
    hint: "settings.general.voicesHint",
    text: true,
    fields: [
      { key: "voices.justvoiceUrl", id: "setting-voice-justvoice", label: "settings.general.voiceJustVoice", type: "line" },
      { key: "voices.locale", id: "setting-voice-locale", label: "settings.general.voiceLocale", type: "line" },
      { key: "voices.sampleSeconds", id: "setting-voice-sample-seconds", label: "settings.general.voiceSampleSeconds" },
      { key: "voices.maxSampleMegabytes", id: "setting-voice-sample-megabytes", label: "settings.general.voiceSampleMegabytes" },
    ],
  },
  // music and sound effects: their lengths when none is asked, and the steps each is made in
  {
    id: "sounds",
    title: "settings.general.soundsTitle",
    hint: "settings.general.soundsHint",
    fields: [
      { key: "sounds.musicSeconds", id: "setting-music-seconds", label: "settings.general.musicSeconds" },
      { key: "sounds.effectSeconds", id: "setting-effect-seconds", label: "settings.general.effectSeconds" },
      { key: "sounds.steps", id: "setting-sound-steps", label: "settings.general.soundSteps" },
      { key: "sounds.musicFadeOut", id: "setting-music-fade", label: "settings.general.musicFadeOut", step: 0.5 },
    ],
  },
  // the words each kind of card's picture is painted from
  {
    id: "prompts",
    title: "settings.general.promptsTitle",
    hint: "settings.general.promptsHint",
    text: true,
    fields: [
      ...["character", "place", "prop", "look"].map((k) => ({ key: `cards.prompt.${k}`, id: `setting-prompt-${k}`, label: `settings.general.prompt.${k}`, type: "text" })),
      { key: "frames.prompt", id: "setting-prompt-frame", label: "settings.general.prompt.frame", type: "text" },
      { key: "clips.prompt", id: "setting-prompt-clip", label: "settings.general.prompt.clip", type: "text" },
    ],
  },
  // how often a window looks for what other windows changed on the server (the kit's watchOtherWindows)
  {
    id: "windows",
    title: "settings.general.windowsTitle",
    hint: "settings.general.windowsHint",
    fields: [{ key: "windows.checkSeconds", id: "setting-check-seconds", label: "settings.general.checkSeconds" }],
  },
];
const FIELDS = GROUPS.flatMap((g) => g.fields);
const rules = schemaRules(SettingsPatch);
const draft = reactive(Object.fromEntries(FIELDS.map((f) => [f.key, null])));
const serverErrors = ref({});
const saving = ref(""); // the card being saved
const loaded = ref(false);

const changedKeys = (group) => (loaded.value ? group.fields.map((f) => f.key).filter((k) => draft[k] !== settings.values[k]) : []);

onMounted(async () => {
  try {
    await settings.load();
    for (const f of FIELDS) draft[f.key] = settings.values[f.key] ?? null;
    loaded.value = true;
  } catch (e) {
    reportError(e);
  }
});

// the field Enter was pressed in, for the focus to go back to after the save
let enterFrom = null;

async function save(group) {
  // where the keyboard was: the box Enter was pressed in (QBtn takes the focus to the submit button before this
  // runs — the box is remembered on its keydown), or Save (it stays focusable when off — aria-disabled)
  const back = enterFrom?.isConnected ? enterFrom : document.activeElement;
  enterFrom = null;
  saving.value = group.id;
  serverErrors.value = {};
  try {
    await settings.save(Object.fromEntries(changedKeys(group).map((k) => [k, draft[k]])));
    for (const f of group.fields) draft[f.key] = settings.values[f.key];
  } catch (e) {
    const fields = fieldErrors(e);
    if (group.fields.some((f) => fields[f.key])) serverErrors.value = fields;
    else reportError(e);
  } finally {
    saving.value = "";
    await nextTick();
    if (back?.isConnected && back !== document.activeElement && !back.closest?.("[aria-disabled='true']")) back.focus();
  }
}
</script>

<template>
  <section v-for="group in GROUPS" :key="group.id" class="card">
    <h2>{{ t(group.title) }}</h2>
    <p class="hint">{{ t(group.hint, { name: "{name}", description: "{description}", look: "{look}", size: "{size}", action: "{action}", cards: "{cards}", camera: "{camera}", line: "{line}" }) }}</p>
    <q-form class="form" greedy @submit="save(group)" @keydown.enter.capture="(e) => !group.text && (enterFrom = e.target)">
      <div :class="group.text ? 'form' : 'form__row'">
        <UiField v-for="f in group.fields" :key="f.key" :label="t(f.label)" layout="block" :for="f.id">
          <UiTextarea
            v-if="f.type === 'text'" :id="f.id" v-model="draft[f.key]" width="prose" :rows="2" auto-resize :disabled="!loaded" lazy-rules
            :rules="rules[f.key]" :error="!!serverErrors[f.key]" :error-message="serverErrors[f.key]"
            @update:model-value="serverErrors = {}"
          />
          <UiInput
            v-else-if="f.type === 'line'" :id="f.id" v-model="draft[f.key]" width="name" :disabled="!loaded" lazy-rules
            :rules="rules[f.key]" :error="!!serverErrors[f.key]" :error-message="serverErrors[f.key]"
            @update:model-value="serverErrors = {}"
          />
          <UiToggle v-else-if="f.type === 'toggle'" :id="f.id" v-model="draft[f.key]" :disabled="!loaded" :aria-label="t(f.label)" />
          <UiNumber
            v-else :id="f.id" v-model="draft[f.key]" width="num" :step="f.step" :disabled="!loaded" lazy-rules
            :rules="rules[f.key]" :error="!!serverErrors[f.key]" :error-message="serverErrors[f.key]"
            @update:model-value="serverErrors = {}"
          />
        </UiField>
        <UiButton
          type="submit" intent="primary" focusable-when-disabled :disabled="!!saving || !changedKeys(group).length"
          :label="saving === group.id ? t('kit.common.saving') : t('kit.common.save')"
        />
      </div>
    </q-form>
  </section>
</template>
