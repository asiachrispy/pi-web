import { describe, expect, it } from "vitest";
import { PI_WEB_SKILL_WORKFLOW_APPEND } from "./skill-system-prompt";

describe("skill-system-prompt", () => {
  it("mentions install path and skill:name", () => {
    expect(PI_WEB_SKILL_WORKFLOW_APPEND).toContain("Settings → Skills");
    expect(PI_WEB_SKILL_WORKFLOW_APPEND).toContain("/skill:<name>");
    expect(PI_WEB_SKILL_WORKFLOW_APPEND).toContain("available_skills");
  });
});
