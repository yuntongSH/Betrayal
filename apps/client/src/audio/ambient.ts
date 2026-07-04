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
