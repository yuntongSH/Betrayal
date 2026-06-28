import { describe, expect, it } from "vitest";
import { reduce } from "../engine";
import { addBot, beginTurn, createGame, ENTRANCE_KEY } from "../setup";
import { triggerHaunt, checkWinNow } from "../haunt";
import { runBotTurn } from "../bot";
import { HAUNTS, HAUNTS_BY_ID } from "../content";
import type { HauntContext } from "../content";
import { Rng } from "../rng";
import { key } from "../grid";
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

describe("every haunt resolves under bot play (no soft-locks)", () => {
  /** Force a specific scenario (mirrors the engine's triggerHaunt internals). */
  function forceHaunt(s: GameState, id: string): void {
    const def = HAUNTS_BY_ID[id]!;
    const trigger = s.players[0]!.id;
    const traitorIds = def.chooseTraitors ? def.chooseTraitors(s, trigger) : [trigger];
    s.haunt = {
      id: def.id, name: def.name, traitorIds, startedById: trigger,
      startRoomKey: getPlayer(s, trigger)!.position, monsters: [],
      heroGoal: def.heroGoal, traitorGoal: def.traitorGoal, vars: {},
    };
    s.players.forEach((p) => (p.side = traitorIds.includes(p.id) ? "traitor" : "heroes"));
    const ctx: HauntContext = {
      rng: Rng.fromState(s.rngState),
      roomKeys: () => Object.keys(s.house),
      spawnKey: () => s.haunt?.startRoomKey ?? Object.keys(s.house)[0] ?? null,
    };
    def.setup(s, traitorIds, ctx);
    s.rngState = ctx.rng.state;
    s.phase = "haunt";
    checkWinNow(s);
  }

  for (const def of HAUNTS) {
    it(`${def.id} reaches an ending with a winner`, () => {
      const s = createGame("hk", 9);
      for (let i = 0; i < 4; i++) addBot(s);
      reduce(s, { type: "start-game", playerId: s.players[0]!.id });
      s.decks.omen = []; // suppress the natural haunt so we can force this one
      let guard = 0;
      while (s.phase === "explore" && s.turn < 6 && guard++ < 80) runBotTurn(s, s.activePlayerId!);
      if (s.phase === "explore") forceHaunt(s, def.id);
      let h = 0;
      while (s.phase !== "ended" && h++ < 800) runBotTurn(s, s.activePlayerId!);
      expect(s.phase, `${def.id} should end`).toBe("ended");
      expect(["heroes", "traitor"]).toContain(s.winner);
    });
  }
});

