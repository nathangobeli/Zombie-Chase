/**
 * StorageSystem.js
 * Manages persistent local high scores partitioned by difficulty.
 * Adheres to .agent/designer.md (top 5 qualification, score math)
 * and .agent/qa.md (safe parsing, schema validation, fallback defaults).
 */

const STORAGE_KEY = 'zombie_chase_scores';
const MAX_LEADERBOARD_ENTRIES = 5;

const DEFAULT_SCORES = {
  casual: [],
  outbreak: [],
  martial_law: []
};

export class StorageSystem {
  constructor() {
    this.scores = this._loadScores();
  }

  /**
   * Safe parser for localStorage with fallback defaults
   */
  _loadScores() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        this._saveRaw(DEFAULT_SCORES);
        return JSON.parse(JSON.stringify(DEFAULT_SCORES));
      }
      const parsed = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) {
        this._saveRaw(DEFAULT_SCORES);
        return JSON.parse(JSON.stringify(DEFAULT_SCORES));
      }
      // Ensure all difficulties exist
      for (const diff of ['casual', 'outbreak', 'martial_law']) {
        if (!Array.isArray(parsed[diff])) {
          parsed[diff] = [];
        }
      }
      // Migrate legacy keys if present
      if (Array.isArray(parsed.pandemic) && parsed.pandemic.length > 0 && parsed.casual.length === 0) {
        parsed.casual = parsed.pandemic;
      }
      if (Array.isArray(parsed.nightmare) && parsed.nightmare.length > 0 && parsed.martial_law.length === 0) {
        parsed.martial_law = parsed.nightmare;
      }
      return parsed;
    } catch (e) {
      console.warn('[StorageSystem] Failed to parse localStorage scores, using defaults.', e);
      return JSON.parse(JSON.stringify(DEFAULT_SCORES));
    }
  }

  _saveRaw(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('[StorageSystem] Failed to save to localStorage.', e);
    }
  }

  save() {
    this._saveRaw(this.scores);
  }

  /**
   * Returns top 5 sorted entries for a given difficulty
   */
  getScores(difficulty = 'outbreak') {
    const list = this.scores[difficulty] || [];
    return [...list].sort((a, b) => b.score - a.score).slice(0, MAX_LEADERBOARD_ENTRIES);
  }

  /**
   * Checks whether a final score qualifies for the top 5
   */
  isHighScore(score, difficulty = 'outbreak') {
    if (typeof score !== 'number' || score <= 0) return false;
    const current = this.getScores(difficulty);
    if (current.length < MAX_LEADERBOARD_ENTRIES) return true;
    const lowest = current[current.length - 1];
    return score > lowest.score;
  }

  /**
   * Adds an entry, sorts descending, trims to top 5, and saves.
   * Returns { rank: 1-5, entry } or null if not qualified.
   */
  addScore({ initials = 'AAA', score = 0, peakHorde = 1, timeSurvived = '00:00', difficulty = 'outbreak', date = null }) {
    if (!this.scores[difficulty]) {
      this.scores[difficulty] = [];
    }

    const cleanInitials = (initials || 'AAA').toString().toUpperCase().padEnd(3, ' ').slice(0, 3);
    const entry = {
      initials: cleanInitials,
      score: Math.max(0, Math.round(score)),
      peakHorde: Math.max(1, Math.round(peakHorde)),
      timeSurvived: typeof timeSurvived === 'string' ? timeSurvived : this.formatTime(timeSurvived || 0),
      difficulty,
      date: date || this.getTodayDate()
    };

    const list = this.scores[difficulty];
    list.push(entry);
    list.sort((a, b) => b.score - a.score);

    // Keep top 5
    if (list.length > MAX_LEADERBOARD_ENTRIES) {
      list.length = MAX_LEADERBOARD_ENTRIES;
    }

    this.save();

    // Find the rank (1-indexed)
    const rank = list.findIndex(item => item === entry) + 1;
    return { rank: rank > 0 ? rank : null, entry };
  }

  /**
   * Format seconds to "MM:SS"
   */
  formatTime(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  /**
   * Returns today's date formatted as YYYY-MM-DD
   */
  getTodayDate() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  /**
   * Reset high scores for a difficulty or all difficulties
   */
  resetScores(difficulty = null) {
    if (difficulty && DEFAULT_SCORES[difficulty]) {
      this.scores[difficulty] = JSON.parse(JSON.stringify(DEFAULT_SCORES[difficulty]));
    } else {
      this.scores = JSON.parse(JSON.stringify(DEFAULT_SCORES));
    }
    this.save();
  }
}
