'use client';

import type { PublishedScanner } from '@/lib/scannerEndpoint';
import { Eyebrow } from '../Primitives';
import type { Health } from './useScanner';

/**
 * The "Scanner · change" control: which scanner this page talks to, its
 * health, and the address/token when it isn't the hosted one.
 *
 * Lifted out of LiveScanClient so the full run can show it too — a run that
 * records staging has to go through a scanner inside the network, and the
 * control that picks one belonged to a different component entirely.
 */
export function ServerStatus({
  serverUrl,
  token,
  health,
  published,
  onServerUrlChange,
  onTokenChange,
  onRecheck,
}: {
  serverUrl: string;
  token: string;
  health: Health;
  published: PublishedScanner | null;
  onServerUrlChange: (url: string) => void;
  onTokenChange: (token: string) => void;
  onRecheck: () => void;
}) {
  const dotClass =
    health === 'online'
      ? 'bg-good'
      : health === 'offline'
      ? 'bg-critical'
      : health === 'token'
      ? 'bg-serious'
      : 'bg-faint';
  const hosted = !serverUrl.trim();
  const labelText =
    health === 'online'
      ? hosted
        ? 'Scanner ready'
        : 'Your scanner ready'
      : health === 'offline'
      ? hosted
        ? 'Scanner unavailable'
        : 'Your scanner offline'
      : health === 'token'
      ? 'Scanner needs a token'
      : health === 'checking'
      ? 'Checking…'
      : 'Scanner';

  return (
    <details className="group relative">
      <summary className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
        {labelText}
        <span className="text-faint">· change</span>
      </summary>
      <div className="absolute right-0 top-full z-30 mt-2 w-96 space-y-3 rounded-lg border border-rule bg-card p-4 shadow-pop">
        {published ? (
          <p className="rounded-card border border-accent/25 bg-accent/[0.06] px-3 py-2 text-[11.5px] leading-relaxed text-muted">
            Filled in from the scanner published{' '}
            <time dateTime={published.publishedAt}>
              {new Date(published.publishedAt).toLocaleString(undefined, {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </time>
            {published.note ? ` · ${published.note}` : ''}. Change anything below and this browser
            keeps your version instead.
          </p>
        ) : null}
        <div>
          <Eyebrow>Which scanner</Eyebrow>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {hosted
              ? 'Running on this site — nothing to install. Limited to our own public domains and a few URLs per scan.'
              : 'Running inside the network — on this machine, or on a colleague’s through a tunnel URL. This is how staging gets scanned. If it was started with a token, enter it below.'}
          </p>
        </div>

        <label className="block">
          <span className="text-eyebrow font-medium text-muted">
            Scanner address <span className="text-faint">· blank uses this site</span>
          </span>
          <input
            type="text"
            value={serverUrl}
            placeholder="http://localhost:4790 or a tunnel URL"
            onChange={(e) => onServerUrlChange(e.target.value)}
            className="mt-1 w-full rounded-card border border-rule bg-paper px-2.5 py-1.5 font-mono text-xs transition-shadow"
          />
        </label>

        {!hosted ? (
          <label className="block">
            <span className="text-eyebrow font-medium text-muted">
              Token <span className="text-faint">· only if the scanner asks for one</span>
            </span>
            <input
              type="password"
              value={token}
              autoComplete="off"
              onChange={(e) => onTokenChange(e.target.value)}
              className="mt-1 w-full rounded-card border border-rule bg-paper px-2.5 py-1.5 font-mono text-xs transition-shadow"
            />
          </label>
        ) : null}

        <button
          type="button"
          onClick={onRecheck}
          className="text-sm font-medium text-accent hover:underline"
        >
          Check again
        </button>

        {health === 'token' ? (
          <p className="text-xs leading-relaxed text-muted">
            This scanner was started with a token. Paste the one whoever started it gave you, then check again.
          </p>
        ) : null}

        {health === 'offline' ? (
          <p className="text-xs leading-relaxed text-muted">
            {hosted ? (
              'This site’s scanner didn’t respond. Try again, or point this at a scanner inside your network:'
            ) : (
              <>Nothing is answering there. On the machine that should be running it:</>
            )}
            <code className="mt-1.5 block rounded-card border border-rule bg-paper px-2 py-1.5 font-mono text-[11px] text-ink">
              npm run scan-server
            </code>
            <span className="mt-1.5 block">To share it through a tunnel, see “Reach staging through a tunnel” in the README.</span>
          </p>
        ) : null}
      </div>
    </details>
  );
}
