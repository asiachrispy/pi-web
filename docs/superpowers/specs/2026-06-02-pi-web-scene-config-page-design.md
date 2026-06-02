# pi-web — Scene Config Page (Slice Design)

Date: 2026-06-02
Project: `pi-web`
Status: Draft
Parent spec: `docs/superpowers/specs/2026-06-01-pi-web-enterprise-workbench-design.md`
Parent plan: `docs/superpowers/plans/2026-06-01-pi-web-enterprise-workbench-implementation-plan.md`
Parent PRD: `docs/superpowers/prd/2026-06-01-pi-web-enterprise-workbench-prd.md`

## 1. Objective

Close the MVP-3 release-gate item from the PRD: a lightweight scene configuration surface that lets a power user tweak per-scene `defaultPrompt`, `outputStyle`, and `suggestedStarters` without redeploying. Overrides are merged on top of the static scene definition at read time and are persisted in a dedicated JSON file under `~/.pi/agent/`.

## 2. Scope

In scope:

- New storage module `lib/scene-overrides.ts` with atomic write + process-level mutex (mirrors `lib/scene-metadata.ts`).
- New `SceneOverrides` type and three API routes: `GET /api/scene-overrides`, `PUT /api/scene-overrides/[sceneId]`, `DELETE /api/scene-overrides/[sceneId]`.
- A new `SceneConfigEditor` modal in the workbench, opened from a new entry in `WorkbenchSettings`.
- A read-side merge in `getSceneById` so launches use overridden values.
- Unit tests for the storage module and the new API routes.

Out of scope:

- i18n for the editor UI (deferred per project plan).
- A "Source management" UI (different MVP-3 sub-item, separate slice).
- A history / versioning mechanism for overrides.
- Per-cwd overrides (a single global file is sufficient at current scale).
- A live preview in the editor (the user can save and reload the home view to see the effect).
- A delete-override flow that prunes other fields on the same scene (we either keep the whole override or replace it via PUT).
- A server-side "edit mode" that re-emits in-flight sessions (the launch flow already copies the scene at start time; overrides are read on each new launch only).

## 3. Goals And Non-Goals

Goals:

- A user with shell access to `~/.pi/agent/` can pre-load overrides by editing `scene-overrides.json` directly; the same file is what the editor mutates.
- The editor must validate every field against the limits in §5, sanitize via the existing `sanitizePromptInput` helper, and reject 4xx requests with a clear error.
- `getSceneById` returns a merged scene in a single read; callers do not need to know whether an override exists.
- A user can reset a single scene to defaults by clicking "Reset to default" in the editor.

Non-goals:

- We are not changing the static `Scene` table or the way the homepage lists scenes.
- We are not adding a new permissions model.
- We are not introducing a new schema validator dependency; validation is hand-written.

## 4. Data Model And Storage

### `SceneOverrides`

```ts
export interface SceneOverrides {
  defaultPrompt?: string | null;
  outputStyle?: string | null;
  suggestedStarters?: string[] | null;
}
```

