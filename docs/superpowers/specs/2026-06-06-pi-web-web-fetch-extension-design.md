# pi-web `web_fetch` Extension Design

Date: 2026-06-06
Project: `pi-web` (provides pi extension)
Status: Proposed

## Summary

Add a pi extension `web-fetch` that registers an LLM-callable `web_fetch` tool. The tool fetches a URL and returns LLM-friendly content, automatically choosing the cheapest sufficient backend. Built as a standalone npm-packaged extension that installs alongside `agent-browser` (Vercel Labs) as its optional Tier 2 backend.

The extension works in `pi` CLI, `pi-web`, and Pi.app on macOS without any project-side code changes — installation is `pi install <repo>` and the LLM gains the tool immediately.

## Goals

- Give the LLM a single typed `web_fetch` tool that converts any URL into structured JSON-LD or clean Markdown
- Minimize token cost: prefer zero-cost structured data extraction (JSON-LD, OpenGraph), then lightweight fetch + Readability, then headless browser as a last resort
- Minimize latency: parallelize the cheap paths, cache by URL+options hash
- Work in all three pi runtimes (CLI, pi-web, Pi.app) without project-side code changes
- Make Tier 2 (`agent-browser`) opt-out, not opt-in — users should not have to know it exists

## Non-Goals

- Any change to `pi-web` UI, components, HTTP API, or macOS native bridge
- A `+URL` button, link-preview chip, or settings panel in `pi-web`
- Pre-fetch injection, eager URL detection, or any UX that intercepts the user's input
- macOS `WKWebView` integration (P4, deferred — `agent-browser` already provides cross-platform browser access)
- Interactive browser automation (login, click, form fill) — `agent-browser`'s skill already covers that; we only do read-only fetching
- Local site adapters, knowledge bases, or persistent crawl storage
- A web-search tool (separate concern; install `badlogic/pi-skills/brave-search` for that)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  pi extension: web-fetch  (~/.pi/agent/extensions/)         │
│                                                             │
│  ┌────────────────┐                                         │
│  │  web_fetch     │ ← LLM calls this typed tool             │
│  │  (registerTool)│                                         │
│  └────────┬───────┘                                         │
│           ▼                                                 │
│  ┌────────────────┐                                         │
│  │   Cache.check  │ → hit? return cached result             │
│  └────────┬───────┘                                         │
│           ▼                                                 │
│  ┌────────────────┐                                         │
│  │    Router      │ ← decides T0/T1/T2, parallelizes        │
│  └─┬──────┬────┬──┘                                         │
│    │      │    │                                            │
│    ▼      ▼    ▼                                            │
│  ┌────┐ ┌────┐ ┌────────┐                                   │
│  │ T0 │ │ T1 │ │  T2    │                                   │
│  │    │ │    │ │        │                                   │
│  └──┬─┘ └──┬─┘ └───┬────┘                                   │
│     │      │       │                                        │
│  JSON-LD  cheerio  agent-browser                            │
│   regex  +readability subprocess                            │
│                                                             │
│  ┌────────────────┐                                         │
│  │  Formatter     │ ← unifies output shape                  │
│  └────────────────┘                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Tier Routing

The router runs tiers in order of cost, all in parallel where possible:

| Tier | Backend | Trigger | Latency | Token output |
|------|---------|---------|---------|--------------|
| **T0** | `extractors/jsonld.ts` (regex on T1-fetched HTML) | Always, runs in parallel with T1 markdown extraction | ~50ms | Structured JSON, ~0 LLM extraction cost |
| **T1** | `backends/http.ts` (fetch) + `backends/readability.ts` (cheerio + Mozilla Readability + turndown) | Always, shares the T0/T1 HTML fetch | ~500ms | Clean Markdown |
| **T2** | `backends/agent-browser.ts` (spawn `agent-browser` CLI) | Only if T0 and T1 are both insufficient AND `render != "never"` | ~2-3s | Accessibility-tree Markdown |

A tier is "sufficient" if:

- **T0**: parsed any JSON-LD block with `@type` AND at least one meaningful field (`name`, `headline`, `description`, `articleBody`, etc.). If a `selector` is given, T0 also requires the selector to match in the JSON-LD `description` or `articleBody` text.
- **T1**: Mozilla Readability extracted ≥ 200 chars of clean text. If a `selector` is given, T1 only counts as sufficient if the selector matches a non-empty element.
- **T2**: Always sufficient (last resort) unless `render == "never"`.

