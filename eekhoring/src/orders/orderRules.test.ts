import { lineState, onWayBy, partPrice, refundCents, validateDelivery, withOnWay } from './orderRules';

const l = (quantity: number, delivered: number, cancelled_qty: number) => lineState({ quantity, delivered, cancelled_qty });

test('lineState on the way', () => expect(l(6, 0, 0)).toEqual({ open: 6, status: 'on the way' }));
test('lineState part delivered', () => expect(l(6, 4, 0)).toEqual({ open: 2, status: '4 of 6 delivered' }));
test('lineState part delivered then cancelled', () => expect(l(6, 4, 2)).toEqual({ open: 0, status: '4 delivered, rest refunded' }));
test('lineState all cancelled', () => expect(l(6, 0, 6)).toEqual({ open: 0, status: 'cancelled, refunded' }));
test('lineState delivered', () => expect(l(6, 6, 0)).toEqual({ open: 0, status: 'delivered' }));
test('lineState treats deleted deliveries as open again', () => expect(l(6, 0, 2).open).toBe(4));
test('lineState float noise', () => expect(l(1.5, 0.7 + 0.8, 0)).toEqual({ open: 0, status: 'delivered' }));

test('partPrice', () => {
  expect(partPrice(6000, 6, 4)).toBe(4000);
  expect(partPrice(1000, 3, 1)).toBe(333);
});

test('refundCents', () => expect(refundCents({ quantity: 6, total_price_cents: 6000, cancelled_qty: 2 })).toBe(2000));

describe('validateDelivery', () => {
  const order = new Date(2026, 9, 27, 9).toISOString();
  const later = new Date(2026, 9, 28, 8).toISOString();
  test('blank', () => expect(validateDelivery('', 2, false, later, order)).toEqual({ ok: false, error: 'Enter how many arrived' }));
  test('zero', () => expect(validateDelivery('0', 2, false, later, order)).toEqual({ ok: false, error: 'Enter how many arrived' }));
  test('more than open', () => expect(validateDelivery('3', 2, false, later, order)).toEqual({ ok: false, error: 'Only 2 still on the way' }));
  test('whole numbers', () => expect(validateDelivery('2.5', 3, false, later, order)).toEqual({ ok: false, error: 'Use whole numbers' }));
  test('by measure', () => expect(validateDelivery('2.5', 3, true, later, order)).toEqual({ ok: true, quantity: 2.5 }));
  test('comma', () => expect(validateDelivery('2,5', 3, true, later, order)).toEqual({ ok: true, quantity: 2.5 }));
  test('same day is fine', () => expect(validateDelivery('1', 3, false, new Date(2026, 9, 27, 7).toISOString(), order)).toEqual({ ok: true, quantity: 1 }));
  test('before the order', () =>
    expect(validateDelivery('1', 3, false, new Date(2026, 9, 26, 12).toISOString(), order)).toEqual({ ok: false, error: "It can't arrive before it was ordered" }));
});

test('withOnWay', () => {
  expect(withOnWay(null, 0)).toBeNull();
  expect(withOnWay(null, 4)).toBe(4);
  expect(withOnWay(3, 4)).toBe(7);
});

test('onWayBy rounds float noise', () => {
  expect(onWayBy([{ item_id: 'mince', on_way: 0.3 - 0.1 }]).get('mince')).toBe(0.2);
});
