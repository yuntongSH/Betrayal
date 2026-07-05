import { CHARACTERS_BY_ID, ROOMS_BY_ID, TRAITS } from "@dread-hollow/shared";
import type { Trait } from "@dread-hollow/shared";
import type { CSSProperties } from "react";
import { useStore } from "../state/store";
import { useBeats, type TraitDelta } from "../state/beats";
import { flashOnMap } from "./Minimap";
import { TRAIT_COLOR, TRAIT_ICON } from "./icons";

/** Newest live delta for one chip cell (multiple hits on a trait are rare). */
function latestDelta(deltas: readonly TraitDelta[], playerId: string, trait: Trait): TraitDelta | undefined {
  for (let i = deltas.length - 1; i >= 0; i--) {
    const d = deltas[i]!;
    if (d.playerId === playerId && d.trait === trait) return d;
  }
  return undefined;
}

/** Compact party chips: portrait medallion, name, current room, and every
 *  player's four trait values always on show (icon + number). A change pulses
 *  the value and floats a signed badge — the whole party's swings stay legible
 *  at a glance. Each chip is a button: click locates that player on the map. */
export function PartyRoster() {
  const game = useStore((s) => s.game)!;
  const myId = useStore((s) => s.playerId);
  const deltas = useBeats((s) => s.traitDeltas);

  return (
    <div className="party-roster">
      {game.players.map((p) => {
        const char = p.characterId ? CHARACTERS_BY_ID[p.characterId] : undefined;
        const active = game.activePlayerId === p.id;
        const room = p.position ? game.house[p.position] : undefined;
        const where = !p.alive
          ? "fallen"
          : room
            ? ROOMS_BY_ID[room.roomId]?.name ?? "…"
            : "…";
        return (
          <button
            key={p.id}
            className={`roster-row ${active ? "active" : ""} ${!p.alive ? "dead" : ""}`}
            title={`Show ${p.name} on the map`}
            aria-label={`Show ${p.name} on the map`}
            onClick={() => flashOnMap(p.id)}
          >
            <span className="roster-line">
              <span
                className="roster-avatar"
                style={{ "--pc": char?.color ?? "#888" } as CSSProperties}
              >
                {p.alive ? char?.name.charAt(0) ?? "?" : "☠"}
              </span>
              <span className="roster-name">
                {p.name}
                {p.id === myId ? " (you)" : ""}
              </span>
              {char && (
                <span className="roster-traits">
                  {TRAITS.map((t) => {
                    const val = char.traits[t].values[p.traitIndex[t]];
                    const d = latestDelta(deltas, p.id, t);
                    return (
                      <span
                        key={t}
                        className="roster-trait"
                        style={{ "--tc": TRAIT_COLOR[t] } as CSSProperties}
                        title={`${t} ${val}`}
                      >
                        <span className="g-ico" dangerouslySetInnerHTML={{ __html: TRAIT_ICON[t] }} />
                        {/* keyed by delta id so a repeat hit restarts the pulse */}
                        <span
                          key={d ? `v${d.id}` : "v"}
                          className={`rt-val${d ? (d.delta > 0 ? " trait-pulse-up" : " trait-pulse-down") : ""}`}
                        >
                          {val}
                        </span>
                        {d && (
                          <span key={`d${d.id}`} className={`trait-delta ${d.delta > 0 ? "up" : "down"}`}>
                            <span className="g-ico" dangerouslySetInnerHTML={{ __html: TRAIT_ICON[t] }} />
                            {d.delta > 0 ? `+${d.delta}` : `−${-d.delta}`}
                          </span>
                        )}
                      </span>
                    );
                  })}
                </span>
              )}
              {p.side === "traitor" && <span className="roster-traitor">☠</span>}
            </span>
            <span className="roster-where">— {where}</span>
          </button>
        );
      })}
    </div>
  );
}
