import fs from "node:fs";
import path from "path";

const WINDOWS_ABSOLUTE_RE = /^[a-zA-Z]:[\\/]/;

export type ParsedByteRange =
  | { start: number; end: number }
  | { error: "invalid" | "unsatisfiable" };

export function normalizeSlashes(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

export function isWindowsAbsolutePath(filePath: string): boolean {
  return WINDOWS_ABSOLUTE_RE.test(filePath) || filePath.startsWith("\\\\") || filePath.startsWith("//");
}

export function filePathFromSegments(segments: string[]): string {
  const joined = segments.join("/");
  const slashJoined = normalizeSlashes(joined);
  if (isWindowsAbsolutePath(slashJoined)) return slashJoined;
  return "/" + joined.replace(/^\/+/, "");
}

/** Read a single file path only when it stays inside the allowed roots. */
export function canReadFilePath(target: string, allowedRoots: Set<string>): boolean {
  return isPathAllowed(target, allowedRoots) && isRealPathAllowed(target, allowedRoots);
}

export function isPathAllowed(target: string, allowedRoots: Set<string>): boolean {
  for (const root of allowedRoots) {
    const useWindowsRules = isWindowsAbsolutePath(target) || isWindowsAbsolutePath(root);
    const resolver = useWindowsRules ? path.win32 : path;
    const sep = useWindowsRules ? "\\" : path.sep;
    const normalized = resolver.resolve(target);
    const normalizedRoot = resolver.resolve(root);
    const comparable = useWindowsRules ? normalized.toLowerCase() : normalized;
    const comparableRoot = useWindowsRules ? normalizedRoot.toLowerCase() : normalizedRoot;
    const rootWithSep = comparableRoot.endsWith(sep) ? comparableRoot : comparableRoot + sep;
    if (comparable === comparableRoot || comparable.startsWith(rootWithSep)) {
      return true;
    }
  }
  return false;
}

export function isRealPathAllowed(target: string, allowedRoots: Set<string>): boolean {
  let realTarget: string;
  try {
    realTarget = fs.realpathSync(target);
  } catch {
    return false;
  }

  const realRoots = new Set<string>();
  for (const root of allowedRoots) {
    try {
      realRoots.add(fs.realpathSync(root));
    } catch {
      // Ignore stale session cwd entries and other roots that no longer exist.
    }
  }
  return isPathAllowed(realTarget, realRoots);
}

/**
 * Allow a file the agent actually referenced in the active session, even when it
 * sits outside the cwd-derived allowed roots. `referencedFiles` must already hold
 * absolute paths (resolved against the session cwd). Symlinks are compared by
 * realpath, so a symlinked target can only resolve to a referenced file — this
 * cannot be used to escape to an unreferenced path.
 */
export function isReferencedFileAllowed(target: string, referencedFiles: Set<string>): boolean {
  if (referencedFiles.size === 0) return false;
  if (referencedFiles.has(path.resolve(target))) return true;

  let realTarget: string;
  try {
    realTarget = fs.realpathSync(target);
  } catch {
    return false;
  }
  if (referencedFiles.has(realTarget)) return true;
  for (const ref of referencedFiles) {
    try {
      if (fs.realpathSync(ref) === realTarget) return true;
    } catch {
      // Ignore referenced files that no longer exist on disk.
    }
  }
  return false;
}

export function parseByteRange(rangeHeader: string, size: number): ParsedByteRange {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match) return { error: "invalid" };
  if (!match[1] && !match[2]) return { error: "invalid" };

  let start = match[1] ? Number(match[1]) : 0;
  let end = match[2] ? Number(match[2]) : size - 1;
  if (!match[1] && match[2]) {
    const suffixLength = Number(match[2]);
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  }

  if (
    !Number.isSafeInteger(start)
    || !Number.isSafeInteger(end)
    || start < 0
    || end < start
    || start >= size
  ) {
    return { error: "unsatisfiable" };
  }

  return { start, end: Math.min(end, size - 1) };
}
