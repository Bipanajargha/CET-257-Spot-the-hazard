/* storage.js — localStorage helpers for settings & leaderboard */

const STH_KEYS = {
  SETTINGS: 'sth_settings',
  LEADERBOARD: 'sth_leaderboard',
  PLAYER_NAME: 'sth_player_name',
  UNLOCKED_LEVEL: 'sth_unlocked_level',
  BEST_SCORES: 'sth_best_scores',
  PASSED_LEVELS: 'sth_passed_levels'
};

const DEFAULT_SETTINGS = {
  music: 70,
  sfx: 70,
  difficulty: 'normal'
};

// Seed leaderboard so the screen isn't empty on a first run.
const DEFAULT_LEADERBOARD = [
  { name: 'SafetyStar92', score: 250, date: daysAgoISO(2) },
  { name: 'WarehousePro', score: 230, date: daysAgoISO(3) },
  { name: 'HazardHunter', score: 210, date: daysAgoISO(1) },
  { name: 'SafePlayer', score: 170, date: daysAgoISO(5) }
];

function daysAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

const Storage = {
  getSettings() {
    try {
      const raw = localStorage.getItem(STH_KEYS.SETTINGS);
      return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
    } catch (e) {
      return { ...DEFAULT_SETTINGS };
    }
  },
  saveSettings(settings) {
    localStorage.setItem(STH_KEYS.SETTINGS, JSON.stringify(settings));
  },
  getPlayerName() {
    return localStorage.getItem(STH_KEYS.PLAYER_NAME) || 'Trainee';
  },
  setPlayerName(name) {
    localStorage.setItem(STH_KEYS.PLAYER_NAME, name);
  },
  /** Highest level index (0-based) the player has unlocked so far.
   *  Level 0 (Level 1) is always available. */
  getUnlockedLevelIndex() {
    const raw = localStorage.getItem(STH_KEYS.UNLOCKED_LEVEL);
    const n = raw != null ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) ? n : 0;
  },
  unlockLevelIndex(index) {
    const current = this.getUnlockedLevelIndex();
    if (index > current) localStorage.setItem(STH_KEYS.UNLOCKED_LEVEL, String(index));
  },
  /** Best score ever recorded for a given level id, or null. */
  getBestScore(levelId) {
    try {
      const map = JSON.parse(localStorage.getItem(STH_KEYS.BEST_SCORES) || '{}');
      return map[levelId] != null ? map[levelId] : null;
    } catch (e) { return null; }
  },
  setBestScoreIfHigher(levelId, score) {
    let map = {};
    try { map = JSON.parse(localStorage.getItem(STH_KEYS.BEST_SCORES) || '{}'); } catch (e) { map = {}; }
    if (map[levelId] == null || score > map[levelId]) {
      map[levelId] = score;
      localStorage.setItem(STH_KEYS.BEST_SCORES, JSON.stringify(map));
    }
  },
  getPassedLevels() {
    try { return JSON.parse(localStorage.getItem(STH_KEYS.PASSED_LEVELS) || '[]'); } catch (e) { return []; }
  },
  markLevelPassed(levelId) {
    const list = this.getPassedLevels();
    if (!list.includes(levelId)) {
      list.push(levelId);
      localStorage.setItem(STH_KEYS.PASSED_LEVELS, JSON.stringify(list));
    }
  },
  getLeaderboard() {
    try {
      const raw = localStorage.getItem(STH_KEYS.LEADERBOARD);
      return raw ? JSON.parse(raw) : [...DEFAULT_LEADERBOARD];
    } catch (e) {
      return [...DEFAULT_LEADERBOARD];
    }
  },
  addScore(name, score) {
    const list = this.getLeaderboard();
    list.push({ name, score, date: new Date().toISOString() });
    localStorage.setItem(STH_KEYS.LEADERBOARD, JSON.stringify(list));
    return list;
  },
  resetProgress() {
    localStorage.removeItem(STH_KEYS.LEADERBOARD);
    localStorage.removeItem(STH_KEYS.SETTINGS);
    localStorage.removeItem(STH_KEYS.PLAYER_NAME);
    localStorage.removeItem(STH_KEYS.UNLOCKED_LEVEL);
    localStorage.removeItem(STH_KEYS.BEST_SCORES);
    localStorage.removeItem(STH_KEYS.PASSED_LEVELS);
  }
};
