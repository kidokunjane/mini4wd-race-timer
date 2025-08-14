let selectedVideoURL = null;
let beforeInstallPromptEvent = null;

// DOM elements
const playerView = document.getElementById('player-view');
const videoInput = document.getElementById('videoInput');
const videoEl = document.getElementById('video');
const playPauseBtn = document.getElementById('playPauseBtn');
const seekBar = document.getElementById('seekBar');
const videoWrap = document.querySelector('.video-wrap');
const videoSeekContainer = document.querySelector('.video-seek');
const appHeader = document.querySelector('.app-header');
const mainEl = document.querySelector('main');
const timeDisplay = document.getElementById('timeDisplay');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const resetBtn = document.getElementById('resetBtn');
const installBtn = document.getElementById('installBtn');
const versionBadge = document.getElementById('versionBadge');
// Haptics elements removed (always ON)
// placeholder UI removed
// iOS判定と擬似ハプティクス用トグル
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const iosHapticSwitch = document.getElementById('iosHapticSwitch');

// Stopwatch state
let isRunning = false;
let startTime = 0;
let elapsed = 0; // ms
let rafId = 0;

function formatTime(ms) {
  const totalMs = Math.max(0, Math.floor(ms));
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const millis = totalMs % 1000;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function renderTime() {
  timeDisplay.textContent = formatTime(elapsed);
}

function tick() {
  elapsed = performance.now() - startTime;
  renderTime();
  rafId = requestAnimationFrame(tick);
}

function startTimer() {
  if (isRunning) return;
  isRunning = true;
  startTime = performance.now() - elapsed; // resume support
  tick();
  startBtn.disabled = true;
  stopBtn.disabled = false;
  resetBtn.disabled = true;
  hapticFeedback('start');
}

function stopTimer() {
  if (!isRunning) return;
  isRunning = false;
  cancelAnimationFrame(rafId);
  renderTime();
  startBtn.disabled = false;
  stopBtn.disabled = true;
  resetBtn.disabled = false;
  hapticFeedback('stop');
}

function resetTimer() {
  elapsed = 0;
  renderTime();
  startBtn.disabled = false;
  stopBtn.disabled = true;
  resetBtn.disabled = true;
}

// File selection (in single measurement view)
if (videoInput) {
  videoInput.addEventListener('change', () => {
    const file = videoInput.files && videoInput.files[0];
    if (file) {
      if (selectedVideoURL) URL.revokeObjectURL(selectedVideoURL);
      selectedVideoURL = URL.createObjectURL(file);
      try { videoEl.pause(); } catch {}
      videoEl.removeAttribute('src');
      videoEl.src = selectedVideoURL;
      try { videoEl.load(); } catch {}
      Promise.resolve().then(() => videoEl.play()).catch(() => {});
      requestAnimationFrame(resizeVideoArea);
    }
  });
}

// Placeholder removed

// Single-view mode: ensure layout sizing
requestAnimationFrame(resizeVideoArea);

// Video controls
playPauseBtn.addEventListener('click', async () => {
  if (videoEl.paused) {
    try { await videoEl.play(); } catch (e) { /* autoplay may block */ }
  } else {
    videoEl.pause();
  }
});

// Removed restart button

// Seek bar
function setupSeekbarBindings() {
  // 動画の長さがわかったら最大値を設定
  videoEl.addEventListener('loadedmetadata', () => {
    if (isFinite(videoEl.duration)) {
      seekBar.max = String(videoEl.duration);
    }
  });

  // 再生位置の更新に追従
  videoEl.addEventListener('timeupdate', () => {
    if (!isNaN(videoEl.currentTime)) {
      seekBar.value = String(videoEl.currentTime);
    }
  });

  videoEl.addEventListener('error', () => {
    // keep UI as-is; user can reselect
  });

  // ユーザー操作でシーク
  seekBar.addEventListener('input', () => {
    const t = Number(seekBar.value);
    if (!Number.isNaN(t)) videoEl.currentTime = t;
  });
}

setupSeekbarBindings();

// ===== ブザー検出で自動スタート =====
// 設定（必要に応じて調整）
const autoStartToggle = document.getElementById('autoStartToggle');
const AUTO_START_KEY = 'autoStartEnabled';
let autoStartEnabled = false; // デフォルトOFF
try {
  const saved = localStorage.getItem(AUTO_START_KEY);
  autoStartEnabled = saved ? saved === 'true' : false;
  if (autoStartToggle) autoStartToggle.checked = autoStartEnabled;
} catch {}
function isAutoEnabled() { return !!autoStartEnabled; }
// デフォルト感度
const DEF_FREQ = 2500; // Hz
const DEF_THRESH = -45; // dB
const DEF_HOLD = 80; // ms

// UIと保存
const freqInput = document.getElementById('autoFreq');
const threshInput = document.getElementById('autoThresh');
const holdInput = document.getElementById('autoHold');
const threshValueEl = document.getElementById('autoThreshValue');
const holdValueEl = document.getElementById('autoHoldValue');
const sensInput = document.getElementById('autoSens');
const sensValueEl = document.getElementById('autoSensValue');
const levelBar = document.getElementById('levelBar');
const levelValue = document.getElementById('levelValue');
const levelThresh = document.getElementById('levelThresh');
const KEY_FREQ = 'autoFreqHz';
const KEY_THRESH = 'autoThreshDb';
const KEY_HOLD = 'autoHoldMs';
const KEY_SENS = 'autoSensLevel';

let buzzerFreq = DEF_FREQ;
let thresholdDb = DEF_THRESH;
let holdMs = DEF_HOLD;
let sensLevel = 3; // 1..5

try {
  const savedF = Number(localStorage.getItem(KEY_FREQ));
  const savedT = Number(localStorage.getItem(KEY_THRESH));
  const savedH = Number(localStorage.getItem(KEY_HOLD));
  const savedS = Number(localStorage.getItem(KEY_SENS));
  if (!Number.isNaN(savedF) && savedF >= 200 && savedF <= 8000) buzzerFreq = savedF;
  if (!Number.isNaN(savedT) && savedT <= -20 && savedT >= -90) thresholdDb = savedT;
  if (!Number.isNaN(savedH) && savedH >= 20 && savedH <= 300) holdMs = savedH;
  if (!Number.isNaN(savedS) && savedS >= 1 && savedS <= 5) {
    sensLevel = savedS;
    const p = paramsForSens(sensLevel);
    thresholdDb = p.thresh;
    holdMs = p.hold;
  }
} catch {}

function renderAutoTuneUI() {
  if (freqInput) freqInput.value = String(buzzerFreq);
  if (threshInput) threshInput.value = String(thresholdDb);
  if (holdInput) holdInput.value = String(holdMs);
  if (threshValueEl) threshValueEl.textContent = `(${thresholdDb} dB)`;
  if (holdValueEl) holdValueEl.textContent = `(${holdMs} ms)`;
  if (sensInput) sensInput.value = String(sensLevel);
  if (sensValueEl) sensValueEl.textContent = labelForSens(sensLevel);
  // threshold marker位置
  updateThresholdMarker();
}
renderAutoTuneUI();

// Sensitivity mapping (1=低, 5=高)
function paramsForSens(level) {
  const map = {
    1: { thresh: -35, hold: 150 },
    2: { thresh: -40, hold: 120 },
    3: { thresh: -45, hold: 80 },
    4: { thresh: -50, hold: 60 },
    5: { thresh: -55, hold: 50 }
  };
  return map[level] || map[3];
}
function labelForSens(level) {
  return ({1: '低', 2: 'やや低', 3: '標準', 4: 'やや高', 5: '高'}[level]) || '標準';
}

let audioCtx = null; // 既存のWeb Audio（擬似ハプティクス）と共有
function ensureAudioContext() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

let mediaSource = null;
let bandpass = null;
let analyser = null;
let freqData = null;
let monitorRaf = 0;
let meterRaf = 0;
let aboveSince = 0;
let autoStartFired = false;

function ensureAnalyzerGraph() {
  ensureAudioContext();
  if (!audioCtx) return;
  if (!mediaSource) {
    mediaSource = audioCtx.createMediaElementSource(videoEl);
  }
  if (!bandpass) {
    bandpass = audioCtx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = buzzerFreq;
    bandpass.Q.value = 10; // 絞り込み
  }
  if (!analyser) {
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.2;
    freqData = new Float32Array(analyser.frequencyBinCount);
  }
  // 接続（destinationへは繋がない）
  try {
    mediaSource.disconnect();
  } catch {}
  mediaSource.connect(bandpass);
  try { bandpass.disconnect(); } catch {}
  bandpass.connect(analyser);
}

function startBuzzerMonitor() {
  if (!isAutoEnabled() || !analyser || !audioCtx) return;
  const sr = audioCtx.sampleRate || 48000;
  const binHz = sr / analyser.fftSize; // 実質 (sampleRate / fftSize)
  let targetBin = Math.max(0, Math.min(analyser.frequencyBinCount - 1, Math.round(buzzerFreq / binHz)));
  aboveSince = 0;
  cancelAnimationFrame(monitorRaf);

  const tick = (t) => {
    analyser.getFloatFrequencyData(freqData);
    const levelDb = freqData[targetBin];
    if (levelDb >= thresholdDb) {
      if (aboveSince === 0) aboveSince = performance.now();
      const dur = performance.now() - aboveSince;
      if (!autoStartFired && !isRunning && dur >= holdMs) {
        autoStartFired = true;
        startTimer();
      }
    } else {
      aboveSince = 0;
    }
    monitorRaf = requestAnimationFrame(tick);
  };
  monitorRaf = requestAnimationFrame(tick);
}

function stopBuzzerMonitor() {
  cancelAnimationFrame(monitorRaf);
}

// Level meter loop (常にUI更新用、オフでも可)
function dbToPercent(db) {
  // Map [-90 .. -20] dB => [0 .. 100]
  const clamped = Math.max(-90, Math.min(-20, db));
  return ((clamped + 90) / 70) * 100;
}
function updateThresholdMarker() {
  if (!levelThresh) return;
  const p = dbToPercent(thresholdDb);
  levelThresh.style.left = `${p}%`;
}
function updateMeter(db) {
  if (levelBar) levelBar.style.width = `${dbToPercent(db)}%`;
  if (levelValue) levelValue.textContent = Number.isFinite(db) ? `${Math.round(db)} dB` : '';
}
function startMeterLoop() {
  ensureAudioContext();
  if (!audioCtx) return;
  if (!analyser) ensureAnalyzerGraph();
  cancelAnimationFrame(meterRaf);
  const loop = () => {
    if (analyser) {
      analyser.getFloatFrequencyData(freqData);
      const sr = audioCtx.sampleRate || 48000;
      const binHz = sr / analyser.fftSize;
      const targetBin = Math.max(0, Math.min(analyser.frequencyBinCount - 1, Math.round(buzzerFreq / binHz)));
      const db = freqData ? freqData[targetBin] : -90;
      updateMeter(db);
    }
    meterRaf = requestAnimationFrame(loop);
  };
  meterRaf = requestAnimationFrame(loop);
}
function stopMeterLoop() { cancelAnimationFrame(meterRaf); }

videoEl.addEventListener('play', () => {
  ensureAnalyzerGraph();
  startMeterLoop();
  if (isAutoEnabled()) startBuzzerMonitor();
});
videoEl.addEventListener('pause', stopBuzzerMonitor);
videoEl.addEventListener('ended', stopBuzzerMonitor);
videoEl.addEventListener('pause', stopMeterLoop);
videoEl.addEventListener('ended', stopMeterLoop);
videoEl.addEventListener('loadedmetadata', () => {
  autoStartFired = false;
});

// Toggle handlers
autoStartToggle?.addEventListener('change', () => {
  autoStartEnabled = !!autoStartToggle.checked;
  try { localStorage.setItem(AUTO_START_KEY, autoStartEnabled ? 'true' : 'false'); } catch {}
  if (autoStartEnabled) {
    // 有効化時、再生中なら監視を開始
    if (!audioCtx || audioCtx.state === 'suspended') ensureAudioContext();
    setupAudioAnalysisGraph();
    if (!videoEl.paused) startBuzzerMonitor();
  } else {
    stopBuzzerMonitor();
  }
});

// Sensitivity change handlers
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function restartMonitorIfRunning() {
  if (autoStartEnabled && !videoEl.paused) {
    stopBuzzerMonitor();
    setupAudioAnalysisGraph();
    startBuzzerMonitor();
  }
}

freqInput?.addEventListener('change', () => {
  const v = clamp(Number(freqInput.value), 200, 8000);
  if (!Number.isNaN(v)) {
    buzzerFreq = v;
    try { localStorage.setItem(KEY_FREQ, String(v)); } catch {}
    if (bandpass) bandpass.frequency.value = buzzerFreq;
    restartMonitorIfRunning();
  }
});

threshInput?.addEventListener('input', () => {
  const v = clamp(Number(threshInput.value), -90, -20);
  if (!Number.isNaN(v)) {
    thresholdDb = v;
    try { localStorage.setItem(KEY_THRESH, String(v)); } catch {}
    renderAutoTuneUI();
  }
});

holdInput?.addEventListener('input', () => {
  const v = clamp(Number(holdInput.value), 20, 300);
  if (!Number.isNaN(v)) {
    holdMs = v;
    try { localStorage.setItem(KEY_HOLD, String(v)); } catch {}
    renderAutoTuneUI();
  }
});

sensInput?.addEventListener('input', () => {
  const lvl = clamp(Number(sensInput.value), 1, 5);
  sensLevel = lvl;
  const p = paramsForSens(lvl);
  thresholdDb = p.thresh;
  holdMs = p.hold;
  try { localStorage.setItem(KEY_SENS, String(lvl)); } catch {}
  renderAutoTuneUI();
  restartMonitorIfRunning();
});

// ビデオ領域を可能な限り大きくする（ヘッダー/コントロール/セーフエリアを考慮）
function resizeVideoArea() {
  if (!playerView.classList.contains('active')) return;
  // CSSのaspect-ratioに任せるため高さ指定をクリア
  videoWrap.style.height = '';
}

window.addEventListener('resize', resizeVideoArea);
window.addEventListener('orientationchange', resizeVideoArea);

// Stopwatch controls
startBtn.addEventListener('click', () => {
  // Optional: start video if paused
  if (videoEl.paused && videoEl.src) {
    videoEl.play().catch(() => {});
  }
  startTimer();
});

stopBtn.addEventListener('click', () => {
  stopTimer();
});

resetBtn.addEventListener('click', () => {
  resetTimer();
  hapticFeedback('reset');
});

// Orientation lock removed (portrait-first UI)

// PWA install prompt handling (header button removed)
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  beforeInstallPromptEvent = e;
});

