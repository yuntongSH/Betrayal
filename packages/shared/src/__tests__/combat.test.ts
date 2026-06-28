import { describe, expect, it } from "vitest";
import { reduce } from "../engine";
import { monsterPhase, triggerHaunt } from "../haunt";
import { beginTurn, createGame, ENTRANCE_KEY } from "../setup";
import { getPlayer, redactStateForPlayer } from "../state";
import { HAUNTS_BY_ID, OMENS } from "../content";
import { key } from "../grid";
import type { GameState, MonsterState } from "../types";

function startedGame(seed = 11): GameState {
  const s = createGame("test", seed);
  reduce(s, { type: "join", playerId: "a", name: "Alice" });
  reduce(s, { type: "join", playerId: "b", name: "Bob" });
  reduce(s, { type: "join", playerId: "c", name: "Cara" });
  reduce(s, { type: "choose-character", playerId: "a", characterId: "vance" });
  reduce(s, { type: "choose-character", playerId: "b", characterId: "crow" });
  reduce(s, { type: "choose-character", playerId: "c", characterId: "penny" });
  reduce(s, { type: "start-game", playerId: "a" });
  return s;
}

/** Mount a haunt with a single monster sharing hero b's room. */
function mountMonster(s: GameState, attackType: "physical" | "mental"): void {
  const b = getPlayer(s, "b")!;
  s.phase = "haunt";
  s.haunt = {
    id: "crawling-dark",
    name: "Test",
    traitorIds: ["c"],
    startedById: "c",
    startRoomKey: b.position,
    monsters: [
      { id: "m1", name: "Foe", position: b.position, might: 8, hp: 12, attackType },
    ],
    heroGoal: "",
    traitorGoal: "",
    vars: {},
  };
  s.players.forEach((p) => (p.side = p.id === "c" ? "traitor" : "heroes"));
  s.activePlayerId = "b";
  beginTurn(s);
}

describe("mental vs physical combat", () => {
  it("a spectral monster drains the mind (Sanity), never the body (Might)", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = startedGame(seed);
      mountMonster(s, "mental");
      const mightBefore = s.players.map((p) => p.traitIndex.might);
      monsterPhase(s);
      // No hero should ever lose Might to a mental attacker.
      s.players.forEach((p, i) => expect(p.traitIndex.might).toBe(mightBefore[i]));
    }
  });

  it("a bodily monster drains Might, never Sanity", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = startedGame(seed);
      mountMonster(s, "physical");
      const sanityBefore = s.players.map((p) => p.traitIndex.sanity);
      monsterPhase(s);
      s.players.forEach((p, i) => expect(p.traitIndex.sanity).toBe(sanityBefore[i]));
    }
  });

  it("attacking a spectral foe risks the mind, not the body", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = startedGame(seed);
      mountMonster(s, "mental");
      const b = getPlayer(s, "b")!;
      const mightBefore = b.traitIndex.might;
      reduce(s, { type: "attack", playerId: "b", targetMonsterId: "m1" });
      // A failed mental attack costs Sanity; Might is untouched.
      expect(b.traitIndex.might).toBe(mightBefore);
    }
  });
});

describe("haunt selection by omen × room", () => {
  it("is determined by the (omen, room) pair, not the RNG seed", () => {
    const a = startedGame(1);
    triggerHaunt(a, "a", OMENS[0]!.id);
    const b = startedGame(987654);
    triggerHaunt(b, "a", OMENS[0]!.id);
    // Same trigger room + same omen ⇒ same scenario regardless of seed.
    expect(a.haunt!.id).toBe(b.haunt!.id);
    expect(HAUNTS_BY_ID[a.haunt!.id]).toBeDefined();
  });

  it("different omens can steer toward different haunts", () => {
    const ids = new Set<string>();
    for (const omen of OMENS) {
      const s = startedGame(1);
      triggerHaunt(s, "a", omen.id);
      ids.add(s.haunt!.id);
    }
    // The mapping is a genuine function of the omen — not a constant.
    expect(ids.size).toBeGreaterThan(1);
  });
});

