import { describe, expect, it } from "vitest";
import { isModelAvailable, listAvailableModels } from "./available-models";

describe("available-models", () => {
  it("returns arrays without throwing", () => {
    const result = listAvailableModels();
    expect(Array.isArray(result.modelList)).toBe(true);
    expect(result.nameMap instanceof Map).toBe(true);
  });

  it("rejects unknown provider/model pairs", () => {
    expect(isModelAvailable("__no_such_provider__", "__no_such_model__")).toBe(false);
  });
});
