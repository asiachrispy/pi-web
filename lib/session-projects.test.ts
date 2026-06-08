import { describe, expect, it } from "vitest";
import {
  getProjectCwds,
  getPickerCwds,
  isSystemTempCwd,
  pickMostRecentSession,
} from "./session-projects";

function s(id: string, cwd: string, modified: string) {
  return { id, cwd, modified };
}

describe("pickMostRecentSession", () => {
  it("returns null when no session matches the cwd", () => {
    const sessions = [
      s("a", "/repo/a", "2026-06-01T00:00:00.000Z"),
      s("b", "/repo/b", "2026-06-02T00:00:00.000Z"),
    ];
    expect(pickMostRecentSession(sessions, "/repo/missing")).toBeNull();
  });

  it("returns null when the cwd is null or empty", () => {
    const sessions = [s("a", "/repo/a", "2026-06-01T00:00:00.000Z")];
    expect(pickMostRecentSession(sessions, null)).toBeNull();
    expect(pickMostRecentSession(sessions, "")).toBeNull();
  });

  it("returns the single matching session", () => {
    const sessions = [
      s("a", "/repo/a", "2026-06-01T00:00:00.000Z"),
      s("b", "/repo/b", "2026-06-02T00:00:00.000Z"),
    ];
    const picked = pickMostRecentSession(sessions, "/repo/a");
    expect(picked?.id).toBe("a");
  });

  it("returns the session with the largest modified timestamp", () => {
    const sessions = [
      s("older", "/repo/a", "2026-06-01T00:00:00.000Z"),
      s("newest", "/repo/a", "2026-06-08T00:00:00.000Z"),
      s("middle", "/repo/a", "2026-06-04T00:00:00.000Z"),
    ];
    const picked = pickMostRecentSession(sessions, "/repo/a");
    expect(picked?.id).toBe("newest");
  });

  it("breaks ties on modified by descending id (deterministic)", () => {
    const ts = "2026-06-04T00:00:00.000Z";
    const sessions = [
      s("aaa", "/repo/a", ts),
      s("zzz", "/repo/a", ts),
      s("mmm", "/repo/a", ts),
    ];
    const picked = pickMostRecentSession(sessions, "/repo/a");
    expect(picked?.id).toBe("zzz");
  });

  it("ignores sessions from other cwds even when newer", () => {
    const sessions = [
      s("newer-but-other-cwd", "/repo/b", "2026-06-08T00:00:00.000Z"),
      s("older-but-matching", "/repo/a", "2026-06-01T00:00:00.000Z"),
    ];
    const picked = pickMostRecentSession(sessions, "/repo/a");
    expect(picked?.id).toBe("older-but-matching");
  });

  it("does not throw on sessions with missing cwd or modified", () => {
    const sessions = [
      { id: "no-cwd", cwd: "", modified: "2026-06-08T00:00:00.000Z" },
      { id: "no-mod", cwd: "/repo/a", modified: "" },
      s("good", "/repo/a", "2026-06-01T00:00:00.000Z"),
    ];
    const picked = pickMostRecentSession(sessions, "/repo/a");
    expect(picked?.id).toBe("good");
  });

  it("handles an empty session list", () => {
    expect(pickMostRecentSession([], "/repo/a")).toBeNull();
  });
});

// Smoke tests on the pre-existing helpers to guard against regressions when
// editing this file. These are intentionally minimal.
describe("getProjectCwds / getPickerCwds / isSystemTempCwd", () => {
  it("orders cwds by latest session modified desc", () => {
    const cwds = getProjectCwds([
      s("a1", "/repo/a", "2026-06-01T00:00:00.000Z"),
      s("b1", "/repo/b", "2026-06-08T00:00:00.000Z"),
      s("a2", "/repo/a", "2026-06-05T00:00:00.000Z"),
    ]);
    expect(cwds).toEqual(["/repo/b", "/repo/a"]);
  });

  it("isSystemTempCwd matches tmp-style paths and rejects real cwds", () => {
    expect(isSystemTempCwd("/tmp/foo")).toBe(true);
    expect(isSystemTempCwd("/private/var/folders/abc/def/T/x")).toBe(true);
    expect(isSystemTempCwd("/Users/me/projects")).toBe(false);
    expect(isSystemTempCwd("")).toBe(false);
  });

  it("getPickerCwds filters out system temp cwds", () => {
    const cwds = getPickerCwds([
      s("a1", "/tmp/foo", "2026-06-01T00:00:00.000Z"),
      s("a2", "/repo/a", "2026-06-08T00:00:00.000Z"),
    ]);
    expect(cwds).toEqual(["/repo/a"]);
  });
});
