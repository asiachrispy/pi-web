/** Appended to the agent system prompt for Pi Web sessions (see lib/agent-resource-loader.ts). */
export const PI_WEB_SKILL_WORKFLOW_APPEND = `Pi Web — skills:

- Installed skills appear in <available_skills> above and as \`/skill:<name>\` in the slash menu.
- On each user message: if a listed skill applies, read its SKILL.md and follow it before other approaches.
- If no installed skill fits but the task needs one: name the exact \`skill:<name>\` (or skills.sh package such as \`owner/repo@skill\`) you would use, explain why, and tell the user to install it via Settings → Skills (search), then resend or use \`/skill:<name>\`. You cannot install skills yourself.
- After the user installs a skill you named, use \`/skill:<name>\` or read its file on the next turn.`;
