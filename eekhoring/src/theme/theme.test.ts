import { contrastRatio, palettes } from './theme';

test('contrastRatio matches WCAG', () => {
  expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  expect(contrastRatio('#A9BDB0', '#0F1A14')).toBeCloseTo(8.99, 1);
});

test.each(['dark', 'light'] as const)('contrast pairs pass 4.5 in %s', (mode) => {
  const p = palettes[mode];
  for (const bg of [p.bg, p.surface, p.surfaceRaised]) {
    expect(contrastRatio(p.textPrimary, bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.textSecondary, bg)).toBeGreaterThanOrEqual(4.5);
  }
  for (const bg of [p.bg, p.surface]) {
    expect(contrastRatio(p.primary, bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.danger, bg)).toBeGreaterThanOrEqual(4.5);
  }
  expect(contrastRatio(p.onPrimary, p.primary)).toBeGreaterThanOrEqual(4.5);
});

test('light cards are solid, dark cards are 92% and shadowless', () => {
  expect(palettes.light.card).toBe('#FFFFFF');
  expect(palettes.dark.card).toBe('rgba(23,37,29,0.92)');
  expect(palettes.dark.cardShadow).toBeUndefined();
});
