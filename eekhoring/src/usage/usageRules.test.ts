import { explainSuggestion, isRunningLow, monthlyUsage, suggestBuy, usageFor } from './usageRules';

const day = (n: number, hour = 12) => new Date(Date.UTC(2026, 0, 1 + n, hour)).toISOString();
const at = (n: number, quantity: number, hour = 12) => ({ date: day(n, hour), quantity });
const now = new Date(day(65));

test('monthlyUsage needs two stock-takes', () => {
  expect(monthlyUsage([at(0, 10)], [], now, 3)).toBeNull();
  expect(monthlyUsage([at(0, 10, 9), at(0, 8, 18)], [], now, 3)).toBeNull();
});

test('monthlyUsage uses start + bought − end', () => {
  expect(monthlyUsage([at(30, 4), at(0, 10)], [at(10, 6)], now, 3)).toBeCloseTo(12);
});

test('monthlyUsage normalises to 30 days', () => {
  expect(monthlyUsage([at(0, 10), at(15, 4)], [], now, 3)).toBeCloseTo(12);
});

test('monthlyUsage counts a purchase dated exactly at the end stock-take as bought before it', () => {
  expect(monthlyUsage([at(0, 10), at(30, 4)], [at(30, 6)], now, 3)).toBeCloseTo(12);
});

test('monthlyUsage ignores a purchase dated exactly at the start stock-take', () => {
  expect(monthlyUsage([at(0, 10), at(30, 4)], [at(0, 6)], now, 3)).toBeCloseTo(6);
});

test('same-day stock-takes: the later wins', () => {
  expect(monthlyUsage([at(0, 10, 9), at(0, 8, 18), at(30, 2, 18)], [], now, 3)).toBeCloseTo(6);
});

test('monthlyUsage skips an interval with negative usage', () => {
  expect(monthlyUsage([at(0, 10), at(30, 4), at(60, 9)], [], now, 3)).toBeCloseTo(6);
  expect(monthlyUsage([at(0, 4), at(30, 9)], [], now, 3)).toBeNull();
});

test('monthlyUsage averages the window by days', () => {
  // The old 50-a-month interval ends before the 3-month window and is left out.
  const takes = [at(-200, 100), at(-170, 50), at(0, 18), at(30, 12), at(90, 6)];
  expect(monthlyUsage(takes, [], new Date(day(95)), 3)).toBeCloseTo(4);
});

test('monthlyUsage falls back to the latest interval when none end in the window', () => {
  expect(monthlyUsage([at(0, 20), at(30, 10), at(60, 4)], [], new Date(day(300)), 3)).toBeCloseTo(6);
});

test('usageFor falls back to the estimate, then needs data', () => {
  expect(usageFor(3, 5)).toEqual({ perMonth: 3, source: 'measured' });
  expect(usageFor(null, 5)).toEqual({ perMonth: 5, source: 'estimate' });
  expect(usageFor(null, null)).toEqual({ perMonth: null, source: 'none' });
});

const base = { perMonth: 4, buffer_pct: 10, max_months_cover: 2, stock: 1, pack_size: null, sold_by_weight: 0, unit: 'each' as const };

test('suggestBuy rounds the buffered need up to a whole unit', () => {
  expect(suggestBuy(base)).toBe(4);
});

test('suggestBuy never goes below zero above the cap', () => {
  expect(suggestBuy({ ...base, stock: 9 })).toBe(0);
});

test('suggestBuy caps at cap − stock', () => {
  expect(suggestBuy({ ...base, buffer_pct: 100, max_months_cover: 1.5, stock: 0 })).toBe(6);
});

test('suggestBuy rounds weight items to 0.1 kg and ignores pack size', () => {
  expect(suggestBuy({ ...base, perMonth: 3.33, stock: 0, sold_by_weight: 1, unit: 'kg', pack_size: 6 })).toBe(3.7);
});

test('suggestBuy rounds up to a multiple of the pack size', () => {
  expect(suggestBuy({ ...base, perMonth: 7, buffer_pct: 0, stock: 0, pack_size: 6 })).toBe(12);
});

test('suggestBuy rounds L without a pack size to 0.1', () => {
  expect(suggestBuy({ ...base, perMonth: 1.23, buffer_pct: 0, stock: 0, unit: 'L' })).toBe(1.3);
});

test('suggestBuy ignores float noise', () => {
  expect(suggestBuy({ ...base, perMonth: 4.000000001, buffer_pct: 0, stock: 0 })).toBe(4);
});

test('suggestBuy counts never-counted stock as 0', () => {
  expect(suggestBuy({ ...base, stock: null })).toBe(5);
});

test('isRunningLow', () => {
  expect(isRunningLow(1, 4)).toBe(true);
  expect(isRunningLow(2, 4)).toBe(false);
  expect(isRunningLow(0, 4)).toBe(true);
  expect(isRunningLow(null, 4)).toBe(false);
  expect(isRunningLow(1, null)).toBe(false);
});

test('explainSuggestion', () => {
  const item = { buffer_pct: 10, unit: 'each', stock: 1 };
  expect(explainSuggestion({ perMonth: 4.2, source: 'measured' }, item, 4)).toBe(
    'Used about 4.2/month, buffer 10%, you have 1 left, buy 4'
  );
  expect(explainSuggestion({ perMonth: 4, source: 'estimate' }, item, 4)).toBe(
    'Estimated 4/month, buffer 10%, you have 1 left, buy 4'
  );
  expect(explainSuggestion({ perMonth: null, source: 'none' }, item, null)).toBe(
    'Needs data: do two stock-takes or set a monthly estimate'
  );
  expect(explainSuggestion({ perMonth: 3.33, source: 'measured' }, { buffer_pct: 10, unit: 'kg', stock: 0.5 }, 3.7)).toBe(
    'Used about 3.3 kg/month, buffer 10%, you have 0.5 kg left, buy 3.7 kg'
  );
  expect(explainSuggestion({ perMonth: 2, source: 'measured' }, { ...item, stock: null }, null)).toBe(
    'Used about 2/month, buffer 10%, not counted yet'
  );
});
