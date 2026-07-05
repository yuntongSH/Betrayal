/**
 * Beats — cinematic presentation moments derived by diffing consecutive
 * GameStates (the engine in `packages/shared` is untouched). A beat is a card
 * draw, a discovery, a death, the haunt turning, or a special-room note.
 *
 * `card` and `death` beats are modal (one at a time, FIFO); `discovery` and
 * `special` are non-blocking toasts; `haunt` never renders here — the existing
 * haunt banner is simply gated until the modal queue drains.
 *
 * The log strings matched below come verbatim from frozen engine code
 * (engine.ts:173/:213/:270/:274/:277/:424, state.ts:119) — safe to match.
 */
import { create } from "zustand";
import { ALL_CARDS, ROOMS_BY_ID, TRAITS, getCard } from "@dread-hollow/shared";
import type { CardDef, CardType, GameState, RoomDef, Trait } from "@dread-hollow/shared";
import { ambient } from "../audio/ambient";
import { focusPulse } from "../three/director";
import { followTarget } from "../three/followCam";

export { focusPulse };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BeatKind = "discovery" | "card" | "death" | "haunt" | "special";

export interface Beat {
  kind: BeatKind;
  playerId: string | null;
  playerName?: string;
  roomKey: string | null;
  /** card beats */
  cardType?: CardType;
  card?: CardDef;
  /** Display fallbacks when the card lookup misses (future content). */
  name?: string;
  rawText?: string;
  /** death beats */
  charId?: string | null;
  /** Enqueue timestamp (performance.now) — lets activation give a just-issued
   *  walk one retry to visibly start before the world-freeze engages. */
  at?: number;
}

/** A visible dice roll — tumbles, settles onto real faces, then a verdict. */
export interface DiceTray {
  id: number;
  dice: number[];
  verdict: string;
  outcome: "ok" | "bad" | "";
  /** dice[0..settled) show their real face (one lands every DICE_STAGGER_MS). */
  settled: number;
  /** true during the closing fade (DICE_FADE_MS). */
  out: boolean;
}

export interface BeatToast {
  id: number;
  glyph: string;
  text: string;
  color: string;
  out: boolean;
}

/** In-3D side-effect request (light pulse + ember burst) drained by <BeatFX/>. */
export type FxType = "item" | "event" | "omen" | "death" | "haunt" | "discovery";
export interface FxRequest {
  roomKey: string;
  type: FxType;
}
export const pendingFx: FxRequest[] = [];

/** A recent trait change — drives the roster pulse and the 3D float. */
export interface TraitDelta {
  id: number;
  playerId: string;
  trait: Trait;
  delta: number;
}

interface BeatsState {
  queue: Beat[];
  active: Beat | null;
  /** Whether the active modal waits for the watched player (vs auto-dismiss). */
  activeInteractive: boolean;
  /** Auto-dismiss hold for the active modal (null while interactive). */
  activeHoldMs: number | null;
  toasts: BeatToast[];
  /** Bumped per beat so the vignette animation restarts (t-item/t-omen/…). */
  vignette: { type: string; seq: number };
  /** Trait changes from the last couple of seconds (expired by timer). */
  traitDeltas: TraitDelta[];
  /** True from the moment a modal beat shows until the modal queue drains.
   *  Every 3D useFrame site consumes this and halts its simulation (early
   *  return / dt clamped to 0 / mixer timeScale 0) so the frozen frame behind
   *  the card matches the moment the card describes. DOM/CSS keeps animating. */
  worldFrozen: boolean;
  /** The one visible dice roll (rolls queue; never two trays at once). */
  diceTray: DiceTray | null;
  /** Haunt id whose reveal banner this player has dismissed — while the
   *  current haunt's banner is still up (or gated), auto-end must not fire. */
  hauntSeen: string | null;
}

export const useBeats = create<BeatsState>(() => ({
  queue: [],
  active: null,
  activeInteractive: false,
  activeHoldMs: null,
  toasts: [],
  vignette: { type: "", seq: 0 },
  traitDeltas: [],
  worldFrozen: false,
  diceTray: null,
  hauntSeen: null,
}));

