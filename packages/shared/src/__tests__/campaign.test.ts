/**
 * Legacy-campaign carry-over: heirloom items + bloodline/heirloom trait bumps
 * applied at chapter start, and scarred rooms cursed for the rest of the saga.
 */
import { describe, expect, it } from "vitest";
import { reduce } from "../engine";
import { createGame } from "../setup";
import { getPlayer, roomAura } from "../state";
import { CHARACTERS_BY_ID } from "../content";
import type { CampaignModifiers, GameState } from "../types";

function lobby(campaign?: CampaignModifiers): GameState {
  const s = createGame("camp", 5);
  reduce(s, { type: "join", playerId: "a", name: "A" });
  reduce(s, { type: "join", playerId: "b", name: "B" });
  reduce(s, { type: "join", playerId: "c", name: "C" });
  reduce(s, { type: "choose-character", playerId: "a", characterId: "vance" });
  reduce(s, { type: "choose-character", playerId: "b", characterId: "crow" });
  reduce(s, { type: "choose-character", playerId: "c", characterId: "penny" });
  if (campaign) s.campaign = campaign;
  return s;
}

describe("legacy campaign carry-over", () => {
  it("an heirloom is carried from the first turn and steadies its bearer", () => {
    const baseline = lobby();
    reduce(baseline, { type: "start-game", playerId: "a" });
    const baseMight = getPlayer(baseline, "a")!.traitIndex.might;

    const s = lobby({
      heirlooms: [{ cardId: "it-dagger", charId: "vance", name: "Grandfather's Dagger", trait: "might", level: 1 }],
      bloodlines: {},
      scars: {},
    });
    reduce(s, { type: "start-game", playerId: "a" });
    const a = getPlayer(s, "a")!;
    expect(a.inventory).toContain("it-dagger"); // already in hand
    expect(a.traitIndex.might).toBe(baseMight + 1); // +level to its trait
  });

  it("a bloodline bonus hardens the heir at chapter start (never onto the skull)", () => {
    const s = lobby({
      heirlooms: [],
      bloodlines: { crow: { generation: 3, bonus: { sanity: 2 } } },
      scars: {},
    });
    const baseline = lobby();
    reduce(baseline, { type: "start-game", playerId: "a" });
    const baseSanity = getPlayer(baseline, "b")!.traitIndex.sanity;
    reduce(s, { type: "start-game", playerId: "a" });
    const max = CHARACTERS_BY_ID["crow"]!.traits.sanity.values.length - 1;
    expect(getPlayer(s, "b")!.traitIndex.sanity).toBe(Math.min(max, baseSanity + 2));
  });

  it("a scarred room is cursed ground (−1 die) for the rest of the campaign", () => {
    const s = lobby({ heirlooms: [], bloodlines: {}, scars: { "entrance-hall": "Where the first of us fell." } });
    reduce(s, { type: "start-game", playerId: "a" });
    const a = getPlayer(s, "a")!; // everyone starts in the Entrance Hall
    expect(roomAura(s, a)).toBe(-1);
  });

  it("a one-off game (no campaign) is wholly unaffected", () => {
    const s = lobby();
    reduce(s, { type: "start-game", playerId: "a" });
    expect(s.campaign).toBeUndefined();
    expect(roomAura(s, getPlayer(s, "a")!)).toBe(0); // entrance-hall has no aura
  });
});
