// Public helper for sanitizing user-supplied strings before they are embedded
// into model prompts. Centralizing this keeps the launch / automation prompt
// builders in lockstep, and gives us one place to harden against future
// surface area (e.g. CSV uploads, deep links, form input from future scenes).

export const DEFAULT_MAX_INPUT_CHARS = 16_000;
export const DEFAULT_MAX_LINE_CHARS = 2_000;
export const DEFAULT_MAX_CONSECUTIVE_BLANK_LINES = 2;

type SanitizeOptions = {
  maxChars?: number;
  // Allow callers to require truncation behavior to be explicit.
  onTruncate?: "ellipsis" | "marker" | "none";
  // When the input overflows the limit, keep the tail rather than the head.
  // Head-preserving is the default because it keeps user-provided context
  // (most important at the start); tail-preserving is useful for log-style
  // inputs.
  keep?: "head" | "tail";
};

const ELLIPSIS = "…";

// Strip everything below 0x20 except for \n, \r, \t. Also strip 0x7f (DEL)
// which is technically printable but universally used as a control char.
const CONTROL_CHAR_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

function clamp(value: string, max: number, keep: "head" | "tail"): string {
  if (value.length <= max) return value;
  if (keep === "tail") return value.slice(value.length - max);
  return value.slice(0, max);
}

function collapseBlankLines(value: string, max: number): string {
  if (max <= 0) return value;
  const pattern = new RegExp(`(?:\\n\\s*){${max + 1},}`, "g");
  return value.replace(pattern, "\n".repeat(max));
}

function foldLongLines(value: string, max: number): string {
  if (max <= 0) return value;
  return value
    .split("\n")
    .map((line) => (line.length > max ? `${line.slice(0, max)}${ELLIPSIS}` : line))
    .join("\n");
}

export function sanitizePromptInput(
  value: string | null | undefined,
  options: SanitizeOptions = {},
): string {
  if (value == null) return "";
  const maxChars = options.maxChars ?? DEFAULT_MAX_INPUT_CHARS;
  const keep = options.keep ?? "head";
  const truncated = clamp(value, maxChars, keep);
  const cleaned = truncated.replace(CONTROL_CHAR_PATTERN, "");
  const folded = foldLongLines(cleaned, DEFAULT_MAX_LINE_CHARS);
  const collapsed = collapseBlankLines(folded, DEFAULT_MAX_CONSECUTIVE_BLANK_LINES);
  if (
    options.onTruncate === "ellipsis" &&
    collapsed.length > 0 &&
    value.length > maxChars
  ) {
    return `${collapsed}${ELLIPSIS}`;
  }
  if (options.onTruncate === "marker" && value.length > maxChars) {
    return `${collapsed}\n[truncated ${value.length - maxChars} chars]`;
  }
  return collapsed.trim();
}

export function joinPromptSections(sections: ReadonlyArray<string>): string {
  return sections
    .map((section) => section.replace(/^\s+|\s+$/g, ""))
    .filter((section) => section.length > 0)
    .join("\n\n");
}
