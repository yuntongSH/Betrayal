/**
 * Regression tests for the bug cluster surfaced by the headless playtest sweep
 * (keyboard + mouse browser players, engine fuzzers, and static auditors). Each
 * test pins a specific confirmed bug so it can never silently return.
 */
import { describe, expect, it } from "vitest";
import { legalMoves, reduce } from "../engine";
import { checkWinNow, playerAttack, triggerHaunt } from "../haunt";
import { beginTurn, createGame } from "../setup";
import {
  effectiveTrait,
  getPlayer,
  itemTagBonus,
  modTrait,
  redactStateForPlayer,
} from "../state";
import { openDoors } from "../house";
import { DRAWABLE_ROOMS, HAUNTS_BY_ID, ROOMS_BY_ID } from "../content";
import { Rng } from "../rng";
import type { GameState, HauntState } from "../types";

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

function mountHaunt(s: GameState, over: Partial<HauntState> = {}): void {
  const a = getPlayer(s, "a")!;
  s.phase = "haunt";
  s.haunt = {
    id: "the-hunt",
    name: "Test Haunt",
    traitorIds: ["c"],
    startedById: "c",
    startRoomKey: a.position,
    monsters: [],
    heroGoal: "",
    traitorGoal: "",
    vars: {},
    ...over,
  };
  s.players.forEach((p) => (p.side = p.id === "c" ? "traitor" : "heroes"));
}

describe("turn flow & death (dead-active, TPK, disconnect)", () => {
  it("ends the game on a total party death during the explore phase", () => {
    const s = startedGame();
    expect(s.phase).toBe("explore");
    for (const p of s.players) modTrait(s, p, "might", -10); // kill via the real death path
    checkWinNow(s);
    expect(s.phase).toBe("ended");
    expect(s.winner).not.toBeNull();
  });

  it("auto-advances the turn when the active player dies on their own turn", () => {
    const s = startedGame();
    const dead = getPlayer(s, s.activePlayerId!)!;
    modTrait(s, dead, "might", -10);
    expect(dead.alive).toBe(false);
    // Any subsequent dispatch re-checks and hands the turn off the corpse.
    reduce(s, { type: "end-turn", playerId: "b" }); // b isn't active -> a no-op that trips the guard
    expect(s.activePlayerId).not.toBe(dead.id);
    expect(getPlayer(s, s.activePlayerId!)!.alive).toBe(true);
  });

  it("offers canEndTurn for a dead-but-active player (legalMoves matches the reducer)", () => {
    const s = startedGame();
    const p = getPlayer(s, s.activePlayerId!)!;
    p.alive = false; // simulate the transient dead-active window
    expect(legalMoves(s, p.id).canEndTurn).toBe(true);
  });

  it("relinquishes the turn when the active player leaves", () => {
    const s = startedGame();
    const leaver = s.activePlayerId!;
    reduce(s, { type: "leave", playerId: leaver });
    expect(s.activePlayerId).not.toBe(leaver);
    const now = getPlayer(s, s.activePlayerId!)!;
    expect(now.alive).toBe(true);
    expect(now.connected).toBe(true);
  });

  it("skips a disconnected (but alive) player in turn order", () => {
    const s = startedGame();
    getPlayer(s, "b")!.connected = false;
    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) {
      seen.add(s.activePlayerId!);
      reduce(s, { type: "end-turn", playerId: s.activePlayerId! });
    }
    expect(seen.has("b")).toBe(false);
  });
});

describe("exploration & termination (deck exhaustion)", () => {
  it("does not advertise a door when no room can be drawn for the floor", () => {
    const s = startedGame();
    const pid = s.activePlayerId!;
    const p = getPlayer(s, pid)!;
    // Stand the player in a placed room that actually has an open doorway.
    const target = Object.values(s.house).find((r) => openDoors(s, r.key).length > 0);
    expect(target).toBeTruthy();
    p.position = target!.key;
    const floor = target!.floor;
    s.movementLeft = 2;
    // floor-lock: keep the deck non-empty but with no room legal for this floor
    s.decks.rooms = DRAWABLE_ROOMS.map((r) => r.id).filter(
      (id) => !ROOMS_BY_ID[id]!.floors.includes(floor),
    );
    expect(s.decks.rooms.length).toBeGreaterThan(0);
    const deckBefore = s.decks.rooms.length;
    const physicalDoors = openDoors(s, p.position!).length;
    expect(physicalDoors).toBeGreaterThan(0);

    const L = legalMoves(s, pid);
    expect(L.doors.length).toBe(0); // no dead doors advertised
    expect(s.decks.rooms.length).toBe(deckBefore); // legalMoves did not mutate the deck

    // exploring a physically-open door is a safe no-op (move still possible)
    const before = { pos: p.position, mv: s.movementLeft, rooms: Object.keys(s.house).length };
    reduce(s, { type: "explore", playerId: pid, door: openDoors(s, p.position!)[0]! });
    expect(p.position).toBe(before.pos);
    expect(s.movementLeft).toBe(before.mv);
    expect(Object.keys(s.house).length).toBe(before.rooms);
  });

  it("forces the haunt when the house can grow no further (explore dawn-breaker)", () => {
    const s = startedGame();
    s.decks.rooms = []; // nothing can ever be placed again
    let guard = 0;
    while (s.phase === "explore" && guard++ < 30) {
      reduce(s, { type: "end-turn", playerId: s.activePlayerId! });
    }
    expect(["haunt", "ended"]).toContain(s.phase);
  });
});

