# Changelog

## 2026-07-10 → 07-12 — The first-person sessions

The manor learned to be *walked through*. This run of sessions migrated the
stack, integrated the [pmndrs](https://github.com/pmndrs) character toolkit,
and then rebuilt the experience around a first-person view — with every
feature landing alongside its own headless verification script.

### Stack migration

- **React 19.2 · react-three-fiber 9.6 · drei 10.7 · three 0.184 ·
  @react-three/postprocessing 3 · zustand 5** (`3ea1cb5`). Zero code
  casualties; the standalone artifact's CDN import map bumped in lockstep.

### Character realism (via @pmndrs/viverse + @pmndrs/timeline)

- **Continuous locomotion** (`b66172e`): a 1D Idle↔Walk↔Run blend driven by
  live ground speed, stride rate matched to velocity so feet grip the floor.
  Room-to-room moves jog; in-room shuffles stay unhurried; departures read
  turn-then-go via a facing gate.
- **Haunt reveal cinematic** (`34e6d28`): a @pmndrs/timeline choreography —
  camera seizes the stage, pushes in low on the traitor, the traitor stares
  into the lens, dread ripples outward in distance order, the banner lands
  over the held close-up.
- **Opt-in VRM avatars** (`3224dd4`): `?vrm=<url to a .vrm>` renders your
  explorer as any VRM through viverse's model layer, with its bundled
  locomotion cycles retargeted onto the humanoid rig. `?vrm=default` demos
  the built-in mannequin; `?vrm=off` clears.
- A 19-agent adversarial review confirmed 12 defects in the above (StrictMode
  action lifecycle, bind-pose pops at clip boundaries, frame-rate-dependent
  input) — all fixed in `34e6d28`.

### First person (V, or the 👁 HUD button)

- **FirstPersonRig** (`f522fe7`): eye-height camera riding the walk with a
  stride-synced head bob and a held, flickering candle; drag to look;
  eyes-relative arrow keys. Stage etiquette: world-freeze > haunt cinematic >
  first person > camera director. A 12-finding adversarial review hardened
  the handoffs (`98b3497`).
- **Quiet turns** (`e6af387`): other players' card draws never seize your
  screen in first person — they arrive as a toast whisper, that room's ember
  burst, and the sting. Your own draws and all deaths stay direct.
- **Door plaques** (`2003808`): floating room names are gone in first person;
  adjacent rooms hang small plaques over the shared door, name tags only
  render for people in your room.

### Tabletop feel

- **You throw your own dice** (`6c946b2`): your rolls arrive held, face-down —
  cast them by clicking the tray or pressing R (10 s AFK failsafe). Results
  stay server-rolled; the throw is the reveal.
- **The card is a note by candlelight** (`e6af387`): one accent color, a
  small sigil, serif title over a hairline rule, light backdrop dim.

### Character select: the pinned evidence board

- **Intake slips instead of UI cards** (`5990bce`): each explorer is an aged
  paper record pinned to the board — sepia cabinet-card photograph, engraved
  name, typewritten measurements, a brass pin with a ribbon in the explorer's
  color, every slip hung at its own slight angle. Your pick is pressed with a
  wax seal; slips other players hold are rubber-stamped CLAIMED. The dossier
  below is the matching full intake sheet with the bond as a red-ink margin
  note. `scripts/shot-charselect.mjs` screenshots the states headlessly.

### Legibility & onboarding

- **Guide strip** (`ec50082`): one line under the turn banner that always
  answers "what do I do now?" — explore instructions with steps left, omen
  stakes while waiting, your side's secret goal during the haunt.
- **First-night welcome** (`ec50082`): a one-time four-point card that makes
  the whole night legible, pointing at the map, E/V/? keys.
- **Minimap as a full navigation instrument** (`7a52d01`): clickable explore
  pips at unexplored doorways, movement-left in the header, and a facing
  needle on your pin in first person.

### The room-detail audit (first-person close-up quality)

A four-agent audit (three source auditors + an in-game screenshot walker)
swept every room element at eye height (`3245df8`, `32f198d`, `ff183a2`,
`f3db453`):

- Every flame is a guttering teardrop (scale + emissive sway per flame) —
  no more static glowing cones.
- Stone/plaster walls read as one material with settling cracks, not a
  colored-brick patchwork with pencil scribbles.
- Wall props sit ON walls (they were embedded 5 cm into the masonry);
  ceilings exist in first person; rugs have weave; wardrobes are
  human-height; bookshelves pack jittered spines; the warding statue is a
  dark hooded figure instead of a glowing cone.
- Prop accent lights corrected from legacy to physical units — hearths and
  chapel windows actually cast light.
- **Bug caught by the audit's walker**: a token remount race wiped the
  tracking registry after the haunt, silently killing first person. Fixed
  with object-matched unregistration.

### Verification rig

Headless Playwright drivers, all runnable against `pnpm dev`:
`verify-live` (solo game to the haunt + cinematic arc), `verify-vrm`,
`verify-multiplayer` (join-by-code, log lockstep), `verify-firstperson`,
`verify-dice-throw`, `verify-fp-labels`, `verify-guide`, `verify-minimap`,
`verify-walk-math` (deterministic 60 fps walk-module sim — no browser),
plus `audit-fp-shots` for eyes-on room review. Suite status: **121 engine
tests, typecheck, client build, artifact build, CI screenshot gate — green.**
