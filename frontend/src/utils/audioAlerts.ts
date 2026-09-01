/**
 * Web Audio API synthesized sound generator for high-tech HUD alerts.
 * Zero external audio file dependencies.
 */
class AudioManager {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private lastAlertTime: number = 0;

  private initContext() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public playBeep(freq = 880, duration = 0.08, type: OscillatorType = 'sine') {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      // Audio context might be restricted before user gesture
    }
  }

  public playCriticalAlert() {
    const now = Date.now();
    if (this.isMuted || now - this.lastAlertTime < 1500) return;
    this.lastAlertTime = now;

    try {
      this.initContext();
      if (!this.ctx) return;

      // Two-tone warble alert
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();

      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(950, this.ctx.currentTime);
      osc1.frequency.linearRampToValueAtTime(600, this.ctx.currentTime + 0.15);
      osc1.frequency.linearRampToValueAtTime(950, this.ctx.currentTime + 0.3);

      gain1.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain1.gain.linearRampToValueAtTime(0.001, this.ctx.currentTime + 0.35);

      osc1.connect(gain1);
      gain1.connect(this.ctx.destination);

      osc1.start();
      osc1.stop(this.ctx.currentTime + 0.35);
    } catch (e) {
      // ignore
    }
  }

  public playCautionChime() {
    const now = Date.now();
    if (this.isMuted || now - this.lastAlertTime < 2000) return;
    this.lastAlertTime = now;

    try {
      this.initContext();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(659.25, this.ctx.currentTime); // E5
      osc.frequency.setValueAtTime(880, this.ctx.currentTime + 0.1); // A5

      gain.gain.setValueAtTime(0.07, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.25);
    } catch (e) {
      // ignore
    }
  }

  public playClick() {
    this.playBeep(1200, 0.03, 'sine');
  }

  public playInjection() {
    this.playBeep(450, 0.12, 'sawtooth');
  }
}

export const audioManager = new AudioManager();
