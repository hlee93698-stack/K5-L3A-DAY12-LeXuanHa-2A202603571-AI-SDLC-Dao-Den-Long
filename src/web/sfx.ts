// Procedural sound effects (WebAudio, no asset files). Browser-only: never used by headless.
export class Sfx {
  private ctx: AudioContext | null = null;
  muted = false;

  unlock() {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        this.ctx = null;
      }
    }
    void this.ctx?.resume();
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain = 0.15, delay = 0, slideTo?: number) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  pickup(carried: number) {
    // pentatonic step rises with how much light Mây carries
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
  win() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.9, 'triangle', 0.1, i * 0.15));
  }
  lose() {
    [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.6, 'triangle', 0.1, i * 0.2));
  }
}
