/**
 * E6: Web Audio API Soundscape
 * Fully procedural — no external audio files needed.
 * Generates: crowd murmur, escalating sirens, footstep rhythm, infection sting.
 */
export class AudioSystem {
  constructor() {
    this._ctx = null;
    this._masterGain = null;
    this._murmurNode = null;
    this._sirenOsc = null;
    this._sirenGain = null;
    this._footstepInterval = null;
    this._panicLevel = 0;
    this._started = false;
  }

  /** Call once after the first user gesture to unlock Web Audio */
  start() {
    if (this._started) return;
    this._started = true;

    try {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
      this._masterGain = this._ctx.createGain();
      this._masterGain.gain.value = 0.55;
      this._masterGain.connect(this._ctx.destination);

      this._setupCrowdMurmur();
      this._setupSiren();
      this._startFootsteps();
    } catch (e) {
      console.warn('[AudioSystem] Web Audio not available:', e);
    }
  }

  /** Update panic level (0–1) to modulate siren pitch and crowd volume */
  update(panicLevel) {
    if (!this._ctx || !this._started) return;
    this._panicLevel = panicLevel;

    if (this._sirenOsc && this._sirenGain) {
      // Siren: ramps from silent at 0 panic to full wail at 1.0
      const sirenVol = Math.max(0, panicLevel - 0.3) / 0.7;
      this._sirenGain.gain.setTargetAtTime(sirenVol * 0.18, this._ctx.currentTime, 0.8);

      // Siren pitch warbles faster at higher panic
      const basePitch = 440 + panicLevel * 220;
      this._sirenOsc.frequency.setTargetAtTime(basePitch, this._ctx.currentTime, 0.5);
    }

    if (this._murmurGain) {
      // Crowd gets louder + more frantic as panic rises
      const murmurVol = 0.06 + panicLevel * 0.14;
      this._murmurGain.gain.setTargetAtTime(murmurVol, this._ctx.currentTime, 0.5);
    }
  }