export function markHauntSeen(id: string): void {
  useBeats.setState({ hauntSeen: id });
}

/** True while a modal beat is up or pending — game input should be swallowed. */
export function beatsBusy(): boolean {
  const s = useBeats.getState();
  return !!s.active || s.queue.length > 0;
}

// ---------------------------------------------------------------------------
// Modal queue (250ms gap between modals; auto-dismiss for bots/remote players)
// ---------------------------------------------------------------------------

/** Non-interactive holds — long enough to actually read the card. Early
 *  continue (click / Continue / Enter) still dismisses immediately. */
export const CARD_HOLD_MS = 6500;
const DEATH_HOLD_MS = 6500;

/** Walk-arrival gate: a modal must not freeze the world mid-stride. While the
 *  acting token is still walking (followTarget.moving), activation retries
 *  every BEAT_WAIT_RETRY_MS, capped at BEAT_WAIT_MAX_MS per beat — then it
 *  shows anyway. The retry window also gives a just-issued walk one beat of
 *  grace to visibly start (the state lands before the token takes a step). */
const BEAT_WAIT_RETRY_MS = 150;
const BEAT_WAIT_MAX_MS = 3500; // per beat — after this, show anyway

let watched: string | null = null;
let modalTimer: ReturnType<typeof setTimeout> | null = null;
/** Wall-clock end of the active non-interactive hold (0 while interactive) —
 *  lets a dice tray EXTEND the card instead of racing it. */
let modalEndsAt = 0;
let gapTimer: ReturnType<typeof setTimeout> | null = null;
let arrivalTimer: ReturnType<typeof setTimeout> | null = null;
let arrivalDeadline = 0;
let toastSeq = 0;

function enqueue(beat: Beat): void {
  beat.at = performance.now();
  useBeats.setState((s) => ({ queue: [...s.queue, beat] }));
  compressBacklog();
  maybeActivate();
}

/** Bot play outruns the stage (the server steps ~1.1s; a modal holds 5s+gap —
 *  though bots pause while a beat is showing), so a deep queue means reveals
 *  firing on rooms the actor already left. When more than two beats wait, the
 *  oldest non-watched card beats collapse into toasts — their focus pulse and
 *  room FX are skipped — keeping presentation within about one action of live
 *  state. Deaths always stay modal. */
function compressBacklog(): void {
  let queue = useBeats.getState().queue;
  const before = queue.length;
  while (queue.length > 2) {
    const i = queue.findIndex((b) => b.kind === "card" && b.playerId !== watched);
    if (i < 0) break;
    const b = queue[i];
    const look = CARD_TOAST[b.cardType ?? "item"];
    addToast(look.glyph, `${b.playerName ?? "The house"} — ${b.card?.name ?? b.name ?? "a card"}`, look.color);
    queue = queue.filter((_, j) => j !== i);
  }
  if (queue.length !== before) useBeats.setState({ queue });
}