If T0 succeeds, the LLM gets structured JSON it can answer questions about without further extraction. If T0 fails, the router falls back to T1. If T1 also fails, the router escalates to T2 (unless disabled). T2 failures are returned with a clear error and any partial result from earlier tiers.

### Cache

- In-memory `Map<string, { result, expiresAt }>`, keyed by `sha256(url + JSON.stringify(sortedOptions)).slice(0, 16)`
- TTL: 1 hour (configurable via `~/.pi/agent/settings.json` under `webFetch.cacheTtlMs`)
- Cache lookup runs before any tier; cache miss stores the final formatted result
- Caching is per-process; no disk persistence in v1

### Output Format

The tool returns a structured `content` array suitable for the LLM:

```typescript
type WebFetchResult = {
  type: "structured" | "markdown";
  source: "jsonld" | "readability" | "agent-browser" | "selector";
  url: string;
  data?: Record<string, unknown>;   // present when type === "structured"
  content?: string;                 // present when type === "markdown"
  truncated?: boolean;              // present if max_tokens hit
  meta?: {
    fetchedAt: number;
    cacheHit: boolean;
    tiersAttempted: Array<"t0" | "t1" | "t2">;
    latencyMs: number;
  };
};
```

The extension returns this as a `content: [{ type: "text", text: JSON.stringify(result) }]` so the LLM gets a single uniform payload regardless of which tier succeeded.

### Error Handling

| Failure | Response |
|---------|----------|
| T0 fails to parse | T0 returns `null`; router continues |
| T1 fetch throws (network, 4xx, 5xx) | T1 returns `null`; router continues |
| T2 `agent-browser` not in PATH | T2 returns `{ error: "agent-browser not installed. Run: brew install agent-browser && agent-browser install" }`; tool returns error to LLM with T0/T1 partial if any |
| T2 subprocess timeout (>30s) | T2 returns `{ error: "agent-browser timeout" }`; same as above |
| T2 subprocess non-zero exit | T2 returns `{ error: "agent-browser exit <code>: <stderr>" }`; same as above |
| `selector` matches nothing | Tool returns `{ type: "markdown", content: "", source: "selector", error: "selector matched no elements" }` |
| All tiers fail | Tool returns `{ content: [{ type: "text", text: JSON.stringify({ error, url, reasons }) }], isError: true }` |
| User aborts (Esc) | `ctx.signal` cancellation propagates; partial result discarded |

The LLM sees error details in the result and can decide to retry with different parameters (e.g., try `render: "never"` to skip the browser, or accept a partial result).

## Components

### `package.json`

```json
{
  "name": "pi-web-fetch",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "dependencies": {
    "cheerio": "^1.1.0",
    "@mozilla/readability": "^0.6.0",
    "turndown": "^7.2.0",
    "agent-browser": "^0.27.0"
  },
  "pi": { "extensions": ["./src/index.ts"] }
}
```

`agent-browser` is declared as a dependency so its binary and `skills/` directory are installed alongside the extension. The extension code does not `import` from `agent-browser`; it only `spawn`s the binary.

### `src/index.ts`

Entry point. Exports a default async factory function. On `session_start`, runs `checkAgentBrowser()` and caches the result. Registers the `web_fetch` tool. On `resources_discover`, returns the path to the bundled `agent-browser` skill so it is visible in the LLM's system prompt.

### `src/router.ts`

Orchestrates the three tiers. Accepts `{ url, render, selector, maxTokens, signal }`. Runs cache check → T0 ∥ T1 → T2 (if needed) → formatter → cache store. Reports progress via `onUpdate` at each phase.

### `src/extractors/jsonld.ts`

Exports `extractJsonLd(html: string, url: string): JsonLdResult | null`. Pure regex-based, no I/O. Handles `<script type="application/ld+json">` blocks and OpenGraph `<meta>` tags. Returns the first structured-data block that has both a `@type` and a meaningful field. Handles JSON-LD arrays (some sites embed multiple objects).

### `src/extractors/selector.ts`

