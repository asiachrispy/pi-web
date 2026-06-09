# pi-web — Integrated Terminal Panel

Date: 2026-06-09
Project: `pi-web` (Next.js 14 web UI, port 30142 dev / 30141 prod)
Status: Draft (awaiting user review)
Parent spec: `docs/superpowers/specs/2026-06-01-pi-web-enterprise-workbench-design.md`

## 1. Objective

Add an integrated terminal panel to pi-web so the user can run shell
commands (`npm run dev`, `pytest`, `git`, log tailing) in the browser
without switching to Terminal.app / iTerm. The terminal is for the user
directly — independent of the agent's existing `bash` tool — and is
positioned as a "lightweight IDE operations panel" that fills the gap
between chat and file viewer.

The feature follows the bottom-drawer pattern familiar from VS Code:
a panel slides up from the bottom of `AppShell`, contents follow the
currently active session's `cwd`, and one terminal exists per project
(directory), shared across all sessions in that directory.

## 2. Scope

In scope:

- New backend module `lib/terminal/{types,ring-buffer,settings,manager}.ts`
  implementing: data structures, a 1 MB ring buffer for scrollback,
  settings loading, and a `TerminalManager` (process registry, spawn,
  lifecycle, cleanup).
- Four new API routes under `app/api/terminal/[cwd]/`:
  - `GET  /state`  — single-shot snapshot of buffer / history / running process
  - `GET  /stream` — SSE: replay buffer, then live `line` / `state` events
  - `POST /run`    — start a command (with `keepRunning` flag)
  - `POST /stop`   — explicitly kill the current keep-running process
- One React hook `hooks/useTerminal.ts` that owns the SSE connection
  and exposes `{ lines, history, running, submit, stop, clear }` to
  components.
- Four new components:
  - `components/TerminalOutput.tsx` — scrollback renderer
  - `components/TerminalInput.tsx` — input line with `keep-running` toggle,
    `↑/↓` history navigation
  - `components/TerminalPanel.tsx` — bottom drawer that hosts the above
  - `components/OpenTerminalButton.tsx` — icon button placed in
    `ChatInput` next to the existing model/thinking/tools/compact controls
- Integration in `components/AppShell.tsx`: lift `terminalOpen` /
  `terminalHeight` state, derive `terminalCwd` from the active session,
  mount `TerminalPanel` (with `key={cwd}` so cwd changes force-remount).
- Integration in `components/ChatInput.tsx`: render `OpenTerminalButton`
  and accept a new `onOpenTerminal` prop.
- CSS additions in `app/globals.css` for the line-* classes
  (`line-cmd`, `line-out`, `line-stdout`, `line-stderr`, `line-exit`,
  `line-exit-ok`, `line-exit-fail`, `line-err`, `line-info`) plus drawer
  layout, using the existing CSS variables.
- New settings keys under `terminal.*` in
  `$PI_CODING_AGENT_DIR/settings.json` (with sensible defaults so the
  feature works out of the box):
  - `defaultTimeoutMs` (default 300000)
  - `maxOutputBytes`  (default 1048576)
  - `historyLimit`    (default 50)
- Tests at three levels: pure-function unit tests for the ring buffer
  and settings loader; integration tests that start a real Node server
  and spawn real subprocesses; component tests for input / output /
  panel via `@testing-library/react`.
- `CHANGELOG.md` "Unreleased" entry.

Out of scope (explicit non-goals to keep the slice small):

- **Full PTY / xterm.js**: we use a subprocess model with `stdio: "ignore"`
  on stdin. Interactive programs that read stdin (`vim`, `psql`, REPLs)
  cannot be driven from the panel. v1 covers the "lightweight dev ops"
  use case (build / test / dev server / git / log tail); PTY is a
  future-v2 upgrade.
- **Multiple terminals per cwd**: one terminal per project, period.
  Outputs from concurrent keep-running processes interleave in the
  same scrollback. A "named separator" feature is explicitly not built.
- **Terminal output persistence to disk**: buffer is in-memory only.
  Page refresh / Pi.app restart loses the scrollback; on reconnect
  the in-memory buffer is replayed (≤ 1 MB), but no historical logs
  are read back.
- **Command history persistence**: 50 most recent commands live in
  memory per `TerminalSession`. Closing Pi.app clears history.
- **Dangerous-command confirmation**: no UI block on `rm -rf` / fork
  bombs / `dd of=/dev/...`. The visible "running X seconds · PID ·
  Stop" status bar and short default timeout are the only guard rails.
- **macOS native shell integration** (`macos/PiWorkbench` Swift
  bridge). v1 is pure Node.js `child_process.spawn`. A follow-up can
  route through the existing `window.piNative` IPC for users who
  need their real login-shell env (nvm / pyenv / conda).
- **Multi-line command input**: pressing `Enter` submits; `Shift+Enter`
  is captured by the browser and does NOT insert a newline. Multi-line
  scripts are written to a `.sh` file then `bash xxx.sh`, or chained
  with `&&`.