// Service worker registration (通知なし)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  });
}

// Initial UI state
renderTime();

// Show app version if available
try {
  const v = (typeof APP_VERSION !== 'undefined') ? APP_VERSION : undefined;
  if (v && versionBadge) versionBadge.textContent = v;
} catch {}

// Haptics (vibrate or pseudo via Web Audio) — audioCtx を共有
const canVibrate = 'vibrate' in navigator;

function buzz(durationMs = 30) {
  ensureAudioContext();
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'square';
  osc.frequency.value = 120; // low buzz
  const now = audioCtx.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.25, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + durationMs / 1000 + 0.02);
}

function playPattern(pattern) {
  if (Array.isArray(pattern)) {
    let t = 0;
    pattern.forEach((seg, i) => {
      if (i % 2 === 0) {
        // on segment
        setTimeout(() => buzz(seg), t);
      }
      t += seg;
    });
  } else {
    buzz(typeof pattern === 'number' ? pattern : 30);
  }
}

function haptic(pattern) {
  if (isIOS && iosHapticSwitch) {
    const pulses = Array.isArray(pattern) ? Math.ceil(pattern.length / 2) : 1;
    const interval = 60;
    for (let i = 0; i < pulses; i++) {
      setTimeout(() => {
        iosHapticSwitch.click();
      }, i * interval);
    }
    return;
  }
  if (canVibrate) {
    try { navigator.vibrate(pattern); } catch {}
  } else {
    playPattern(pattern);
  }
}

function hapticFeedback(kind) {
  switch (kind) {
    case 'start':
      haptic([40]); // single short
      break;
    case 'stop':
      haptic([50, 40, 50]); // double pulse
      break;
    case 'reset':
      haptic(20);
      break;
  }
}

// Haptics default ON; ensure audio context will start on first user gesture
