/* game.js — runs one play-through of a level in the real 3D warehouse.

   Flow per level:
   1. Safe Room — hazard-free view, no timer, Skip/Look Around
      (main.js shows the overlay; Game.beginTraining() ends it).
   2. Live scene — every hazard is clickable anytime, in any order,
      with no timer or urgency per hazard. Just an overall countdown
      for the whole level (level.timeLimit).
   3. Spot It, Then Fix It — after clicking a hazard, the player must
      pick the correct real-world response (main.js shows the Fix-It
      modal; Game.chooseFix(i) resolves it — right answer = bonus,
      wrong = penalty).
   4. Level ends when every hazard is found, or the level's time runs
      out. Passing needs at least `level.passMinFound` hazards found —
      otherwise the level is replayed. */

const Game = {
  viewer: null,
  level: null,
  settings: null,
  diff: null,
  container: null,

  score: 0,
  hazardStatus: {},   // id -> 'pending' | 'spotted' | 'found'
  fixCorrect: 0,
  fixWrong: 0,
  pendingSpot: null,  // { hazard } awaiting a fix choice
  completedPhases: new Set(),
  phaseScores: {},
  timeLeft: 80,
  timerHandle: null,
  ended: false,
  introMode: true,
  keydownHandler: null,
  keyupHandler: null,

  init(level, settings, levelIndex) {
    this.level = level;
    this.levelIndex = levelIndex || 0;
    this.settings = settings;
    this.diff = DIFFICULTY_SETTINGS[settings.difficulty] || DIFFICULTY_SETTINGS.normal;
    this.score = 0;
    this.hazardStatus = {};
    this.fixCorrect = 0;
    this.fixWrong = 0;
    this.pendingSpot = null;
    this.completedPhases = new Set();
    this.phaseScores = {};
    for (let p = 1; p <= level.phaseCount; p++) this.phaseScores[p] = 0;
    level.hazards.forEach((h) => { this.hazardStatus[h.id] = 'pending'; });
    const baseTime = level.timeLimit || parseInt(settings.timer, 10) || 80;
    // Client feedback (17 Sep): difficulty now changes the time limit (Easy 1.5x, Normal 1x, Hard 0.75x).
    this.timeLimit = Math.round(baseTime * (this.diff.timeFactor || 1));
    this.timeLeft = this.timeLimit;
    this.ended = false;
    this.introMode = true;
  },

  async start(container) {
    this.container = container;
    this.viewer = new Warehouse3D(container);
    this.viewer.moveSpeed = this.diff.moveSpeed;
    this.viewer.turnSpeed = this.diff.turnSpeed;
    this.viewer.onHazardClick = (id) => this._onHazardClick(id);
    this.viewer.onWrongClick = () => this._registerWrong();
    this.viewer.onFootstep = () => AudioFX.footstep();
    this.viewer.build(this.level, this.level.world);

    // Start in the Safe Room: hazards hidden, no timer, free look-around.
    this.viewer.setSafeRoom(true);

    this._bindKeyboard();
    this.viewer.start();
    this._updateHud();
  },

  /** Called when the player skips or finishes the Safe Room.
   *  Switches on hazards (clickable anytime) and starts the level timer. */
  beginTraining() {
    if (!this.introMode || this.ended) return;
    this.introMode = false;
    this.viewer.setSafeRoom(false);
    this._tick();
    this._updateHud();
  },

  _bindKeyboard() {
    const setKey = (key, active) => {
      if (!this.viewer) return;
      switch (key) {
        case 'w': case 'arrowup': this.viewer.keys.forward = active; break;
        case 's': case 'arrowdown': this.viewer.keys.backward = active; break;
        case 'a': case 'arrowleft': this.viewer.keys.turnLeft = active; break;
        case 'd': case 'arrowright': this.viewer.keys.turnRight = active; break;
      }
    };

    this.keydownHandler = (e) => {
      if (this.ended) return;
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (document.querySelector('.modal-screen.active, .overlay-panel.active')) return;
      const k = e.key.toLowerCase();
      if (['w', 's', 'a', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        setKey(k, true);
        e.preventDefault();
      }
    };
    this.keyupHandler = (e) => setKey(e.key.toLowerCase(), false);

    window.addEventListener('keydown', this.keydownHandler);
    window.addEventListener('keyup', this.keyupHandler);
  },

  _unbindKeyboard() {
    if (this.keydownHandler) window.removeEventListener('keydown', this.keydownHandler);
    if (this.keyupHandler) window.removeEventListener('keyup', this.keyupHandler);
    this.keydownHandler = null;
    this.keyupHandler = null;
  },

  _tick() {
    clearInterval(this.timerHandle);
    this.timerHandle = setInterval(() => {
      if (this.ended) return;
      this.timeLeft -= 1;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this._updateHud();
        this._end(false);
        return;
      }
      this._updateHud();
    }, 1000);
  },

  /* ---------- spotting + fixing ---------- */

  _onHazardClick(hazardId) {
    if (this.ended || this.introMode) return;
    if (this.pendingSpot) return; // already resolving a Fix-It choice
    if (this.hazardStatus[hazardId] !== 'pending') return;
    const hazard = this.level.hazards.find((h) => h.id === hazardId);
    if (!hazard) return;

    this.hazardStatus[hazardId] = 'spotted';
    this.score += 10;
    this.phaseScores[hazard.phase] = (this.phaseScores[hazard.phase] || 0) + 10;
    AudioFX.correct();
    this._updateHud();
    showStatus('info', `Hazard spotted: ${hazard.title}`, 'Now choose the correct response (+10)');

    // Freeze the 3D scene's own input while the Fix-It choice is open —
    // stops walking, dragging, or clicking other things from interfering.
    this.viewer.locked = true;
    this.viewer.keys.forward = false;
    this.viewer.keys.backward = false;
    this.viewer.keys.turnLeft = false;
    this.viewer.keys.turnRight = false;

    this.pendingSpot = { hazard };
    if (typeof mentorSay === 'function') {
      mentorSay("Good catch. Now — what's the right response?");
    }
    if (typeof showFixIt === 'function') showFixIt(hazard);
  },

  /** Called by the Fix-It modal with the index the player picked. */
  chooseFix(optionIndex) {
    if (!this.pendingSpot) return;
    const { hazard } = this.pendingSpot;
    const correct = optionIndex === hazard.correctFix;

    if (correct) {
      this.score += 5;
      this.fixCorrect += 1;
      this.phaseScores[hazard.phase] = (this.phaseScores[hazard.phase] || 0) + 5;
      AudioFX.correct();
      showToast(`✔ ${hazard.title} — correctly resolved (+5)`, 'correct');
      showStatus('correct', `Hazard resolved: ${hazard.title}`, `Correct response: ${FIX_OPTIONS[hazard.correctFix]} (+5)`);
      if (typeof mentorSay === 'function') {
        mentorSay('Exactly right — that\'s the response a real supervisor would want to see.');
      }
    } else {
      this.score = Math.max(0, this.score - 3);
      this.fixWrong += 1;
      AudioFX.wrong();
      showToast(`✘ Spotted, but wrong response for ${hazard.title} (-3)`, 'wrong');
      showStatus('wrong', `Wrong response: ${hazard.title}`, `Best response was: ${FIX_OPTIONS[hazard.correctFix]} (-3)`);
      if (typeof mentorSay === 'function') {
        mentorSay('Not quite — spotting it is only half the job. Think about what actually needs to happen next.');
      }
    }

    this.hazardStatus[hazard.id] = 'found';
    this.viewer.markFound(hazard.id);
    if (this.viewer) this.viewer.locked = false;
    this.pendingSpot = null;
    this._updateHud();
    this._checkPhaseComplete(hazard.phase);
    this._checkLevelResolved();
  },

  _checkPhaseComplete(phase) {
    if (this.completedPhases.has(phase)) return;
    const phaseHazards = this.level.hazards.filter((h) => h.phase === phase);
    const resolved = phaseHazards.every((h) => this.hazardStatus[h.id] === 'found');
    if (!resolved) return;
    this.completedPhases.add(phase);
    AudioFX.phaseComplete();
    showToast(`🏁 ${PHASE_LABELS[phase] || 'Phase ' + phase} complete — +${this.phaseScores[phase]} pts`, 'correct');
  },

  _checkLevelResolved() {
    const allFound = this.level.hazards.every((h) => this.hazardStatus[h.id] === 'found');
    if (allFound) this._end(true);
  },

  _registerWrong() {
    if (this.ended || this.introMode || this.pendingSpot) return;
    this.score = Math.max(0, this.score - this.diff.wrongPenalty);
    AudioFX.wrong();
    showToast('✘ Not a hazard there', 'wrong');
    showStatus('wrong', 'Not a hazard', `Wrong click penalty: -${this.diff.wrongPenalty}`);
    this._updateHud();
  },

  useHint() {
    if (this.ended || this.introMode || this.pendingSpot) return;
    const remaining = this.level.hazards.filter((h) => this.hazardStatus[h.id] === 'pending');
    if (remaining.length === 0) return;
    const target = remaining[0];
    this.viewer.hintLookAt(target);
    AudioFX.click();
    this.score = Math.max(0, this.score - 2);
    this._updateHud();
    showStatus('info', 'Hint used', 'The camera is turning to an undiscovered hazard (-2)');
  },

  _currentPhase() {
    for (let p = 1; p <= this.level.phaseCount; p++) {
      if (!this.completedPhases.has(p)) return p;
    }
    return this.level.phaseCount;
  },

  _updateHud() {
    document.getElementById('hud-score').textContent = this.score;
    const foundCount = this.level.hazards.filter((h) => this.hazardStatus[h.id] === 'found').length;
    document.getElementById('hud-found').textContent = `${foundCount} / ${this.level.hazards.length}`;
    document.getElementById('hud-left').textContent = this.introMode
      ? 'SAFE ROOM'
      : `LEVEL ${this.levelIndex + 1}/${(typeof LEVELS !== 'undefined' && LEVELS.length) || 1} · PHASE ${this._currentPhase()} / ${this.level.phaseCount}`;

    const banner = document.getElementById('scene-banner');
    if (banner) {
      banner.classList.toggle('safe', this.introMode);
      banner.classList.toggle('live', !this.introMode);
      banner.textContent = this.introMode ? 'SCENE A · SAFE ROOM' : 'SCENE B · FIND THE HAZARDS';
    }
    const mins = Math.floor(this.timeLeft / 60).toString().padStart(2, '0');
    const secs = (this.timeLeft % 60).toString().padStart(2, '0');
    const timerEl = document.getElementById('hud-timer');
    timerEl.textContent = this.introMode ? '--:--' : `${mins}:${secs}`;
    timerEl.parentElement.classList.toggle('warn', !this.introMode && this.timeLeft <= 15);

    const pips = document.getElementById('hud-pips');
    pips.innerHTML = '';
    this.level.hazards.forEach((h) => {
      const pip = document.createElement('div');
      pip.className = 'pip' + (this.hazardStatus[h.id] === 'found' ? ' found' : '');
      pip.textContent = h.id;
      pips.appendChild(pip);
    });
  },

  _end(resolved) {
    if (this.ended) return;
    this.ended = true;
    clearInterval(this.timerHandle);
    this._unbindKeyboard();
    // If a Fix-It choice was still open when time ran out, force-close it
    // so it can't linger on top of the results screen.
    if (this.pendingSpot) {
      const overlay = document.getElementById('fixit-overlay');
      if (overlay) overlay.classList.remove('active');
      this.pendingSpot = null;
    }
    if (this.viewer) { this.viewer.locked = false; this.viewer.stop(); }

    const totalHazards = this.level.hazards.length;
    const foundCount = this.level.hazards.filter((h) => this.hazardStatus[h.id] === 'found').length;
    const passMinFound = this.level.passMinFound || Math.ceil(totalHazards / 2);
    const passed = foundCount >= passMinFound;
    const hasNextLevel = passed && typeof LEVELS !== 'undefined' && this.levelIndex < LEVELS.length - 1;
    if (hasNextLevel) Storage.unlockLevelIndex(this.levelIndex + 1);

    const completionBonus = (foundCount === totalHazards && this.timeLeft > 0) ? 20 : 0;
    this.score += completionBonus;

    const result = {
      resolved,
      passed,
      levelIndex: this.levelIndex,
      hasNextLevel,
      foundCount,
      totalHazards,
      passMinFound,
      fixCorrect: this.fixCorrect,
      fixWrong: this.fixWrong,
      completionBonus,
      total: this.score,
      timerLimit: this.timeLimit,
      phaseScores: Object.assign({}, this.phaseScores),
      phaseCount: this.level.phaseCount
    };

    if (foundCount === totalHazards) AudioFX.win();
    Storage.addScore(Storage.getPlayerName(), this.score);
    Storage.setBestScoreIfHigher(this.level.id, this.score);
    if (passed) Storage.markLevelPassed(this.level.id);

    setTimeout(() => showResults(result), foundCount === totalHazards ? 500 : 0);
  },

  destroy() {
    clearInterval(this.timerHandle);
    this._unbindKeyboard();
    if (this.viewer) { this.viewer.destroy(); this.viewer = null; }
  }
};

