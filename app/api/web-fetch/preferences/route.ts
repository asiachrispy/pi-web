import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export const dynamic = "force-dynamic";

type T2Backend = "auto" | "webkit" | "agent-browser";

interface WebFetchPreferences {
  t2Backend: T2Backend;
  cacheTtlMs: number;
}

const DEFAULTS: WebFetchPreferences = {
  t2Backend: "auto",
  cacheTtlMs: 60 * 60 * 1000,
};

function settingsPath(): string {
  const agentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
  return join(agentDir, "settings.json");
}

function readAllSettings(): Record<string, unknown> {
  try {
    if (!existsSync(settingsPath())) return {};
    const raw = readFileSync(settingsPath(), "utf-8");
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function writeAllSettings(settings: Record<string, unknown>): void {
  const path = settingsPath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(settings, null, 2) + "\n", "utf-8");
}

function readPreferences(): WebFetchPreferences {
  const all = readAllSettings();
  const wf = (all.webFetch ?? {}) as Record<string, unknown>;
  const t2Backend: T2Backend =
    wf.t2Backend === "webkit" || wf.t2Backend === "agent-browser" || wf.t2Backend === "auto"
      ? wf.t2Backend
      : DEFAULTS.t2Backend;
  const cacheTtlMs = typeof wf.cacheTtlMs === "number" && wf.cacheTtlMs > 0 ? wf.cacheTtlMs : DEFAULTS.cacheTtlMs;
  return { t2Backend, cacheTtlMs };
}

function isValidT2(value: unknown): value is T2Backend {
  return value === "auto" || value === "webkit" || value === "agent-browser";
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export async function GET(req: Request) {
  const rejected = requireApiAuth(req);
  if (rejected) return rejected;
  return NextResponse.json(readPreferences());
}

export async function PUT(req: Request) {
  const rejected = requireApiAuth(req);
  if (rejected) return rejected;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Body must be an object" }, { status: 400 });
  }

  const obj = body as Record<string, unknown>;
  const all = readAllSettings();
  const wf = (all.webFetch ?? {}) as Record<string, unknown>;

  if (obj.t2Backend !== undefined) {
    if (!isValidT2(obj.t2Backend)) {
      return NextResponse.json({ error: "t2Backend must be 'auto', 'webkit', or 'agent-browser'" }, { status: 400 });
    }
    wf.t2Backend = obj.t2Backend;
  }

  if (obj.cacheTtlMs !== undefined) {
    if (!isPositiveInt(obj.cacheTtlMs)) {
      return NextResponse.json({ error: "cacheTtlMs must be a positive number" }, { status: 400 });
    }
    wf.cacheTtlMs = obj.cacheTtlMs;
  }

  all.webFetch = wf;
  try {
    writeAllSettings(all);
  } catch (e) {
    return NextResponse.json({ error: `Failed to write settings: ${String(e)}` }, { status: 500 });
  }

  return NextResponse.json(readPreferences());
}
