import { tripCost, tripDay, tripIdFor, validateCosts } from './tripRules';

const at = (h: number) => new Date(2026, 9, 27, h).toISOString();

test('tripDay groups two shops on the same day', () => {
  expect(tripDay(at(9))).toBe(tripDay(at(15)));
  expect(tripDay(at(9))).not.toBe(tripDay(new Date(2026, 9, 28, 9).toISOString()));
});

test('tripIdFor', () => {
  const trips = new Map([[tripDay(at(9)), 't1']]);
  expect(tripIdFor({ date: at(10), is_city: 0 }, trips)).toBeNull();
  expect(tripIdFor({ date: at(16), is_city: 1 }, trips)).toBe('t1');
  expect(tripIdFor({ date: new Date(2026, 9, 28, 9).toISOString(), is_city: 1 }, trips)).toBe('new');
});

test('validateCosts', () => {
  expect(validateCosts({ fuel: '', toll: '', parking: '', other: '', note: ' ' })).toEqual({
    ok: true,
    values: { fuel_cents: 0, toll_cents: 0, parking_cents: 0, other_cents: 0, notes: null },
  });
  expect(validateCosts({ fuel: '480,50', toll: 'R80', parking: '', other: '120', note: 'lunch' })).toEqual({
    ok: true,
    values: { fuel_cents: 48050, toll_cents: 8000, parking_cents: 0, other_cents: 12000, notes: 'lunch' },
  });
  expect(validateCosts({ fuel: '12.555', toll: '', parking: '', other: '', note: '' })).toEqual({
    ok: false,
    errors: { fuel: 'Enter an amount like 480 or 480,50' },
  });
});

test('tripCost sums the four costs', () => {
  expect(tripCost({ fuel_cents: 40000, toll_cents: 8000, parking_cents: 1000, other_cents: 500 })).toBe(49500);
});