`null` for a field means "explicitly empty, do not fall back to static" (used by the editor's "clear" affordance for individual fields).
`undefined` (field absent from the JSON object) means "do not touch".

### File Layout

`~/.pi/agent/scene-overrides.json`:

```json
{
  "schemaVersion": 1,
  "scenes": {
    "report-generation": {
      "outputStyle": "Markdown sections with H2/H3 hierarchy and a one-line TL;DR.",
      "suggestedStarters": ["Compile this week's report", "Summarize last week's call notes"]
    }
  }
}
```

### Read / Write Semantics

- `readSceneOverrides(): Record<string, SceneOverrides>` — reads the whole file, returns an empty object if the file is missing or unparseable.
- `readSceneOverride(sceneId): SceneOverrides | null` — single-scene read with `null` when absent.
- `upsertSceneOverride(sceneId, partial): Promise<SceneOverrides>` — merges `partial` into the existing override (or creates a new entry), writes atomically (tmp + rename), returns the final value.
- `clearSceneOverride(sceneId): Promise<boolean>` — removes the sceneId entry, returns whether a row was actually deleted.

All write operations share a process-level mutex keyed on `globalThis.__piSceneOverridesWriteQueue` (same pattern as `__piProductSessionWriteQueue`).

## 5. Validation

All three override fields go through `sanitizePromptInput` with `onTruncate: "none"` and the following character limits:

| Field | Max chars | Other limits |
| --- | --- | --- |
| `defaultPrompt` | 16 000 | — |
| `outputStyle` | 500 | — |
| `suggestedStarters` (item) | 200 | max 8 items |

At least one of the three fields must be present in a PUT body, or the route returns 400.

`sceneId` must match a known scene (`getSceneById(sceneId) !== null`); otherwise the route returns 404.

## 6. API

### `GET /api/scene-overrides`

Returns the entire override map.

- Response: `{ overrides: Record<string, SceneOverrides> }`
- 200: always (empty map when the file is missing or unreadable).

### `PUT /api/scene-overrides/[sceneId]`

Upserts the override for a single scene.

- Path: `sceneId` (URL-encoded, must match a known scene).
- Body: `{ defaultPrompt?: string | null, outputStyle?: string | null, suggestedStarters?: string[] | null }`.
- Response: `{ override: SceneOverrides }` reflecting the merged state after write.
- 400: invalid body, missing all fields, or any field over its limit.
- 404: unknown `sceneId`.
- 500: filesystem failure.

### `DELETE /api/scene-overrides/[sceneId]`

Removes the override entry for a scene.

- Path: `sceneId` (must match a known scene).
- Response: `{ ok: true, cleared: boolean }` where `cleared` is true when a row was actually removed.
- 404: unknown `sceneId`.
- 500: filesystem failure.

## 7. Read-Side Merge

`getSceneById(sceneId)` is modified to read the override file once and merge the override for the requested scene:

1. Look up the static scene.
2. If no static scene, return `null` (unchanged).
3. Read the override; if absent, return the static scene unchanged.
4. For each override field:
   - `null` → keep the static value (this is the conservative choice; null means "the user cleared this field but did not want to keep it overridden").
   - `undefined` (field absent) → keep the static value.
   - any other value → replace the static value.
5. Return a new object. The static scene is never mutated.

The merge is implemented in a new function `getSceneByIdWithOverrides` (or inline in `getSceneById`); the merge logic is also exported as `mergeSceneWithOverride` for unit testing.

## 8. Frontend Wiring

### `components/WorkbenchSettings.tsx`

Add a third entry card next to Models and Skills:

- Title: "Customize scenes"
- Body: "Override default prompts, output style, and suggested starters per scene."
- onClick: opens the `SceneConfigEditor` modal.

### `components/SceneConfigEditor.tsx`

A modal listing the four known scenes. For each scene, an expandable section with three editable fields:

- `defaultPrompt`: textarea, monospaced font, current static + override shown side-by-side or as "currently: <merged>".
- `outputStyle`: single-line input.
- `suggestedStarters`: dynamic list of inputs (max 8), with add/remove buttons.
- Footer of the section: "Reset to default" (calls DELETE), "Cancel" (closes without saving), "Save" (calls PUT).

The modal closes on Escape, on backdrop click, and on the explicit Close button in the header.

After a successful PUT or DELETE, the page calls `invalidateControlResourcesMatching(...)` (or the specific `workbench:scenes` key) so the home view refetches.

## 9. Edge Cases

- **Override file is corrupt (invalid JSON)**: the read function returns an empty object. A warn is logged; the user can rewrite the file by saving any override through the editor.
- **Override file is missing**: same as corrupt — empty object.
- **`sceneId` is in the override but not in the static table**: silently ignored on read. The editor does not show such a scene.
- **Multiple concurrent PUTs to the same scene**: serialized by the mutex; the last write wins.
- **Editor opened in two tabs**: each tab reads the file independently. The last tab to save wins. We do not implement cross-tab locking; that is a separate slice.
- **User clears `outputStyle` via the editor (sends `null`)**: the merge treats `null` as "keep static" — i.e., the user cannot clear a single field. To remove the override entirely, use "Reset to default".

  This is a deliberate simplification for v1. A "clear this field only" affordance is straightforward to add later without a schema change.

## 10. Testing

- `lib/scene-overrides.test.ts` (~8 cases):
  - `readSceneOverrides` returns `{}` when the file is missing.
  - `readSceneOverrides` parses a valid file.
  - `readSceneOverrides` returns `{}` for corrupt JSON.
  - `upsertSceneOverride` creates a new entry when none exists.
  - `upsertSceneOverride` merges into an existing entry.
  - `upsertSceneOverride` writes atomically (writes to a temp file then renames).
  - Concurrent `upsertSceneOverride` calls do not interleave their writes.
  - `clearSceneOverride` returns `false` when nothing was removed.

- `lib/scenes.test.ts` (+2 cases):
  - `getSceneById` returns the static scene when no override exists.
  - `getSceneById` returns a merged scene when an override is present, and a `null` value preserves the static field.

- `app/api/scene-overrides/route.test.ts` (~2 cases):
  - GET returns 200 with the override map.
  - GET returns 500 when the storage layer throws.

- `app/api/scene-overrides/[sceneId]/route.test.ts` (~6 cases):
  - PUT happy path returns 200 with the merged override.
  - PUT returns 400 when all fields are missing.
  - PUT returns 400 when a field exceeds its limit.
  - PUT returns 404 for an unknown `sceneId`.
  - DELETE happy path returns 200 with `cleared: true`.
  - DELETE returns 404 for an unknown `sceneId`.

## 11. Validation

Run from the repo root:

- `node_modules/.bin/tsc --noEmit` — zero errors
- `node_modules/.bin/vitest run` — all tests green
- `npm run lint` — no new warnings

## 12. Files Touched

New (5 production, 3 tests):

- `lib/scene-overrides.ts`
- `app/api/scene-overrides/route.ts`
- `app/api/scene-overrides/[sceneId]/route.ts`
- `components/SceneConfigEditor.tsx`
- `lib/scene-overrides.test.ts`
- `app/api/scene-overrides/route.test.ts`
- `app/api/scene-overrides/[sceneId]/route.test.ts`

Modified (2):

- `lib/scenes.ts` (add override read + merge in `getSceneById`)
- `components/WorkbenchSettings.tsx` (add the entry card + modal opener)

No new dependencies, no docs added.

## 13. Risk Register

| Risk | Mitigation |
| --- | --- |
| The editor corrupts the override file (mid-write crash) | Atomic write (tmp + rename) guarantees the file is either old or new, never partial |
| Concurrent editors write stale data | Process-level mutex serializes writes |
| A user accidentally clears a single field by setting it to `null` | Documented in the editor; "Reset to default" is the explicit way to remove an override |
| Override breaks the existing scene launch flow | `getSceneById` always returns a valid `Scene` (with the static definition as fallback) |
| The 4-scene list grows and the editor becomes unmaintainable | The editor is data-driven; adding scenes is automatic via the static `SCENES` table |

## 14. Out-Of-Scope Hooks (Follow-Up Candidates)

These are deliberately not in this slice; they remain candidate follow-ups:

- `automation.run` actually launches a session and writes metadata.
- A history detail page (already delivered in the previous slice).
- i18n for the editor and other workbench strings.
- Wiring the smoke script into CI.
- A dedicated "Source management" UI (PRD §16).
