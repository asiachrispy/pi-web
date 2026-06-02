import { describe, expect, it } from "vitest";
import { actionPromptAsText, buildActionPrompt } from "./scene-action-policy";
import type { SceneAction } from "./scenes";

function action(overrides: Partial<SceneAction> = {}): SceneAction {
  return {
    id: "refine",
    label: "Refine",
    type: "prompt",
    description: "Improve clarity and tone.",
    requiresInput: false,
    enabled: true,
    ...overrides,
  };
}

const ctx = { latestText: "Original message", outputStyle: "Markdown" };

describe("buildActionPrompt", () => {
  it("returns noop for disabled actions", () => {
    const result = buildActionPrompt(action({ enabled: false }), ctx);
    expect(result.kind).toBe("noop");
    expect(actionPromptAsText(result)).toBeNull();
  });

  it("uses aliased template and includes latest text when present", () => {
    const result = buildActionPrompt(action(), ctx);
    expect(result.kind).toBe("input");
    const value = actionPromptAsText(result);
    expect(value).toContain("rewrite it for clarity");
    expect(value).toContain("Original message");
  });

  it("falls back to label-based template", () => {
    const result = buildActionPrompt(
      action({ id: "unmapped", label: "Summarize" }),
      ctx,
    );
    const value = actionPromptAsText(result);
    expect(value).toContain("Summarize the latest result");
  });

  it("emits a generic fallback prompt for unknown actions", () => {
    const result = buildActionPrompt(
      action({ id: "do-something", label: "Do something", description: "Runs a custom flow." }),
      { latestText: null, outputStyle: null },
    );
    const value = actionPromptAsText(result);
    expect(value).toContain('Apply the action "Do something"');
    expect(value).toContain("Runs a custom flow.");
    expect(value).not.toContain("---");
  });

  it("sends the input as-is for copy/export style actions via the generic template", () => {
    const result = buildActionPrompt(
      action({ id: "copy", label: "Copy", description: "Copy to clipboard." }),
      ctx,
    );
    const value = actionPromptAsText(result);
    expect(value).toContain('Apply the action "Copy"');
  });

  it("handles null latestText without injecting a stray separator", () => {
    const result = buildActionPrompt(
      action({ id: "refine", label: "Refine" }),
      { latestText: null, outputStyle: "Markdown" },
    );
    const value = actionPromptAsText(result);
    expect(value).toBeDefined();
    expect(value).not.toContain("---");
  });
});