function maybeActivate(): void {
  const s = useBeats.getState();
  if (s.active || gapTimer) return;
  if (s.queue.length === 0) {
    arrivalDeadline = 0;
    if (s.worldFrozen) useBeats.setState({ worldFrozen: false }); // belt and braces
    flushHeldToasts();
    return;
  }
  const [beat, ...rest] = s.queue;

  // Reveals wait for the walker: while the acting token is still covering
  // ground (or its walk hasn't visibly started yet — the state message lands
  // before the first step), defer activation so the world-freeze engages only
  // once the move has been SEEN. Capped per beat, then the card shows anyway.
  const now = performance.now();
  if (arrivalDeadline === 0) arrivalDeadline = now + BEAT_WAIT_MAX_MS;
  const justBorn = now - (beat.at ?? 0) < BEAT_WAIT_RETRY_MS;
  if ((followTarget.moving || justBorn) && now < arrivalDeadline) {
    // The walk must be free to finish — a hold-over freeze from the previous
    // modal would deadlock this wait until the cap.
    if (s.worldFrozen) useBeats.setState({ worldFrozen: false });
    if (!arrivalTimer) {
      arrivalTimer = setTimeout(() => {
        arrivalTimer = null;
        maybeActivate();
      }, BEAT_WAIT_RETRY_MS);
    }
    return;
  }
  arrivalDeadline = 0;
  if (arrivalTimer) {
    clearTimeout(arrivalTimer);
    arrivalTimer = null;
  }

  const interactive = beat.playerId != null && beat.playerId === watched;
  let hold = beat.kind === "death" ? DEATH_HOLD_MS : CARD_HOLD_MS;
  // A dice tray already mid-flight must outlive the card it belongs to.
  if (trayEndsAt > Date.now()) hold = Math.max(hold, trayEndsAt - Date.now() + DICE_CARD_LINGER_MS);
  useBeats.setState({
    active: beat,
    activeInteractive: interactive,
    activeHoldMs: interactive ? null : hold,
    queue: rest,
    worldFrozen: true,
  });
  showEffects(beat);
  if (!interactive) {
    modalEndsAt = Date.now() + hold;
    modalTimer = setTimeout(dismissActive, hold);
  } else {
    modalEndsAt = 0;
  }
}

export function dismissActive(): void {
  if (!useBeats.getState().active) return;
  if (modalTimer) {
    clearTimeout(modalTimer);
    modalTimer = null;
  }
  modalEndsAt = 0;
  // Unfreeze the 3D world exactly when the modal queue drains; a queued
  // follow-up modal keeps it frozen through the 250ms gap (no jerky resume).
  useBeats.setState((s) => ({ active: null, worldFrozen: s.queue.length > 0 }));
  gapTimer = setTimeout(() => {
    gapTimer = null;
    maybeActivate();
  }, 250);
}

/** Camera pulse + light/embers + vignette + sting, fired as a modal shows. */
function showEffects(beat: Beat): void {
  if (beat.roomKey) focusPulse(beat.roomKey);
  const type: FxType = beat.kind === "death" ? "death" : (beat.cardType ?? "item");
  if (beat.roomKey) pendingFx.push({ roomKey: beat.roomKey, type });
  useBeats.setState((s) => ({ vignette: { type, seq: s.vignette.seq + 1 } }));
  ambient.sting(beat.kind === "death" ? "death" : (type as CardType));
}

/** Clear everything (a reconnect must not replay history). */
export function resetBeats(): void {
  if (modalTimer) clearTimeout(modalTimer);
  if (gapTimer) clearTimeout(gapTimer);
  if (arrivalTimer) clearTimeout(arrivalTimer);
  modalTimer = null;
  gapTimer = null;
  arrivalTimer = null;
  arrivalDeadline = 0;
  modalEndsAt = 0;
  for (const t of trayTimers) clearTimeout(t);
  trayTimers = [];
  trayQueue = [];
  trayEndsAt = 0;
  trayCurEndsAt = 0;
  pendingFx.length = 0;
  heldToasts = [];
  useBeats.setState({
    queue: [],
    active: null,
    activeInteractive: false,
    activeHoldMs: null,
    toasts: [],
    traitDeltas: [],
    worldFrozen: false,
    diceTray: null,
    hauntSeen: null,
  });
}

// ---------------------------------------------------------------------------
// Dice tray — every engine roll (trait tests, haunt roll, combat) becomes a
// lower-third overlay: dice tumble ~0.9s, settle onto their real faces one by
// one, a verdict line lands, hold ~2.6s, fade. Rolls queue; never two trays at
// once. Pure DOM/CSS, so it keeps animating while the 3D world is frozen.
// (Constants and class names mirror the artifact frontend exactly.)
// ---------------------------------------------------------------------------

