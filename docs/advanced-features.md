# Advanced features (pi-web)

These features are optional. The default workbench path (home, new chat, simple tools) stays unchanged unless you turn on **Advanced mode** in Settings.

## Slash commands

1. Open **Settings** and enable **Advanced mode**.
2. Enable **Slash command completion** (off by default).
3. In a conversation, type `/` at the start of the input or after a space.
4. Pick a command from the list. pi-web sends it as a user message (same as the CLI).

The list includes extension commands, prompt templates, and skills (`/skill:name`). Built-in TUI-only commands are not listed.

## Insert skill in chat

Use **Insert skill** below the message box (any mode). This adds `/skill:name` to the input without sending. Edit the text, then press Enter when ready.

Skill files are managed under **Settings → Skills**.

## Export conversation as HTML

- **Chat**: **Export HTML** in the toolbar under the message box.
- **Settings → Stability**: **Download HTML** when a conversation is open.

Wait until the agent finishes replying before exporting.

## Remote access

**Settings → Remote access** is off by default.

1. Read the short wizard (purpose and risks).
2. Choose **View only** if the phone should not send messages.
3. **Turn on and pair**, then scan the QR code or copy the pairing link.
4. Revoke devices you no longer trust.

Developer options (hostnames, tunnels, relay) are under **Developer options** at the bottom of the remote section.

## Activity chart

**Settings** shows session activity for the last 7 days: new conversations, completions, and still-active threads. This uses session dates only, not per-message token counts.

## Web Fetch tool

The `web_fetch` tool lets the LLM read any URL as structured JSON-LD (zero-extraction cost for product pages, articles, etc.) or clean Markdown (for plain pages). It's installed as the `pi-fetch-tool` extension; once installed, the LLM calls it automatically when given a URL.

Three tiers run in order of cost:

| Tier | Backend | When | Token cost |
|------|---------|------|------------|
| **T0** | JSON-LD / OpenGraph regex | Always first | ~0 (structured JSON the LLM can read directly) |
| **T1** | `fetch` + Mozilla Readability | When T0 finds nothing | ~500 (clean Markdown) |
| **T2** | `agent-browser` (cross-platform) **or** macOS WKWebView (Pi.app only) | When T0+T1 fail | ~2,000 (accessibility tree Markdown) |

Manage Tier 2 backend, cache TTL, and agent-browser installation under **Settings → Web Fetch**. On macOS Pi.app, Tier 2 prefers the app's own WKWebView — no separate Chrome download, sub-second latency.

Install:

```bash
pi install pi-fetch-tool
```

Default installation includes `agent-browser` (~5 MB binary). The first `agent-browser install` run downloads Chrome (~150 MB, one-time).

## See also

- [Managing conversations and branches](./managing-conversations-and-branches.md)
- [M3 checklist](./m3-checklist.md)
