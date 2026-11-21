import { useRef, useState } from 'react';
import { theme, page, Card, Button, SectionTitle } from './ui.jsx';
import { EVENTS } from '../events.js';
import { runAnalysis, downloadRecord } from '../analysis.js';
import { browserCanPlayAvi } from '../poseDetector.js';
import { MIN_VIDEO_SECONDS } from '../thresholds.js';

const STAGES = [
  { key: 'reading', label: 'Reading video' },
  { key: 'detecting', label: 'Detecting rider' },
  { key: 'scoring', label: 'Scoring' },
];

function fileKind(file) {
  const name = file.name.toLowerCase();
  if (file.type === 'video/mp4' || name.endsWith('.mp4') || name.endsWith('.m4v')) return 'mp4';
  if (file.type === 'video/quicktime' || name.endsWith('.mov')) return 'mov';
  if (/avi/.test(file.type) || name.endsWith('.avi')) return 'avi';
  return null;
}

export default function UploadPage({ eventId, setEventId, video, setVideo, onBack, onDone }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState('');
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState(null);
  const [stageDetail, setStageDetail] = useState('');
  const [error, setError] = useState('');
  const [lowDetection, setLowDetection] = useState(null);

  const busy = running;

  function acceptFile(file) {
    setFileError('');
    setError('');
    setLowDetection(null);
    if (!file) return;
    const kind = fileKind(file);
    if (!kind) {
      setFileError('Please choose an MP4 or MOV video file.');
      return;
    }
    if (kind === 'avi' && !browserCanPlayAvi()) {
      setFileError(
        "This browser can't play AVI videos. Please convert the video to MP4 first (most phones and free tools like HandBrake can do this), then try again."
      );
      return;
    }
    // Object URL = the video stays on this device. It is never uploaded.
    setVideo({ url: URL.createObjectURL(file), type: kind, duration: null });
  }

  function onMetadata(e) {
    const v = e.currentTarget;
    if (Number.isFinite(v.duration) && v.duration > 0) {
      setVideo((prev) => (prev ? { ...prev, duration: v.duration } : prev));
    } else {
      // Some phone videos report an unknown length until we seek to the end.
      const onChange = () => {
        if (Number.isFinite(v.duration)) {
          v.removeEventListener('durationchange', onChange);
          v.currentTime = 0;
          setVideo((prev) => (prev ? { ...prev, duration: v.duration } : prev));
        }
      };
      v.addEventListener('durationchange', onChange);
      v.currentTime = 1e7;
    }
  }

  function onPreviewError() {
    setFileError("This browser can't play this video. Try exporting it as MP4 (H.264), which works everywhere.");
    setVideo(null);
  }

  const tooShort = video?.duration != null && video.duration < MIN_VIDEO_SECONDS;
  const canAnalyze = Boolean(eventId && video?.duration && !tooShort && !fileError);

  async function analyze() {
    setRunning(true);
    setError('');
    setLowDetection(null);
    setStage('reading');
    try {
      const out = await runAnalysis({
        eventId,
        videoUrl: video.url,
        duration: video.duration,
        onStage: (k, detail) => {
          setStage(k);
          setStageDetail(detail);
        },
      });
      if (out.status === 'low_detection') setLowDetection(out.record);
      else onDone(out.record);
    } catch (e) {
      setError(e?.message || 'Something went wrong. Please try again.');
    } finally {
      setRunning(false);
      setStage(null);
    }
  }

  return (
    <main style={page}>
      <button type="button" onClick={onBack} disabled={busy} style={linkBtn}>
        ← Back
      </button>
      <h1 style={{ fontFamily: theme.serif, color: theme.gold, fontSize: 32, margin: '8px 0 20px' }}>Analyze a ride</h1>

      <Card style={{ marginBottom: 16 }}>
        <SectionTitle>1. Pick your event</SectionTitle>
        <label htmlFor="event" style={{ display: 'block', color: theme.muted, marginBottom: 8, fontSize: 16 }}>
          Event
        </label>
        <select
          id="event"
          value={eventId}
          disabled={busy}
          onChange={(e) => setEventId(e.target.value)}
          style={{
            width: '100%', minHeight: 56, fontSize: 18, padding: '0 14px', borderRadius: 10,
            background: theme.bg, color: theme.text, border: `2px solid ${eventId ? theme.gold : '#444'}`,
          }}
        >
          <option value="">Choose an event…</option>
          {EVENTS.map((e) => (
            <option key={e.id} value={e.id}>{e.label}</option>
          ))}
        </select>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <SectionTitle>2. Add your video</SectionTitle>
        <div
          role="button"
          tabIndex={0}
          aria-label="Choose a video file"
          onClick={() => !busy && inputRef.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !busy && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!busy) acceptFile(e.dataTransfer.files?.[0]);
          }}
          style={{
            border: `2px dashed ${dragging ? theme.gold : '#555'}`,
            background: dragging ? 'rgba(201,159,55,0.08)' : 'transparent',
            borderRadius: 12, padding: '28px 16px', textAlign: 'center', cursor: busy ? 'default' : 'pointer',
          }}
        >
          <div aria-hidden="true" style={{ fontSize: 36 }}>🎥</div>
          <div style={{ fontSize: 18, fontWeight: 600, margin: '8px 0 4px' }}>
            {video ? 'Tap to choose a different video' : 'Tap to choose a video, or drag it here'}
          </div>
          <div style={{ color: theme.muted, fontSize: 15 }}>MP4 or MOV. Your video stays on your device.</div>
          <input
            ref={inputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/x-msvideo,.mp4,.mov,.m4v,.avi"
            style={{ display: 'none' }}
            onChange={(e) => { acceptFile(e.target.files?.[0]); e.target.value = ''; }}
          />
        </div>
        {fileError && <Message tone="error">{fileError}</Message>}

        {video && (
          <div style={{ marginTop: 16 }}>
            <video
              key={video.url}
              src={video.url}
              controls
              playsInline
              preload="metadata"
              onLoadedMetadata={onMetadata}
              onError={onPreviewError}
              style={{ width: '100%', maxHeight: 420, borderRadius: 10, background: '#000' }}
            />
            {video.duration != null && (
              <div style={{ color: theme.muted, fontSize: 15, marginTop: 6 }}>Length: {video.duration.toFixed(1)} seconds</div>
            )}
            {tooShort && (
              <Message tone="error">
                This video is too short. Please use a video at least {MIN_VIDEO_SECONDS} seconds long.
              </Message>
            )}
          </div>
        )}
      </Card>

      {canAnalyze && !running && (
        <div style={{ textAlign: 'center', margin: '24px 0' }}>
          <Button onClick={analyze}>Analyze my ride</Button>
        </div>
      )}

      {running && <Progress stage={stage} detail={stageDetail} />}

      {error && (
        <Message tone="error">
          {error}
        </Message>
      )}

      {lowDetection && <LowDetection record={lowDetection} />}
    </main>
  );
}

