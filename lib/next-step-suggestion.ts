// Public helper that picks a single "suggested next step" action for the
// SceneHeader to highlight. The rule set is deliberately conservative:
// false negatives are acceptable, false positives are not. When a rule
// requires an action that the scene does not declare, the rule is a no-op
// (returns null) and the highlight is suppressed.

import { getActionsForScene, type Scene, type SceneAction } from "./scenes";
import { normalizeActionId } from "./scene-action-policy";

const MIN_LENGTH_FOR_SUGGESTION = 60;
const LONG_OUTPUT_THRESHOLD = 1500;
const EXCLAMATION_THRESHOLD = 2;

function enabledActions(scene: Scene): SceneAction[] {
  return getActionsForScene(scene).filter((action) => action.enabled);
}

function findByAlias(actions: SceneAction[], alias: string): SceneAction | null {
  return actions.find((action) => normalizeActionId(action) === alias) ?? null;
}

function findById(actions: SceneAction[], id: string): SceneAction | null {
  return actions.find((action) => action.id === id) ?? null;
}

export function suggestNextStep(
  latestText: string,
  scene: Scene,
  lastActionId: string | null,
): SceneAction | null {
  if (!latestText || latestText.length < MIN_LENGTH_FOR_SUGGESTION) return null;

  const actions = enabledActions(scene);

  // Rule 2: long assistant output → suggest the scene's summarize action.
  if (latestText.length > LONG_OUTPUT_THRESHOLD) {
    const summarize = findByAlias(actions, "summarize");
    if (summarize) return summarize;
  }

  // Rule 3: the previous action was a refine → suggest exporting the result.
  if (lastActionId === "refine-output") {
    const exportResult = findById(actions, "export-result");
    if (exportResult) return exportResult;
  }

  // Rule 4: customer-communication with question/excitement → suggest a
  // follow-up (preferred) or a fresh draft reply.
  if (scene.id === "customer-communication") {
    const hasQuestion = latestText.includes("?");
    const exclamations = (latestText.match(/!/g) ?? []).length;
    if (hasQuestion || exclamations >= EXCLAMATION_THRESHOLD) {
      const followup = findByAlias(actions, "followup");
      if (followup) return followup;
      const draftReply = findById(actions, "draft-reply");
      if (draftReply) return draftReply;
    }
  }

  return null;
}