Exports `extractBySelector(html: string, selector: string): { text: string; html: string } | null`. Uses cheerio to parse and find the first matching element. Returns inner text and inner HTML. Used when the LLM passes a `selector` to narrow extraction.

### `src/backends/http.ts`

Exports `fetchHtml(url, signal): Promise<{ html, finalUrl, headers }>`. Uses built-in `fetch` with a 8s timeout. Follows up to 3 redirects. Returns response body, final URL (after redirects), and headers. Throws on non-2xx unless `Accept` was honored and content type is HTML.

### `src/backends/readability.ts`

Exports `extractReadable(html, url): { markdown, length } | null`. Runs Mozilla Readability, then turndown with GFM plugin. Returns `null` if extracted text is < 200 chars.

### `src/backends/agent-browser.ts`

Exports `fetchViaAgentBrowser(url, signal, options?): Promise<{ markdown, length }>`. Spawns `agent-browser batch` with three commands: `open <url> --headless`, `snapshot --format json --depth 20`, `close`. Parses snapshot JSON, walks the accessibility tree, flattens to Markdown. Returns `null` if agent-browser is not in PATH (caller handles the error). 30s total timeout.

### `src/formatter.ts`

Exports `formatResult(rawResult, options): WebFetchResult`. Unifies the three tier outputs into the LLM-facing shape. Truncates to `maxTokens` (default 8000) by character count approximation (chars / 4) when exceeded; sets `truncated: true` and adds an ellipsis marker.

### `src/cache.ts`

Exports `get(key)`, `set(key, value, ttlMs)`, `clear()`. Simple in-memory Map with TTL eviction on get.

### `src/check-env.ts`

Exports `checkAgentBrowser(): { available: boolean; version?: string; installHint?: string }`. Runs `agent-browser --version` with 2s timeout. Returns version if available, otherwise an install hint.

### `src/types.ts`

Shared types: `WebFetchResult`, `TierName`, `FetchOptions`, `RouterInput`.

## Data Flow

A single `web_fetch` call:

```
LLM calls web_fetch({
  url: "https://blog.example.com/post-123",
  render: "auto",
  max_tokens: 8000
})
  │
  ▼
index.ts: web_fetch.execute
  │
  ├─► cache.get("a1b2c3d4...")
  │     hit? → return cached WebFetchResult (with meta.cacheHit: true)
  │
  ▼
router.ts: route()
  │
  ├─► onUpdate("Cache miss, fetching HTML (T0 + T1 in parallel)...")
  │
  ├─► backends/http.ts: fetchHtml(url, signal)              // single shared fetch
  │
  ├─► Promise.allSettled([
  │      extractors/jsonld.ts: extractJsonLd(html, url),    // T0
  │      backends/readability.ts: extractReadable(html, url) // T1 markdown
  │    ])
  │
  ├─► Pick best:
  │     - T0 has structured data + meaningful fields?  → return T0 result
  │     - T1 has ≥ 200 chars markdown?                 → return T1 result
  │     - else if render == "never"                    → return error
  │     - else                                         → escalate to T2
  │
  ├─► onUpdate("Escalating to T2 (agent-browser)...")
  │
  ├─► backends/agent-browser.ts: fetchViaAgentBrowser(url, signal)
  │     success → return T2 result
  │     failure → return T0/T1 partial or error
  │
  ▼
formatter.ts: formatResult(raw, options)
  │
  ├─► Truncate to max_tokens if exceeded
  ├─► Build WebFetchResult
  │
  ▼
cache.set(key, result, ttl)
  │
  ▼
return { content: [{ type: "text", text: JSON.stringify(result) }] }
```

LLM receives the formatted JSON, sees the `type` and `source` fields, and uses the `data` or `content` field directly in its response.

## Lifecycle Integration

- `pi.registerTool()` — registers `web_fetch` as a typed tool visible to the LLM
- `pi.on("session_start", ...)` — runs `checkAgentBrowser()`, stores result in module-level variable. Tool execution checks this before calling T2.
- `pi.on("resources_discover", ...)` — returns `{ skillPaths: [path.resolve(__dirname, "../node_modules/agent-browser/skills")] }` so the agent-browser skill is loaded into the system prompt.
- `ctx.signal` — passed to `fetch` and to the agent-browser subprocess (the subprocess is killed on abort).
- `onUpdate` — called at each tier transition to stream progress to the LLM.

