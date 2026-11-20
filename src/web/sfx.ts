// Procedural audio (WebAudio, no asset files): night music + effects. Browser-only, never used by headless.
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: { stop: () => void } | null = null;
  private volume = 0.7;

  unlock() {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.ctx.destination);
      } catch {
        this.ctx = null;
      }
    }
    void this.ctx?.resume();
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain = 0.15, delay = 0, slideTo?: number) {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.volume <= 0) return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  /** Soft night pad: slow arpeggio over a drone, loops until stopped. */
  startMusic(night: number) {
    this.stopMusic();
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const roots = [220, 196, 174.6];
    const root = roots[(night - 1) % roots.length];
    const drone = ctx.createOscillator();
    const dg = ctx.createGain();
    drone.type = 'sine';
    drone.frequency.value = root / 2;
    dg.gain.value = 0.035;
    drone.connect(dg).connect(this.master);
    drone.start();
    const steps = [1, 1.2, 1.5, 1.8, 1.5, 1.2];
    let i = 0;
    const timer = setInterval(() => {
      this.tone(root * steps[i % steps.length], 1.4, 'triangle', 0.035);
      i++;
    }, 700);
    this.music = {
      stop: () => {
        clearInterval(timer);
        try {
          drone.stop();
        } catch {}
      },
    };
  }
  stopMusic() {
    this.music?.stop();
    this.music = null;
  }

  pickup(carried: number) {
    const scale = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760];
    this.tone(scale[Math.min(scale.length - 1, Math.max(0, carried - 1))], 0.18, 'sine', 0.12);
  }
  deposit() {
    this.tone(392, 0.25, 'triangle', 0.12);
  }
  lanternLit() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.6, 'sine', 0.1, i * 0.09));
  }
  pulse() {
    this.tone(880, 0.35, 'sine', 0.12, 0, 220);
  }
  hit() {
    this.tone(160, 0.35, 'sawtooth', 0.12, 0, 60);
  }
  jump() {
    this.tone(330, 0.15, 'square', 0.05, 0, 520);
  }
  dash() {
    this.tone(700, 0.12, 'sawtooth', 0.05, 0, 1400);
  }
  shadeSpawn() {
    this.tone(110, 0.6, 'sawtooth', 0.06, 0, 70);
  }
  steal() {
    this.tone(990, 0.3, 'triangle', 0.08, 0, 330);
  }
  charm() {
    [784, 1175].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.09, i * 0.08));
  }
  windWarn() {
    this.tone(200, 1.2, 'sine', 0.05, 0, 600);
  }
  countdown(sec: number) {
    this.tone(sec <= 3 ? 1320 : 990, 0.08, 'square', 0.06);
  }
  win() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.9, 'triangle', 0.1, i * 0.15));
  }
  lose() {
    [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.6, 'triangle', 0.1, i * 0.2));
  }
}
