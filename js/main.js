/* main.js — screen/state management and UI wiring */

const Screens = {
  show(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  },
  showModal(id) {
    document.getElementById(id).classList.add('active');
  },
  hideModal(id) {
    document.getElementById(id).classList.remove('active');
  }
};

let currentSettings = Storage.getSettings();
let currentLevelIndex = 0;

function applySettingsToUI() {
  document.getElementById('setting-music').value = currentSettings.music;
  document.getElementById('setting-sfx').value = currentSettings.sfx;
  document.getElementById('setting-difficulty').value = currentSettings.difficulty;
}

function persistSettings() {
  Storage.saveSettings(currentSettings);
  AudioFX.applyVolumes(currentSettings);
}

/* ---------- Loading screen -> Game ---------- */
function goToLoading() {
  Screens.show('screen-loading');
  const bar = document.getElementById('loading-bar');
  const label = document.getElementById('loading-label');
  bar.style.width = '0%';
  let pct = 0;
  const iv = setInterval(() => {
    pct += 8 + Math.random() * 10;
    if (pct >= 100) {
      pct = 100;
      clearInterval(iv);
      label.textContent = 'READY!';
      setTimeout(startGame, 250);
    }
    bar.style.width = pct + '%';
  }, 110);
}

async function startGame() {
  Screens.show('screen-game');
  currentSettings = Storage.getSettings();
  const level = LEVELS[currentLevelIndex];
  Game.destroy();
  Game.init(level, currentSettings, currentLevelIndex);
  document.getElementById('hud-hint-text').textContent =
    `Find all ${level.hazards.length} hazards within the time limit, then choose the right response. Click any hazard, anytime, in any order. Drag to look around, W/S to walk, A/D to turn, or click the floor to walk there.`;
  // Swap in a fresh, listener-free container each run so replays don't
  // stack duplicate click handlers on the old node.
  const old = document.getElementById('panorama-container');
  const container = old.cloneNode(false);
  old.parentNode.replaceChild(container, old);
  await Game.start(container);
  showIntroOverlay();
}

/* ---------- Level select ---------- */
function renderLevelSelect() {
  const grid = document.getElementById('level-grid');
  grid.innerHTML = '';
  const unlocked = Storage.getUnlockedLevelIndex();
  const passed = Storage.getPassedLevels();
  LEVELS.forEach((level, i) => {
    const isLocked = i > unlocked;
    const isPassed = passed.includes(level.id);
    const best = Storage.getBestScore(level.id);
    const card = document.createElement('button');
    card.className = 'level-card' + (isLocked ? ' locked' : '') + (isPassed ? ' passed' : '');
    card.disabled = isLocked;
    card.innerHTML = `
      <div class="level-card-num">${isLocked ? '🔒' : isPassed ? '✔' : i + 1}</div>
      <div class="level-card-name">${level.name}</div>
      <div class="level-card-meta">${level.hazards.length} hazards · pass with ${level.passMinFound}+</div>
      <div class="level-card-best">Best Score<br /><strong>${best != null ? best : '–'}</strong></div>
    `;
    if (!isLocked) {
      card.addEventListener('click', () => {
        AudioFX.click();
        currentLevelIndex = i;
        goToLoading();
      });
    }
    grid.appendChild(card);
  });
}

/* ---------- Mentor guide ---------- */
function mentorSay(msg) {
  const bubble = document.getElementById('mentor-bubble');
  if (!bubble) return;
  bubble.classList.remove('show');
  clearTimeout(mentorSay._h);
  mentorSay._h = setTimeout(() => {
    bubble.textContent = msg;
    bubble.classList.add('show');
  }, 120);
}

/* ---------- Safe Room overlay ---------- */
function showIntroOverlay() {
  document.getElementById('intro-overlay').classList.add('active');
  document.getElementById('begin-bar').classList.remove('active');
  mentorSay("Hi, I'm your supervisor. Before your first shift, look around this hazard-free room — or skip straight to the exercise.");
}

function skipIntro() {
  AudioFX.click();
  document.getElementById('intro-overlay').classList.remove('active');
  document.getElementById('begin-bar').classList.remove('active');
  Game.beginTraining();
  mentorSay('Alright, hazards are live now. Click any hazard, anytime — just watch the clock.');
  showToastGlobal('Hazards are live. Find them before time runs out!');
}

function lookAroundFirst() {
  AudioFX.click();
  document.getElementById('intro-overlay').classList.remove('active');
  document.getElementById('begin-bar').classList.add('active');
  mentorSay('Take your time. Notice the racking, the forklift, the fire exit — this is what "normal" looks like. Tap Begin when ready.');
}

