/**
 * The haunt: triggering the betrayal, splitting the party, monster turns and
 * combat resolution. Depends only on state/house/content — never the engine —
 * so the engine can call into it without an import cycle.
 */
import type { GameState, MonsterState, PlayerId, PlayerState, Side, Trait } from "./types";
import { DIFFICULTY_FACTOR, MENTAL_TRAITS, PHYSICAL_TRAITS } from "./types";
import { Rng } from "./rng";
import { CHARACTERS_BY_ID, HAUNTS, HAUNTS_BY_ID, OMENS, ROOMS } from "./content";
import type { HauntContext } from "./content";
import {
  addLog,
  effectiveTrait,
  getPlayer,
  itemTagBonus,
  modTrait,
  roomAura,
} from "./state";
import { stepToward } from "./house";
import { rollDice } from "./dice";

function livingHeroes(s: GameState) {
  return s.players.filter((p) => p.side === "heroes" && p.alive && p.position);
}

/** How a creature fights: which trait a hero rolls to attack it and to defend,
 *  and which carried item tag helps each. Mental foes are fought with the mind. */
function monsterCombat(m: MonsterState): {
  heroAttack: Trait;
  heroDefend: Trait;
  atkTag: string;
  defTag: string;
} {
  return m.attackType === "mental"
    ? { heroAttack: "knowledge", heroDefend: "sanity", atkTag: "occult", defTag: "holy" }
    : { heroAttack: "might", heroDefend: "might", atkTag: "weapon", defTag: "armor" };
}

// Stable ranks so the (omen, room) pair maps to a scenario deterministically.
const OMEN_RANK: Record<string, number> = Object.fromEntries(
  OMENS.map((o, i) => [o.id, i]),
);
const ROOM_RANK: Record<string, number> = Object.fromEntries(
  ROOMS.map((r, i) => [r.id, i]),
);

/**
 * Choose which scenario fires. Faithful to the genre, the (omen, room) pair
 * deterministically selects the haunt — tying the betrayal to the game's actual
 * history rather than pure chance. Only when that context is missing (e.g. a
 * direct test trigger with no room) do we fall back to the RNG.
 */
function selectHauntId(s: GameState, omenId?: string, roomId?: string): string {
  if (omenId != null || roomId != null) {
    const oRank = omenId != null ? OMEN_RANK[omenId] ?? 0 : 0;
    const rRank = roomId != null ? ROOM_RANK[roomId] ?? 0 : 0;
    const idx = (oRank * 3 + rRank) % HAUNTS.length;
    return HAUNTS[idx]!.id;
  }
  const rng = Rng.fromState(s.rngState);
  const def = HAUNTS[rng.int(HAUNTS.length)]!;
  s.rngState = rng.state;
  return def.id;
}

/**
 * The house turns. Build the haunt state, assign sides, run the scenario setup
 * and announce the betrayal. Called by the engine right after a failed haunt
 * roll resolves.
 */
