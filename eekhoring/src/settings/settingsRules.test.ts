import { validateSettings } from './settingsRules';

const ok = { currency: ' $ ', bufferPct: '15', usageMonths: '6' };

test('validateSettings trims and parses', () =>
  expect(validateSettings(ok)).toEqual({ ok: true, values: { currency: '$', bufferPct: 15, usageMonths: 6 } }));
test.each(['', '   ', 'ABCD'])('validateSettings rejects currency %j', (currency) =>
  expect(validateSettings({ ...ok, currency })).toMatchObject({ ok: false, errors: { currency: expect.any(String) } }));
test.each(['-1', '101', '1.5', 'x', ''])('validateSettings rejects buffer %j', (bufferPct) =>
  expect(validateSettings({ ...ok, bufferPct })).toMatchObject({ ok: false, errors: { bufferPct: 'Buffer must be a whole number from 0 to 100' } }));
test.each(['0', '13', '1.5', 'x', ''])('validateSettings rejects window %j', (usageMonths) =>
  expect(validateSettings({ ...ok, usageMonths })).toMatchObject({ ok: false, errors: { usageMonths: expect.any(String) } }));
