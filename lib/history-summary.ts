// Public helper that derives a one-line history summary from the latest
// assistant output. The home / history surfaces need something short and
// human-readable; the full text remains in the session file. The summarizer
// is intentionally conservative: first sentence, clamped, sanitized.

import { sanitizePromptInput } from "@/lib/prompt-guard";

const SENTENCE_TERMINATOR_PATTERN = /[.?!;\n]/;
const TRAILING_PUNCTUATION_PATTERN = /[\s.?!;]+$/;
const SUMMARY_INPUT_MAX_CHARS = 240;
const DEFAULT_MAX_LENGTH = 120;

export function summarizeForHistory(text: string, maxLength: number = DEFAULT_MAX_LENGTH): string {
  if (!text) return "";
  const sanitized = sanitizePromptInput(text, {
    maxChars: SUMMARY_INPUT_MAX_CHARS,
    onTruncate: "none",
  });
  if (!sanitized) return "";
  const terminator = sanitized.match(SENTENCE_TERMINATOR_PATTERN);
  const firstSentence = terminator && terminator.index !== undefined
    ? sanitized.slice(0, terminator.index)
    : sanitized;
  const cleaned = firstSentence.replace(TRAILING_PUNCTUATION_PATTERN, "");
  if (!cleaned) return "";
  if (cleaned.length <= maxLength) return cleaned;
  if (maxLength <= 1) return cleaned.slice(0, maxLength) + "…";
  return `${cleaned.slice(0, maxLength - 1).trimEnd()}…`;
}
