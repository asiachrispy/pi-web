import { describe, expect, it, vi } from "vitest";
import { isSafeMutatingRequest } from "./local-request-guard";

describe("local mutating request guard", () => {
  it("allows same-origin localhost mutations", () => {
    expect(isSafeMutatingRequest({ host: "localhost:30142", origin: "http://localhost:30142" })).toBe(true);
    expect(isSafeMutatingRequest({ host: "127.0.0.1:30141", origin: "http://127.0.0.1:30141" })).toBe(true);
  });

  it("rejects cross-origin browser mutations", () => {
    expect(isSafeMutatingRequest({ host: "localhost:30142", origin: "https://example.com" })).toBe(false);
  });

  it("rejects LAN host mutations unless remote auth is configured", () => {
    vi.stubEnv("PI_WEB_ALLOW_REMOTE_MUTATIONS", "");
    vi.stubEnv("PI_WEB_REMOTE", "");
    expect(isSafeMutatingRequest({ host: "192.168.1.20:30141" })).toBe(false);
    vi.unstubAllEnvs();
  });

  it("allows LAN host mutations with deprecated env override", () => {
    vi.stubEnv("PI_WEB_ALLOW_REMOTE_MUTATIONS", "1");
    expect(isSafeMutatingRequest({ host: "192.168.1.20:30141" })).toBe(true);
    vi.unstubAllEnvs();
  });
});
