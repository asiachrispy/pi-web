# pi-web — Richer History & Smart Next Step (Slice Design)

Date: 2026-06-02
Project: `pi-web`
Status: Draft
Parent spec: `docs/superpowers/specs/2026-06-01-pi-web-enterprise-workbench-design.md`
Parent plan: `docs/superpowers/plans/2026-06-01-pi-web-enterprise-workbench-implementation-plan.md`
Parent PRD: `docs/superpowers/prd/2026-06-01-pi-web-enterprise-workbench-prd.md`

## 1. Objective

Fill the remaining Phase 4 ("Workbench Hardening") gaps from the implementation plan:

- "richer history metadata"
- "better action surfaces"

…with one focused, reviewable slice. No new product surface beyond what is needed for the two items.

## 2. Scope

In scope:

- Hook the assistant-message lifecycle to update `ProductSessionMetadata.lastResultSummary` and `status` when an agent run ends.
- Add a conservative "smart next step" surface in `SceneHeader` that highlights the most relevant action for the latest assistant output.
- Pure-function library modules for the summary extraction and the suggestion rule, so both behaviors are unit-testable without React.
- One new API route: `PATCH /api/product-sessions/[id]` to accept metadata updates from the frontend.

Out of scope (kept explicit to prevent scope creep):

- Backend agent-side metadata writes (frontend remains the single writer for this slice).
- i18n / localization of workbench strings.
- A dedicated history detail page (independent slice).
- Scene configuration editing page (PRD §14 MVP-3; independent slice).
- Wiring `scripts/workbench-smoke.mjs` to CI (independent slice).
- Multilingual or translation-aware summary extraction.
- Updating automation-run metadata on `POST /api/automation/run` (independent slice).

## 3. Goals And Non-Goals

Goals:

- History rows show a meaningful, runtime-derived summary instead of the static first-message fallback.
- History rows reflect whether the run has produced any assistant output (`draft` / `active` / `completed`).
- The scene action bar surfaces a single, non-intrusive "suggested next step" that reflects the most recent assistant text.

Non-goals:

- We are not introducing a recommendation model. Suggestions are deterministic and rule-based.
- We are not changing the runtime agent contract or `startRpcSession` lifecycle.
- We are not changing the storage shape of `ProductSessionMetadata`; we only mutate two existing fields.

## 4. Data Flow

End-to-end trace for a user running the Enterprise Knowledge scene.

1. User opens the workbench home and clicks **Open** on a scene card.
2. `AppShell` posts to `POST /api/scenes/[id]/launch`. The launch route starts the RPC session and `upsertProductSessionMetadata` with `status: "active"`, a title derived from the first user message, and an empty `lastResultSummary`.
3. The frontend opens the SSE connection to the new agent session. `ChatWindow` mounts with the existing `latestAssistantText` ref initialized to empty.
4. The user submits a question. The agent streams a response. `latestAssistantText` is updated as text arrives.
5. The agent run ends. `useAgentSession` fires its existing `onAgentEnd` callback.
6. `ChatWindow` reacts:
   - Computes `summary = summarizeForHistory(latestAssistantText, 120)`.
   - Fire-and-forget `PATCH /api/product-sessions/[id]` with `{ lastResultSummary: summary, status: "completed" }`.
   - On success, calls `invalidateControlResource("workbench:history:recent")` so the next home visit refreshes.
   - On failure, logs `console.warn` and continues. The chat surface is never blocked by a metadata write.
7. The user navigates back to the home page. The history row now shows the new summary and the scene name.

The `PATCH` call reuses the existing process-level write queue in `lib/scene-metadata.ts` so concurrent runs on the same session serialize correctly.

## 5. Backend API

### `PATCH /api/product-sessions/[id]`

- Method: `PATCH`
- Path param: `id` (session id; URL-encoded)
- Request body (all fields optional, but at least one required):
  - `lastResultSummary: string` (max 240 chars, will be sanitized server-side)
  - `status: "active" | "completed" | "draft"`
