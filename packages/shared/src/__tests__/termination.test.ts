import { describe, expect, it } from "vitest";
import { legalMoves, reduce } from "../engine";
import { checkWinNow } from "../haunt";
import { createGame } from "../setup";
import { getPlayer } from "../state";
import { CHARACTERS, HAUNTS_BY_ID } from "../content";
import type { GameState } from "../types";

// A simple seeded RNG so a failing game reproduces from its seed.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => ((a = (a * 1664525 + 1013904223) >>> 0), a / 4294967296);
}

/** Drive the human's whole turn with a reasonable policy. */
function humanTurn(s: GameState, pid: string, rand: () => number): void {
  let steps = 0;
  while (s.activePlayerId === pid && s.phase !== "ended" && steps++ < 40) {
    const L = legalMoves(s, pid);
    if (L.pickupItems.length) { reduce(s, { type: "pickup-item", playerId: pid, cardId: L.pickupItems[0]! }); continue; }
    if (L.attackMonsters.length) { reduce(s, { type: "attack", playerId: pid, targetMonsterId: L.attackMonsters[0] }); continue; }
    if (L.attackPlayers.length) { reduce(s, { type: "attack", playerId: pid, targetPlayerId: L.attackPlayers[0] }); continue; }
    if (s.movementLeft > 0 && L.doors.length && s.decks.rooms.length && rand() < 0.65) {
      reduce(s, { type: "explore", playerId: pid, door: L.doors[(rand() * L.doors.length) | 0]! }); continue;
    }
    if (s.movementLeft > 0 && L.explored.length) {
      reduce(s, { type: "move-to", playerId: pid, toKey: L.explored[(rand() * L.explored.length) | 0]! }); continue;
    }
    break;
  }
  if (s.activePlayerId === pid && s.phase !== "ended") reduce(s, { type: "end-turn", playerId: pid });
}

// Run bot turns inline (mirrors the server driver) to avoid importing bot.ts cycle concerns.
import { runBotTurn } from "../bot";

describe("games always terminate", () => {
  it("a soak of full games vs. bots all reach an ending (no soft-locks)", () => {
    for (let seed = 1; seed <= 24; seed++) {
      const rand = rng(seed);
      const s = createGame("term", seed);
      reduce(s, { type: "join", playerId: "H", name: "Human" });
      reduce(s, { type: "choose-character", playerId: "H", characterId: CHARACTERS[3]!.id });
      for (let i = 0; i < 3; i++) reduce(s, { type: "add-bot", playerId: "H" });
      reduce(s, { type: "start-game", playerId: "H" });

      let turns = 0;
      while (s.phase !== "ended" && turns++ < 600) {
        const a = getPlayer(s, s.activePlayerId);
        if (!a) break;
        if (a.id === "H" && a.alive) humanTurn(s, "H", rand);
        else runBotTurn(s, a.id);
      }
      expect(s.phase, `seed ${seed} should end`).toBe("ended");
      expect(["heroes", "traitor"]).toContain(s.winner);
    }
  });
});

describe("dawn breaks a haunt stalemate", () => {
  it("ends an over-long haunt in the survivors' favour", () => {
    const s = createGame("dawn", 5);
    reduce(s, { type: "join", playerId: "a", name: "A" });
    reduce(s, { type: "join", playerId: "b", name: "B" });
    reduce(s, { type: "join", playerId: "c", name: "C" });
    reduce(s, { type: "choose-character", playerId: "a", characterId: "vance" });
    reduce(s, { type: "choose-character", playerId: "b", characterId: "crow" });
    reduce(s, { type: "choose-character", playerId: "c", characterId: "penny" });
    reduce(s, { type: "start-game", playerId: "a" });

    const def = HAUNTS_BY_ID["crawling-dark"]!;
    s.phase = "haunt";
    s.haunt = {
      id: def.id, name: def.name, traitorIds: ["a"], startedById: "a", startRoomKey: null,
      monsters: [{ id: "m1", name: "Shade", position: null, might: 3, hp: 3 }],
      heroGoal: "", traitorGoal: "", vars: { startTurn: 1 },
    };
    s.players.forEach((p) => (p.side = p.id === "a" ? "traitor" : "heroes"));
    expect(def.checkWin(s)).toBeNull(); // not decided on its own

    s.turn = 50; // 49 rounds in — past the dawn limit
    checkWinNow(s);
    expect(s.phase).toBe("ended");
    expect(s.winner).toBe("heroes"); // heroes (b, c) survived to dawn
  });
});
