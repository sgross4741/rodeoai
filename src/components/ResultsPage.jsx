import { useRef, useState } from 'react';
import { theme, page, Card, Button, SectionTitle, ScoreBar, scoreColor, scoreWord, Divider } from './ui.jsx';
import SkeletonOverlay from './SkeletonOverlay.jsx';
import { downloadRecord } from '../analysis.js';

const CONFIDENCE_STYLE = {
  high: { color: theme.gold, text: 'High confidence' },
  medium: { color: theme.amber, text: 'Medium confidence' },
  low: { color: theme.red, text: 'Low confidence' },
};

export default function ResultsPage({ record, video, onAnother }) {
  const videoRef = useRef(null);
  const a = record.analysis;
  const [coach, setCoach] = useState({ videoId: '', usefulness: null, coachRiderScore: '', notes: '' });

  const seekTo = (t) => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = t;
    v.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const coachRating = {
    videoId: coach.videoId.trim() || null,
    usefulness: coach.usefulness,
    coachRiderScore: coach.coachRiderScore === '' ? null : Number(coach.coachRiderScore),
    notes: coach.notes.trim() || null,
  };

  return (
    <main style={page}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: theme.serif, color: theme.gold, fontSize: 32, margin: 0 }}>Your results</h1>
          <div style={{ color: theme.muted, fontSize: 16, marginTop: 4 }}>
            {record.eventLabel} · {record.duration.toFixed(1)}s video
          </div>
        </div>
        <ConfidenceBadge level={a.confidence} />
      </div>
      <Divider />

      <Card style={{ marginBottom: 16, padding: 12 }}>
        <SkeletonOverlay src={video.url} videoRef={videoRef} />
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16, marginBottom: 16 }}>
        <BigScore title="Rider score" score={a.riderScore} subtitle={`Tracked in ${record.framesWithRider} of ${record.framesSampled} frames`} />
        {record.isRoughstock &&
          (a.animalScore !== null ? (
            <BigScore title="Animal score" score={a.animalScore} subtitle="Estimated from rider motion only" warn />
          ) : (
            <Card>
              <div style={{ color: theme.muted, fontSize: 16 }}>Animal score</div>
              <div style={{ fontSize: 28, fontWeight: 700, margin: '10px 0' }}>Coming soon</div>
              <div style={{ color: theme.muted, fontSize: 15, lineHeight: 1.5 }}>
                We can't track the animal yet, and this video didn't give us enough to estimate it from the rider's motion.
              </div>
            </Card>
          ))}
      </div>

      <Card style={{ marginBottom: 16 }}>
        <SectionTitle>Score breakdown</SectionTitle>
        <ScoreBar label="Balance" score={a.breakdown.balance} />
        <ScoreBar label="Timing" score={a.breakdown.timing} />
        <ScoreBar label="Form" score={a.breakdown.form} />
        <ScoreBar label="Control" score={a.breakdown.control} />
      </Card>

      {a.keyMoments.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <SectionTitle>Key moments</SectionTitle>
          <p style={{ color: theme.muted, marginTop: 0, fontSize: 15 }}>Tap a moment to jump to it in the video.</p>
          <Timeline moments={a.keyMoments} duration={record.duration} onSeek={seekTo} />
          <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
            {a.keyMoments.map((m, i) => (
              <button key={i} type="button" onClick={() => seekTo(m.timestamp)} style={momentBtn}>
                <span style={{ color: theme.gold, fontWeight: 700, minWidth: 54 }}>{m.timestamp.toFixed(1)}s</span>
                <span>
                  <span style={{ fontWeight: 700, display: 'block' }}>{m.label}</span>
                  {m.note && <span style={{ color: theme.muted, fontSize: 15 }}>{m.note}</span>}
                </span>
              </button>
            ))}
          </div>
        </Card>
      )}

      <Card style={{ marginBottom: 16 }}>
        <SectionTitle>Technique tips</SectionTitle>
        <ul style={{ margin: 0, paddingLeft: 22, fontSize: 17, lineHeight: 1.6 }}>
          {a.techniqueFeedback.map((t, i) => <li key={i} style={{ marginBottom: 8 }}>{t}</li>)}
        </ul>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <SectionTitle>Strength &amp; conditioning plan</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {a.conditioningPlan.map((c, i) => (
            <div key={i} style={{ background: theme.bg, borderRadius: 10, padding: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 17 }}>{c.exercise}</div>
              <div style={{ color: theme.gold, margin: '4px 0', fontSize: 16 }}>{c.sets_reps}</div>
              <div style={{ color: theme.muted, fontSize: 15, lineHeight: 1.5 }}>Helps with: {c.targets}</div>
            </div>
          ))}
        </div>
        <p style={{ color: theme.muted, fontSize: 14, marginBottom: 0, lineHeight: 1.5 }}>
          Check with a coach or parent before starting new exercises. Stop if anything hurts.
        </p>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <SectionTitle>What this analysis can't see</SectionTitle>
        <ul style={{ margin: 0, paddingLeft: 22, fontSize: 16, lineHeight: 1.6, color: theme.text }}>
          {a.limitations.map((l, i) => <li key={i}>{l}</li>)}
          <li>{record.trackedPerson}</li>
          {(record.notes || []).map((n, i) => <li key={`n${i}`} style={{ color: theme.muted }}>{n}</li>)}
        </ul>
        <Numbers record={record} />
      </Card>

      <CoachPanel coach={coach} setCoach={setCoach} />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginTop: 24 }}>
        <Button variant="secondary" onClick={() => downloadRecord(record, coachRating)}>Download results</Button>
        <Button onClick={onAnother}>Analyze another video</Button>
      </div>
    </main>
  );
}

