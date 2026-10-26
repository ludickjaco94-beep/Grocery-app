// Tokens from DESIGN_SPEC sections 2, 3 and 4. The only place colours live.
export type Palette = {
  bg: string;
  surface: string;
  card: string;
  surfaceRaised: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  primary: string;
  onPrimary: string;
  accent: string;
  positive: string;
  warning: string;
  danger: string;
  cardShadow: string | undefined;
};

export const palettes: { dark: Palette; light: Palette } = {
  dark: {
    bg: '#0F1A14',
    surface: '#17251D',
    card: 'rgba(23,37,29,0.92)', // "glass without the blur": surface at 92%
    surfaceRaised: '#1F3126',
    border: '#2C4535',
    textPrimary: '#EEF5EF',
    textSecondary: '#A9BDB0',
    primary: '#7FB685',
    onPrimary: '#0F1A14',
    accent: '#F59E2B',
    positive: '#7FB685',
    warning: '#F2C14E',
    danger: '#E5655E',
    cardShadow: undefined,
  },
  light: {
    bg: '#F4F7F3',
    surface: '#FFFFFF',
    card: '#FFFFFF', // solid, so the Android shadow can't show through
    surfaceRaised: '#EAF1EB',
    border: '#D3E0D5',
    textPrimary: '#12201A',
    textSecondary: '#4A5F52',
    primary: '#2F7A47',
    onPrimary: '#FFFFFF',
    accent: '#D9780B',
    positive: '#2F7A47',
    warning: '#B27A00',
    danger: '#C0392B',
    cardShadow: '0 2px 8px rgba(0,0,0,0.06)',
  },
};

export const radius = { card: 20, button: 16, chip: 999, bar: 24 };
export const spacing = [4, 8, 12, 16, 24, 32];
export const font = { title: 24, section: 18, body: 16, small: 14, caption: 12 };

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(fg: string, bg: string): number {
  const [a, b] = [luminance(fg), luminance(bg)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
