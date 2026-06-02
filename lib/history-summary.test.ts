import { describe, it, expect } from "vitest";
import { summarizeForHistory } from "./history-summary";

describe("summarizeForHistory", () => {
  it("returns empty string for empty input", () => {
    expect(summarizeForHistory("")).toBe("");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(summarizeForHistory("   \n\t  ")).toBe("");
  });

  it("returns the single sentence for single-sentence input", () => {
    expect(summarizeForHistory("Hello world.")).toBe("Hello world");
  });

  it("returns the first sentence for multi-sentence input", () => {
    expect(summarizeForHistory("First sentence. Second sentence. Third.")).toBe("First sentence");
  });

  it("truncates input longer than maxLength with ellipsis", () => {
    const text = "Hello, this is a long sentence that exceeds the maximum length allowed for the summary display.";
    const result = summarizeForHistory(text, 30);
    expect(result.length).toBeLessThanOrEqual(30);
    expect(result.endsWith("…")).toBe(true);
  });

  it("strips control characters before extracting the first sentence", () => {
    const result = summarizeForHistory("Hello\x00World. Second sentence.");
    expect(result).toBe("HelloWorld");
  });

  it("treats newlines as sentence terminators", () => {
    const result = summarizeForHistory("First line.\nSecond line.");
    expect(result).toBe("First line");
  });

  it("strips trailing whitespace and sentence-ending punctuation", () => {
    expect(summarizeForHistory("Hello ;   world. Bar.")).toBe("Hello");
  });
});