function ConfidenceBadge({ level }) {
  const s = CONFIDENCE_STYLE[level] || CONFIDENCE_STYLE.low;
  return (
    <span style={{ border: `2px solid ${s.color}`, color: s.color, borderRadius: 999, padding: '8px 16px', fontWeight: 700, fontSize: 16 }}>
      {s.text}
    </span>
  );
}

function BigScore({ title, score, subtitle, warn }) {
  const color = scoreColor(score);
  return (
    <Card>
      <div style={{ color: theme.muted, fontSize: 16 }}>{title}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '6px 0 10px' }}>
        <span style={{ fontSize: 56, fontWeight: 800, color, lineHeight: 1 }}>{score}</span>
        <span style={{ color: theme.muted, fontSize: 18 }}>/ 100 · {scoreWord(score)}</span>
      </div>
      <div style={{ background: theme.track, height: 12, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', background: color }} />
      </div>
      <div style={{ marginTop: 10, fontSize: 15, color: warn ? theme.amber : theme.muted, fontWeight: warn ? 700 : 400 }}>
        {warn && '⚠ '}
        {subtitle}
      </div>
    </Card>
  );
}

function Timeline({ moments, duration, onSeek }) {
  return (
    <div style={{ position: 'relative', height: 44, margin: '8px 12px 0' }}>
      <div style={{ position: 'absolute', top: 20, left: 0, right: 0, height: 4, background: theme.track, borderRadius: 4 }} />
      {moments.map((m, i) => (
        <button
          key={i}
          type="button"
          aria-label={`Jump to ${m.label} at ${m.timestamp.toFixed(1)} seconds`}
          title={`${m.timestamp.toFixed(1)}s · ${m.label}`}
          onClick={() => onSeek(m.timestamp)}
          style={{
            position: 'absolute', left: `${(m.timestamp / duration) * 100}%`, top: 0, transform: 'translateX(-50%)',
            width: 44, height: 44, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0,
          }}
        >
          <span style={{ display: 'block', width: 20, height: 20, margin: '0 auto', borderRadius: '50%', background: theme.gold, border: `3px solid ${theme.card}` }} />
        </button>
      ))}
      <div style={{ position: 'absolute', top: 30, left: 0, color: theme.muted, fontSize: 12 }}>0s</div>
      <div style={{ position: 'absolute', top: 30, right: 0, color: theme.muted, fontSize: 12 }}>{duration.toFixed(1)}s</div>
    </div>
  );
}

