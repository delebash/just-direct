<script setup>
// SPDX-License-Identifier: MIT
// A new film — the §15 form in the kit's AppModal: its title, the words for its look, and its shape (wide, tall or
// square — each a size the video engine takes on steps of 64). The rules are the route's own schema (`schemaRules
// (FilmIn)`); a 422 lands under its field, any other failure through reportError.
import { AppModal, fieldErrors, reportError, schemaRules, UiButton, UiField, UiInput, UiSegmented, UiTextarea } from "@delebash/ui";
import { FilmIn } from "just-direct-server/schemas/films.js";
import { computed, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useFilmsStore } from "../stores/films.js";
import { useSettingsStore } from "../stores/settings.js";

const emit = defineEmits(["close", "created"]);
const { t } = useI18n();
const films = useFilmsStore();
const settings = useSettingsStore();

// the shapes a film can take: the app's own size (Settings → General) as wide, turned on its side as tall, or square
const wide = computed(() => {
  const w = settings.values["films.width"] ?? 1280;
  const h = settings.values["films.height"] ?? 704;
  return w >= h ? { width: w, height: h } : { width: h, height: w };
});
const SHAPES = computed(() => [
  { value: "wide", label: t("films.shape.wide", { w: wide.value.width, h: wide.value.height }) },
  { value: "tall", label: t("films.shape.tall", { w: wide.value.height, h: wide.value.width }) },
  { value: "square", label: t("films.shape.square", { s: wide.value.height + 64 * Math.round((wide.value.width - wide.value.height) / 128) }) },
]);
const sizeOf = (shape) => {
  const { width, height } = wide.value;
  if (shape === "tall") return { width: height, height: width };
  if (shape === "square") {
    const s = height + 64 * Math.round((width - height) / 128);
    return { width: s, height: s };
  }
  return { width, height };
};

const rules = schemaRules(FilmIn);
const draft = reactive({ title: "", look: "", shape: "wide" });
const serverErrors = ref({});
const saving = ref(false);
const modal = ref(null);

async function save() {
  saving.value = true;
  serverErrors.value = {};
  try {
    const film = await films.create({ title: draft.title, look: draft.look, ...sizeOf(draft.shape) });
    emit("created", film);
    modal.value?.close();
  } catch (e) {
    const fields = fieldErrors(e);
    serverErrors.value = fields;
    if (!fields.title && !fields.look) reportError(e);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AppModal ref="modal" :title="t('films.new.title')" max-width="720px" @close="emit('close')">
    <q-form class="form" greedy @submit="save">
      <UiField :label="t('films.fields.title')" layout="block" for="film-title">
        <UiInput
          id="film-title" v-model="draft.title" width="prose" autofocus lazy-rules
          :rules="rules.title" :error="!!serverErrors.title" :error-message="serverErrors.title"
          @update:model-value="serverErrors = {}"
        />
      </UiField>
      <UiField :label="t('films.fields.look')" :hint="t('films.fields.lookHint')" layout="block" for="film-look">
        <UiTextarea
          id="film-look" v-model="draft.look" width="prose" :rows="2" lazy-rules
          :rules="rules.look" :error="!!serverErrors.look" :error-message="serverErrors.look"
        />
      </UiField>
      <UiField :label="t('films.fields.shape')" layout="block">
        <UiSegmented v-model="draft.shape" :options="SHAPES" :aria-label="t('films.fields.shape')" />
      </UiField>
      <div class="form__actions">
        <UiButton intent="ghost" :label="t('kit.common.cancel')" @click="modal?.close()" />
        <UiButton type="submit" intent="primary" :disabled="saving" :label="saving ? t('kit.common.saving') : t('films.new.create')" />
      </div>
    </q-form>
  </AppModal>
</template>
