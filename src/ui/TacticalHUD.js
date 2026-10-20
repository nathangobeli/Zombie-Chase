/**
 * Decluttered, Peripheral Glassmorphic Tactical HUD + Radar Minimap + Mutation Lab Modal
 * for Zombie Chase v3.0: Outbreak Protocol.
 */
export class TacticalHUD {
  constructor(sim, bossSys, onActionCallback) {
    this.sim = sim;
    this.bossSys = bossSys;
    this.onAction = onActionCallback;

    this.els = {
      hordeCount: document.getElementById('hud-horde-count'),
      dnaCount: document.getElementById('hud-dna-count'),
      scoreCount: document.getElementById('hud-score-count'),
      breachCount: document.getElementById('hud-breach-count'),
      threatStars: document.getElementById('hud-threat-stars'),
      districtBadge: document.getElementById('hud-district-badge'),
      comboBadge: document.getElementById('hud-combo-badge'),

      casteWalker: document.getElementById('caste-walker-count'),
      casteLeaper: document.getElementById('caste-leaper-count'),
      casteBrute: document.getElementById('caste-brute-count'),
      casteSpitter: document.getElementById('caste-spitter-count'),

      bossPanel: document.getElementById('hud-boss-panel'),
      bossBarFill: document.getElementById('hud-boss-bar-fill'),
      bossHpText: document.getElementById('hud-boss-hp-text'),

      radioFeed: document.getElementById('hud-radio-feed'),
      radarCanvas: document.getElementById('hud-radar-canvas'),

      btnFrenzy: document.getElementById('cmd-frenzy'),
      barFrenzy: document.getElementById('bar-frenzy'),
      statusFrenzy: document.getElementById('status-frenzy'),

      btnSurge: document.getElementById('cmd-surge'),
      barSurge: document.getElementById('bar-surge'),
      statusSurge: document.getElementById('status-surge'),

      btnFormation: document.getElementById('cmd-formation'),
      labelFormation: document.getElementById('label-formation'),

      evoLeaper: document.getElementById('evo-leaper'),
      evoBrute: document.getElementById('evo-brute'),
      evoSpitter: document.getElementById('evo-spitter'),
      evoAlpha: document.getElementById('evo-alpha'),

      btnLightMode: document.getElementById('btn-light-mode'),
      btnSummonBoss: document.getElementById('btn-summon-boss'),
      btnOpenLab: document.getElementById('btn-open-lab'),
      btnCloseLab: document.getElementById('btn-close-lab'),
      labModal: document.getElementById('mutation-lab-modal'),
      labBankedDna: document.getElementById('lab-banked-dna'),
      btnLabPack: document.getElementById('btn-lab-pack'),
      btnLabViral: document.getElementById('btn-lab-viral'),
      btnLabCarapace: document.getElementById('btn-lab-carapace'),
    };

    this.radarCtx = this.els.radarCanvas ? this.els.radarCanvas.getContext('2d') : null;
    this._lastAlertId = -1;

    this._bindButtons();
  }

  _bindButtons() {
    this.els.btnFrenzy?.addEventListener('click', () => this.onAction('frenzy'));
    this.els.btnSurge?.addEventListener('click', () => this.onAction('surge'));
    this.els.btnFormation?.addEventListener('click', () => this.onAction('formation'));

    this.els.evoLeaper?.addEventListener('click', () => this.onAction('evolve', 'leaper'));
    this.els.evoBrute?.addEventListener('click', () => this.onAction('evolve', 'brute'));
    this.els.evoSpitter?.addEventListener('click', () => this.onAction('evolve', 'spitter'));
    this.els.evoAlpha?.addEventListener('click', () => this.onAction('evolve', 'alpha'));

    this.els.btnLightMode?.addEventListener('click', () => this.onAction('lightMode'));
    this.els.btnSummonBoss?.addEventListener('click', () => this.onAction('summonBoss'));
    this.els.btnOpenLab?.addEventListener('click', () => this.toggleLabModal());
    this.els.btnCloseLab?.addEventListener('click', () => this.toggleLabModal(false));

    this.els.btnLabPack?.addEventListener('click', () => {
      this.sim.upgradeMetaTrait('startPackLevel');
      this._refreshLabModal();
    });
    this.els.btnLabViral?.addEventListener('click', () => {
      this.sim.upgradeMetaTrait('viralWindowLevel');
      this._refreshLabModal();
    });
    this.els.btnLabCarapace?.addEventListener('click', () => {
      this.sim.upgradeMetaTrait('carapaceLevel');
      this._refreshLabModal();
    });
  }

  toggleLabModal(forceState) {
    if (!this.els.labModal) return;
    const isHidden = this.els.labModal.classList.contains('hidden');
    const shouldShow = forceState !== undefined ? forceState : isHidden;
    this.els.labModal.classList.toggle('hidden', !shouldShow);
    if (shouldShow) {
      this._refreshLabModal();
    }
  }