export const DICE_TUMBLE_MS = 900; // spin before the dice settle on their real faces
export const DICE_STAGGER_MS = 90; // per-die settle offset
export const DICE_HOLD_MS = 2600; // read time after the last die settles
export const DICE_FADE_MS = 450;
export const DICE_GAP_MS = 160; // breath between queued trays
export const DICE_CARD_LINGER_MS = 1200; // an open card modal outlives the tray by this
const DICE_QUEUE_MAX = 3; // showing + pending — presentation must not lag the game
export const DIE_PIPS = ["", "•", "• •"]; // Betrayal d6 faces 0 / 1 / 2

/** Full life of one tray, from mount to the gap before the next. */
function trayDuration(n: number): number {
  return DICE_TUMBLE_MS + (n - 1) * DICE_STAGGER_MS + DICE_HOLD_MS + DICE_FADE_MS + DICE_GAP_MS;
}

interface TrayRequest {
  dice: number[];
  verdict: string;
  outcome: "ok" | "bad" | "";
}

let trayQueue: TrayRequest[] = [];
let trayTimers: Array<ReturnType<typeof setTimeout>> = [];
/** When everything queued (including the tray on screen) finishes (Date.now). */
let trayEndsAt = 0;
/** When the tray currently on screen finishes (Date.now; 0 when none). */
let trayCurEndsAt = 0;
let traySeq = 0;

function recomputeTrayEnd(): void {
  let t = trayCurEndsAt || Date.now();
  for (const q of trayQueue) t += trayDuration(q.dice.length);
  trayEndsAt = t;
}

/** Verdict line + ok/bad color, derived from the engine's log text (formats
 *  frozen in engine.ts:306/:332/:458 and haunt.ts combat lines). */
function diceVerdict(text: string, total: number): { verdict: string; outcome: "ok" | "bad" | "" } {
  const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
  // "X rolls might — 3 vs 4: failure."
  let m = text.match(/rolls (\w+) — (\d+) vs (\d+): (success|failure)/);
  if (m) {
    return {
      verdict: `${cap(m[1]!)} ${m[3]} — rolled ${m[2]} · ${m[4]}`,
      outcome: m[4] === "success" ? "ok" : "bad",
    };
  }
  // "X makes the haunt roll: 4 vs 3 omen(s) in play." (roll < omens = the turn)
  m = text.match(/haunt roll: (\d+) vs (\d+) omen/);
  if (m) {
    const holds = Number(m[1]) >= Number(m[2]);
    return {
      verdict: `Haunt roll — ${m[1]} vs ${m[2]} omens · ${holds ? "the house holds" : "the house turns"}`,
      outcome: holds ? "ok" : "bad",
    };
  }
  // "X studies the shadows — Knowledge 3 vs 4."
  m = text.match(/— (\w+) (\d+) vs (\d+)/);
  if (m) {
    const ok = Number(m[2]) >= Number(m[3]);
    return {
      verdict: `${cap(m[1]!)} ${m[3]} — rolled ${m[2]} · ${ok ? "success" : "failure"}`,
      outcome: ok ? "ok" : "bad",
    };
  }
  // Combat and friends: the log line already narrates the outcome.
  return { verdict: `${text.replace(/\.\s*$/, "")} · rolled ${total}`, outcome: "" };
}

function enqueueDiceTray(dice: number[], text: string): void {
  if (dice.length === 0) return;
  const total = dice.reduce((a, b) => a + b, 0);
  trayQueue.push({ dice: [...dice], ...diceVerdict(text, total) });
  // Never two at once — and never an unbounded backlog (a monster phase can
  // log several combats in one dispatch): oldest pending rolls drop.
  while (trayQueue.length > DICE_QUEUE_MAX) trayQueue.shift();
  recomputeTrayEnd();
  maybeShowTray();
  // An open card modal must outlive the roll it demanded.
  extendModalForDice();
}