function Progress({ stage, detail }) {
  const idx = STAGES.findIndex((s) => s.key === stage);
  return (
    <Card aria-live="polite" style={{ marginTop: 16 }}>
      <SectionTitle>Working on it…</SectionTitle>
      <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {STAGES.map((s, i) => {
          const state = i < idx ? 'done' : i === idx ? 'active' : 'waiting';
          return (
            <li key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', fontSize: 18 }}>
              <span
                aria-hidden="true"
                style={{
                  width: 30, height: 30, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: state === 'done' ? theme.gold : 'transparent',
                  border: `2px solid ${state === 'waiting' ? '#555' : theme.gold}`,
                  color: state === 'done' ? '#1a1a1a' : theme.gold, fontWeight: 700, fontSize: 15, flexShrink: 0,
                }}
              >
                {state === 'done' ? '✓' : i + 1}
              </span>
              <span style={{ color: state === 'waiting' ? theme.muted : theme.text, fontWeight: state === 'active' ? 700 : 400 }}>
                {s.label}
                {state === 'active' && <span style={{ color: theme.muted, fontWeight: 400, fontSize: 15 }}> — {detail}</span>}
                <span style={{ position: 'absolute', left: -9999 }}>{state === 'done' ? ' (done)' : state === 'active' ? ' (in progress)' : ''}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function LowDetection({ record }) {
  return (
    <Card style={{ marginTop: 16, borderColor: theme.amber }}>
      <SectionTitle style={{ color: theme.amber }}>We couldn't track the rider well enough in this video</SectionTitle>
      <p style={{ fontSize: 17, lineHeight: 1.5, marginTop: 0 }}>
        We found the rider in only {record.framesWithRider} of {record.framesSampled} frames we checked (
        {Math.round(record.detectionRate * 100)}%). That isn't enough to give you an honest score, so we stopped here instead of
        guessing.
      </p>
      <p style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>Tips for a better video:</p>
      <ul style={{ fontSize: 17, lineHeight: 1.6, paddingLeft: 22, marginTop: 0 }}>
        <li><b>Camera angle:</b> film from the side or straight on, at about the height of the rider's chest. Hold the phone sideways.</li>
        <li><b>Distance:</b> stand close enough that the rider fills about half the screen, but keep their whole body in view.</li>
        <li><b>Lighting:</b> film in daylight or good arena lights. Avoid filming straight into the sun.</li>
        <li><b>Steady:</b> keep the camera as still as you can, and try not to have people walking in front of it.</li>
      </ul>
      <Button variant="secondary" onClick={() => downloadRecord(record, null)} style={{ marginTop: 8 }}>
        Download this result (for testing)
      </Button>
    </Card>
  );
}

export function Message({ tone, children }) {
  const color = tone === 'error' ? theme.red : theme.amber;
  return (
    <div role="alert" style={{ marginTop: 12, padding: '12px 14px', borderRadius: 10, border: `1px solid ${color}`, color: theme.text, background: 'rgba(217,83,79,0.10)', fontSize: 16, lineHeight: 1.5 }}>
      {children}
    </div>
  );
}

const linkBtn = {
  background: 'none', border: 'none', color: theme.gold, fontSize: 17, cursor: 'pointer', padding: '10px 0', minHeight: 44,
};