- **In-terminal search / filter / copy-to-clipboard button**: native
  browser text selection works; no custom UI for these.
- **Drag-to-resize persistence**: drawer height resets to 40 % on every
  open. Resize is session-local only.
- **Per-command working-directory override UI**: every command runs in
  the project cwd. Per-command `cd subdir && cmd` works because the
  user can type it themselves; there is no special UI for it.
- **New i18n strings** in this slice: terminal UI uses inline English
  only; i18n extraction is deferred to a follow-up.

## 3. Goals and Non-Goals

Goals:

- User can open a bottom drawer, type a command, and see its output
  stream live — without leaving pi-web.
- A long-running command (e.g. `npm run dev`) survives drawer close,
  page refresh, and chat session switch, and its accumulated output
  is replayed on reconnect (within the 1 MB buffer cap).
- Closing the drawer does NOT kill the running process. The process
  is killed only by:
  - The user clicking `Stop` (in the status bar)
  - The user issuing a new command that auto-replaces the keep-running one
  - The non-keep-running timeout firing (default 5 minutes)
  - Pi.app / `npm start` shutting down (SIGTERM handler)
  - The process exiting on its own
- A directory has at most one terminal slot. Starting a new command
  while a keep-running process occupies the slot kills the old one
  first; the UI shows a "killed by new command" line. Starting a new
  command while a non-keep-running command occupies the slot is
  rejected with 409 (the input box is also disabled in that state).
- Settings are configurable via `$PI_CODING_AGENT_DIR/settings.json`'s
  `terminal.*` block; defaults are sensible out of the box.
- The implementation survives Next.js dev-mode HMR: subprocesses
  persist across module reloads via `globalThis.__piTerminals`, and
  the manager's SIGTERM / SIGINT / `exit` handlers clean up all
  active children when Node itself dies.

Non-goals:

- We are not implementing PTY. Programs that need an interactive
  TTY are out of scope (this is the explicit cost of the
  "subprocess + keep-running" C-decision).
- We are not adding a search / filter / clear-on-keystroke facility.
- We are not persisting scrollback to disk in v1. v1's "survives
  page refresh" claim is bounded by the in-memory 1 MB buffer.
- We are not adding a "stop all running processes across all
  projects" global action. Stop is per-cwd, surfaced only in the
  panel's status bar.
- We are not changing the agent's existing `bash` tool. The two
  are independent: the agent's bash still goes through its own
  `child_process.exec`-style call inside `AgentSessionWrapper`;
  the user-facing terminal here is a separate subprocess tree.

## 4. Architecture Overview

```
Browser (React)                        Next.js Server                 Subprocess
   │                                        │                              │
   │  OpenTerminalButton                    │                              │
   │  ── click ──▶ AppShell                 │                              │
   │  setTerminalOpen(true)                 │                              │
   │                                        │                              │
   │  TerminalPanel mount                   │                              │
   │  useTerminal(cwd, true)                │                              │
   │     │                                  │                              │
   │     ├── GET  /state ──────────────────▶│ getOrCreate(cwd)             │
   │     ◀── 200 { buffer, history, ... } ──│                              │
   │     │                                  │                              │
   │     └── EventSource(/stream) ─────────▶│ subscribe(cwd)               │
   │         ◀── event: replay ─────────────│── emit buffer ────▶ │        │
   │         ◀── event: state ──────────────│                              │
   │                                        │                              │
   │  POST /run {command, keepRunning} ────▶│ startCommand(...)            │
   │     ◀── 202 {pid, startedAt} ──────────│── spawn(shell, ['-c', cmd]) ─▶│
   │                                        │                              │
   │         ◀── event: line (output) ──────│◀── stdout chunk ─────────────│
   │         ◀── event: line (output) ──────│                              │
   │         ◀── event: line (exit) ────────│◀── exit code ────────────────│
```

### 4.1. Module layout (new files)

```
app/api/terminal/
  [cwd]/
    run/route.ts           POST  start a command (short or keep-running)
    stop/route.ts          POST  stop the current keep-running process
    stream/route.ts        GET   SSE: replay + live output
    state/route.ts         GET   one-shot snapshot of buffer / history / running

lib/terminal/
  types.ts                 TerminalLine / RunningProcess / TerminalSession
  ring-buffer.ts           1 MB byte-capped ring buffer
  settings.ts              load terminal.* from settings.json
  manager.ts               TerminalManager (registry, spawn, lifecycle, cleanup)

components/
  TerminalOutput.tsx       scrollback renderer
  TerminalInput.tsx        single-line input with history + keep-running toggle
  TerminalPanel.tsx        bottom-drawer container
  OpenTerminalButton.tsx   icon button for ChatInput

hooks/
  useTerminal.ts           SSE subscription + submit / stop / clear
```

### 4.2. Component tree