export function triggerHaunt(
  s: GameState,
  triggerPlayerId: PlayerId,
  omenId?: string,
): void {
  // The betrayal happens exactly once. Never rebuild an active haunt (which would
  // reassign the traitor, re-roll the scenario and respawn monsters).
  if (s.haunt || s.phase === "haunt" || s.phase === "ended") return;
  const trigger = getPlayer(s, triggerPlayerId);
  const roomId = trigger?.position ? s.house[trigger.position]?.roomId : undefined;
  const def = HAUNTS_BY_ID[selectHauntId(s, omenId, roomId)];
  if (!def) return;

  const traitorIds = def.chooseTraitors
    ? def.chooseTraitors(s, triggerPlayerId)
    : [triggerPlayerId];
  s.haunt = {
    id: def.id,
    name: def.name,
    traitorIds,
    startedById: triggerPlayerId,
    startRoomKey: trigger?.position ?? null,
    monsters: [],
    heroGoal: def.heroGoal,
    traitorGoal: def.traitorGoal,
    vars: {},
  };

  for (const p of s.players) {
    p.side = traitorIds.includes(p.id) ? "traitor" : "heroes";
  }

  const ctx: HauntContext = {
    rng: Rng.fromState(s.rngState),
    roomKeys: () => Object.keys(s.house),
    spawnKey: () => s.haunt?.startRoomKey ?? Object.keys(s.house)[0] ?? null,
  };
  def.setup(s, traitorIds, ctx);
  s.rngState = ctx.rng.state;

  // Dynamic balance: scale the freshly-spawned monsters to the chosen difficulty
  // (Standard = 1, the tuned baseline; Relaxed softens them, Nightmare hardens).
  const factor = DIFFICULTY_FACTOR[s.difficulty ?? "standard"] ?? 1;
  if (factor !== 1) {
    for (const m of s.haunt.monsters) {
      m.might = Math.max(1, Math.round(m.might * factor));
      m.hp = Math.max(1, Math.round(m.hp * factor));
      m.maxHp = m.hp;
    }
  }

  s.phase = "haunt";
  const traitorNames = traitorIds
    .map((id) => getPlayer(s, id)?.name ?? "someone")
    .join(", ");
  addLog(s, `THE HAUNT BEGINS — ${def.name}`, "haunt");
  addLog(s, def.reveal.replace("{traitor}", traitorNames), "haunt");
  if (traitorIds.length > 0) {
    addLog(s, `Traitor: ${traitorNames}.`, "haunt");
  } else {
    addLog(s, "No traitor walks among you — the house itself is the enemy.", "haunt");
  }
  // The turn speaks: each traitor in their own voice, answered by one hero.
  const speakerRng = Rng.fromState(s.rngState);
  for (const id of traitorIds) {
    const t = getPlayer(s, id);
    const c = t?.characterId ? CHARACTERS_BY_ID[t.characterId] : undefined;
    if (t && c) addLog(s, `${t.name}: “${c.lines.hauntTraitor}”`, "voice");
  }
  const heroSpeakers = livingHeroes(s).filter((p) => p.characterId);
  if (heroSpeakers.length > 0) {
    const h = speakerRng.pick(heroSpeakers);
    const c = CHARACTERS_BY_ID[h.characterId!];
    if (c) addLog(s, `${h.name}: “${c.lines.hauntHero}”`, "voice");
  }
  s.rngState = speakerRng.state;
  addLog(s, `Heroes: ${def.heroGoal}`, "haunt");
  checkWinNow(s);
}

/** How many rounds a haunt may run before dawn forces a resolution. Prevents a
 *  stalemate (e.g. an endless chase between equal-speed figures) soft-locking. */
const HAUNT_ROUND_LIMIT = 40;

/** Consult the active haunt's win condition; end the game if it's decided. */
export function checkWinNow(s: GameState): void {
  if (s.phase === "ended") return;
  // Universal terminal: if the entire party is gone — even before the haunt, via
  // a fatal room special or a failed event roll in the explore phase — the house
  // has won. Without this, a pre-haunt total-party-death left the game stranded
  // (advanceTurn finds no living player and the haunt-only check below no-ops).
  if (s.players.length > 0 && s.players.every((p) => !p.alive)) {
    s.winner = "traitor";
    s.phase = "ended";
    addLog(s, "The last of the explorers falls. The house has swallowed everyone.", "win");
    return;
  }
  if (!s.haunt || s.phase !== "haunt") return;
  const def = HAUNTS_BY_ID[s.haunt.id];
  if (!def) return;
  if (s.haunt.vars.startTurn === undefined) s.haunt.vars.startTurn = s.turn;
  let result: Side | null = def.checkWin(s);
  // Dawn breaker: if no side can force a result in a reasonable span, the night
  // ends — any surviving explorers escape. Guarantees the game terminates.
  if (!result && s.turn - Number(s.haunt.vars.startTurn) > HAUNT_ROUND_LIMIT) {
    const anyHeroAlive = s.players.some((p) => p.side === "heroes" && p.alive);
    result = anyHeroAlive ? "heroes" : "traitor";
    addLog(s, "Grey dawn seeps through the shutters. The long night is finally over.", "haunt");
  }
  if (result) {
    s.winner = result;
    s.phase = "ended";
    addLog(
      s,
      result === "heroes"
        ? "The survivors stagger out into a grey, ordinary dawn. The heroes win."
        : "The house settles, sated, around its new heart. The traitor wins.",
      "win",
    );
    // The night's last word goes to a survivor on the winning side.
    const v = s.players.find((p) => p.side === result && p.alive && p.characterId);
    const c = v?.characterId ? CHARACTERS_BY_ID[v.characterId] : undefined;
    if (v && c) addLog(s, `${v.name}: “${c.lines.victory}”`, "voice");
  }
}

