import { describe, expect, it } from "vitest";
import { DIE_FACES, hauntRoll, rollDice, traitRoll } from "../dice";
import { Rng } from "../rng";

describe("dice", () => {
  it("uses the signature {0,0,1,1,2,2} faces", () => {
    expect([...DIE_FACES].sort()).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it("is deterministic for a given seed", () => {
    const a = rollDice(new Rng(123), 5);
    const b = rollDice(new Rng(123), 5);
    expect(a).toEqual(b);
  });

  it("rolling zero dice scores zero", () => {
    const r = rollDice(new Rng(1), 0);
    expect(r.dice).toHaveLength(0);
    expect(r.total).toBe(0);
  });

  it("never exceeds two per die", () => {
    const r = traitRoll(new Rng(999), 8);
    expect(r.dice).toHaveLength(8);
    expect(Math.max(...r.dice)).toBeLessThanOrEqual(2);
    expect(r.total).toBeLessThanOrEqual(16);
  });

  it("haunt roll always triggers once omens exceed the max possible total", () => {
    // Six dice can total at most 12, so 13 omens guarantees the haunt.
    const { triggered } = hauntRoll(new Rng(7), 13);
    expect(triggered).toBe(true);
  });

  it("haunt roll never triggers with zero omens", () => {
    const { triggered } = hauntRoll(new Rng(7), 0);
    expect(triggered).toBe(false);
  });
});
