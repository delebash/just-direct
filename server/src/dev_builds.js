// SPDX-License-Identifier: MIT
// A development build of an engine in place of the kit's installed one — the way JustVoice's `npm run dev` runs its
// audio.cpp checkout (its engines/audiocpp/dev_build.js), through the kit's installLlm `runtimeExeOverrides`:
//
//   JUST_DIRECT_SDCPP_BUILD     the bin folder of our stable-diffusion.cpp fork's build (…\stable-diffusion.cpp\build-jd\bin)
//   JUST_DIRECT_AUDIOCPP_BUILD  the bin folder of our audio.cpp fork's build (…\audio.cpp\build\jv-dev\bin)
//
// Its server program is that folder's; its backend comes from the build's own CMake cache (one folder up); its version
// is "dev · <commit>" from the checkout's git files (read, never run: no process here — the guard's check 21). A packaged
// app ignores both variables. NOT STANDARD for now: the same job as JustVoice's dev_build.js, kept here while the kit is
// frozen for the family release — it moves into the kit, for every app, once the freeze lifts (TASKS).
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { runtime as dataRuntime } from "@delebash/core/platform/data_paths";
import { getLogger } from "@delebash/core/platform/log";

const log = getLogger("just_direct.dev_builds");
const exe = (name) => (process.platform === "win32" ? `${name}.exe` : name);

/** Each engine this app can run from a development build: its variable, its server program, its CMake cache's
 *  backend switches (the first one ON wins), the checkout three folders up from the bin folder or two. */
export const DEV_ENGINES = Object.freeze({
  sdcpp: { env: "JUST_DIRECT_SDCPP_BUILD", server: exe("sd-server"), backends: [["SD_CUDA", "cuda"], ["SD_VULKAN", "vulkan"], ["SD_METAL", "metal"], ["SD_HIPBLAS", "rocm"]] },
  audiocpp: {
    env: "JUST_DIRECT_AUDIOCPP_BUILD",
    server: exe("audiocpp_server"),
    backends: [["ENGINE_ENABLE_CUDA", "cuda"], ["ENGINE_ENABLE_VULKAN", "vulkan"], ["ENGINE_ENABLE_METAL", "metal"], ["GGML_METAL", "metal"]],
  },
});

const isFile = (p) => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};
const read = (p) => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return "";
  }
};

/** The backend a build was made for, from its CMake cache's ON switches; "cpu" when none. */
export function backendOf(cacheText, backends) {
  const on = new Set(
    cacheText
      .split(/\r?\n/)
      .filter((l) => l.endsWith(":BOOL=ON"))
      .map((l) => l.split(":", 1)[0]),
  );
  return backends.find(([key]) => on.has(key))?.[1] ?? "cpu";
}

/** The checkout's commit (short) from its git files — HEAD, its branch's ref or packed-refs — or "". */
export function commitOf(repo) {
  const git = path.join(repo, ".git");
  const head = read(path.join(git, "HEAD")).trim();
  if (/^[0-9a-f]{40}$/.test(head)) return head.slice(0, 7);
  const ref = head.match(/^ref: (.+)$/)?.[1];
  if (!ref) return "";
  const loose = read(path.join(git, ...ref.split("/"))).trim();
  if (/^[0-9a-f]{40}$/.test(loose)) return loose.slice(0, 7);
  const packed = read(path.join(git, "packed-refs"))
    .split(/\r?\n/)
    .find((l) => l.endsWith(` ${ref}`));
  return packed ? packed.slice(0, 7) : "";
}

/** The development build named for engine `id`, as the kit's runtime takes it (`{exe, backend, version}`), or null. */
export function devBuild(id, env = process.env) {
  const spec = DEV_ENGINES[id];
  const raw = String(env[spec?.env] ?? "").trim();
  if (!spec || !raw || dataRuntime.frozen) return null;
  const binDir = path.normalize(raw);
  const server = path.join(binDir, spec.server);
  if (!isFile(server)) {
    log.warning(`${spec.env} names ${binDir}, which has no ${spec.server} — running the installed build`);
    return null;
  }
  const buildDir = path.dirname(binDir);
  // the checkout: build-jd\bin → its parent (sd.cpp); build\jv-dev\bin → two up (audio.cpp)
  const repo = [path.dirname(buildDir), path.dirname(path.dirname(buildDir))].find((d) => existsSync(path.join(d, ".git"))) ?? "";
  const commit = repo ? commitOf(repo) : "";
  return { exe: server, backend: backendOf(read(path.join(buildDir, "CMakeCache.txt")), spec.backends), version: commit ? `dev · ${commit}` : "dev" };
}

/** installLlm's `runtimeExeOverrides`: each engine's development build, read when the runtime asks. */
export const runtimeExeOverrides = () => Object.fromEntries(Object.keys(DEV_ENGINES).map((id) => [id, () => devBuild(id)]));
