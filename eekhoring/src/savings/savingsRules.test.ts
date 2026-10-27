import { localNormal, monthKey, monthSavings, normalsByStore, tripSavings, weightTotals, type P } from './savingsRules';

const stores = [
  { id: 'c', is_city: 1 },
  { id: 'l1', is_city: 0 },
  { id: 'l2', is_city: 0 },
];
let n = 0;
const p = (item_id: string, store_id: string, unitCents: number, extra: Partial<P> = {}): P => ({
  id: `p${n++}`,
  item_id,
  store_id,
  is_city: store_id === 'c' ? 1 : 0,
  date: '2026-10-10T10:00:00.000Z',
  quantity: 1,
  total_price_cents: unitCents * (extra.quantity ?? 1),
  is_special: 0,
  is_emergency: 0,
  regular_price_cents: null,
  ...extra,
});

test('normalsByStore uses the median of the last 3 non-specials per store', () => {
  const rows = [
    p('rice', 'c', 1200, { date: '2026-10-01T00:00:00.000Z' }),
    p('rice', 'c', 1400, { date: '2026-10-02T00:00:00.000Z' }),
    p('rice', 'c', 1300, { date: '2026-10-03T00:00:00.000Z' }),
    p('rice', 'c', 900, { date: '2026-10-04T00:00:00.000Z', is_special: 1 }),
    p('rice', 'l1', 1500),
  ];
  const m = normalsByStore(rows);
  expect(m.get('rice|c')).toBe(1300);
  expect(m.get('rice|l1')).toBe(1500);
});

test('localNormal takes the cheapest local', () => {
  const m = normalsByStore([p('oil', 'l1', 1500), p('oil', 'l2', 1400), p('oil', 'c', 1000)]);
  expect(localNormal('oil', m, stores)).toBe(1400);
  expect(localNormal('salt', m, stores)).toBeNull();
});

test('tripSavings basic', () => {
  const bought = p('rice', 'c', 2500, { quantity: 2 });
  const r = tripSavings([bought], [bought, p('rice', 'l1', 3000)], stores, 600);
  expect(r).toMatchObject({ basketCity: 5000, basketLocal: 6000, gross: 1000, net: 400, breakEven: 600, specialGain: 0 });
});

test('tripSavings uses the normal price for specials', () => {
  const special = p('oil', 'c', 1000, { is_special: 1, regular_price_cents: 1400 });
  const r = tripSavings([special], [special, p('oil', 'l1', 1500)], stores, 0);
  expect(r).toMatchObject({ basketCity: 1400, basketLocal: 1500, gross: 100, specialGain: 400 });
});

test('tripSavings excludes and lists items without a local price', () => {
  const rice = p('rice', 'c', 2500);
  const caviar = p('caviar', 'c', 50000);
  const r = tripSavings([rice, caviar], [rice, caviar, p('rice', 'l1', 3000)], stores, 0);
  expect(r).toMatchObject({ basketCity: 2500, basketLocal: 3000, gross: 500, noLocal: ['caviar'] });
});

test('tripSavings lists a special with no normal price under needsNormal', () => {
  const special = p('oil', 'c', 1000, { is_special: 1 });
  const r = tripSavings([special], [special, p('oil', 'l1', 1500)], stores, 0);
  expect(r).toMatchObject({ basketCity: 0, basketLocal: 0, specialGain: 0, needsNormal: ['oil'] });
});

test('tripSavings flags items cheaper locally', () => {
  const tea = p('tea', 'c', 2000);
  const r = tripSavings([tea], [tea, p('tea', 'l1', 1800)], stores, 0);
  expect(r).toMatchObject({ gross: -200, cheaperLocally: ['tea'] });
});

test('monthSavings counts only the extra paid on emergencies', () => {
  const all = [p('milk', 'c', 1500), p('bread', 'c', 1500)];
  const month = [p('milk', 'l1', 2000, { is_emergency: 1 }), p('bread', 'l1', 1200, { is_emergency: 1 }), p('salt', 'l1', 900, { is_emergency: 1 })];
  const r = monthSavings(
    [
      { net: 1000, specialGain: 100 },
      { net: -200, specialGain: 50 },
    ],
    month,
    [...all, ...month],
    stores
  );
  expect(r).toEqual({ net: 800, penalty: 500, trueNet: 300, specialGain: 150 });
});

test('weightTotals sums kg per item and Meat', () => {
  const w = (item_id: string, quantity: number, unit: string, category: string) => ({
    ...p(item_id, 'c', 10000, { quantity }),
    unit,
    sold_by_weight: 1,
    category,
  });
  const r = weightTotals([w('mince', 1.25, 'kg', 'Meat'), w('mince', 0.75, 'kg', 'Meat'), w('chicken', 2, 'kg', 'meat'), w('oil', 2, 'L', 'Pantry')]);
  expect(r.meatKg).toBe(4);
  expect(r.perItem).toEqual([
    { item_id: 'mince', unit: 'kg', total: 2 },
    { item_id: 'chicken', unit: 'kg', total: 2 },
    { item_id: 'oil', unit: 'L', total: 2 },
  ]);
});

test('monthKey', () => {
  expect(monthKey(new Date(2026, 9, 31, 23, 0).toISOString())).toBe('2026-10');
});