  /** Play a short infection sting sound */
  playInfectionSting(combo = 1) {
    if (!this._ctx) return;
    const osc = this._ctx.createOscillator();
    const env = this._ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 120 + combo * 15;
    env.gain.setValueAtTime(0.25, this._ctx.currentTime);
    env.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + 0.3);
    osc.connect(env);
    env.connect(this._masterGain);
    osc.start();
    osc.stop(this._ctx.currentTime + 0.3);
  }

  /** Play a frenzy activation burst */
  playFrenzyBurst() {
    if (!this._ctx) return;
    const t = this._ctx.currentTime;
    [220, 330, 440, 660].forEach((freq, i) => {
      const osc = this._ctx.createOscillator();
      const env = this._ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      env.gain.setValueAtTime(0, t + i * 0.04);
      env.gain.linearRampToValueAtTime(0.18, t + i * 0.04 + 0.02);
      env.gain.exponentialRampToValueAtTime(0.001, t + i * 0.04 + 0.25);
      osc.connect(env);
      env.connect(this._masterGain);
      osc.start(t + i * 0.04);
      osc.stop(t + i * 0.04 + 0.3);
    });
  }

  /** Play an aerodynamic wind whoosh when swarm compresses into aerodynamic wedge */
  playSqueezeWhoosh() {
    if (!this._ctx) return;
    const t = this._ctx.currentTime;
    const osc = this._ctx.createOscillator();
    const filter = this._ctx.createBiquadFilter();
    const env = this._ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(380, t + 0.12);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.35);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(450, t);
    filter.Q.value = 3.0;

    env.gain.setValueAtTime(0.0, t);
    env.gain.linearRampToValueAtTime(0.18, t + 0.08);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    osc.connect(filter);
    filter.connect(env);
    env.connect(this._masterGain);

    osc.start(t);
    osc.stop(t + 0.36);
  }

  /** Play comic wet squelch when civilian slips on slime trail */
  playSlimeSlip() {
    if (!this._ctx) return;
    const t = this._ctx.currentTime;
    const osc = this._ctx.createOscillator();
    const env = this._ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(85, t + 0.28); // Slide whistle drop

    env.gain.setValueAtTime(0.22, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.30);

    osc.connect(env);
    env.connect(this._masterGain);

    osc.start(t);
    osc.stop(t + 0.30);
  }

  /** Play bullhorn megaphone alert chirp when Warden rallies civilians */
  playMegaphoneChant() {
    if (!this._ctx) return;
    const t = this._ctx.currentTime;
    [587, 880].forEach((freq, i) => {
      const osc = this._ctx.createOscillator();
      const filter = this._ctx.createBiquadFilter();
      const env = this._ctx.createGain();

      osc.type = 'square';
      osc.frequency.value = freq;

      filter.type = 'bandpass';
      filter.frequency.value = 1200; // Megaphone metallic resonance
      filter.Q.value = 4.0;

      env.gain.setValueAtTime(0, t + i * 0.08);
      env.gain.linearRampToValueAtTime(0.15, t + i * 0.08 + 0.015);
      env.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.16);

      osc.connect(filter);
      filter.connect(env);
      env.connect(this._masterGain);

      osc.start(t + i * 0.08);
      osc.stop(t + i * 0.08 + 0.18);
    });
  }

  /** Play a combo-level stab sound */
  playComboStab(combo) {
    if (!this._ctx) return;
    const osc = this._ctx.createOscillator();
    const env = this._ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 200 + Math.min(combo, 10) * 40;
    env.gain.setValueAtTime(0.15, this._ctx.currentTime);
    env.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + 0.2);
    osc.connect(env);
    env.connect(this._masterGain);
    osc.start();
    osc.stop(this._ctx.currentTime + 0.2);
  }

  /** Play a comic metal crash / clatter when bulldozing small props */
  playPropCrash() {
    if (!this._ctx) return;
    const t = this._ctx.currentTime;
    const osc = this._ctx.createOscillator();
    const env = this._ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.28);
    env.gain.setValueAtTime(0.35, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    osc.connect(env);
    env.connect(this._masterGain);
    osc.start(t);
    osc.stop(t + 0.28);
  }

  /** Play a heavy blast explosion for Bloater bomb */
  playExplosion() {
    if (!this._ctx) return;
    const t = this._ctx.currentTime;
    const osc = this._ctx.createOscillator();
    const env = this._ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.5);
    env.gain.setValueAtTime(0.45, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    osc.connect(env);
    env.connect(this._masterGain);
    osc.start(t);
    osc.stop(t + 0.55);
  }

  /** Play high-energy arcade chime when picking up a powerup */
  playPowerupCollect() {
    if (!this._ctx) return;
    const t = this._ctx.currentTime;
    [350, 520, 700, 1050].forEach((freq, i) => {
      const osc = this._ctx.createOscillator();
      const env = this._ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      env.gain.setValueAtTime(0, t + i * 0.05);
      env.gain.linearRampToValueAtTime(0.2, t + i * 0.05 + 0.02);
      env.gain.exponentialRampToValueAtTime(0.001, t + i * 0.05 + 0.25);
      osc.connect(env);
      env.connect(this._masterGain);
      osc.start(t + i * 0.05);
      osc.stop(t + i * 0.05 + 0.25);
    });
  }

  /** Play low warning descent on Game Over */
  playGameOver() {
    if (!this._ctx) return;
    const t = this._ctx.currentTime;
    const osc = this._ctx.createOscillator();
    const env = this._ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(280, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 1.2);
    env.gain.setValueAtTime(0.4, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    osc.connect(env);
    env.connect(this._masterGain);
    osc.start(t);
    osc.stop(t + 1.2);
  }

  /** Play a sharp military sniper rifle gunshot */
  playGunshot() {
    if (!this._ctx) return;
    const t = this._ctx.currentTime;

    // 1. Muzzle crack noise burst
    const noiseBuffer = this._ctx.createBuffer(1, Math.floor(this._ctx.sampleRate * 0.12), this._ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < output.length; i++) {
      output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this._ctx.sampleRate * 0.02));
    }
    const noise = this._ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = this._ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    filter.Q.value = 3.0;

    const noiseEnv = this._ctx.createGain();
    noiseEnv.gain.setValueAtTime(0.45, t);
    noiseEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    noise.connect(filter);
    filter.connect(noiseEnv);
    noiseEnv.connect(this._masterGain);
    noise.start(t);

    // 2. High-energy body punch
    const osc = this._ctx.createOscillator();
    const env = this._ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(460, t);
    osc.frequency.exponentialRampToValueAtTime(65, t + 0.18);
    env.gain.setValueAtTime(0.4, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(env);
    env.connect(this._masterGain);
    osc.start(t);
    osc.stop(t + 0.24);
  }

  /** Play a sub-bass ground stomp thud for the Titan */
  playTitanStomp() {
    if (!this._ctx) return;
    const t = this._ctx.currentTime;
    const osc = this._ctx.createOscillator();
    const env = this._ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(28, t + 0.3);
    env.gain.setValueAtTime(0.55, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(env);
    env.connect(this._masterGain);
    osc.start(t);
    osc.stop(t + 0.36);
  }

  /** Play an ominous Titan Virus transformation roar */
  playTitanRoar() {
    if (!this._ctx) return;
    const t = this._ctx.currentTime;
    const osc1 = this._ctx.createOscillator();
    const osc2 = this._ctx.createOscillator();
    const env = this._ctx.createGain();
    osc1.type = 'sawtooth';
    osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(65, t);
    osc1.frequency.exponentialRampToValueAtTime(140, t + 0.4);
    osc1.frequency.exponentialRampToValueAtTime(55, t + 0.9);

    osc2.frequency.setValueAtTime(67, t);
    osc2.frequency.exponentialRampToValueAtTime(145, t + 0.4);
    osc2.frequency.exponentialRampToValueAtTime(53, t + 0.9);

    env.gain.setValueAtTime(0.1, t);
    env.gain.linearRampToValueAtTime(0.45, t + 0.35);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.95);

    osc1.connect(env);
    osc2.connect(env);
    env.connect(this._masterGain);
    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 0.95);
    osc2.stop(t + 0.95);
  }

  _setupCrowdMurmur() {
    // White noise filtered to low rumble
    const bufferSize = this._ctx.sampleRate * 2;
    const buffer = this._ctx.createBuffer(1, bufferSize, this._ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.4;
    }

    const source = this._ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    // Low-pass filter for murmur character
    const filter = this._ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    filter.Q.value = 0.8;

    this._murmurGain = this._ctx.createGain();
    this._murmurGain.gain.value = 0.06;

    source.connect(filter);
    filter.connect(this._murmurGain);
    this._murmurGain.connect(this._masterGain);
    source.start();
    this._murmurNode = source;
  }

  _setupSiren() {
    // Warbling siren oscillator, starts silent
    this._sirenOsc = this._ctx.createOscillator();
    this._sirenOsc.type = 'sawtooth';
    this._sirenOsc.frequency.value = 440;

    // LFO to make it wail
    const lfo = this._ctx.createOscillator();
    lfo.frequency.value = 1.5;
    const lfoGain = this._ctx.createGain();
    lfoGain.gain.value = 60;
    lfo.connect(lfoGain);
    lfoGain.connect(this._sirenOsc.frequency);

    // Filter
    const filter = this._ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 600;
    filter.Q.value = 2.0;

    this._sirenGain = this._ctx.createGain();
    this._sirenGain.gain.value = 0; // starts silent

    this._sirenOsc.connect(filter);
    filter.connect(this._sirenGain);
    this._sirenGain.connect(this._masterGain);

    this._sirenOsc.start();
    lfo.start();
  }

  _startFootsteps() {
    // Rhythmic soft kick-style footstep ticks
    const playStep = () => {
      if (!this._ctx || !this._started) return;
      const osc = this._ctx.createOscillator();
      const env = this._ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(90, this._ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(30, this._ctx.currentTime + 0.08);
      env.gain.setValueAtTime(0.08, this._ctx.currentTime);
      env.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + 0.12);
      osc.connect(env);
      env.connect(this._masterGain);
      osc.start();
      osc.stop(this._ctx.currentTime + 0.15);
    };

    // Schedule footsteps: faster at higher panic
    const tick = () => {
      playStep();
      const interval = 350 - this._panicLevel * 180; // 350ms calm, 170ms full sprint
      this._footstepInterval = setTimeout(tick, interval);
    };
    this._footstepInterval = setTimeout(tick, 400);
  }

  /** Retro arcade blip on tumbler character cycle */
  playTumblerClick() {
    if (!this._ctx || !this._started) return;
    try {
      const osc = this._ctx.createOscillator();
      const gain = this._ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(520, this._ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(780, this._ctx.currentTime + 0.035);
      gain.gain.setValueAtTime(0.09, this._ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + 0.04);
      osc.connect(gain);
      gain.connect(this._masterGain);
      osc.start();
      osc.stop(this._ctx.currentTime + 0.045);
    } catch (e) {}
  }

  /** Retro celebratory arpeggio fanfare for qualifying for high score */
  playHighScoreFanfare() {
    if (!this._ctx || !this._started) return;
    try {
      const notes = [440, 554.37, 659.25, 880, 1108.73];
      const now = this._ctx.currentTime;
      notes.forEach((freq, idx) => {
        const osc = this._ctx.createOscillator();
        const gain = this._ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);
        gain.gain.setValueAtTime(0.18, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.35);
        osc.connect(gain);
        gain.connect(this._masterGain);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.4);
      });
    } catch (e) {}
  }

  /** Affirmative arcade confirmation chime on initials submission */
  playInitialsSubmit() {
    if (!this._ctx || !this._started) return;
    try {
      const now = this._ctx.currentTime;
      [587.33, 880].forEach((freq, idx) => {
        const osc = this._ctx.createOscillator();
        const gain = this._ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.1);
        gain.gain.setValueAtTime(0.22, now + idx * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.4);
        osc.connect(gain);
        gain.connect(this._masterGain);
        osc.start(now + idx * 0.1);
        osc.stop(now + idx * 0.1 + 0.45);
      });
    } catch (e) {}
  }

  /** Procedural tire screech sound when vehicles brake hard or scatter zombies */
  playTireScreech() {
    if (!this._ctx || !this._started) return;
    try {
      const now = this._ctx.currentTime;
      const osc = this._ctx.createOscillator();
      const gain = this._ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1400, now);
      osc.frequency.exponentialRampToValueAtTime(450, now + 0.45);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc.connect(gain);
      gain.connect(this._masterGain);
      osc.start(now);
      osc.stop(now + 0.5);
    } catch (e) {}
  }

  /** Heavy impact crash sound for vehicle collisions and Titan stomps */
  playCarCrash() {
    if (!this._ctx || !this._started) return;
    try {
      const now = this._ctx.currentTime;
      const osc = this._ctx.createOscillator();
      const gain = this._ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(35, now + 0.5);

      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      osc.connect(gain);
      gain.connect(this._masterGain);
      osc.start(now);
      osc.stop(now + 0.55);
    } catch (e) {}
  }

  /** Deep explosive concussive blast for tank cannon shell fire */
  playTankCannon() {
    if (!this._ctx || !this._started) return;
    try {
      const t = this._ctx.currentTime;
      // 1. Heavy sub-bass thump
      const osc = this._ctx.createOscillator();
      const env = this._ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, t);
      osc.frequency.exponentialRampToValueAtTime(22, t + 0.65);

      env.gain.setValueAtTime(0.6, t);
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.7);

      osc.connect(env);
      env.connect(this._masterGain);
      osc.start(t);
      osc.stop(t + 0.72);

      // 2. High pressure blast noise
      const noiseBuffer = this._ctx.createBuffer(1, Math.floor(this._ctx.sampleRate * 0.35), this._ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this._ctx.sampleRate * 0.08));
      }
      const noiseSource = this._ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;

      const filter = this._ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(600, t);
      filter.frequency.exponentialRampToValueAtTime(80, t + 0.35);

      const noiseEnv = this._ctx.createGain();
      noiseEnv.gain.setValueAtTime(0.5, t);
      noiseEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

      noiseSource.connect(filter);
      filter.connect(noiseEnv);
      noiseEnv.connect(this._masterGain);
      noiseSource.start(t);
    } catch (e) {}
  }

  dispose() {
    if (this._footstepInterval) clearTimeout(this._footstepInterval);
    if (this._ctx) this._ctx.close();
  }
}
