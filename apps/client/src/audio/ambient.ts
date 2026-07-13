/**
 * Audio façade — the app keeps importing `ambient` from here, but the music
 * itself now lives in the shared DreadScore engine (@dread-hollow/decor):
 * scene beds (lobby/explore/haunt/ended), a peril layer, and reveal stings.
 *
 * This file only owns the glue: the autoplay-unlock AudioContext (must be
 * created inside a user gesture — the AudioToggle click), mute (forwarded to
 * setVolume), phase → setScene forwarding, setHeart → setPeril, and one local
 * door-creak one-shot the score contract doesn't cover.
 */
import { createDreadScore, type DreadScore } from "@dread-hollow/decor";

type WindowWithWebkit = Window & { webkitAudioContext?: typeof AudioContext };

export type ScoreScene = "lobby" | "explore" | "haunt" | "ended";
export type ScoreSting = "omen" | "event" | "item" | "death" | "reveal";

export class Ambient {
  private ctx: AudioContext | null = null;
  private score: DreadScore | null = null;
  private started = false;
  private muted = false;
  /** Remembered so a late start() joins the story where it stands. */
  private scene: ScoreScene = "lobby";
  private peril = false;

  get isStarted(): boolean {
    return this.started;
  }
  get isMuted(): boolean {
    return this.muted;
  }

  /** Must be called from a user gesture (browser autoplay policy). */
  start(): void {
    if (this.started) return;
    const Ctx =
      window.AudioContext ?? (window as WindowWithWebkit).webkitAudioContext;
    if (!Ctx) return;

    this.ctx = new Ctx();
    void this.ctx.resume?.().catch(() => undefined);
    this.started = true;

    this.score = createDreadScore(this.ctx);
    this.score.start();
    this.score.setScene(this.scene);
    this.score.setPeril(this.peril);
    this.score.setVolume(this.muted ? 0 : 1);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.score?.setVolume(muted ? 0 : 1);
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /** Phase → scene bed (store.ts forwards lobby/explore/haunt/ended). */
  setScene(scene: ScoreScene): void {
    if (this.scene === scene) return;
    this.scene = scene;
    this.score?.setScene(scene);
  }

  /** Peril layer while an explorer is one step from the skull; off to calm. */
  setHeart(on: boolean): void {
    this.peril = on;
    this.score?.setPeril(on);
  }

  /** Reveal sting: card draws (item/event/omen), a death, or the haunt turn. */
  sting(kind: ScoreSting): void {
    if (this.muted) return;
    this.score?.sting(kind);
  }

  /** A lower, longer creak — a door swinging on its hinges (local one-shot;
   *  the score contract has no door SFX). */
  doorCreak(): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const len = Math.floor(ctx.sampleRate * 0.7);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 330 + Math.random() * 220;
    filter.Q.value = 7;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    src.connect(filter).connect(g).connect(ctx.destination);
    src.start();
    src.stop(ctx.currentTime + 0.7);
  }

  // --- diegetic foley -------------------------------------------------------
  // All procedural, zero-asset, matching doorCreak's local one-shot style. The
  // score (music/stings) still carries the drama; these are the small physical
  // sounds the hands and feet make. Each self-schedules stop() so nothing
  // lingers, and each bails when muted.

  /** A short band of filtered noise — the shared body of every foley hit. */
  private noiseBurst(
    dur: number,
    freq: number,
    q: number,
    peak: number,
    type: BiquadFilterType = "bandpass",
    delay = 0,
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    const t = ctx.currentTime + delay;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + Math.min(0.008, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  /** A pitched blip — a plucked sine/triangle for chimes and thumps. */
  private tone(
    freq: number,
    dur: number,
    peak: number,
    type: OscillatorType = "triangle",
    delay = 0,
    glideTo?: number,
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const o = ctx.createOscillator();
    o.type = type;
    const t = ctx.currentTime + delay;
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** A card drawn and turned face-up: a quick paper riffle then a soft slap. */
  cardFlip(): void {
    if (!this.ctx || this.muted) return;
    this.noiseBurst(0.09, 2600, 1.2, 0.14, "highpass"); // the riffle
    this.noiseBurst(0.05, 900, 2.5, 0.1, "bandpass", 0.1); // laid down
  }

  /** Dice tumbling out and settling: a scatter of little clacks. */
  diceRoll(): void {
    if (!this.ctx || this.muted) return;
    let at = 0;
    const n = 6 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) {
      at += 0.03 + Math.random() * 0.07 * (i / n); // clacks slow as they settle
      this.noiseBurst(0.035, 1200 + Math.random() * 1400, 3.5, 0.09, "bandpass", at);
    }
  }

  /** An item taken into hand: a small bright two-note lift with a metal ring. */
  pickup(): void {
    if (!this.ctx || this.muted) return;
    this.tone(523, 0.12, 0.12, "triangle"); // C5
    this.tone(784, 0.18, 0.1, "triangle", 0.07); // up to G5 — an acquisition
    this.noiseBurst(0.12, 5200, 6, 0.04, "bandpass", 0.02); // a faint chime tail
  }

  /** A single footstep — a soft low scuff. Kept very quiet: it fires often. */
  footstep(): void {
    if (!this.ctx || this.muted) return;
    this.noiseBurst(0.08, 190, 1.4, 0.05, "lowpass");
    this.tone(70, 0.07, 0.045, "sine", 0, 48);
  }

  /** A combat impact — a heavy body thump under a crack. */
  thud(): void {
    if (!this.ctx || this.muted) return;
    this.tone(120, 0.18, 0.22, "sine", 0, 55); // the blow lands
    this.noiseBurst(0.12, 800, 1.0, 0.14, "lowpass"); // the crack
  }

  dispose(): void {
    this.score?.stop();
    this.score = null;
    this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.started = false;
  }
}

/** Shared singleton — one score for the whole app. */
export const ambient = new Ambient();
