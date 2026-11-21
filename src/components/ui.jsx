// Shared theme and small UI building blocks (inline styles only).
import { SCORE_STRONG_MIN, SCORE_AVERAGE_MIN } from '../thresholds.js';

export const theme = {
  bg: '#181B1A',
  card: '#232726',
  cardBorder: '#33302A',
  gold: '#C99F37',
  amber: '#E08A2E',
  red: '#D9534F',
  text: '#FFFFFF',
  muted: '#AAAAAA',
  track: '#343937',
  serif: 'Georgia, "Times New Roman", serif',
};

export function scoreColor(score) {
  if (score >= SCORE_STRONG_MIN) return theme.gold;
  if (score >= SCORE_AVERAGE_MIN) return theme.amber;
  return theme.red;
}
export function scoreWord(score) {
  if (score >= SCORE_STRONG_MIN) return 'Strong';
  if (score >= SCORE_AVERAGE_MIN) return 'Average';
  return 'Needs work';
}

export const page = {
  maxWidth: 900,
  margin: '0 auto',
  padding: '24px 16px 64px',
};

export function Card({ children, style, ...rest }) {
  return (
    <div
      style={{
        background: theme.card,
        border: `1px solid ${theme.cardBorder}`,
        borderRadius: 14,
        padding: 20,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

export function Button({ children, variant = 'primary', style, ...rest }) {
  const primary = variant === 'primary';
  return (
    <button
      type="button"
      style={{
        minHeight: 56,
        padding: '14px 28px',
        fontSize: 18,
        fontWeight: 700,
        borderRadius: 12,
        cursor: rest.disabled ? 'not-allowed' : 'pointer',
        border: primary ? 'none' : `2px solid ${theme.gold}`,
        background: primary ? theme.gold : 'transparent',
        color: primary ? '#1a1a1a' : theme.gold,
        opacity: rest.disabled ? 0.5 : 1,
        width: '100%',
        maxWidth: 360,
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

export function SectionTitle({ children, style }) {
  return (
    <h2 style={{ fontFamily: theme.serif, color: theme.gold, fontSize: 22, margin: '0 0 12px', ...style }}>{children}</h2>
  );
}

/** Horizontal score bar, colored by strength. */
export function ScoreBar({ label, score, height = 14 }) {
  const color = scoreColor(score);
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, marginBottom: 6 }}>
        <span>{label}</span>
        <span style={{ color, fontWeight: 700 }}>
          {score} <span style={{ color: theme.muted, fontWeight: 400, fontSize: 14 }}>· {scoreWord(score)}</span>
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score}
        style={{ background: theme.track, borderRadius: height, height, overflow: 'hidden' }}
      >
        <div style={{ width: `${Math.max(0, Math.min(100, score))}%`, background: color, height: '100%', borderRadius: height }} />
      </div>
    </div>
  );
}

/** Thin decorative divider with a small star, the one "western" flourish. */
export function Divider() {
  return (
    <div aria-hidden="true" style={{ display: 'flex', alignItems: 'center', gap: 10, color: theme.gold, margin: '8px 0 20px', opacity: 0.7 }}>
      <div style={{ flex: 1, height: 1, background: theme.gold, opacity: 0.4 }} />
      <span style={{ fontSize: 14 }}>★</span>
      <div style={{ flex: 1, height: 1, background: theme.gold, opacity: 0.4 }} />
    </div>
  );
}