function beginFromBar() {
  AudioFX.click();
  document.getElementById('begin-bar').classList.remove('active');
  Game.beginTraining();
  mentorSay('Alright, hazards are live now. Click any hazard, anytime — just watch the clock.');
  showToastGlobal('Hazards are live. Find them before time runs out!');
}

/* ---------- Fix-It modal ---------- */
function showFixIt(hazard) {
  const overlay = document.getElementById('fixit-overlay');
  document.getElementById('fixit-hazard-title').textContent = hazard.title;
  document.getElementById('fixit-hazard-desc').textContent = hazard.description;

  const btnsWrap = document.getElementById('fixit-options');
  btnsWrap.innerHTML = '';
  FIX_OPTIONS.forEach((label, i) => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-secondary fixit-option';
    btn.textContent = label;
    btn.addEventListener('click', () => {
      overlay.classList.remove('active');
      Game.chooseFix(i);
    });
    btnsWrap.appendChild(btn);
  });

  overlay.classList.add('active');
}

/* ---------- Results ---------- */
function showResults(result) {
  Screens.show('screen-results');

  const stars = result.passed
    ? (result.foundCount === result.totalHazards && result.fixWrong === 0 ? 3
      : result.foundCount === result.totalHazards ? 2 : 1)
    : 0;

  const pctEl = document.getElementById('results-pct');
  const pct = Math.round((result.foundCount / result.totalHazards) * 100);
  if (pctEl) pctEl.textContent = `${pct}%`;

  document.querySelectorAll('#results-stars .star').forEach((s) => {
    s.classList.toggle('lit', parseInt(s.dataset.i, 10) <= stars);
  });

  document.getElementById('results-title').textContent = result.passed
    ? (stars === 3 ? 'EXCELLENT WORK — LEVEL PASSED!' : 'LEVEL PASSED!')
    : 'NOT ENOUGH HAZARDS CAUGHT — REPLAY';
  document.getElementById('results-sub').textContent = result.passed
    ? `You resolved ${result.foundCount} of ${result.totalHazards} hazards (needed ${result.passMinFound}+ to pass).`
    : `You only resolved ${result.foundCount} of ${result.totalHazards} hazards — you need at least ${result.passMinFound} to move on. Try again!`;

  const phasesEl = document.getElementById('score-phases');
  phasesEl.innerHTML = '';
  for (let p = 1; p <= result.phaseCount; p++) {
    const row = document.createElement('div');
    row.className = 'score-row';
    row.innerHTML = `<span>${(typeof PHASE_LABELS !== 'undefined' && PHASE_LABELS[p]) || 'Phase ' + p}</span><span class="pos">+${result.phaseScores[p] || 0}</span>`;
    phasesEl.appendChild(row);
  }
  const phaseDivider = document.createElement('div');
  phaseDivider.className = 'score-divider';
  phasesEl.appendChild(phaseDivider);

  document.getElementById('score-early-label').textContent = `Hazards found (${result.foundCount} x 10)`;
  document.getElementById('score-early').textContent = `+${result.foundCount * 10}`;
  document.getElementById('score-fixcorrect-label').textContent = `Correct fix chosen (${result.fixCorrect} x 5)`;
  document.getElementById('score-fixcorrect').textContent = `+${result.fixCorrect * 5}`;
  document.getElementById('score-fixwrong-label').textContent = `Wrong fix chosen (${result.fixWrong} x -3)`;
  document.getElementById('score-fixwrong').textContent = `-${result.fixWrong * 3}`;
  document.getElementById('score-time-label').textContent = 'Completion bonus (all found, before time out)';
  document.getElementById('score-time').textContent = `+${result.completionBonus}`;
  document.getElementById('score-total').textContent = result.total;

  const replayBtn = document.getElementById('btn-replay-level');
  replayBtn.classList.toggle('btn-primary', !result.passed);
  replayBtn.classList.toggle('btn-secondary', result.passed);
  replayBtn.textContent = result.passed ? 'PLAY AGAIN' : 'REPLAY LEVEL';

  const nextBtn = document.getElementById('btn-next-level');
  nextBtn.style.display = result.hasNextLevel ? 'block' : 'none';
  const menuBtn = document.getElementById('btn-back-to-menu');
  menuBtn.classList.toggle('btn-primary', !result.hasNextLevel);
  menuBtn.classList.toggle('btn-secondary', result.hasNextLevel);
}

