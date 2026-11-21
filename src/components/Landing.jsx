import { theme, page, Card, Button, Divider } from './ui.jsx';

const FEATURES = [
  { icon: '🎯', title: 'Real AI Scoring', text: 'Rider scores built from how your body actually moved in the video, not guesses.' },
  { icon: '🤠', title: 'Technique Analysis', text: 'Plain-language tips on balance, posture and control you can take to your next practice.' },
  { icon: '💪', title: 'Training Plans', text: 'Strength and conditioning exercises picked to fix the weak spots in your ride.' },
];

export default function Landing({ onStart }) {
  return (
    <main style={page}>
      <header style={{ textAlign: 'center', padding: '32px 0 8px' }}>
        <h1 style={{ fontFamily: theme.serif, color: theme.gold, fontSize: 'clamp(44px, 11vw, 68px)', margin: 0, letterSpacing: 1 }}>
          RodeoAI
        </h1>
        <p style={{ color: theme.muted, fontSize: 'clamp(17px, 4.2vw, 21px)', margin: '10px 0 0' }}>
          AI-Powered Video Analysis for Rodeo Athletes
        </p>
      </header>
      <Divider />

      <Card style={{ textAlign: 'center', padding: '32px 20px', marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 26 }}>See what your ride really looked like</h2>
        <p style={{ color: theme.muted, fontSize: 17, lineHeight: 1.5, margin: '0 auto 24px', maxWidth: 560 }}>
          Pick your event, add a practice or competition video, and get a score, technique tips, and a training plan.
          Your video stays on your device. It is never uploaded.
        </p>
        <Button onClick={onStart}>Get Started</Button>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16 }}>
        {FEATURES.map((f) => (
          <Card key={f.title}>
            <div aria-hidden="true" style={{ fontSize: 32, marginBottom: 8 }}>{f.icon}</div>
            <h3 style={{ color: theme.gold, margin: '0 0 8px', fontSize: 20 }}>{f.title}</h3>
            <p style={{ color: theme.muted, margin: 0, fontSize: 16, lineHeight: 1.5 }}>{f.text}</p>
          </Card>
        ))}
      </div>

      <p style={{ color: theme.muted, fontSize: 14, textAlign: 'center', marginTop: 32, lineHeight: 1.5 }}>
        No accounts. No video storage. RodeoAI is a practice tool and does not replace a coach or judge.
      </p>
    </main>
  );
}