  _refreshLabModal() {
    if (!this.els.labModal) return;
    const totalAvailable = this.sim.dna + this.sim.meta.bankedDna;
    if (this.els.labBankedDna) {
      this.els.labBankedDna.textContent = `${totalAvailable} DNA (${this.sim.meta.bankedDna} Banked + ${this.sim.dna} Active)`;
    }
    const updateCard = (btn, key) => {
      if (!btn) return;
      const lv = this.sim.meta[key] || 1;
      const cost = lv * 60;
      const span = btn.querySelector('.lab-cost');
      if (span) span.textContent = `LV.${lv} • UPGRADE (${cost} DNA)`;
    };
    updateCard(this.els.btnLabPack, 'startPackLevel');
    updateCard(this.els.btnLabViral, 'viralWindowLevel');
    updateCard(this.els.btnLabCarapace, 'carapaceLevel');
  }

  update() {
    const sim = this.sim;
    const pz = sim.patientZero;
    const castes = sim.getCasteCounts();

    // 1. Top-Left Telemetry
    if (this.els.hordeCount) this.els.hordeCount.textContent = String(sim.zombies.length + 1);
    if (this.els.dnaCount) this.els.dnaCount.textContent = String(sim.dna);
    if (this.els.scoreCount) this.els.scoreCount.textContent = sim.score.toLocaleString();
    if (this.els.breachCount) this.els.breachCount.textContent = String(sim.buildingsBreached);

    if (this.els.threatStars) {
      this.els.threatStars.textContent = '★'.repeat(sim.threatLevel) + '☆'.repeat(5 - sim.threatLevel);
    }

    if (this.els.districtBadge && sim.currentDistrict) {
      this.els.districtBadge.textContent = sim.currentDistrict.name;
    }

    if (this.els.comboBadge) {
      if (sim.comboMultiplier > 1) {
        this.els.comboBadge.textContent = `VIRAL CHAIN x${sim.comboMultiplier} (${sim.comboTimer.toFixed(1)}s)`;
        this.els.comboBadge.classList.remove('hidden');
      } else {
        this.els.comboBadge.classList.add('hidden');
      }
    }

    // 2. Boss Telemetry Bar
    const boss = this.bossSys?.boss;
    if (this.els.bossPanel) {
      if (boss && boss.active) {
        this.els.bossPanel.classList.remove('hidden');
        const pct = Math.max(0, Math.min(100, (boss.hp / boss.maxHp) * 100));
        if (this.els.bossBarFill) this.els.bossBarFill.style.width = `${pct}%`;
        if (this.els.bossHpText) {
          this.els.bossHpText.textContent = `PHASE ${boss.phase} • ${Math.ceil(boss.hp)} / ${boss.maxHp} HP`;
        }
      } else {
        this.els.bossPanel.classList.add('hidden');
      }
    }

    // 3. Caste Breakdown
    if (this.els.casteWalker) this.els.casteWalker.textContent = String(castes.walker);
    if (this.els.casteLeaper) this.els.casteLeaper.textContent = String(castes.leaper);
    if (this.els.casteBrute) this.els.casteBrute.textContent = String(castes.brute);
    if (this.els.casteSpitter) this.els.casteSpitter.textContent = String(castes.spitter);

    // 4. Tactical Command Bars
    if (this.els.barFrenzy && this.els.statusFrenzy) {
      if (pz.frenzyTimer > 0) {
        const pct = Math.min(100, (pz.frenzyTimer / 5.0) * 100);
        this.els.barFrenzy.style.width = `${pct}%`;
        this.els.barFrenzy.style.background = '#f43f5e';
        this.els.statusFrenzy.textContent = `ACTIVE ${pz.frenzyTimer.toFixed(1)}s`;
      } else if (pz.frenzyCooldown > 0) {
        const pct = Math.max(0, 100 - (pz.frenzyCooldown / 10.0) * 100);
        this.els.barFrenzy.style.width = `${pct}%`;
        this.els.barFrenzy.style.background = '#64748b';
        this.els.statusFrenzy.textContent = `${pz.frenzyCooldown.toFixed(1)}s`;
      } else {
        this.els.barFrenzy.style.width = '100%';
        this.els.barFrenzy.style.background = '#10b981';
        this.els.statusFrenzy.textContent = 'READY';
      }
    }

    if (this.els.barSurge && this.els.statusSurge) {
      if (sim.surgeState.active) {
        const pct = Math.min(100, (sim.surgeState.timer / 4.2) * 100);
        this.els.barSurge.style.width = `${pct}%`;
        this.els.barSurge.style.background = '#f59e0b';
        this.els.statusSurge.textContent = `SURGING ${sim.surgeState.timer.toFixed(1)}s`;
      } else if (sim.surgeState.cooldown > 0) {
        const pct = Math.max(0, 100 - (sim.surgeState.cooldown / 4.8) * 100);
        this.els.barSurge.style.width = `${pct}%`;
        this.els.barSurge.style.background = '#64748b';
        this.els.statusSurge.textContent = `${sim.surgeState.cooldown.toFixed(1)}s`;
      } else {
        this.els.barSurge.style.width = '100%';
        this.els.barSurge.style.background = '#38bdf8';
        this.els.statusSurge.textContent = 'READY';
      }
    }

    if (this.els.labelFormation) {
      this.els.labelFormation.textContent = sim.formation.replace('_', ' ');
    }

    // 5. Evolution Buttons
    this._updateEvoButton(this.els.evoLeaper, 'leaper');
    this._updateEvoButton(this.els.evoBrute, 'brute');
    this._updateEvoButton(this.els.evoSpitter, 'spitter');
    this._updateEvoButton(this.els.evoAlpha, 'alpha');

    // 6. Radio Comms Ticker
    if (this.els.radioFeed && sim.radioAlerts.length > 0) {
      const topId = sim.radioAlerts[0].id;
      if (topId !== this._lastAlertId) {
        this._lastAlertId = topId;
        this.els.radioFeed.innerHTML = sim.radioAlerts
          .slice(0, 4)
          .map(
            (a) =>
              `<div class="radio-item radio-${a.tone}"><span class="radio-dot"></span>${a.text}</div>`
          )
          .join('');
      }
    }

    // 7. Render Tactical Radar Minimap
    this._drawRadar();
  }

