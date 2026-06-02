import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_CONSECUTIVE_BLANK_LINES,
  DEFAULT_MAX_INPUT_CHARS,
  DEFAULT_MAX_LINE_CHARS,
  joinPromptSections,
  sanitizePromptInput,
} from "./prompt-guard";

describe("sanitizePromptInput", () => {
  it("returns empty string for nullish or empty input", () => {
    expect(sanitizePromptInput(null)).toBe("");
    expect(sanitizePromptInput(undefined)).toBe("");
    expect(sanitizePromptInput("")).toBe("");
  });

  it("strips ASCII control characters except \\n, \\r, \\t", () => {
    const input = "hello\u0000world\u0007\u0008!";
    expect(sanitizePromptInput(input)).toBe("helloworld!");
  });

  it("preserves printable unicode and Chinese characters", () => {
    const input = "中文测试 🎉 — 全部保留";
    expect(sanitizePromptInput(input)).toBe(input);
  });

  it("strips DEL (0x7F)", () => {
    expect(sanitizePromptInput("hello\u007Fworld")).toBe("helloworld");
  });

  it("truncates oversized input from the head by default", () => {
    // Build a string with one byte per "line" so foldLongLines doesn't fold it.
    const huge = Array.from({ length: DEFAULT_MAX_INPUT_CHARS + 500 }, (_, i) =>
      i % 2 === 0 ? "a" : "\n",
    ).join("");
    const result = sanitizePromptInput(huge);
    expect(result.length).toBeLessThanOrEqual(DEFAULT_MAX_INPUT_CHARS);
    // Head preserved.
    expect(result.startsWith("a")).toBe(true);
  });

  it("can keep the tail when configured", () => {
    const huge = "a".repeat(100);
    const result = sanitizePromptInput(huge, { maxChars: 10, keep: "tail" });
    expect(result.length).toBe(10);
    expect(result).toBe("a".repeat(10));
  });

  it("appends ellipsis when onTruncate=ellipsis and input is truncated", () => {
    const huge = "x".repeat(200);
    const result = sanitizePromptInput(huge, { maxChars: 32, onTruncate: "ellipsis" });
    expect(result.endsWith("…")).toBe(true);
  });

  it("appends marker when onTruncate=marker", () => {
    const huge = "x".repeat(200);
    const result = sanitizePromptInput(huge, { maxChars: 16, onTruncate: "marker" });
    expect(result).toMatch(/\[truncated 184 chars\]$/);
  });

  it("does not append ellipsis when no truncation happened", () => {
    const result = sanitizePromptInput("short", { onTruncate: "ellipsis" });
    expect(result).toBe("short");
  });

  it("collapses long runs of blank lines", () => {
    const input = "a\n\n\n\n\n\nb";
    const result = sanitizePromptInput(input);
    expect(result).toBe(`a${"\n".repeat(DEFAULT_MAX_CONSECUTIVE_BLANK_LINES)}b`);
  });

  it("folds lines longer than DEFAULT_MAX_LINE_CHARS", () => {
    const longLine = "a".repeat(DEFAULT_MAX_LINE_CHARS + 200);
    const result = sanitizePromptInput(longLine);
    expect(result).toBe(`${"a".repeat(DEFAULT_MAX_LINE_CHARS)}…`);
  });

  it("trims surrounding whitespace", () => {
    expect(sanitizePromptInput("   hello world   ")).toBe("hello world");
  });

  it("keeps the user-provided head intact under truncation", () => {
    const huge = "IMPORTANT_HEAD" + "x".repeat(DEFAULT_MAX_INPUT_CHARS);
    const result = sanitizePromptInput(huge, { onTruncate: "ellipsis" });
    expect(result.startsWith("IMPORTANT_HEAD")).toBe(true);
  });
});

describe("joinPromptSections", () => {
  it("joins non-empty sections with a single blank line", () => {
    expect(joinPromptSections(["a", "b", "c"])).toBe("a\n\nb\n\nc");
  });

  it("drops empty and whitespace-only sections", () => {
    expect(joinPromptSections(["a", "", "   ", "b"])).toBe("a\n\nb");
  });

  it("trims each section's leading and trailing whitespace", () => {
    expect(joinPromptSections(["  a  ", "\n  b \n"])).toBe("a\n\nb");
  });

  it("returns empty string for empty input", () => {
    expect(joinPromptSections([])).toBe("");
  });
});