describe("richer monsters — speed & respawn", () => {
  function hauntWithMonster(s: GameState, m: MonsterState, startRoom: string | null): void {
    s.phase = "haunt";
    s.haunt = {
      id: "crawling-dark",
      name: "Test",
      traitorIds: ["c"],
      startedById: "c",
      startRoomKey: startRoom,
      monsters: [m],
      heroGoal: "",
      traitorGoal: "",
      vars: {},
    };
    s.players.forEach((p) => (p.side = p.id === "c" ? "traitor" : "heroes"));
  }

  // Monster movement is ROLLED (dice = Speed), so distance varies per phase.
  // Heroes are in the Entrance Hall; the monster starts two rooms away along the
  // corridor staircase(0,0) → foyer(0,1) → entrance.
  const PATH = [key("ground", 0, 0), key("ground", 0, 1), ENTRANCE_KEY];

  it("rolls dice equal to its Speed, advancing toward heroes within bounds", () => {
    const landed = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const s = startedGame(seed);
      hauntWithMonster(
        s,
        { id: "m1", name: "Runner", position: key("ground", 0, 0), might: 1, hp: 5, speed: 2 },
        null,
      );
      monsterPhase(s);
      const dist = PATH.indexOf(s.haunt!.monsters[0]!.position!);
      // Always on the path toward the heroes, never past them (stops on contact).
      expect(dist).toBeGreaterThanOrEqual(0);
      expect(dist).toBeLessThanOrEqual(2);
      landed.add(s.haunt!.monsters[0]!.position!);
    }
    // Rolled, not a fixed step: across seeds it lands in more than one room.
    expect(landed.size).toBeGreaterThan(1);
  });

  it("a faster monster closes more ground on average than a slower one", () => {
    function avgAdvance(speed: number): number {
      let total = 0;
      for (let seed = 1; seed <= 80; seed++) {
        const s = startedGame(seed);
        hauntWithMonster(
          s,
          { id: "m1", name: "Foe", position: key("ground", 0, 0), might: 1, hp: 5, speed },
          null,
        );
        monsterPhase(s);
        total += PATH.indexOf(s.haunt!.monsters[0]!.position!);
      }
      return total / 80;
    }
    expect(avgAdvance(2)).toBeGreaterThan(avgAdvance(1));
  });

  it("a rooted monster (speed 0) never moves", () => {
    const s = startedGame();
    hauntWithMonster(
      s,
      { id: "m1", name: "Idol", position: key("ground", 0, 0), might: 1, hp: 5, speed: 0 },
      null,
    );
    monsterPhase(s);
    expect(s.haunt!.monsters[0]!.position).toBe(key("ground", 0, 0));
  });

  it("a respawning monster reforms at the start room after it dies", () => {
    const s = startedGame();
    hauntWithMonster(
      s,
      {
        id: "m1",
        name: "Shade",
        position: key("ground", 0, 1),
        might: 3,
        hp: 0, // already slain
        maxHp: 3,
        respawns: true,
      },
      ENTRANCE_KEY,
    );
    monsterPhase(s);
    const m = s.haunt!.monsters[0]!;
    expect(m.hp).toBe(3);
    expect(m.position).toBe(ENTRANCE_KEY);
  });
});

describe("secret information (per-player redaction)", () => {
  function hauntedGame(): GameState {
    const s = startedGame(3);
    s.phase = "haunt";
    s.haunt = {
      id: "crawling-dark",
      name: "Test",
      traitorIds: ["a"],
      startedById: "a",
      startRoomKey: null,
      monsters: [],
      heroGoal: "Survive the night.",
      traitorGoal: "SECRET: open the seventh door.",
      vars: {},
    };
    s.players.forEach((p) => (p.side = p.id === "a" ? "traitor" : "heroes"));
    return s;
  }

  it("hides the traitor's objective from heroes and spectators", () => {
    const s = hauntedGame();
    expect(redactStateForPlayer(s, "b").haunt!.traitorGoal).not.toContain("SECRET");
    expect(redactStateForPlayer(s, null).haunt!.traitorGoal).not.toContain("SECRET");
    // The hero's own objective still comes through intact.
    expect(redactStateForPlayer(s, "b").haunt!.heroGoal).toBe("Survive the night.");
  });

  it("shows the traitor their own objective", () => {
    const s = hauntedGame();
    expect(redactStateForPlayer(s, "a").haunt!.traitorGoal).toContain("SECRET");
  });

  it("never mutates the authoritative state and is a no-op before the haunt", () => {
    const s = hauntedGame();
    redactStateForPlayer(s, "b");
    expect(s.haunt!.traitorGoal).toContain("SECRET"); // original untouched

    const pre = startedGame(3);
    expect(redactStateForPlayer(pre, "b")).toBe(pre); // nothing to hide pre-haunt
  });
});
