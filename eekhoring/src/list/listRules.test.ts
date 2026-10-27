import { estimateTotal, planList, prefillPrice, validateTrip, type Entry, type TripRow } from './listRules';

const entry = (id: string, item_id: string | null, quantity: number, added_manually = 0, ticked = 0, group_id: string | null = null): Entry => ({
  id,
  item_id,
  group_id,
  quantity,
  added_manually,
  ticked,
});
const item = (item_id: string, quantity: number) => ({ item_id, group_id: null, quantity });
const group = (group_id: string, quantity: number) => ({ item_id: null, group_id, quantity });

test('planList on an empty list inserts every suggestion', () => {
  expect(planList([item('rice', 2), item('oil', 1)], [])).toEqual({
    insert: [item('rice', 2), item('oil', 1)],
    update: [],
    remove: [],
  });
});

test('planList keeps ticked and manual entries', () => {
  const entries = [entry('e1', 'rice', 2, 0, 1), entry('e2', 'soap', 1, 1, 0)];
  expect(planList([item('rice', 3)], entries)).toEqual({ insert: [], update: [], remove: [] });
});

test('planList updates and removes unticked suggested entries', () => {
  const entries = [entry('e1', 'rice', 2), entry('e2', 'oil', 1)];
  expect(planList([item('rice', 4)], entries)).toEqual({
    insert: [],
    update: [{ id: 'e1', quantity: 4 }],
    remove: ['e2'],
  });
});

test('planList replaces a newly grouped item with its group', () => {
  const entries = [entry('e1', 'rice', 2), entry('e2', 'juice', 1, 0, 1)];
  expect(planList([group('g1', 6)], entries)).toEqual({ insert: [group('g1', 6)], update: [], remove: ['e1'] });
});

test('planList updates an unticked group entry and keeps a hand-added one', () => {
  const entries = [entry('e1', null, 4, 0, 0, 'g1'), entry('e2', null, 1, 1, 0, 'g2')];
  expect(planList([group('g1', 6)], entries)).toEqual({ insert: [], update: [{ id: 'e1', quantity: 6 }], remove: [] });
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

const row = (key: string, itemId: string | null, quantity: string, price: string, soldByWeight = false): TripRow => ({
  key,
  entryId: key.split(':')[0],
  itemId,
  quantity,
  price,
  soldByWeight,
});

test('validateTrip rejects the whole trip on one bad row', () => {
  const result = validateTrip([row('a', 'rice', '2', '25.00'), row('b', 'oil', '1', 'abc'), row('c', 'mince', '1,5', '90', true)]);
  // parseMoney strips leading currency text, so "abc" reads as blank.
  expect(result).toEqual({ ok: false, errors: { b: 'Enter the price paid' } });
});

test('validateTrip passes the values through', () => {
  const result = validateTrip([row('a', 'rice', '2', '25.00'), row('c', 'mince', '1,5', '90', true)]);
  expect(result.ok && result.values.map((v) => [v.entryId, v.item_id, v.quantity, v.total_price_cents, v.is_special])).toEqual([
    ['a', 'rice', 2, 2500, 0],
    ['c', 'mince', 1.5, 9000, 0],
  ]);
});

test('validateTrip keys errors by line and keeps the item per line', () => {
  const good = validateTrip([row('g:0', 'monster', '6', '132'), row('g:1', 'redbull', '4', '100')]);
  expect(good.ok && good.values.map((v) => [v.entryId, v.item_id])).toEqual([
    ['g', 'monster'],
    ['g', 'redbull'],
  ]);
  expect(validateTrip([row('g:0', 'monster', '6', '132'), row('g:1', 'redbull', '4', '0')])).toEqual({
    ok: false,
    errors: { 'g:1': 'Price must be more than 0' },
  });
  expect(validateTrip([row('g:0', null, '6', '132')])).toEqual({ ok: false, errors: { 'g:0': 'Pick which one you bought' } });
});

test('prefillPrice', () => {
  expect(prefillPrice(1250, 2)).toBe('25.00');
  expect(prefillPrice(333.33, 3)).toBe('10.00');
  expect(prefillPrice(null, 2)).toBe('');
});
