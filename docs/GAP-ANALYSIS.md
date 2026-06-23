# Gap Analysis — traditional genre vs. Dread Hollow

How faithfully our engine reproduces the **mechanics** of the haunted-house
exploration-and-betrayal tabletop genre, where the gaps are, and what to do
about them. Produced by four parallel analysis passes over `packages/shared`.

> **Scope & IP.** Game *mechanics/systems* are not copyrightable and are what we
> compare here. We do **not** reproduce any retail game's card text, character
> names, room names, art, or scenario text — Dread Hollow ships entirely original
> content. "Traditional" columns describe generic genre systems only.

**Status legend:** ✅ implemented · 🟡 partial · ❌ missing
**Priority:** 🔴 high · 🟠 medium · ⚪ low

---

## Executive summary — prioritized roadmap

The core loop (explore → draw → omens → haunt roll → betrayal → win-check) is
faithful and tested. The most valuable gaps, across all four areas:

### 🔴 High impact
1. **Secret / asymmetric information.** The genre's defining mechanic. We
   currently broadcast the full `GameState` (incl. the traitor's goal & ids) to
   every client and `HauntBanner` shows *both* goals to *everyone*. Needs a
   per-player **redacted state** on the server.
2. **Item drop-on-death + trading.** A dead explorer's items (incl. the Iron Key
   that some haunts need) silently vanish; players can't trade items in a shared
   room. Add a room item-pile + pickup + a give/trade action.
3. **One attack per turn.** The engine accepts unlimited `attack` actions (only
   bots self-limit) — a real exploit. Add a per-turn attack budget.
4. **Mental combat.** All combat is hard-wired to Might; Sanity/Knowledge are
   never used in fights, so half the trait system is decorative in the haunt.
5. **Haunt selection by omen × room.** We pick uniformly at random from 6
   scenarios; the genre uses the (omen, room) pair to choose, tying outcomes to
   play history and unlocking far more variety.

### 🟠 Medium impact
- Vertical movement: the **Mystic Elevator** and **stair-tile specials** carry no
  engine logic — all cross-floor travel funnels through one hard-coded hub.
- Multiple-traitor and **"everyone vs. the house"** haunts (engine supports
  `traitorIds[]` but no scenario uses it; `baseOutcome` assumes a traitor).
- Richer monsters: add `speed` + abilities + a respawn/return mechanic.
- Movement should use **effective** Speed (currently ignores Speed items).
- Item **use/consume**, omens that double as items, and wiring the dead item
  tags (`light`/`holy`/`occult`).
- Non-lethal **knock-out** tier vs. instant death; defender chooses which trait
  absorbs damage.

### ⚪ Lower / intentional
- Two figures per color; player choice of tile rotation; age-based tiebreak;
  standing in-room dice modifiers; companion/cursed/reroll item categories.

---

## 1. Turns, movement & combat

| Mechanic | Traditional | Our app | Pri |
|---|---|---|---|
| Move up to Speed | Move ≤ current Speed | ✅ `beginTurn` / `move-to` / `explore` | — |
| Movement uses item bonuses | Speed items extend movement | 🟡 uses `baseTrait`, not `effectiveTrait` (`setup.ts`) | 🟠 |
| Draw on entering a symbol room | First entry draws the deck | ✅ on `explore` (discovery) only | — |
| Discovering a room ends movement | You stop in the new tile | ✅ verified (`engine.ts` sets `movementLeft=0`) | — |
| Attack targeting (haunt) | Attack a figure in your space | ✅ same-room, opposite side | — |
| **One attack per turn** | Normally one attack/turn | ❌ engine allows unlimited; only bots self-limit | 🔴 |
| Opposed combat roll | Higher total wins; loser loses points | 🟡 implemented; deals min-1 even on near-ties | 🟠 |
| **Physical vs mental attacks** | Attacks can hit Might *or* Sanity | ❌ hard-wired to Might (`haunt.ts`) | 🔴 |
| Defender chooses trait to lose | Spread damage across traits | ❌ always Might | 🟠 |
| Item roll/combat bonuses | Weapons/armor add dice | ✅ (note: multiple weapons stack) | ⚪ |
| Monster turns / AI | Move toward & maul heroes | ✅ `monsterPhase` (1 step, no speed stat) | ⚪ |
| Knock-out vs death | Non-lethal tiers exist | ❌ skull = instant permanent death | 🟠 |
| Drop items on death | Items left in the room | ❌ inventory stranded | 🔴 |

**Top fixes:** one-attack-per-turn budget; mental combat (monster attack-trait +
attack-type on the action); drop-items-on-death; effective Speed for movement;
optional knock-out tier.

## 2. Cards — events, items, omens

