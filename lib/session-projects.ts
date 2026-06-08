import type { SessionInfo } from "./types";

type SessionProjectInfo = Pick<SessionInfo, "cwd" | "modified">;

/** Return all project cwds sorted by most recently active session. */
export function getProjectCwds(sessions: SessionProjectInfo[]): string[] {
  const latestByCwd = new Map<string, string>();
  for (const session of sessions) {
    if (!session.cwd) continue;
    const prev = latestByCwd.get(session.cwd);
    if (!prev || session.modified > prev) {
      latestByCwd.set(session.cwd, session.modified);
    }
  }
  return [...latestByCwd.entries()]
    .sort((a, b) => b[1].localeCompare(a[1]))
    .map(([cwd]) => cwd);
}

/**
 * Patterns that identify the OS temp directory across platforms.
 * Kept as pure string regexes so the function can run in the browser bundle
 * (the project picker is rendered client-side and falls back to this when
 * the API is unreachable).
 *
 *  - macOS: `/var/folders/<bucket>/<bucket>/T/...` (and the `/private` real path)
 *  - Linux/other Unix: `/tmp` and `/private/tmp`
 *  - Windows: `%TEMP%` resolves to `C:\Users\<user>\AppData\Local\Temp\...`
 */
const SYSTEM_TEMP_PATTERNS: RegExp[] = [
  /^\/tmp\//,
  /^\/tmp$/,
  /^\/private\/tmp\//,
  /^\/private\/tmp$/,
  /^\/var\/folders\/[^/]+\/[^/]+\/T\//,
  /^\/var\/folders\/[^/]+\/[^/]+\/T$/,
  /^\/private\/var\/folders\/[^/]+\/[^/]+\/T\//,
  /^\/private\/var\/folders\/[^/]+\/[^/]+\/T$/,
  /^[A-Za-z]:\\Users\\[^\\]+\\AppData\\Local\\Temp\\/i,
  /^[A-Za-z]:\\Windows\\Temp\\/i,
];

/**
 * True when the cwd is the OS temp directory or sits inside it.
 * Sessions created by automated tests (e.g. `pi-runtime` using
 * `mkdtemp` under `os.tmpdir()`) would otherwise flood the project
 * picker with one project per process invocation.
 */
export function isSystemTempCwd(cwd: string): boolean {
  if (!cwd) return false;
  return SYSTEM_TEMP_PATTERNS.some((re) => re.test(cwd));
}

/**
 * Project cwds suitable for the picker dropdown: real user projects only.
 * Filters out sessions whose cwd is the OS temp directory (auto-generated
 * by test harnesses that call `mkdtemp` per process). Returns the same
 * dedup/sort order as {@link getProjectCwds}.
 */
export function getPickerCwds(sessions: SessionProjectInfo[]): string[] {
  return getProjectCwds(sessions).filter((cwd) => !isSystemTempCwd(cwd));
}

/**
 * Return the most recently modified session for a given cwd, or null.
 *
 * Used by the sidebar to auto-open the latest session when the user picks
 * a project from the dropdown. Ties on `modified` are broken by descending
 * session id (lexicographic) so the result is deterministic.
 *
 * Sessions with missing or empty `cwd` / `modified` are treated as
 * non-candidates and never throw.
 */
export function pickMostRecentSession<T extends Pick<SessionInfo, "cwd" | "modified" | "id">>(
  sessions: T[],
  cwd: string | null,
): T | null {
  if (!cwd) return null;
  let best: T | null = null;
  for (const s of sessions) {
    if (!s || !s.cwd || !s.modified) continue;
    if (s.cwd !== cwd) continue;
    if (
      !best ||
      s.modified > best.modified ||
      (s.modified === best.modified && s.id > best.id)
    ) {
      best = s;
    }
  }
  return best;
}
