// SPDX-License-Identifier: MIT
// A development build of an engine in place of the installed one (dev_builds.js): its server program from the named
// bin folder, its backend from the build's CMake cache, its version from the checkout's git files; nothing named, or a
// folder without the program, is no development build.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
import { backendOf, commitOf, DEV_ENGINES, devBuild } from "../src/dev_builds.js";
import { tmpDir } from "./helpers.js";

const SHA = "4400f6d0123456789abcdef0123456789abcdef0";

/** A checkout with a build folder: <repo>/.git (on branch jd), <repo>/build-jd/{CMakeCache.txt, bin/<server>}. */
function checkout(server, cache, { packed = false } = {}) {
  const repo = tmpDir();
  mkdirSync(path.join(repo, ".git", "refs", "heads"), { recursive: true });
  writeFileSync(path.join(repo, ".git", "HEAD"), "ref: refs/heads/jd\n");
  if (packed) writeFileSync(path.join(repo, ".git", "packed-refs"), `# pack-refs\n${SHA} refs/heads/jd\n`);
  else writeFileSync(path.join(repo, ".git", "refs", "heads", "jd"), `${SHA}\n`);
  const bin = path.join(repo, "build-jd", "bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(path.join(repo, "build-jd", "CMakeCache.txt"), cache);
  if (server) writeFileSync(path.join(bin, server), "");
  return { repo, bin };
}

test("sd.cpp's development build: its server, CUDA from its CMake cache, its commit", () => {
  const { bin } = checkout(DEV_ENGINES.sdcpp.server, "CMAKE_BUILD_TYPE:STRING=Release\nSD_CUDA:BOOL=ON\nSD_VULKAN:BOOL=OFF\n");
  expect(devBuild("sdcpp", { JUST_DIRECT_SDCPP_BUILD: bin })).toEqual({ exe: path.join(bin, DEV_ENGINES.sdcpp.server), backend: "cuda", version: "dev · 4400f6d" });
});

test("nothing named, a folder without the server, an engine this app doesn't build: none", () => {
  expect(devBuild("sdcpp", {})).toBeNull();
  const { bin } = checkout(null, "");
  expect(devBuild("sdcpp", { JUST_DIRECT_SDCPP_BUILD: bin })).toBeNull();
  expect(devBuild("llamacpp", { JUST_DIRECT_SDCPP_BUILD: bin })).toBeNull();
});

test("the backend: the first switch on, else the CPU; the commit from packed refs too", () => {
  expect(backendOf("ENGINE_ENABLE_VULKAN:BOOL=ON\n", DEV_ENGINES.audiocpp.backends)).toBe("vulkan");
  expect(backendOf("SD_CUDA:BOOL=OFF\n", DEV_ENGINES.sdcpp.backends)).toBe("cpu");
  expect(commitOf(checkout(null, "", { packed: true }).repo)).toBe("4400f6d");
});
