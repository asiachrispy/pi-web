import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const exec = promisify(execFile);

export const dynamic = "force-dynamic";

interface AgentBrowserStatus {
  available: boolean;
  version?: string;
  installHint?: string;
}

interface WebKitStatus {
  available: boolean;
  platform: "macos" | "other";
}

interface WebFetchStatus {
  agentBrowser: AgentBrowserStatus;
  webkit: WebKitStatus;
  t2Backend: "auto" | "webkit" | "agent-browser";
  cacheTtlMs: number;
}

const DEFAULT_T2_BACKEND: WebFetchStatus["t2Backend"] = "auto";
const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000;

function settingsPath(): string {
  const agentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
  return join(agentDir, "settings.json");
}

function readPreferences(): { t2Backend: WebFetchStatus["t2Backend"]; cacheTtlMs: number } {
  try {
    if (!existsSync(settingsPath())) {
      return { t2Backend: DEFAULT_T2_BACKEND, cacheTtlMs: DEFAULT_CACHE_TTL_MS };
    }
    const raw = readFileSync(settingsPath(), "utf-8");
    const parsed = JSON.parse(raw) as { webFetch?: { t2Backend?: string; cacheTtlMs?: number } };
    const wf = parsed.webFetch ?? {};
    const t2Backend: WebFetchStatus["t2Backend"] =
      wf.t2Backend === "webkit" || wf.t2Backend === "agent-browser" || wf.t2Backend === "auto"
        ? wf.t2Backend
        : DEFAULT_T2_BACKEND;
    const cacheTtlMs = typeof wf.cacheTtlMs === "number" && wf.cacheTtlMs > 0 ? wf.cacheTtlMs : DEFAULT_CACHE_TTL_MS;
    return { t2Backend, cacheTtlMs };
  } catch {
    return { t2Backend: DEFAULT_T2_BACKEND, cacheTtlMs: DEFAULT_CACHE_TTL_MS };
  }
}

async function checkAgentBrowser(): Promise<AgentBrowserStatus> {
  try {
    const { stdout } = await exec("agent-browser", ["--version"], { timeout: 2000 });
    const version = stdout.trim().split("\n")[0]?.replace(/^v/, "") ?? "";
    return { available: true, version: version || undefined };
  } catch {
    return {
      available: false,
      installHint:
        "agent-browser not installed. Install: brew install agent-browser && agent-browser install",
    };
  }
}

function detectWebKit(): WebKitStatus {
  // On macOS, the WKWebView capability exists in Pi.app. The extension's
  // webkit.ts does the actual runtime check (window.piNative?.webFetch).
  // We report "available" optimistically on macOS; the extension will
  // fall back to agent-browser if the bridge is missing.
  const platform = process.platform === "darwin" ? "macos" : "other";
  return { available: platform === "macos", platform };
}

export async function GET(req: Request) {
  const rejected = requireApiAuth(req);
  if (rejected) return rejected;

  const prefs = readPreferences();
  const [agentBrowser, webkit] = await Promise.all([checkAgentBrowser(), Promise.resolve(detectWebKit())]);

  const status: WebFetchStatus = {
    agentBrowser,
    webkit,
    t2Backend: prefs.t2Backend,
    cacheTtlMs: prefs.cacheTtlMs,
  };

  return NextResponse.json(status);
}
