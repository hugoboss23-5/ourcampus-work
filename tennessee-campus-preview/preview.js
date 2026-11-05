// built-from: native HTMLMediaElement events and fullscreen API; no runtime dependency.
(() => {
  const video = document.getElementById('campus-film');
  const playButton = document.getElementById('play-toggle');
  const pauseButton = document.getElementById('pause-toggle');
  const replayButton = document.getElementById('replay');
  const fullscreenButton = document.getElementById('fullscreen');
  const errorBox = document.getElementById('media-error');
  const controlFeedback = document.getElementById('control-feedback');
  const status = document.getElementById('media-status');
  const page = document.querySelector('.preview');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let unavailable = false;

  function setPlaybackState() {
    const playing = !video.paused && !video.ended;
    playButton.classList.toggle('is-playing', playing);
    playButton.setAttribute('aria-pressed', String(playing));
    playButton.setAttribute('aria-label', playing ? 'Pause campus preview' : 'Play campus preview');
    playButton.querySelector('.play-label').textContent = playing ? 'Pause preview' : 'Play campus preview';
    pauseButton.textContent = playing ? 'PAUSE' : 'PLAY';
    pauseButton.setAttribute('aria-label', playing ? 'Pause preview' : 'Play preview');
    page.classList.toggle('is-paused', !playing);
    page.classList.toggle('is-playing', playing);
    if (!unavailable) status.textContent = `${playing ? 'Drone preview' : 'Preview paused'} · sound ${video.muted ? 'off' : 'on'}`;
  }

  async function play() {
    if (unavailable) return;
    try {
      await video.play();
    } catch (error) {
      if (video.error) showUnavailable();
      else status.textContent = 'Press play to start the campus preview.';
    }
  }

  function showUnavailable() {
    unavailable = true;
    errorBox.hidden = false;
    status.textContent = 'Video unavailable';
    playButton.disabled = true;
    pauseButton.disabled = true;
    replayButton.disabled = true;
    playButton.setAttribute('aria-label', 'Campus preview unavailable');
  }

  playButton.addEventListener('click', () => video.paused ? play() : video.pause());
  pauseButton.addEventListener('click', () => video.paused ? play() : video.pause());
  replayButton.addEventListener('click', () => {
    if (unavailable) return;
    try { video.currentTime = 0; } catch (_) { /* metadata may still be loading */ }
    play();
  });
  fullscreenButton.addEventListener('click', async () => {
    try {
      controlFeedback.hidden = true;
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (video.requestFullscreen) await video.requestFullscreen();
      else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
      else {
        controlFeedback.textContent = 'Use the video player’s fullscreen control.';
        controlFeedback.hidden = false;
      }
    } catch (_) {
      controlFeedback.textContent = 'Use the video player’s fullscreen control.';
      controlFeedback.hidden = false;
    }
  });

  video.addEventListener('play', setPlaybackState);
  video.addEventListener('pause', setPlaybackState);
  video.addEventListener('ended', setPlaybackState);
  video.addEventListener('volumechange', setPlaybackState);
  video.addEventListener('error', showUnavailable, { once: true });
  video.addEventListener('loadedmetadata', () => {
    if (reduceMotion.matches) video.pause();
  }, { once: true });
  document.addEventListener('fullscreenchange', () => {
    const active = document.fullscreenElement === page || document.fullscreenElement === video;
    fullscreenButton.textContent = active ? 'EXIT FULL' : 'FULL SCREEN';
    fullscreenButton.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
    if (active) controlFeedback.hidden = true;
  });
  window.addEventListener('pointermove', event => {
    if (event.pointerType && event.pointerType !== 'mouse') return;
    const x = Math.round(event.clientX / window.innerWidth * 1000) / 10;
    const y = Math.round(event.clientY / window.innerHeight * 1000) / 10;
    page.style.setProperty('--pointer-x', `${x}%`);
    page.style.setProperty('--pointer-y', `${y}%`);
  }, { passive: true });
  window.addEventListener('pointerleave', () => {
    page.style.setProperty('--pointer-x', '50%');
    page.style.setProperty('--pointer-y', '50%');
  });

  if (reduceMotion.matches) {
    video.pause();
    video.autoplay = false;
    video.removeAttribute('autoplay');
  }
  setPlaybackState();
})();
