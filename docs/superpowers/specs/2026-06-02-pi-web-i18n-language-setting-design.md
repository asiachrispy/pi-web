# pi-web — UI i18n And Language Setting (Slice Design)

Date: 2026-06-02
Project: `pi-web`
Status: Draft
Parent spec: `docs/superpowers/specs/2026-06-01-pi-web-enterprise-workbench-design.md`
Parent plan: `docs/superpowers/plans/2026-06-01-pi-web-enterprise-workbench-implementation-plan.md`
Parent PRD: `docs/superpowers/prd/2026-06-01-pi-web-enterprise-workbench-prd.md`

## 1. Objective

Add a product-level language setting that lets the user switch the pi-web UI between English and Simplified Chinese, with immediate effect and persistence across reloads. The first slice covers the full product UI surface, not just the workbench shell.

## 2. Scope

In scope:

- A lightweight client-side i18n layer for `en` and `zh-CN`.
- A persisted language preference (`localStorage`) with first-run browser-language detection.
- A new language setting in the Settings page.
- Translation of all product UI strings currently rendered by the app shell, workbench pages, settings/config dialogs, history detail, and other product-owned interface chrome.
- Tests for locale resolution, translation fallback, and the language switcher behavior.

Out of scope:

- Translating agent responses, user-authored messages, tool output, file contents, model IDs, provider IDs, skill IDs, or scene IDs.
- Route-level locale segments such as `/en/...` or `/zh-CN/...`.
- Server-side locale negotiation or persistence in a backend store.
- Third-party i18n libraries such as `next-intl` or `i18next` in this slice.
- Additional languages beyond English and Simplified Chinese.

## 3. Goals And Non-Goals

Goals:

- The user can switch language from Settings without reloading the page.
- The selected language persists across reloads and future sessions on the same browser profile.
- If the user has never chosen a language, the product uses browser language as the initial default (`zh*` => `zh-CN`, everything else => `en`).
- Product UI strings are centralized in message dictionaries instead of scattered ternaries.
- Missing translations do not break rendering; the UI falls back predictably.

Non-goals:

- No per-workspace or per-session locale.
- No translation management service or crowd-sourced translation workflow.
- No runtime message fetching from the server.

## 4. Approach Selection

Three approaches were considered:

1. **Lightweight in-house i18n layer (recommended)**
   - `LocaleProvider` + message dictionaries + `t(key)` hook.
   - Best fit for the current codebase: minimal dependency surface, clear migration path, and sufficient capability for two UI languages.
2. **Adopt `next-intl`**
   - Stronger SSR / route integration, but oversized for the current all-client UI needs.
3. **Ad hoc per-component ternaries**
   - Fastest to start, but not maintainable for full-product coverage.

This design adopts option 1.

## 5. Locale Model

Supported locales:

```ts
export type AppLocale = "en" | "zh-CN";
```

Storage key:

```ts
const LOCALE_STORAGE_KEY = "pi-web.locale";
```

Resolution order on first render:

1. `localStorage[LOCALE_STORAGE_KEY]` if it contains a supported locale.
2. `navigator.language` / `navigator.languages[0]`.
3. Map any `zh*` locale to `zh-CN`.
4. Fallback to `en`.

Illegal or corrupted storage values are ignored and treated as missing.

## 6. State And Runtime Architecture

### `LocaleProvider`

Introduce a new client-side provider near the app root. It owns:

- `locale: AppLocale`
- `setLocale(next: AppLocale): void`
- `t(key: TranslationKey, params?): string`

Provider responsibilities:

- Resolve the initial locale synchronously during state initialization.
- Persist locale changes to `localStorage`.
- Re-render all consumers immediately after `setLocale`.
- Expose a stable translation API to components.

### `useI18n()`

Components consume i18n through a single hook:

```ts
const { locale, setLocale, t } = useI18n();
```

This keeps component migration mechanical and avoids passing locale props through the tree.

## 7. Message Dictionary Structure

Add two message modules, for example:

- `lib/i18n/messages/en.ts`
- `lib/i18n/messages/zh-CN.ts`

Recommended shape:

```ts
export const en = {
  common: {
    save: "Save",
    cancel: "Cancel",
    close: "Close",
  },
  settings: {
    title: "Settings",
    language: {
      title: "Language",
      description: "Choose the display language for the product UI.",
      options: {
        en: "English",
        zhCN: "简体中文",
      },
    },
  },
};
```

Key rules:

- Keys are grouped by product domain (`common`, `settings`, `history`, `models`, `skills`, `sceneConfig`, `chat`, `files`, etc.).
- Components do not hardcode user-visible strings.
- Aria labels, empty states, loading text, button labels, error notices, and tab labels are all included.

## 8. Translation API And Fallbacks

`t(key)` resolution order:

1. Read from the current locale dictionary.
2. If missing, fall back to English.
3. If English is also missing, return the key itself.
4. In development, warn once per missing key.

This guarantees that:

- The UI never crashes because of an untranslated key.
- Missing Chinese translations degrade gracefully to English.
- Developers can detect omissions during development.

Interpolation support is limited to simple named placeholder replacement for this slice, e.g.:

```ts
"Selected {count} files"
```

No pluralization framework is required in v1.

## 9. Settings UI

