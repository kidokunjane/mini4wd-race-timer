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

// Haptics (vibrate or pseudo via Web Audio)
const canVibrate = 'vibrate' in navigator;
let audioCtx = null;
function ensureAudioContext() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

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