```
AppShell
├── ChatWindow
│   └── ChatInput
│        └── OpenTerminalButton   ── click ─▶ setTerminalOpen(true)
│
└── TerminalPanel                 (key={cwd}, visible = terminalOpen)
     ├── StatusBar
     ├── TerminalOutput
     └── TerminalInput
```

## 5. Data Model

### 5.1. Buffer line types (`lib/terminal/types.ts`)

```ts
type TerminalLine =
  | { kind: "command";   text: string; ts: number; keepRunning: boolean }
  | { kind: "output";    text: string; ts: number; stream: "stdout" | "stderr" }
  | { kind: "exit";      code: number | null; signal: string | null; ts: number }
  | { kind: "error";     text: string; ts: number }     // spawn failure / timeout kill
  | { kind: "info";      text: string; ts: number }     // "killed by user" / "truncated"
  | { kind: "truncated"; droppedBytes: number; ts: number };
```

### 5.2. Running process

```ts
type RunningProcess = {
  pid: number;
  command: string;
  startedAt: number;
  isKeepRunning: boolean;
  timeoutHandle: NodeJS.Timeout | null;   // set only when isKeepRunning === false
  child: import("child_process").ChildProcess;
};
```

### 5.3. Terminal session (registry value, per cwd)

```ts
type TerminalSession = {
  cwd: string;                          // absolute path; also the registry key
  buffer: TerminalLine[];
  bufferBytes: number;                  // current size, for fast eviction
  history: string[];                    // last N commands (N from settings.historyLimit)
  historyIndex: number;                 // ↑/↓ cursor (component-local mirror, also kept here for the manager)
  runningProcess: RunningProcess | null;
  listeners: Set<TerminalListener>;
  createdAt: number;
  lastActiveAt: number;
};

type TerminalListener = (event: TerminalEvent) => void;
type TerminalEvent =
  | { type: "replay"; lines: TerminalLine[] }
  | { type: "line";   line: TerminalLine }
  | { type: "state";  running: { pid: number; command: string; startedAt: number; isKeepRunning: boolean } | null };
```

## 6. Process Lifecycle & State Machine

### 6.1. Spawn configuration

```ts
const shell = process.env.SHELL || "/bin/bash";
spawn(shell, ["-c", command], {
  cwd,
  env: process.env,              // inherit Node's env (decision: no rc-file sourcing in v1)
  stdio: ["ignore", "pipe", "pipe"],  // stdin = ignore — non-PTY model
  detached: false,               // share Node's process group; SIGTERM propagates
  windowsHide: true,
});
```

### 6.2. Slot state machine (one process at a time)

```
   ┌──────────────────────────────────────────────────────────────┐
   │  slot empty                                                   │
   │  POST /run  →  spawn immediately                              │
   └────────────────┬─────────────────────────────────────────────┘
                    │ spawn succeeds
                    ▼
   ┌──────────────────────────────────────────────────────────────┐
   │  slot occupied, isKeepRunning = false                         │
   │  POST /run  →  409 Conflict (frontend should have disabled    │
   │                 the input, but server is the source of truth) │
   │  POST /stop →  404 (nothing to stop)                          │
   └────────────────┬─────────────────────────────────────────────┘
                    │ exit (natural or timeout)
                    ▼
   ┌──────────────────────────────────────────────────────────────┐
   │  slot occupied, isKeepRunning = true                          │
   │  POST /run  →  kill old (SIGTERM, 2s grace, SIGKILL)         │
   │                appendLine({kind:"info", "killed by new cmd"}) │
   │                then spawn new                                 │
   │  POST /stop →  kill (same kill sequence)                     │
   └────────────────┬─────────────────────────────────────────────┘
                    │ exit
                    ▼
   ┌──────────────────────────────────────────────────────────────┐
   │  slot empty                                                    │
   └──────────────────────────────────────────────────────────────┘
```

### 6.3. Frontend input behavior

| State | Input box | Run button | Stop button |
|---|---|---|---|
| `running === null` | enabled | "Run" | hidden |
| `running.isKeepRunning === false` | **disabled** | disabled, label "Running…" | hidden |
| `running.isKeepRunning === true` | enabled | "Run (replaces current)" | **visible** |

### 6.4. Timeout policy

- Non-keep-running commands: a `setTimeout(timeoutHandle, settings.defaultTimeoutMs)` is set on spawn. On fire, the child is sent SIGTERM, then SIGKILL after 2 s. An `error` line `"killed: exceeded default timeout 300000ms"` is appended.
- Keep-running commands: **no timeout is set**. The process runs until it exits, is stopped by the user, is replaced by a new command, or Node itself dies.

### 6.5. Kill sequence (used by timeout, stop, and replace)

1. `child.kill("SIGTERM")` — give the process 2 seconds to clean up.
2. After 2 s, if `runningProcess === proc` (still our responsibility), `child.kill("SIGKILL")`.
3. If the child exits in between, the existing `exit` listener clears the timeout and updates state; the SIGKILL step becomes a no-op via the `try/catch` in the timeout callback.

