import type { Hears, IssuePicture as Picture } from '@/lib/issues';

/**
 * The Now → After-the-fix picture on every expanded issue row.
 *
 * One closed set of pictograms, drawn once here in CSS and inline SVG so they
 * match the dashboard's tokens and never load anything. The data in
 * `issues.ts` only picks a pictogram and says what the agent is told on each
 * side; a reader who never opens "Details" should still leave with the right
 * idea from these two boxes and one plain sentence.
 */
export function IssuePicture({ picture }: { picture: Picture }) {
  return (
    <div className="grid grid-cols-[1fr_1.5rem_1fr] items-stretch gap-1.5">
      <Side tone="now" hears={'now' in picture ? picture.now : undefined}>
        <Pictogram picture={picture} side="now" />
      </Side>
      <div aria-hidden="true" className="self-center text-center text-2xl leading-none text-faint">›</div>
      <Side tone="fixed" hears={'fixed' in picture ? picture.fixed : undefined}>
        <Pictogram picture={picture} side="fixed" />
      </Side>
    </div>
  );
}

function Side({ tone, hears, children }: { tone: 'now' | 'fixed'; hears?: Hears; children: React.ReactNode }) {
  return (
    <div className="relative min-h-[6rem] rounded-card border border-rule bg-paper px-3 py-2.5">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.06em] text-faint">
        <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${tone === 'now' ? 'bg-critical' : 'bg-good'}`} />
        {tone === 'now' ? 'Now' : 'After the fix'}
      </div>
      {children}
      {hears ? (
        <div className="mt-2 font-mono text-[10.5px] leading-relaxed text-faint">
          agent hears:{' '}
          <span className={tone === 'now' ? 'text-critical' : 'font-medium text-good'}>{hears.hears}</span>
        </div>
      ) : null}
    </div>
  );
}

function Pictogram({ picture, side }: { picture: Picture; side: 'now' | 'fixed' }) {
  const fixed = side === 'fixed';
  switch (picture.kind) {
    case 'control':
      return <Control control={picture.control} fixed={fixed} label={(fixed ? picture.fixed : picture.now).label} />;
    case 'menu':
      return <Menu variant={picture.variant} fixed={fixed} />;
    case 'panel':
      return <Panel variant={picture.variant} fixed={fixed} />;
    case 'page':
      return <Page variant={picture.variant} fixed={fixed} />;
    case 'text':
      return <Text variant={picture.variant} fixed={fixed} />;
    case 'headings':
      return <Headings fixed={fixed} />;
  }
}

/* ------------------------------------------------------------------ */
/* Pictograms                                                          */
/* ------------------------------------------------------------------ */

const BOX = 'inline-flex items-center gap-1.5 rounded-[6px] border px-2.5 py-1 text-[11px]';
const GHOST = `${BOX} border-dashed border-faint text-faint`;
const REAL = `${BOX} border-rule bg-card text-ink`;

function Chevron() {
  return (
    <svg width="9" height="6" viewBox="0 0 9 6" aria-hidden="true" className="inline-block align-middle">
      <path d="M1 1l3.5 3.5L8 1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Burger() {
  return (
    <svg width="14" height="12" viewBox="0 0 14 12" aria-hidden="true">
      <rect y="0" width="14" height="2" rx="1" fill="currentColor" />
      <rect y="5" width="14" height="2" rx="1" fill="currentColor" />
      <rect y="10" width="14" height="2" rx="1" fill="currentColor" />
    </svg>
  );
}

function Control({ control, fixed, label }: { control: 'burger' | 'close' | 'back' | 'input' | 'link' | 'card'; fixed: boolean; label?: string }) {
  const cls = fixed ? REAL : GHOST;
  switch (control) {
    case 'burger':
      return (
        <span className={cls}>
          <Burger />
          {fixed && label ? <span className="sr-only">{label}</span> : null}
        </span>
      );
    case 'close':
      return <span className={`${cls} h-7 w-7 justify-center px-0 text-sm`}>×</span>;
    case 'back':
      return (
        <span className={cls}>
          <span className="text-sm leading-none">‹</span>
          {fixed && label ? label : null}
        </span>
      );
    case 'input':
      return (
        <span className={`${fixed ? 'border-rule bg-card' : 'border-dashed border-faint'} flex items-center justify-between rounded-[6px] border px-2.5 py-1.5 text-[11px] ${fixed ? 'text-ink' : 'text-faint'}`}>
          <span className={fixed ? '' : 'italic'}>{label}</span>
          <span className="text-faint"><Chevron /></span>
        </span>
      );
    case 'link':
      return fixed ? (
        <span className="text-[11px] text-faint">(nothing rendered)</span>
      ) : (
        <span className="inline-block h-4 w-14 rounded border border-dashed border-critical/70 align-middle" aria-hidden="true" />
      );
    case 'card':
      return (
        <span className="block w-40 rounded-[6px] border border-rule bg-card p-2">
          <span className="mb-1.5 block h-6 w-8 rounded bg-rule" aria-hidden="true" />
          <span className={`block text-[11px] ${fixed ? 'text-accent underline underline-offset-2' : 'text-ink'}`}>General liability</span>
          <span className="block text-[10px] text-faint">Best for client injuries…</span>
        </span>
      );
  }
}

function Menu({ variant, fixed }: { variant: 'hover' | 'unfindable'; fixed: boolean }) {
  return (
    <div>
      <div className="flex gap-2.5 whitespace-nowrap rounded-[5px] border border-rule bg-card px-2 py-1 text-[10.5px] text-ink">
        <span>Small business</span>
        <span className="inline-flex items-center gap-1 border-b border-accent text-accent">
          Products
          {fixed ? <Chevron /> : null}
        </span>
        <span>Industries</span>
      </div>
      <div
        className={`ml-5 mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 rounded-[5px] border px-2 py-1 text-[10px] ${
          fixed ? 'border-good text-muted' : 'border-dashed border-critical text-faint'
        }`}
      >
        <span>General liability</span>
        <span>Workers’ comp</span>
        <span>Cyber</span>
        <span>+ 53 more</span>
        {!fixed ? (
          <span className="basis-full text-[9.5px] text-critical">
            {variant === 'hover' ? 'opens on hover only' : 'not in the tree, nothing announces it'}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Panel({ variant, fixed }: { variant: 'drawer' | 'related' | 'hidden'; fixed: boolean }) {
  if (variant === 'hidden') {
    return (
      <div className={`inline-block rounded-[6px] border px-3 py-2 text-[10.5px] ${fixed ? 'border-rule text-faint' : 'border-dashed border-critical text-faint ring-2 ring-accent/60'}`}>
        marked hidden {fixed ? '· skipped' : '· focus lands here'}
      </div>
    );
  }
  const title = variant === 'drawer' ? 'Menu' : 'Related topics';
  const items = variant === 'drawer' ? ['Small business', 'Products', 'Industries', '+ 65 more'] : ['#liability', '#claims', '#small-business', '+ 9 more'];
  return (
    <div className="w-44">
      <div className="flex items-center justify-between rounded-[5px] border border-rule bg-card px-2 py-1 text-[10.5px] text-ink">
        <span className="inline-flex items-center gap-1.5">
          {variant === 'drawer' ? <Burger /> : null}
          {title}
        </span>
        <span className="text-faint">{fixed ? '›' : '—'}</span>
      </div>
      <div className={`mt-1 rounded-[5px] border px-2 py-1 text-[10px] ${fixed ? 'border-rule text-faint/60' : 'border-dashed border-critical text-faint'}`}>
        {fixed ? (
          <span>closed, nothing inside is reachable</span>
        ) : (
          <span className="flex flex-wrap gap-x-2">
            {items.map((i) => (
              <span key={i} className="underline decoration-dotted underline-offset-2">
                {i}
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

function Page({ variant, fixed }: { variant: 'main' | 'regions'; fixed: boolean }) {
  const blk = 'mt-1 rounded border px-1.5 py-1 text-[10px]';
  const plain = `${blk} border-dashed border-rule text-faint`;
  const named = `${blk} border-good text-good`;
  const rows =
    variant === 'main'
      ? [
          { t: 'header · menu · banner', ok: false },
          { t: fixed ? 'main, content starts here' : '…content somewhere in here…', ok: fixed },
          { t: 'footer', ok: false },
        ]
      : [
          { t: fixed ? 'header' : 'menu · banner · search…', ok: fixed },
          { t: fixed ? 'main' : '…cards · text · form…', ok: fixed },
          { t: fixed ? 'footer' : '…links · legal…', ok: fixed },
        ];
  return (
    <div className="w-44 rounded-[5px] border border-rule bg-card p-1.5">
      <div className="mb-1 h-1.5 w-3/5 rounded bg-rule" aria-hidden="true" />
      {rows.map((r) => (
        <div key={r.t} className={r.ok ? named : plain}>
          {r.t}
        </div>
      ))}
    </div>
  );
}

/**
 * Deliberately not themed.
 *
 * These two draw a piece of the real website, which is white with dark text
 * whatever theme the dashboard is in. The greys are the exact ones the
 * contrast finding is about — #84829c on white is the 3.7:1 being reported —
 * so swapping them for tokens would destroy the thing the picture exists to
 * demonstrate.
 */
function Text({ variant, fixed }: { variant: 'contrast' | 'link-colour'; fixed: boolean }) {
  if (variant === 'contrast') {
    return (
      <div>
        <div className="rounded-[5px] bg-white px-2.5 py-2 text-[12px]" style={{ color: fixed ? '#767391' : '#84829c' }}>
          Toll-free: (800) 668-7020
        </div>
        <div className={`mt-1.5 font-mono text-[10.5px] ${fixed ? 'text-good' : 'text-critical'}`}>
          {fixed ? '4.5 : 1, passes' : '3.7 : 1, needs 4.5 : 1'}
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-[5px] bg-white px-2.5 py-2 text-[12px] leading-relaxed" style={{ color: '#2b2a3a' }}>
      Most small businesses need{' '}
      <span style={{ color: '#470fdd', textDecoration: fixed ? 'underline' : 'none', textUnderlineOffset: 2 }}>
        general liability insurance
      </span>{' '}
      before signing a lease.
    </div>
  );
}

function Headings({ fixed }: { fixed: boolean }) {
  const line = (level: string, text: string, tone: 'ink' | 'faint' | 'bad', indent: number) => (
    <div key={level + text} className={`flex items-baseline gap-2 text-[11px] ${tone === 'bad' ? 'text-critical' : tone === 'ink' ? 'text-ink' : 'text-muted'}`} style={{ paddingLeft: indent * 12 }}>
      <span className="font-mono text-[10px] text-faint">{level}</span>
      <span>{text}</span>
    </div>
  );
  return (
    <div className="space-y-0.5">
      {line('H1', 'Small business insurance', 'ink', 0)}
      {line('H2', 'Which policies you need', 'ink', 1)}
      {fixed
        ? line('H3', 'General liability', 'ink', 2)
        : [
            <div key="gap" className="pl-6 text-[10px] text-critical">
              (H3 missing)
            </div>,
            line('H4', 'General liability', 'bad', 3),
          ]}
    </div>
  );
}
