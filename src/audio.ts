// audio.ts — Procedural Web Audio manager for Neon Marble VR
// Zone-based synthwave music with crossfade transitions

interface ZoneTrack {
  oscs: OscillatorNode[];
  gains: GainNode[];
  masterGain: GainNode;
}

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicStarted = false;

  // Zone music system
  private currentZone = -1;
  private currentTrack: ZoneTrack | null = null;
  private fadingTrack: ZoneTrack | null = null;
  private fadeTimer = 0;
  private fadeDuration = 1.5; // seconds for crossfade

  sfxVolume = 0.7;
  musicVolume = 0.3;
  masterVolume = 0.8;

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.masterVolume;
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxVolume;
      this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicVolume;
      this.musicGain.connect(this.master);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  setMasterVolume(v: number) { this.masterVolume = v; if (this.master) this.master.gain.value = v; }
  setSfxVolume(v: number) { this.sfxVolume = v; if (this.sfxGain) this.sfxGain.gain.value = v; }
  setMusicVolume(v: number) { this.musicVolume = v; if (this.musicGain) this.musicGain.gain.value = v; }

  startMusic() {
    if (this.musicStarted) return;
    const ctx = this.ensureCtx();
    if (!this.musicGain) return;
    this.musicStarted = true;
    this.setZone(0); // Start with Classic zone
  }

  stopMusic() {
    this.stopTrack(this.currentTrack);
    this.stopTrack(this.fadingTrack);
    this.currentTrack = null;
    this.fadingTrack = null;
    this.currentZone = -1;
    this.musicStarted = false;
  }

  private stopTrack(track: ZoneTrack | null) {
    if (!track) return;
    try {
      for (const osc of track.oscs) { try { osc.stop(); } catch {} }
      track.masterGain.disconnect();
    } catch {}
  }

  // Create a zone-specific synthwave track
  private createZoneTrack(zone: number): ZoneTrack {
    const ctx = this.ensureCtx();
    const trackGain = ctx.createGain();
    trackGain.gain.value = 0; // Start silent for crossfade
    trackGain.connect(this.musicGain!);

    const oscs: OscillatorNode[] = [];
    const gains: GainNode[] = [];

    // Zone-specific musical parameters
    const configs = [
      // Zone 0 - Classic: Calm, atmospheric — C minor ambient
      {
        layers: [
          { type: 'sine' as OscillatorType, freq: 65.41, gain: 0.12, detune: 0 },      // C2 bass drone
          { type: 'triangle' as OscillatorType, freq: 130.81, gain: 0.06, detune: 3 },  // C3 octave
          { type: 'sine' as OscillatorType, freq: 155.56, gain: 0.05, detune: -2 },     // Eb3 minor color
          { type: 'sine' as OscillatorType, freq: 196.0, gain: 0.04, detune: 5 },       // G3 fifth
        ],
        lfoRate: 0.12,
        lfoDepth: 0.03,
        filterFreq: 800,
      },
      // Zone 1 - Power-Up: Driving, energetic — F minor
      {
        layers: [
          { type: 'sawtooth' as OscillatorType, freq: 87.31, gain: 0.08, detune: 0 },   // F2 bass
          { type: 'square' as OscillatorType, freq: 174.61, gain: 0.04, detune: 7 },    // F3
          { type: 'triangle' as OscillatorType, freq: 207.65, gain: 0.05, detune: -3 }, // Ab3 minor
          { type: 'sine' as OscillatorType, freq: 261.63, gain: 0.04, detune: 5 },      // C4 fifth
          { type: 'square' as OscillatorType, freq: 349.23, gain: 0.02, detune: -5 },   // F4 octave shimmer
        ],
        lfoRate: 0.25,
        lfoDepth: 0.04,
        filterFreq: 1200,
      },
      // Zone 2 - Endgame: Intense, dark — D minor
      {
        layers: [
          { type: 'sawtooth' as OscillatorType, freq: 73.42, gain: 0.10, detune: 0 },   // D2 bass
          { type: 'sawtooth' as OscillatorType, freq: 146.83, gain: 0.05, detune: -8 }, // D3 detuned
          { type: 'triangle' as OscillatorType, freq: 174.61, gain: 0.06, detune: 3 },  // F3 minor
          { type: 'sine' as OscillatorType, freq: 220.0, gain: 0.04, detune: 0 },       // A3 fifth
          { type: 'sawtooth' as OscillatorType, freq: 293.66, gain: 0.02, detune: 12 }, // D4 high
        ],
        lfoRate: 0.35,
        lfoDepth: 0.05,
        filterFreq: 1000,
      },
      // Zone 3 - Bumper: Funky, bouncy — G minor
      {
        layers: [
          { type: 'square' as OscillatorType, freq: 98.0, gain: 0.08, detune: 0 },      // G2 bass
          { type: 'triangle' as OscillatorType, freq: 196.0, gain: 0.06, detune: 5 },   // G3
          { type: 'sine' as OscillatorType, freq: 233.08, gain: 0.05, detune: -4 },     // Bb3 minor
          { type: 'square' as OscillatorType, freq: 293.66, gain: 0.03, detune: 8 },    // D4 fifth
        ],
        lfoRate: 0.4,
        lfoDepth: 0.06,
        filterFreq: 1500,
      },
      // Zone 4 - Master: Epic, full — E minor
      {
        layers: [
          { type: 'sawtooth' as OscillatorType, freq: 82.41, gain: 0.10, detune: 0 },   // E2 bass
          { type: 'sawtooth' as OscillatorType, freq: 164.81, gain: 0.06, detune: -5 }, // E3
          { type: 'triangle' as OscillatorType, freq: 196.0, gain: 0.05, detune: 3 },   // G3 minor
          { type: 'sine' as OscillatorType, freq: 246.94, gain: 0.04, detune: 0 },      // B3 fifth
          { type: 'square' as OscillatorType, freq: 329.63, gain: 0.03, detune: 7 },    // E4 octave
          { type: 'sine' as OscillatorType, freq: 493.88, gain: 0.02, detune: -3 },     // B4 high shimmer
        ],
        lfoRate: 0.2,
        lfoDepth: 0.04,
        filterFreq: 1400,
      },
    ];

    const cfg = configs[zone] || configs[0];

    // Shared filter for the zone
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cfg.filterFreq;
    filter.Q.value = 1.5;
    filter.connect(trackGain);

    // Create oscillator layers
    for (const layer of cfg.layers) {
      const osc = ctx.createOscillator();
      osc.type = layer.type;
      osc.frequency.value = layer.freq;
      osc.detune.value = layer.detune;
      const g = ctx.createGain();
      g.gain.value = layer.gain;
      osc.connect(g);
      g.connect(filter);
      osc.start();
      oscs.push(osc);
      gains.push(g);
    }

    // LFO modulating filter cutoff for movement
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = cfg.lfoRate;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = cfg.filterFreq * cfg.lfoDepth;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();
    oscs.push(lfo);
    gains.push(lfoGain);

    // Second LFO for slow volume swell
    const lfo2 = ctx.createOscillator();
    lfo2.type = 'sine';
    lfo2.frequency.value = cfg.lfoRate * 0.5;
    const lfo2Gain = ctx.createGain();
    lfo2Gain.gain.value = 0.02;
    lfo2.connect(lfo2Gain);
    // Modulate the first oscillator's gain for breathing effect
    if (gains.length > 0) {
      lfo2Gain.connect(gains[0].gain);
    }
    lfo2.start();
    oscs.push(lfo2);
    gains.push(lfo2Gain);

    return { oscs, gains, masterGain: trackGain };
  }

  // Set the active music zone with crossfade
  setZone(zone: number) {
    if (!this.musicStarted) return;
    if (zone === this.currentZone) return;
    const ctx = this.ensureCtx();
    if (!this.musicGain) return;

    // Stop any existing fade
    if (this.fadingTrack) {
      this.stopTrack(this.fadingTrack);
      this.fadingTrack = null;
    }

    // Move current track to fading out
    if (this.currentTrack) {
      this.fadingTrack = this.currentTrack;
      // Fade out old track
      this.fadingTrack.masterGain.gain.setValueAtTime(
        this.fadingTrack.masterGain.gain.value, ctx.currentTime
      );
      this.fadingTrack.masterGain.gain.linearRampToValueAtTime(0, ctx.currentTime + this.fadeDuration);
      // Schedule cleanup
      const oldTrack = this.fadingTrack;
      setTimeout(() => {
        this.stopTrack(oldTrack);
        if (this.fadingTrack === oldTrack) this.fadingTrack = null;
      }, this.fadeDuration * 1000 + 100);
    }

    // Create and fade in new track
    this.currentZone = zone;
    this.currentTrack = this.createZoneTrack(zone);
    this.currentTrack.masterGain.gain.setValueAtTime(0, ctx.currentTime);
    this.currentTrack.masterGain.gain.linearRampToValueAtTime(1, ctx.currentTime + this.fadeDuration);
  }

  getCurrentZone(): number { return this.currentZone; }

  // --- SFX ---

  playRoll(speed: number) {
    const ctx = this.ensureCtx();
    if (!this.sfxGain) return;
    const noise = ctx.createOscillator();
    noise.type = 'sawtooth';
    noise.frequency.value = 200 + speed * 300;
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.min(speed * 0.08, 0.06), ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 400 + speed * 600;
    noise.connect(f);
    f.connect(g);
    g.connect(this.sfxGain);
    noise.start();
    noise.stop(ctx.currentTime + 0.05);
  }

  playBounce(intensity: number) {
    const ctx = this.ensureCtx();
    if (!this.sfxGain) return;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(300 + intensity * 200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  }

  playGemCollect() {
    const ctx = this.ensureCtx();
    if (!this.sfxGain) return;
    const notes = [880, 1108, 1320];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, ctx.currentTime + i * 0.08);
      g.gain.linearRampToValueAtTime(0.12, ctx.currentTime + i * 0.08 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.08 + 0.15);
      osc.connect(g);
      g.connect(this.sfxGain!);
      osc.start(ctx.currentTime + i * 0.08);
      osc.stop(ctx.currentTime + i * 0.08 + 0.15);
    });
  }

  playFall() {
    const ctx = this.ensureCtx();
    if (!this.sfxGain) return;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.18, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  }

  playGoal() {
    const ctx = this.ensureCtx();
    if (!this.sfxGain) return;
    const chord = [523, 659, 784, 1047];
    chord.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, ctx.currentTime + i * 0.1);
      g.gain.linearRampToValueAtTime(0.12, ctx.currentTime + i * 0.1 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.4);
      osc.connect(g);
      g.connect(this.sfxGain!);
      osc.start(ctx.currentTime + i * 0.1);
      osc.stop(ctx.currentTime + i * 0.1 + 0.4);
    });
  }

  playTeleport() {
    const ctx = this.ensureCtx();
    if (!this.sfxGain) return;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(2000, ctx.currentTime + 0.15);
    osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1000;
    f.Q.value = 2;
    osc.connect(f);
    f.connect(g);
    g.connect(this.sfxGain);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  }

  playBoost() {
    const ctx = this.ensureCtx();
    if (!this.sfxGain) return;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(300, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.1, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  }

  playButton() {
    const ctx = this.ensureCtx();
    if (!this.sfxGain) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 660;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.08, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  }

  playGameStart() {
    const ctx = this.ensureCtx();
    if (!this.sfxGain) return;
    [440, 554, 659].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, ctx.currentTime + i * 0.12);
      g.gain.linearRampToValueAtTime(0.1, ctx.currentTime + i * 0.12 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.2);
      osc.connect(g);
      g.connect(this.sfxGain!);
      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + i * 0.12 + 0.2);
    });
  }

  playGameOver() {
    const ctx = this.ensureCtx();
    if (!this.sfxGain) return;
    [440, 370, 311, 261].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, ctx.currentTime + i * 0.15);
      g.gain.linearRampToValueAtTime(0.1, ctx.currentTime + i * 0.15 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.3);
      osc.connect(g);
      g.connect(this.sfxGain!);
      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + i * 0.15 + 0.3);
    });
  }

  playAchievement() {
    const ctx = this.ensureCtx();
    if (!this.sfxGain) return;
    [523, 659, 784, 1047, 1318].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, ctx.currentTime + i * 0.07);
      g.gain.linearRampToValueAtTime(0.09, ctx.currentTime + i * 0.07 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.07 + 0.25);
      osc.connect(g);
      g.connect(this.sfxGain!);
      osc.start(ctx.currentTime + i * 0.07);
      osc.stop(ctx.currentTime + i * 0.07 + 0.25);
    });
  }

  playCountdownTick() {
    const ctx = this.ensureCtx();
    if (!this.sfxGain) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 880;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  }

  playIceSlide() {
    const ctx = this.ensureCtx();
    if (!this.sfxGain) return;
    const noise = ctx.createOscillator();
    noise.type = 'sawtooth';
    noise.frequency.value = 3000;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 2000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.03, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    noise.connect(f);
    f.connect(g);
    g.connect(this.sfxGain);
    noise.start();
    noise.stop(ctx.currentTime + 0.08);
  }

  playPowerup(type: 'shield' | 'magnet' | 'slowmo') {
    const ctx = this.ensureCtx();
    if (!this.sfxGain) return;
    const baseFreq = type === 'shield' ? 440 : type === 'magnet' ? 550 : 660;
    const color = type === 'shield' ? 'sine' as OscillatorType : type === 'magnet' ? 'triangle' as OscillatorType : 'square' as OscillatorType;
    [baseFreq, baseFreq * 1.25, baseFreq * 1.5, baseFreq * 2].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = color;
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, ctx.currentTime + i * 0.06);
      g.gain.linearRampToValueAtTime(0.1, ctx.currentTime + i * 0.06 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.06 + 0.2);
      osc.connect(g);
      g.connect(this.sfxGain!);
      osc.start(ctx.currentTime + i * 0.06);
      osc.stop(ctx.currentTime + i * 0.06 + 0.2);
    });
  }

  playShieldBreak() {
    const ctx = this.ensureCtx();
    if (!this.sfxGain) return;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(2000, ctx.currentTime);
    f.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.3);
    osc.connect(f);
    f.connect(g);
    g.connect(this.sfxGain);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  }

  playMagnetPull() {
    const ctx = this.ensureCtx();
    if (!this.sfxGain) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.06, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  }

  playBumper() {
    const ctx = this.ensureCtx();
    if (!this.sfxGain) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.06);
    osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.18, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 80;
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.12, ctx.currentTime);
    sg.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    sub.connect(sg);
    sg.connect(this.sfxGain);
    sub.start();
    sub.stop(ctx.currentTime + 0.1);
  }

  playCombo(count: number) {
    const ctx = this.ensureCtx();
    if (!this.sfxGain) return;
    const baseFreq = 600 + count * 100;
    [baseFreq, baseFreq * 1.25, baseFreq * 1.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, ctx.currentTime + i * 0.05);
      g.gain.linearRampToValueAtTime(0.1, ctx.currentTime + i * 0.05 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.05 + 0.12);
      osc.connect(g);
      g.connect(this.sfxGain!);
      osc.start(ctx.currentTime + i * 0.05);
      osc.stop(ctx.currentTime + i * 0.05 + 0.12);
    });
  }

  playSplitGood() {
    const ctx = this.ensureCtx();
    if (!this.sfxGain) return;
    // Quick ascending chime for PB split
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, ctx.currentTime + i * 0.06);
      g.gain.linearRampToValueAtTime(0.08, ctx.currentTime + i * 0.06 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.06 + 0.12);
      osc.connect(g);
      g.connect(this.sfxGain!);
      osc.start(ctx.currentTime + i * 0.06);
      osc.stop(ctx.currentTime + i * 0.06 + 0.12);
    });
  }

  playVictoryFanfare() {
    const ctx = this.ensureCtx();
    if (!this.sfxGain) return;
    // Triumphant ascending fanfare: C-E-G-C5 with harmonics
    const notes = [
      { freq: 523, delay: 0, dur: 0.3 },    // C5
      { freq: 659, delay: 0.15, dur: 0.3 },  // E5
      { freq: 784, delay: 0.3, dur: 0.3 },   // G5
      { freq: 1047, delay: 0.5, dur: 0.6 },  // C6 (long)
    ];
    for (const n of notes) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = n.freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, ctx.currentTime + n.delay);
      g.gain.linearRampToValueAtTime(0.14, ctx.currentTime + n.delay + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + n.delay + n.dur);
      osc.connect(g);
      g.connect(this.sfxGain!);
      osc.start(ctx.currentTime + n.delay);
      osc.stop(ctx.currentTime + n.delay + n.dur);
      // Harmony (fifth above)
      const osc2 = ctx.createOscillator();
      osc2.type = 'triangle';
      osc2.frequency.value = n.freq * 1.5;
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0, ctx.currentTime + n.delay);
      g2.gain.linearRampToValueAtTime(0.05, ctx.currentTime + n.delay + 0.04);
      g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + n.delay + n.dur * 0.7);
      osc2.connect(g2);
      g2.connect(this.sfxGain!);
      osc2.start(ctx.currentTime + n.delay);
      osc2.stop(ctx.currentTime + n.delay + n.dur);
    }
  }

  playScreenShake() {
    const ctx = this.ensureCtx();
    if (!this.sfxGain) return;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 60;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.06, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 150;
    osc.connect(f);
    f.connect(g);
    g.connect(this.sfxGain);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  }
}
