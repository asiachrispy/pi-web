import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { middleware } from "./middleware";

function apiRequest(pathname: string, method = "GET"): NextRequest {
  return new NextRequest(`http://192.168.1.5:30141${pathname}`, {
    method,
    headers: { host: "192.168.1.5:30141" },
  });
}

describe("middleware public API matrix", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows only public share read methods without auth", async () => {
    vi.stubEnv("PI_WEB_REMOTE", "");

    expect((await middleware(apiRequest("/api/share/token", "GET"))).status).toBe(200);
    expect((await middleware(apiRequest("/api/share/token", "HEAD"))).status).toBe(200);
    expect((await middleware(apiRequest("/api/share/token", "OPTIONS"))).status).toBe(200);
    expect((await middleware(apiRequest("/api/share/token", "POST"))).status).toBe(403);
  });

  it("keeps remote pairing and client status methods explicit", async () => {
    vi.stubEnv("PI_WEB_REMOTE", "");

    expect((await middleware(apiRequest("/api/remote/pair", "POST"))).status).toBe(200);
    expect((await middleware(apiRequest("/api/remote/pair", "GET"))).status).toBe(403);
    expect((await middleware(apiRequest("/api/remote/client", "GET"))).status).toBe(200);
    expect((await middleware(apiRequest("/api/remote/client", "POST"))).status).toBe(403);
  });

  it("lets health reach its loopback-only route guard but blocks private APIs", async () => {
    vi.stubEnv("PI_WEB_REMOTE", "");

    expect((await middleware(apiRequest("/api/health", "GET"))).status).toBe(200);
    expect((await middleware(apiRequest("/api/sessions", "GET"))).status).toBe(403);
  });
});
