// Browser-only: loads MediaPipe Pose Landmarker and samples frames from a video.
// The video stays in the browser. Frames are drawn to a local canvas and
// analyzed on-device; nothing here makes a network request except downloading
// the pose model file itself.

import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { computeSampleTimes, pickMostProminent } from './metrics.js';
import { MAX_POSES_PER_FRAME, SEEK_TIMEOUT_MS, ANALYSIS_FRAME_MAX_WIDTH } from './thresholds.js';

// WASM runtime is copied from node_modules into public/ on `npm install`
// (scripts/copy-mediapipe-wasm.js), so it is served by this app.
export const WASM_BASE_PATH = '/mediapipe-wasm';
// Official MediaPipe model (checked Nov 2026). "full" is more accurate than "lite"
// and still runs in-browser; switch to pose_landmarker_lite if phones are too slow.
export const POSE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task';

export const POSE_CONNECTIONS = PoseLandmarker.POSE_CONNECTIONS;

let landmarkerPromise = null;

/** Load the pose model once and reuse it. Tries GPU first, then CPU. */
export function getLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE_PATH);
      const opts = (delegate) => ({
        baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate },
        runningMode: 'IMAGE',
        numPoses: MAX_POSES_PER_FRAME,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
      });
      try {
        return await PoseLandmarker.createFromOptions(fileset, opts('GPU'));
      } catch {
        return await PoseLandmarker.createFromOptions(fileset, opts('CPU'));
      }
    })().catch((e) => {
      landmarkerPromise = null; // allow a retry later
      throw e;
    });
  }
  return landmarkerPromise;
}

/** Detect poses in an image/canvas/video and return the most prominent person. */
export function detectProminent(landmarker, source, aspect) {
  const result = landmarker.detect(source);
  const picked = pickMostProminent(result?.landmarks || [], aspect);
  return picked; // { landmarks, peopleCount } | null
}

function loadVideo(url) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.crossOrigin = 'anonymous';
    v.onloadeddata = () => resolve(v);
    v.onerror = () => reject(new Error("This browser can't read this video file. Try an MP4 (H.264) file."));
    v.src = url;
    v.load();
  });
}

function seek(video, t) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      video.removeEventListener('seeked', onSeeked);
      reject(new Error('seek timeout'));
    }, SEEK_TIMEOUT_MS);
    function onSeeked() {
      clearTimeout(timer);
      video.removeEventListener('seeked', onSeeked);
      resolve();
    }
    video.addEventListener('seeked', onSeeked);
    video.currentTime = t;
  });
}

/**
 * Sample frames from the video and run pose detection on each one.
 * onProgress({ stage: 'reading' | 'detecting', done, total })
 * Returns { frames: [{ t, landmarks|null, peopleCount }], aspect, sampleTimes }.
 */
export async function sampleAndDetect(videoUrl, duration, onProgress = () => {}) {
  const sampleTimes = computeSampleTimes(duration);
  if (sampleTimes.length === 0) throw new Error('Video too short');

  onProgress({ stage: 'reading', done: 0, total: sampleTimes.length });
  const [video, landmarker] = await Promise.all([loadVideo(videoUrl), getLandmarker()]);
  const vw = video.videoWidth || 1;
  const vh = video.videoHeight || 1;
  const aspect = vw / vh;
  const scale = Math.min(1, ANALYSIS_FRAME_MAX_WIDTH / vw);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vw * scale);
  canvas.height = Math.round(vh * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const frames = [];
  for (let i = 0; i < sampleTimes.length; i++) {
    const t = sampleTimes[i];
    onProgress({ stage: 'detecting', done: i, total: sampleTimes.length });
    try {
      await seek(video, t);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const picked = detectProminent(landmarker, canvas, aspect);
      frames.push({
        t,
        landmarks: picked ? picked.landmarks.map(({ x, y, z, visibility }) => ({ x, y, z, visibility })) : null,
        peopleCount: picked ? picked.peopleCount : 0,
      });
    } catch {
      frames.push({ t, landmarks: null, peopleCount: 0, seekFailed: true });
    }
  }
  onProgress({ stage: 'detecting', done: sampleTimes.length, total: sampleTimes.length });
  video.removeAttribute('src');
  video.load();
  return { frames, aspect, sampleTimes };
}

/** Feature check for the upload page: can this browser probably play AVI? */
export function browserCanPlayAvi() {
  const v = document.createElement('video');
  return ['video/x-msvideo', 'video/avi', 'video/msvideo'].some((t) => v.canPlayType(t) !== '');
}
