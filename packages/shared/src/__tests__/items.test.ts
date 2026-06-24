import { describe, expect, it } from "vitest";
import { legalMoves, reduce } from "../engine";
import { beginTurn, createGame, ENTRANCE_KEY } from "../setup";
import { getPlayer, modTrait } from "../state";
import type { GameState } from "../types";

function startedGame(seed = 7): GameState {
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

/** Force it to be a given player's turn during exploration. */
function makeActive(s: GameState, id: string): void {
  s.activePlayerId = id;
  s.phase = "explore";
  beginTurn(s);
}

describe("dropping items on death", () => {
  it("moves a dead explorer's inventory onto the floor of their room", () => {
    const s = startedGame();
    const a = getPlayer(s, "a")!;
    a.inventory = ["it-test"];
    a.traitIndex.might = 1; // one space above the skull
    const died = modTrait(s, a, "might", -1);

    expect(died).toBe(true);
    expect(a.inventory).toEqual([]);
    expect(s.itemPiles[ENTRANCE_KEY]).toContain("it-test");
  });

  it("does not create a pile when the dead explorer carried nothing", () => {
    const s = startedGame();
    const a = getPlayer(s, "a")!;
    a.inventory = [];
    a.traitIndex.sanity = 1;
    modTrait(s, a, "sanity", -1);
    expect(s.itemPiles[ENTRANCE_KEY]).toBeUndefined();
  });
});

describe("picking items up off the floor", () => {
  it("lets a co-located explorer take a dropped item", () => {
    const s = startedGame();
    s.itemPiles[ENTRANCE_KEY] = ["it-test"];
    makeActive(s, "b");

    expect(legalMoves(s, "b").pickupItems).toContain("it-test");
    reduce(s, { type: "pickup-item", playerId: "b", cardId: "it-test" });

    expect(getPlayer(s, "b")!.inventory).toContain("it-test");
    expect(s.itemPiles[ENTRANCE_KEY]).toBeUndefined();
  });

  it("refuses pickup from a room the player is not standing in", () => {
    const s = startedGame();
    s.itemPiles["ground:5:5"] = ["it-test"];
    makeActive(s, "b");
    reduce(s, { type: "pickup-item", playerId: "b", cardId: "it-test" });
    expect(getPlayer(s, "b")!.inventory).not.toContain("it-test");
    expect(s.itemPiles["ground:5:5"]).toEqual(["it-test"]);
  });
});

describe("trading items with an ally in the room", () => {
  it("hands an item to a co-located explorer", () => {
    const s = startedGame();
    const a = getPlayer(s, "a")!;
    a.inventory = ["it-gift"];
    makeActive(s, "a");

    expect(legalMoves(s, "a").tradePartners).toContain("b");
    reduce(s, { type: "give-item", playerId: "a", toPlayerId: "b", cardId: "it-gift" });

    expect(getPlayer(s, "a")!.inventory).not.toContain("it-gift");
    expect(getPlayer(s, "b")!.inventory).toContain("it-gift");
  });

  it("refuses to give an item the player does not hold", () => {
    const s = startedGame();
    makeActive(s, "a");
    reduce(s, { type: "give-item", playerId: "a", toPlayerId: "b", cardId: "nope" });
    expect(getPlayer(s, "b")!.inventory).not.toContain("nope");
  });
});

describe("one attack per turn", () => {
  function hauntWithMonsterOn(s: GameState, holderId: string): string {
    const holder = getPlayer(s, holderId)!;
    s.phase = "haunt";
    s.haunt = {
      id: "crawling-dark",
      name: "Test",
      traitorIds: ["c"],
      startedById: "c",
      startRoomKey: holder.position,
      monsters: [{ id: "m1", name: "Shade", position: holder.position, might: 3, hp: 8 }],
      heroGoal: "",
      traitorGoal: "",
      vars: {},
    };
    s.players.forEach((p) => (p.side = p.id === "c" ? "traitor" : "heroes"));
    s.activePlayerId = holderId;
    beginTurn(s);
    return "m1";
  }

  it("spends the turn's single attack and then blocks further attacks", () => {
    const s = startedGame();
    const mId = hauntWithMonsterOn(s, "b");

    expect(s.attacksLeft).toBe(1);
    expect(legalMoves(s, "b").attackMonsters).toContain(mId);

    reduce(s, { type: "attack", playerId: "b", targetMonsterId: mId });
    expect(s.attacksLeft).toBe(0);
    expect(legalMoves(s, "b").attackMonsters).toEqual([]);

    // A second attack this turn changes nothing.
    const m = s.haunt!.monsters.find((x) => x.id === mId)!;
    const hpBefore = m.hp;
    const mightBefore = getPlayer(s, "b")!.traitIndex.might;
    reduce(s, { type: "attack", playerId: "b", targetMonsterId: mId });
    expect(m.hp).toBe(hpBefore);
    expect(getPlayer(s, "b")!.traitIndex.might).toBe(mightBefore);
    expect(s.attacksLeft).toBe(0);
  });

  it("restores the attack when the turn begins again", () => {
    const s = startedGame();
    hauntWithMonsterOn(s, "b");
    reduce(s, { type: "attack", playerId: "b", targetMonsterId: "m1" });
    expect(s.attacksLeft).toBe(0);
    beginTurn(s); // next turn for whoever is active
    expect(s.attacksLeft).toBe(1);
  });
});
