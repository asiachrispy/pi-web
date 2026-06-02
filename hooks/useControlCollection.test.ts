import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchControlResource,
  invalidateControlResource,
  invalidateControlResourcesMatching,
} from "./useControlCollection";

function resetCache() {
  globalThis.__piControlCache = undefined;
}

beforeEach(() => {
  resetCache();
});

afterEach(() => {
  resetCache();
});

describe("fetchControlResource", () => {
  it("caches successful results for staleMs", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true });
    await fetchControlResource("k1", fetcher, { staleMs: 60_000 });
    await fetchControlResource("k1", fetcher, { staleMs: 60_000 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent calls", async () => {
    const fetcher = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 30));
      return 42;
    });
    const [a, b, c] = await Promise.all([
      fetchControlResource("k2", fetcher),
      fetchControlResource("k2", fetcher),
      fetchControlResource("k2", fetcher),
    ]);
    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(c).toBe(42);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refetches when stale or forced", async () => {
    let counter = 0;
    const fetcher = vi.fn(async () => ++counter);
    expect(await fetchControlResource("k3", fetcher, { staleMs: 5 })).toBe(1);
    expect(await fetchControlResource("k3", fetcher, { staleMs: 5 })).toBe(1);
    await new Promise((r) => setTimeout(r, 15));
    expect(await fetchControlResource("k3", fetcher, { staleMs: 5 })).toBe(2);
    expect(await fetchControlResource("k3", fetcher, { staleMs: 5_000, force: true })).toBe(3);
  });

  it("retries on failure", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("nope"))
      .mockResolvedValueOnce("ok");
    const promise = fetchControlResource("k4", fetcher, { retries: 1 });
    await expect(promise).resolves.toBe("ok");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("exhausts retries and rejects with the last error", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("always"));
    await expect(
      fetchControlResource("k4b", fetcher, { retries: 2 }),
    ).rejects.toThrow("always");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("invalidates by key and predicate", async () => {
    await fetchControlResource("alpha", async () => "a");
    await fetchControlResource("beta", async () => "b");
    invalidateControlResource("alpha");
    invalidateControlResourcesMatching((k) => k.startsWith("beta"));
    expect(globalThis.__piControlCache?.has("alpha")).toBe(false);
    expect(globalThis.__piControlCache?.has("beta")).toBe(false);
  });

  it("invalidating an in-flight entry re-runs on next call", async () => {
    let counter = 0;
    const fetcher = vi.fn(async () => ++counter);
    const promise = fetchControlResource("k5", fetcher);
    invalidateControlResource("k5");
    await promise;
    const value = await fetchControlResource("k5", fetcher, { force: true });
    expect(value).toBe(2);
  });
});
