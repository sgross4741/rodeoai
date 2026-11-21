# RodeoAI

A web app for rodeo athletes and coaches. You pick an event and add a practice or competition video. The app gives you:

1. A rider score, and for roughstock events an estimated animal score
2. Technique feedback in plain language
3. A strength-and-conditioning plan

**Privacy:** the video never leaves your device. Pose detection (MediaPipe) runs in the browser. The only thing sent to the server is a ~2 KB summary of numbers (body angles and balance measurements). The app has no accounts, stores no videos, and collects no personal data.

---

## Setup

You need **Node.js 20 or newer**.

```bash
npm install
```

`npm install` also copies MediaPipe's WASM runtime into `public/mediapipe-wasm/`, so the app serves it itself rather than loading it from a CDN.

Add your DeepSeek key:

```bash
cp .env.example .env
```

Open `.env` and paste your key after `DEEPSEEK_API_KEY=`. `.env` is listed in `.gitignore`. Only the server reads the key. It is never included in the browser bundle or shown in the app.

## Run

Development:

```bash
npm run dev
```

Production build (the API proxy runs inside the preview server too):

```bash
npm run build
```

```bash
npm start
```

Open the URL Vite prints. To test on a phone, use the "Network" URL with the phone on the same Wi-Fi. Phones only allow camera-roll uploads and some video features over **https** or localhost, so for wider testing, deploy behind HTTPS.

The first analysis downloads the pose model (~9 MB) from Google's MediaPipe model storage (`storage.googleapis.com`). After that the browser caches it.

## Tests

```bash
npm test
```

This runs the unit tests for the metrics, schema validation and proxy logic. DeepSeek is mocked, so no key is needed.

```bash
npm run test:live
```

This optional test calls the real DeepSeek API, and only runs if `DEEPSEEK_API_KEY` is set. It checks that a steady ride and a wobbly ride get different scores, and that the steady ride scores higher.

---

## How it works

| File | What it does |
|---|---|
| `src/thresholds.js` | **Every tunable number in one place**: sampling rate, detection cutoff, stability thresholds, score colors |
| `src/metrics.js` | Pure metric math: frame times, person selection, spine angle, hip/shoulder measures, drift, stability rating |
| `src/poseDetector.js` | Loads MediaPipe Pose Landmarker; seeks through the video, draws frames to a canvas and detects poses |
| `src/analysis.js` | Runs one analysis (frames → metrics → proxy → validation) and builds the downloadable JSON |
| `src/schema.js` | Validates DeepSeek's JSON (used by both server and browser) |
| `src/events.js` | The 8 events, which ones are roughstock, and what matters in each |
| `server/deepseekProxy.js` | Server-side DeepSeek call: input checks, prompt, one retry, honesty guards |
| `vite.config.js` | Mounts the proxy at `POST /api/analyze` in the dev and preview servers |
| `src/components/*` | UI: `Landing`, `UploadPage`, `ResultsPage`, `SkeletonOverlay`, shared `ui` pieces |

### Metrics

The app samples about 2 frames per second of video: about 16 frames for an 8-second ride, at least 8 and at most 24, and never closer than 0.25 s apart. Videos shorter than 2 s are rejected. If a frame contains several people, the app tracks the one with the **largest bounding box** and says so on the results page.

Every measurement is corrected for the video's aspect ratio. The hip, shoulder and drift values are divided by the rider's torso length, so they don't change just because the camera is closer or farther away.

| Metric | Meaning |
|---|---|
| `avgSpineAngleDeg` | Average absolute lean of mid-hip → mid-shoulder from vertical (degrees) |
| `spineAngleVariance` | Variance of the signed lean (deg²): how much the rider was whipped around |
| `hipInstability` | Variance of (left hip Y − right hip Y) / torso |
| `shoulderAsymmetry` | Mean \|left shoulder Y − right shoulder Y\| / torso |
| `cogDrift` | Mean \|hip-midpoint X − its starting X\| / torso |
| `stabilityRating` | High / Medium / Low, from points against the thresholds in `src/thresholds.js` |
| `detectionRate` | Frames where shoulders **and** hips were clearly visible ÷ frames sampled |

### Honesty rules built in

- **If `detectionRate` is below 50%, there is no score.** The user sees "We couldn't track the rider well enough in this video" with filming tips. Both the browser and the server enforce this.
- **The animal is never tracked.** For bull riding, saddle bronc and bareback, the animal score is labelled **"Estimated from rider motion only."** The prompt tells DeepSeek it cannot see the animal and should return `null` if it has no basis for an estimate. In that case the card shows "Coming soon." For timed events the animal score is always `null`, whatever the model returns.
- **Confidence is capped.** If the rider was tracked in fewer than 75% of frames, the server downgrades "high" confidence to "medium".
- **Answers are validated.** DeepSeek's answer is checked against the schema. If it is malformed, the app retries once, then shows a friendly error. Key moments outside the video's length are dropped, and the results page says so.
- **No canned scores.** No score, placeholder or key is hardcoded anywhere.

