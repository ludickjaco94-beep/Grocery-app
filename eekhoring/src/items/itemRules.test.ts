import { emptyItemForm, findDuplicate, itemToForm, parseDecimal, validateItem } from './itemRules';

test('parseDecimal accepts comma', () => expect(parseDecimal('1,5')).toBe(1.5));
test('parseDecimal accepts dot and spaces', () => expect(parseDecimal(' 2.25 ')).toBe(2.25));
test('parseDecimal blank is null', () => expect(parseDecimal('  ')).toBeNull());
test('parseDecimal rejects junk', () => expect(parseDecimal('1.2.3')).toBe('invalid'));

test('name required and trimmed', () => {
  expect(validateItem({ ...emptyItemForm, name: '  ' })).toMatchObject({ ok: false, errors: { name: expect.any(String) } });
  expect(validateItem({ ...emptyItemForm, name: ' Milk ' })).toMatchObject({ ok: true, values: { name: 'Milk' } });
});

test('blank estimate is null', () =>
  expect(validateItem({ ...emptyItemForm, name: 'Rice' })).toMatchObject({
    ok: true,
    values: { est_monthly_usage: null, pack_size: null },
  }));

test('weight forces kg and clears pack size', () =>
  expect(validateItem({ ...emptyItemForm, name: 'Mince', unit: 'pack', soldByWeight: true, packSize: '6' })).toMatchObject({
    ok: true,
    values: { unit: 'kg', sold_by_weight: 1, pack_size: null },
  }));

test('cap must cover buffer', () =>
  expect(validateItem({ ...emptyItemForm, name: 'Oil', bufferPct: '20', maxMonthsCover: '1.1' })).toMatchObject({
    ok: false,
    errors: { maxMonthsCover: expect.any(String) },
  }));

test('negative estimate rejected', () =>
  expect(validateItem({ ...emptyItemForm, name: 'Oil', estMonthlyUsage: '-1' })).toMatchObject({
    ok: false,
    errors: { estMonthlyUsage: expect.any(String) },
  }));

test('buffer must be whole 0-100', () =>
  expect(validateItem({ ...emptyItemForm, name: 'Oil', bufferPct: '150' })).toMatchObject({
    ok: false,
    errors: { bufferPct: expect.any(String) },
  }));

test('blank category saves as Other', () =>
  expect(validateItem({ ...emptyItemForm, name: 'Salt' })).toMatchObject({ ok: true, values: { category: 'Other' } }));

test('findDuplicate is case-insensitive and trims', () => {
  const others = [{ id: 'a', name: 'Milk' }];
  expect(findDuplicate(' milk ', others)?.id).toBe('a');
  expect(findDuplicate('milk', others, 'a')).toBeUndefined();
});

test('itemToForm round-trips through validateItem', () => {
  const values = {
    name: 'Mince', unit: 'kg', category: 'Meat', buy_mode: 'monthly', sold_by_weight: 1,
    buffer_pct: 15, max_months_cover: 2.5, est_monthly_usage: 4.2, pack_size: null,
  } as const;
  expect(validateItem(itemToForm(values))).toEqual({ ok: true, values });
});

test('parseDecimal accepts leading and trailing separators', () => {
  expect(parseDecimal('.5')).toBe(0.5);
  expect(parseDecimal(',5')).toBe(0.5);
  expect(parseDecimal('2,')).toBe(2);
  expect(parseDecimal('.')).toBe('invalid');
  expect(parseDecimal('1.2.3')).toBe('invalid');
});

test('cap error has no float noise', () => {
  const r = validateItem({ ...emptyItemForm, name: 'Rice', bufferPct: '14', maxMonthsCover: '1' });
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.errors.maxMonthsCover).toBe('Cap must be at least 1.14 months to cover the 14% buffer');
});

test('sold by measure keeps L', () => {
  expect(validateItem({ ...emptyItemForm, name: 'Oil', unit: 'L', soldByWeight: true, packSize: '2' })).toMatchObject({
    ok: true,
    values: { unit: 'L', sold_by_weight: 1, pack_size: null },
  });
});

test('sold by measure turns each into kg', () => {
  expect(validateItem({ ...emptyItemForm, name: 'Mince', unit: 'each', soldByWeight: true })).toMatchObject({
    ok: true,
    values: { unit: 'kg', sold_by_weight: 1 },
  });
});
