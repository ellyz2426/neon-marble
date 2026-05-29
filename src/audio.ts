// audio.ts — Procedural Web Audio manager for Neon Marble VR

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicOsc: OscillatorNode | null = null;
  private musicLfo: OscillatorNode | null = null;
  private padOsc: OscillatorNode | null = null;
  private musicStarted = false;

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

    // Ambient drone — 55Hz sine base + triangle pad + LFO
    this.musicOsc = ctx.createOscillator();
    this.musicOsc.type = 'sine';
    this.musicOsc.frequency.value = 55;
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.15;
    this.musicOsc.connect(droneGain);
    droneGain.connect(this.musicGain);
    this.musicOsc.start();

    this.padOsc = ctx.createOscillator();
    this.padOsc.type = 'triangle';
    this.padOsc.frequency.value = 82.5;
    const padGain = ctx.createGain();
    padGain.gain.value = 0.08;
    this.padOsc.connect(padGain);
    padGain.connect(this.musicGain);
    this.padOsc.start();

    // LFO modulating drone volume
    this.musicLfo = ctx.createOscillator();
    this.musicLfo.type = 'sine';
    this.musicLfo.frequency.value = 0.15;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.04;
    this.musicLfo.connect(lfoGain);
    lfoGain.connect(droneGain.gain);
    this.musicLfo.start();
  }

  stopMusic() {
    try { this.musicOsc?.stop(); } catch {}
    try { this.padOsc?.stop(); } catch {}
    try { this.musicLfo?.stop(); } catch {}
    this.musicOsc = null;
    this.padOsc = null;
    this.musicLfo = null;
    this.musicStarted = false;
  }

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
    // Rising arpeggio
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
}
