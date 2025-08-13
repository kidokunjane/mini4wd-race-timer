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

// Service worker registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  });
}

// Initial UI state
renderTime();