function maybeShowTray(): void {
  if (useBeats.getState().diceTray) return;
  const next = trayQueue.shift();
  if (!next) {
    trayCurEndsAt = 0;
    return;
  }
  const id = ++traySeq;
  const n = next.dice.length;
  useBeats.setState({ diceTray: { id, ...next, settled: 0, out: false } });
  // Faces flicker while the dice tumble (CSS), then each settles on its real
  // value in stagger order; the verdict fades in once all have landed.
  for (let i = 0; i < n; i++) {
    trayTimers.push(
      setTimeout(() => {
        useBeats.setState((s) =>
          s.diceTray?.id === id ? { diceTray: { ...s.diceTray, settled: i + 1 } } : {},
        );
      }, DICE_TUMBLE_MS + i * DICE_STAGGER_MS),
    );
  }
  const settled = DICE_TUMBLE_MS + (n - 1) * DICE_STAGGER_MS;
  trayTimers.push(
    setTimeout(() => {
      useBeats.setState((s) =>
        s.diceTray?.id === id ? { diceTray: { ...s.diceTray, out: true } } : {},
      );
    }, settled + DICE_HOLD_MS),
    setTimeout(() => {
      useBeats.setState((s) => (s.diceTray?.id === id ? { diceTray: null } : {}));
      maybeShowTray();
    }, settled + DICE_HOLD_MS + DICE_FADE_MS + DICE_GAP_MS),
  );
  trayCurEndsAt = Date.now() + trayDuration(n);
  recomputeTrayEnd();
}

/** A roll landed while a card is up: the card's auto-dismiss stretches until
 *  every queued tray finishes + DICE_CARD_LINGER_MS (never shortened). */
function extendModalForDice(): void {
  const s = useBeats.getState();
  if (!s.active || s.activeInteractive || !modalTimer) return;
  const wantEnd = trayEndsAt + DICE_CARD_LINGER_MS;
  if (wantEnd <= modalEndsAt) return;
  const holdLeft = wantEnd - Date.now();
  clearTimeout(modalTimer);
  modalTimer = setTimeout(dismissActive, holdLeft);
  modalEndsAt = wantEnd;
  useBeats.setState({ activeHoldMs: holdLeft }); // restarts the drain bar
}

// ---------------------------------------------------------------------------
// Trait deltas (roster pulse + rising badge + 3D float over the token)
// ---------------------------------------------------------------------------

let deltaSeq = 0;
/** Outlives both animations (roster badge 1.6s, 3D float 1.8s). */
const TRAIT_DELTA_TTL = 2000;

function pushTraitDelta(playerId: string, trait: Trait, delta: number): void {
  const id = ++deltaSeq;
  useBeats.setState((s) => ({ traitDeltas: [...s.traitDeltas, { id, playerId, trait, delta }] }));
  setTimeout(() => {
    useBeats.setState((s) => ({ traitDeltas: s.traitDeltas.filter((d) => d.id !== id) }));
  }, TRAIT_DELTA_TTL);
}

// ---------------------------------------------------------------------------
// Toasts (non-blocking; 2400ms visible, 500ms fade, max 2 stacked)
// ---------------------------------------------------------------------------

/** Toast dress per card type — matches the reveal card's border colors. */
const CARD_TOAST: Record<CardType, { glyph: string; color: string }> = {
  item: { glyph: "❖", color: "#e2a85a" },
  event: { glyph: "❖", color: "#8f6fd8" },
  omen: { glyph: "☠", color: "#c2412f" },
};

/** Toasts spawned while a reveal owns the stage, replayed once it drains. */
let heldToasts: Array<{ glyph: string; text: string; color: string }> = [];

function flushHeldToasts(): void {
  if (heldToasts.length === 0) return;
  const held = heldToasts;
  heldToasts = [];
  for (const t of held) addToast(t.glyph, t.text, t.color);
}

function addToast(glyph: string, text: string, color: string): void {
  // A modal beat owns the stage (and its backdrop outranks the toast layer) —
  // hold the toast until the reveal queue drains (flushed by maybeActivate)
  // so its timers can't expire unseen behind the dim.
  if (beatsBusy()) {
    heldToasts.push({ glyph, text, color });
    while (heldToasts.length > 4) heldToasts.shift();
    return;
  }
  const id = ++toastSeq;
  useBeats.setState((s) => {
    const toasts = [...s.toasts, { id, glyph, text, color, out: false }];
    while (toasts.length > 2) toasts.shift();
    return { toasts };
  });
  setTimeout(() => {
    useBeats.setState((s) => ({
      toasts: s.toasts.map((t) => (t.id === id ? { ...t, out: true } : t)),
    }));
  }, 2400);
  setTimeout(() => {
    useBeats.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  }, 2900);
}