## Distribution

The extension ships as a separate npm package (e.g., `pi-web-fetch`), distributable via:

```bash
pi install github.com/<owner>/pi-web-fetch
# or
pi install npm:pi-web-fetch
```

The package's `pi.extensions` field in `package.json` points to `src/index.ts`. After `npm install`, `pi` discovers the extension on next session start.

In v1 we host in a separate repo. Once stable, publish to npm with `pi-package` topic for `pi.dev/packages` discovery.

## Phasing

| Phase | Scope | Exit criteria |
|-------|-------|---------------|
| **P1** | Extension + T0 (JSON-LD) + T1 (Readability) + cache + formatter + unit tests + README | `web_fetch` returns structured JSON for product pages, Markdown for articles. Token cost ≤ 2k for typical news article. Test coverage ≥ 80%. |
| **P2** | T2 (agent-browser subprocess integration) + smoke test | T2 successfully fetches a known SPA (e.g., `https://twitter.com/<user>` public profile). `agent-browser` skill visible in system prompt. |
| **P3** | pi-web `docs/advanced-features.md` section on the extension (no code changes) | Doc section merged. One paragraph per phase, install command, example LLM call. |
| **P4** *(deferred)* | macOS WKWebView path via `piNative` (only if T2 latency is a problem) | WKWebView tier added; macOS Pi.app uses it for sub-second fetches. Out of scope for v1. |

## Testing Strategy

### Unit Tests (`tests/`)

- `extractors/jsonld.test.ts` — fixture HTML with single JSON-LD, array JSON-LD, OpenGraph, microdata; verify correct extraction and `null` for invalid
- `extractors/selector.test.ts` — verify cheerio-based selector extraction, edge cases (no match, multiple matches, nested)
- `backends/http.test.ts` — mocked fetch (via `vi.spyOn(globalThis, "fetch")`); verify redirect handling, timeout, non-HTML rejection
- `backends/agent-browser.test.ts` — mocked spawn; verify command construction, output parsing, timeout, missing-binary error
- `backends/readability.test.ts` — fixture HTML; verify Markdown output, length threshold
- `router.test.ts` — mocked tiers; verify routing logic (T0 wins over T1, T2 escalation, render=never)
- `cache.test.ts` — TTL eviction, key generation
- `formatter.test.ts` — truncation, output shape

### Integration Tests

- `tests/integration.test.ts` — fixed HTML fixtures, end-to-end through router, assert final `WebFetchResult` shape
- Marked `integration: true` in test config so unit-test run skips them

### Smoke Tests (manual, gated)

- `tests/smoke.test.ts` — real network fetches; gated behind `RUN_SMOKE=1` env var; verifies agent-browser integration against a known SPA
- Not run in CI

### Coverage Target

- ≥ 80% line coverage on `src/`
- 100% on `src/extractors/jsonld.ts` and `src/formatter.ts` (small, critical)

## Risks and Open Questions

1. **`agent-browser` install script on first install** — `agent-browser` postinstall downloads Chrome (~150MB). This makes the initial `pi install` slow. Mitigation: document the download size and time in README; let it happen during install (matches user expectation of "install everything once").
2. **T2 latency on first call** — spawning `agent-browser` for the first time is ~3-5s (Chrome cold start). Acceptable for v1; deferred optimization is a persistent daemon mode.
3. **Readability false negatives** — Mozilla Readability sometimes refuses to extract content (returns `null`) for valid articles with unusual markup. Falls through to T2.
4. **JSON-LD format variance** — sites use `application/ld+json`, sometimes nested `@graph`, sometimes as `application/json`. The extractor handles the common cases; rare variants return `null` and T1/T2 still work.
5. **Cache key collision** — SHA-256 truncated to 16 hex chars; collision probability is ~negligible for the in-memory cache lifetime, but documented.

## References

- `agent-browser` docs: <https://agent-browser.dev>
- `agent-browser` repo: <https://github.com/vercel-labs/agent-browser>
- pi extension docs: <https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/docs/extensions.md>
- pi `registerTool` signature: same docs, "Custom Tools" section
- Mozilla Readability: <https://github.com/mozilla/readability>
