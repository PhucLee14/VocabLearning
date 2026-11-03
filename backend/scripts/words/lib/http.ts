import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Polite JSON/text fetching for the enrichment script:
 * - a disk cache (re-runs do not hit the APIs again; delete the folder or pass
 *   `refresh` to refetch),
 * - a minimum delay between requests to the same host,
 * - retries with backoff on 429 / 5xx / network errors.
 */

export type HttpResult = { status: number; body: string };

export type HttpOptions = {
  cacheDir: string;
  refresh?: boolean;
  /** Minimum gap between two requests to the same host, in ms. */
  minIntervalMs?: number;
  retries?: number;
  /**
   * The API answers in JSON, so a 404 whose body is not JSON (e.g. an HTML error
   * page from a flaky upstream) is treated as transient: retried, never cached.
   */
  expectJson?: boolean;
};

const USER_AGENT = 'Godee-enricher/0.1 (personal, non-commercial English learning project)';
const lastRequestAt = new Map<string, number>();

const looksLikeJson = (body: string) => /^\s*[[{]/.test(body);

/** A 404 we can trust (and cache): any 404, or for JSON APIs only a JSON 404. */
const isDefinitive404 = (r: HttpResult, expectJson?: boolean) =>
  r.status === 404 && (!expectJson || looksLikeJson(r.body));

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function cachePath(cacheDir: string, url: string) {
  return join(cacheDir, `${createHash('sha1').update(url).digest('hex')}.json`);
}

export async function fetchCached(url: string, opts: HttpOptions): Promise<HttpResult> {
  const file = cachePath(opts.cacheDir, url);
  if (!opts.refresh) {
    try {
      const cached = JSON.parse(readFileSync(file, 'utf8')) as HttpResult;
      if (cached.status === 200 || isDefinitive404(cached, opts.expectJson)) return cached;
    } catch {
      // Not cached yet.
    }
  }

  const host = new URL(url).host;
  const minInterval = opts.minIntervalMs ?? 300;
  const retries = opts.retries ?? 3;

  for (let attempt = 0; ; attempt++) {
    const wait = (lastRequestAt.get(host) ?? 0) + minInterval - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt.set(host, Date.now());

    let result: HttpResult | null = null;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(20_000),
      });
      result = { status: res.status, body: await res.text() };
    } catch (error) {
      if (attempt >= retries) throw error;
    }

    const retryable =
      !result ||
      result.status === 429 ||
      result.status >= 500 ||
      (result.status === 404 && !isDefinitive404(result, opts.expectJson));
    if (retryable && attempt < retries) {
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (!result) throw new Error(`GET ${url} failed`);

    // Cache successes and definitive misses (404), never transient errors.
    if (result.status === 200 || isDefinitive404(result, opts.expectJson)) {
      mkdirSync(opts.cacheDir, { recursive: true });
      writeFileSync(file, JSON.stringify(result));
    }
    return result;
  }
}

export async function fetchJson<T>(url: string, opts: HttpOptions): Promise<T | null> {
  const { status, body } = await fetchCached(url, { ...opts, expectJson: true });
  if (status === 404 && looksLikeJson(body)) return null;
  if (status !== 200) throw new Error(`GET ${url} → ${status}`);
  return JSON.parse(body) as T;
}