function showToast(msg, kind) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + (kind || '');
  clearTimeout(showToast._h);
  showToast._h = setTimeout(() => { t.classList.remove('show'); }, 1600);
}

/* Status panel + screen flash: persistent visual feedback after every action
   (client feedback 17 Sep). Elements are created on demand. */
function showStatus(kind, title, detail) {
  let el = document.getElementById('status-panel');
  if (!el) {
    el = document.createElement('div');
    el.id = 'status-panel';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  const icon = kind === 'correct' ? '✔' : kind === 'wrong' ? '✘' : 'ℹ';
  el.className = 'status-panel show ' + kind;
  el.textContent = '';
  const t = document.createElement('div'); t.className = 'status-title'; t.textContent = `${icon} ${title}`;
  const d = document.createElement('div'); d.className = 'status-detail'; d.textContent = detail;
  el.appendChild(t); el.appendChild(d);
  clearTimeout(showStatus._h);
  showStatus._h = setTimeout(() => el.classList.remove('show'), 3500);

  if (kind !== 'info') {
    let f = document.getElementById('status-flash');
    if (!f) { f = document.createElement('div'); f.id = 'status-flash'; document.body.appendChild(f); }
    f.className = '';
    void f.offsetWidth; // restart animation
    f.className = 'flash-' + kind;
  }
}
