let selectedVideoURL = null;
let beforeInstallPromptEvent = null;

// DOM elements
const selectView = document.getElementById('select-view');
const playerView = document.getElementById('player-view');
const videoInput = document.getElementById('videoInput');
const goToPlayerBtn = document.getElementById('goToPlayerBtn');
const backBtn = document.getElementById('backBtn');
const videoEl = document.getElementById('video');
const playPauseBtn = document.getElementById('playPauseBtn');
const restartBtn = document.getElementById('restartBtn');
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
const hapticsToggle = document.getElementById('hapticsToggle');
const hapticsNote = document.getElementById('hapticsNote');

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

// File selection and navigation
videoInput.addEventListener('change', () => {
  const file = videoInput.files && videoInput.files[0];
  if (file) {
    if (selectedVideoURL) URL.revokeObjectURL(selectedVideoURL);
    selectedVideoURL = URL.createObjectURL(file);
    goToPlayerBtn.disabled = false;
    // 自動で再生画面に遷移し、可能なら再生を試みる
    videoEl.src = selectedVideoURL;
    switchView('player');
    // 一部のブラウザでは自動再生がブロックされる可能性あり
    Promise.resolve().then(() => videoEl.play()).catch(() => {});
  } else {
    goToPlayerBtn.disabled = true;
  }
});

goToPlayerBtn.addEventListener('click', () => {
  if (!selectedVideoURL) return;
  videoEl.src = selectedVideoURL;
  switchView('player');
});

backBtn.addEventListener('click', () => {
  // Stop video and reset stopwatch on back
  try { videoEl.pause(); } catch {}
  resetTimer();
  switchView('select');
});

function switchView(view) {
  if (view === 'player') {
    selectView.classList.remove('active');
    playerView.classList.add('active');
    document.body.classList.add('player-mode');
    // レイアウトを更新
    requestAnimationFrame(resizeVideoArea);
    // 可能なら横画面にロック
    tryLockLandscape();
  } else {
    playerView.classList.remove('active');
    selectView.classList.add('active');
    document.body.classList.remove('player-mode');
  }
}

// Video controls
playPauseBtn.addEventListener('click', async () => {
  if (videoEl.paused) {
    try { await videoEl.play(); } catch (e) { /* autoplay may block */ }
  } else {
    videoEl.pause();
  }
});

restartBtn.addEventListener('click', async () => {
  if (!videoEl.src) return;
  try { videoEl.pause(); } catch {}
  videoEl.currentTime = 0;
  try { await videoEl.play(); } catch {}
  tryLockLandscape();
  hapticFeedback('restart');
});

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
  const mainStyles = getComputedStyle(mainEl);
  const pt = parseFloat(mainStyles.paddingTop) || 0;
  const pb = parseFloat(mainStyles.paddingBottom) || 0;
  const controlsH = (videoSeekContainer && videoSeekContainer.offsetHeight) || 0;
  const headerH = appHeader.offsetHeight || 0;
  const vh = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
  const margins = 8; // .video-controls margin-top
  const available = Math.max(240, vh - headerH - pt - pb - controlsH - margins);
  videoWrap.style.height = available + 'px';
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
  tryLockLandscape();
});

stopBtn.addEventListener('click', () => {
  stopTimer();
});

resetBtn.addEventListener('click', () => {
  resetTimer();
  hapticFeedback('reset');
});

// 可能なら横画面にロック（ユーザー操作起点で呼び出すと成功しやすい）
async function tryLockLandscape() {
  const api = screen.orientation && screen.orientation.lock;
  if (!api) return; // 非対応（iOS Safari等）は何もしない
  try {
    await screen.orientation.lock('landscape');
  } catch (_) {
    // フルスクリーンが必要な環境や権限不足では失敗することがあります
  }
}

// PWA install prompt handling
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  beforeInstallPromptEvent = e;
  installBtn.hidden = false;
});

installBtn.addEventListener('click', async () => {
  if (!beforeInstallPromptEvent) return;
  installBtn.hidden = true;
  beforeInstallPromptEvent.prompt();
  await beforeInstallPromptEvent.userChoice;
  beforeInstallPromptEvent = null;
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
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
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
  if (!hapticsToggle?.checked) return;
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
    case 'restart':
      haptic([30, 30, 30]);
      break;
    case 'reset':
      haptic(20);
      break;
  }
}

// Haptics toggle persistence and note
const HAPTICS_KEY = 'hapticsEnabled';
try {
  const saved = localStorage.getItem(HAPTICS_KEY);
  const initial = saved == null ? true : saved === 'true';
  if (hapticsToggle) hapticsToggle.checked = initial;
} catch {}
if (hapticsToggle) {
  hapticsToggle.addEventListener('change', () => {
    try { localStorage.setItem(HAPTICS_KEY, hapticsToggle.checked ? 'true' : 'false'); } catch {}
    // Start/resume audio context on first enable via user gesture
    if (hapticsToggle.checked) ensureAudioContext();
  });
}
if (hapticsNote) {
  if (canVibrate) {
    hapticsNote.textContent = '対応端末ではネイティブ振動を使用します。';
  } else if (isIOS) {
    hapticsNote.textContent = 'iOSでは短いサウンドで擬似バイブを再現します。音量にご注意ください。';
  } else {
    hapticsNote.textContent = '振動非対応のため疑似バイブを使用します。';
  }
}
