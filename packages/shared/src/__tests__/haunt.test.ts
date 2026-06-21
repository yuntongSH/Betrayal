import { describe, expect, it } from "vitest";
import { reduce } from "../engine";
import { createGame } from "../setup";
import { triggerHaunt, checkWinNow } from "../haunt";
import { HAUNTS_BY_ID } from "../content";
import type { HauntContext } from "../content";
import { Rng } from "../rng";
import type { GameState } from "../types";
import { getPlayer, modTrait } from "../state";

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

describe("triggering the haunt", () => {
  it("splits the party into exactly one traitor and the rest heroes", () => {
    const s = startedGame();
    triggerHaunt(s, "a");
    expect(s.phase === "haunt" || s.phase === "ended").toBe(true);
    expect(s.haunt).not.toBeNull();
    const traitors = s.players.filter((p) => p.side === "traitor");
    const heroes = s.players.filter((p) => p.side === "heroes");
    expect(traitors).toHaveLength(1);
    expect(heroes).toHaveLength(2);
    expect(traitors[0]!.id).toBe("a");
  });
});

describe("trait tracks", () => {
  it("dropping a trait onto the skull space kills the explorer", () => {
    const s = startedGame();
    const p = getPlayer(s, "a")!;
    p.traitIndex.might = 1; // one space above the skull
    const died = modTrait(s, p, "might", -1);
    expect(died).toBe(true);
    expect(p.alive).toBe(false);
  });
});

describe("scenario win conditions", () => {
  const ctx = (s: GameState): HauntContext => ({
    rng: new Rng(1),
    roomKeys: () => Object.keys(s.house),
    spawnKey: () => Object.keys(s.house)[0] ?? null,
  });

  it("The Crawling Dark: traitor wins when no heroes survive", () => {
    const s = startedGame();
    const def = HAUNTS_BY_ID["crawling-dark"]!;
    s.haunt = {
      id: def.id,
      name: def.name,
      traitorIds: ["a"],
      startedById: "a",
      startRoomKey: null,
      monsters: [],
      heroGoal: def.heroGoal,
      traitorGoal: def.traitorGoal,
      vars: {},
    };
    s.players.forEach((p) => (p.side = p.id === "a" ? "traitor" : "heroes"));
    s.phase = "haunt";
    def.setup(s, ["a"], ctx(s));
    expect(def.checkWin(s)).toBeNull();

    getPlayer(s, "b")!.alive = false;
    getPlayer(s, "c")!.alive = false;
    expect(def.checkWin(s)).toBe("traitor");
  });

  it("Blood Moon Ritual: traitor wins when the ritual completes", () => {
    const s = startedGame();
    const def = HAUNTS_BY_ID["blood-moon"]!;
    s.haunt = {
      id: def.id,
      name: def.name,
      traitorIds: ["a"],
      startedById: "a",
      startRoomKey: null,
      monsters: [],
      heroGoal: def.heroGoal,
      traitorGoal: def.traitorGoal,
      vars: {},
    };
    s.players.forEach((p) => (p.side = p.id === "a" ? "traitor" : "heroes"));
    s.phase = "haunt";
    def.setup(s, ["a"], ctx(s));
    expect(def.checkWin(s)).toBeNull();

    s.haunt.vars.ritualProgress = 4;
    expect(def.checkWin(s)).toBe("traitor");
  });

  it("checkWinNow ends the game and records the winner", () => {
    const s = startedGame();
    triggerHaunt(s, "a");
    // Wipe out every hero, then re-check.
    s.players.filter((p) => p.side === "heroes").forEach((p) => (p.alive = false));
    if (s.phase !== "ended") checkWinNow(s);
    expect(s.phase).toBe("ended");
    expect(s.winner).toBe("traitor");
  });
});
