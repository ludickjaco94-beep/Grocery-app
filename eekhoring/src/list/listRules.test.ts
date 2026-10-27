import { estimateTotal, planList, prefillPrice, validateTrip, type Entry } from './listRules';

const entry = (id: string, item_id: string, quantity: number, added_manually = 0, ticked = 0): Entry => ({
  id,
  item_id,
  quantity,
  added_manually,
  ticked,
});

test('planList on an empty list inserts every suggestion', () => {
  expect(planList([{ item_id: 'rice', quantity: 2 }, { item_id: 'oil', quantity: 1 }], [])).toEqual({
    insert: [{ item_id: 'rice', quantity: 2 }, { item_id: 'oil', quantity: 1 }],
    update: [],
    remove: [],
  });
});

test('planList keeps ticked and manual entries', () => {
  const entries = [entry('e1', 'rice', 2, 0, 1), entry('e2', 'soap', 1, 1, 0)];
  expect(planList([{ item_id: 'rice', quantity: 3 }], entries)).toEqual({ insert: [], update: [], remove: [] });
});

test('planList updates and removes unticked suggested entries', () => {
  const entries = [entry('e1', 'rice', 2), entry('e2', 'oil', 1)];
  expect(planList([{ item_id: 'rice', quantity: 4 }], entries)).toEqual({
    insert: [],
    update: [{ id: 'e1', quantity: 4 }],
    remove: ['e2'],
  });
});

test('estimateTotal skips and counts unpriced rows', () => {
  expect(
    estimateTotal([
      { quantity: 2, unitCents: 1250 },
      { quantity: 1, unitCents: null },
      { quantity: 3, unitCents: 333.33 },
    ])
  ).toEqual({ cents: 3500, unpriced: 1 });
});

test('validateTrip rejects the whole trip on one bad row', () => {
  const result = validateTrip([
    { entryId: 'a', quantity: '2', price: '25.00', soldByWeight: false },
    { entryId: 'b', quantity: '1', price: 'abc', soldByWeight: false },
    { entryId: 'c', quantity: '1,5', price: '90', soldByWeight: true },
  ]);
  // parseMoney strips leading currency text, so "abc" reads as blank.
  expect(result).toEqual({ ok: false, errors: { b: 'Enter the price paid' } });
});

test('validateTrip passes the values through', () => {
  const result = validateTrip([
    { entryId: 'a', quantity: '2', price: '25.00', soldByWeight: false },
    { entryId: 'c', quantity: '1,5', price: '90', soldByWeight: true },
  ]);
  expect(result.ok && result.values.map((v) => [v.entryId, v.quantity, v.total_price_cents, v.is_special])).toEqual([
    ['a', 2, 2500, 0],
    ['c', 1.5, 9000, 0],
  ]);
});

test('prefillPrice', () => {
  expect(prefillPrice(1250, 2)).toBe('25.00');
  expect(prefillPrice(333.33, 3)).toBe('10.00');
  expect(prefillPrice(null, 2)).toBe('');
});