/** At most one special-room note per action; a room's aura outranks its special. */
function specialToast(def: RoomDef, discovered: boolean): { glyph: string; text: string; color: string } | null {
  if (def.aura && def.aura > 0)
    return { glyph: "✦", text: `Blessed ground — +${def.aura} die to every roll here`, color: "#e2c15a" };
  if (def.aura && def.aura < 0)
    return { glyph: "☓", text: `Cursed ground — ${def.aura} dice to every roll here`, color: "#c2412f" };
  switch (def.special) {
    case "mystic-elevator":
      return { glyph: "⇅", text: "The Caged Lift — it can carry you to another floor", color: "#8f6fd8" };
    case "grand-staircase":
    case "stairs-up":
    case "stairs-down":
      return { glyph: "⇗", text: "Stairs — change floors here", color: "#e2a85a" };
    case "vault":
      return { glyph: "🗝", text: "A sealed vault — it wants the Iron Key", color: "#e2a85a" };
    case "heal-might":
      return discovered ? { glyph: "✚", text: "+1 Might", color: "#7fae6a" } : null;
    case "heal-sanity":
      return discovered ? { glyph: "✚", text: "+1 Sanity", color: "#7fae6a" } : null;
    case "drain-speed":
      return discovered ? { glyph: "▼", text: "−1 Speed", color: "#c2412f" } : null;
    case "pit":
      return discovered ? { glyph: "▼", text: "−1 Might", color: "#c2412f" } : null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Detection — pre-action snapshot vs post-action state (single log pass)
// ---------------------------------------------------------------------------

const CARD_BY_NAME = new Map(ALL_CARDS.map((c) => [c.name, c]));

function byName(next: GameState, name: string) {
  return (
    next.players.find((p) => p.name === name) ??
    next.players.find((p) => p.id === next.activePlayerId)
  );
}

function cardBeat(next: GameState, who: string, type: CardType, name: string, raw: string): Beat {
  const p = byName(next, who);
  return {
    kind: "card",
    playerId: p?.id ?? null,
    playerName: p?.name ?? who,
    roomKey: p?.position ?? null,
    cardType: type,
    card: CARD_BY_NAME.get(name),
    name,
    rawText: raw,
  };
}

export function ingestBeats(prev: GameState | null, next: GameState, watchedId: string | null): void {
  if (!prev) return;
  watched = watchedId;
  const snap = {
    nextLogId: prev.nextLogId,
    hauntId: prev.haunt?.id ?? null,
    houseKeys: new Set(Object.keys(prev.house)),
    posByPlayer: new Map(prev.players.map((p) => [p.id, p.position])),
    aliveByPlayer: new Map(prev.players.map((p) => [p.id, p.alive])),
    invLenByPlayer: new Map(prev.players.map((p) => [p.id, p.inventory.length])),
    traitsByPlayer: new Map(prev.players.map((p) => [p.id, p.traitIndex])),
  };

  // ANY player's trait change animates their roster chip and floats a delta
  // over their 3D token — dice-roll penalties on bots stay legible.
  for (const p of next.players) {
    const before = snap.traitsByPlayer.get(p.id);
    if (!before) continue;
    for (const t of TRAITS) {
      const d = (p.traitIndex[t] ?? 0) - (before[t] ?? 0);
      if (d !== 0) pushTraitDelta(p.id, t, d);
    }
  }

  const fresh = next.log.filter((e) => e.id >= snap.nextLogId); // log ids are monotonic (state.ts:96)
  for (const e of fresh) {
    // Every roll the engine made becomes a visible dice tray (trait tests,
    // the haunt roll, combat) — the board game's soul, not a tiny log chip.
    if (e.dice && e.dice.length > 0) enqueueDiceTray(e.dice, e.text);
    let m: RegExpMatchArray | null = null;
    if (e.kind === "move" && (m = e.text.match(/^(.+) discovers the (.+)\.$/))) {
      const p = byName(next, m[1]!);
      const roomKey = p?.position ?? null;
      // Belt and braces: only count it if the house genuinely grew a new tile.
      if (roomKey && !snap.houseKeys.has(roomKey)) {
        addToast("◈", `Discovered — ${m[2]!}`, "#d8c090");
        focusPulse(roomKey);
        pendingFx.push({ roomKey, type: "discovery" });
        ambient.doorCreak();
      }
    } else if (e.kind === "card" && (m = e.text.match(/^(.+) triggers an Event — (.+?): /))) {
      enqueue(cardBeat(next, m[1]!, "event", m[2]!, e.text));
    } else if (e.kind === "card" && (m = e.text.match(/^(.+) picks up an Item — (.+)\.$/))) {
      enqueue(cardBeat(next, m[1]!, "item", m[2]!, e.text));
    } else if (e.kind === "card" && (m = e.text.match(/^(.+) uncovers an Omen — (.+)\.$/))) {
      enqueue(cardBeat(next, m[1]!, "omen", m[2]!, e.text));
    } else if (e.kind === "card" && / loots the vault!$/.test(e.text)) {
      // Vault loot has no standard string: the prize is whatever card landed
      // in the looter's inventory this action.
      const p =
        next.players.find(
          (pl) => e.text.includes(pl.name) && pl.inventory.length > (snap.invLenByPlayer.get(pl.id) ?? 0),
        ) ?? next.players.find((pl) => pl.id === next.activePlayerId);
      const gained =
        p && p.inventory.length > (snap.invLenByPlayer.get(p.id) ?? 0)
          ? p.inventory[p.inventory.length - 1]
          : undefined;
      const card = gained ? getCard(gained) : undefined;
      enqueue({
        kind: "card",
        playerId: p?.id ?? null,
        playerName: p?.name,
        roomKey: p?.position ?? null,
        cardType: "item",
        card: card ?? undefined,
        name: card?.name ?? "The Vault",
        rawText: card?.text ?? "The vault yields a prize.",
      });
    } else if (e.kind === "death" && / has been lost to the house\.$/.test(e.text)) {
      const name = e.text.slice(0, -" has been lost to the house.".length);
      const p = next.players.find(
        (pl) => pl.name === name && snap.aliveByPlayer.get(pl.id) === true && !pl.alive,
      );
      if (p) {
        enqueue({
          kind: "death",
          playerId: p.id,
          playerName: p.name,
          roomKey: p.position ?? snap.posByPlayer.get(p.id) ?? null,
          charId: p.characterId,
        });
      }
    }
  }

  // The haunt is a state diff, not a log match. It never renders here — the
  // existing haunt banner waits for the modal queue — but the 3D moment fires.
  if (snap.hauntId === null && next.haunt) {
    const wp = next.players.find((p) => p.id === next.activePlayerId);
    const key = next.haunt.startRoomKey ?? wp?.position ?? null;
    if (key) {
      focusPulse(key, 2600);
      pendingFx.push({ roomKey: key, type: "haunt" });
    }
    useBeats.setState((s) => ({ vignette: { type: "haunt", seq: s.vignette.seq + 1 } }));
    ambient.sting("reveal"); // the dissonant swell, the moment the house turns
  }

  // Special-room note when the watched player arrives somewhere notable
  // (fires on move-to AND explore; discovery-only effects need a fresh tile).
  const me = watchedId ? next.players.find((p) => p.id === watchedId) : undefined;
  if (me?.position && snap.posByPlayer.get(me.id) !== me.position) {
    const placed = next.house[me.position];
    const def = placed ? ROOMS_BY_ID[placed.roomId] : undefined;
    if (def) {
      const t = specialToast(def, !snap.houseKeys.has(me.position));
      if (t) addToast(t.glyph, t.text, t.color);
    }
  }
}
