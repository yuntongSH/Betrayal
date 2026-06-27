/**
 * Low-level readers and mutators over GameState.
 *
 * These are shared by the main engine and the haunt logic, and deliberately
 * import nothing from either of those — keeping the dependency graph acyclic.
 */
import type {
  GameState,
  LogKind,
  PlayerId,
  PlayerState,
  Trait,
} from "./types";
import { CHARACTERS_BY_ID } from "./content/characters";
import { getCard, ROOMS_BY_ID } from "./content";

export function getPlayer(s: GameState, id: PlayerId | null): PlayerState | undefined {
  if (!id) return undefined;
  return s.players.find((p) => p.id === id);
}

export function getActivePlayer(s: GameState): PlayerState | undefined {
  return getPlayer(s, s.activePlayerId);
}

export function livingPlayers(s: GameState): PlayerState[] {
  return s.players.filter((p) => p.alive);
}

/** The trait track of a player's chosen character. */
function track(p: PlayerState, trait: Trait): number[] {
  const c = p.characterId ? CHARACTERS_BY_ID[p.characterId] : undefined;
  return c ? c.traits[trait].values : [0];
}

/** Base trait value from the character track at the player's current index. */
export function baseTrait(p: PlayerState, trait: Trait): number {
  const values = track(p, trait);
  const idx = Math.max(0, Math.min(values.length - 1, p.traitIndex[trait] ?? 0));
  return values[idx] ?? 0;
}

/** Sum of "+N to a trait" bonuses from carried items. */
export function itemTraitBonus(p: PlayerState, trait: Trait): number {
  let bonus = 0;
  for (const cardId of p.inventory) {
    const card = getCard(cardId);
    if (card?.effect.kind === "item-passive" && card.effect.trait === trait) {
      bonus += card.effect.bonus ?? 0;
    }
  }
  return bonus;
}

/** Sum of combat bonuses from items carrying a given tag (e.g. "weapon"). */
export function itemTagBonus(p: PlayerState, tag: string): number {
  let bonus = 0;
  for (const cardId of p.inventory) {
    const card = getCard(cardId);
    if (card?.effect.kind === "item-passive" && card.effect.tag === tag) {
      bonus += card.effect.bonus ?? 0;
    }
  }
  return bonus;
}

export function hasTag(p: PlayerState, tag: string): boolean {
  return p.inventory.some((id) => {
    const card = getCard(id);
    return card?.effect.kind === "item-passive" && card.effect.tag === tag;
  });
}

/** Effective trait value used for rolls: base track value + item bonuses. */
export function effectiveTrait(p: PlayerState, trait: Trait): number {
  return Math.max(0, baseTrait(p, trait) + itemTraitBonus(p, trait));
}

/** Standing dice modifier from the room a player currently occupies (blessed/cursed). */
export function roomAura(s: GameState, p: PlayerState): number {
  if (!p.position) return 0;
  const room = s.house[p.position];
  return room ? ROOMS_BY_ID[room.roomId]?.aura ?? 0 : 0;
}

export function addLog(
  s: GameState,
  text: string,
  kind: LogKind = "info",
  dice?: number[],
): void {
  s.log.push({ id: s.nextLogId++, turn: s.turn, text, kind, dice });
  // Keep the log from growing without bound during long games.
  if (s.log.length > 250) s.log.splice(0, s.log.length - 250);
}

/**
 * Shift a trait up or down by `delta` index spaces, clamped to the track.
 * If the index reaches the skull (0) the player dies. Returns true if the
 * player died as a result.
 */
export function modTrait(
  s: GameState,
  p: PlayerState,
  trait: Trait,
  delta: number,
): boolean {
  if (!p.alive) return false;
  const values = track(p, trait);
  const max = values.length - 1;
  const next = Math.max(0, Math.min(max, (p.traitIndex[trait] ?? 0) + delta));
  p.traitIndex[trait] = next;
  if (next <= 0) {
    p.alive = false;
    addLog(s, `${p.name} has been lost to the house.`, "death");
    dropInventory(s, p);
    return true;
  }
  return false;
}

/**
 * When an explorer dies their belongings spill onto the floor of the room they
 * fell in, where the living can recover them — so a haunt that needs a carried
 * item (e.g. the Iron Key) can't be soft-locked by that carrier's death.
 */
export function dropInventory(s: GameState, p: PlayerState): void {
  if (!p.position || p.inventory.length === 0) return;
  const pile = (s.itemPiles[p.position] ??= []);
  pile.push(...p.inventory);
  addLog(s, `${p.name}'s belongings spill across the floor.`, "death");
  p.inventory = [];
}

/**
 * The view of the game a single player is allowed to see. The networked server
 * sends each client only their own redaction, so secret information can't leak
 * over the wire (e.g. via dev-tools): the traitor's objective is hidden from
 * everyone but the traitor. The traitor's *identity* stays public — it's
 * announced at the reveal — and there is nothing to hide before the haunt, so
 * the original state is returned untouched in those cases.
 */
export function redactStateForPlayer(
  s: GameState,
  viewerId: PlayerId | null,
): GameState {
  if (!s.haunt) return s;
  // Once the night is over there are no more secrets — show everyone the truth.
  if (s.phase === "ended") return s;
  const viewer = getPlayer(s, viewerId);
  if (viewer?.side === "traitor") return s;
  return {
    ...s,
    haunt: {
      ...s.haunt,
      traitorGoal: "Unknown — the traitor's true purpose is hidden from you.",
    },
  };
}
