# Board-Game Basic-Rules Fidelity — Gap Analysis

Compares our engine against the **published Betrayal at House on the Hill rules**
(Avalon Hill / Hasbro, 2nd & 3rd ed.), focused on *basic* rules that should match
the board game regardless of our original content. Fancy/atmosphere divergences
are out of scope here; see [`GAP-ANALYSIS.md`](./GAP-ANALYSIS.md) for the broader
genre-mechanics comparison.

**Primary sources for the movement rule (the one that prompted this):**
- Hasbro official instructions — [2nd ed.](https://instructions.hasbro.com/en-us/instruction/avalon-hill-betrayal-at-house-on-the-hill-second-edition-cooperative-board-game) ·
  [3rd ed.](https://instructions.hasbro.com/en-us/instruction/avalon-hill-betrayal-at-house-on-the-hill-3rd-edition-cooperative-board-game-for-ages-12-and-up-for-3-6-players)
- Rules text reproduced — [UltraBoardGames](https://www.ultraboardgames.com/betrayal-at-house-on-the-hill/game-rules.php)

Legend: ✅ match · 🟡 minor divergence (often a deliberate balance choice) · 🔴 basic-rule gap

> **Update:** the one basic-rule gap found below (movement didn't stop on a card
> draw) has since been **fixed** — see *Resolution* at the end of the headline
> section.

---

## Headline finding — exploration / movement ✅ (was 🔴, now fixed)

The board game's movement rule has **two** halves:

> "On your explorer's turn, you can move up to a number of spaces equal to your
> character's current Speed."
> "Whenever a game effect makes you draw a card, you must **STOP** moving for the
> rest of your turn." — *official rules*

So the real rule is **not** a hard "one room per turn." It's: move up to Speed,
but the **first room you discover that carries a card symbol** (Event / Item /
Omen) ends your move there. Because most newly-drawn rooms have a symbol, in
practice you usually discover **one room and stop** — which is the behaviour the
"one room per round" intuition describes.

| | Board game | Our app |
|---|---|---|
| Move up to Speed spaces/turn | ✅ | ✅ `beginTurn` sets `movementLeft = Speed` (`setup.ts:146`), net-distance budget (`engine.ts:80`, `house.ts:76`) |
| **Stop moving when a card is drawn** | required | ✅ **now enforced** — `resolveRoomDraws` calls `haltMovement` after a discovered room's symbol draws a card (`engine.ts`), so movement ends for the turn |
| Bots | same rule as humans | ✅ bots no longer self-cap; they explore, and the engine halts them on a card draw exactly like humans (`bot.ts`) |

### Resolution (fixed)

The halt is applied uniformly to humans and bots:
- `haltMovement(s, p)` banks Speed-worth of spent steps and zeroes `movementLeft`
  (the same mechanism `rest` uses), so a later recompute can't refund it.
- It fires from `resolveRoomDraws` **only when the discovered room has a card
  symbol** — symbol-less rooms (corridors, landings) don't stop you, matching the
  printed rule exactly. The deliberate `search` action draws too but is not a
  discovery, so it keeps its own one-step cost instead of halting.
- Bots dropped their artificial `endTurnAfter: true`, so the engine — not the bot
  AI — now paces exploration.
- Tests: `engine.test.ts` covers both a symbol-less discovery (costs 1 step, no
  halt) and a symbol discovery (movement halts, further steps refused); the bot
  soak test still terminates.

---

## Everything else (basic rules) — mostly faithful

| Rule | Board game | App | Status |
|---|---|---|---|
| **Dice** | six faces `0,0,1,1,2,2`; a trait roll = that many dice | `DIE_FACES=[0,0,1,1,2,2]`, `traitRoll(value)` (`dice.ts:8,28`) | ✅ |
| **Haunt roll** | after each omen, roll **6** dice; haunt begins if total **<** # omens drawn | `hauntRoll`: 6 dice, `triggered = total < omenCount` (`dice.ts:37`, `engine.ts:306`) | ✅ |
| **Haunt selection** | the (omen × room) pair picks the scenario | deterministic from `(omenRank, roomRank)` (`haunt.ts:53`) — not the canonical table but ties the haunt to omen+room as intended | ✅ |
| **One attack per turn** | one attack per turn | `attacksLeft = 1` each turn (`setup.ts:153`), decremented & guarded (`haunt.ts:198,208,248`) | ✅ |
| **Combat resolution** | attacker & defender each roll a trait; higher wins; loser takes the **difference** as damage; **ties = no damage** | Might-vs-Might (physical) / Knowledge-Sanity (mental); loser's damage now **spread** across the matching trait pair via `applyCombatDamage`; **ties deal no damage** (`haunt.ts`) | ✅ |
| **Death** | a trait reaching the skull = dead | `traitIndex` hits 0 → `alive=false` (`state.ts:115`) | ✅ |
| **Dead explorer's items** | left behind / recoverable | spill to a room floor pile, pickup-able (`state.ts:131`) | ✅ |
| **Secret information** | traitor's *goal* hidden, *identity* revealed at the haunt | `redactStateForPlayer` hides the traitor objective from non-traitors; identity public (`state.ts`) | ✅ |
| **Monster turns** | monsters act on the traitor's turn; movement = **roll dice = monster Speed** | act on traitor's end-turn (`engine.ts`); movement now **rolled** `rollDice(rng, m.speed)` (`haunt.ts`) | ✅ |
| **One symbol per tile** | a tile carries at most one card symbol | `RoomDef.symbol?: CardType` (single, `types.ts`) — structurally enforced | ✅ |

### Resolved follow-ups (2026-06-28)

The earlier minor divergences have since been brought into line with the board:
- **Combat damage now spreads** across the loser's matching trait pair — physical
  over Speed+Might, mental over Sanity+Knowledge — taking each point off whichever
  is furthest from the skull (`applyCombatDamage` in `haunt.ts`). The ≤3 damage
  cap is kept as a deliberate anti-one-shot balance choice.
- **Ties deal no damage** in both player-vs-monster and player-vs-player combat
  (a tie used to count as the attacker losing).
- **Monster movement is rolled** (dice equal to Speed), not a fixed step; a
  Speed-0 monster stays rooted.
- **Tiles carry at most one symbol**, now enforced by the type system
  (`symbols: CardType[]` → `symbol?: CardType`).

> Not changed (out of scope, separate balance decisions): a monster does **not**
> take damage when a hero out-rolls its attack (the hero just defends); and the
> haunt-selection hash isn't the canonical printed (omen × room) table.

---

## Remaining (optional) follow-ups

The headline gap is fixed. The minor divergences above are deliberate balance
choices, not rule breaks, so they're left as-is unless you want closer fidelity:
- let combat losers spread damage across their two physical/mental traits, and
  make ties deal no damage;
- roll dice for monster movement instead of a fixed Speed;
- limit room tiles to a single card symbol.

Say the word on any of these and I'll take them in the same faithful spirit.
