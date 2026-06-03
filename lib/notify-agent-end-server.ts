import { notifyAgentFinished } from "@/lib/push-notifications";
import { loadPiWebPreferences } from "@/lib/pi-web-preferences";

export async function notifyAgentEnd(input: {
  sessionId: string;
  sessionName?: string;
}): Promise<void> {
  const prefs = loadPiWebPreferences();
  if (prefs.notificationsEnabled === false) return;
  await notifyAgentFinished(input);
}
