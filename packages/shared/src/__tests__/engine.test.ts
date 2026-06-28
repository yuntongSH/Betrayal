import { describe, expect, it } from "vitest";
import { legalMoves, reduce } from "../engine";
import { beginTurn, createGame, ENTRANCE_KEY } from "../setup";
import { CHARACTERS_BY_ID } from "../content";
import type { GameState } from "../types";
import { getPlayer } from "../state";
import { key } from "../grid";

function startedGame(seed = 42): GameState {
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

describe("setup", () => {
  it("starts in the lobby and only the host can start the game", () => {
    const s = createGame("t", 1);
    reduce(s, { type: "join", playerId: "a", name: "Alice" });
    reduce(s, { type: "join", playerId: "b", name: "Bob" });
    reduce(s, { type: "choose-character", playerId: "a", characterId: "vance" });
    reduce(s, { type: "choose-character", playerId: "b", characterId: "crow" });
    expect(s.phase).toBe("lobby");

    // Non-host cannot start.
    reduce(s, { type: "start-game", playerId: "b" });
    expect(s.phase).toBe("lobby");

    reduce(s, { type: "start-game", playerId: "a" });
    expect(s.phase).toBe("explore");
  });

  it("two players cannot pick the same character", () => {
    const s = createGame("t", 1);
    reduce(s, { type: "join", playerId: "a", name: "Alice" });
    reduce(s, { type: "join", playerId: "b", name: "Bob" });
    reduce(s, { type: "choose-character", playerId: "a", characterId: "vance" });
    reduce(s, { type: "choose-character", playerId: "b", characterId: "vance" });
    expect(getPlayer(s, "b")?.characterId).toBeNull();
  });

  it("places the five start tiles and gathers everyone in the Entrance Hall", () => {
    const s = startedGame();
    expect(Object.keys(s.house)).toHaveLength(5);
    expect(s.house[key("ground", 0, 0)]?.roomId).toBe("grand-staircase");
    expect(s.house[key("ground", 0, 1)]?.roomId).toBe("foyer");
    expect(s.house[ENTRANCE_KEY]?.roomId).toBe("entrance-hall");
    for (const p of s.players) expect(p.position).toBe(ENTRANCE_KEY);
    expect(s.activePlayerId).not.toBeNull();
    expect(s.movementLeft).toBeGreaterThan(0);
  });
});

describe("exploration", () => {
  it("walking through an open doorway draws and places a new tile", () => {
    const s = startedGame();
    const active = s.activePlayerId!;
    // Entrance Hall connects only to the Foyer; step there first.
    reduce(s, { type: "move-to", playerId: active, toKey: key("ground", 0, 1) });
    expect(getPlayer(s, active)?.position).toBe(key("ground", 0, 1));

    const before = Object.keys(s.house).length;
    // The Foyer's east/west doorways open onto the unknown.
    reduce(s, { type: "explore", playerId: active, door: "east" });
    const after = Object.keys(s.house).length;
    expect(after).toBe(before + 1);
    expect(getPlayer(s, active)?.position).toBe(key("ground", 1, 1));
  });

  it("discovering a symbol-less room costs a single step (movement isn't halted)", () => {
    const s = startedGame();
    const active = s.activePlayerId!;
    reduce(s, { type: "move-to", playerId: active, toKey: key("ground", 0, 1) });
    // Stack a symbol-less corridor: discovery draws no card, so it never halts.
    s.decks.rooms = ["dusty-hallway", ...s.decks.rooms.filter((r) => r !== "dusty-hallway")];
    const before = s.movementLeft;
    expect(before).toBeGreaterThan(0);
    reduce(s, { type: "explore", playerId: active, door: "east" });
    expect(s.house[key("ground", 1, 1)]?.roomId).toBe("dusty-hallway");
    // Exploring spends one step, not the whole turn's movement.
    expect(s.movementLeft).toBe(before - 1);
  });

  it("discovering a room that draws a card halts movement for the turn (board rule)", () => {
    const s = startedGame();
    const active = s.activePlayerId!;
    reduce(s, { type: "move-to", playerId: active, toKey: key("ground", 0, 1) });
    // Stack a room with an Item symbol: discovering it draws a card, which by the
    // board's "draw a card, stop moving" rule ends the move for the turn.
    s.decks.rooms = ["servants-quarters", ...s.decks.rooms.filter((r) => r !== "servants-quarters")];
    reduce(s, { type: "explore", playerId: active, door: "east" });
    const landed = getPlayer(s, active)!.position!;
    expect(s.house[landed]?.roomId).toBe("servants-quarters");
    // Stopped: no movement left, and a further step is refused this turn.
    expect(s.movementLeft).toBe(0);
    reduce(s, { type: "move-to", playerId: active, toKey: key("ground", 0, 1) });
    expect(getPlayer(s, active)!.position).toBe(landed);
  });

  it("is fully deterministic for a fixed seed", () => {
    function play(seed: number): string | undefined {
      const s = startedGame(seed);
      const active = s.activePlayerId!;
      reduce(s, { type: "move-to", playerId: active, toKey: key("ground", 0, 1) });
      reduce(s, { type: "explore", playerId: active, door: "east" });
      return s.house[key("ground", 1, 1)]?.roomId;
    }
    expect(play(2024)).toBe(play(2024));
  });

  it("ignores moves from a player whose turn it isn't", () => {
    const s = startedGame();
    const notActive = s.order.find((id) => id !== s.activePlayerId)!;
    const before = getPlayer(s, notActive)?.position;
    reduce(s, { type: "move-to", playerId: notActive, toKey: key("ground", 0, 1) });
    expect(getPlayer(s, notActive)?.position).toBe(before);
  });
});

describe("net-distance movement (backtracking refunds Speed)", () => {
  // entrance(0,2) — foyer(0,1) — grand-staircase(0,0) form a straight corridor.
  const foyer = key("ground", 0, 1);
  const staircase = key("ground", 0, 0);

  function generousSpeed(s: GameState): { pid: string; budget: number } {
    const pid = s.activePlayerId!;
    const p = getPlayer(s, pid)!;
    const ch = CHARACTERS_BY_ID[p.characterId!]!;
    p.traitIndex.speed = ch.traits.speed.values.length - 1; // top Speed
    beginTurn(s); // re-anchor the turn here with the fuller budget
    return { pid, budget: s.movementLeft };
  }

  it("only net progress from the turn's start is charged — walking back refunds", () => {
    const s = startedGame();
    const { pid, budget } = generousSpeed(s);
    const entrance = getPlayer(s, pid)!.position!;
    expect(budget).toBeGreaterThanOrEqual(2);

    reduce(s, { type: "move-to", playerId: pid, toKey: foyer });
    expect(s.movementLeft).toBe(budget - 1);
    reduce(s, { type: "move-to", playerId: pid, toKey: staircase });
    expect(s.movementLeft).toBe(budget - 2);

    // Walk back: net distance from the start shrinks, so Speed is handed back.
    reduce(s, { type: "move-to", playerId: pid, toKey: foyer });
    expect(s.movementLeft).toBe(budget - 1);
    reduce(s, { type: "move-to", playerId: pid, toKey: entrance });
    expect(s.movementLeft).toBe(budget); // fully home again: nothing net spent
  });

  it("you can always step back toward the start, even with no movement left", () => {
    const s = startedGame();
    const { pid } = generousSpeed(s);
    const entrance = getPlayer(s, pid)!.position!;
    const p = getPlayer(s, pid)!;

    reduce(s, { type: "move-to", playerId: pid, toKey: foyer });
    // Burn every remaining point with deliberate actions (non-refundable steps).
    let guard = 0;
    while (s.movementLeft > 0 && guard++ < 20) {
      reduce(s, { type: "investigate", playerId: pid });
    }
    expect(s.movementLeft).toBe(0);

    // Forward is refused (no budget)...
    reduce(s, { type: "move-to", playerId: pid, toKey: staircase });
    expect(p.position).toBe(foyer);
    // ...but a step back toward the start is always allowed, and refunds.
    expect(legalMoves(s, pid).explored).toContain(entrance);
    reduce(s, { type: "move-to", playerId: pid, toKey: entrance });
    expect(p.position).toBe(entrance);
    expect(s.movementLeft).toBeGreaterThan(0);
  });

  it("exploring is a non-refundable step (symbol-less room can't be gamed by returning to start)", () => {
    const s = startedGame();
    const { pid, budget } = generousSpeed(s);
    const entrance = getPlayer(s, pid)!.position!;
    reduce(s, { type: "move-to", playerId: pid, toKey: foyer });
    // Symbol-less room: discovery doesn't halt, so we can still walk home and
    // confirm the explore step itself is never refunded.
    s.decks.rooms = ["dusty-hallway", ...s.decks.rooms.filter((r) => r !== "dusty-hallway")];
    reduce(s, { type: "explore", playerId: pid, door: "east" });
    reduce(s, { type: "move-to", playerId: pid, toKey: foyer });
    reduce(s, { type: "move-to", playerId: pid, toKey: entrance });
    // Home again, but the one explore stays paid for: budget is down exactly 1.
    expect(s.movementLeft).toBe(budget - 1);
  });
});

describe("turn flow", () => {
  it("end-turn passes play to the next explorer", () => {
    const s = startedGame();
    const first = s.activePlayerId!;
    reduce(s, { type: "end-turn", playerId: first });
    expect(s.activePlayerId).not.toBe(first);
    expect(s.order).toContain(s.activePlayerId);
  });
});
