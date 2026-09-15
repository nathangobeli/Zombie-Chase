/**
 * StorageSystem.js
 * Manages persistent local high scores partitioned by difficulty and game mode,
 * banked zombies meta-currency, and upgradable run enhancements.
 * Adheres to .agent/designer.md (top 5 qualification, score math)
 * and .agent/qa.md (safe parsing, schema validation, fallback defaults).
 */

const STORAGE_KEY = 'zombie_chase_scores';
const BANKED_ZOMBIES_KEY = 'zombie_chase_bank';
const LEGACY_BANKED_KEY = 'zombie_chase_banked';
const ENHANCEMENTS_KEY = 'zombie_chase_enhancements';
const MAX_LEADERBOARD_ENTRIES = 5;

export const GAME_MODES = ['endless', 'time_attack_2', 'time_attack_5', 'time_attack_10'];
export const DIFFICULTIES = ['casual', 'outbreak', 'martial_law'];

export const ENHANCEMENT_DEFS = {
  titanDuration: {
    id: 'titanDuration',
    name: 'Titan Duration +50%',
    cost: 50,
    desc: 'Extends Titan Virus duration from 15.0s to 22.5s.',
    icon: '☣️'
  },
  swarmSpeed: {
    id: 'swarmSpeed',
    name: 'Swarm Speed +20%',
    cost: 40,
    desc: 'Follower zombie acceleration and maximum speed boosted by +20%.',
    icon: '⚡'
  },
  civilianPheromone: {
    id: 'civilianPheromone',
    name: 'Civilian Pheromone Attraction',
    cost: 30,
    desc: 'Increases civilian attraction and infection hitbox radius by +35%.',
    icon: '🧲'
  },
  thickSkulls: {
    id: 'thickSkulls',
    name: 'Thick Skulls',
    cost: 45,
    desc: 'Follower zombies take 30% longer for Hazmats to decontaminate.',
    icon: '💀'
  }
};

function getPartitionKey(difficulty = 'outbreak', mode = 'endless') {
  const d = DIFFICULTIES.includes(difficulty) ? difficulty : 'outbreak';
  const m = GAME_MODES.includes(mode) ? mode : 'endless';
  return `${d}_${m}`;
}

function createDefaultScores() {
  const defaults = {};
  for (const diff of DIFFICULTIES) {
    for (const mode of GAME_MODES) {
      defaults[`${diff}_${mode}`] = [];
    }
    // Also provide direct difficulty keys for legacy compatibility
    defaults[diff] = [];
  }
  return defaults;
}

export class StorageSystem {
  constructor() {
    this.scores = this._loadScores();
    this.bankedZombies = this._loadBankedZombies();
    this.enhancements = this._loadEnhancements();
  }

  // ==========================================
  // SCORES & LEADERBOARDS
  // ==========================================