/* ---------- Wiring ---------- */
document.addEventListener('DOMContentLoaded', () => {
  AudioFX.init();
  applySettingsToUI();
  Leaderboard.render();

  const levelsEl = document.getElementById('footer-levels');
  if (levelsEl && typeof LEVELS !== 'undefined') {
    levelsEl.textContent = `${LEVELS.length} LEVEL${LEVELS.length === 1 ? '' : 'S'}`;
  }
  const howtoMin = document.getElementById('howto-pass-min');
  if (howtoMin) howtoMin.textContent = LEVELS[0].passMinFound;

  // Main menu
  document.getElementById('btn-play').addEventListener('click', () => {
    AudioFX.click();
    renderLevelSelect();
    Screens.show('screen-levels');
  });
  document.getElementById('btn-levels-back').addEventListener('click', () => {
    AudioFX.click();
    Screens.show('screen-menu');
  });
  document.getElementById('btn-how-to-play').addEventListener('click', () => {
    AudioFX.click();
    Screens.showModal('screen-howtoplay');
  });
  document.getElementById('btn-settings').addEventListener('click', () => {
    AudioFX.click();
    applySettingsToUI();
    Screens.showModal('screen-settings');
  });
  document.getElementById('btn-leaderboards').addEventListener('click', () => {
    AudioFX.click();
    Leaderboard.setTab('week');
    Screens.showModal('screen-leaderboard');
  });
  document.getElementById('btn-safety-tips').addEventListener('click', () => {
    AudioFX.click();
    Screens.showModal('screen-safety-tips');
  });

  // Modal close buttons
  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => Screens.hideModal(btn.dataset.close));
  });

  // Settings
  document.getElementById('setting-music').addEventListener('input', (e) => {
    currentSettings.music = parseInt(e.target.value, 10);
    persistSettings();
  });
  document.getElementById('setting-sfx').addEventListener('input', (e) => {
    currentSettings.sfx = parseInt(e.target.value, 10);
    persistSettings();
    AudioFX.click();
  });
  document.getElementById('setting-difficulty').addEventListener('change', (e) => {
    currentSettings.difficulty = e.target.value;
    persistSettings();
  });
  document.getElementById('btn-reset-progress').addEventListener('click', () => {
    if (confirm('Reset all progress and leaderboard scores? This cannot be undone.')) {
      Storage.resetProgress();
      currentSettings = Storage.getSettings();
      applySettingsToUI();
      Leaderboard.render();
      showToastGlobal('Progress reset.');
    }
  });

  // Leaderboard tabs
  document.querySelectorAll('.tab-btn').forEach((b) => {
    b.addEventListener('click', () => Leaderboard.setTab(b.dataset.tab));
  });

  // Safe Room overlay
  document.getElementById('btn-intro-skip').addEventListener('click', skipIntro);
  document.getElementById('btn-intro-look').addEventListener('click', lookAroundFirst);
  document.getElementById('btn-begin').addEventListener('click', beginFromBar);

  // In-game menu / pause
  document.getElementById('btn-game-menu').addEventListener('click', () => {
    if (Game.viewer) {
      Game.viewer.keys.forward = false;
      Game.viewer.keys.backward = false;
      Game.viewer.keys.turnLeft = false;
      Game.viewer.keys.turnRight = false;
    }
    Screens.showModal('screen-pause');
  });
  document.getElementById('btn-resume').addEventListener('click', () => {
    Screens.hideModal('screen-pause');
  });
  document.getElementById('btn-restart-level').addEventListener('click', () => {
    Screens.hideModal('screen-pause');
    goToLoading();
  });
  document.getElementById('btn-quit-to-menu').addEventListener('click', () => {
    Screens.hideModal('screen-pause');
    Game.destroy();
    Screens.show('screen-menu');
  });
  document.getElementById('btn-hint').addEventListener('click', () => Game.useHint());

  // Results
  document.getElementById('btn-replay-level').addEventListener('click', () => {
    AudioFX.click();
    goToLoading();
  });
  document.getElementById('btn-next-level').addEventListener('click', () => {
    AudioFX.click();
    currentLevelIndex += 1;
    goToLoading();
  });
  document.getElementById('btn-back-to-menu').addEventListener('click', () => {
    AudioFX.click();
    Leaderboard.render();
    Screens.show('screen-menu');
  });
});

function showToastGlobal(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show';
  clearTimeout(showToastGlobal._h);
  showToastGlobal._h = setTimeout(() => t.classList.remove('show'), 1800);
}
