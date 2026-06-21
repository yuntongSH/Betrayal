# Contributing to Dread Hollow

Thanks for wanting to help haunt this house. 🕯️

## Ground rules

- **Keep content original.** This project deliberately ships *only* original
  rooms, cards, characters and scenarios. Please don't copy names, flavor text,
  art, or specific scenarios from any commercial board game — mechanics are fine,
  expression is not.
- Be kind. See [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## Getting set up

```bash
pnpm install
pnpm dev:server   # ws://localhost:8787
pnpm dev:client   # http://localhost:5173
```

Before opening a PR:

```bash
pnpm typecheck
pnpm test
pnpm build
```

CI runs the same three steps.

## Where things live

- Pure rules + content: `packages/shared/src` (start at `engine.ts`).
- Network transport: `packages/server/src`.
- 3D + UI: `apps/client/src`.

The rules engine is the source of truth. If a rule changes, it changes there —
the server and client must never re-implement rules locally.

## Adding a haunt scenario

Haunts are data with a little logic, in
[`packages/shared/src/content/haunts.ts`](packages/shared/src/content/haunts.ts).
Add an entry to `HAUNTS` with:

- `name`, `reveal` (use `{traitor}` for the traitor's name), `heroGoal`,
  `traitorGoal`;
- an optional `chooseTraitors` (defaults to the player who drew the omen);
- a `setup(state, traitorIds, ctx)` that spawns monsters / seeds `vars`;
- a `checkWin(state)` returning `"heroes"`, `"traitor"`, or `null`.

Keep `checkWin` dependent only on `types` (no engine imports) to avoid cycles,
and add a test in `src/__tests__/haunt.test.ts`.

## Adding rooms or cards

Edit `content/rooms.ts`, `content/events.ts`, `content/items.ts`, or
`content/omens.ts`. Every room needs at least one doorway. Card effects are
typed in `types.ts` (`CardEffect`) and resolved in `engine.ts`.

## Commit style

Conventional-ish prefixes are appreciated: `feat:`, `fix:`, `test:`, `docs:`,
`chore:`.
