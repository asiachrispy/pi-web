# pi-web — Auto-open the most recent session when picking a project

Date: 2026-06-08
Project: `pi-web` (Next.js 14 web UI, port 30142 dev / 30141 prod)
Status: Draft (awaiting user review)
Parent spec: `docs/superpowers/specs/2026-06-01-pi-web-enterprise-workbench-design.md`
Parent plan: `docs/superpowers/plans/2026-06-01-pi-web-enterprise-workbench-implementation-plan.md`

## 1. Objective

When the user explicitly picks a project in the left sidebar dropdown, the
workbench should open the most recent session for that project and scroll the
chat to the latest content — instead of dumping the user on the empty
`WorkbenchHome` placeholder. The existing "user clicks a session in the
session list" flow is unchanged.

This is a small, user-visible UX change with a tight blast radius: a single
new branch in the sidebar dropdown click handler, a defensive guard in
`AppShell.handleCwdChange`, and one new pure helper for the "pick most recent
session for a cwd" decision.

## 2. Scope

In scope:

- New pure helper `pickMostRecentSession(sessions, cwd): SessionInfo | null`
  in `lib/session-projects.ts` (where the existing `getProjectCwds` /
  `getPickerCwds` already live).
- Sidebar dropdown (`components/SessionSidebar.tsx`): when the user clicks a
  project whose cwd differs from the currently active `filterCwd`, the click
  handler picks the most recent session for the new cwd and calls the
  existing `onSelectSession(mostRecent)` callback.
- `AppShell.handleCwdChange` (`components/AppShell.tsx`): if the new cwd
  already has a `selectedSession` whose `.cwd` matches (i.e. the sidebar just
  opened one), skip the destructive reset-to-home step. The session-id update
  and session-list refresh still happen so the sidebar's selection state and
  the URL stay in sync.
- Unit tests for `pickMostRecentSession` covering: zero sessions, single
  session, multiple sessions sorted by `modified` desc, and orphan / missing
  `cwd` defensive cases.
- `CHANGELOG.md` "Unreleased" entry.

Out of scope (explicit non-goals to keep the slice small):

- The cold-start path (`useEffect` inside `SessionSidebar` that auto-picks
  `cwds[0]` when nothing is selected). Initial page load continues to land on
  `WorkbenchHome`.
- The URL `?session=xxx` initial restore path (`restoredRef` + `onInitialRestoreDone`).
- The "auto-create a new session when the project is empty" flow. Empty
  projects keep showing `WorkbenchHome` with the "新建会话" button.
- Changing the chat scroll algorithm itself; we rely on the existing
  `scrollToBottom("instant")` in `useAgentSession`'s first-load effect, which
  already runs whenever a fresh `ChatWindow` instance receives messages.
- Any new i18n strings.
- Backend / API changes — no new routes, no schema changes.
- Macros / scene header / workbench home visual changes.

## 3. Goals and Non-Goals

Goals:

- Selecting a project with at least one session opens that session
  automatically; the chat scrolls to the latest content.
- Selecting a project with zero sessions behaves exactly as today
  (`WorkbenchHome` placeholder, user can click `+`).
- Switching from project A (with a session open) to project B (with sessions)
  closes A's chat and opens B's most recent session in one click; URL updates
  to the new session id.
- The behavior is fully testable from pure-function unit tests; the
  Sidebar/AppShell change is just wiring the new helper.

Non-goals:

- We are not introducing any ranking algorithm beyond "most recent by
  `modified`" (the same key `getProjectCwds` already sorts by).
- We are not changing the sidebar's empty / error / loading UI.
- We are not changing the workbench home, scene header, or chat window.
- We are not introducing a "remember the last session per project" cache; the
  `SessionInfo.modified` field is sufficient.

## 4. Data Flow

### 4.1. Click a project in the sidebar dropdown (new behavior)

1. User clicks a project button in the dropdown. The click handler runs
   inside `SessionSidebar`.
2. If `cwd === filterCwd` (already on this project), the handler does exactly
   what it does today (close dropdown, no state change).
