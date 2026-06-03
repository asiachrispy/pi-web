import { NextResponse } from "next/server";
import { notifyAgentFinished } from "@/lib/push-notifications";
import { loadPiWebPreferences } from "@/lib/pi-web-preferences";

export async function POST(request: Request): Promise<NextResponse> {
  let body: { sessionId?: string; sessionName?: string };
  try {
    body = await request.json() as { sessionId?: string; sessionName?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.sessionId || typeof body.sessionId !== "string") {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  const prefs = loadPiWebPreferences();
  if (prefs.notificationsEnabled === false) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  await notifyAgentFinished({
    sessionId: body.sessionId,
    sessionName: typeof body.sessionName === "string" ? body.sessionName : undefined,
  });
  return NextResponse.json({ ok: true });
}
