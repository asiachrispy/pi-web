import { describe, expect, it } from "vitest";
import {
  isChatTestableModelId,
  isPartialDecimalInput,
  isReasoningEffortUnsupportedError,
  normalizeModelCost,
  normalizeModelEntry,
  normalizeModelsJson,
  parseCostFieldValue,
} from "./models-config-normalize";

describe("normalizeModelCost", () => {
  it("returns undefined for empty or missing cost", () => {
    expect(normalizeModelCost(undefined)).toBeUndefined();
    expect(normalizeModelCost({})).toBeUndefined();
  });

  it("fills missing cost fields with zero", () => {
    expect(normalizeModelCost({ input: 0.1, output: 0.2 })).toEqual({
      input: 0.1,
      output: 0.2,
      cacheRead: 0,
      cacheWrite: 0,
    });
  });
});

describe("normalizeModelEntry", () => {
  it("keeps compat and reasoning fields", () => {
    expect(normalizeModelEntry({
      id: "Agnes-2.0-Flash",
      reasoning: true,
      compat: {
        thinkingFormat: "deepseek",
        requiresReasoningContentOnAssistantMessages: true,
      },
      cost: { input: 0.1, output: 0.2 },
    })).toEqual({
      id: "Agnes-2.0-Flash",
      reasoning: true,
      compat: {
        thinkingFormat: "deepseek",
        requiresReasoningContentOnAssistantMessages: true,
      },
      cost: {
        input: 0.1,
        output: 0.2,
        cacheRead: 0,
        cacheWrite: 0,
      },
    });
  });
});

describe("isChatTestableModelId", () => {
  it("allows text chat models", () => {
    expect(isChatTestableModelId("agnes-1.5-flash")).toBe(true);
    expect(isChatTestableModelId("agnes-2.0-flash")).toBe(true);
  });

  it("blocks image and video generation models", () => {
    expect(isChatTestableModelId("agnes-image-2.1-flash")).toBe(false);
    expect(isChatTestableModelId("agnes-video-v2.0")).toBe(false);
    expect(isChatTestableModelId("dall-e-3")).toBe(false);
  });
});

describe("isPartialDecimalInput", () => {
  it("allows empty and in-progress decimals", () => {
    expect(isPartialDecimalInput("")).toBe(true);
    expect(isPartialDecimalInput("0.")).toBe(true);
    expect(isPartialDecimalInput("0.1")).toBe(true);
  });

  it("rejects non-numeric text", () => {
    expect(isPartialDecimalInput("abc")).toBe(false);
    expect(isPartialDecimalInput("1.2.3")).toBe(false);
  });
});

describe("parseCostFieldValue", () => {
  it("parses complete decimals", () => {
    expect(parseCostFieldValue("0.1")).toBe(0.1);
    expect(parseCostFieldValue("2")).toBe(2);
  });

  it("treats partial input as empty", () => {
    expect(parseCostFieldValue("0.")).toBeUndefined();
    expect(parseCostFieldValue("")).toBeUndefined();
  });
});

describe("isReasoningEffortUnsupportedError", () => {
  it("detects Agnes-style reasoning_effort rejections", () => {
    const error = "400 UnsupportedParamsError: openai does not support parameters: ['reasoning_effort'], for model=agnes-1.5-flash";
    expect(isReasoningEffortUnsupportedError(error)).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(isReasoningEffortUnsupportedError("503 No available channel for model")).toBe(false);
  });
});

describe("normalizeModelsJson", () => {
  it("normalizes provider models for models.json schema", () => {
    expect(normalizeModelsJson({
      providers: {
        agnes: {
          baseUrl: "https://example.com/v1",
          apiKey: "sk-test",
          models: [
            { id: "model-a", cost: {} },
            { id: "model-b", cost: { input: 1, output: 2 } },
          ],
        },
      },
    })).toEqual({
      providers: {
        agnes: {
          baseUrl: "https://example.com/v1",
          apiKey: "sk-test",
          models: [
            { id: "model-a" },
            {
              id: "model-b",
              cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
            },
          ],
        },
      },
    });
  });
});