  _updateEvoButton(btn, key) {
    if (!btn) return;
    const lvl = this.sim.upgrades[key];
    const cost = this.sim.upgradeCosts[key];
    const canAfford = this.sim.dna >= cost;

    btn.classList.toggle('evo-ready', canAfford);
    const metaEl = btn.querySelector('.evo-meta');
    if (metaEl) {
      metaEl.textContent = `LV.${lvl} • ${cost} DNA`;
    }
  }

  _drawRadar() {
    const ctx = this.radarCtx;
    if (!ctx) return;
    const W = 156;
    const H = 156;
    const cx = W / 2;
    const cy = H / 2;
    const scale = 1.15;

    const pz = this.sim.patientZero;

    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(9, 13, 22, 0.85)';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.16)';
    ctx.lineWidth = 1;
    for (const r of [24, 48, 70]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (let i = 0; i < this.sim.world.interiorRooms.length; i++) {
      const rm = this.sim.world.interiorRooms[i];
      const rx = cx + (rm.cx - pz.x) * scale;
      const rz = cy + (rm.cz - pz.z) * scale;
      const rw = rm.halfW * 2 * scale;
      const rd = rm.halfD * 2 * scale;
      if (rx + rw < 0 || rx - rw > W || rz + rd < 0 || rz - rd > H) continue;

      ctx.fillStyle = 'rgba(30, 41, 59, 0.75)';
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
      ctx.lineWidth = 1.2;
      ctx.fillRect(rx - rw / 2, rz - rd / 2, rw, rd);
      ctx.strokeRect(rx - rw / 2, rz - rd / 2, rw, rd);
    }

    ctx.fillStyle = '#34d399';
    for (let i = 0; i < this.sim.world.dnaCanisters.length; i++) {
      const c = this.sim.world.dnaCanisters[i];
      if (c.collected) continue;
      const dx = cx + (c.x - pz.x) * scale;
      const dz = cy + (c.z - pz.z) * scale;
      if (dx < 4 || dx > W - 4 || dz < 4 || dz > H - 4) continue;
      ctx.fillRect(dx - 2, dz - 2, 4, 4);
    }

    for (let i = 0; i < this.sim.humans.length; i++) {
      const h = this.sim.humans[i];
      if (h.dead) continue;
      const hx = cx + (h.x - pz.x) * scale;
      const hz = cy + (h.z - pz.z) * scale;
      if (hx < 2 || hx > W - 2 || hz < 2 || hz > H - 2) continue;

      ctx.fillStyle =
        h.type === 'sniper'
          ? '#ef4444'
          : h.type === 'hazmat'
          ? '#facc15'
          : h.type === 'police'
          ? '#60a5fa'
          : '#cbd5e1';
      ctx.fillRect(hx - 1.5, hz - 1.5, 3, 3);
    }

    for (let i = 0; i < this.sim.zombies.length; i++) {
      const z = this.sim.zombies[i];
      if (z.dead) continue;
      const zx = cx + (z.x - pz.x) * scale;
      const zz = cy + (z.z - pz.z) * scale;
      if (zx < 2 || zx > W - 2 || zz < 2 || zz > H - 2) continue;

      ctx.fillStyle =
        z.caste === 'brute'
          ? '#f59e0b'
          : z.caste === 'leaper'
          ? '#fb7185'
          : z.caste === 'spitter'
          ? '#a3e635'
          : '#34d399';
      const sz = z.caste === 'brute' ? 3.5 : 2.5;
      ctx.fillRect(zx - sz / 2, zz - sz / 2, sz, sz);
    }

    // Boss radar blip
    if (this.bossSys?.boss?.active) {
      const bx = cx + (this.bossSys.boss.x - pz.x) * scale;
      const bz = cy + (this.bossSys.boss.z - pz.z) * scale;
      ctx.fillStyle = '#ff1e42';
      ctx.beginPath();
      ctx.arc(bx, bz, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    if (this.sim.surgeState.active) {
      const sx = cx + (this.sim.surgeState.tx - pz.x) * scale;
      const sz = cy + (this.sim.surgeState.tz - pz.z) * scale;
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(sx, sz);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(sx, sz, 4.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}
