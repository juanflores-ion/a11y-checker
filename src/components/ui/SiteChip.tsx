import { BRAND_LABEL, BRAND_SHORT, type Brand } from '@/lib/model';

const CHIP: Record<Brand, string> = {
  insureon: 'border-brand-ion/35 text-brand-ion',
  techinsurance: 'border-brand-tig/40 text-brand-tig',
};

/** `ION` / `TIG`. Brand identity, not severity — never red or green. */
export function SiteChip({ brand }: { brand: Brand }) {
  return (
    <span
      title={BRAND_LABEL[brand]}
      className={`inline-block rounded-[5px] border px-1.5 font-mono text-[11px] leading-[17px] ${CHIP[brand]}`}
    >
      {BRAND_SHORT[brand]}
    </span>
  );
}