---

## Validation mode: running the 90-day test

Every results page has a **Coach rating** panel and a **Download results** button. The download is one JSON file per analysis, containing:

- the event, duration, `detectionRate`, frame counts and all metrics
- per-frame values
- the full AI analysis (scores, breakdown, key moments, feedback, plan, confidence, limitations)
- a timestamp
- the coach rating: video ID, 1–5 usefulness, optional coach score, notes

Failed runs, where the rider wasn't tracked well enough, can be downloaded too. They count toward your failure rate.

### Suggested protocol (20–30 videos)

1. **Pick the videos.** Aim for a mix of events, camera angles and rider skill. Include a few you expect to fail, such as far away, dark or with a crowd in front. Give each video an ID (`V01`, `V02`, …) in a private spreadsheet. **Don't put riders' names in the app.**
2. **Get a coach's judgment first.** Before showing them any AI output, have a coach watch each video and write down a rider score (0–100), the 2–3 most important technique issues, and when the key moments happen.
3. **Run each video through RodeoAI.** Enter the video ID and save the JSON. Run 3–5 of the videos **twice** to check consistency: same video, same metrics, similar scores.
4. **Have the coach rate the feedback.** Show them the results page, then fill in the 1–5 usefulness rating, the coach's own score and notes, and download.
5. **Compare.** Load the JSON files into a spreadsheet (one row per file) and look at:
   - **Tracking:** the share of videos with `detectionRate` ≥ 0.5. What do the failures have in common?
   - **Score agreement:** plot the AI `riderScore` against `coachRating.coachRiderScore`. Compute the correlation and the average absolute difference. As a rough rule, a correlation below 0.5 or an average gap above 15 points means the scores aren't yet useful.
   - **Metric sanity:** do riders the coach called unbalanced have a higher `spineAngleVariance`, `hipInstability` and `cogDrift`? If not, the metrics, not just the AI, need work.
   - **Feedback usefulness:** the average usefulness rating, and whether the coach's top issues appear in `techniqueFeedback`.
   - **Key moments:** do `keyMoments` timestamps fall within about 1 s of the moments the coach marked?
   - **Repeatability:** how much did scores differ between the runs of the same video?
   - **Confidence calibration:** are "low confidence" results actually the ones the coach disagreed with most?
6. **Tune.** Adjust the stability thresholds in `src/thresholds.js` so High, Medium and Low match the coach's view. These thresholds are **starting guesses and have not been calibrated**. Re-run and repeat.

To combine the files into a CSV, run the following from the folder with the JSON files:

```bash
node -e "const fs=require('fs');const r=fs.readdirSync('.').filter(f=>f.endsWith('.json')).map(f=>JSON.parse(fs.readFileSync(f)));console.log('videoId,event,detectionRate,stability,aiRider,coachRider,useful,confidence');for(const j of r)console.log([j.coachRating?.videoId,j.event,j.detectionRate,j.metrics?.stabilityRating,j.analysis?.riderScore,j.coachRating?.coachRiderScore,j.coachRating?.usefulness,j.analysis?.confidence].join(','))" > results.csv
```

---

## Known limitations

- **Single camera, 2D only.** Lean toward or away from the camera can't be measured, and the same ride filmed from the side and from the front gives different numbers.
- **No animal tracking.** MediaPipe Pose only detects people. Any animal score is an *estimate inferred from how the rider moved*. The skeleton overlay has a clearly marked phase-2 stub for animal keypoints, and it draws nothing.
- **One person tracked.** The app tracks the largest person in each frame. If a bullfighter, pickup man or someone in the crowd appears bigger than the rider, the wrong person can be tracked, and the results page says when more than one person was seen. Tracking does not follow the same person between frames.
- **Coarse sampling.** About 2 frames per second can miss fast events such as a quick hand touch, the exact mark-out or spur timing. "Timing" scores come from these coarse samples.
- **Camera motion.** Panning to follow the rider raises `cogDrift`, because drift is measured in screen coordinates.
- **The AI only sees numbers.** DeepSeek gets the metrics, not the video. It can't judge hand position, spurring, rope work or the animal's moves, and it is told to say so.
- **Thresholds are uncalibrated.** The stability cut-offs are starting guesses until the validation test tunes them.
- **The pose model is general-purpose.** It was not trained on rodeo footage. Dust, chaps, hats, motion blur and riders partly hidden behind the animal reduce accuracy.
- **Browser codecs vary.** MP4 (H.264) works everywhere. MOV usually works. Most browsers can't play AVI, and the app says so.
