import { describe, expect, it } from "vitest";
import { reduce } from "../engine";
import { monsterPhase, triggerHaunt } from "../haunt";
import { beginTurn, createGame } from "../setup";
import { getPlayer } from "../state";
import { HAUNTS_BY_ID, OMENS } from "../content";
import type { GameState } from "../types";

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
