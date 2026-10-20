/**
 * Clean, Minimalist Mobile-First Arcade HUD for Zombie Chase.
 * Keeps over 90% of the mobile viewport completely unobstructed!
 */
export class TacticalHUD {
  constructor(sim, bossSys, onActionCallback) {
    this.sim = sim;
    this.bossSys = bossSys;
    this.onAction = onActionCallback;

    this.els = {
      hordeCount: document.getElementById('hud-horde-count'),
      scoreCount: document.getElementById('hud-score-count'),
      comboBadge: document.getElementById('hud-combo-badge'),

      bossPanel: document.getElementById('hud-boss-panel'),
      bossBarFill: document.getElementById('hud-boss-bar-fill'),
      bossHpText: document.getElementById('hud-boss-hp-text'),

      btnFrenzy: document.getElementById('cmd-frenzy'),
      statusFrenzy: document.getElementById('status-frenzy'),

      btnSurge: document.getElementById('cmd-surge'),
      statusSurge: document.getElementById('status-surge'),

      btnLightMode: document.getElementById('btn-light-mode'),
    };

    this._bindButtons();
  }

  _bindButtons() {
    this.els.btnFrenzy?.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.onAction('frenzy');
    });
    this.els.btnSurge?.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.onAction('surge');
    });
    this.els.btnLightMode?.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.onAction('lightMode');
    });
  }

  update() {
    const sim = this.sim;
    const pz = sim.patientZero;

    if (this.els.hordeCount) {
      this.els.hordeCount.textContent = String(sim.zombies.length + 1);
    }
    if (this.els.scoreCount) {
      this.els.scoreCount.textContent = sim.score.toLocaleString();
    }

    if (this.els.comboBadge) {
      if (sim.comboMultiplier > 1) {
        this.els.comboBadge.textContent = `🔥 x${sim.comboMultiplier}`;
        this.els.comboBadge.classList.remove('hidden');
      } else {
        this.els.comboBadge.classList.add('hidden');
      }
    }

    // Boss Bar
    const boss = this.bossSys?.boss;
    if (this.els.bossPanel) {
      if (boss && boss.active) {
        this.els.bossPanel.classList.remove('hidden');
        const pct = Math.max(0, Math.min(100, (boss.hp / boss.maxHp) * 100));
        if (this.els.bossBarFill) this.els.bossBarFill.style.width = `${pct}%`;
        if (this.els.bossHpText) this.els.bossHpText.textContent = `${Math.ceil(pct)}%`;
      } else {
        this.els.bossPanel.classList.add('hidden');
      }
    }

    // Frenzy Button state
    if (this.els.btnFrenzy && this.els.statusFrenzy) {
      if (pz.frenzyTimer > 0) {
        this.els.btnFrenzy.classList.remove('on-cooldown');
        this.els.statusFrenzy.textContent = `${pz.frenzyTimer.toFixed(0)}s`;
      } else if (pz.frenzyCooldown > 0) {
        this.els.btnFrenzy.classList.add('on-cooldown');
        this.els.statusFrenzy.textContent = `${ Math.ceil(pz.frenzyCooldown) }s`;
      } else {
        this.els.btnFrenzy.classList.remove('on-cooldown');
        this.els.statusFrenzy.textContent = 'READY';
      }
    }

    // Surge Button state
    if (this.els.btnSurge && this.els.statusSurge) {
      if (sim.surgeState.active) {
        this.els.btnSurge.classList.remove('on-cooldown');
        this.els.statusSurge.textContent = 'GO!';
      } else if (sim.surgeState.cooldown > 0) {
        this.els.btnSurge.classList.add('on-cooldown');
        this.els.statusSurge.textContent = `${Math.ceil(sim.surgeState.cooldown)}s`;
      } else {
        this.els.btnSurge.classList.remove('on-cooldown');
        this.els.statusSurge.textContent = 'READY';
      }
    }
  }
}
