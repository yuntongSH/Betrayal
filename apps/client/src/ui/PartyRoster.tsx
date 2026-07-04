import { CHARACTERS_BY_ID, TRAITS } from "@dread-hollow/shared";
import type { CSSProperties } from "react";
import { useStore } from "../state/store";
import { TRAIT_COLOR } from "./icons";

/** Compact party chips: portrait medallion, name, four trait ticks — the
 *  player's position is visible in the 3D house, so no room text here. */
export function PartyRoster() {
  const game = useStore((s) => s.game)!;
  const myId = useStore((s) => s.playerId);

  return (
    <div className="party-roster">
      {game.players.map((p) => {
        const char = p.characterId ? CHARACTERS_BY_ID[p.characterId] : undefined;
        const active = game.activePlayerId === p.id;
        return (
          <div
            key={p.id}
            className={`roster-row ${active ? "active" : ""} ${!p.alive ? "dead" : ""}`}
          >
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
            {p.alive && char && (
              <span className="roster-ticks">
                {TRAITS.map((t) => (
                  <i
                    key={t}
                    title={`${t} ${char.traits[t].values[p.traitIndex[t]]}`}
                    style={
                      {
                        "--tc": TRAIT_COLOR[t],
                        "--h": p.traitIndex[t] / (char.traits[t].values.length - 1),
                      } as CSSProperties
                    }
                  />
                ))}
              </span>
            )}
            {p.side === "traitor" && <span className="roster-traitor">☠</span>}
          </div>
        );
      })}
    </div>
  );
}