function Numbers({ record }) {
  const m = record.metrics;
  const rows = [
    ['Rider found in', `${record.framesWithRider} of ${record.framesSampled} frames (${Math.round(record.detectionRate * 100)}%)`],
    ['Stability rating', m.stabilityRating],
    ['Average body lean', `${m.avgSpineAngleDeg}° from straight up`],
    ['How much the lean changed', `${m.spineAngleVariance} (variance, deg²)`],
    ['Hip tipping side to side', `${m.hipInstability}`],
    ['Shoulder drop', `${m.shoulderAsymmetry}`],
    ['Drift off center', `${m.cogDrift}`],
  ];
  return (
    <details style={{ marginTop: 16 }}>
      <summary style={{ cursor: 'pointer', color: theme.gold, fontSize: 16, minHeight: 44, display: 'flex', alignItems: 'center' }}>
        Show the numbers behind the score
      </summary>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15, marginTop: 8 }}>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} style={{ borderTop: '1px solid #333' }}>
              <td style={{ padding: '8px 8px 8px 0', color: theme.muted }}>{k}</td>
              <td style={{ padding: 8, textAlign: 'right' }}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ color: theme.muted, fontSize: 13, lineHeight: 1.5 }}>
        Hip, shoulder and drift values are measured as a share of the rider's torso length.
      </p>
    </details>
  );
}

function CoachPanel({ coach, setCoach }) {
  const set = (k) => (e) => setCoach((c) => ({ ...c, [k]: e.target.value }));
  const field = { width: '100%', minHeight: 48, fontSize: 17, padding: '10px 12px', borderRadius: 10, background: theme.bg, color: theme.text, border: '1px solid #555' };
  return (
    <Card style={{ marginTop: 8 }}>
      <SectionTitle>Coach rating (optional)</SectionTitle>
      <p style={{ color: theme.muted, marginTop: 0, fontSize: 15, lineHeight: 1.5 }}>
        For testing: rate how useful this feedback was. It's saved only in the downloaded file.
      </p>

      <label style={{ display: 'block', fontSize: 16, margin: '12px 0 6px' }} htmlFor="videoId">Video ID (like V01; please don't use names)</label>
      <input id="videoId" value={coach.videoId} onChange={set('videoId')} maxLength={20} style={field} />

      <div style={{ fontSize: 16, margin: '16px 0 6px' }} id="useful-label">How useful was this feedback?</div>
      <div role="radiogroup" aria-labelledby="useful-label" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[1, 2, 3, 4, 5].map((n) => {
          const on = coach.usefulness === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setCoach((c) => ({ ...c, usefulness: on ? null : n }))}
              style={{
                width: 52, height: 52, borderRadius: 10, fontSize: 20, fontWeight: 700, cursor: 'pointer',
                background: on ? theme.gold : 'transparent', color: on ? '#1a1a1a' : theme.text, border: `2px solid ${on ? theme.gold : '#555'}`,
              }}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div style={{ color: theme.muted, fontSize: 14, marginTop: 4 }}>1 = not useful, 5 = very useful</div>

      <label style={{ display: 'block', fontSize: 16, margin: '16px 0 6px' }} htmlFor="coachScore">Coach's own rider score, 0–100 (optional)</label>
      <input
        id="coachScore" type="number" inputMode="numeric" min={0} max={100} value={coach.coachRiderScore}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '' || (Number(v) >= 0 && Number(v) <= 100)) setCoach((c) => ({ ...c, coachRiderScore: v }));
        }}
        style={{ ...field, maxWidth: 160 }}
      />

      <label style={{ display: 'block', fontSize: 16, margin: '16px 0 6px' }} htmlFor="coachNotes">Notes</label>
      <textarea id="coachNotes" value={coach.notes} onChange={set('notes')} rows={4} maxLength={2000} style={{ ...field, resize: 'vertical' }} />
    </Card>
  );
}

const momentBtn = {
  display: 'flex', gap: 12, alignItems: 'flex-start', textAlign: 'left', width: '100%', minHeight: 52,
  background: theme.bg, color: theme.text, border: '1px solid #333', borderRadius: 10, padding: '12px 14px', fontSize: 16, cursor: 'pointer',
};