3. Otherwise:
   a. Call `pickMostRecentSession(allSessions, cwd)`.
      - Returns the `SessionInfo` with the largest `modified` timestamp among
        `s.cwd === cwd`. Ties broken by string comparison on `id` for
        determinism.
      - Returns `null` if no session matches the cwd.
   b. If a session is returned, call `onSelectSession(mostRecent)` — the
      same callback used when a user clicks a session in the list. The parent
      (`AppShell.handleSelectSession`) does the canonical work: sets
      `selectedSession`, flips `workbenchView` to `"chat"`, bumps
      `sessionKey` to remount `ChatWindow`, clears `newSessionCwd`, updates
      URL to `?session=<id>`.
   c. In all cases, the local `setSelectedCwd(cwd)` runs (so the dropdown
      closes, the filter updates, and the sidebar's `filterCwd` reflects the
      new project). For empty projects this still triggers
      `onCwdChange(cwd)` → `handleCwdChange(cwd)`, which now sees
      `selectedSession` is null and falls through to the existing
      reset-to-home path. For non-empty projects the same call chain runs
      and the new guard in `handleCwdChange` short-circuits (see 4.2).
4. `ChatWindow` mounts, `useAgentSession` loads the session's messages via
   `GET /api/sessions/<id>?includeState`, then the existing
   `useEffect([messages.length, …])` in `useAgentSession` calls
   `scrollToBottom("instant")` because `initialScrollDoneRef` is fresh after
   the remount.

### 4.2. `handleCwdChange` after the dropdown click

Current behavior (buggy for this feature):

```ts
const handleCwdChange = useCallback((cwd: string | null) => {
  setActiveCwd(cwd);
  if (!cwd || suppressCwdBumpRef.current) return;
  setSelectedSession((prev) => (prev && prev.cwd !== cwd ? null : prev));
  setNewSessionCwd((prev) => (prev && prev !== cwd ? null : prev));
  setWorkbenchView("home");         // <-- destructive
  setSessionKey((k) => k + 1);       // <-- remounts ChatWindow
  setRefreshKey((k) => k + 1);
  resetChatChrome();
  router.replace("/", { scroll: false });
}, [resetChatChrome, router]);
```

New behavior:

- Add a `selectedSessionRef` that mirrors `selectedSession` on every render
  (no extra renders; just a ref assignment).
- In the function, **after** the existing `setSelectedSession` updater runs,
  check `selectedSessionRef.current`. If it is non-null and its `cwd`
  matches the new cwd, **return early** — the dropdown already opened the
  right session, the URL was already replaced by `handleSelectSession`, and
  we don't want to clear it.
- The early-return path still benefits from the existing
  `setSelectedSession` / `setNewSessionCwd` updaters: they normalize state
  in case a stale `selectedSession` from a different cwd is hanging around.

```ts
const selectedSessionRef = useRef<SessionInfo | null>(selectedSession);
selectedSessionRef.current = selectedSession; // set every render

const handleCwdChange = useCallback((cwd: string | null) => {
  setActiveCwd(cwd);
  if (!cwd || suppressCwdBumpRef.current) return;
  setSelectedSession((prev) => (prev && prev.cwd !== cwd ? null : prev));
  setNewSessionCwd((prev) => (prev && prev !== cwd ? null : prev));

  // If the sidebar already opened a session for this cwd, keep the chat
  // view; do not reset to home or remount ChatWindow.
  if (selectedSessionRef.current && selectedSessionRef.current.cwd === cwd) {
    setRefreshKey((k) => k + 1); // re-fetch the sidebar list, cheap
    return;
  }

  setWorkbenchView("home");
  setSessionKey((k) => k + 1);
  setRefreshKey((k) => k + 1);
  resetChatChrome();
  router.replace("/", { scroll: false });
}, [resetChatChrome, router]);
```

### 4.3. Edge case: clicking the *same* project again

`filterCwd` equals the clicked `cwd`, so the click handler short-circuits at
step 2 in §4.1. No behavior change.

### 4.4. Edge case: project has zero sessions

`pickMostRecentSession` returns `null`. The click handler skips
`onSelectSession` and falls through to the existing
`setSelectedCwd(cwd)` path. `handleCwdChange` runs with
`selectedSessionRef.current === null` and takes the existing
reset-to-home path. The user sees `WorkbenchHome` exactly as before.

