'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { PageResult } from '@/lib/model';
import type { PublishedScanner } from '@/lib/scannerEndpoint';

/**
 * Which scanner the page talks to, shared by every mode on the Scan page.
 *
 * This was private state inside LiveScanClient, which is why the full run
 * could only ever reach the public internet: it posted to `/api/scan` on the
 * host and had no way to know a scanner was running inside the network. That
 * mattered the moment we wanted a staging baseline — staging answers only on
 * the VPN, so a run that cannot choose its scanner cannot record staging at
 * all.
 */
export const HOSTED = '';
const MAX_URLS_HOSTED = 3;
const MAX_URLS_LOCAL = 10;
const STORAGE_KEY = 'agent-readiness:scan-server';
const TOKEN_STORAGE_KEY = 'agent-readiness:scan-token';

/** `token`: the scanner answered, but wants a token we don't have or rejected ours. */
export type Health = 'unknown' | 'checking' | 'online' | 'offline' | 'token';

export type LiveScanResult = PageResult & { axeVersion?: string | null };

/** The scanner answered with an error of its own — the network is fine, so it is not "offline". */
export class ScanRequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Where a scan request goes, given the configured server address. */
export function endpoints(serverUrl: string) {
  const base = serverUrl.trim().replace(/\/+$/, '');
  return base
    ? { health: `${base}/health`, scan: `${base}/scan`, hosted: false, maxUrls: MAX_URLS_LOCAL }
    : { health: '/api/scan', scan: '/api/scan', hosted: true, maxUrls: MAX_URLS_HOSTED };
}

export function authHeaders(serverUrl: string, token: string): Record<string, string> {
  return !endpoints(serverUrl).hosted && token.trim()
    ? { Authorization: `Bearer ${token.trim()}` }
    : {};
}

export function describeFetchError(err: unknown, serverUrl: string): string {
  if (err instanceof ScanRequestError) return err.message;
  const { hosted } = endpoints(serverUrl);
  if (err instanceof DOMException && err.name === 'AbortError') {
    return 'The scan took longer than three minutes and was stopped.';
  }
  return hosted
    ? `Could not reach this site's scanner. ${(err as Error).message}`
    : `Could not reach ${serverUrl}. Check it is running, and that the address is right. ${(err as Error).message}`;
}

export interface Scanner {
  serverUrl: string;
  token: string;
  health: Health;
  /** Set when the address came from the published value rather than this browser. */
  published: PublishedScanner | null;
  setServerUrl: (url: string) => void;
  setToken: (token: string) => void;
  recheck: () => void;
  /**
   * POST a batch of URLs. Throws ScanRequestError for a scanner-side complaint.
   *
   * The deadline scales with the batch: a live scan of three URLs and a full
   * run of ten through a tunnel are not the same wait, and a fixed three
   * minutes aborted the second one mid-run — losing forty page loads to a
   * timer rather than to anything wrong.
   */
  scan: (
    body: { urls: unknown[]; viewport: string },
    signal?: AbortSignal
  ) => Promise<{
    results: LiveScanResult[];
    finishedAt?: string;
    /** Same four keys the run file records; a server that predates them sends none. */
    provenance?: { probeVersion?: string | null; browserVersion?: string | null; browserPath?: string | null };
    scannedBy?: string;
    viewportSpec?: { width: number; height: number; isMobile: boolean };
  }>;
}

function persist(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Value still works for this session even if it can't be persisted.
  }
}

export function useScanner(): Scanner {
  const [serverUrl, setServerUrlState] = useState(HOSTED);
  const [token, setTokenState] = useState('');
  const [health, setHealth] = useState<Health>('unknown');
  const [published, setPublished] = useState<PublishedScanner | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const checkHealth = useCallback(async (url: string, tok: string) => {
    setHealth('checking');
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(endpoints(url).health, {
        headers: authHeaders(url, tok),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        setHealth('offline');
        return;
      }
      const body = (await res.json().catch(() => null)) as
        | { authRequired?: boolean; tokenAccepted?: boolean }
        | null;
      const tokenProblem =
        Boolean(body?.authRequired) && (!tok.trim() || body?.tokenAccepted === false);
      setHealth(tokenProblem ? 'token' : 'online');
    } catch {
      setHealth('offline');
    }
  }, []);

  // `localStorage` and `fetch` don't exist while this page is prerendered.
  useEffect(() => {
    let saved: string | null = null;
    let savedToken: string | null = null;
    try {
      saved = window.localStorage.getItem(STORAGE_KEY);
      savedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    } catch {
      // No persisted value — fall back to the default silently.
    }
    if (saved) setServerUrlState(saved);
    if (savedToken) setTokenState(savedToken);

    /**
     * Nothing saved here? Take whatever scanner is published. Read fresh every
     * visit and never written to localStorage, so a browser follows the
     * publisher to their next tunnel instead of holding a dead address.
     */
    if (saved) {
      checkHealth(saved, savedToken ?? '');
    } else {
      fetch('/api/scanner', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((body: { published?: PublishedScanner | null } | null) => {
          const p = body?.published;
          if (!p?.address) {
            checkHealth(HOSTED, savedToken ?? '');
            return;
          }
          setServerUrlState(p.address);
          setTokenState(p.token ?? '');
          setPublished(p);
          checkHealth(p.address, p.token ?? '');
        })
        .catch(() => checkHealth(HOSTED, savedToken ?? ''));
    }
    return () => abortRef.current?.abort();
  }, [checkHealth]);

  const setServerUrl = useCallback(
    (next: string) => {
      setServerUrlState(next);
      persist(STORAGE_KEY, next);
      setPublished(null);
    },
    []
  );

  const setToken = useCallback((next: string) => {
    setTokenState(next);
    persist(TOKEN_STORAGE_KEY, next);
  }, []);

  const scan = useCallback<Scanner['scan']>(
    async (body, signal) => {
      const attempt = async (retried: boolean): Promise<Awaited<ReturnType<Scanner['scan']>>> => {
      const controller = new AbortController();
      abortRef.current = controller;
      /** 45s a page, floor of three minutes — generous, and still bounded. */
      const budget = Math.max(3 * 60 * 1000, body.urls.length * 45 * 1000);
      const timeout = setTimeout(() => controller.abort(), budget);
      signal?.addEventListener('abort', () => controller.abort());
      try {
        const res = await fetch(endpoints(serverUrl).scan, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders(serverUrl, token) },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const parsed = await res.json().catch(() => null);
        // It answered, so it is reachable: a 401 means the token, anything
        // else is a complaint about the request, not an outage.
        setHealth(res.status === 401 ? 'token' : 'online');
        if (!res.ok) {
          /**
           * 429 means the scanner is still finishing the previous batch. That
           * is a wait, not a failure — retry once rather than lose the run.
           */
          if (res.status === 429 && !retried) {
            await new Promise((r) => setTimeout(r, 4000));
            return attempt(true);
          }
          throw new ScanRequestError(parsed?.error ?? `Scan server returned ${res.status}`, res.status);
        }
        return parsed;
      } finally {
        clearTimeout(timeout);
      }
      };
      return attempt(false);
    },
    [serverUrl, token]
  );

  return {
    serverUrl,
    token,
    health,
    published,
    setServerUrl,
    setToken,
    recheck: () => checkHealth(serverUrl, token),
    scan,
  };
}
