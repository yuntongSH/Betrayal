import { describe, expect, it } from "vitest";
import { reduce } from "../engine";
import { beginTurn, createGame, addBot, MIN_PLAYERS } from "../setup";
import { botStep, runBotTurn } from "../bot";
import { getPlayer } from "../state";
import { connections } from "../house";
import { neighborKey } from "../grid";
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

  it("does not explore or pace between seen rooms once nothing is left to find", () => {
    const s = lobbyWithBots(3);
    reduce(s, { type: "start-game", playerId: s.players[0]!.id });
    s.decks.rooms = [];
    const step = botStep(s, s.activePlayerId!);
    // With no room drawable anywhere, the bot must not explore and must not pace
    // between already-seen rooms. It may still take a productive deliberate action
    // (search/investigate) or simply end its turn — never a pointless walk.
    expect(step.action.type).not.toBe("explore");
    expect(step.action.type).not.toBe("move-to");
    expect(["end-turn", "search", "investigate"]).toContain(step.action.type);
  });

  it("a bot never paces back and forth between rooms within a single turn", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const s = lobbyWithBots(4);
      reduce(s, { type: "start-game", playerId: s.players[0]!.id });
      let guard = 0;
      while (s.phase !== "ended" && guard++ < 250) {
        const pid = s.activePlayerId!;
        // Where the bot has stood this turn → how many rooms it had discovered
        // when it last stood there.
        const visited = new Map<string, number>([
          [getPlayer(s, pid)!.position!, s.turnExplored?.length ?? 0],
        ]);
        let steps = 0;
        // cast: reduce() can flip phase to "ended" mid-turn, which TS can't see.
        while (s.activePlayerId === pid && (s.phase as string) !== "ended" && steps++ < 30) {
          const { action, endTurnAfter } = botStep(s, pid);
          reduce(s, action);
          if (action.type === "end-turn") break;
          // The no-pacing invariant is about purposeful EXPLORATION: a bot heads
          // toward new ground and never bounces between rooms without progress
          // (the bouncing the player reported). Re-entering a room it stood in
          // earlier this turn IS legal play when a discovery happened in between:
          // symbol-less dead ends (a board-game staple — our Cloakroom, Coal
          // Bunker, Dumbwaiter Shaft) don't halt movement, and the only way
          // onward from one is back through the room the bot came from. In the
          // haunt the target set is foes, which can sit behind the bot —
          // backtracking to hunt them is legitimate — and a mid-turn omen can
          // flip the phase, so only assert while still exploring.
          if (action.type === "move-to" && s.phase === "explore") {
            const pos = getPlayer(s, pid)!.position!;
            const discovered = s.turnExplored?.length ?? 0;
            if (visited.has(pos)) {
              // allowed only en route from new ground — never a pure oscillation
              expect(discovered).toBeGreaterThan(visited.get(pos)!);
            }
            visited.set(pos, discovered);
          }
          if (endTurnAfter) {
            if (s.activePlayerId === pid) reduce(s, { type: "end-turn", playerId: pid });
            break;
          }
        }
      }
    }
  });

  it("a critically wounded bot with no item to drink rests to recover", () => {
    const s = lobbyWithBots(3);
    reduce(s, { type: "start-game", playerId: s.players[0]!.id });
    const pid = s.activePlayerId!;
    const p = getPlayer(s, pid)!;
    p.inventory = []; // nothing to drink
    p.traitIndex.might = 1; // one step from the skull
    // Explore phase, no foes, no items — the bot catches its breath instead of
    // wandering off into danger.
    const step = botStep(s, pid);
    expect(step.action.type).toBe("rest");
  });

  it("a wounded hero bot barricades a door a monster is about to come through", () => {
    const s = lobbyWithBots(3);
    reduce(s, { type: "start-game", playerId: s.players[0]!.id });
    const pid = s.activePlayerId!;
    const p = getPlayer(s, pid)!;
    // A no-traitor "everyone vs the house" haunt, so no ally to swing at first.
    s.players.forEach((q) => (q.side = "heroes"));
    s.phase = "haunt";
    p.traitIndex.might = 1; // one step from the skull — plays defensively
    const room = s.house[p.position!]!;
    const monsterRoom = connections(s, p.position!)[0]!; // a connected neighbour
    s.haunt = {
      id: "house-rises",
      name: "The House Rises",
      traitorIds: [],
      startedById: pid,
      startRoomKey: p.position,
      monsters: [
        { id: "m1", name: "Foe", position: monsterRoom, might: 3, hp: 5, attackType: "physical" },
      ],
      heroGoal: "",
      traitorGoal: "",
      vars: {},
    };
    beginTurn(s);
    const step = botStep(s, pid);
    expect(step.action.type).toBe("barricade");
    if (step.action.type === "barricade") {
      // the wedged door is the one the monster would have come through
      expect(neighborKey(room.floor, room.x, room.y, step.action.door)).toBe(monsterRoom);
    }
  });
});