## 5. The `pickMostRecentSession` Helper

Signature (in `lib/session-projects.ts`):

```ts
import type { SessionInfo } from "./types";

/**
 * Return the most recently modified SessionInfo for a given cwd,
 * or null if there is none. Ties on `modified` are broken by descending
 * session id (lexicographic), giving a stable order.
 */
export function pickMostRecentSession(
  sessions: SessionInfo[],
  cwd: string | null,
): SessionInfo | null {
  if (!cwd) return null;
  let best: SessionInfo | null = null;
  for (const s of sessions) {
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
```

This is intentionally a one-pass O(n) scan (no `filter`+`sort` allocation),
keeps the existing `getProjectCwds` / `getPickerCwds` style, and is
importable from the test file.

## 6. Files Touched

| File | Change |
| --- | --- |
| `lib/session-projects.ts` | Add `pickMostRecentSession` export. |
| `lib/session-projects.test.ts` (new) | Unit tests for the helper. |
| `components/SessionSidebar.tsx` | Dropdown click handler: import the helper, add the auto-pick branch. |
| `components/AppShell.tsx` | Add `selectedSessionRef`; guard `handleCwdChange`. |
| `CHANGELOG.md` | Unreleased entry under "Changed". |

No new dependencies. No `package.json` change. No API change.

## 7. Test Plan

Vitest unit tests in `lib/session-projects.test.ts`:

1. **No matching session** — sessions list is empty, or none share the cwd →
   returns `null`.
2. **Single matching session** → returns that session.
3. **Multiple matching sessions** → returns the one with the largest
   `modified` value.
4. **Tie on `modified`** → returns the one with the lexicographically larger
   `id` (deterministic).
5. **Defensive: `cwd` is null or empty** → returns `null`.
6. **Defensive: `sessions` items missing `cwd` or `modified`** → they are
   simply not candidates; does not throw.
7. **Sessions from a different cwd are ignored.**

Manual verification:

- `node_modules/.bin/tsc --noEmit` clean.
- `npm run lint` clean.
- `npm run test:run` clean.
- In dev (port 30142):
  - Open the app, click a project that has at least one session → chat opens
    for the most recent session, scrolled to the bottom.
  - Click another project (also with sessions) → chat swaps to that
    project's most recent session; URL is `?session=…` of the new session.
  - Click a project with zero sessions → `WorkbenchHome` is shown (unchanged).
  - Cold-start with no `?session=` URL → still lands on `WorkbenchHome`.

## 8. Risks & Mitigations

- **Race: `selectedSessionRef.current` is stale at the time
  `handleCwdChange` runs.** The ref is updated on every render. The sidebar
  effect that calls `onCwdChange` only fires after the parent has rendered
  with the new `selectedSession` (set in the same click handler), so the
  ref is up to date by the time the effect runs. We also keep the existing
  `setSelectedSession` updater as a second line of defense.
- **`router.replace("/")` in `handleCwdChange` would wipe the new
  `?session=…` URL.** We early-return before the `router.replace` call when
  we detect a matching session.
- **Empty `cwd` passed in.** Already short-circuited by the existing `if
  (!cwd || suppressCwdBumpRef.current) return;` line.
- **List refresh after project switch.** We still call `setRefreshKey(k+1)`
  in both branches so the sidebar's `loadSessions` is consistent.
- **Performance.** `pickMostRecentSession` is O(n) on a small list (hundreds
  of sessions at most for a single user). No perceptible cost.

## 9. Rollout

- No new feature flag. The change is small, isolated to two files plus a
  helper, and behavior is gated on `cwd !== filterCwd` (the click handler
  early-returns when the user clicks the same project).
- The CHANGELOG "Unreleased" section gets a one-line "Changed" bullet under
  the existing "Sidebar" theme:
  > *Project picker: clicking a project with sessions now opens the most
  > recent session in that project and scrolls the chat to the latest
  > content. Empty projects still show the workbench home.*

## 10. Open Questions

None. The user confirmed:

- 1A: empty projects → keep `WorkbenchHome`.
- 2A: cold-start / default cwd → no change.
- 3A: scroll target → bottom of message list (existing `scrollToBottom`).
- 4: write the spec + changelog entry.
