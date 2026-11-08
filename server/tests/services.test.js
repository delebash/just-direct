// SPDX-License-Identifier: MIT
// The seam between the routes and the kit: services.run hands the routes `{content, finishReason, completionTokens}`
// from the kit's runAction, whose own answer is its LLMResponse (`text`, `finish_reason`, `completion_tokens`). The
// routes' tests pass fakes in the routes' shape, so this test holds the mapping against the kit's own LLMResponse
// factory — the first real run failed every plan on exactly this (2026-11-07).
import { LLMResponse } from "@delebash/core/llm/base";
import { expect, test, vi } from "vitest";
import { createApp } from "../src/app.js";
import { tmpDir, useHermeticKit } from "./helpers.js";

useHermeticKit();

const answer = LLMResponse({ text: '{"cards": []}', finish_reason: "stop", completion_tokens: 812 });
vi.mock("@delebash/core/llm", async (importOriginal) => ({ ...(await importOriginal()), runAction: vi.fn(async () => answer) }));

test("a chat action's answer reaches the routes as content, with why it stopped and its tokens", async () => {
  await createApp(tmpDir()); // the kit's stores, which the run reads its prompts and providers from
  const { createServices } = await import("../src/services.js");
  const r = await createServices().run({ action: "plan.cards", variables: {} });
  expect(r).toEqual({ content: '{"cards": []}', finishReason: "stop", completionTokens: 812 });
});
