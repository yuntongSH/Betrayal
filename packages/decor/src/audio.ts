/**
 * Dread Hollow — procedural dark-ambient score. "Scary but pleasant."
 *
 * Pure WebAudio + TypeScript: no DOM, no assets, no dependencies. Node-safe to
 * import — no AudioContext is constructed at module load; `createDreadScore`
 * accepts an injected context (or lazily constructs one on `start()`, which
 * must be called from a user gesture).
 *
 * The music, in layers (quiet → quieter):
 *  - BED — slow pad chords, each chord tone a pair/single of detuned
 *    triangle/sine oscillators through a gentle lowpass. The progression is a
 *    minor-mode loop that RESOLVES (i–VI–iv–V in A minor), 13–28 s per chord
 *    with long equal-power crossfades, so it reads as music, not drone.
 *  - SUB — one sine an octave or two below the root, gliding between chords.
 *  - AIR — looped noise through a wandering bandpass; felt more than heard.
 *  - MELODY — sparse music-box plucks (fast-attack sines through a feedback
 *    delay "reverb"), one fragile 1–5 note phrase every 10–40 s, notes always
 *    drawn from the active chord's pool, humanized timing/velocity.
 *  - Scene color: lobby = warm two-chord sway; explore = the full palette;
 *    haunt = Neapolitan bII in the progression, darker filter, a low bowed-saw
 *    swell, a slow toll, and minor-2nd grace notes on the plucks; ended =
 *    thin, resolved open fifth, almost silent.
 *  - PERIL — additive distant heartbeat plus a slight darkening of the filters.
 *  - STINGERS — short one-shots mixed under the bed, each ending resolved.
 *
 * Everything is scheduled against ctx.currentTime with lookahead from a coarse
 * interval, so tab jank cannot glitch it. One-shots always have stop()
 * scheduled at creation; the persistent graph is fixed-size.
 */

export type DreadScene = "lobby" | "explore" | "haunt" | "ended";
export type StingKind = "omen" | "event" | "item" | "death" | "reveal";

export interface DreadScore {
  start(): void;
  stop(): void;
  setScene(s: DreadScene): void;
  setPeril(on: boolean): void;
  sting(k: StingKind): void;
  /** 0..1 master volume. */
  setVolume(v: number): void;
}

// ---------------------------------------------------------------------------
// Harmony tables (midi note numbers; hz() converts)
// ---------------------------------------------------------------------------

const hz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

interface ChordSpec {
  /** Pad voicing, low → high (root, third, fifth). */
  tones: readonly [number, number, number];
  /** Sub drone note. */
  sub: number;
  /** Melody pool — chord tones + safe color notes, ascending. */
  scale: readonly number[];
}

// A minor is home. Every pool note is consonant against its chord, so the
// melody can never wander atonal.
const Am: ChordSpec = { tones: [45, 48, 52], sub: 33, scale: [69, 72, 74, 76, 79, 81, 84] };
const F6: ChordSpec = { tones: [41, 45, 48], sub: 29, scale: [65, 67, 69, 72, 74, 77, 79] };
const Dm: ChordSpec = { tones: [38, 45, 53], sub: 26, scale: [62, 65, 67, 69, 72, 74, 77] };
const E7: ChordSpec = { tones: [40, 44, 47], sub: 28, scale: [64, 68, 71, 74, 76, 80] };
/** Neapolitan bII — the haunt's minor-second shadow (Bb, with a dark maj7 A). */
const Bb: ChordSpec = { tones: [46, 50, 53], sub: 34, scale: [70, 74, 77, 81, 82] };
/** Bare, settled open fifth+octave for the epilogue. */
const AmOpen: ChordSpec = { tones: [45, 52, 57], sub: 33, scale: [69, 76, 81] };

