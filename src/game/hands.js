// hands.js — webcam hand-tracking controls via TensorFlow.js hand-pose-detection.
// Open palm steers (absolute position, like mouse-flight), pinch fires the lasers
// (and the torpedo once the finale gate opens), a closed fist boosts. TF.js, the
// wrapper, and both model weights are vendored under vendor/tfjs; nothing loads
// until the pilot toggles the mode on, so the base game stays light.
const VENDOR = './vendor/tfjs';
const GAIN = 1.7;         // palm travel inside the camera frame is small — amplify
const SMOOTH = 0.45;      // EMA factor per detection frame
const LOST_FRAMES = 8;    // detection frames without a hand before controls release

// landmark polylines for the PiP skeleton (MediaPipe 21-keypoint layout)
const FINGERS = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [5, 9, 10, 11, 12], [9, 13, 14, 15, 16], [13, 17, 18, 19, 20], [0, 17]];

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = v => Math.max(-1, Math.min(1, v));

export function createHandControls() {
  const pipEl = document.getElementById('handpip');
  const video = document.getElementById('hand-video');
  const overlay = document.getElementById('hand-overlay');
  const statusEl = document.getElementById('hand-status');
  const octx = overlay.getContext('2d');

  let enabled = false, busy = false, detector = null, stream = null;
  let haveHand = false, lost = 0;
  let sx = 0, sy = 0;                        // smoothed steering target (-1..1)
  let pinch = false, fist = false, torpEdge = false;
  let mock = null, mockPinchPrev = false;    // debug-harness injection
  const listeners = [];

  const status = t => { statusEl.textContent = t; };
  const emit = s => { for (const cb of listeners) cb(s); };

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('failed to load ' + src));
      document.head.appendChild(s);
    });
  }

  async function ensureDetector() {
    if (detector) return;
    if (!window.handPoseDetection) {
      await loadScript(`${VENDOR}/tf.min.js`);
      await loadScript(`${VENDOR}/hand-pose-detection.min.js`);
    }
    detector = await window.handPoseDetection.createDetector(
      window.handPoseDetection.SupportedModels.MediaPipeHands, {
        runtime: 'tfjs',
        modelType: 'lite',
        maxHands: 1,
        detectorModelUrl: `${VENDOR}/models/detector/model.json`,
        landmarkModelUrl: `${VENDOR}/models/landmark/model.json`,
      });
  }

  async function enable() {
    if (enabled || busy) return;
    busy = true; emit('loading');
    pipEl.classList.remove('hidden');
    status('LOADING MODEL…');
    try {
      await ensureDetector();
      status('STARTING CAMERA…');
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();
      enabled = true; emit('on');
      status('SHOW YOUR HAND');
      loop();
    } catch (e) {
      console.warn('hand controls:', e);
      disable();
      pipEl.classList.remove('hidden');
      status(e && e.name === 'NotAllowedError' ? 'CAMERA BLOCKED' : 'HAND TRACKING FAILED');
      setTimeout(() => { if (!enabled) pipEl.classList.add('hidden'); }, 2500);
    } finally { busy = false; }
  }

  function disable() {
    enabled = false; haveHand = false; lost = 0;
    pinch = fist = false; torpEdge = false;
    if (stream) { for (const t of stream.getTracks()) t.stop(); stream = null; }
    video.srcObject = null;
    pipEl.classList.add('hidden');
    emit('off');
  }

  async function loop() {
    if (!enabled) return;
    if (video.readyState >= 2) {
      let hands = [];
      try { hands = await detector.estimateHands(video); }
      catch (e) { console.warn('estimateHands:', e); }
      process(hands);
      draw(hands);
    }
    requestAnimationFrame(loop);
  }

  function process(hands) {
    if (!hands.length) {
      if (++lost >= LOST_FRAMES && haveHand) {
        haveHand = false; pinch = fist = false;
        status('SHOW YOUR HAND');
      }
      return;
    }
    lost = 0;
    const kp = hands[0].keypoints;
    const vw = video.videoWidth || 320, vh = video.videoHeight || 240;
    const ref = dist(kp[0], kp[9]) || 1;   // wrist → middle knuckle = hand scale
    // palm centre = wrist + the four knuckles
    let px = 0, py = 0;
    for (const i of [0, 5, 9, 13, 17]) { px += kp[i].x; py += kp[i].y; }
    px /= 5; py /= 5;
    const tx = clamp(-(px / vw * 2 - 1) * GAIN);   // mirrored: hand right → ship right
    const ty = clamp((py / vh * 2 - 1) * GAIN);    // same sign convention as mouse ny
    if (!haveHand) { sx = tx; sy = ty; }           // snap on acquire, smooth after
    else { sx += (tx - sx) * SMOOTH; sy += (ty - sy) * SMOOTH; }
    haveHand = true;

    // fist: middle/ring/pinky tips curled back toward the wrist (index excluded so
    // a pinch — index meeting thumb — can't read as a fist)
    const curl = (dist(kp[12], kp[0]) + dist(kp[16], kp[0]) + dist(kp[20], kp[0])) / (3 * ref);
    fist = curl < (fist ? 1.45 : 1.3);
    // pinch: thumb tip meets index tip, with hysteresis so it doesn't chatter
    const p = !fist && dist(kp[4], kp[8]) < ref * (pinch ? 0.55 : 0.4);
    if (p && !pinch) torpEdge = true;
    pinch = p;
    status(fist ? 'BOOST' : pinch ? 'FIRING' : 'TRACKING');
  }

  function draw(hands) {
    const w = overlay.width, h = overlay.height;
    octx.save();
    octx.translate(w, 0); octx.scale(-1, 1);   // mirror video + landmarks together
    octx.drawImage(video, 0, 0, w, h);
    if (hands.length) {
      const kp = hands[0].keypoints;
      const vw = video.videoWidth || 320, vh = video.videoHeight || 240;
      const X = p => p.x / vw * w, Y = p => p.y / vh * h;
      octx.lineWidth = 1.5; octx.strokeStyle = 'rgba(255,232,31,0.9)';
      for (const f of FINGERS) {
        octx.beginPath();
        f.forEach((i, j) => j ? octx.lineTo(X(kp[i]), Y(kp[i])) : octx.moveTo(X(kp[i]), Y(kp[i])));
        octx.stroke();
      }
      if (pinch) {
        octx.strokeStyle = '#ff3b30'; octx.lineWidth = 3;
        octx.beginPath(); octx.moveTo(X(kp[4]), Y(kp[4])); octx.lineTo(X(kp[8]), Y(kp[8])); octx.stroke();
      }
      if (fist) {
        octx.strokeStyle = '#5cd0ff'; octx.lineWidth = 2;
        octx.beginPath(); octx.arc(X(kp[9]), Y(kp[9]), 16, 0, Math.PI * 2); octx.stroke();
      }
    }
    octx.restore();
  }

  // read by input.update() once per game frame; torpEdge is consumed on read
  function getSource() {
    if (mock) {
      const edge = !!mock.pinch && !mockPinchPrev;
      mockPinchPrev = !!mock.pinch;
      return { active: true, nx: mock.nx || 0, ny: mock.ny || 0,
        pinch: !!mock.pinch && !mock.fist, fist: !!mock.fist, torpEdge: edge };
    }
    if (!enabled || !haveHand) return null;
    const edge = torpEdge; torpEdge = false;
    return { active: true, nx: sx, ny: sy, pinch, fist, torpEdge: edge };
  }

  return {
    enable, disable,
    toggle: () => (enabled || busy ? disable() : enable()),
    getSource,
    setMock: m => { mock = m || null; if (!m) mockPinchPrev = false; },
    onState: cb => listeners.push(cb),
    get enabled() { return enabled; },
    _ensureDetector: ensureDetector,   // exposed for the ?debug harness
  };
}
