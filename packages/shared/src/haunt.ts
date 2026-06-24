/**
 * The haunt: triggering the betrayal, splitting the party, monster turns and
 * combat resolution. Depends only on state/house/content — never the engine —
 * so the engine can call into it without an import cycle.
 */
import type { GameState, PlayerId, Side } from "./types";
import { Rng } from "./rng";
import { HAUNTS, HAUNTS_BY_ID } from "./content";
import type { HauntContext } from "./content";
import {
  addLog,
  effectiveTrait,
  getPlayer,
  itemTagBonus,
  modTrait,
} from "./state";
import { stepToward } from "./house";
import { rollDice } from "./dice";

function livingHeroes(s: GameState) {
  return s.players.filter((p) => p.side === "heroes" && p.alive && p.position);
}

/** Deterministically choose which scenario fires from the game's RNG. */
function selectHauntId(s: GameState): string {
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
): void {
  const def = HAUNTS_BY_ID[selectHauntId(s)];
  if (!def) return;

  const traitorIds = def.chooseTraitors
    ? def.chooseTraitors(s, triggerPlayerId)
    : [triggerPlayerId];

  const trigger = getPlayer(s, triggerPlayerId);
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

  s.phase = "haunt";
  const traitorNames = traitorIds
    .map((id) => getPlayer(s, id)?.name ?? "someone")
    .join(", ");
  addLog(s, `THE HAUNT BEGINS — ${def.name}`, "haunt");
  addLog(s, def.reveal.replace("{traitor}", traitorNames), "haunt");
  addLog(s, `Traitor: ${traitorNames}.`, "haunt");
  addLog(s, `Heroes: ${def.heroGoal}`, "haunt");
  checkWinNow(s);
}

/** Consult the active haunt's win condition; end the game if it's decided. */
export function checkWinNow(s: GameState): void {
  if (!s.haunt || s.phase !== "haunt") return;
  const def = HAUNTS_BY_ID[s.haunt.id];
  if (!def) return;
  const result: Side | null = def.checkWin(s);
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
  const weapon = itemTagBonus(attacker, "weapon");
  const atk = rollDice(rng, effectiveTrait(attacker, "might") + weapon);

  if (opts.monsterId) {
    const m = s.haunt.monsters.find((x) => x.id === opts.monsterId && x.hp > 0);
    if (!m || m.position !== attacker.position) {
      s.rngState = rng.state;
      return;
    }
    s.attacksLeft -= 1;
    const def = rollDice(rng, m.might);
    if (atk.total >= def.total) {
      const dmg = Math.max(1, atk.total - def.total);
      m.hp -= dmg;
      addLog(
        s,
        `${attacker.name} strikes the ${m.name} for ${dmg}.`,
        "combat",
        atk.dice,
      );
      if (m.hp <= 0) addLog(s, `The ${m.name} is destroyed!`, "combat");
    } else {
      const dmg = Math.max(1, def.total - atk.total);
      addLog(s, `The ${m.name} turns on ${attacker.name}.`, "combat", def.dice);
      modTrait(s, attacker, "might", -dmg);
    }
  } else if (opts.targetPlayerId) {
    const target = getPlayer(s, opts.targetPlayerId);
    if (!target?.alive || target.position !== attacker.position) {
      s.rngState = rng.state;
      return;
    }
    s.attacksLeft -= 1;
    const armor = itemTagBonus(target, "armor");
    const def = rollDice(rng, effectiveTrait(target, "might") + armor);
    if (atk.total > def.total) {
      const dmg = Math.max(1, atk.total - def.total);
      addLog(s, `${attacker.name} attacks ${target.name}!`, "combat", atk.dice);
      modTrait(s, target, "might", -dmg);
    } else {
      const dmg = Math.max(1, def.total - atk.total);
      addLog(
        s,
        `${target.name} overpowers ${attacker.name}.`,
        "combat",
        def.dice,
      );
      modTrait(s, attacker, "might", -dmg);
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

    let target = heroes.find((h) => h.position === m.position);
    if (!target) {
      const targetKeys = new Set(heroes.map((h) => h.position as string));
      const step = stepToward(s, m.position, targetKeys);
      if (step && step !== m.position) m.position = step;
      target = heroes.find((h) => h.position === m.position);
    }

    if (target) {
      const atk = rollDice(rng, m.might);
      const armor = itemTagBonus(target, "armor");
      const def = rollDice(rng, effectiveTrait(target, "might") + armor);
      if (atk.total > def.total) {
        const dmg = Math.max(1, atk.total - def.total);
        addLog(s, `The ${m.name} savages ${target.name}.`, "combat", atk.dice);
        modTrait(s, target, "might", -dmg);
      } else {
        addLog(
          s,
          `${target.name} holds off the ${m.name}.`,
          "combat",
          def.dice,
        );
      }
    }
  }

  s.rngState = rng.state;
  checkWinNow(s);
}

/** Per-scenario bookkeeping run when the traitor ends their turn. */
export function onTraitorTurnEnd(s: GameState): void {
  if (s.phase !== "haunt" || !s.haunt) return;
  if (s.haunt.id === "blood-moon") {
    const progress = Number(s.haunt.vars.ritualProgress ?? 0) + 1;
    s.haunt.vars.ritualProgress = progress;
    const needed = Number(s.haunt.vars.ritualNeeded ?? 4);
    addLog(s, `The ritual deepens... (${progress}/${needed})`, "haunt");
  }
  checkWinNow(s);
}
