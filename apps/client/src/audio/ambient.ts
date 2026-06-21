/**
 * Procedural ambient sound — synthesized entirely with the Web Audio API, so
 * the project ships zero audio assets (and zero licensing worries).
 *
 * Three layers: a low detuned drone, filtered "wind" noise, and occasional
 * random creaks. Must be started from a user gesture (browser autoplay policy).
 */
type WindowWithWebkit = Window & { webkitAudioContext?: typeof AudioContext };

export class Ambient {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private started = false;
  private muted = false;
  private creakTimer: number | null = null;

  get isStarted(): boolean {
    return this.started;
  }
  get isMuted(): boolean {
    return this.muted;
  }

  start(): void {
    if (this.started) return;
    const Ctx =
      window.AudioContext ?? (window as WindowWithWebkit).webkitAudioContext;
    if (!Ctx) return;

    const ctx = new Ctx();
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    this.ctx = ctx;
    this.master = master;
    this.started = true;

    this.buildDrone();
    this.buildWind();

    master.gain.linearRampToValueAtTime(this.muted ? 0 : 0.22, ctx.currentTime + 5);
    this.scheduleCreak();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx && this.master) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(
        muted ? 0 : 0.22,
        this.ctx.currentTime + 0.6,
      );
    }
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  private buildDrone(): void {
    const ctx = this.ctx!;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 240;
    filter.connect(this.master!);

    for (const freq of [55, 58.2, 82.5]) {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = 0.18;
      osc.connect(g).connect(filter);
      osc.start();

      // slow breathing on the gain
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.05 + Math.random() * 0.05;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.08;
      lfo.connect(lfoGain).connect(g.gain);
      lfo.start();
    }
  }

  private noiseBuffer(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private buildWind(): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(4);
    src.loop = true;

    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 480;
    band.Q.value = 0.8;

    const g = ctx.createGain();
    g.gain.value = 0.12;

    src.connect(band).connect(g).connect(this.master!);
    src.start();

    // drift the wind's pitch
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain).connect(band.frequency);
    lfo.start();
  }

  private scheduleCreak(): void {
    if (!this.ctx) return;
    const delay = 7000 + Math.random() * 13000;
    this.creakTimer = window.setTimeout(() => {
      this.creak();
      this.scheduleCreak();
    }, delay);
  }

  private creak(): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(0.5);

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 900 + Math.random() * 1400;
    filter.Q.value = 6;

    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

    src.connect(filter).connect(g).connect(this.master!);
    src.start();
    src.stop(ctx.currentTime + 0.5);
  }

  dispose(): void {
    if (this.creakTimer) window.clearTimeout(this.creakTimer);
    this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.started = false;
  }
}

/** Shared singleton — one ambience for the whole app. */
export const ambient = new Ambient();