### 6.6. Buffer truncation (ring buffer)

- Cap = `settings.maxOutputBytes` (default 1 048 576 = 1 MB).
- Byte cost of a line = `Buffer.byteLength(text) + 32` for output lines, `64` for other line kinds.
- `appendLine` adds the new line, then evicts from the head (oldest) until `bufferBytes ≤ cap`.
- Cumulative dropped bytes are tracked per session. Every 102 400 bytes (100 KB) of cumulative drop, a single `{ kind: "truncated", droppedBytes }` line is appended (so the user sees the warning, but the buffer isn't polluted by a truncated line per drop).
- Edge case: a single output line > 1 MB (e.g. `cat` of a 5 MB file). The `text` field is truncated in place and a `[... output truncated at 1048576 bytes ...]` suffix is appended. The session buffer is still capped at 1 MB.

## 7. Cleanup, HMR, and Crash Safety

### 7.1. Node shutdown handlers

Installed exactly once per process (guarded by `globalThis.__piTerminalCleanupInstalled`):

```ts
process.once("SIGTERM", cleanup);
process.once("SIGINT", cleanup);
process.once("exit", cleanup);

function cleanup() {
  for (const session of registry.values()) {
    if (session.runningProcess) {
      try { session.runningProcess.child.kill("SIGTERM"); } catch {}
    }
  }
}
```

`SIGHUP` is intentionally NOT handled: in dev mode, transient SIGHUPs
can fire and would otherwise kill active children unexpectedly.

### 7.2. HMR (Next.js dev mode)

- The `TerminalManager` registry is stored on `globalThis.__piTerminals`, mirroring the `__piSessions` pattern already documented in AGENTS.md.
- When the manager module is hot-reloaded, the registry survives; the new module instance reads from `globalThis` and continues serving SSE subscribers.
- Each child process's `exit` / `stdout` / `stderr` listeners are closures over the session object, which is itself held by `globalThis`. The closures stay alive across HMR; events keep firing and updates land in the surviving registry.
- Net effect: a long-running `npm run dev` started before an HMR continues running with the same PID. The user sees no disruption.

### 7.3. Orphan cleanup on Pi.app restart

If the Swift shell exits the Node process with `SIGKILL` (not `SIGTERM`), our cleanup handler does not run and children become orphans. This is a known limitation.

Mitigation (deferred to v1.1, not in this slice): on Node startup, read `$PI_CODING_AGENT_DIR/terminals/orphans.json` (a list of PIDs the previous session wrote before exiting) and `kill -9` any still-alive PIDs. v1 documents this risk but does not fix it; the typical exit path (`osascript -e 'quit app "Pi"'`) sends SIGTERM, which the handler catches.

## 8. API Contract

### 8.1. `GET /api/terminal/[cwd]/state`

- **Path param**: `cwd` is the absolute project path, URL-encoded. Same encoding the `app/api/files/[...path]` route uses, parsed via the existing `filePathFromSegments` helper.
- **Auth**: `requireApiAuth(request)` (consistent with all other API routes).
- **Authorization**: `isPathAllowed(cwd, allowedRoots)` (same set as file access). On failure: 403.
- **Response 200**: `{ buffer: TerminalLine[], history: string[], running: RunningProcessSummary | null }`.
- **Response 403**: cwd not in allowed roots.
- **Side effect**: if no `TerminalSession` exists for this cwd, one is created (empty buffer, empty history, no running process). This is the "first-open" path.

### 8.2. `GET /api/terminal/[cwd]/stream`

- Same auth and authorization as `/state`.
- Response is `text/event-stream` with `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no` (mirroring existing SSE routes in `app/api/agent/[id]/events`).
- First event: `{ type: "replay", lines: <entire current buffer> }`.
- Subsequent events: `{ type: "line", line: <new TerminalLine> }` and `{ type: "state", running: <...> }`.
- Connection close (browser tab close, navigation, network drop) does **not** kill the running process. The next connect on the same cwd will receive a fresh `replay` and resume.

### 8.3. `POST /api/terminal/[cwd]/run`

- **Body**: `{ command: string, keepRunning: boolean }`.
- **Auth + authorization**: as above.
- **Behavior**:
  - If a non-keep-running process is currently active: 409 `{ error: "command_in_progress" }`.
  - If a keep-running process is active: SIGTERM it, wait 2 s, SIGKILL; append `info` line "killed by new command"; then spawn the new command.
  - Otherwise: spawn immediately.
- **Response 202**: `{ pid: number, startedAt: number }`.
- **Response 403 / 409**: as above.
- **Spawn failure**: caught via `child.on('error')`; emits `{ kind: "error" }` line; no HTTP error (the 202 has already been sent — the error shows up in the SSE stream as a line).

### 8.4. `POST /api/terminal/[cwd]/stop`

- **Auth + authorization**: as above.
- **Behavior**: if `runningProcess` exists and `isKeepRunning === true`, kill it (SIGTERM → 2 s → SIGKILL) and append `info` line "killed by user".
- **Response 200**: `{ killed: pid }`.
- **Response 404**: `{ error: "no_active_process" }` (no running process, or it is non-keep-running — those have no explicit "stop" because they are time-bounded already).

## 9. Frontend Design

### 9.1. `useTerminal(cwd, enabled)` hook

```ts
type UseTerminalResult = {
  lines: TerminalLine[];
  history: string[];
  running: RunningSummary | null;
  isLoading: boolean;
  error: string | null;
  submit(command: string, keepRunning: boolean): Promise<void>;
  stop(): Promise<void>;
  clear(): Promise<void>;
};
```

- On mount with `enabled === true && cwd !== null`:
  1. Fire `GET /state` in parallel with opening `EventSource(/stream)`.
  2. On the `/state` response, hydrate `lines`, `history`, `running`.
  3. On the `replay` SSE event, replace `lines` if the buffer is currently empty; otherwise merge by `(kind, ts, text[:32])` fingerprint to avoid duplicates.
  4. On the `line` event, append to `lines`. On the `state` event, replace `running`.
- On unmount or `enabled` flipping false: close the `EventSource` and clear local state.
- On `cwd` change: the parent component keys `TerminalPanel` on `cwd`, which causes a fresh mount and reconnect. The hook itself does not need to do anything special.
- `submit` / `stop` / `clear` are thin `fetch` wrappers; the resulting state change arrives via SSE rather than in the fetch response.

### 9.2. `TerminalPanel` drawer

- Rendered by `AppShell`; visibility = `terminalOpen`. The panel is always present in the DOM and toggles via `display`, so closing/reopening does not lose scrollback.
- Layout: top resize handle (4 px) → status bar (cwd · PID · running Xs · Stop · Clear · Close) → `TerminalOutput` (flex 1) → `TerminalInput` (fixed height).
- Height defaults to 40 % of viewport, range 24 % – 80 %, dragged via a 4 px handle on the top edge. Not persisted across panel open/close (resets to 40 % each open).
- `key={cwd}` so changing the active session's cwd remounts the panel and the hook reconnects to the new terminal session.

### 9.3. `TerminalOutput` rendering

- Plain `<div>` per line, `font-family: var(--font-mono)`, `font-size: 12px`, `white-space: pre-wrap`, `word-break: break-word`.
- Six CSS classes, one per line kind:
  - `line-cmd` (accent, bold) for `{kind:"command"}`
  - `line-out line-stdout` (default text) for stdout
  - `line-out line-stderr` (`#f87171`) for stderr — matches the existing agent bash-tool error color
  - `line-exit line-exit-ok` (`#4ade80`) / `line-exit-fail` (`#f87171`) for exits
  - `line-err` (`#fbbf24`) for spawn / timeout errors
  - `line-info` (dim, italic) for info + truncated lines
- **Autoscroll**: on every `lines` change, if the user is within 30 px of the bottom, set `scrollTop = scrollHeight`. The 30 px tolerance prevents autoscroll from pausing when a single line happens to land exactly at the bottom edge.
- If the user scrolls up, autoscroll pauses automatically; a floating "↓ jump to bottom" button appears in the lower-right corner. Clicking it (or scrolling back within 30 px) re-enables autoscroll.

### 9.4. `TerminalInput` behavior

- Single `<input type="text">`. Pressing `Enter` submits and clears the field. `Shift+Enter` does nothing (no multi-line in v1).
- `ArrowUp` / `ArrowDown` navigate the `history` array (last 50 commands). When the user reaches "above the oldest", the field is empty. When they reach "below the most recent" (or press `↓` from the empty state), the field clears.
- A `keep-running` checkbox sits to the left of the input. The checkbox is reset to `false` after every successful submit.
- The input is `disabled` when `running && !running.isKeepRunning` (i.e. a non-keep-running command is in flight).
- The input is `autoFocus`'d when the panel becomes visible.

### 9.5. `OpenTerminalButton` and `ChatInput` integration

- `OpenTerminalButton` is a plain icon button with label "Terminal" (uses the 📟 glyph or, if the project's icon set is strict, the text "Terminal"). Disabled state shows a tooltip "Open a session first" when no active cwd.
- `ChatInput` gets a new optional prop `onOpenTerminal?: () => void`. When provided, the button is rendered next to the existing model selector / thinking / tools / compact controls. When omitted (e.g. in tests), the button is not rendered.
- `AppShell` owns the `onOpenTerminal = () => setTerminalOpen(true)` closure and passes it down through `ChatWindow` → `ChatInput` via prop drilling, matching the existing `setActiveSessionId` / `addTab` plumbing.

### 9.6. AppShell state

- New useState: `terminalOpen: boolean` (default `false`), `terminalHeight: number` (default `0.4`).
- Derived value: `terminalCwd` = the `cwd` of the currently active session, or `null` if no session is active. Recomputed on every render.
- `OpenTerminalButton` is disabled iff `terminalCwd === null`.
- When `terminalCwd` changes, `TerminalPanel` is re-keyed (the remount tears down the old SSE and opens a new one).

## 10. Settings

New keys under `terminal.*` in `$PI_CODING_AGENT_DIR/settings.json`:

```jsonc
{
  "terminal": {
    "defaultTimeoutMs": 300000,     // 5 min, applied to non-keep-running commands
    "maxOutputBytes":  1048576,     // 1 MB, ring buffer cap
    "historyLimit":    50           // command history depth
  }
}
```

All three are optional. Missing values fall back to the defaults above. Invalid values (negative numbers, non-numeric strings) cause the settings loader to throw at the first read; the API route returns 500. This matches how `lib/api-auth` and other config loaders fail loud rather than silently.

## 11. Error Handling Matrix

| Fault | Detected by | Client behavior | Server behavior |
|---|---|---|---|
| cwd not in allowed roots | `isPathAllowed` check | Input clears, 403 error toast | Return 403, do not create session |
| Spawn failure (ENOENT, EACCES) | `child.on('error')` | Yellow `⚠ spawn failed: …` line in output | Append `error` line, emit, do not retry |
| Non-keep-running timeout | `setTimeout` fires | Yellow `⚠ killed: exceeded default timeout` line | SIGTERM → 2 s → SIGKILL; append `error` line |
| Keep-running killed by new command | `startCommand` sees existing process | Grey `· killed by new command` line | SIGTERM old → emit info → spawn new |
| User clicks Stop | `POST /stop` | Input re-enables, Stop button hides | SIGTERM → 2 s → SIGKILL; append info "killed by user" |
| External SIGKILL (OOM, segfault) | `child.on('exit')` with non-zero | Grey `· [exit null SIGKILL]` line | Append `exit` line, clear `runningProcess` |
| SSE disconnect (network blip) | Browser `EventSource.onerror` | Brief UI gap (< 1 s), browser auto-reconnects | None — server holds state |
| Buffer truncation (ordinary) | `appendLine` eviction | Grey `… 102400 bytes truncated …` line | Drop old lines, append single truncated line per 100 KB dropped |
| Buffer truncation (single huge line) | `appendLine` boundary check | Same line truncated in place with suffix | Truncate the `text` field, append suffix |
| HMR during command | Next.js dev reload | No visible effect | globalThis preserves state; closures keep firing |
| Pi.app / `npm start` shutdown | SIGTERM / SIGINT handler | User is closing anyway | Cleanup: SIGTERM all active children |
| Concurrent non-keep-running start | Slot occupied, isKeepRunning=false | 409 surfaced in `submit` Promise rejection | 409 `{ error: "command_in_progress" }` |
| Stop with no active process | `POST /stop` without runningProcess | 404 surfaced in `stop` Promise rejection | 404 `{ error: "no_active_process" }` |
| Server OOM | (out of scope — system level) | Connection drops | Not handled |

## 12. Testing Strategy

### 12.1. Unit tests (vitest, no server)

- `lib/terminal/ring-buffer.test.ts`
  - Cumulative push past 1 MB drops oldest lines and keeps `bufferBytes` accurate.
  - A single 5 MB push truncates that one line in place with the suffix marker.
  - `droppedBytesSinceLastTruncate` accumulates and a `truncated` line is emitted every 100 KB of dropped bytes.
- `lib/terminal/settings.test.ts`
  - Missing file → defaults.
  - Missing `terminal.*` keys → defaults for those keys.
  - Negative / non-numeric values → throws.
- `lib/terminal/manager.test.ts`
  - `getOrCreate` is idempotent (same cwd returns same session).
  - `startCommand` with keepRunning=true does not set a timeout handle.
  - `startCommand` while a non-keep-running slot is occupied returns the "slot occupied" sentinel.
  - `startCommand` while a keep-running slot is occupied kills the old and starts the new (verified via mocked `child_process`).
  - `appendLine` triggers eviction in the expected order.
  - `emit` fans out to all listeners; removing a listener via SSE close prevents future emissions to it.

### 12.2. Integration tests (real server, real subprocess)

- `app/api/terminal/[cwd]/state.test.ts`
  - First call creates an empty session; second call returns the same buffer.
  - cwd not in allowed roots → 403.
- `app/api/terminal/[cwd]/stream.test.ts`
  - SSE connection emits a `replay` event with the current buffer.
  - A second SSE connection opened after the first received 3 `output` lines sees all 3 on its own `replay`.
  - Closing the SSE does NOT kill the running process (verified via `pgrep` of the child pid).
- `app/api/terminal/[cwd]/run.test.ts`
  - `echo hello` → 202, then `replay` includes a `command` line, an `output` line "hello\n", and an `exit` line with `code: 0`.
  - `false` → 202, then `replay` includes an `exit` line with `code: 1`.
  - `sleep 100` with `keepRunning: true` → process is still alive 5 s later.
  - `sleep 100` with `keepRunning: false` and `defaultTimeoutMs: 1000` → process is killed within ~3 s and an `error` line is emitted.
  - Starting a second `sleep 60` while the first is keep-running → first is killed, second runs.
  - Starting a second `sleep 60` (keepRunning=false) while the first is non-keep-running and still alive → 409.
- `app/api/terminal/[cwd]/stop.test.ts`
  - With a keep-running process: 200, process is gone within 3 s.
  - With no process: 404.
  - With a non-keep-running process still running: 404 (only keep-running is stoppable).
- **HMR simulation**: under `NODE_ENV=development`, run a `sleep 60`, then `require.cache`-delete the manager module and re-require it. Verify the child PID is unchanged.
- **Shutdown simulation**: spawn a `sleep 60`, send `SIGTERM` to the test runner, then `pgrep` for the child PID — expect zero results within 3 s.

### 12.3. Component tests (`@testing-library/react`)

- `TerminalInput.test.tsx`
  - `Enter` calls `onSubmit` with the typed value; `Shift+Enter` does not.
  - `ArrowUp` from a fresh state populates the field with the most recent history entry.
  - `ArrowUp` past the oldest entry is a no-op.
  - `ArrowDown` from the oldest entry clears the field.
  - `keepRunning` checkbox toggles, resets after submit.
  - `disabled` prop disables typing and keyboard handlers.
- `TerminalOutput.test.tsx`
  - Each `TerminalLine.kind` renders the expected class.
  - `autoScroll` is true on first render, `scrollTop` equals `scrollHeight` after a new line is appended.
  - Scrolling up (firing `onScroll` with `scrollTop` not at the bottom) flips `autoScroll` to false and shows the "↓ jump to bottom" button.
- `OpenTerminalButton.test.tsx`
  - Disabled when `cwd` is null; tooltip text matches.
  - Click calls `onClick`.

### 12.4. End-to-end manual checklist

1. Open a session whose cwd is a Node project. Click `Terminal`. Drawer slides up.
2. Type `npm run dev` (or `python -m http.server` for a non-Node project) with `keep-running` checked. See "Server listening" appear.
3. F5 the page. Reopen the drawer. Same output is still there; PID unchanged (verify via `ps`).
4. Open a second session with a different cwd. The drawer auto-switches content.
5. Return to the first session. Dev server is still running, output is still streaming.
6. Run `ls /nonexistent`. See a red stderr line and a `[exit 1]` line.
7. Run `python -c "print(2+2)"`. See `4` and `[exit 0]`.
8. Run `python` (no `-c`). It exits immediately (stdin=ignore).
9. Tick `keep-running`, run `tail -f /tmp/somefile` (or `sleep 100`). Output streams. Type a new command → old one is killed, new one starts; grey "killed by new command" line visible.
10. Without `keep-running`, run `sleep 3`. See the input box disable, the Stop button hide, and the `exit` line appear after 3 s.
11. With a keep-running process alive, click `Stop`. The process disappears from `ps`. Input stays enabled.
12. Push the buffer past 1 MB (e.g. `yes | head -c 2000000`). See a `truncated` line.
13. Quit Pi.app (or stop `npm start`). Confirm via `ps aux | grep -E "sleep|npm"` that no terminal children survive.
14. Re-launch Pi.app. Open a session. The terminal drawer opens with an empty buffer (in-memory only — no persistence by design).

## 13. Phased Implementation Plan

### Phase 1 — Backend core (≈ 1.5 days)

| # | Task | File | Acceptance |
|---|---|---|---|
| 1.1 | Define types | `lib/terminal/types.ts` | 4 types compile |
| 1.2 | Ring buffer | `lib/terminal/ring-buffer.ts` | 3 unit tests pass |
| 1.3 | Settings loader | `lib/terminal/settings.ts` | Defaults applied; invalid values throw |
| 1.4 | Manager body | `lib/terminal/manager.ts` | All 11 error scenarios from §11 covered |
| 1.5 | Cleanup handlers | (same file) | SIGTERM / SIGINT / exit wired; HMR-safe via globalThis flag |

Phase 1 exit: `npm run test:run` green; `tsc --noEmit` green; `node -e` driving the manager API runs `echo hello` end-to-end.

### Phase 2 — API routes (≈ 1 day)

| # | Task | File | Acceptance |
|---|---|---|---|
| 2.1 | `GET /state` | `app/api/terminal/[cwd]/state/route.ts` | 200 / 403 paths covered |
| 2.2 | `GET /stream` SSE | `app/api/terminal/[cwd]/stream/route.ts` | Replay + line + state events; close does not kill |
| 2.3 | `POST /run` | `app/api/terminal/[cwd]/run/route.ts` | 202 / 403 / 409 paths covered |
| 2.4 | `POST /stop` | `app/api/terminal/[cwd]/stop/route.ts` | 200 / 404 paths covered |
| 2.5 | Integration tests | `app/api/terminal/**/*.test.ts` | 7 cases from §12.2 pass |

Phase 2 exit: `curl` + `curl -N` walks the 4 endpoints; full test suite green.

### Phase 3 — React hook (≈ 0.5 day)

| # | Task | File | Acceptance |
|---|---|---|---|
| 3.1 | `useTerminal` body | `hooks/useTerminal.ts` | `enabled` / `cwd` toggles; submit / stop / clear |
| 3.2 | Hook unit tests | `hooks/useTerminal.test.ts` | Replay not duplicated; cwd change reconnects |

Phase 3 exit: DevTools shows the `EventSource` connect + events flowing.

### Phase 4 — UI components (≈ 1.5 days)

| # | Task | File | Acceptance |
|---|---|---|---|
| 4.1 | `TerminalOutput` | `components/TerminalOutput.tsx` | 6 line classes; 30 px autoscroll tolerance; jump-to-bottom button |
| 4.2 | `TerminalInput` | `components/TerminalInput.tsx` | Enter / Shift+Enter / ↑↓ / keep-running checkbox / disabled |
| 4.3 | `TerminalPanel` | `components/TerminalPanel.tsx` | Resize handle + status bar + output + input; uses `useTerminal` |
| 4.4 | `OpenTerminalButton` | `components/OpenTerminalButton.tsx` | Disabled when no cwd; tooltip; click triggers callback |
| 4.5 | Component tests | `Terminal{Output,Input,Panel}.test.tsx` | @testing-library cases from §12.3 pass |

Phase 4 exit: Manual smoke test of the drawer in the browser.

### Phase 5 — Integration & QA (≈ 1 day)

| # | Task | File | Acceptance |
|---|---|---|---|
| 5.1 | `ChatInput` accepts `onOpenTerminal` | `components/ChatInput.tsx` | Button rendered next to existing controls |
| 5.2 | `AppShell` integrates drawer | `components/AppShell.tsx` | `terminalOpen` / `terminalHeight` lifted; `key={cwd}`; prop-drilled callback |
| 5.3 | CSS additions | `app/globals.css` | 9 line-* classes + drawer layout using existing CSS variables |
| 5.4 | Manual QA | (no file) | All 14 e2e cases in §12.4 pass |
| 5.5 | CHANGELOG entry | `CHANGELOG.md` | "Unreleased" entry added |
| 5.6 | Full regression | (no file) | `tsc --noEmit && npm run lint && npm run test:run` all green |

**Total: ≈ 5.5 days.**

## 14. Risks & Watch-Outs

1. **HMR in dev mode is the biggest unknown.** The theory is sound (`detached: false` + `globalThis` registry + closures), but Next.js's HMR boundaries sometimes wrap the whole module. **Stress test in Phase 5**: start `sleep 60`, edit `manager.ts` 10 times in a row, verify the PID is unchanged and the SSE still serves.

2. **Pi.app `SIGKILL` exit** leaves orphan subprocesses (no cleanup handler runs). Documented in §7.3. The v1 mitigation is "the typical exit path sends SIGTERM, not SIGKILL"; the proper fix (orphan list) is deferred to v1.1.

3. **`process.env.SHELL` may not match the user's interactive shell** in Docker / SSH remote dev. Out of scope for v1 — the user can override with `bash -c "..."` syntax in the panel if needed.

4. **SSE backpressure is unbounded.** The current EventSource implementation does not throttle; a process that produces 10 MB/s of output could OOM the browser tab. Mitigated in practice by the 1 MB ring buffer cap on the server (we don't forward evicted lines), but no per-event rate limit on the server. If observed, add a 50 ms throttle in `manager.emit` in a follow-up.

5. **macOS dev mode `process.env.SHELL`**: confirmed to default to `/bin/zsh` on a default macOS install. No action required.

6. **Test isolation**: integration tests spawn real subprocesses and have a `process.on('exit')` cleanup handler, but if a test process is itself killed (e.g. CI timeout), children leak. Tests should explicitly clean up by calling `manager.stop(cwd)` in `afterEach` for tests that started a long-running process.

## 15. Open Questions for User Review

- Is the "auto-replace keep-running on new command" behavior (§6.2) the right default, or would you prefer to reject the new command and force the user to click Stop first?
- Should the Stop button also be available for non-keep-running commands? My recommendation: no — the input is already disabled, and the 5-minute timeout is the only "stop" mechanism. Allowing early-stop would suggest the timeout is too long.
- Should the `keep-running` checkbox default to `true` or `false` for the first command in a session? My recommendation: `false` — the explicit "I'm starting a long task" gesture is the safer default. (A 30-second `npm test` shouldn't be marked keep-running just because the user forgot to uncheck.)
- Do you want a keyboard shortcut (e.g. `Cmd+J` or `Ctrl+``) for open/close the terminal drawer? My recommendation: add `Cmd+J` (macOS) / `Ctrl+J` (Linux/Windows) since this matches VS Code and iTerm conventions. (Not in the current plan; small add.)
