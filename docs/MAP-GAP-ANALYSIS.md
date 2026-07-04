# Map / Tile-Composition Fidelity — Gap Analysis

Compares our room deck — the "possible composition of the rooms" — against the
**published Betrayal at House on the Hill tile set** (Avalon Hill / Hasbro,
3rd ed. 2022, with 2nd ed. as the door-count baseline). Prompted by the
complaint that *"the map should be liberate enough, a room should have enough
doors, so that the players can build an entire floor on the ground, 1st and
basement floor."* Companion piece to
[`RULES-GAP-ANALYSIS.md`](./RULES-GAP-ANALYSIS.md); as there, mechanical facts
(tile counts, door counts, floor distributions) are matched to the board game
while every name and flavor line stays original to this project.

**Primary sources:**
- Official 3rd-ed. rulebook (Hasbro F4541) — [PDF](https://www.qugs.org/rules/r358504.pdf)
  ("What's in the Box": **42 room tiles + 3 starting tiles**; 74 game cards:
  43 Events / 22 Items / 9 Omens) · [Hasbro instructions page](https://instructions.hasbro.com/en-us/instruction/avalon-hill-betrayal-at-house-on-the-hill-3rd-edition-cooperative-board-game-for-ages-12-and-up-for-3-6-players)
- 3rd-ed. tile list with regions & card symbols — [Betrayal 3rd Edition Wiki: Rooms](https://betrayal3rdedition.fandom.com/wiki/Rooms)
  (all 42 base tiles; expansion tiles excluded from the counts below) ·
  cross-checked against [Wikipedia](https://en.wikipedia.org/wiki/Betrayal_at_House_on_the_Hill)
  ("three starting room tiles and 42 other room tiles")
- Per-tile **door counts** are not published in machine-readable form for the
  3rd ed., so the 2nd-ed. tile set is the baseline, reconstructed from two
  independent open-source implementations that encode the physical tiles:
  [gnurgle/Betrayal](https://github.com/gnurgle/Betrayal) (`Room_Populate.java`)
  and [tygentry/betrayal-at-house-on-the-hill](https://github.com/tygentry/betrayal-at-house-on-the-hill)
  (per-room door masks) — **10/10 sampled tiles agree** between the two;
  floors/symbols additionally cross-checked against
  [unique-pear486/bhh](https://github.com/unique-pear486/bhh) (`data.js`, 42 tiles).

Legend: ✅ match · 🟡 minor divergence (deliberate) · 🔴 composition gap

> **Update:** all 🔴 gaps below have been **fixed** in
> `packages/shared/src/content/rooms.ts` — see *Resolution*. The composition is
> now pinned by `packages/shared/src/__tests__/rooms-composition.test.ts`.

---

## Headline finding — the deck was half a house 🔴 (now fixed)

The engine already implements the official draw rule (reveal a tile, **bury**
it under the stack if it doesn't match your floor, repeat — `drawRoomForFloor`
in `decks.ts`) and free tile rotation on placement. The code was faithful; the
**content** wasn't. Our deck simply didn't contain enough tiles — and not the
right floor spread — for three floors to grow into full boards:

| Composition metric | Official (3rd ed.) | Ours (before) | Ours (after) |
|---|---|---|---|
| Drawable room tiles | **42** | 22 | **42** |
| Pre-placed start tiles | 3 tiles / 5 rooms | 5 rooms | 5 rooms ✅ |
| Placeable on **Ground** | **23** | 14 | **23** |
| Placeable on **Upper** | **22** | 13 | **24** |
| Placeable on **Basement** | **19** | 11 | **21** |
| Upper+Basement dual tiles | 6 | **0** | 6 |
| Ground+Upper dual tiles | 10 | 6 | 10 |
| Ground+Basement dual tiles | 2 | 2 ✅ | 2 |
| All-floor tiles | 2 | 4 | 4 🟡 |
| Ground-only / Upper-only / Basement-only | 9 / 4 / 9 | 2 / 3 / 5 | 7 / 4 / 9 |
| Event / Omen / Item / blank tiles | 15 / 14 / 6 / 7 | 7 / 7 / 5 / 3 | 15 / 12 / 7 / 8 |

Door distribution (official per-tile doors are 2nd-ed. numbers, the two
editions sharing the 42-tile shape):

| Doors per drawable tile | Official (2nd ed.) | Ours (before) | Ours (after) |
|---|---|---|---|
| 1 door (dead end) | 11 (26%) | 2 (9%) | 6 (14%) |
| 2 doors | 19 (45%) | 9 (41%) | 17 (40%) |
| 3 doors | 3 (7%) | 6 (27%) | 9 (21%) |
| 4 doors | 9 (21%) | 5 (23%) | 10 (24%) |
| **Average doors/tile** | **2.24** | 2.64 | **2.55** |

Start-tile fan-out (how many doors each floor's pre-placed hub offers):

| Start tile | Official | Ours (before) | Ours (after) |
|---|---|---|---|
| Entrance Hall | 3 doors | **1** | **3** |
| Foyer | 4 | 4 ✅ | 4 ✅ |
| Grand Staircase | 1 | 1 ✅ | 1 ✅ |
| Upper Landing | 4 | **3** | **4** |
| Basement Landing | 4 | **3** | **4** |
| Open doors per floor at setup (G/U/B) | 4 / 4 / 4 | **2** / 3 / 3 | 4 / 4 / 4 |

## The gaps, ranked by gameplay impact

1. 🔴 **Deck half-size (22 vs 42).** With 22 drawable tiles shared across three
   floors, no floor could ever approach the ~14-tile spread a real game's
   ground floor reaches — the whole *house* maxed out around the size one
   official *floor* should be. Fixed: 42 drawable tiles.
2. 🔴 **Basement starvation (11 legal tiles vs 19).** Half the deck was illegal
   in the basement, so basement exploration hit "no room can be drawn" long
   before the floor looked like a floor. Fixed: 21 basement-legal tiles.
3. 🔴 **The Upper+Basement band was missing entirely (0 vs 6).** The official
   deck keeps a whole band of attic-or-cellar rooms precisely so the two outer
   floors both have headroom. Fixed with six new dual tiles.
4. 🔴 **Ground floor started with 2 growth doors, not 4.** Our Entrance Hall
   was a 1-door dead cap (official: 3 doors), and both landings were 3-door
   (official: 4). The very first turns bottlenecked on the Foyer's east/west
   doors. Fixed: official fan-out on all five start rooms.
5. 🟡 **Symbol mix** was proportionally fine but half-size; now 15 event / 12
   omen / 7 item / 8 blank — within a few tiles of the official 15/14/6/7.
   (We keep omen tiles slightly under the official share because our omen deck
   has 8 cards to the official 9; tiles beyond the deck draw nothing.)
6. 🟡 **Originality cleanup:** one tile carried the official game's coined name
   verbatim — "Pentagram Chamber" is now the **Sigil Chamber** (id
   `pentagram-chamber` kept for decor/save compatibility). "Mystic Elevator" is
   the same kind of coinage but its display string is also hard-coded in
   `apps/client/src/state/beats.ts`, so renaming it needs a coordinated change
   outside this package — flagged as a follow-up.

### Deliberate divergences (kept, 🟡)

- **Door-richer than the printed tiles** (avg 2.55 vs 2.24; dead ends 14% vs
  26%; 45% of tiles have 3+ doors vs 29%). That's the complaint, honoured: the
  official numbers are treated as the *floor*, not the ceiling, so floors close
  into loops rather than combing into corridors. The regression test enforces
  official-or-better, never worse.
- **Four all-floor tiles instead of two** (our two hallways, the elevator and
  the vault) — they compensate the slightly leaner Ground-only band so
  per-floor availability still meets the official 23/22/19.
- **Five separate start rooms instead of one triple tile + two landings** — the
  official triple tile *is* three rooms (Entrance Hall / Hallway / Staircase);
  we place the same shape as individual tiles around the stair hub.

## Resolution (what changed)

All in `packages/shared/src/content/rooms.ts` (content only — no engine code):

- **Start tiles:** Entrance Hall 1→3 doors; Upper & Basement Landings 3→4.
- **20 new drawable rooms** (all-original names and flavor, same voice as the
  existing entries), chosen to land the floor-allowance, symbol and door
  targets above:

  | New id | Floors | Doors | Symbol |
  |---|---|---|---|
  | `solarium` | ground+upper | 4 | event (aura +1) |
  | `music-room` | ground+upper | 3 | omen |
  | `trophy-hall` | ground+upper | 4 | item |
  | `sewing-room` | ground+upper | 2 | event |
  | `old-surgery` | upper+basement | 2 | omen |
  | `harmonium-room` | upper+basement | 2 | event |
  | `cage-room` | upper+basement | 2 | omen |
  | `rafter-crawl` | upper+basement | 2 | event |
  | `servants-passage` | upper+basement | 4 | — |
  | `dumbwaiter-shaft` | upper+basement | 1 | — |
  | `ruined-ballroom` | ground | 4 | event |
  | `morning-room` | ground | 2 | event |
  | `gun-room` | ground | 2 | item |
  | `verandah` | ground | 3 | event |
  | `cloakroom` | ground | 1 | — |
  | `cupola` | upper | 1 | omen |
  | `cistern-walk` | basement | 4 | event |
  | `coal-bunker` | basement | 1 | — |
  | `well-room` | basement | 2 | omen (aura −1) |
  | `sump-passage` | basement | 3 | — |

  > **Decor follow-up:** these ids render with the generic tasteful default
  > until composers are added in `packages/decor` (`COMPOSERS[...]`).

- Every pre-existing room id is preserved, and new rooms are appended after the
  existing ones so `ROOM_RANK` (haunt selection) is unchanged for old content.

**Tests** (`rooms-composition.test.ts`, new): deck ≥ 42; per-floor availability
≥ 23/22/19; average doors ≥ 2.24 with dead ends ≤ 26% and 3-plus-door tiles
≥ 29% (the official ratios as hard bounds); symbol mix within official-shaped
bands; start fan-out pinned; and a door-budget simulation proving **every
floor can host its entire legal tile set simultaneously** — the frontier of
open doorways never runs dry even in the most door-hungry placement order.

One bot test was updated (`bot.test.ts`, no-pacing invariant): the old deck
happened to contain **zero symbol-less dead ends**, so "never re-enter a room
this turn" held trivially. The official set has such tiles (Coal Chute,
Laundry Chute…), and ours now does too (Cloakroom, Coal Bunker, Dumbwaiter
Shaft) — a blank dead end doesn't halt movement, so walking back out through
the room you came from is correct play, not pacing. The invariant now permits
re-entry **only when a new room was discovered since last standing there**;
pure oscillation still fails.

`pnpm test`: 121/121 green (was 113; +8 composition tests). `pnpm typecheck`
clean.
