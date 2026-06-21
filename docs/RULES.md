# Dread Hollow — Rules

This is the rulebook for **Dread Hollow's own implementation** of the
haunted-house-exploration-and-betrayal genre. The text below describes the
mechanics this codebase actually runs; all wording, content and scenarios are
original to this project.

## Goal

Explore a manor that builds itself as you go. Find useful things. Try not to
read too many omens — because once the house has seen enough of them, it turns,
one of the explorers becomes a **traitor**, and the game becomes a fight that
one side will win and the other will lose.

The game has two acts:

1. **Exploration** — everyone is on the same side, poking through the house.
2. **The Haunt** — the betrayal fires. One player (or more) becomes the
   traitor; the rest are heroes. Each side has its own victory condition.

## Setup

- Each player picks one of six **characters**. A character has four **traits**:
  **Speed**, **Might**, **Sanity** and **Knowledge**. Each trait is a track of
  numbered spaces; you start on a fixed space and a marker slides up or down it
  during play.
- The leftmost space of every track is a **skull**. If any trait ever drops onto
  the skull, that explorer is dead and out of the game.
- The party starts together in the **Entrance Hall**. Five rooms are pre-placed:
  the Entrance Hall, Foyer and Grand Staircase on the ground floor, an Upper
  Landing above and a Basement Landing below. The Grand Staircase links all three
  floors.

## Turns

On your turn you may **move** a number of rooms up to your current **Speed**.

- Moving into an already-discovered, connected room costs one move.
- Moving through an **open doorway** into the unknown draws the top legal tile of
  the room deck, places it so a door lines up with the one you came through, and
  moves you in — also one move. The Grand Staircase additionally connects up and
  down between floors.

When you **discover** a new room you immediately resolve, in order:

- the room's **special** effect, if any (a heal, a drain, a fall, the keyed
  vault, and so on); then
- one draw for each **card symbol** the room shows.

End your turn when you're done; play passes to the next living explorer.

## Trait rolls & dice

Many effects ask for a **trait roll**. You roll a number of special dice equal
to your current value in that trait. Each die shows **0, 0, 1, 1, 2, 2**, so the
average die is 1. Compare the total against the listed difficulty: meet or beat
it to succeed. Carried items can add dice.

## Cards

- **Events** resolve immediately and are discarded. Many are trait rolls that
  help you on a success and hurt you on a failure.
- **Items** are kept. They grant passive bonuses — weapons add attack dice,
  armor adds defense dice, and some items raise a trait or unlock the vault.
- **Omens** are kept like items, but each one drawn forces a **haunt roll**.

## The haunt roll

After any omen is drawn, the active player rolls **six** dice. If the total is
**less than the number of omens currently in play**, the house turns and the
haunt begins. The first omen is almost always safe; by the fourth or fifth, the
odds are grim.

## The Haunt

When the haunt fires:

- A scenario is chosen. The player who drew the fateful omen becomes the
  **traitor**; everyone else becomes a **hero**.
- The scenario sets the stage: it may spawn **monsters** (controlled by the
  traitor) and gives each side a goal.
- The reveal tells every player privately which side they're on.

From then on, players still take turns moving and exploring, but now they can
also **fight**:

- Attacking a **monster** in your room pits your Might (plus weapons) against the
  monster's; win and you wound it, lose and it wounds you.
- During the haunt you may also attack a **rival** sharing your room.
- On the traitor's turn, every monster acts: it strikes a hero in its room, or
  advances one step along the shortest path toward the nearest hero.

The game ends the moment a side's victory condition is met.

## The scenarios

Six original haunts ship today:

- **The Crawling Dark** — shades pour into the house. Heroes must destroy the
  traitor; the traitor must extinguish every hero.
- **Blood Moon Ritual** — the traitor performs a rite. Heroes must kill the
  traitor before the ritual completes (four of the traitor's turns).
- **The Hungering House** — the house itself is the enemy. Heroes escape by
  destroying its maws, or by carrying the Iron Key to the Entrance Hall.
- **Wake of the Drowned** — a vast thing rises in black water. Heroes must
  survive five rounds or destroy it; the traitor must drown them all.
- **The Hunt** — the traitor becomes a beast. Heroes reach consecrated ground
  (a Chapel) or put the beast down; the traitor runs them all down.
- **Plague of Whispers** — a swarm of weak whispers. Heroes silence every one
  (or kill the traitor); the traitor lets them drown the living.

More scenarios are easy to add — see [`CONTRIBUTING.md`](../CONTRIBUTING.md).
