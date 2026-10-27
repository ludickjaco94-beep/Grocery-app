export type Unit = 'kg' | 'L' | 'pack' | 'each';
export type BuyMode = 'monthly' | 'as_needed';

export const UNITS: Unit[] = ['kg', 'L', 'pack', 'each'];

export type ItemForm = {
  name: string;
  unit: Unit;
  category: string;
  buyMode: BuyMode;
  soldByWeight: boolean;
  bufferPct: string;
  maxMonthsCover: string;
  estMonthlyUsage: string;
  packSize: string;
};

export type ItemValues = {
  name: string;
  unit: Unit;
  category: string;
  buy_mode: BuyMode;
  sold_by_weight: 0 | 1;
  buffer_pct: number;
  max_months_cover: number;
  est_monthly_usage: number | null;
  pack_size: number | null;
};

export const emptyItemForm: ItemForm = {
  name: '',
  unit: 'each',
  category: '',
  buyMode: 'monthly',
  soldByWeight: false,
  bufferPct: '10',
  maxMonthsCover: '2',
  estMonthlyUsage: '',
  packSize: '',
};

// Accepts "1,5" as well as "1.5": the phone keyboard may use a decimal comma.
export function parseDecimal(s: string): number | null | 'invalid' {
  const t = s.trim().replace(',', '.');
  if (t === '') return null;
  return /^-?(\d+\.?\d*|\.\d+)$/.test(t) ? Number(t) : 'invalid';
}

export function validateItem(
  f: ItemForm
): { ok: true; values: ItemValues } | { ok: false; errors: Partial<Record<keyof ItemForm, string>> } {
  const errors: Partial<Record<keyof ItemForm, string>> = {};
  const name = f.name.trim();
  if (!name) errors.name = 'Give the item a name';

  const buffer = parseDecimal(f.bufferPct);
  if (typeof buffer !== 'number' || !Number.isInteger(buffer) || buffer < 0 || buffer > 100)
    errors.bufferPct = 'Buffer must be a whole number from 0 to 100';

  const cap = parseDecimal(f.maxMonthsCover);
  if (typeof cap !== 'number' || cap <= 0) errors.maxMonthsCover = 'Cap must be more than 0 months';
  else if (typeof buffer === 'number' && !errors.bufferPct && cap < (100 + buffer) / 100)
    errors.maxMonthsCover = `Cap must be at least ${(100 + buffer) / 100} months to cover the ${buffer}% buffer`;

  const est = parseDecimal(f.estMonthlyUsage);
  if (est === 'invalid' || (est !== null && est < 0)) errors.estMonthlyUsage = 'Estimate must be blank or 0 or more';

  const pack = f.soldByWeight ? null : parseDecimal(f.packSize);
  if (pack === 'invalid' || (pack !== null && pack <= 0)) errors.packSize = 'Pack size must be blank or more than 0';

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    values: {
      name,
      // Sold by measure (spec 4.6): kg or L, priced per unit across pack sizes.
      unit: f.soldByWeight ? (f.unit === 'L' ? 'L' : 'kg') : f.unit,
      category: f.category.trim() || 'Other',
      buy_mode: f.buyMode,
      sold_by_weight: f.soldByWeight ? 1 : 0,
      buffer_pct: buffer as number,
      max_months_cover: cap as number,
      est_monthly_usage: est as number | null,
      pack_size: pack as number | null,
    },
  };
}

export function findDuplicate(
  name: string,
  others: { id: string; name: string }[],
  selfId?: string
): { id: string; name: string } | undefined {
  const key = name.trim().toLowerCase();
  return others.find((o) => o.id !== selfId && o.name.trim().toLowerCase() === key);
}

const str = (n: number | null) => (n === null ? '' : String(n));

export function itemToForm(v: ItemValues): ItemForm {
  return {
    name: v.name,
    unit: v.unit,
    category: v.category,
    buyMode: v.buy_mode,
    soldByWeight: v.sold_by_weight === 1,
    bufferPct: str(v.buffer_pct),
    maxMonthsCover: str(v.max_months_cover),
    estMonthlyUsage: str(v.est_monthly_usage),
    packSize: str(v.pack_size),
  };
}
