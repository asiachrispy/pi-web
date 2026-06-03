import { readCachedPiWebPreferences } from "@/lib/pi-web-preferences-cache";

export interface NativeNotificationBridge {
  showNotification(input: { title?: string; body?: string; sessionId: string; sessionName?: string }): void;
}

export function getNativeBridge(): NativeNotificationBridge | null {
  if (typeof window === "undefined") return null;
  const bridge = (window as Window & { piNative?: NativeNotificationBridge }).piNative;
  return bridge?.showNotification ? bridge : null;
}

export function notificationsEnabled(): boolean {
  const prefs = readCachedPiWebPreferences();
  return prefs.notificationsEnabled !== false;
}

/** Client-safe: native shell bridge or POST to server Web Push fallback. */
export async function notifyAgentEnd(input: {
  sessionId: string;
  sessionName?: string;
}): Promise<void> {
  if (!notificationsEnabled()) return;

  const bridge = getNativeBridge();
  if (bridge) {
    bridge.showNotification({
      sessionId: input.sessionId,
      sessionName: input.sessionName,
      title: input.sessionName?.trim() || undefined,
      body: undefined,
    });
    return;
  }

  await fetch("/api/notifications/agent-end", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