describe("difficulty scales the haunt's monsters", () => {
  // Trigger the same scenario at each difficulty and total its monsters' Might+HP.
  function monsterTotal(difficulty: GameState["difficulty"], roomKey: string): number {
    const s = startedGame();
    getPlayer(s, "a")!.position = roomKey; // the trigger room steers haunt selection
    s.difficulty = difficulty;
    triggerHaunt(s, "a");
    return (s.haunt?.monsters ?? []).reduce((acc, m) => acc + m.might + m.hp, 0);
  }

  it("Nightmare hardens and Relaxed softens, with Standard between", () => {
    // Find a starting room whose haunt actually spawns monsters (a few haunts,
    // like The Hunt, summon none — the traitor is the threat).
    const rooms = [key("ground", 0, 2), key("ground", 0, 1), key("ground", 0, 0)];
    const room = rooms.find((r) => monsterTotal("standard", r) > 0)!;
    expect(room).toBeTruthy();

    const relaxed = monsterTotal("relaxed", room);
    const standard = monsterTotal("standard", room);
    const nightmare = monsterTotal("nightmare", room);
    expect(nightmare).toBeGreaterThan(standard);
    expect(standard).toBeGreaterThan(relaxed);
  });

  it("only the host can change difficulty, and only in the lobby", () => {
    const s = createGame("d", 1);
    reduce(s, { type: "join", playerId: "a", name: "A" });
    reduce(s, { type: "join", playerId: "b", name: "B" });
    reduce(s, { type: "set-difficulty", playerId: "b", difficulty: "nightmare" });
    expect(s.difficulty).toBe("standard"); // b isn't the host
    reduce(s, { type: "set-difficulty", playerId: "a", difficulty: "nightmare" });
    expect(s.difficulty).toBe("nightmare"); // a is the host
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

describe("additional scenarios", () => {
  function mount(s: GameState, defId: string) {
    const def = HAUNTS_BY_ID[defId]!;
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
    def.setup(s, ["a"], {
      rng: new Rng(1),
      roomKeys: () => Object.keys(s.house),
      spawnKey: () => Object.keys(s.house)[0] ?? null,
    });
    return def;
  }

  it("The Hunt: heroes win by reaching a Chapel", () => {
    const s = startedGame();
    const def = mount(s, "the-hunt");
    expect(def.checkWin(s)).toBeNull();

    // Drop a Chapel into the house and shelter a hero in it.
    s.house["ground:9:9"] = {
      key: "ground:9:9",
      roomId: "chapel",
      floor: "ground",
      x: 9,
      y: 9,
      rotation: 0,
      exploredBy: null,
    };
    getPlayer(s, "b")!.position = "ground:9:9";
    expect(def.checkWin(s)).toBe("heroes");
  });

  it("Plague of Whispers: heroes win once every whisper is silenced", () => {
    const s = startedGame();
    const def = mount(s, "plague-of-whispers");
    expect(s.haunt!.monsters.length).toBeGreaterThan(0);
    expect(def.checkWin(s)).toBeNull();

    s.haunt!.monsters.forEach((m) => (m.hp = 0));
    expect(def.checkWin(s)).toBe("heroes");
  });
});

describe("The Tide Comes In — a no-traitor haunt", () => {
  function mountTide(s: GameState) {
    const def = HAUNTS_BY_ID["the-tide"]!;
    s.haunt = {
      id: def.id,
      name: def.name,
      traitorIds: [],
      startedById: "a",
      startRoomKey: null,
      monsters: [],
      heroGoal: def.heroGoal,
      traitorGoal: def.traitorGoal,
      vars: {},
    };
    s.players.forEach((p) => (p.side = "heroes"));
    s.phase = "haunt";
    return def;
  }

  it("names no traitor — every explorer is a hero", () => {
    const s = startedGame();
    expect(HAUNTS_BY_ID["the-tide"]!.chooseTraitors!(s, "a")).toEqual([]);
  });

  it("heroes win by destroying the drowned; the house wins if all drown", () => {
    const s = startedGame();
    const def = mountTide(s);
    def.setup(s, [], {
      rng: new Rng(1),
      roomKeys: () => Object.keys(s.house),
      spawnKey: () => Object.keys(s.house)[0] ?? null,
    });
    expect(s.haunt!.monsters.length).toBeGreaterThan(0);
    expect(def.checkWin(s)).toBeNull();

    s.haunt!.monsters.forEach((m) => (m.hp = 0));
    expect(def.checkWin(s)).toBe("heroes");

    s.haunt!.monsters.forEach((m) => (m.hp = 5));
    s.players.forEach((p) => (p.alive = false));
    expect(def.checkWin(s)).toBe("traitor"); // the house prevails
  });

  it("wakes the monsters after a hero's turn even with no traitor", () => {
    const s = startedGame();
    mountTide(s);
    const foyer = key("ground", 0, 1); // adjacent to the Entrance Hall
    s.haunt!.monsters = [
      { id: "m1", name: "Drowned Hand", position: foyer, might: 2, hp: 3, attackType: "physical" },
    ];
    s.activePlayerId = "a";
    beginTurn(s);

    // With no traitor, ending a hero's turn still wakes the house and runs the
    // monster phase. Monster movement is rolled now (dice = Speed), so it may
    // take a phase or two — but it must close the single room to the party rather
    // than standing idle. (It moves the moment a roll lands ≥ 1.)
    const start = s.haunt!.monsters[0]!.position;
    let guard = 0;
    while (s.haunt!.monsters[0]!.position === start && s.phase === "haunt" && guard++ < 25) {
      reduce(s, { type: "end-turn", playerId: s.activePlayerId! });
    }
    // The only step from the foyer toward the party lands in the Entrance Hall.
    expect(s.haunt!.monsters[0]!.position).toBe(ENTRANCE_KEY);
  });
});