  _loadScores() {
    const defaultData = createDefaultScores();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        this._saveRaw(defaultData);
        return defaultData;
      }
      const parsed = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) {
        this._saveRaw(defaultData);
        return defaultData;
      }

      // Ensure all partition keys exist
      for (const diff of DIFFICULTIES) {
        for (const mode of GAME_MODES) {
          const key = `${diff}_${mode}`;
          if (!Array.isArray(parsed[key])) {
            parsed[key] = [];
          }
        }
        // Legacy fallback: if parsed[diff] had scores, migrate them into endless
        if (Array.isArray(parsed[diff]) && parsed[diff].length > 0 && parsed[`${diff}_endless`].length === 0) {
          parsed[`${diff}_endless`] = parsed[diff].map(entry => ({
            ...entry,
            mode: entry.mode || 'endless',
            enhancementsUsed: !!entry.enhancementsUsed
          }));
        }
      }
      return parsed;
    } catch (e) {
      console.warn('[StorageSystem] Failed to parse localStorage scores, using defaults.', e);
      return defaultData;
    }
  }

  _saveRaw(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('[StorageSystem] Failed to save scores to localStorage.', e);
    }
  }

  save() {
    this._saveRaw(this.scores);
  }

  getScores(difficulty = 'outbreak', mode = 'endless') {
    const key = getPartitionKey(difficulty, mode);
    const list = this.scores[key] || this.scores[difficulty] || [];
    return [...list].sort((a, b) => b.score - a.score).slice(0, MAX_LEADERBOARD_ENTRIES);
  }

  isHighScore(score, difficulty = 'outbreak', mode = 'endless') {
    if (typeof score !== 'number' || score <= 0) return false;
    const current = this.getScores(difficulty, mode);
    if (current.length < MAX_LEADERBOARD_ENTRIES) return true;
    const lowest = current[current.length - 1];
    return score > lowest.score;
  }

  addScore({
    initials = 'AAA',
    score = 0,
    peakHorde = 1,
    timeSurvived = '00:00',
    difficulty = 'outbreak',
    mode = 'endless',
    enhancementsUsed = false,
    date = null
  }) {
    const key = getPartitionKey(difficulty, mode);
    if (!this.scores[key]) {
      this.scores[key] = [];
    }

    const cleanInitials = (initials || 'AAA').toString().toUpperCase().padEnd(3, ' ').slice(0, 3);
    const entry = {
      initials: cleanInitials,
      score: Math.max(0, Math.round(score)),
      peakHorde: Math.max(1, Math.round(peakHorde)),
      timeSurvived: typeof timeSurvived === 'string' ? timeSurvived : this.formatTime(timeSurvived || 0),
      difficulty,
      mode,
      enhancementsUsed: !!enhancementsUsed,
      date: date || this.getTodayDate()
    };

    const list = this.scores[key];
    list.push(entry);
    list.sort((a, b) => b.score - a.score);

    if (list.length > MAX_LEADERBOARD_ENTRIES) {
      list.length = MAX_LEADERBOARD_ENTRIES;
    }

    // Keep legacy array updated as well for endless
    if (mode === 'endless' && this.scores[difficulty]) {
      this.scores[difficulty] = [...list];
    }

    this.save();

    const rank = list.findIndex(item => item === entry) + 1;
    return { rank: rank > 0 ? rank : null, entry };
  }

  formatTime(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  getTodayDate() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  resetScores(difficulty = null, mode = null) {
    if (difficulty && mode) {
      const key = getPartitionKey(difficulty, mode);
      this.scores[key] = [];
    } else {
      this.scores = createDefaultScores();
    }
    this.save();
  }

  // ==========================================
  // BANKED ZOMBIES META-CURRENCY
  // ==========================================

  _loadBankedZombies() {
    try {
      let raw = localStorage.getItem(BANKED_ZOMBIES_KEY);
      if (raw === null || raw === undefined) {
        raw = localStorage.getItem(LEGACY_BANKED_KEY);
      }
      const val = parseInt(raw, 10);
      return isNaN(val) || val < 0 ? 0 : val;
    } catch (e) {
      return 0;
    }
  }

  getBankedZombies() {
    this.bankedZombies = this._loadBankedZombies();
    return this.bankedZombies;
  }

  addBankedZombies(count) {
    if (typeof count !== 'number' || count <= 0) return this.bankedZombies;
    this.bankedZombies = this.getBankedZombies() + Math.round(count);
    try {
      localStorage.setItem(BANKED_ZOMBIES_KEY, String(this.bankedZombies));
      localStorage.setItem(LEGACY_BANKED_KEY, String(this.bankedZombies));
    } catch (e) {
      console.error('[StorageSystem] Failed to save banked zombies.', e);
    }
    return this.bankedZombies;
  }

  spendBankedZombies(cost) {
    if (typeof cost !== 'number' || cost <= 0) return false;
    const current = this.getBankedZombies();
    if (current < cost) return false;
    this.bankedZombies = current - cost;
    try {
      localStorage.setItem(BANKED_ZOMBIES_KEY, String(this.bankedZombies));
      localStorage.setItem(LEGACY_BANKED_KEY, String(this.bankedZombies));
    } catch (e) {
      console.error('[StorageSystem] Failed to save banked zombies.', e);
    }
    return true;
  }

  // ==========================================
  // MUTATION LAB ENHANCEMENTS
  // ==========================================

  _loadEnhancements() {
    const defaults = {
      unlocked: {
        titanDuration: false,
        swarmSpeed: false,
        civilianPheromone: false,
        thickSkulls: false
      },
      active: {
        titanDuration: false,
        swarmSpeed: false,
        civilianPheromone: false,
        thickSkulls: false
      }
    };
    try {
      const raw = localStorage.getItem(ENHANCEMENTS_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      if (typeof parsed !== 'object' || !parsed) return defaults;
      return {
        unlocked: { ...defaults.unlocked, ...(parsed.unlocked || {}) },
        active: { ...defaults.active, ...(parsed.active || {}) }
      };
    } catch (e) {
      return defaults;
    }
  }

  _saveEnhancements() {
    try {
      localStorage.setItem(ENHANCEMENTS_KEY, JSON.stringify(this.enhancements));
    } catch (e) {
      console.error('[StorageSystem] Failed to save enhancements.', e);
    }
  }

  getEnhancements() {
    this.enhancements = this._loadEnhancements();
    return this.enhancements;
  }

  unlockEnhancement(enhancementId, cost = null) {
    const def = ENHANCEMENT_DEFS[enhancementId];
    if (!def) return false;
    const reqCost = cost !== null ? cost : def.cost;
    if (this.spendBankedZombies(reqCost)) {
      this.enhancements.unlocked[enhancementId] = true;
      this.enhancements.active[enhancementId] = true; // Default to active upon purchase
      this._saveEnhancements();
      return true;
    }
    return false;
  }

  toggleEnhancement(enhancementId, forceState = null) {
    if (!this.enhancements.unlocked[enhancementId]) return false;
    if (forceState !== null) {
      this.enhancements.active[enhancementId] = !!forceState;
    } else {
      this.enhancements.active[enhancementId] = !this.enhancements.active[enhancementId];
    }
    this._saveEnhancements();
    return this.enhancements.active[enhancementId];
  }

  isEnhancementsUsed() {
    const active = this.enhancements?.active || {};
    return Object.values(active).some(Boolean);
  }
}
