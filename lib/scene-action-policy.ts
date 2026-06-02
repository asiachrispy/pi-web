// Centralizes how a Scene's user-facing "actions" (draft, summarize, send,
// next step, etc.) are translated into chat input. The ChatWindow and the
// future Automation composer both need to know "given an action and the
// current message state, what prompt should the user see?". Keeping this
// here means we don't end up with three slightly-different renderings of
// the same action policy.

import type { SceneAction } from "./scenes";

type ActionContext = {
  // The most recent assistant or user text. Used to seed prompts that
  // transform existing content.
  latestText: string | null;
  // Whether the scene's outputs typically come back as markdown vs. plain
  // text. Drives small style choices in the inserted prompt.
  outputStyle: string | null;
};

export type ActionPrompt =
  | { kind: "input"; value: string }
  | { kind: "send"; value: string }
  | { kind: "noop" };

const ALIASED_TEMPLATES: Record<string, (ctx: ActionContext) => string> = {
  refine: (ctx) =>
    `Use the latest result and rewrite it for clarity. Keep all factual content intact.${ctx.latestText ? `\n\n---\n${ctx.latestText}` : ""}`,
  summarize: (ctx) =>
    `Summarize the latest result into 3-5 bullet points. Preserve names, numbers, and decisions.${ctx.latestText ? `\n\n---\n${ctx.latestText}` : ""}`,
  translate: (ctx) =>
    `Translate the latest result into Simplified Chinese while preserving tone and formatting.${ctx.latestText ? `\n\n---\n${ctx.latestText}` : ""}`,
  followup: (ctx) =>
    `Generate a concise, professional follow-up reply based on the latest exchange.${ctx.latestText ? `\n\n---\n${ctx.latestText}` : ""}`,
  export: (ctx) =>
    `Format the latest result as a clean Markdown document with a clear title and section structure.${ctx.latestText ? `\n\n---\n${ctx.latestText}` : ""}`,
};

export function normalizeActionId(action: SceneAction): string {
  // Match on id, label, or kebab-cased label.
  const id = action.id.toLowerCase();
  if (id in ALIASED_TEMPLATES) return id;
  const kebab = action.label.toLowerCase().replace(/\s+/g, "-");
  if (kebab in ALIASED_TEMPLATES) return kebab;
  return id;
}

export function buildActionPrompt(
  action: SceneAction,
  context: ActionContext,
): ActionPrompt {
  if (!action.enabled) return { kind: "noop" };

  const template = ALIASED_TEMPLATES[normalizeActionId(action)];
  if (template) {
    return { kind: "input", value: template(context) };
  }

  // Fallback: ask the model to apply the action against the latest message.
  return {
    kind: "input",
    value: `Apply the action "${action.label}"${action.description ? ` (${action.description})` : ""}.${context.latestText ? `\n\n---\n${context.latestText}` : ""}`,
  };
}

export function actionPromptAsText(prompt: ActionPrompt): string | null {
  if (prompt.kind === "noop") return null;
  return prompt.value;
}
