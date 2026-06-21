import { Rng } from "./rng";

/**
 * The signature die of the genre: six faces showing 0, 0, 1, 1, 2, 2.
 * A "trait roll" rolls a number of these equal to your current trait value, so
 * results cluster around the average (1 per die) — swingy, but rarely extreme.
 */
export const DIE_FACES: readonly number[] = [0, 0, 1, 1, 2, 2];

export interface DiceRoll {
  dice: number[];
  total: number;
}

export function rollDice(rng: Rng, count: number): DiceRoll {
  const n = Math.max(0, Math.floor(count));
  const dice: number[] = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const face = DIE_FACES[rng.int(DIE_FACES.length)]!;
    dice.push(face);
    total += face;
  }
  return { dice, total };
}

/** Roll a number of dice equal to the trait's current value. */
export function traitRoll(rng: Rng, traitValue: number): DiceRoll {
  return rollDice(rng, traitValue);
}

/**
 * The haunt roll. After each omen is drawn the active player rolls six dice;
 * if the total is *less than* the number of omens currently in play, the house
 * turns and the haunt begins.
 */
export function hauntRoll(
  rng: Rng,
  omenCount: number,
): { roll: DiceRoll; triggered: boolean } {
  const roll = rollDice(rng, 6);
  return { roll, triggered: roll.total < omenCount };
}
