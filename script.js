/* =========================================================================
   Maria & João — 29 Agosto
   Vanilla JS. No frameworks, no build step.

   ---- EDIT-ME QUICK GUIDE -------------------------------------------------
   - CONFIG below controls the lock time, countdown target and password.
   - All Portuguese copy that isn't in index.html (game texts, item lists)
     lives in the CONFIG / DATA sections near the top of this file.
   - Progress is saved in localStorage under the keys in STORAGE_KEYS, so
     visitors keep their progress if they come back later.
   ========================================================================= */

(function () {
  'use strict';

  /* =======================================================================
     CONFIG
     Times are written as UTC ISO strings so they are correct regardless of
     the visitor's own timezone/device clock settings.
     Portugal (Lisbon) is on WEST (UTC+1) in late August (daylight saving).
       Sexta 28 Ago 2026, 19:30 Lisboa  -> 18:30 UTC
       Sábado 29 Ago 2026, 13:00 Lisboa -> 12:00 UTC
     ======================================================================= */
  const CONFIG = {
    // TESTE TEMPORÁRIO: data movida para o passado para conseguires ver o
    // que aparece a partir de sexta sem precisar da palavra-passe.
    // >>> ANTES DE PUBLICAR, REPÕE A LINHA ORIGINAL: '2026-08-28T18:30:00Z' <<<
    unlockInstantUTC: '2026-08-15T00:00:00Z', // games become available from this moment
    countdownTargetUTC: '2026-08-29T12:00:00Z', // "we leave home" moment shown on landing
    password: 'catupiry' // case-insensitive, checked lowercased
  };

  // Transparent-background images used inside the canvas mini-games.
  const IMAGES = {
    boat: Object.assign(new Image(), { src: 'boat.png' }),
    lemon: Object.assign(new Image(), { src: 'lemon.png' }),
    heart: Object.assign(new Image(), { src: 'redheart.png' }),
    seagull: Object.assign(new Image(), { src: 'seagul.png' }),
    crab: Object.assign(new Image(), { src: 'carangueijo.png' })
  };

  const STORAGE_KEYS = {
    gamesDone: 'md_games_done',      // integer 0-5, how many games completed in order
    fullyUnlocked: 'md_unlocked',    // 'true' once all 5 games are done
    bypassLock: 'md_bypass_lock',    // 'true' once password used on landing screen
    bypassLevel2: 'md_bypass_lvl2',  // 'true' once password used on the "Falta pouco" screen
    musicOn: 'md_music_on',
    packedItems: 'md_packed_items'   // JSON array, so the packing game can restore state
  };

  /* =======================================================================
     Small storage helpers
     ======================================================================= */
  const store = {
    get(key, fallback) {
      const v = localStorage.getItem(key);
      return v === null ? fallback : v;
    },
    getInt(key, fallback) {
      const v = parseInt(localStorage.getItem(key), 10);
      return Number.isNaN(v) ? fallback : v;
    },
    set(key, val) { localStorage.setItem(key, val); }
  };

  /* =======================================================================
     Screen switching
     ======================================================================= */
  const screens = {
    landing: document.getElementById('screen-landing'),
    games: document.getElementById('screen-games'),
    content: document.getElementById('screen-content')
  };

  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });

    // Ambient music only plays during the mini-games — not on the landing
    // page, and not on the final reveal/content page.
    const musicBtn = document.getElementById('music-toggle');
    if (name === 'games') {
      musicBtn.classList.remove('hidden');
    } else {
      musicBtn.classList.add('hidden');
      if (MusicEngine.isPlaying()) { MusicEngine.stop(); refreshMusicIcon(); }
    }
  }

  /* =======================================================================
     Game result notification — reusable popup ("Boa!", etc.) with a single
     button that runs whatever should happen next (usually completeGame()).
     ======================================================================= */
  function showGameNotice({ title, subtitle, btnLabel, onNext }) {
    const notice = document.getElementById('game-notice');
    const titleEl = document.getElementById('game-notice-title');
    const subtitleEl = document.getElementById('game-notice-subtitle');
    const btn = document.getElementById('game-notice-btn');
    titleEl.textContent = title;
    if (subtitle) {
      subtitleEl.textContent = subtitle;
      subtitleEl.classList.remove('hidden');
    } else {
      subtitleEl.textContent = '';
      subtitleEl.classList.add('hidden');
    }
    btn.textContent = btnLabel || 'Continuar';
    notice.classList.add('active');
    btn.onclick = () => {
      notice.classList.remove('active');
      onNext();
    };
  }

  /* =======================================================================
     Toast — small, auto-dismissing message (e.g. "wrong item"), separate
     from the blocking showGameNotice() popup.
     ======================================================================= */
  let toastTimer = null;
  function showToast(message, duration = 1800) {
    const toast = document.getElementById('toast');
    document.getElementById('toast-text').textContent = message;
    toast.classList.add('active');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('active'), duration);
  }

  /* =======================================================================
     Sparkle canvas — used on the reveal moment
     ======================================================================= */
  const sparkleCanvas = document.getElementById('sparkle-canvas');
  const sctx = sparkleCanvas.getContext('2d');
  let sparkles = [];
  let sparkleRAF = null;

  function resizeSparkleCanvas() {
    sparkleCanvas.width = window.innerWidth;
    sparkleCanvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeSparkleCanvas);
  resizeSparkleCanvas();

  function burstSparkles(duration = 2600) {
    sparkleCanvas.classList.add('active');
    const colors = ['#e3ae3c', '#e2725b', '#77875a', '#ffffff'];
    for (let i = 0; i < 90; i++) {
      sparkles.push({
        x: Math.random() * sparkleCanvas.width,
        y: -20 - Math.random() * sparkleCanvas.height * 0.5,
        r: 2 + Math.random() * 3,
        vy: 1.5 + Math.random() * 3,
        vx: (Math.random() - 0.5) * 1.5,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1
      });
    }
    const start = performance.now();
    function tick(now) {
      sctx.clearRect(0, 0, sparkleCanvas.width, sparkleCanvas.height);
      sparkles.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.alpha -= 0.004;
        sctx.globalAlpha = Math.max(p.alpha, 0);
        sctx.fillStyle = p.color;
        sctx.beginPath();
        sctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        sctx.fill();
      });
      sctx.globalAlpha = 1;
      if (now - start < duration) {
        sparkleRAF = requestAnimationFrame(tick);
      } else {
        sparkles = [];
        sparkleCanvas.classList.remove('active');
        sctx.clearRect(0, 0, sparkleCanvas.width, sparkleCanvas.height);
      }
    }
    sparkleRAF = requestAnimationFrame(tick);
  }

  /* =======================================================================
     Ambient music — generated with the Web Audio API so no external audio
     file is needed (keeps the site fully offline-capable).
     A soft pad (guitar-ish detuned tones) + filtered noise for gentle waves.
     ======================================================================= */
  const MusicEngine = (function () {
    let ctx = null;
    let nodes = [];
    let playing = false;

    function makeNoiseBuffer(audioCtx, seconds) {
      const bufferSize = audioCtx.sampleRate * seconds;
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      return buffer;
    }

    function start() {
      if (playing) return;
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();

      const master = ctx.createGain();
      master.gain.value = 0.0001;
      master.connect(ctx.destination);
      master.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 2);

      // --- gentle wave noise ---
      const noise = ctx.createBufferSource();
      noise.buffer = makeNoiseBuffer(ctx, 4);
      noise.loop = true;
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.value = 500;
      const waveGain = ctx.createGain();
      waveGain.gain.value = 0.5;
      noise.connect(noiseFilter).connect(waveGain).connect(master);
      noise.start();

      // slow LFO on wave volume to mimic waves washing in and out
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.09;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.35;
      lfo.connect(lfoGain).connect(waveGain.gain);
      lfo.start();

      // --- soft warm pad, gentle guitar-like tones (Andalusian-ish chord) ---
      const padFreqs = [196.0, 246.94, 293.66, 392.0]; // G3 B3 D4 G4
      const padOscs = [];
      padFreqs.forEach((f, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = f;
        const g = ctx.createGain();
        g.gain.value = 0.06 + i * 0.01;
        const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
        if (panner) { panner.pan.value = (i - 1.5) * 0.25; osc.connect(g).connect(panner).connect(master); }
        else { osc.connect(g).connect(master); }
        osc.start();
        padOscs.push(osc);
      });

      nodes = [noise, noiseFilter, waveGain, lfo, lfoGain, master, ...padOscs];
      playing = true;
    }

    function stop() {
      if (!playing || !ctx) { playing = false; return; }
      nodes.forEach(n => { if (n.stop) { try { n.stop(); } catch (e) {} } });
      nodes.forEach(n => { try { n.disconnect(); } catch (e) {} });
      nodes = [];
      playing = false;
    }

    return {
      toggle() { if (playing) { stop(); } else { start(); } return playing; },
      isPlaying() { return playing; },
      stop
    };
  })();

  const musicBtn = document.getElementById('music-toggle');

  // The icon itself is a static SVG in the HTML — muted state is shown by
  // dimming the whole button (see .music-toggle.muted in style.css).
  function refreshMusicIcon() {
    musicBtn.classList.toggle('muted', !MusicEngine.isPlaying());
  }

  musicBtn.addEventListener('click', () => {
    MusicEngine.toggle();
    store.set(STORAGE_KEYS.musicOn, MusicEngine.isPlaying() ? 'true' : 'false');
    refreshMusicIcon();
  });

  // Respect previous preference, but browsers require a user gesture to
  // start audio — so we just leave it ready and correctly iconed.
  refreshMusicIcon();

  // TESTING ONLY — clears saved game progress so you can replay the 5
  // games from scratch. Remove this button (and its HTML/CSS) before
  // sharing the real link with João.
  document.getElementById('reset-progress-btn').addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEYS.gamesDone);
    localStorage.removeItem(STORAGE_KEYS.fullyUnlocked);
    location.reload();
  });

  /* =======================================================================
     Countdown + time-lock
     ======================================================================= */
  const unlockInstant = new Date(CONFIG.unlockInstantUTC).getTime();
  const countdownTarget = new Date(CONFIG.countdownTargetUTC).getTime();

  const cdDays = document.getElementById('cd-days');
  const cdHours = document.getElementById('cd-hours');
  const cdMins = document.getElementById('cd-mins');
  const cdSecs = document.getElementById('cd-secs');
  const enterBtn = document.getElementById('enter-games-btn');
  const unlockNote = document.getElementById('unlock-note');

  function pad(n) { return String(n).padStart(2, '0'); }

  function isTimeUnlocked() {
    return Date.now() >= unlockInstant || store.get(STORAGE_KEYS.bypassLock, 'false') === 'true';
  }

  function updateCountdown() {
    const now = Date.now();
    const diff = countdownTarget - now;

    if (diff > 0) {
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      cdDays.textContent = pad(days);
      cdHours.textContent = pad(hours);
      cdMins.textContent = pad(mins);
      cdSecs.textContent = pad(secs);
    } else {
      cdDays.textContent = cdHours.textContent = cdMins.textContent = cdSecs.textContent = '00';
    }

    if (isTimeUnlocked()) {
      enterBtn.classList.remove('hidden');
      unlockNote.classList.add('hidden');
    }
  }
  updateCountdown();
  setInterval(updateCountdown, 1000);

  enterBtn.addEventListener('click', () => {
    goToGamesOrContent();
  });

  function goToGamesOrContent() {
    if (store.get(STORAGE_KEYS.fullyUnlocked, 'false') === 'true') {
      renderContentScreen();
      showScreen('content');
    } else {
      showScreen('games');
      renderGamesProgress();
      showCurrentGamePanel();
    }
  }

  // Landing password form — discreet, collapsed behind "tenho uma
  // palavra-passe". Lets you bypass the Friday-night time-lock for testing.
  document.getElementById('landing-password-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('landing-password-input');
    const err = document.getElementById('landing-password-error');
    if (input.value.trim().toLowerCase() === CONFIG.password) {
      store.set(STORAGE_KEYS.bypassLock, 'true');
      err.textContent = '';
      updateCountdown();
      goToGamesOrContent();
    } else {
      err.textContent = 'Palavra-passe incorreta. Tenta outra vez.';
    }
  });

  // In-game password form: skips the currently active game, or — if the
  // "Falta pouco" time-lock panel is what's showing — bypasses that lock
  // instead, so testing isn't stuck waiting for Saturday 13:00.
  document.getElementById('game-password-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('game-password-input');
    const err = document.getElementById('game-password-error');
    if (input.value.trim().toLowerCase() === CONFIG.password) {
      err.textContent = '';
      input.value = '';
      if (lockedPanel.classList.contains('active')) {
        store.set(STORAGE_KEYS.bypassLevel2, 'true');
        showCurrentGamePanel();
      } else {
        const current = store.getInt(STORAGE_KEYS.gamesDone, 0) + 1;
        completeGame(Math.min(current, 5));
      }
    } else {
      err.textContent = 'Palavra-passe incorreta. Tenta outra vez.';
    }
  });

  /* =======================================================================
     On load: decide which screen to show right away
     ======================================================================= */
  function boot() {
    if (store.get(STORAGE_KEYS.fullyUnlocked, 'false') === 'true') {
      renderContentScreen();
      showScreen('content');
    } else {
      showScreen('landing');
    }
  }

  /* =======================================================================
     GAMES ORCHESTRATION
     ======================================================================= */
  const GAME_PANELS = [1, 2, 3, 4, 5].map(n => document.getElementById('game-' + n));
  const lockedPanel = document.getElementById('game-locked');
  const progressSteps = document.querySelectorAll('.progress-step');

  // Game 1 (Pack the Bag) opens as soon as the games screen itself does
  // (Friday night). Games 2-5 stay behind a second gate until Saturday
  // 13:00 — the same "we leave home" moment shown on the landing countdown.
  function isLevel2Unlocked() {
    return Date.now() >= countdownTarget || store.get(STORAGE_KEYS.bypassLevel2, 'false') === 'true';
  }

  function renderGamesProgress() {
    const done = store.getInt(STORAGE_KEYS.gamesDone, 0);
    progressSteps.forEach((step, i) => {
      const n = i + 1;
      step.classList.toggle('done', n <= done);
      step.classList.toggle('active', n === done + 1);
    });
  }

  let gamesLockInterval = null;

  function showCurrentGamePanel() {
    const done = store.getInt(STORAGE_KEYS.gamesDone, 0);
    const activeIndex = Math.min(done + 1, 5); // 1-based
    GAME_PANELS.forEach(p => p.classList.remove('active'));
    lockedPanel.classList.remove('active');
    clearInterval(gamesLockInterval);

    if (activeIndex > 1 && !isLevel2Unlocked()) {
      lockedPanel.classList.add('active');
      updateGamesLockCountdown();
      gamesLockInterval = setInterval(() => {
        if (isLevel2Unlocked()) {
          clearInterval(gamesLockInterval);
          showCurrentGamePanel(); // swap straight to the real game
        } else {
          updateGamesLockCountdown();
        }
      }, 1000);
      return;
    }

    const panel = document.getElementById('game-' + activeIndex);
    panel.classList.add('active');
    initGame(activeIndex);
  }

  function updateGamesLockCountdown() {
    const diff = Math.max(0, countdownTarget - Date.now());
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    document.getElementById('gl-hours').textContent = pad(hours);
    document.getElementById('gl-mins').textContent = pad(mins);
    document.getElementById('gl-secs').textContent = pad(secs);
  }

  function initGame(n) {
    if (n === 1) initPackBag();
    if (n === 2) initWordle();
    if (n === 3) initLemonCatch();
    if (n === 4) initMemory();
    if (n === 5) initRunner();
  }

  function completeGame(n) {
    const current = store.getInt(STORAGE_KEYS.gamesDone, 0);
    if (n > current) store.set(STORAGE_KEYS.gamesDone, n);
    renderGamesProgress();
    if (n >= 5) {
      allGamesComplete();
    } else {
      setTimeout(showCurrentGamePanel, 450);
    }
  }

  function allGamesComplete() {
    store.set(STORAGE_KEYS.fullyUnlocked, 'true');
    const overlay = document.getElementById('reveal-overlay');
    overlay.classList.add('active');
    burstSparkles(2600);
    setTimeout(() => {
      overlay.classList.remove('active');
      renderContentScreen();
      showScreen('content');
      burstSparkles(1800);
    }, 2400);
  }

  /* =======================================================================
     GAME 1 — Berlenga Wordle
     ======================================================================= */
  const ANSWER = 'ONDAS';
  const MAX_ATTEMPTS = 8;
  let wordleState = null;

  function initWordle() {
    const done = store.getInt(STORAGE_KEYS.gamesDone, 0);
    if (done >= 2) return; // already solved previously
    const grid = document.getElementById('wordle-grid');
    const kb = document.getElementById('wordle-keyboard');
    const msg = document.getElementById('wordle-message');
    msg.textContent = '';
    grid.innerHTML = '';
    kb.innerHTML = '';

    wordleState = { row: 0, guess: '', finished: false, keyStatus: {} };

    for (let r = 0; r < MAX_ATTEMPTS; r++) {
      const rowEl = document.createElement('div');
      rowEl.className = 'wordle-row';
      for (let c = 0; c < 5; c++) {
        const tile = document.createElement('div');
        tile.className = 'wordle-tile';
        tile.id = `wt-${r}-${c}`;
        rowEl.appendChild(tile);
      }
      grid.appendChild(rowEl);
    }

    const rows = [
      ['Q','W','E','R','T','Y','U','I','O','P'],
      ['A','S','D','F','G','H','J','K','L','Ç'],
      ['ENTER','Z','X','C','V','B','N','M','⌫']
    ];
    rows.forEach(r => {
      const rowEl = document.createElement('div');
      rowEl.className = 'wk-row';
      r.forEach(k => {
        const btn = document.createElement('button');
        btn.className = 'wk-key' + (k.length > 1 ? ' wide' : '');
        btn.textContent = k;
        btn.type = 'button';
        btn.dataset.key = k;
        btn.addEventListener('click', () => handleWordleKey(k));
        rowEl.appendChild(btn);
      });
      kb.appendChild(rowEl);
    });

    document.addEventListener('keydown', wordleKeyListener);

    // Invisible input overlaying the grid — tapping it opens the phone's
    // own keyboard. Typed letters come through 'input' (works even on
    // keyboards that don't fire keydown for letters, like iOS Safari);
    // Enter/Backspace come through 'keydown' on the input itself.
    const mobileInput = document.getElementById('wordle-mobile-input');
    mobileInput.value = '';
    mobileInput.oninput = () => {
      const ch = mobileInput.value.slice(-1).toUpperCase();
      mobileInput.value = '';
      if (/^[A-ZÇ]$/.test(ch)) handleWordleKey(ch);
    };
    mobileInput.onkeydown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); handleWordleKey('ENTER'); }
      else if (e.key === 'Backspace') { e.preventDefault(); handleWordleKey('⌫'); }
    };

    showGameNotice({
      title: 'Palavra Secreta',
      subtitle: 'Adivinha a palavra de 5 letras em 8 tentativas.',
      btnLabel: 'Começar',
      onNext: () => { mobileInput.focus(); }
    });
  }

  function wordleKeyListener(e) {
    const panel = document.getElementById('game-2');
    if (!panel.classList.contains('active') || !wordleState || wordleState.finished) return;
    if (document.getElementById('game-notice').classList.contains('active')) return;
    if (e.target && e.target.id === 'wordle-mobile-input') return; // handled separately
    if (e.key === 'Enter') handleWordleKey('ENTER');
    else if (e.key === 'Backspace') handleWordleKey('⌫');
    else if (/^[a-zA-Zç]$/.test(e.key)) handleWordleKey(e.key.toUpperCase());
  }

  function handleWordleKey(key) {
    if (!wordleState || wordleState.finished) return;
    const msg = document.getElementById('wordle-message');

    if (key === '⌫') {
      wordleState.guess = wordleState.guess.slice(0, -1);
    } else if (key === 'ENTER') {
      if (wordleState.guess.length !== 5) {
        msg.textContent = 'Escreve 5 letras primeiro!';
        return;
      }
      submitWordleGuess();
      return;
    } else if (wordleState.guess.length < 5) {
      wordleState.guess += key;
    }
    renderWordleRow();
  }

  function renderWordleRow() {
    const r = wordleState.row;
    for (let c = 0; c < 5; c++) {
      const tile = document.getElementById(`wt-${r}-${c}`);
      tile.textContent = wordleState.guess[c] || '';
    }
  }

  function submitWordleGuess() {
    const guess = wordleState.guess;
    const r = wordleState.row;
    const answerLetters = ANSWER.split('');
    const guessLetters = guess.split('');
    const result = new Array(5).fill('absent');

    // pass 1: correct
    const pool = [...answerLetters];
    guessLetters.forEach((l, i) => {
      if (l === answerLetters[i]) { result[i] = 'correct'; pool[i] = null; }
    });
    // pass 2: present
    guessLetters.forEach((l, i) => {
      if (result[i] === 'correct') return;
      const idx = pool.indexOf(l);
      if (idx !== -1) { result[i] = 'present'; pool[idx] = null; }
    });

    guessLetters.forEach((l, i) => {
      const tile = document.getElementById(`wt-${r}-${i}`);
      setTimeout(() => {
        tile.classList.add('pop');
        tile.classList.add(result[i]);
        setTimeout(() => tile.classList.remove('pop'), 150);
      }, i * 180);

      const rank = { absent: 0, present: 1, correct: 2 };
      const prev = wordleState.keyStatus[l];
      if (!prev || rank[result[i]] > rank[prev]) {
        wordleState.keyStatus[l] = result[i];
        const keyBtn = document.querySelector(`.wk-key[data-key="${l}"]`);
        if (keyBtn) {
          keyBtn.classList.remove('correct', 'present', 'absent');
          keyBtn.classList.add(result[i]);
        }
      }
    });

    const isWin = guess === ANSWER;
    wordleState.row++;
    wordleState.guess = '';

    setTimeout(() => {
      if (isWin) {
        wordleState.finished = true;
        document.removeEventListener('keydown', wordleKeyListener);
        showGameNotice({ title: 'Boa!', onNext: () => completeGame(2) });
      } else if (wordleState.row >= MAX_ATTEMPTS) {
        wordleState.finished = true;
        document.removeEventListener('keydown', wordleKeyListener);
        showGameNotice({ title: 'Não desta vez!', onNext: () => completeGame(2) });
      }
    }, 5 * 180 + 200);
  }

  /* =======================================================================
     GAME 2 — Lemon Catch
     ======================================================================= */
  let lemonState = null;

  function initLemonCatch() {
    const done = store.getInt(STORAGE_KEYS.gamesDone, 0);
    if (done >= 3) return;
    if (lemonState && lemonState.rafId) cancelAnimationFrame(lemonState.rafId);

    const canvas = document.getElementById('lemon-canvas');
    const ctx = canvas.getContext('2d');
    const scoreEl = document.getElementById('lemon-score');
    const rockEl = document.getElementById('rock-score');
    const msg = document.getElementById('lemon-message');
    msg.textContent = '';

    lemonState = {
      boatX: canvas.width / 2,
      boatW: 140,
      lemons: 0,
      rocks: 0,
      items: [],
      popups: [], // floating "+1" / "oops" texts
      lastSpawn: 0,
      spawnInterval: 850,
      running: true,
      rafId: null
    };

    function spawnItem() {
      const isCrab = Math.random() < 0.28;
      lemonState.items.push({
        x: 20 + Math.random() * (canvas.width - 40),
        y: -20,
        speed: 2 + Math.random() * 2,
        type: isCrab ? 'crab' : 'lemon'
      });
    }

    function addPopup(x, y, text, color) {
      lemonState.popups.push({ x, y, text, color, life: 0 });
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // boat — transparent PNG (plain shape fallback if it hasn't loaded yet)
      if (IMAGES.boat.complete && IMAGES.boat.naturalWidth) {
        const w = 140, h = w * (IMAGES.boat.naturalHeight / IMAGES.boat.naturalWidth);
        ctx.drawImage(IMAGES.boat, lemonState.boatX - w / 2, canvas.height - 14 - h, w, h);
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(lemonState.boatX, canvas.height - 24, 50, 17, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      lemonState.items.forEach(it => {
        const img = it.type === 'crab' ? IMAGES.crab : IMAGES.lemon;
        if (img.complete && img.naturalWidth) {
          const w = 64, h = w * (img.naturalHeight / img.naturalWidth);
          ctx.drawImage(img, it.x - w / 2, it.y - h / 2, w, h);
        } else {
          ctx.fillStyle = it.type === 'crab' ? '#e2725b' : '#e3ae3c';
          ctx.beginPath();
          ctx.arc(it.x, it.y, 20, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // floating "+1" / "oops" popups, drifting up and fading out
      ctx.textAlign = 'center';
      ctx.font = 'bold 22px sans-serif';
      lemonState.popups.forEach(p => {
        ctx.globalAlpha = Math.max(1 - p.life / 45, 0);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, p.x, p.y - p.life * 1.1);
      });
      ctx.globalAlpha = 1;
    }

    function loop(ts) {
      if (!lemonState.running) return;
      if (!lemonState.lastSpawn) lemonState.lastSpawn = ts;
      if (ts - lemonState.lastSpawn > lemonState.spawnInterval) {
        spawnItem();
        lemonState.lastSpawn = ts;
      }

      // move items + collision
      lemonState.items.forEach(it => { it.y += it.speed; });
      lemonState.items = lemonState.items.filter(it => {
        const caught = it.y > canvas.height - 80 && it.y < canvas.height - 10 &&
          Math.abs(it.x - lemonState.boatX) < 66;
        if (caught) {
          if (it.type === 'lemon') {
            lemonState.lemons++;
            scoreEl.textContent = lemonState.lemons;
            addPopup(it.x, it.y, '+1', '#77875a');
          } else {
            lemonState.rocks++;
            rockEl.textContent = lemonState.rocks;
            addPopup(it.x, it.y, 'ups!', '#c85a44');
          }
          return false;
        }
        return it.y < canvas.height + 20;
      });

      lemonState.popups.forEach(p => p.life++);
      lemonState.popups = lemonState.popups.filter(p => p.life < 45);

      draw();

      if (lemonState.lemons >= 20) {
        lemonState.running = false;
        showGameNotice({ title: 'Boa apanha!', onNext: () => completeGame(3) });
        return;
      }
      if (lemonState.rocks >= 5) {
        lemonState.running = false;
        showGameNotice({
          title: 'Os caranguejos venceram!',
          btnLabel: 'Reiniciar',
          onNext: () => {
            lemonState.lemons = 0;
            lemonState.rocks = 0;
            lemonState.items = [];
            lemonState.popups = [];
            lemonState.lastSpawn = 0;
            scoreEl.textContent = 0;
            rockEl.textContent = 0;
            lemonState.running = true;
            lemonState.rafId = requestAnimationFrame(loop);
          }
        });
        return;
      }

      lemonState.rafId = requestAnimationFrame(loop);
    }

    // control: just move the mouse or finger over the water — no buttons
    canvas.onpointermove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const scale = canvas.width / rect.width;
      lemonState.boatX = Math.max(66, Math.min(canvas.width - 66, (e.clientX - rect.left) * scale));
    };

    draw(); // paint the boat immediately, before the intro popup is dismissed
    showGameNotice({
      title: 'Apanha-Limões',
      subtitle: 'Move o barco e apanha 20 limões. Cuidado com os caranguejos.',
      btnLabel: 'Começar',
      onNext: () => { lemonState.rafId = requestAnimationFrame(loop); }
    });
  }

  /* =======================================================================
     GAME 3 — Memory Tiles
     ======================================================================= */
  const MEMORY_ICONS = ['lemon.png', 'olive.png', 'boat.png', 'redheart.png', 'sun.png', 'seagul.png', 'ancor.png', 'carangueijo.png', 'stars.png', 'wine.png'];
  let memoryState = null;

  function initMemory() {
    const done = store.getInt(STORAGE_KEYS.gamesDone, 0);
    if (done >= 4) return;

    const grid = document.getElementById('memory-grid');
    const msg = document.getElementById('memory-message');
    msg.textContent = '';
    grid.innerHTML = '';

    const deck = shuffle([...MEMORY_ICONS, ...MEMORY_ICONS]);
    memoryState = { flipped: [], matched: 0, locked: false };

    deck.forEach((icon, i) => {
      const card = document.createElement('div');
      card.className = 'memory-card';
      card.dataset.icon = icon;
      card.dataset.index = i;
      card.innerHTML = `
        <div class="memory-card-inner">
          <div class="memory-face back"><div class="memory-back-medallion"><img src="shell.png" alt=""></div></div>
          <div class="memory-face front"><img src="${icon}" class="memory-icon-img" alt=""></div>
        </div>`;
      card.addEventListener('click', () => flipMemoryCard(card));
      grid.appendChild(card);
    });

    // "Jogo da Memória" intro popup — blocks the board until "Começar"
    showGameNotice({
      title: 'Jogo da Memória',
      subtitle: 'Encontra todos os pares.',
      btnLabel: 'Começar',
      onNext: () => {}
    });
  }

  function flipMemoryCard(card) {
    if (memoryState.locked) return;
    if (card.classList.contains('flipped') || card.classList.contains('matched')) return;
    card.classList.add('flipped');
    memoryState.flipped.push(card);

    if (memoryState.flipped.length === 2) {
      memoryState.locked = true;
      const [a, b] = memoryState.flipped;
      if (a.dataset.icon === b.dataset.icon) {
        a.classList.add('matched'); b.classList.add('matched');
        memoryState.matched++;
        memoryState.flipped = [];
        memoryState.locked = false;
        if (memoryState.matched === MEMORY_ICONS.length) {
          showGameNotice({ title: 'Boaaaa!', onNext: () => completeGame(4) });
        }
      } else {
        setTimeout(() => {
          a.classList.remove('flipped'); b.classList.remove('flipped');
          memoryState.flipped = [];
          memoryState.locked = false;
        }, 800);
      }
    }
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* =======================================================================
     GAME 4 — Endless Runner (Seagull)
     ======================================================================= */
  let runnerState = null;

  function initRunner() {
    const done = store.getInt(STORAGE_KEYS.gamesDone, 0);
    if (done >= 5) return;
    if (runnerState && runnerState.rafId) cancelAnimationFrame(runnerState.rafId);

    const canvas = document.getElementById('runner-canvas');
    const ctx = canvas.getContext('2d');
    const scoreEl = document.getElementById('runner-score');
    const msg = document.getElementById('runner-message');
    msg.textContent = '';

    runnerState = {
      birdY: canvas.height / 2,
      vy: 0,
      score: 0,
      obstacles: [],
      lastSpawn: 0,
      running: true,
      rafId: null
    };

    function spawn() {
      const kind = Math.random() < 0.5 ? 'bad' : 'good';
      const sprite = kind === 'bad' ? 'crab' : 'heart';
      runnerState.obstacles.push({
        x: canvas.width + 20,
        y: 30 + Math.random() * (canvas.height - 60),
        kind,
        sprite
      });
    }

    function flap() {
      if (document.getElementById('game-notice').classList.contains('active')) return;
      runnerState.vy = -6.2;
    }
    function keyFlap(e) { if (e.code === 'Space') { e.preventDefault(); flap(); } }
    document.addEventListener('keydown', keyFlap);
    canvas.onpointerdown = flap;
    runnerState.cleanup = () => document.removeEventListener('keydown', keyFlap);

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(0, canvas.height - 30, canvas.width, 30);
      if (IMAGES.seagull.complete && IMAGES.seagull.naturalWidth) {
        const w = 44, h = w * (IMAGES.seagull.naturalHeight / IMAGES.seagull.naturalWidth);
        ctx.drawImage(IMAGES.seagull, 60 - w / 2, runnerState.birdY - h / 2, w, h);
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(60, runnerState.birdY, 15, 0, Math.PI * 2);
        ctx.fill();
      }
      runnerState.obstacles.forEach(o => {
        const img = IMAGES[o.sprite];
        if (img.complete && img.naturalWidth) {
          const w = 38, h = w * (img.naturalHeight / img.naturalWidth);
          ctx.drawImage(img, o.x - w / 2, o.y - h / 2, w, h);
        } else {
          ctx.fillStyle = o.kind === 'good' ? '#e2725b' : '#5c6a44';
          ctx.beginPath();
          ctx.arc(o.x, o.y, 15, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

    function loop(ts) {
      if (!runnerState.running) return;
      if (!runnerState.lastSpawn) runnerState.lastSpawn = ts;
      if (ts - runnerState.lastSpawn > 900) { spawn(); runnerState.lastSpawn = ts; }

      runnerState.vy += 0.28; // gravity
      runnerState.birdY += runnerState.vy;
      runnerState.birdY = Math.max(16, Math.min(canvas.height - 20, runnerState.birdY));

      runnerState.obstacles.forEach(o => o.x -= 3.4);
      runnerState.obstacles = runnerState.obstacles.filter(o => {
        const hit = o.x < 80 && o.x > 40 && Math.abs(o.y - runnerState.birdY) < 26;
        if (hit) {
          if (o.kind === 'good') {
            runnerState.score++;
            scoreEl.textContent = runnerState.score;
          } else {
            // gentle penalty: bump the bird back, no full reset (keeps it easy)
            runnerState.score = Math.max(0, runnerState.score - 1);
            scoreEl.textContent = runnerState.score;
          }
          return false;
        }
        return o.x > -20;
      });

      draw();

      if (runnerState.score >= 8) {
        runnerState.running = false;
        if (runnerState.cleanup) runnerState.cleanup();
        showGameNotice({ title: 'Voou lindamente!', onNext: () => completeGame(5) });
        return;
      }

      runnerState.rafId = requestAnimationFrame(loop);
    }

    draw(); // paint the seagull immediately, before the intro popup is dismissed
    showGameNotice({
      title: 'Voo da Gaivota',
      subtitle: 'Toca ou carrega em espaço para voar. Só precisas de apanhar um bocadinho de corações — evita os caranguejos.',
      btnLabel: 'Começar',
      onNext: () => { runnerState.rafId = requestAnimationFrame(loop); }
    });
  }

  /* =======================================================================
     GAME 5 — Pack the Bag
     ======================================================================= */
  const CORRECT_ITEMS = [
    { id: 'converse', label: 'All Star brancos', icon: 'allStars.png' },
    { id: 'swimsuit', label: 'Calção de banho', icon: 'bathingShorts.png' },
    { id: 'sunscreen', label: 'Protetor solar', icon: 'sunScreen.png' },
    { id: 'towel', label: 'Toalha', icon: 'towel.png' },
    { id: 'water', label: 'Garrafa de água', icon: 'waterBottle.png' },
    { id: 'cash', label: 'Dinheiro', icon: 'money.png' },
    { id: 'tshirt', label: 'T-shirt preta', icon: 'blackTshirt.png' },
    { id: 'shorts', label: 'Calções', icon: 'shorts.png' },
    { id: 'flipflop', label: 'Chinelos', icon: 'flipflop.png' },
    { id: 'jacket', label: 'Casaco leve', icon: 'casacoLeve.png' },
    { id: 'phone', label: 'Telemóvel', icon: 'phone.png' },
    { id: 'instax', label: 'Instax Square', icon: 'instax.png' }
  ];
  const WRONG_ITEMS = [
    { id: 'ski', label: 'Óculos de esqui', icon: 'skiGlasses.png' },
    { id: 'bible', label: 'Bíblia', icon: 'bible.png' },
    { id: 'tent', label: 'Tenda de campismo', icon: 'campingTent.png' },
    { id: 'guitar', label: 'Guitarra elétrica', icon: 'eletricGuitar.png' },
    { id: 'astronaut', label: 'Fato de astronauta', icon: 'astaunaultSuit.png' },
    { id: 'dryer', label: 'Secador de cabelo', icon: 'hairdier.png' },
    { id: 'helmet', label: 'Capacete de mota', icon: 'capaceteMota.png' },
    { id: 'bear', label: 'Ursinho de peluche', icon: 'careBear.png' },
    { id: 'spidey', label: 'Boneco do Homem-Aranha', icon: 'spidey.png' },
    { id: 'palmtree', label: 'Palmeira', icon: 'palmtree.png' }
  ];

  let packState = null;

  function initPackBag() {
    const done = store.getInt(STORAGE_KEYS.gamesDone, 0);
    if (done >= 1) return;

    const scatter = document.getElementById('pack-scatter');
    const bag = document.getElementById('pack-bag');
    const bagItems = document.getElementById('pack-bag-items');
    scatter.querySelectorAll('.pack-item').forEach(el => el.remove());
    bagItems.innerHTML = '';

    packState = { packed: new Set() };

    // Scatter every item in an ellipse all the way around the bag, sized
    // from the box's REAL rendered dimensions (not a fixed guess) — that's
    // what keeps this correct on any phone. Width follows the screen;
    // height is the fixed 640px from CSS, which is generous even on narrow
    // phones — the ellipse leans on that extra vertical room instead of
    // overflowing sideways. Positions are clamped at the end as a safety
    // net so nothing can ever land outside the visible box.
    const allItems = shuffle([...CORRECT_ITEMS, ...WRONG_ITEMS]);
    const itemSize = 80, half = itemSize / 2;
    const rect = scatter.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height / 2;
    const bagHalfW = bag.offsetWidth / 2 + 30;
    const bagHalfH = bag.offsetHeight / 2 + 30;
    const maxRadiusX = Math.max(bagHalfW + 20, rect.width / 2 - half - 6);
    const maxRadiusY = Math.max(bagHalfH + 20, rect.height / 2 - half - 6);

    // On phones the bag is so wide relative to the screen that an ellipse
    // all the way around it leaves almost no room to the sides — items get
    // squeezed against the bag's edges. So on narrow screens only, split
    // the items into two bands above and below the bag instead, spread
    // across the full width. Desktop keeps the original all-around ellipse.
    const isMobileLayout = window.innerWidth <= 640;
    const topBandBottom = Math.max(6, cy - bagHalfH - half - 10);
    const bottomBandTop = Math.min(rect.height - itemSize - 6, cy + bagHalfH + 10);
    const bottomBandHeight = Math.max(0, rect.height - itemSize - 6 - bottomBandTop);
    const perBand = Math.ceil(allItems.length / 2);

    allItems.forEach((item, i) => {
      const el = document.createElement('div');
      el.className = 'pack-item';
      el.innerHTML = `<img src="${item.icon}" alt="${item.label}">`;
      el.title = item.label;
      el.dataset.id = item.id;
      el.dataset.correct = CORRECT_ITEMS.some(c => c.id === item.id) ? '1' : '0';

      let x, y;
      if (isMobileLayout) {
        const inTop = i % 2 === 0;
        const bandIndex = Math.floor(i / 2);
        const cols = Math.ceil(perBand);
        const colWidth = rect.width / cols;
        x = colWidth * bandIndex + (colWidth - itemSize) / 2 + (Math.random() * 16 - 8);
        y = inTop
          ? Math.random() * topBandBottom
          : bottomBandTop + Math.random() * bottomBandHeight;
      } else {
        const angle = i * 137.508 * (Math.PI / 180);
        const t = i / (allItems.length - 1);
        const radiusX = bagHalfW + t * (maxRadiusX - bagHalfW) + (Math.random() * 16 - 8);
        const radiusY = bagHalfH + t * (maxRadiusY - bagHalfH) + (Math.random() * 16 - 8);
        x = cx + radiusX * Math.cos(angle) - half;
        y = cy + radiusY * Math.sin(angle) - half;
      }
      x = Math.max(0, Math.min(rect.width - itemSize, x));
      y = Math.max(0, Math.min(rect.height - itemSize, y));
      const rotation = (Math.random() * 16 - 8).toFixed(1);
      el.dataset.rotation = rotation;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.transform = `rotate(${rotation}deg)`;

      makeDraggable(el, item);
      scatter.appendChild(el);
    });

    // Custom drag, driven by Pointer Events — works with mouse, touch and
    // pen alike (HTML5's native drag-and-drop doesn't work on touch on
    // most mobile browsers, which is why items couldn't be dragged there).
    function makeDraggable(el, item) {
      let startX, startY, dx, dy, moved;

      el.addEventListener('pointerdown', (e) => {
        if (packState.packed.has(item.id)) return;
        e.preventDefault();
        startX = e.clientX; startY = e.clientY;
        dx = 0; dy = 0; moved = false;
        el.setPointerCapture(e.pointerId);
        el.classList.add('dragging');
      });

      el.addEventListener('pointermove', (e) => {
        if (!el.classList.contains('dragging')) return;
        dx = e.clientX - startX; dy = e.clientY - startY;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
        el.style.transform = `translate(${dx}px, ${dy}px) rotate(${el.dataset.rotation}deg)`;
        const bagRect = bag.getBoundingClientRect();
        const over = e.clientX >= bagRect.left && e.clientX <= bagRect.right &&
          e.clientY >= bagRect.top && e.clientY <= bagRect.bottom;
        bag.classList.toggle('drag-over', over);
      });

      el.addEventListener('pointerup', (e) => {
        if (!el.classList.contains('dragging')) return;
        el.classList.remove('dragging');
        bag.classList.remove('drag-over');
        const bagRect = bag.getBoundingClientRect();
        const overBag = e.clientX >= bagRect.left && e.clientX <= bagRect.right &&
          e.clientY >= bagRect.top && e.clientY <= bagRect.bottom;

        if (!moved || overBag) {
          // a tap (no movement) or a real drop on the bag — both pack it
          tryPack(item, el, moved ? e : null);
        }
        // snap back to its spot if dropped outside the bag without packing
        el.style.transform = `rotate(${el.dataset.rotation}deg)`;
      });
    }

    function tryPack(item, el, dropEvent) {
      if (packState.packed.has(item.id)) return;
      const isCorrect = CORRECT_ITEMS.some(c => c.id === item.id);
      if (!isCorrect) {
        el.classList.add('wrong-shake');
        showToast(`"${item.label}" não pertence à mala...`);
        setTimeout(() => el.classList.remove('wrong-shake'), 400);
        return;
      }
      packState.packed.add(item.id);
      el.remove();
      const bagEl = document.createElement('div');
      bagEl.className = 'pack-item';
      bagEl.innerHTML = `<img src="${item.icon}" alt="${item.label}">`;
      bagEl.title = item.label;

      // land exactly where it was dropped, instead of snapping into a tidy
      // row — clamped so it stays inside the bag's box
      const rect = bagItems.getBoundingClientRect();
      const itemSize = 60;
      let x, y;
      if (dropEvent) {
        x = dropEvent.clientX - rect.left - itemSize / 2;
        y = dropEvent.clientY - rect.top - itemSize / 2;
      } else {
        // tap-to-pack has no drop point — scatter it randomly inside instead
        x = Math.random() * (rect.width - itemSize);
        y = Math.random() * (rect.height - itemSize);
      }
      x = Math.max(0, Math.min(rect.width - itemSize, x));
      y = Math.max(0, Math.min(rect.height - itemSize, y));
      bagEl.style.left = `${x}px`;
      bagEl.style.top = `${y}px`;
      bagEl.style.transform = `rotate(${(Math.random() * 20 - 10).toFixed(1)}deg)`;

      bagItems.appendChild(bagEl);

      if (packState.packed.size === CORRECT_ITEMS.length) {
        showGameNotice({ title: 'Mala feita!', onNext: () => completeGame(1) });
      }
    }

    showGameNotice({
      title: 'Faz a Mala',
      subtitle: 'Arrasta apenas o que faz sentido levar para o passeio. (No telemóvel: toca no item para o colocar na mala.)',
      btnLabel: 'Começar',
      onNext: () => {}
    });
  }

  /* =======================================================================
     CONTENT SCREEN (unlocked after all games / password)
     ======================================================================= */
  let timelineInit = false;

  // Add more photos here whenever there are more — the gallery re-shuffles
  // its order automatically, no other change needed.
  const BERLENGAS_PHOTOS = [
    'berlengas1.jpg', 'berlengas2.jpg', 'berlengas3.jpg', 'berlengas4.jpg',
    'berlengas5.jpg', 'berlengas6.jpg', 'berlengas7.jpg', 'berlengas8.jpg'
  ];

  function renderContentScreen() {
    // packing list, reusing the same CORRECT_ITEMS defined above
    const list = document.getElementById('packing-list-final');
    if (list && !list.dataset.rendered) {
      list.innerHTML = CORRECT_ITEMS.map(i => `<img src="${i.icon}" alt="${i.label}" title="${i.label}">`).join('');
      list.dataset.rendered = '1';
    }

    // Berlengas photo gallery, shuffled — click a photo to see it bigger
    const gallery = document.getElementById('berlengas-gallery');
    if (gallery && !gallery.dataset.rendered) {
      gallery.innerHTML = shuffle(BERLENGAS_PHOTOS)
        .map(src => `<img src="${src}" alt="Berlengas">`).join('');
      gallery.dataset.rendered = '1';

      const lightbox = document.getElementById('lightbox');
      const lightboxImg = document.getElementById('lightbox-img');
      gallery.querySelectorAll('img').forEach(img => {
        img.addEventListener('click', () => {
          lightboxImg.src = img.src;
          lightbox.classList.add('active');
        });
      });
      lightbox.addEventListener('click', () => lightbox.classList.remove('active'));
    }

    // interactive timeline (expand on click)
    if (!timelineInit) {
      document.querySelectorAll('.timeline-item').forEach(item => {
        item.querySelector('.tl-body').addEventListener('click', () => {
          item.classList.toggle('open');
        });
      });
      timelineInit = true;
    }
  }

  /* =======================================================================
     Go!
     ======================================================================= */
  boot();

})();
