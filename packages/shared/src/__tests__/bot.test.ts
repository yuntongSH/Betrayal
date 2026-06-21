import { describe, expect, it } from "vitest";
import { reduce } from "../engine";
import { createGame, addBot, MIN_PLAYERS } from "../setup";
import { botStep, runBotTurn } from "../bot";
import { getPlayer } from "../state";
import type { GameState } from "../types";

function lobbyWithBots(nBots: number): GameState {
  const s = createGame("bots", 7);
  for (let i = 0; i < nBots; i++) addBot(s);
  return s;
}

describe("bots", () => {
  it("addBot creates a flagged, character-bearing player", () => {
    const s = lobbyWithBots(3);
    expect(s.players).toHaveLength(3);
    for (const p of s.players) {
      expect(p.isBot).toBe(true);
      expect(p.characterId).not.toBeNull();
    }
    // characters are distinct
    const chars = new Set(s.players.map((p) => p.characterId));
    expect(chars.size).toBe(3);
  });

  it("solo: one human is topped up to the minimum party on start", () => {
    const s = createGame("solo", 3);
    reduce(s, { type: "join", playerId: "me", name: "Me" });
    reduce(s, { type: "choose-character", playerId: "me", characterId: "vance" });
    reduce(s, { type: "start-game", playerId: "me" });
    expect(s.phase).toBe("explore");
    expect(s.players.length).toBeGreaterThanOrEqual(MIN_PLAYERS);
    expect(s.players.filter((p) => p.isBot).length).toBe(s.players.length - 1);
  });

  it("two humans get exactly one bot to reach the minimum", () => {
    const s = createGame("duo", 3);
    reduce(s, { type: "join", playerId: "a", name: "A" });
    reduce(s, { type: "join", playerId: "b", name: "B" });
    reduce(s, { type: "choose-character", playerId: "a", characterId: "vance" });
    reduce(s, { type: "choose-character", playerId: "b", characterId: "crow" });
    reduce(s, { type: "start-game", playerId: "a" });
    expect(s.players.filter((p) => p.isBot)).toHaveLength(1);
    expect(s.players).toHaveLength(3);
  });

  it("a bot turn ends and passes play onward", () => {
    const s = lobbyWithBots(3);
    reduce(s, { type: "start-game", playerId: s.players[0]!.id });
    const first = s.activePlayerId!;
    runBotTurn(s, first);
    expect(s.activePlayerId).not.toBe(first);
  });

  it("an all-bot game runs and actually explores the house", () => {
    const s = lobbyWithBots(3);
    reduce(s, { type: "start-game", playerId: s.players[0]!.id });
    let guard = 0;
    while (s.phase !== "ended" && guard++ < 120) {
      runBotTurn(s, s.activePlayerId!);
    }
    // bots should have pushed beyond the 5 starting tiles without throwing
    expect(Object.keys(s.house).length).toBeGreaterThan(5);
  });

  it("botStep never explores once the room deck is exhausted", () => {
    const s = lobbyWithBots(3);
    reduce(s, { type: "start-game", playerId: s.players[0]!.id });
    s.decks.rooms = [];
    const step = botStep(s, s.activePlayerId!);
    expect(step.action.type).not.toBe("explore");
  });
});