/** A single combat exchange never moves a trait index / monster HP by more than
 *  this. A raw die-pool swing can reach ~12, which would one-shot a full 8-step
 *  trait track — so we cap each hit to keep fights an attrition, not a coin-flip
 *  instakill. */
const MAX_COMBAT_DAMAGE = 3;
function combatDamage(winnerTotal: number, loserTotal: number): number {
  return Math.max(1, Math.min(MAX_COMBAT_DAMAGE, winnerTotal - loserTotal));
}

/**
 * Apply combat damage across the loser's matching trait PAIR — a physical hit
 * spreads over Speed + Might, a mental hit over Sanity + Knowledge — rather than
 * all landing on one trait. Each point comes off whichever of the two is
 * currently furthest from the skull, mirroring how a player distributes damage
 * to stay alive (the board lets the loser choose). Stops early if a trait reaches
 * the skull (the player can die part-way through the spread).
 */
function applyCombatDamage(
  s: GameState,
  p: PlayerState,
  kind: "physical" | "mental",
  amount: number,
): void {
  const [a, b] = kind === "mental" ? MENTAL_TRAITS : PHYSICAL_TRAITS;
  for (let i = 0; i < amount && p.alive; i++) {
    const target = (p.traitIndex[a!] ?? 0) >= (p.traitIndex[b!] ?? 0) ? a! : b!;
    modTrait(s, p, target, -1);
  }
}

/** A player attacks a monster or another player sharing their room. */
export function playerAttack(
  s: GameState,
  attackerId: PlayerId,
  opts: { monsterId?: string; targetPlayerId?: PlayerId },
): void {
  if (s.phase !== "haunt" || !s.haunt) return;
  const attacker = getPlayer(s, attackerId);
  if (!attacker?.alive || !attacker.position) return;
  // One attack per turn — refuse once this turn's attack is spent.
  if (s.attacksLeft <= 0) return;

  const rng = Rng.fromState(s.rngState);

  if (opts.monsterId) {
    const m = s.haunt.monsters.find((x) => x.id === opts.monsterId && x.hp > 0);
    if (!m || m.position !== attacker.position) {
      s.rngState = rng.state;
      return;
    }
    s.attacksLeft -= 1;
    // Spectral foes are fought with the mind (Knowledge/occult), bodily foes
    // with the body (Might/weapon); a loss drains the matching trait.
    const c = monsterCombat(m);
    const atk = rollDice(
      rng,
      Math.max(1, effectiveTrait(attacker, c.heroAttack) + itemTagBonus(attacker, c.atkTag) + roomAura(s, attacker)),
    );
    const def = rollDice(rng, m.might);
    // Ties go to the defender everywhere (the monster here), consistent with the
    // PvP and monster-attack paths below.
    if (atk.total > def.total) {
      const dmg = combatDamage(atk.total, def.total);
      m.hp -= dmg;
      addLog(s, `${attacker.name} strikes the ${m.name} for ${dmg}.`, "combat", atk.dice);
      if (m.hp <= 0) addLog(s, `The ${m.name} is destroyed!`, "combat");
    } else if (def.total > atk.total) {
      const dmg = combatDamage(def.total, atk.total);
      addLog(
        s,
        m.attackType === "mental"
          ? `The ${m.name} claws at ${attacker.name}'s mind.`
          : `The ${m.name} turns on ${attacker.name}.`,
        "combat",
        def.dice,
      );
      applyCombatDamage(s, attacker, m.attackType === "mental" ? "mental" : "physical", dmg);
    } else {
      // A tie deals no damage (board rule) — the two are locked, neither gives.
      addLog(s, `${attacker.name} and the ${m.name} strain together — neither gives ground.`, "combat", atk.dice);
    }
  } else if (opts.targetPlayerId) {
    const target = getPlayer(s, opts.targetPlayerId);
    // No friendly fire: you can only strike a player on the opposing side. This
    // mirrors legalMoves.attackPlayers, so the reducer and the move list agree.
    if (
      !target?.alive ||
      target.position !== attacker.position ||
      target.side === attacker.side
    ) {
      s.rngState = rng.state;
      return;
    }
    s.attacksLeft -= 1;
    const atk = rollDice(
      rng,
      Math.max(1, effectiveTrait(attacker, "might") + itemTagBonus(attacker, "weapon") + roomAura(s, attacker)),
    );
    const def = rollDice(
      rng,
      Math.max(1, effectiveTrait(target, "might") + itemTagBonus(target, "armor") + roomAura(s, target)),
    );
    if (atk.total > def.total) {
      const dmg = combatDamage(atk.total, def.total);
      addLog(s, `${attacker.name} attacks ${target.name}!`, "combat", atk.dice);
      applyCombatDamage(s, target, "physical", dmg);
    } else if (def.total > atk.total) {
      const dmg = combatDamage(def.total, atk.total);
      addLog(s, `${target.name} overpowers ${attacker.name}.`, "combat", def.dice);
      applyCombatDamage(s, attacker, "physical", dmg);
    } else {
      // A tie deals no damage (board rule).
      addLog(s, `${attacker.name} and ${target.name} grapple to a standstill.`, "combat", atk.dice);
    }
  }

  s.rngState = rng.state;
  checkWinNow(s);
}