describe("combat correctness", () => {
  it("forbids friendly fire (cannot attack a same-side ally)", () => {
    const s = startedGame();
    mountHaunt(s);
    const a = getPlayer(s, "a")!;
    const b = getPlayer(s, "b")!; // also a hero
    b.position = a.position;
    s.activePlayerId = "a";
    beginTurn(s);
    const before = { idx: b.traitIndex.might, alive: b.alive, atk: s.attacksLeft };
    reduce(s, { type: "attack", playerId: "a", targetPlayerId: "b" });
    expect(b.traitIndex.might).toBe(before.idx);
    expect(b.alive).toBe(true);
    expect(s.attacksLeft).toBe(before.atk); // attack not even spent
    expect(legalMoves(s, "a").attackPlayers).not.toContain("b");
  });

  it("mental-combat items grant exactly +1 (no double-count)", () => {
    const s = startedGame();
    const p = getPlayer(s, "a")!;
    const baseK = effectiveTrait(p, "knowledge") + itemTagBonus(p, "occult");
    p.inventory.push("it-spiritboard");
    expect(effectiveTrait(p, "knowledge") + itemTagBonus(p, "occult") - baseK).toBe(1);
    const baseS = effectiveTrait(p, "sanity") + itemTagBonus(p, "holy");
    p.inventory.push("it-crucifix");
    expect(effectiveTrait(p, "sanity") + itemTagBonus(p, "holy") - baseS).toBe(1);
    // control: a pure tag item (weapon) still grants its +1
    const baseM = effectiveTrait(p, "might") + itemTagBonus(p, "weapon");
    p.inventory.push("it-dagger");
    expect(effectiveTrait(p, "might") + itemTagBonus(p, "weapon") - baseM).toBe(1);
  });

  it("does not double the article for an article-bearing monster name", () => {
    const s = startedGame();
    const b = getPlayer(s, "b")!;
    mountHaunt(s, {
      id: "wake-of-the-drowned",
      traitorIds: ["c"],
      monsters: [
        { id: "m1", name: "Drowned", position: b.position, might: 1, hp: 1, attackType: "physical" },
      ],
    });
    s.activePlayerId = "b";
    beginTurn(s);
    for (let i = 0; i < 20 && s.haunt!.monsters[0]!.hp > 0; i++) {
      s.attacksLeft = 1;
      playerAttack(s, "b", { monsterId: "m1" });
    }
    const joined = s.log.map((e) => e.text).join("\n");
    expect(joined).not.toMatch(/\bthe the\b/i);
  });

  it("spawns the Drowned with a bare noun (content fix)", () => {
    const s = startedGame();
    s.players.forEach((p) => (p.side = "heroes"));
    mountHaunt(s, { id: "wake-of-the-drowned", traitorIds: [] });
    HAUNTS_BY_ID["wake-of-the-drowned"]!.setup(s, [], {
      rng: Rng.fromState(s.rngState),
      roomKeys: () => Object.keys(s.house),
      spawnKey: () => getPlayer(s, "a")!.position,
    });
    const drowned = s.haunt!.monsters.find((m) => m.name.includes("Drowned"))!;
    expect(drowned.name).toBe("Drowned");
  });
});

describe("haunt wiring & objectives", () => {
  it("never re-triggers / overwrites an active haunt", () => {
    const s = startedGame();
    triggerHaunt(s, "a");
    const snap = { id: s.haunt!.id, traitors: [...s.haunt!.traitorIds] };
    triggerHaunt(s, "b"); // must be a no-op
    expect(s.haunt!.id).toBe(snap.id);
    expect(s.haunt!.traitorIds).toEqual(snap.traitors);
  });

  it("does not award an objective win for a position held at the instant of reveal", () => {
    const s = startedGame();
    const a = getPlayer(s, "a")!;
    expect(s.house[a.position!]!.roomId).toBe("entrance-hall");
    a.inventory.push("it-key"); // a stands in the entrance with the key at reveal
    s.players.forEach((p) => (p.side = "heroes"));
    mountHaunt(s, { id: "the-tide", traitorIds: [] });
    const def = HAUNTS_BY_ID["the-tide"]!;
    def.setup(s, [], {
      rng: Rng.fromState(s.rngState),
      roomKeys: () => Object.keys(s.house),
      spawnKey: () => a.position,
    });
    // a was snapshotted (already qualifying) -> no instant win
    expect(def.checkWin(s)).not.toBe("heroes");

    // a hero who newly brings the key to the entrance DURING the haunt does win
    const b = getPlayer(s, "b")!;
    b.position = a.position;
    b.inventory.push("it-key");
    expect(def.checkWin(s)).toBe("heroes");
  });
});

describe("items & redaction", () => {
  it("grants extra movement immediately when a Speed consumable is used", () => {
    const s = startedGame();
    const pid = s.activePlayerId!;
    const p = getPlayer(s, pid)!;
    p.traitIndex.speed = 1; // leave headroom for the +2
    p.inventory.push("it-elixir");
    beginTurn(s);
    const spBefore = effectiveTrait(p, "speed");
    const mvBefore = s.movementLeft;
    reduce(s, { type: "use-item", playerId: pid, cardId: "it-elixir" });
    const gained = effectiveTrait(p, "speed") - spBefore;
    expect(gained).toBeGreaterThan(0);
    expect(s.movementLeft).toBe(mvBefore + gained);
  });

  it("reveals the traitor's goal once the game has ended", () => {
    const s = startedGame();
    mountHaunt(s, { traitorIds: ["a"], traitorGoal: "SECRET PURPOSE" });
    s.players.forEach((p) => (p.side = p.id === "a" ? "traitor" : "heroes"));
    expect(redactStateForPlayer(s, "b").haunt!.traitorGoal).toContain("Unknown");
    s.phase = "ended";
    s.winner = "heroes";
    expect(redactStateForPlayer(s, "b").haunt!.traitorGoal).toBe("SECRET PURPOSE");
  });
});
