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
const videoControls = document.querySelector('.video-controls');
const appHeader = document.querySelector('.app-header');
const mainEl = document.querySelector('main');
const timeDisplay = document.getElementById('timeDisplay');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const resetBtn = document.getElementById('resetBtn');
const installBtn = document.getElementById('installBtn');

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
}

function stopTimer() {
  if (!isRunning) return;
  isRunning = false;
  cancelAnimationFrame(rafId);
  renderTime();
  startBtn.disabled = false;
  stopBtn.disabled = true;
  resetBtn.disabled = false;
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
    // レイアウトを更新
    requestAnimationFrame(resizeVideoArea);
  } else {
    playerView.classList.remove('active');
    selectView.classList.add('active');
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
  const controlsH = videoControls.offsetHeight || 0;
  const headerH = appHeader.offsetHeight || 0;
  const vh = window.innerHeight;
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
});

stopBtn.addEventListener('click', () => {
  stopTimer();
});

resetBtn.addEventListener('click', () => {
  resetTimer();
});

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

// Service worker registration with update notification
if ('serviceWorker' in navigator) {
  const updateToast = document.getElementById('updateToast');
  const reloadBtn = document.getElementById('reloadBtn');
  const dismissUpdateBtn = document.getElementById('dismissUpdateBtn');

  function showUpdateToast() {
    if (updateToast) updateToast.hidden = false;
  }
  function hideUpdateToast() {
    if (updateToast) updateToast.hidden = true;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').then((reg) => {
      // If there's an update ready (installed) while controller exists
      if (reg.waiting && navigator.serviceWorker.controller) {
        showUpdateToast();
      }

      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateToast();
          }
        });
      });

      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        // New SW took control; prompt user to reload
        showUpdateToast();
      });

      reloadBtn?.addEventListener('click', () => {
        hideUpdateToast();
        location.reload();
      });
      dismissUpdateBtn?.addEventListener('click', () => hideUpdateToast());
    }).catch(() => {});
  });
}

// Initial UI state
renderTime();