| Mechanic | Traditional | Our app | Pri |
|---|---|---|---|
| Draw on room symbol | ✅ | ✅ `resolveRoomDraws` | — |
| Events resolve then discard | ✅ | ✅ incl. trait-roll branching | — |
| Items kept; trait & combat bonuses | ✅ | ✅ `effectiveTrait` / `itemTagBonus` | — |
| Omen → haunt roll vs # omens | ✅ | ✅ faithful | — |
| Tag-gated effects (key/light) | ✅ | 🟡 only `key` (vault) read; `light/holy/occult/...` dead | 🟠 |
| Omens double as items | ✅ | ❌ omens grant nothing while carried | 🟠 |
| **Drop items on death** | ✅ leave in room | ❌ vanish (can soft-lock key haunts) | 🔴 |
| **Trade items (shared room)** | ✅ | ❌ inventory append-only | 🔴 |
| Use / consume items | ✅ one-shots | ❌ all permanent/passive | 🟠 |
| Stealing items | ✅ | ❌ | 🟠 |
| Deck exhaustion/reshuffle | reshuffle discard | 🟡 events reshuffle; items never discard | ⚪ |
| Companion / cursed / reroll / penalty items | ✅ | ❌ only flat passive bonuses | ⚪ |

**Top fixes:** drop-on-death pile + pickup; give/trade action; consume path for
one-shots; give omens an item facet & use-or-remove the dead tags.

## 3. The Haunt — traitor, monsters, win conditions

| Mechanic | Traditional | Our app | Pri |
|---|---|---|---|
| Haunt roll trigger | 6 dice < omens | ✅ faithful | — |
| **Scenario selection** | (omen × room) table → ~50 | 🟡 uniform random from 6 | 🔴 |
| **Secret/asymmetric instructions** | private traitor vs hero info | ❌ full state broadcast; both goals shown to all | 🔴 |
| Dramatic reveal | ✅ | ✅ (not per-player tailored) | ⚪ |
| Win/lose check | instant on objective | ✅ `checkWinNow` after every action | — |
| Monster stats | Might/Speed/powers | 🟡 only `{might, hp}`; no speed/abilities | 🟠 |
| Monster defeat / respawn | varies; some return | 🟡 defeat works; no respawn anywhere | 🟠 |
| Multiple traitors | some haunts | 🟡 engine supports `traitorIds[]`; no scenario uses it | 🟠 |
| "Everyone vs the house" | no-traitor haunts | ❌ `baseOutcome` assumes a traitor | 🟠 |
| Variety of win conditions | dozens | 🟡 real variety across 6, but all fall back to kill-all | 🟠 |
| Traitor agency / escalation | unique powers | 🟡 only one haunt escalates (ritual clock) | 🟠 |

**Top fixes:** server-side per-player redaction (the headline gap); omen×room
selection table; a 2-traitor and a no-traitor haunt; `MonsterState.speed` +
abilities + one respawn mechanic; intentional spawn placement.

**5 original haunt ideas** (to exercise dormant mechanics): *The Long Count*
(spreading conversion → multiple traitors); *The Tide Comes In* (no-traitor,
flooding board hazard, co-op escape); *What Wears Your Face* (truly hidden
traitor + social deduction); *The Bargain* (respawning boss + trait-sacrifice);
*Procession of Lights* (escort a neutral token).

## 4. House, tiles, floors & characters

| Mechanic | Traditional | Our app | Pri |
|---|---|---|---|
| Tile floor legality | per-tile floors | ✅ `RoomDef.floors` enforced at draw | — |
| Illegal-floor tile handling | set aside/redraw | ✅ rotate to deck bottom | ⚪ |
| Fixed start tiles + central stairs | ✅ | ✅ `START_PLACEMENT` + `STAIR_LINKS` | — |
| Draw + auto-rotate on entry | ✅ | ✅ `rotationFacing` (first valid only) | ⚪ |
| **Mystic-elevator vertical move** | room moves you between floors | ❌ typed/data only, no engine case | 🟠 |
| **Stair-tile specials** | tiles provide cross-floor passage | ❌ `stairs-up/down` never read; hub hard-coded | 🟠 |
| Teleport / rooms that move you | ✅ | ❌ none | 🟠 |
| Pit / chasm | drop or damage | 🟡 `pit` = −1 Might (no fall) | ⚪ |
| 4 traits, tracks, skull death | ✅ | ✅ fully implemented + tested | — |
| Speed-based movement | ✅ | ✅ (uses base, see §1) | — |
| Standing in-room dice modifier | ✅ | 🟡 only one-time entry effects | 🟠 |
| Two figures per color | ✅ | ❌ single token | ⚪ |
| Age tiebreak | turn-order tiebreak | ❌ `age` stored, unused | ⚪ |

**Top fixes:** implement the elevator (floor change) and make stair specials
drive connectivity (or document the hub as deliberate); add a relocate/teleport
special; consider a standing in-room roll modifier.

---

## Notes on deliberate divergences

Some differences are intentional for a digital, real-time adaptation: monsters
are engine-driven rather than hand-controlled by the traitor; cards auto-resolve
on draw (no manual card-resolution phase); one token per player. These are
design choices, not defects — but the 🔴 items above are genuine fidelity gaps
worth closing, led by **secret information**, **item mobility**, and
**combat depth**.