interface SceneSpec {
  prog: readonly ChordSpec[];
  chordDur: readonly [number, number];
  xfade: number;
  bed: number;
  wind: number;
  sub: number;
  swell: number;
  pluck: number;
  pluckEvery: readonly [number, number];
  phraseLen: readonly [number, number];
  /** Pad lowpass cutoff (Hz). */
  cutoff: number;
  /** Toll interval range (haunt), or null. */
  toll: readonly [number, number] | null;
  /** Probability a phrase opens with a chromatic upper grace note. */
  grace: number;
}

const SCENES: Record<DreadScene, SceneSpec> = {
  lobby: {
    prog: [Am, F6],
    chordDur: [22, 28], xfade: 7,
    bed: 0.24, wind: 0.035, sub: 0.11, swell: 0, pluck: 0.12,
    pluckEvery: [18, 32], phraseLen: [2, 3], cutoff: 1100, toll: null, grace: 0,
  },
  explore: {
    prog: [Am, F6, Dm, E7],
    chordDur: [16, 22], xfade: 6,
    bed: 0.27, wind: 0.05, sub: 0.13, swell: 0, pluck: 0.16,
    pluckEvery: [10, 24], phraseLen: [2, 5], cutoff: 1300, toll: null, grace: 0.1,
  },
  haunt: {
    prog: [Am, Bb, Dm, E7],
    chordDur: [13, 18], xfade: 5,
    bed: 0.29, wind: 0.07, sub: 0.16, swell: 0.07, pluck: 0.13,
    pluckEvery: [12, 26], phraseLen: [2, 4], cutoff: 800, toll: [11, 19], grace: 0.45,
  },
  ended: {
    prog: [AmOpen],
    chordDur: [30, 34], xfade: 9,
    bed: 0.13, wind: 0.02, sub: 0.08, swell: 0, pluck: 0.07,
    pluckEvery: [24, 42], phraseLen: [1, 2], cutoff: 900, toll: null, grace: 0,
  },
};

// ---------------------------------------------------------------------------
// Small deterministic PRNG (mulberry32) — reproducible, and every melodic
// choice it feeds is constrained to the active chord's pool anyway.
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------

const EPS = 0.0004; // exponential ramps may never target 0
const MASTER_CEIL = 0.9;
const TICK_MS = 250;
const AHEAD = 1.2; // lookahead for plucks / heartbeat / tolls (s)
const CHORD_AHEAD = 3.0; // pads fade slowly; schedule them earlier

interface PadVoice {
  gain: GainNode;
  oscs: OscillatorNode[];
  endAt: number;
}

