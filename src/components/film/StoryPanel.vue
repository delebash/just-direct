<script setup>
// SPDX-License-Identifier: MIT
// A film's Story tab — the §15 form: its title, the story (a sentence or a whole script) and the words for its look,
// which every picture of the film is painted with. The rules are the route's own schema (`schemaRules(FilmPatch)`); a
// 422 lands under its field; a change another window made first (412) is said and the film read again.
import { fieldErrors, reportError, schemaRules, UiButton, UiField, UiInput, UiTextarea } from "@delebash/ui";
import { FilmPatch } from "just-direct-server/schemas/films.js";
import { computed, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useFilmsStore } from "../../stores/films.js";

const { t } = useI18n();
const films = useFilmsStore();

const FIELDS = ["title", "story", "look"];
const rules = schemaRules(FilmPatch);
const draft = reactive({ title: "", story: "", look: "" });
const serverErrors = ref({});
const saving = ref(false);

// the form shows the film as the server has it, and again when it changes there (another window, a reload)
const fill = () => {
  for (const k of FIELDS) draft[k] = films.film?.[k] ?? "";
};
watch(() => films.film?.version, fill, { immediate: true });
const changed = computed(() => FIELDS.filter((k) => draft[k] !== (films.film?.[k] ?? "")));

async function save() {
  saving.value = true;
  serverErrors.value = {};
  try {
    await films.saveFilm(Object.fromEntries(changed.value.map((k) => [k, draft[k]])));
  } catch (e) {
    if (e?.status === 412) {
      reportError(e);
      await films.open(films.film.id).catch(() => {});
      return;
    }
    const fields = fieldErrors(e);
    serverErrors.value = fields;
    if (!FIELDS.some((k) => fields[k])) reportError(e);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section class="card">
    <q-form class="form" greedy @submit="save">
      <UiField :label="t('films.fields.title')" layout="block" for="story-title">
        <UiInput
          id="story-title" v-model="draft.title" width="prose" lazy-rules
          :rules="rules.title" :error="!!serverErrors.title" :error-message="serverErrors.title"
        />
      </UiField>
      <UiField :label="t('films.fields.story')" :hint="t('films.fields.storyHint')" layout="block" for="story-story">
        <UiTextarea
          id="story-story" v-model="draft.story" width="prose" :rows="14" auto-resize :max-height-px="560" lazy-rules
          :rules="rules.story" :error="!!serverErrors.story" :error-message="serverErrors.story"
        />
      </UiField>
      <UiField :label="t('films.fields.look')" :hint="t('films.fields.lookHint')" layout="block" for="story-look">
        <UiTextarea
          id="story-look" v-model="draft.look" width="prose" :rows="2" lazy-rules
          :rules="rules.look" :error="!!serverErrors.look" :error-message="serverErrors.look"
        />
      </UiField>
      <div class="form__actions">
        <UiButton
          type="submit" intent="primary" focusable-when-disabled :disabled="saving || !changed.length"
          :label="saving ? t('kit.common.saving') : t('kit.common.save')"
        />
      </div>
    </q-form>
  </section>
</template>
