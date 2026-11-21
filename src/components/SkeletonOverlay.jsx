import { useEffect, useRef, useState } from 'react';
import { getLandmarker, detectProminent, POSE_CONNECTIONS } from '../poseDetector.js';
import { MIN_LANDMARK_VISIBILITY } from '../thresholds.js';
import { theme } from './ui.jsx';

const MAX_OVERLAY_FPS = 15;

/**
 * Video player with a canvas on top that draws the rider's skeleton in sync
 * with playback. Pose detection runs live, in the browser, on the frame that
 * is currently shown, using the same "largest person" rule as the analysis.
 */
export default function SkeletonOverlay({ src, videoRef, aspectHint = 16 / 9 }) {
  const canvasRef = useRef(null);
  const [show, setShow] = useState(true);
  const [status, setStatus] = useState('loading'); // loading | ready | failed
  const [aspect, setAspect] = useState(aspectHint);
  const showRef = useRef(show);
  showRef.current = show;

  useEffect(() => {
    let cancelled = false;
    let landmarker = null;
    let rafId = 0;
    let vfcId = 0;
    let lastRun = 0;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return undefined;

    const resize = () => {
      const r = video.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      draw(true);
    };

    function clear() {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    function draw(force = false) {
      if (!landmarker || !video.videoWidth) return;
      const now = performance.now();
      if (!force && now - lastRun < 1000 / MAX_OVERLAY_FPS) return;
      lastRun = now;
      clear();
      if (!showRef.current) return;
      let picked = null;
      try {
        picked = detectProminent(landmarker, video, video.videoWidth / video.videoHeight);
      } catch {
        return;
      }
      if (picked) drawRider(canvas.getContext('2d'), picked.landmarks, canvas.width, canvas.height);
      drawAnimalKeypoints(canvas.getContext('2d'));
    }

    function loop() {
      if (cancelled) return;
      draw();
      if (video.requestVideoFrameCallback) vfcId = video.requestVideoFrameCallback(loop);
      else rafId = requestAnimationFrame(loop);
    }

    const onPlay = () => loop();
    const onSeeked = () => draw(true);
    const onMeta = () => {
      if (video.videoWidth) setAspect(video.videoWidth / video.videoHeight);
      resize();
    };

    getLandmarker()
      .then((lm) => {
        if (cancelled) return;
        landmarker = lm;
        setStatus('ready');
        resize();
        if (!video.paused) loop();
      })
      .catch(() => !cancelled && setStatus('failed'));

    const ro = new ResizeObserver(resize);
    ro.observe(video);
    video.addEventListener('play', onPlay);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('loadeddata', onMeta);
    if (video.readyState >= 2) onMeta();

    return () => {
      cancelled = true;
      ro.disconnect();
      cancelAnimationFrame(rafId);
      if (vfcId && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(vfcId);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('loadeddata', onMeta);
    };
  }, [src, videoRef]);

  // Redraw (or clear) right away when the toggle changes.
  useEffect(() => {
    const v = videoRef.current;
    if (v) v.dispatchEvent(new Event('seeked'));
  }, [show, videoRef]);

  return (
    <div>
      <div style={{ position: 'relative', width: '100%', maxWidth: `calc(65vh * ${aspect})`, margin: '0 auto' }}>
        <video
          ref={videoRef}
          src={src}
          controls
          playsInline
          preload="auto"
          style={{ display: 'block', width: '100%', height: 'auto', borderRadius: 10, background: '#000' }}
        />
        {/* pointer-events: none so the video controls underneath stay usable */}
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none', borderRadius: 10 }}
        />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 16, minHeight: 44, cursor: 'pointer' }}>
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} style={{ width: 22, height: 22, accentColor: theme.gold }} />
          Show rider skeleton
        </label>
        <span style={{ color: theme.muted, fontSize: 14 }}>
          {status === 'loading' && 'Loading motion tracker…'}
          {status === 'ready' && 'Skeleton is tracked live on the rider. Animal tracking: coming in phase 2.'}
          {status === 'failed' && "Skeleton overlay isn't available in this browser."}
        </span>
      </div>
    </div>
  );
}

function drawRider(ctx, landmarks, w, h) {
  const visible = (p) => p && (p.visibility ?? 1) >= MIN_LANDMARK_VISIBILITY;
  ctx.lineWidth = Math.max(2, w / 220);
  ctx.strokeStyle = theme.gold;
  ctx.lineCap = 'round';
  for (const { start, end } of POSE_CONNECTIONS) {
    const a = landmarks[start];
    const b = landmarks[end];
    if (!visible(a) || !visible(b)) continue;
    ctx.beginPath();
    ctx.moveTo(a.x * w, a.y * h);
    ctx.lineTo(b.x * w, b.y * h);
    ctx.stroke();
  }
  ctx.fillStyle = '#FFFFFF';
  const r = Math.max(3, w / 180);
  landmarks.forEach((p, i) => {
    if (i < 11 && i !== 0) return; // skip small face points; keep the nose
    if (!visible(p)) return;
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, r, 0, Math.PI * 2);
    ctx.fill();
  });
}

// ---------------------------------------------------------------------------
// PHASE 2 STUB — animal keypoints.
// MediaPipe Pose only tracks people. Drawing bull/horse keypoints needs a
// separate animal pose model (e.g. a quadruped keypoint model) that we have
// not added yet. Until then this intentionally draws NOTHING. Do not fake it.
// ---------------------------------------------------------------------------
// eslint-disable-next-line no-unused-vars
function drawAnimalKeypoints(ctx) {
  // Intentionally empty until an animal pose model is integrated.
}
