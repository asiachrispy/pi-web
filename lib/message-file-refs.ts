/** Pi-compatible file path references for prompt text (agent uses read tool). */

const FILE_REF_RE = /<file name="([^"]+)"(?: label="([^"]*)")?><\/file>\s*/g;
const STAGED_UUID_PREFIX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i;

export interface FilePathRef {
  path: string;
  label: string;
}

export type FileAttachmentKind = "pdf" | "excel" | "word" | "markdown" | "generic";

function escapeXmlAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function unescapeXmlAttr(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

export function formatFileReference(path: string, label?: string): string {
  const display = label?.trim();
  if (display) {
    return `<file name="${escapeXmlAttr(path)}" label="${escapeXmlAttr(display)}"></file>`;
  }
  return `<file name="${escapeXmlAttr(path)}"></file>`;
}

export function appendFileRefsToMessage(message: string, refs: FilePathRef[]): string {
  if (!refs.length) return message;
  const blocks = refs.map((r) => formatFileReference(r.path, r.label));
  const trimmed = message.trim();
  if (!trimmed) return blocks.join("\n");
  return `${trimmed}\n\n${blocks.join("\n")}`;
}

export function basenameFromPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

/** Original filename from staged `{uuid}_{name}` or absolute path basename. */
export function displayNameFromFilePath(filePath: string, label?: string): string {
  if (label?.trim()) return unescapeXmlAttr(label.trim());
  const base = basenameFromPath(filePath);
  const stripped = base.replace(STAGED_UUID_PREFIX, "");
  return stripped.length > 0 ? stripped : base;
}

export function normalizeFilePathRef(ref: Partial<FilePathRef> & { path: string }): FilePathRef {
  const path = ref.path;
  const rawLabel = ref.label ?? (ref as { name?: string }).name;
  const label = typeof rawLabel === "string" && rawLabel.trim()
    ? rawLabel.trim()
    : displayNameFromFilePath(path);
  return { path, label };
}

export function fileAttachmentKindFromName(fileName: string | undefined | null): FileAttachmentKind {
  if (!fileName) return "generic";
  const dot = fileName.lastIndexOf(".");
  const ext = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : "";
  if (ext === "pdf") return "pdf";
  if (ext === "xls" || ext === "xlsx" || ext === "csv") return "excel";
  if (ext === "doc" || ext === "docx") return "word";
  if (ext === "md" || ext === "markdown") return "markdown";
  return "generic";
}

export function extractFileRefsFromText(text: string): FilePathRef[] {
  const refs: FilePathRef[] = [];
  for (const match of text.matchAll(FILE_REF_RE)) {
    const path = match[1] ? unescapeXmlAttr(match[1]) : "";
    if (!path) continue;
    const label = match[2] !== undefined ? unescapeXmlAttr(match[2]) : "";
    refs.push({ path, label: displayNameFromFilePath(path, label) });
  }
  return refs;
}

/** Remove file ref tags for chat display; returns user-visible text and refs. */
export function stripFileRefsForDisplay(text: string): { text: string; refs: FilePathRef[] } {
  const refs: FilePathRef[] = [];
  const cleaned = text
    .replace(FILE_REF_RE, (_, path: string, label?: string) => {
      const decodedPath = unescapeXmlAttr(path);
      refs.push({
        path: decodedPath,
        label: displayNameFromFilePath(decodedPath, label !== undefined ? unescapeXmlAttr(label) : undefined),
      });
      return "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text: cleaned, refs };
}
