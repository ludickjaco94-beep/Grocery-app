import { checkGroupUnits, cheapestOption, groupName, groupNeed, hintCount, holds, validateGroup, type GroupForm } from './groupRules';

const can = { sold_by_weight: 0, unit: 'each', contents_qty: 0.5, contents_unit: 'L' };

test('holds', () => {
  expect(holds({ sold_by_weight: 1, unit: 'kg', contents_qty: null, contents_unit: null }, 'kg')).toBe(1);
  expect(holds(can, 'L')).toBe(0.5);
  expect(holds(can, 'kg')).toBeNull();
  expect(holds({ ...can, contents_qty: null, contents_unit: null }, 'L')).toBeNull();
  expect(holds({ sold_by_weight: 0, unit: 'pack', contents_qty: 18, contents_unit: 'roll' }, 'roll')).toBe(18);
});

test('groupName', () => expect(groupName({ kind: 'Drinks', person: 'Jaco' })).toBe('Drinks · Jaco'));

test('checkGroupUnits refuses a unit that breaks a group', () => {
  const groups = [{ kind: 'Drinks', person: 'Jaco', base_unit: 'L' }];
  expect(checkGroupUnits({ ...can, contents_unit: 'kg' }, groups)).toBe('Remove it from Drinks · Jaco first');
  expect(checkGroupUnits(can, groups)).toBeNull();
});

const form: GroupForm = {
  kind: 'Drinks',
  person: 'Jaco',
  baseUnit: 'L',
  buyMode: 'monthly',
  bufferPct: '10',
  maxMonthsCover: '2',
  estMonthlyUsage: '',
};

test('validateGroup', () => {
  const others = [{ id: 'g1', kind: 'Drinks', person: 'Jaco' }];
  expect(validateGroup({ ...form, kind: 'drinks', person: 'jaco' }, others)).toEqual({
    ok: false,
    errors: { kind: 'You already have Drinks · Jaco' },
  });
  expect(validateGroup({ ...form, kind: 'drinks', person: 'jaco' }, others, 'g1').ok).toBe(true);
  expect(validateGroup({ ...form, kind: ' ' }, [])).toMatchObject({ ok: false, errors: { kind: 'Give the group a kind' } });
  expect(validateGroup({ ...form, baseUnit: '' }, [])).toMatchObject({ ok: false, errors: { baseUnit: 'Pick a unit' } });
  expect(validateGroup({ ...form, person: '' }, [])).toMatchObject({
    ok: true,
    values: { kind: 'Drinks', person: 'Home', base_unit: 'L', buy_mode: 'monthly', buffer_pct: 10, max_months_cover: 2, est_monthly_usage: null },
  });
});

const g = { est_monthly_usage: null, buffer_pct: 10, max_months_cover: 2, base_unit: 'L', buy_mode: 'monthly' };

test('groupNeed splits a shared item 50/50', () => {
  const r = groupNeed(
    [
      { perMonth: 10, stock: 0, holds: 0.5, share: 0.5 },
      { perMonth: 4, stock: 0, holds: 0.5, share: 1 },
    ],
    g
  );
  expect(r.perMonth).toBeCloseTo(4.5);
  expect(r.source).toBe('measured');
});

test('groupNeed falls back to the estimate, then needs data', () => {
  const none = [{ perMonth: null, stock: 2, holds: 1, share: 1 }];
  expect(groupNeed(none, { ...g, est_monthly_usage: 6 })).toMatchObject({ perMonth: 6, source: 'estimate', stock: 2 });
  expect(groupNeed(none, g)).toMatchObject({ perMonth: null, source: 'none', toBuy: null });
  expect(groupNeed(none, { ...g, est_monthly_usage: 6, buy_mode: 'as_needed' }).toBuy).toBeNull();
});

test('groupNeed counts never-counted stock as 0 and buys', () => {
  const r = groupNeed(
    [
      { perMonth: 9, stock: 2, holds: 0.5, share: 1 },
      { perMonth: null, stock: null, holds: 1, share: 1 },
    ],
    g
  );
  // need 4.5 L × 1.1 = 4.95, stock 1 L → 3.95, rounded up to 0.1.
  expect(r.stock).toBe(1);
  expect(r.toBuy).toBe(4);
});

test('cheapestOption compares per base unit', () => {
  const r = cheapestOption([
    { name: 'none', unitCents: null, holds: 1 },
    { name: 'juice', unitCents: 1800, holds: 1 },
    { name: 'concentrate', unitCents: 4500, holds: 5 },
  ]);
  expect(r.map((o) => [o.name, o.perBase])).toEqual([
    ['concentrate', 900],
    ['juice', 1800],
    ['none', null],
  ]);
});

test('hintCount', () => {
  expect(hintCount(6, 0.5)).toBe(12);
  expect(hintCount(6.1, 0.5)).toBe(13);
  expect(hintCount(30, 18)).toBe(2);
});