### New language setting

Add a new Settings entry for language selection.

Recommended UX:

- Place it in `WorkbenchSettings` alongside the existing Settings surface rather than opening a separate modal.
- Show a title, short description, and a two-option segmented control or pill buttons:
  - `English`
  - `简体中文`
- Selecting a language applies immediately.

The setting is global to the product UI, not tied to cwd, session, or workspace.

## 10. Coverage Rules

This slice covers the full product UI surface, including:

- `AppShell`
- `SessionSidebar`
- `WorkbenchHome`
- `WorkbenchHistory`
- `WorkbenchHistoryDetail`
- `WorkbenchSettings`
- `ModelsConfig`
- `SkillsConfig`
- `SceneConfigEditor`
- `ChatInput`
- `MessageView` product chrome only
- `FileViewer`
- `FileExplorer`
- `BranchNavigator`
- `TabBar`
- Other product-owned buttons, badges, tabs, section headers, placeholders, aria labels, loading text, and empty states

Not translated in this slice:

- Session transcript content
- Tool result payloads
- Rendered markdown/file contents
- Agent/system prompt bodies
- External IDs and labels that are not product-owned copy

## 11. Migration Strategy

Convert strings in bounded passes instead of an all-at-once blind sweep:

1. Root shell and navigation (`AppShell`, `SessionSidebar`, `BranchNavigator`, `TabBar`)
2. Workbench pages (`WorkbenchHome`, `WorkbenchHistory`, `WorkbenchSettings`)
3. Configuration surfaces (`ModelsConfig`, `SkillsConfig`, `SceneConfigEditor`)
4. Detail overlays (`WorkbenchHistoryDetail`)
5. Chat/file chrome (`ChatInput`, `MessageView`, `FileViewer`, `FileExplorer`)
6. Final grep-based sweep for remaining hardcoded UI strings

This keeps reviewable diffs and reduces the chance of missing a whole product area.

## 12. Edge Cases

- **Unsupported locale in storage**: ignore it and fall back through normal resolution.
- **No browser language available**: use `en`.
- **Missing Chinese key**: show English.
- **Missing English key**: show the key string itself.
- **Locale switched while a modal is open**: modal contents re-render immediately; no close/reopen required.
- **Aria labels**: translated through the same `t()` path so accessibility text stays aligned with visible UI.

## 13. Testing

### Unit tests

Add tests for the i18n core:

- `resolveInitialLocale()`
  - storage locale wins over browser locale
  - `zh-CN` browser locale resolves to `zh-CN`
  - `en-US` resolves to `en`
  - invalid storage value falls back correctly
- `t()`
  - returns the current locale string when present
  - falls back to English when current locale key is missing
  - returns the key when both locales are missing

### Component tests

At minimum:

- Language selector toggles UI copy immediately.
- Language selection persists after reload/remount.
- Representative strings (visible label + aria label + empty state) change with locale.

### Regression sweep

Before finishing the implementation, do a hardcoded-string audit over the product UI and confirm that remaining literals are either:

- non-user-facing identifiers, or
- intentionally untranslated external values.

## 14. Validation

Run from `/Users/mk/codespace/pi-web` after implementation:

- `node_modules/.bin/tsc --noEmit`
- `npm run lint`

If test files are added or modified, also run the relevant targeted tests (`vitest` for the affected i18n and component test files). Do not run `next build` unless explicitly requested.

## 15. Files Touched

New (expected):

- `lib/i18n/index.ts` or equivalent provider/hook entry
- `lib/i18n/messages/en.ts`
- `lib/i18n/messages/zh-CN.ts`
- `lib/i18n/*.test.ts`

Modified (expected, non-exhaustive):

- `app/layout.tsx` or the root provider entry
- `components/AppShell.tsx`
- `components/SessionSidebar.tsx`
- `components/WorkbenchHome.tsx`
- `components/WorkbenchHistory.tsx`
- `components/WorkbenchHistoryDetail.tsx`
- `components/WorkbenchSettings.tsx`
- `components/ModelsConfig.tsx`
- `components/SkillsConfig.tsx`
- `components/SceneConfigEditor.tsx`
- `components/ChatInput.tsx`
- `components/MessageView.tsx`
- `components/FileViewer.tsx`
- `components/FileExplorer.tsx`
- Any other component that still owns product UI copy

No backend schema changes, no API contract changes, and no new external dependency are required.

## 16. Risk Register

| Risk | Mitigation |
| --- | --- |
| The number of strings is larger than expected and implementation sprawls | Migrate in bounded passes and finish with a hardcoded-string sweep |
| Missing translations ship unnoticed | `t()` falls back to English and warns in development |
| Locale flashes from English to Chinese after hydration | Resolve the initial locale synchronously during provider state initialization |
| Components bypass the i18n layer and keep hardcoded copy | Add a final grep/audit step before completion |
| Future locale expansion becomes messy | Keep message dictionaries domain-grouped and centralized from day one |

## 17. Out-Of-Scope Hooks (Follow-Up Candidates)

These are deliberately not in this slice:

- Route-based locale prefixes.
- Server-persisted user language profiles.
- More advanced formatting features (plural rules, rich text message syntax, ICU message format).
- Additional locales beyond English and Simplified Chinese.