- Response: `{ ok: true, metadata: ProductSessionMetadata }` on success.
- Errors:
  - `400` when the body is missing, has unknown fields, or has no recognized fields.
  - `400` when `lastResultSummary` exceeds the clamp.
  - `400` when `status` is not one of the allowed values.
  - `500` when the metadata file cannot be written.

The route handler:

1. Parses JSON body, returns 400 on parse error.
2. Validates the body against a hand-written validator (no new schema dependency).
3. Calls `readProductSessionMetadata(id)` to fetch the current record. If the record is missing, returns 404. We deliberately do not auto-create a row from the frontend; the launch route is the canonical creator.
4. Calls `upsertProductSessionMetadata(id, merged)` with the merged record.
5. Returns 200 with the merged record.

## 6. Frontend Wiring

### `components/ChatWindow.tsx`

- Add a memoized `suggestedActionId = suggestNextStep(latestAssistantText, scene, lastActionIdRef.current)`.
- Add a memoized `lastResultSummary = summarizeForHistory(latestAssistantText, 120)` for use both by the PATCH and the SceneHeader subtitle.
- In the existing `onAgentEnd` callback, schedule the PATCH call after the React render so it does not block UI updates. The call is wrapped in a try/catch; failures are logged.
- Track `lastActionIdRef` so the suggestion rule can know which action the user just triggered.
- Pass `suggestedActionId` and `lastResultSummary` to `SceneHeader`.

### `components/ChatWindow.SceneHeader`

- Accept two new optional props: `suggestedActionId: string | null` and `lastResultSummary: string`.
- When `suggestedActionId` matches an action in `actions`, render that action's button with a `border-accent` class and a small `Suggested` text label inside the button.
- When `lastResultSummary` is non-empty, render it as a one-line subtitle below the scene description (truncated via CSS `line-clamp`).

### `hooks/useAgentSession.ts`

- No changes. The hook already exposes `onAgentEnd` and the streamed text reaches `ChatWindow` via existing `useEffect` updates.

## 7. New Library Modules

### `lib/history-summary.ts`

```ts
export function summarizeForHistory(text: string, maxLength: number = 120): string;
```

Behavior:

- Empty or whitespace-only input returns `""`.
- Strips control characters via `sanitizePromptInput(text, { maxChars: 240, onTruncate: "none" })` first.
- Splits on the first sentence terminator (`.`, `?`, `!`, `;`, or newline) and trims.
- If the chosen sentence is longer than `maxLength`, returns `${sentence.slice(0, maxLength - 1).trimEnd()}…`.
- Otherwise returns the sentence unchanged.
- Pure, side-effect free.

### `lib/next-step-suggestion.ts`

```ts
export function suggestNextStep(
  latestText: string,
  scene: Scene,
  lastActionId: string | null,
): SceneAction | null;
```

Behavior (first match wins):

1. If `latestText` is empty or shorter than 60 characters, return `null`.
2. If `latestText` is longer than 1500 characters and the scene exposes an action whose `normalizeActionId` matches `summarize`, return that action.
3. If `lastActionId` matches `refine-output` and the scene exposes an action whose id is `export-result`, return that action.
4. If `scene.id === "customer-communication"`, `latestText` contains at least one `?` or two `!` characters, and the scene exposes an action whose `normalizeActionId` matches `followup` or id matches `draft-reply`, return that action.
5. Otherwise return `null`.

`normalizeActionId` is imported from `lib/scene-action-policy.ts`.

The module is pure and dependency-free aside from the `Scene` and `SceneAction` types.

## 8. Edge Cases

