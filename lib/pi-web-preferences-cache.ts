import type { PiWebPreferences } from "@/lib/pi-web-preferences";

const CACHE_KEY = "pi-web-preferences-cache";

/** Browser-only mirror of server preferences (set after GET/PUT /api/preferences). */
export function readCachedPiWebPreferences(): PiWebPreferences {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PiWebPreferences;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function cachePiWebPreferences(prefs: PiWebPreferences): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore quota / private mode
  }
}
