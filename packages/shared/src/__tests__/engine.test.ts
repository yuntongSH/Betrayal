import { describe, expect, it } from "vitest";
import { reduce } from "../engine";
import { createGame, ENTRANCE_KEY } from "../setup";
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

  it("discovering a new room costs a single step (you can keep moving and backtrack)", () => {
    const s = startedGame();
    const active = s.activePlayerId!;
    reduce(s, { type: "move-to", playerId: active, toKey: key("ground", 0, 1) });
    const before = s.movementLeft;
    expect(before).toBeGreaterThan(0);
    reduce(s, { type: "explore", playerId: active, door: "east" });
    // Exploring spends one step, not the whole turn's movement.
    expect(s.movementLeft).toBe(before - 1);
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

describe("turn flow", () => {
  it("end-turn passes play to the next explorer", () => {
    const s = startedGame();
    const first = s.activePlayerId!;
    reduce(s, { type: "end-turn", playerId: first });
    expect(s.activePlayerId).not.toBe(first);
    expect(s.order).toContain(s.activePlayerId);
  });
});
