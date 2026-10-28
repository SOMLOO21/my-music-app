// Apparence d'un smart link : fond, style de cartes, disposition, coins, police, couleur du texte.
// Stocké en JSON dans links.theme ; tout est validé ici avant d'être injecté dans le CSS.

export type Theme = {
  bg: 'solid' | 'gradient' | 'cover' | 'image';
  bg1: string;
  bg2: string;
  angle: number;
  bgImage: string;
  bgFilter: 'none' | 'blur' | 'glass' | 'dark' | 'bw';
  bgStrength: number; // 0–100
  card: 'outline' | 'solid' | 'glass' | 'shadow' | 'glow' | 'minimal';
  cardColor: string;
  layout: 'bento' | 'list';
  radius: 'square' | 'round' | 'pill';
  font: 'inter' | 'grotesk' | 'serif' | 'syne' | 'mono';
  text: 'auto' | 'light' | 'dark';
};

export const DEFAULT_THEME: Theme = {
  bg: 'solid', bg1: '#ffffff', bg2: '#e0e7ff', angle: 160, bgImage: '', bgFilter: 'blur', bgStrength: 60,
  card: 'outline', cardColor: '#ffffff', layout: 'bento', radius: 'round', font: 'inter', text: 'auto',
};

export const PRESETS: { key: string; name: string; theme: Partial<Theme>; accent: string }[] = [
  { key: 'clair', name: 'Clair', accent: '#111827', theme: {} },
  { key: 'nuit', name: 'Nuit', accent: '#6366f1', theme: { bg: 'solid', bg1: '#0b0b10', card: 'solid', cardColor: '#17171f' } },
  { key: 'verre', name: 'Verre', accent: '#ffffff', theme: { bg: 'cover', bgFilter: 'blur', bgStrength: 60, card: 'glass' } },
  { key: 'sunset', name: 'Sunset', accent: '#1f1147', theme: { bg: 'gradient', bg1: '#ff7a59', bg2: '#7c3aed', angle: 160, card: 'glass', font: 'syne' } },
  { key: 'ocean', name: 'Océan', accent: '#0c4a6e', theme: { bg: 'gradient', bg1: '#38bdf8', bg2: '#1e3a8a', angle: 180, card: 'glass', layout: 'list', radius: 'pill' } },
  { key: 'neon', name: 'Néon', accent: '#22d3ee', theme: { bg: 'solid', bg1: '#05050a', card: 'glow', cardColor: '#0b0b14', font: 'mono' } },
  { key: 'brutal', name: 'Brutal', accent: '#111111', theme: { bg: 'solid', bg1: '#fde047', card: 'shadow', cardColor: '#ffffff', radius: 'square', font: 'grotesk' } },
  { key: 'minimal', name: 'Minimal', accent: '#111111', theme: { bg: 'solid', bg1: '#f5f5f4', card: 'minimal', layout: 'list', font: 'serif' } },
];

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
const hex = (v: unknown, fallback: string) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fallback);

