// SPDX-License-Identifier: MIT
// The routes (app-structure §Q.1, §11). The layout is imported, not lazy: every screen needs it, and
// lazily its components' styles moved into a later chunk and won ties with the app's (measured on
// JustVoice). The pages are lazy. /ai and /settings/:section? are the family chrome; /offline is
// outside the layout (the boot file sends every route there while the server is down).
import MainLayout from "../layouts/MainLayout.vue";

const pages = [
  // Home is the films
  { path: "", component: () => import("../pages/HomePage.vue") },
  // a film, its tab in the address (Story, Cards …)
  { path: "films/:id/:tab?", component: () => import("../pages/FilmPage.vue"), props: true },
  // motion capture: the kit's screen (a take becomes a shot's guide video)
  { path: "mocap", component: () => import("../pages/MocapPage.vue") },
  { path: "ai", component: () => import("../pages/AiPage.vue") },
  { path: "settings/:section?", component: () => import("../pages/SettingsPage.vue"), props: true },
  // anything else, inside the chrome, so the nav still works
  { path: ":catchAll(.*)*", component: () => import("../pages/NotFoundPage.vue") },
];

export default [
  { path: "/", component: MainLayout, children: pages },
  { path: "/offline", component: () => import("../pages/ConnectionErrorPage.vue") },
];