- **General chat (no sceneId)**: `useAgentSession` does not know about scene metadata, and `ChatWindow` only schedules the PATCH when `scene` is non-null. No metadata is written for non-scene sessions.
- **Session never produced an assistant message**: `latestAssistantText` is empty, so `summarizeForHistory` returns `""` and the PATCH still runs to set `status: "completed"`. The summary field remains the previous value (or empty from launch).
- **PATCH 404 (no metadata row)**: This can happen if the user opens an existing non-scene session in the workbench UI. We log a warn and proceed; no retry.
- **Network failure**: Caught at the fetch boundary in `ChatWindow`. Logged via `console.warn`. The session is unaffected.
- **Concurrent agent runs on the same session**: Unusual but possible. The metadata write queue in `lib/scene-metadata.ts` serializes them. Whichever PATCH resolves last wins; both updates are valid.
- **The user clicks a `copy` or `export` action**: These do not trigger an `onAgentEnd`, so metadata is not updated. This is intentional: copy/export are downstream of an existing assistant message; the metadata already reflects that message.
- **The latest assistant text contains only control characters or whitespace**: `summarizeForHistory` returns `""`. The PATCH still runs.

## 9. Testing Strategy

Unit tests, all runnable via `vitest run`:

- `lib/history-summary.test.ts` (~8 cases)
  - Empty input returns empty.
  - Whitespace-only input returns empty.
  - Single-sentence input returns the sentence.
  - Multi-sentence input returns the first sentence.
  - Input longer than `maxLength` returns truncated with ellipsis.
  - Input with control characters is sanitized.
  - Newline-as-terminator behavior.
  - Trailing punctuation stripped from the first sentence.
- `lib/next-step-suggestion.test.ts` (~12 cases)
  - Each of the 4 rules' hit cases.
  - Default miss.
  - Scene with no matching action falls through to `null`.
  - Empty `latestText` returns `null`.
  - `lastActionId` ignored when the refine→export rule does not apply.
  - `lastActionId` set to `refine-output` returns `export-result` action when present.
  - Customer-communication scene with question mark returns followup-style action.
  - Customer-communication scene without punctuation returns `null`.
- `app/api/product-sessions/[id]/route.test.ts` (~5 cases)
  - Happy path returns 200 with merged record.
  - Missing body returns 400.
  - Body with no recognized fields returns 400.
  - Unknown session id returns 404.
  - Validator rejects `status` outside the enum (returns 400).

No new frontend tests; the React layer is a thin pass-through and is covered by `tsc --noEmit`.

## 10. Validation

Run from the repo root:

- `node_modules/.bin/tsc --noEmit` — must pass with zero errors.
- `node_modules/.bin/vitest run` — all existing tests plus the new ones must pass.
- `npm run lint` — no new warnings.

## 11. Files Touched

New (3):

- `lib/history-summary.ts`
- `lib/next-step-suggestion.ts`
- `app/api/product-sessions/[id]/route.ts`

Tests (3):

- `lib/history-summary.test.ts`
- `lib/next-step-suggestion.test.ts`
- `app/api/product-sessions/[id]/route.test.ts`

Modified (1):

- `components/ChatWindow.tsx`

Total: 4 production files changed, 3 test files added, 0 docs added.

## 12. Risk Register

| Risk | Mitigation |
| --- | --- |
| PATCH writes become a hot path and slow the chat | Fire-and-forget, never awaited in the render path; failures only warn |
| `summarizeForHistory` truncation drops key information | The home page only displays this as a one-line subtitle; the full assistant text remains in the session file |
| Suggestion rules misfire and confuse users | v1 is conservative (4 rules, each with a clear precondition); false negatives are acceptable, false positives are not |
| 404 on existing non-scene sessions | Logged as warn; the chat still works; the user sees the existing fallback summary |
| Concurrent PATCH writes lose data | The `__piProductSessionWriteQueue` mutex in `lib/scene-metadata.ts` serializes them |

## 13. Out-Of-Scope Hooks (Follow-Up Candidates)

These are deliberately not in this slice; they remain candidate follow-ups:

- `automation/run` writes its own metadata.
- A history detail page that surfaces `lastResultSummary` plus sources, actions, and message count.
- Scene configuration editing (PRD §14 MVP-3).
- i18n for workbench strings.
- Wiring the smoke script into CI.
