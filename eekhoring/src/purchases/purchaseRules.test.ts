import {
  applyStockDelta,
  dayLabel,
  dayRange,
  emptyPurchaseForm,
  normalPrice,
  parseMoney,
  purchaseToForm,
  shiftDay,
  stockDelta,
  validatePurchase,
} from './purchaseRules';

test('parseMoney', () => {
  expect(parseMoney('12,50')).toBe(1250);
  expect(parseMoney('R12.50')).toBe(1250);
  expect(parseMoney('R 12')).toBe(1200);
  expect(parseMoney('.5')).toBe(50);
  expect(parseMoney('')).toBeNull();
  expect(parseMoney('12.555')).toBe('invalid');
  expect(parseMoney('-3')).toBe('invalid');
});

const form = (o: Partial<typeof emptyPurchaseForm>) => ({ ...emptyPurchaseForm, ...o });

test('per-unit price builds the total in cents', () => {
  const r = validatePurchase(form({ quantity: '3', priceMode: 'unit', price: '3,33' }), false);
  expect(r.ok && r.values.total_price_cents).toBe(999);
});

test('weight items always take the total and an optional whole pack count', () => {
  const r = validatePurchase(form({ quantity: '1,250', priceMode: 'unit', price: '150', packs: '3' }), true);
  expect(r).toEqual({
    ok: true,
    values: {
      quantity: 1.25,
      total_price_cents: 15000,
      is_special: 0,
      regular_price_cents: null,
      special_note: null,
      is_emergency: 0,
      pack_count: 3,
    },
  });
  expect(validatePurchase(form({ quantity: '1', price: '10', packs: '1.5' }), true)).toEqual({
    ok: false,
    errors: { packs: 'Packs must be a whole number' },
  });
});

test('purchase needs quantity and price; normal price and note only count when Special is on', () => {
  expect(validatePurchase(form({}), false)).toEqual({
    ok: false,
    errors: { quantity: 'Enter how many you bought', price: 'Enter the price paid' },
  });
  const plain = validatePurchase(form({ quantity: '1', price: '10', normalPrice: '12', note: 'x' }), false);
  expect(plain.ok && [plain.values.regular_price_cents, plain.values.special_note]).toEqual([null, null]);
  const special = validatePurchase(form({ quantity: '1', price: '10', special: true, normalPrice: '12', note: ' 3 for 2 ' }), false);
  expect(special.ok && [special.values.is_special, special.values.regular_price_cents, special.values.special_note]).toEqual([
    1,
    1200,
    '3 for 2',
  ]);
});

test('purchaseToForm round-trips', () => {
  const v = {
    quantity: 2,
    total_price_cents: 2599,
    is_special: 1 as const,
    regular_price_cents: 1500,
    special_note: 'deal',
    is_emergency: 1 as const,
    pack_count: null,
  };
  expect(validatePurchase(purchaseToForm(v), false)).toEqual({ ok: true, values: v });
});

const p = (date: string, total: number, is_special = 0) => ({ date, quantity: 1, total_price_cents: total, is_special });

test('normalPrice ignores specials', () => {
  expect(normalPrice([p('2026-01-01', 1200), p('2026-02-01', 1300), p('2026-03-01', 1400), p('2026-04-01', 1000, 1)])).toBe(1300);
});

test('normalPrice uses the last 3, or the most recent with fewer', () => {
  expect(normalPrice([p('2026-01-01', 9900), p('2026-02-01', 1200), p('2026-03-01', 3000), p('2026-04-01', 1300)])).toBe(1300);
  expect(normalPrice([p('2026-01-01', 1200), p('2026-02-01', 1500)])).toBe(1500);
  expect(normalPrice([p('2026-01-01', 1000, 1)])).toBeNull();
});

test('stockDelta ignores purchases before the last stock-take', () => {
  const take = '2026-10-26T08:00:00.000Z';
  expect(stockDelta(null, { date: '2026-10-26T10:00:00.000Z', quantity: 2 }, take)).toBe(2);
  expect(stockDelta(null, { date: '2026-10-25T10:00:00.000Z', quantity: 2 }, take)).toBe(0);
  expect(stockDelta(null, { date: '2026-10-25T10:00:00.000Z', quantity: 2 }, null)).toBe(2);
  expect(stockDelta({ date: '2026-10-26T10:00:00.000Z', quantity: 5 }, null, take)).toBe(-5);
  expect(stockDelta({ date: '2026-10-26T10:00:00.000Z', quantity: 5 }, { date: '2026-10-26T10:00:00.000Z', quantity: 3 }, take)).toBe(-2);
});

test('applyStockDelta never goes below zero', () => {
  expect(applyStockDelta(2, -5)).toBe(0);
  expect(applyStockDelta(0.1, 0.2)).toBe(0.3);
});

test('shiftDay keeps the time and never goes into the future', () => {
  const now = new Date('2026-10-26T10:30:00.000Z');
  expect(shiftDay(now.toISOString(), -1, now)).toBe('2026-10-25T10:30:00.000Z');
  expect(shiftDay('2026-10-25T10:30:00.000Z', 1, now)).toBe('2026-10-26T10:30:00.000Z');
  expect(shiftDay(now.toISOString(), 1, now)).toBe(now.toISOString());
});

test('dayLabel and dayRange', () => {
  const now = new Date('2026-10-26T10:30:00.000Z');
  expect(dayLabel(now.toISOString(), now)).toBe('Today');
  expect(dayLabel(shiftDay(now.toISOString(), -1, now), now)).toBe('Yesterday');
  const [start, end] = dayRange(now.toISOString());
  expect(start <= now.toISOString() && now.toISOString() < end).toBe(true);
  expect(new Date(end).getTime() - new Date(start).getTime()).toBe(24 * 3600 * 1000);
});