/**
 * The traitor's monsters act: each living monster attacks a hero in its room,
 * otherwise advances one step along the shortest path toward the nearest hero
 * and attacks if it arrives.
 */
export function monsterPhase(s: GameState): void {
  if (s.phase !== "haunt" || !s.haunt) return;
  const rng = Rng.fromState(s.rngState);

  for (const m of s.haunt.monsters) {
    if (m.hp <= 0 || !m.position) continue;
    const heroes = livingHeroes(s);
    if (heroes.length === 0) break;

    // Roll dice equal to the monster's Speed for its movement this phase (board
    // rule — unlike a player, whose Speed is a fixed budget), stopping the moment
    // it shares a room with a hero. A Speed of 0 marks a rooted thing (a ritual
    // focus) that rolls nothing and never moves.
    let moves = rollDice(rng, m.speed ?? 1).total;
    while (moves > 0 && !heroes.some((h) => h.position === m.position)) {
      const targetKeys = new Set(heroes.map((h) => h.position as string));
      const step = stepToward(s, m.position, targetKeys);
      if (!step || step === m.position) break;
      m.position = step;
      moves -= 1;
    }

    const target = heroes.find((h) => h.position === m.position);
    if (target) {
      const c = monsterCombat(m);
      const atk = rollDice(rng, m.might);
      const def = rollDice(
        rng,
        Math.max(1, effectiveTrait(target, c.heroDefend) + itemTagBonus(target, c.defTag) + roomAura(s, target)),
      );
      if (atk.total > def.total) {
        const dmg = combatDamage(atk.total, def.total);
        addLog(
          s,
          m.attackType === "mental"
            ? `The ${m.name} worms into ${target.name}'s thoughts.`
            : `The ${m.name} savages ${target.name}.`,
          "combat",
          atk.dice,
        );
        applyCombatDamage(s, target, m.attackType === "mental" ? "mental" : "physical", dmg);
      } else {
        // Hero matches or beats the monster's roll: a successful defence, no damage.
        addLog(s, `${target.name} holds off the ${m.name}.`, "combat", def.dice);
      }
    }
  }

  // The dead that don't stay dead reform once the monsters have finished acting,
  // so the heroes still get a clear round of relief from a kill.
  for (const m of s.haunt.monsters) {
    if (m.hp <= 0 && m.respawns) {
      m.hp = m.maxHp ?? 1;
      m.position = s.haunt.startRoomKey ?? m.position;
      addLog(s, `The ${m.name} gathers itself out of the dark once more.`, "combat");
    }
  }

  s.rngState = rng.state;
  checkWinNow(s);
}

/** Per-scenario bookkeeping run when the traitor ends their turn. */
export function onTraitorTurnEnd(s: GameState): void {
  if (s.phase !== "haunt" || !s.haunt) return;
  // Data-driven ritual timer: any haunt that seeds `ritualNeeded` advances its
  // progress at the end of each traitor turn (blood-moon, the effigy, …). The
  // scenario's checkWin decides what reaching `ritualNeeded` means.
  if (s.haunt.vars.ritualNeeded !== undefined) {
    const progress = Number(s.haunt.vars.ritualProgress ?? 0) + 1;
    s.haunt.vars.ritualProgress = progress;
    const needed = Number(s.haunt.vars.ritualNeeded ?? 4);
    const label = String(s.haunt.vars.ritualLabel ?? "The ritual deepens");
    addLog(s, `${label}... (${progress}/${needed})`, "haunt");
  }
  checkWinNow(s);
}
