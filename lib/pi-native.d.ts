interface WebFetchOptions {
  /** Wait condition: 'load' | 'domcontentloaded' | 'networkidle' (default 'networkidle') */
  waitUntil?: "load" | "domcontentloaded" | "networkidle";
  /** Timeout in ms (default 15000) */
  timeoutMs?: number;
}

interface WebFetchResult {
  markdown: string;
  length: number;
  title: string;
  finalUrl: string;
}

interface PiNativeBridge {
  version?: string;
  pickWorkspaceDirectory?: () => Promise<string | null>;
  /** macOS NSOpenPanel — absolute paths, any location on disk. */
  pickFiles?: () => Promise<string[] | null>;
  showNotification?: (input: {
    title?: string;
    body?: string;
    sessionId: string;
    sessionName?: string;
  }) => void;
  openPath?: (path: string) => Promise<void>;
  restartServer?: () => Promise<void>;
  /**
   * macOS Pi.app only — hidden WKWebView fetch. Resolves null if unavailable.
   * Provided by the web-fetch extension (P4 of `web-fetch`).
   */
  webFetch?: (url: string, options?: WebFetchOptions) => Promise<WebFetchResult | null>;
}

interface Window {
  piNative?: PiNativeBridge;
}