export function createDreadScore(ctx?: AudioContext): DreadScore {
  let ac: AudioContext | null = ctx ?? null;
  let running = false;
  let scene: DreadScene = "lobby";
  let peril = false;
  let volume = 0.75;
  let rand = mulberry32(0xd7ead);
  let timer: ReturnType<typeof setInterval> | null = null;
  let cleanup: ReturnType<typeof setTimeout> | null = null;

  // Persistent graph (rebuilt on every start()).
  let mixBus: GainNode | null = null;
  let masterLP: BiquadFilterNode | null = null;
  let masterGain: GainNode | null = null;
  let padFilter: BiquadFilterNode | null = null;
  let bedLevel: GainNode | null = null;
  let subOsc: OscillatorNode | null = null;
  let subLevel: GainNode | null = null;
  let windAmp: GainNode | null = null;
  let windBP: BiquadFilterNode | null = null;
  let swellLP: BiquadFilterNode | null = null;
  let swellOscs: OscillatorNode[] = [];
  let swellLevel: GainNode | null = null;
  let heartGain: GainNode | null = null;
  let pluckBus: GainNode | null = null;
  let pluckLevel: GainNode | null = null;
  let stingLevel: GainNode | null = null;
  let persistent: Array<OscillatorNode | AudioBufferSourceNode> = [];
  const live = new Set<OscillatorNode | AudioBufferSourceNode>();

  // Musical clock state.
  let padVoices: PadVoice[] = [];
  let harmony: Array<{ t0: number; chord: ChordSpec }> = [];
  let chordIdx = 0;
  let nextChordAt = 0;
  let nextPhraseAt = 0;
  let nextBeatAt = 0;
  let nextTollAt = 0;
  let nextWanderAt = 0;
  let lastStingAt = -1;

  const now = (): number => (ac ? ac.currentTime : 0);
  const rr = (a: number, b: number): number => a + rand() * (b - a);
  const ri = (a: number, b: number): number => Math.floor(rr(a, b + 1 - 1e-9));
  const clamp01 = (v: number): number =>
    Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;

  function ensureCtx(): AudioContext | null {
    if (ac) return ac;
    const g = globalThis as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const Ctor = g.AudioContext ?? g.webkitAudioContext;
    if (!Ctor) return null;
    try {
      ac = new Ctor();
    } catch {
      return null;
    }
    return ac;
  }

  /** Track a one-shot source so stop() can silence stragglers early. */
  function oneShot<T extends OscillatorNode | AudioBufferSourceNode>(src: T): T {
    live.add(src);
    try {
      src.onended = () => live.delete(src);
    } catch {
      /* mock contexts may not support onended */
    }
    return src;
  }

  /** attack → sustain → release envelope on a gain param (absolute times). */
  function env(g: GainNode, t0: number, atk: number, peak: number, t1: number, rel: number): void {
    const p = g.gain;
    p.setValueAtTime(0, t0);
    p.linearRampToValueAtTime(peak, t0 + atk);
    p.setValueAtTime(peak, t1);
    p.exponentialRampToValueAtTime(EPS, t1 + rel);
  }

  // -------------------------------------------------------------------------
  // Persistent graph
  // -------------------------------------------------------------------------

  function noiseBuffer(a: AudioContext, seconds: number): AudioBuffer {
    const len = Math.max(1, Math.floor(a.sampleRate * seconds));
    const buffer = a.createBuffer(1, len, a.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = rand() * 2 - 1;
    return buffer;
  }

  function buildGraph(a: AudioContext): void {
    persistent = [];
    padVoices = [];
    harmony = [];
    const t = a.currentTime;
    const spec = SCENES[scene];

    // Master chain: mixBus → gentle lowpass → soft compressor → master gain.
    mixBus = a.createGain();
    mixBus.gain.value = 1;
    masterLP = a.createBiquadFilter();
    masterLP.type = "lowpass";
    masterLP.frequency.value = peril ? 1700 : 2400;
    masterLP.Q.value = 0.4;
    const comp = a.createDynamicsCompressor();
    comp.threshold.value = -26;
    comp.knee.value = 24;
    comp.ratio.value = 6;
    comp.attack.value = 0.005;
    comp.release.value = 0.3;
    masterGain = a.createGain();
    masterGain.gain.value = 0;
    mixBus.connect(masterLP);
    masterLP.connect(comp);
    comp.connect(masterGain);
    masterGain.connect(a.destination);

    // Bed: pad voices → shared lowpass → level → mix.
    padFilter = a.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.value = spec.cutoff * (peril ? 0.72 : 1);
    padFilter.Q.value = 0.5;
    bedLevel = a.createGain();
    bedLevel.gain.value = spec.bed;
    padFilter.connect(bedLevel);
    bedLevel.connect(mixBus);

    // Sub drone: one sine, retuned per chord with a slow glide.
    subOsc = a.createOscillator();
    subOsc.type = "sine";
    subOsc.frequency.value = hz(spec.prog[0].sub);
    subLevel = a.createGain();
    subLevel.gain.value = spec.sub;
    subOsc.connect(subLevel);
    subLevel.connect(mixBus);
    subOsc.start(t);
    persistent.push(subOsc);

    // Air: looped noise through a slowly wandering bandpass. The wander is
    // scheduled from the tick (setTargetAtTime walks) — no LFO oscillators.
    const windSrc = a.createBufferSource();
    windSrc.buffer = noiseBuffer(a, 2);
    windSrc.loop = true;
    windBP = a.createBiquadFilter();
    windBP.type = "bandpass";
    windBP.frequency.value = 320;
    windBP.Q.value = 0.6;
    windAmp = a.createGain();
    windAmp.gain.value = spec.wind;
    windSrc.connect(windBP);
    windBP.connect(windAmp);
    windAmp.connect(mixBus);
    windSrc.start(t);
    persistent.push(windSrc);

    // Haunt swell: two low saws under a dark, slowly yawning lowpass.
    swellLP = a.createBiquadFilter();
    swellLP.type = "lowpass";
    swellLP.frequency.value = 260;
    swellLP.Q.value = 0.7;
    swellLevel = a.createGain();
    swellLevel.gain.value = spec.swell;
    swellLP.connect(swellLevel);
    swellLevel.connect(mixBus);
    swellOscs = [0, 7].map((interval) => {
      const o = a.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = hz(spec.prog[0].sub + 12 + interval);
      o.connect(swellLP as BiquadFilterNode);
      o.start(t);
      persistent.push(o);
      return o;
    });

    // Peril heartbeat layer (thumps are scheduled one-shots through this).
    heartGain = a.createGain();
    heartGain.gain.value = peril ? 0.5 : 0;
    heartGain.connect(mixBus);

    // Music-box plucks → feedback-delay "reverb" → level → mix.
    pluckBus = a.createGain();
    pluckBus.gain.value = 1;
    pluckLevel = a.createGain();
    pluckLevel.gain.value = spec.pluck;
    pluckLevel.connect(mixBus);
    pluckBus.connect(pluckLevel); // dry
    const send = a.createGain();
    send.gain.value = 0.6;
    const delay = a.createDelay(1.0);
    delay.delayTime.value = 0.34;
    const damp = a.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 1600;
    const fb = a.createGain();
    fb.gain.value = 0.38;
    const wet = a.createGain();
    wet.gain.value = 0.55;
    pluckBus.connect(send);
    send.connect(delay);
    delay.connect(damp);
    damp.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    wet.connect(pluckLevel);

    // Stinger bus.
    stingLevel = a.createGain();
    stingLevel.gain.value = 0.9;
    stingLevel.connect(mixBus);
  }

  // -------------------------------------------------------------------------
  // Bed chords
  // -------------------------------------------------------------------------

  /** Which chord governs time t (melody looks this up, anticipating changes). */
  function chordAt(t: number): ChordSpec {
    let best = SCENES[scene].prog[0];
    for (const h of harmony) if (h.t0 <= t + 0.01) best = h.chord;
    return best;
  }

  function scheduleChordVoice(a: AudioContext, c: ChordSpec, t0: number, atk: number, dur: number, rel: number): void {
    if (!padFilter) return;
    // Never let more than two pad voices ring at once (one fading, one rising):
    // if a third would pile up, hurry the oldest out.
    const alive = padVoices.filter((v) => v.endAt > a.currentTime);
    for (let i = 0; i + 1 < alive.length; i++) releaseVoice(alive[i], a.currentTime, 0.6);
    const t1 = t0 + dur;
    const g = a.createGain();
    g.connect(padFilter);
    env(g, t0, atk, 1, t1, rel);
    const stopAt = t1 + rel + 0.1;
    const oscs: OscillatorNode[] = [];
    const mk = (midi: number, level: number, type: OscillatorType, cents: number): void => {
      const o = a.createOscillator();
      o.type = type;
      o.frequency.value = hz(midi);
      o.detune.value = cents;
      const og = a.createGain();
      og.gain.value = level;
      o.connect(og);
      og.connect(g);
      o.start(t0);
      o.stop(stopAt);
      oneShot(o);
      oscs.push(o);
    };
    // Root doubled and detuned for chorus warmth; third/fifth pure and quieter.
    mk(c.tones[0], 0.3, "triangle", -4);
    mk(c.tones[0], 0.3, "triangle", 4);
    mk(c.tones[1], 0.2, "sine", 2);
    mk(c.tones[2], 0.24, "sine", -3);
    padVoices.push({ gain: g, oscs, endAt: stopAt });
    harmony.push({ t0, chord: c });
    if (harmony.length > 4) harmony.shift();
    // The sub and the haunt swell glide to follow the new root.
    subOsc?.frequency.setTargetAtTime(hz(c.sub), Math.max(t0, a.currentTime), 1.6);
    swellOscs.forEach((o, i) =>
      o.frequency.setTargetAtTime(hz(c.sub + 12 + (i === 0 ? 0 : 7)), Math.max(t0, a.currentTime), 1.6),
    );
    nextChordAt = t1;
  }

  function releaseVoice(v: PadVoice, t: number, tc: number): void {
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setTargetAtTime(0, t, tc);
    const stopAt = Math.min(v.endAt, t + tc * 3 + 0.1);
    for (const o of v.oscs) {
      try {
        o.stop(stopAt);
      } catch {
        /* already stopped */
      }
    }
    v.endAt = Math.min(v.endAt, stopAt);
  }

  // -------------------------------------------------------------------------
  // Melody
  // -------------------------------------------------------------------------

  function pluckNote(a: AudioContext, freq: number, t: number, vel: number, decay: number): void {
    if (!pluckBus) return;
    const o = a.createOscillator();
    o.type = "sine";
    o.frequency.value = freq;
    o.detune.value = rr(-6, 6); // humanize intonation a hair
    const g = a.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.005);
    g.gain.exponentialRampToValueAtTime(EPS, t + decay);
    o.connect(g);
    g.connect(pluckBus);
    o.start(t);
    o.stop(t + decay + 0.05);
    oneShot(o);
  }

  function schedulePhrase(a: AudioContext, t: number): void {
    const spec = SCENES[scene];
    const scale = chordAt(t).scale;
    const n = ri(spec.phraseLen[0], spec.phraseLen[1]);
    let idx = ri(0, scale.length - 1);
    let at = t;
    for (let i = 0; i < n; i++) {
      const vel = rr(0.35, 0.85) * (i === 0 ? 1 : 0.85);
      if (i === 0 && rand() < spec.grace) {
        // Haunt inflection: a chromatic upper grace note leaning down a
        // minor 2nd onto the real note.
        pluckNote(a, hz(scale[idx] + 1), at, vel * 0.45, 0.9);
        at += 0.09 + rand() * 0.05;
      }
      pluckNote(a, hz(scale[idx]), at, vel, rr(1.2, 1.8));
      at += rr(0.38, 0.85) + rr(-0.04, 0.04); // humanized spacing
      const step = rand() < 0.7 ? 1 : 2;
      idx = Math.min(scale.length - 1, Math.max(0, idx + (rand() < 0.55 ? -step : step)));
    }
  }

  // -------------------------------------------------------------------------
  // Peril heartbeat + haunt toll
  // -------------------------------------------------------------------------

  function thump(a: AudioContext, t: number, vel: number): void {
    if (!heartGain) return;
    const o = a.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(64, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.16);
    const g = a.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.015);
    g.gain.exponentialRampToValueAtTime(EPS, t + 0.5);
    o.connect(g);
    g.connect(heartGain);
    o.start(t);
    o.stop(t + 0.55);
    oneShot(o);
  }

  function toll(a: AudioContext, t: number): void {
    if (!stingLevel) return;
    const root = hz(chordAt(t).sub + 12); // low A2/E2 territory
    const strike = (freq: number, vel: number, decay: number): void => {
      const o = a.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(freq, t);
      o.frequency.linearRampToValueAtTime(freq * 0.985, t + 3); // bell sag
      const g = a.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vel, t + 0.02);
      g.gain.exponentialRampToValueAtTime(EPS, t + decay);
      o.connect(g);
      g.connect(stingLevel as GainNode);
      o.start(t);
      o.stop(t + decay + 0.05);
      oneShot(o);
    };
    strike(root, 0.16, rr(3.5, 4.5));
    strike(root * 1.5, 0.05, 1.6);
  }

  // -------------------------------------------------------------------------
  // Scheduler
  // -------------------------------------------------------------------------

  function tick(): void {
    if (!running || !ac) return;
    const a = ac;
    try {
      const t = a.currentTime;
      const spec = SCENES[scene];

      if (t + CHORD_AHEAD >= nextChordAt) {
        chordIdx = (chordIdx + 1) % spec.prog.length;
        scheduleChordVoice(a, spec.prog[chordIdx], nextChordAt, spec.xfade, rr(spec.chordDur[0], spec.chordDur[1]), spec.xfade);
      }
      if (t + AHEAD >= nextPhraseAt) {
        schedulePhrase(a, nextPhraseAt);
        nextPhraseAt += rr(spec.pluckEvery[0], spec.pluckEvery[1]);
      }
      if (peril && t + AHEAD >= nextBeatAt) {
        thump(a, nextBeatAt, 0.5);
        thump(a, nextBeatAt + 0.36, 0.34);
        nextBeatAt += 1.4;
      }
      if (spec.toll && t + AHEAD >= nextTollAt) {
        toll(a, nextTollAt);
        nextTollAt += rr(spec.toll[0], spec.toll[1]);
      }
      if (t >= nextWanderAt) {
        // The air drifts: slow random walks on the wind's filter/level and the
        // swell's darkness, in place of LFOs (keeps the oscillator budget lean).
        windBP?.frequency.setTargetAtTime(rr(240, 480), t, 3.5);
        windAmp?.gain.setTargetAtTime(spec.wind * rr(0.6, 1.3), t, 3.5);
        swellLP?.frequency.setTargetAtTime(rr(190, 330), t, 4.5);
        nextWanderAt = t + rr(4, 9);
      }
      // Drop pad voices that have fully faded (bounded node count).
      if (padVoices.some((v) => v.endAt <= t)) {
        for (const v of padVoices) {
          if (v.endAt <= t) {
            try {
              v.gain.disconnect();
            } catch {
              /* ignore */
            }
          }
        }
        padVoices = padVoices.filter((v) => v.endAt > t);
      }
    } catch {
      /* the scheduler must never throw out of an interval */
    }
  }

  function applySceneGains(t: number, tc: number): void {
    const spec = SCENES[scene];
    bedLevel?.gain.setTargetAtTime(spec.bed, t, tc);
    windAmp?.gain.setTargetAtTime(spec.wind, t, tc);
    subLevel?.gain.setTargetAtTime(spec.sub, t, tc);
    swellLevel?.gain.setTargetAtTime(spec.swell, t, tc);
    pluckLevel?.gain.setTargetAtTime(spec.pluck, t, tc);
    padFilter?.frequency.setTargetAtTime(spec.cutoff * (peril ? 0.72 : 1), t, tc);
  }

  // -------------------------------------------------------------------------
  // Stingers — short, resolved, mixed under the bed
  // -------------------------------------------------------------------------

  function stingOmen(a: AudioContext, t: number): void {
    const bus = stingLevel as GainNode;
    // Low piano-ish thud…
    const o = a.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(82, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.3);
    const g = a.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.3, t + 0.02);
    g.gain.exponentialRampToValueAtTime(EPS, t + 1.3);
    o.connect(g);
    g.connect(bus);
    o.start(t);
    o.stop(t + 1.35);
    oneShot(o);
    // …under an airy dissonant shimmer that breathes in and out.
    for (const f of [1174.7, 1244.5]) {
      const s = a.createOscillator();
      s.type = "sine";
      s.frequency.value = f;
      const sg = a.createGain();
      sg.gain.setValueAtTime(0, t);
      sg.gain.linearRampToValueAtTime(0.03, t + 0.7);
      sg.gain.exponentialRampToValueAtTime(EPS, t + 2);
      s.connect(sg);
      sg.connect(bus);
      s.start(t);
      s.stop(t + 2.05);
      oneShot(s);
    }
  }

  function stingEvent(a: AudioContext, t: number): void {
    const bus = stingLevel as GainNode;
    // Violin-harmonic rise: a pure tone gliding up a fifth with a swell.
    const o = a.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(587.3, t);
    o.frequency.exponentialRampToValueAtTime(880, t + 0.8);
    const g = a.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.11, t + 0.5);
    g.gain.exponentialRampToValueAtTime(EPS, t + 1.5);
    o.connect(g);
    g.connect(bus);
    o.start(t);
    o.stop(t + 1.55);
    oneShot(o);
    const h = a.createOscillator(); // faint octave halo
    h.type = "sine";
    h.frequency.setValueAtTime(1174.7, t);
    h.frequency.exponentialRampToValueAtTime(1760, t + 0.8);
    const hg = a.createGain();
    hg.gain.setValueAtTime(0, t);
    hg.gain.linearRampToValueAtTime(0.03, t + 0.5);
    hg.gain.exponentialRampToValueAtTime(EPS, t + 1.2);
    h.connect(hg);
    hg.connect(bus);
    h.start(t);
    h.stop(t + 1.25);
    oneShot(h);
  }

  function stingItem(a: AudioContext, t: number): void {
    if (!pluckBus) return;
    // Small warm bell through the music-box delay: fundamental + shy partial.
    pluckNote(a, 880, t, 0.5, 1.3);
    pluckNote(a, 880 * 2.4, t + 0.005, 0.12, 0.5);
  }

  function stingDeath(a: AudioContext, t: number): void {
    const bus = stingLevel as GainNode;
    // Deep boom…
    const o = a.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(55, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.6);
    const g = a.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.34, t + 0.03);
    g.gain.exponentialRampToValueAtTime(EPS, t + 2.6);
    o.connect(g);
    g.connect(bus);
    o.start(t);
    o.stop(t + 2.65);
    oneShot(o);
    // …then a falling minor phrase on the music box: E5 → C5 → A4.
    const phrase: Array<[number, number]> = [[76, 0.5], [72, 0.44], [69, 0.4]];
    phrase.forEach(([midi, vel], i) => pluckNote(a, hz(midi), t + 0.5 + i * 0.42, vel, 1.9));
  }

  function stingReveal(a: AudioContext, t: number): void {
    const bus = stingLevel as GainNode;
    // A minor-2nd swell whose upper voice bends DOWN onto the unison —
    // dissonance that resolves instead of shrieking.
    const lp = a.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(420, t);
    lp.frequency.linearRampToValueAtTime(1200, t + 2);
    lp.frequency.linearRampToValueAtTime(500, t + 4);
    const g = a.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.15, t + 1.8);
    g.gain.exponentialRampToValueAtTime(EPS, t + 4.2);
    lp.connect(g);
    g.connect(bus);
    const mk = (freq: number, resolveTo?: number): void => {
      const o = a.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(freq, t);
      if (resolveTo !== undefined) {
        o.frequency.setValueAtTime(freq, t + 2.0);
        o.frequency.exponentialRampToValueAtTime(resolveTo, t + 2.9);
      }
      o.connect(lp);
      o.start(t);
      o.stop(t + 4.3);
      oneShot(o);
    };
    mk(220);
    mk(233.08, 220);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  return {
    start(): void {
      if (running) return;
      const a = ensureCtx();
      if (!a) return;
      if (a.state === "suspended" && typeof a.resume === "function") {
        try {
          void a.resume().catch(() => undefined);
        } catch {
          /* ignore */
        }
      }
      if (cleanup !== null) {
        clearTimeout(cleanup);
        cleanup = null;
      }
      rand = mulberry32(0xd7ead);
      buildGraph(a);
      running = true;
      const t = a.currentTime;
      const spec = SCENES[scene];
      chordIdx = 0;
      scheduleChordVoice(a, spec.prog[0], t + 0.05, 3.5, rr(spec.chordDur[0], spec.chordDur[1]), spec.xfade);
      nextPhraseAt = t + rr(4, 8);
      nextBeatAt = t + 0.3;
      nextTollAt = t + rr(5, 9);
      masterGain?.gain.setValueAtTime(0, t);
      masterGain?.gain.linearRampToValueAtTime(volume * MASTER_CEIL, t + 2.5);
      timer = setInterval(tick, TICK_MS);
    },

    stop(): void {
      if (!running || !ac) return;
      running = false;
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      const t = ac.currentTime;
      masterGain?.gain.cancelScheduledValues(t);
      masterGain?.gain.setTargetAtTime(0, t, 0.15);
      const stopAt = t + 0.8;
      for (const src of persistent) {
        try {
          src.stop(stopAt);
        } catch {
          /* already stopped */
        }
      }
      for (const src of live) {
        try {
          src.stop(stopAt);
        } catch {
          /* already stopped */
        }
      }
      live.clear();
      persistent = [];
      padVoices = [];
      swellOscs = [];
      subOsc = null;
      const oldMaster = masterGain;
      cleanup = setTimeout(() => {
        try {
          oldMaster?.disconnect();
        } catch {
          /* ignore */
        }
        cleanup = null;
      }, 1200);
    },

    setScene(s: DreadScene): void {
      if (s !== "lobby" && s !== "explore" && s !== "haunt" && s !== "ended") return;
      if (s === scene) return;
      scene = s;
      if (!running || !ac) return;
      const a = ac;
      const t = a.currentTime;
      applySceneGains(t, 2.2);
      // Pivot the harmony now: release whatever chords are sounding and let
      // the new scene's tonic bloom in over a few seconds.
      for (const v of padVoices) releaseVoice(v, t, 0.8);
      const spec = SCENES[s];
      chordIdx = 0;
      scheduleChordVoice(a, spec.prog[0], t + 0.4, 3.2, rr(spec.chordDur[0], spec.chordDur[1]), spec.xfade);
      nextPhraseAt = t + rr(3, Math.max(4, spec.pluckEvery[0] * 0.5));
      nextTollAt = t + rr(4, 9);
    },

    setPeril(on: boolean): void {
      const next = !!on;
      if (next === peril) return;
      peril = next;
      if (!running || !ac) return;
      const t = ac.currentTime;
      heartGain?.gain.setTargetAtTime(peril ? 0.5 : 0, t, peril ? 1.0 : 0.5);
      masterLP?.frequency.setTargetAtTime(peril ? 1700 : 2400, t, 1.0);
      padFilter?.frequency.setTargetAtTime(SCENES[scene].cutoff * (peril ? 0.72 : 1), t, 1.0);
      if (peril) nextBeatAt = t + 0.25;
    },

    sting(k: StingKind): void {
      if (!running || !ac || !stingLevel) return;
      const a = ac;
      const t = a.currentTime;
      if (t - lastStingAt < 0.09) return; // never let spam stack into a blast
      lastStingAt = t;
      try {
        if (k === "omen") stingOmen(a, t);
        else if (k === "event") stingEvent(a, t);
        else if (k === "item") stingItem(a, t);
        else if (k === "death") stingDeath(a, t);
        else if (k === "reveal") stingReveal(a, t);
      } catch {
        /* a failed sting must never break the score */
      }
    },

    setVolume(v: number): void {
      volume = clamp01(v);
      if (running && ac && masterGain) {
        masterGain.gain.setTargetAtTime(volume * MASTER_CEIL, ac.currentTime, 0.1);
      }
    },
  };
}
