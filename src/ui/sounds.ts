export class Sounds {
  private ctx: AudioContext | null = null;
  private enabled = true;

  toggle() { this.enabled = !this.enabled; }

  private ensure() {
    if (!this.ctx) this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }

  blip(freq = 880, durationMs = 60) {
    if (!this.enabled) return;
    this.ensure();
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    gain.gain.value = 0.05;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationMs/1000);
  }
}
