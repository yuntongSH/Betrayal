import { useMemo } from "react";
import { CHARACTERS_BY_ID, ROOMS_BY_ID, TRAITS, getCard, legalMoves } from "@dread-hollow/shared";
import type { RoomDef, Trait } from "@dread-hollow/shared";
import { useStore } from "../state/store";

const TRAIT_COLOR: Record<Trait, string> = {
  speed: "#d8b54a",
  might: "#c2412f",
  sanity: "#6fb6b5",
  knowledge: "#7a6db0",
};

/** Plain-language notes on what a room does — its standing aura and any
 *  one-time effect on discovery — so a player knows what they walked into. */
const ROOM_SPECIAL_NOTE: Record<string, string> = {
  "heal-might": "Steadies your nerve — +1 Might the first time it's found.",
  "heal-sanity": "A small mercy — +1 Sanity the first time it's found.",
  "drain-speed": "The air drags like syrup — −1 Speed the first time it's found.",
  pit: "A hidden drop in the dark — −1 Might the first time it's found.",
  vault: "A sealed vault — loot it if you carry the Iron Key.",
  "draw-extra-omen": "It pulls the dark closer — draws an extra Omen.",
  "mystic-elevator": "An iron cage that carries you between floors.",
  "grand-staircase": "Stairs up and down — change floors here.",
  "stairs-up": "Stairs up — change floors here.",
  "stairs-down": "Stairs down — change floors here.",
  "entrance-hall": "The front door — in some haunts you escape through here.",
};
function roomNotes(def: RoomDef): string[] {
  const notes: string[] = [];
  if (def.aura && def.aura > 0) notes.push(`✦ Blessed — +${def.aura} die to every roll while you're here.`);
  else if (def.aura && def.aura < 0) notes.push(`☓ Cursed — ${def.aura} dice to every roll while you're here.`);
  if (ROOM_SPECIAL_NOTE[def.special]) notes.push(ROOM_SPECIAL_NOTE[def.special]);
  if (def.symbols.length) {
    const kinds = [...new Set(def.symbols)].map(
      (k) => ({ event: "an Event", item: "an Item", omen: "an Omen" }[k] ?? k),
    );
    notes.push(`On discovery it reveals ${kinds.join(" & ")}.`);
  }
  return notes;
}

function tagIcon(cardId: string): string {
  const card = getCard(cardId);
  if (!card) return "•";
  if (card.type === "omen") return "☠";
  if (card.effect.kind === "consumable") return "🧪";
  if (card.effect.kind === "item-passive") {
    switch (card.effect.tag) {
      case "weapon":
        return "⚔";
      case "armor":
        return "🛡";
      case "key":
        return "🗝";
      case "light":
        return "🔦";
      case "holy":
        return "✝";
      case "occult":
        return "👁";
      default:
        return "•";
    }
  }
  return "•";
}

export function TraitPanel() {
  const game = useStore((s) => s.game)!;
  const myId = useStore((s) => s.playerId);
  const giveItem = useStore((s) => s.giveItem);
  const useItem = useStore((s) => s.useItem);
  const me = game.players.find((p) => p.id === myId);
  const myTurn = !!myId && game.activePlayerId === myId;

  // Allies sharing my room I can hand items to (only on my turn).
  const partners = useMemo(() => {
    if (!myId || game.activePlayerId !== myId) return [];
    return legalMoves(game, myId).tradePartners.map((id) => ({
      id,
      name: game.players.find((p) => p.id === id)?.name ?? "ally",
    }));
  }, [game, myId]);

  if (!me || !me.characterId) return null;
  const char = CHARACTERS_BY_ID[me.characterId];
  if (!char) return null;

  const goal =
    game.haunt && me.side
      ? me.side === "traitor"
        ? game.haunt.traitorGoal
        : game.haunt.heroGoal
      : null;

  const room = me.position ? game.house[me.position] : null;
  const rdef = room ? ROOMS_BY_ID[room.roomId] : null;
  const rnotes = rdef ? roomNotes(rdef) : [];

  return (
    <>
      {rdef && (
        <div className="room-info">
          <div className="ri-head">
            <span className="ri-name">{rdef.name}</span>
            {rdef.aura ? (
              <span className={`ri-aura ${rdef.aura > 0 ? "good" : "bad"}`}>
                {rdef.aura > 0 ? "✦ blessed" : "☓ cursed"}
              </span>
            ) : null}
          </div>
          <div className="ri-flavor muted small">{rdef.flavor}</div>
          {rnotes.length > 0 && (
            <ul className="ri-notes">
              {rnotes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className={`trait-panel ${!me.alive ? "dead" : ""}`}>
      <div className="tp-head" style={{ borderColor: char.color }}>
        <div className="tp-avatar" style={{ background: char.color }}>
          {char.name.charAt(0)}
        </div>
        <div>
          <strong>{char.name}</strong>
          <div className="muted small">{char.title}</div>
        </div>
        {me.side && (
          <span className={`side-tag ${me.side}`}>
            {me.side === "traitor" ? "TRAITOR" : "HERO"}
          </span>
        )}
      </div>

      {!me.alive && <div className="tp-dead">You have been lost to the house.</div>}

      <div className="tp-traits">
        {TRAITS.map((t) => {
          const track = char.traits[t];
          const idx = me.traitIndex[t];
          return (
            <div className="tp-trait" key={t}>
              <div className="tp-trait-head">
                <span style={{ color: TRAIT_COLOR[t] }}>{t}</span>
                <strong>{track.values[idx]}</strong>
              </div>
              <div className="tp-track">
                {track.values.map((v, i) => (
                  <span
                    key={i}
                    className={`pip ${i === 0 ? "skull" : ""} ${i === idx ? "cur" : ""}`}
                    style={i === idx ? { background: TRAIT_COLOR[t] } : undefined}
                    title={i === 0 ? "death" : String(v)}
                  >
                    {i === 0 ? "☠" : v}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="tp-inv">
        <div className="muted small">Carrying</div>
        {me.inventory.length === 0 ? (
          <div className="muted small">nothing of use</div>
        ) : (
          <ul>
            {me.inventory.map((id) => {
              const card = getCard(id);
              return (
                <li key={id} className="inv-li">
                  <div className="inv-row">
                    <span className="inv-icon">{tagIcon(id)}</span>
                    <span className="inv-name">{card?.name ?? id}</span>
                    {myTurn && me.alive && card?.effect.kind === "consumable" && (
                      <button className="give-btn use" title="Use now" onClick={() => useItem(id)}>
                        use
                      </button>
                    )}
                    {partners.length > 0 && (
                      <span className="inv-give">
                        {partners.map((pt) => (
                          <button
                            key={pt.id}
                            className="give-btn"
                            title={`Give to ${pt.name}`}
                            onClick={() => giveItem(pt.id, id)}
                          >
                            → {pt.name.split(" ")[0]}
                          </button>
                        ))}
                      </span>
                    )}
                  </div>
                  {card?.text && <div className="inv-desc muted small">{card.text}</div>}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {goal && (
        <div className={`tp-goal ${me.side}`}>
          <div className="muted small">Your goal</div>
          {goal}
        </div>
      )}
      </div>
    </>
  );
}