export function sanitizeTheme(input: Record<string, unknown>): Theme {
  const d = DEFAULT_THEME;
  const angle = Number(input.angle);
  const strength = Number(input.bgStrength);
  // URL https externe ou image importée (/media/…) ; rien qui puisse sortir de url("…")
  const img = typeof input.bgImage === 'string' && /^(https:\/\/[^\s"'()<>\\]+|\/l\/media\/[a-f0-9]{16,40})$/.test(input.bgImage) ? input.bgImage : '';
  return {
    // « Image » sans URL valide → couleur unie, sinon texte clair sur fond clair
    bg: ((b) => (b === 'image' && !img ? 'solid' : b))(pick(input.bg, ['solid', 'gradient', 'cover', 'image'] as const, d.bg)),
    bg1: hex(input.bg1, d.bg1),
    bg2: hex(input.bg2, d.bg2),
    angle: Number.isFinite(angle) ? Math.max(0, Math.min(360, Math.round(angle))) : d.angle,
    bgImage: img,
    bgFilter: pick(input.bgFilter, ['none', 'blur', 'glass', 'dark', 'bw'] as const, d.bgFilter),
    bgStrength: Number.isFinite(strength) ? Math.max(0, Math.min(100, Math.round(strength))) : d.bgStrength,
    card: pick(input.card, ['outline', 'solid', 'glass', 'shadow', 'glow', 'minimal'] as const, d.card),
    cardColor: hex(input.cardColor, d.cardColor),
    layout: pick(input.layout, ['bento', 'list'] as const, d.layout),
    radius: pick(input.radius, ['square', 'round', 'pill'] as const, d.radius),
    font: pick(input.font, ['inter', 'grotesk', 'serif', 'syne', 'mono'] as const, d.font),
    text: pick(input.text, ['auto', 'light', 'dark'] as const, d.text),
  };
}

export function parseTheme(json: string | null | undefined): Theme {
  try {
    return sanitizeTheme(JSON.parse(json || '{}'));
  } catch {
    return { ...DEFAULT_THEME };
  }
}

export function luminance(h: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Texte clair si le fond est sombre (ou une image), foncé sinon. */
export function isLightText(t: Theme) {
  if (t.text !== 'auto') return t.text === 'light';
  if (t.bg === 'cover' || t.bg === 'image') return true;
  const lum = t.bg === 'gradient' ? (luminance(t.bg1) + luminance(t.bg2)) / 2 : luminance(t.bg1);
  return lum < 0.4;
}

const FONTS: Record<Theme['font'], { family: string; css: string }> = {
  inter: { family: 'Inter:wght@400;500;600;700;800', css: 'Inter,system-ui,sans-serif' },
  grotesk: { family: 'Space+Grotesk:wght@400;500;600;700', css: "'Space Grotesk',system-ui,sans-serif" },
  serif: { family: 'DM+Serif+Display&family=Inter:wght@400;500;600', css: "'DM Serif Display',Georgia,serif" },
  syne: { family: 'Syne:wght@500;600;700;800', css: "Syne,system-ui,sans-serif" },
  mono: { family: 'JetBrains+Mono:wght@400;500;700', css: "'JetBrains Mono',ui-monospace,monospace" },
};

export const fontHref = (t: Theme) => `https://fonts.googleapis.com/css2?family=${FONTS[t.font].family}&display=swap`;

/** Retouche de la photo de fond : filtre CSS + voile, selon l'intensité (0–100). */
function photoLayer(t: Theme) {
  const k = t.bgStrength / 100;
  const px = (n: number) => `${Math.round(n)}px`;
  switch (t.bgFilter) {
    case 'blur':
      return { filter: `blur(${px(6 + k * 70)}) saturate(1.4)`, overlay: `rgba(0,0,0,${(0.12 + k * 0.28).toFixed(2)})`, inset: '-90px' };
    case 'glass':
      return { filter: `blur(${px(10 + k * 30)}) saturate(1.8)`, overlay: `rgba(255,255,255,${(0.05 + k * 0.25).toFixed(2)})`, inset: '-60px' };
    case 'dark':
      return { filter: 'none', overlay: `rgba(0,0,0,${(0.15 + k * 0.65).toFixed(2)})`, inset: '0px' };
    case 'bw':
      return { filter: `grayscale(1) contrast(${(1 + k * 0.3).toFixed(2)})`, overlay: `rgba(0,0,0,${(0.05 + k * 0.45).toFixed(2)})`, inset: '0px' };
    default:
      return { filter: 'none', overlay: 'transparent', inset: '0px' };
  }
}

/** Variables CSS + classes du <body> pour la page publique. */
export function themeVars(t: Theme, accent: string, artwork: string | null) {
  const light = isLightText(t);
  const ink = light ? '#ffffff' : '#0f172a';
  const radius = { square: '6px', round: '22px', pill: '30px' }[t.radius];
  const bg =
    t.bg === 'gradient' ? `linear-gradient(${t.angle}deg, ${t.bg1}, ${t.bg2})`
    : t.bg === 'image' || t.bg === 'cover' ? '#0b0b10'
    : t.bg1;
  const photo = t.bg === 'image' ? t.bgImage : t.bg === 'cover' ? (artwork || '').replace(/"/g, '') : '';
  const layer = photo ? photoLayer(t) : null;
  // Cartes pleines : le texte suit la couleur de la carte ; sinon il suit le fond de page
  const filled = t.card === 'solid' || t.card === 'shadow' || t.card === 'glow';
  const cardLight = filled ? luminance(t.cardColor) < 0.4 : light;
  const accentLight = luminance(accent) < 0.45;
  const vars = [
    `--page-bg:${bg}`,
    `--card-ink:${cardLight ? '#ffffff' : '#0f172a'}`,
    `--card-ink-soft:${cardLight ? 'rgba(255,255,255,.65)' : '#64748b'}`,
    `--card-chip:${cardLight ? 'rgba(255,255,255,.14)' : 'rgba(15,23,42,.06)'}`,
    `--accent-ink:${accentLight ? '#ffffff' : '#0f172a'}`,
    `--ink:${ink}`,
    `--ink-soft:${light ? 'rgba(255,255,255,.72)' : '#64748b'}`,
    `--chip:${light ? 'rgba(255,255,255,.16)' : 'rgba(15,23,42,.06)'}`,
    `--card-color:${t.cardColor}`,
    `--r:${radius}`,
    `--accent:${accent}`,
    `--font-head:${FONTS[t.font].css}`,
    `--font-body:${t.font === 'serif' ? 'Inter,system-ui,sans-serif' : FONTS[t.font].css}`,
    photo ? `--photo:url("${photo}")` : '',
    ...(layer ? [`--ph-filter:${layer.filter}`, `--ph-overlay:${layer.overlay}`, `--ph-inset:${layer.inset}`] : []),
  ].filter(Boolean);
  const classes = [`card-${t.card}`, `layout-${t.layout}`, light ? 'ink-light' : 'ink-dark', photo ? 'bg-photo' : ''].join(' ');
  return { style: vars.join(';'), classes };
}
