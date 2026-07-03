import { describe, expect, it } from "vitest";
import { reduce } from "../engine";
import { createGame } from "../setup";
import { triggerHaunt } from "../haunt";
import { CHARACTERS, CHARACTERS_BY_ID } from "../content";
import { getPlayer, modTrait } from "../state";
import type { GameState } from "../types";

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

describe("character dossiers", () => {
  it("every explorer has a complete dossier", () => {
    for (const c of CHARACTERS) {
      expect(c.bio.length, c.id).toBeGreaterThan(40);
      expect(c.birthday, c.id).toBeTruthy();
      expect(c.fear, c.id).toBeTruthy();
      expect(c.keepsake, c.id).toBeTruthy();
      expect(c.hobbies.length, c.id).toBeGreaterThanOrEqual(3);
      for (const line of Object.values(c.lines)) {
        expect(line.length, c.id).toBeGreaterThan(5);
      }
    }
  });

  it("bonds form one closed circle over all six explorers", () => {
    for (const c of CHARACTERS) {
      expect(c.bond.with, c.id).not.toBe(c.id);
      expect(CHARACTERS_BY_ID[c.bond.with], `${c.id} bonds to unknown id`).toBeDefined();
    }
    // Following bond.with from any start must visit every explorer exactly once.
    const seen = new Set<string>();
    let cur = CHARACTERS[0]!.id;
    for (let i = 0; i < CHARACTERS.length; i++) {
      expect(seen.has(cur)).toBe(false);
      seen.add(cur);
      cur = CHARACTERS_BY_ID[cur]!.bond.with;
    }
    expect(cur).toBe(CHARACTERS[0]!.id);
    expect(seen.size).toBe(CHARACTERS.length);
  });
});

describe("character voice in the story", () => {
  it("logs each explorer's arrival line at game start", () => {
    const s = startedGame();
    const voices = s.log.filter((l) => l.kind === "voice");
    expect(voices).toHaveLength(3);
    expect(voices.some((l) => l.text.includes(CHARACTERS_BY_ID.vance!.lines.arrival))).toBe(true);
    expect(voices.some((l) => l.text.includes(CHARACTERS_BY_ID.penny!.lines.arrival))).toBe(true);
  });

  it("the traitor and one hero speak at the haunt reveal", () => {
    const s = startedGame();
    const before = s.log.length;
    triggerHaunt(s, "a");
    const voices = s.log.slice(before).filter((l) => l.kind === "voice");
    const traitor = s.players.find((p) => p.side === "traitor");
    if (traitor) {
      const tc = CHARACTERS_BY_ID[traitor.characterId!]!;
      expect(voices.some((l) => l.text.includes(tc.lines.hauntTraitor))).toBe(true);
      // Exactly one hero answers.
      const heroLines = voices.filter((l) => !l.text.includes(tc.lines.hauntTraitor));
      expect(heroLines).toHaveLength(1);
    }
  });

  it("an explorer speaks their last words when the house takes them", () => {
    const s = startedGame();
    const p = getPlayer(s, "b")!;
    modTrait(s, p, "might", -99);
    expect(p.alive).toBe(false);
    const last = s.log[s.log.length - 1]!;
    expect(last.kind).toBe("voice");
    expect(last.text).toContain(CHARACTERS_BY_ID.crow!.lines.death);
  });
});
