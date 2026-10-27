import { applyAdjustment, buildStockTake, bumpCount, stepFor, usageWindowStart, withChanges, type CountRow } from './stockRules';

const row = (o: Partial<CountRow>): CountRow => ({ itemId: 'a', text: '', packs: false, kgPerPack: null, ...o });

test('blank rows are skipped, not zero', () => {
  const r = buildStockTake([row({ itemId: 'a', text: '' }), row({ itemId: 'b', text: '0' }), row({ itemId: 'c', text: '2,5' })]);
  expect(r).toEqual({
    ok: true,
    skipped: 1,
    entries: [
      { item_id: 'b', quantity: 0, entered_packs: null },
      { item_id: 'c', quantity: 2.5, entered_packs: null },
    ],
  });
});

test('negative and junk counts are errors per row', () => {
  const r = buildStockTake([row({ itemId: 'a', text: '-1' }), row({ itemId: 'b', text: 'x' })]);
  expect(r).toEqual({ ok: false, errors: { a: 'Count must be 0 or more', b: 'Count must be 0 or more' } });
});

test('packs convert to kg and keep the pack count', () => {
  const r = buildStockTake([row({ text: '3', packs: true, kgPerPack: 0.45 })]);
  expect(r).toEqual({ ok: true, skipped: 0, entries: [{ item_id: 'a', quantity: 1.35, entered_packs: 3 }] });
});

test('packs must be whole', () => {
  const r = buildStockTake([row({ text: '1.5', packs: true, kgPerPack: 0.5 })]);
  expect(r).toEqual({ ok: false, errors: { a: 'Packs must be a whole number' } });
});

test('packs mode without pack data is an error', () => {
  const r = buildStockTake([row({ text: '2', packs: true, kgPerPack: null })]);
  expect(r).toEqual({ ok: false, errors: { a: 'log pack counts on purchases to enable' } });
});

test('adjustment rounds to 3 decimals', () => {
  expect(applyAdjustment(0.1, 0.2)).toBe(0.3);
});

test('remove below zero is an error', () => {
  expect(applyAdjustment(2, -3)).toEqual({ error: 'You only have 2. You cannot remove 3.' });
  expect(applyAdjustment(2, -2)).toBe(0);
});

test('usageWindowStart goes back calendar months', () => {
  expect(usageWindowStart(new Date('2026-10-26T10:00:00.000Z'), 3)).toBe('2026-07-26T10:00:00.000Z');
});

test('withChanges is newest first with the change from the row before', () => {
  const h = (id: string, quantity: number) => ({ id, date: id, quantity, source: 'stocktake', entered_packs: null });
  expect(withChanges([h('1', 4), h('2', 6), h('3', 1)]).map((r) => [r.id, r.change])).toEqual([
    ['3', -5],
    ['2', 2],
    ['1', null],
  ]);
});

test('bumpCount starts a blank row from the last count', () => {
  expect(bumpCount('', 3, 1, 1)).toBe('4');
  expect(bumpCount('', 3, 1, -1)).toBe('2');
  expect(bumpCount('', null, 0.5, 1)).toBe('0.5');
  expect(bumpCount('2,5', 3, 0.5, 1)).toBe('3');
  expect(bumpCount('0', 3, 1, -1)).toBe('0');
  expect(bumpCount('0.1', null, 0.2, 1)).toBe('0.3');
});

test('stepFor steps kg and L by 0.5, everything else by 1', () => {
  expect(stepFor('kg')).toBe(0.5);
  expect(stepFor('L')).toBe(0.5);
  expect(stepFor('each')).toBe(1);
  expect(stepFor('pack')).toBe(1);
});
