import { useMemo } from "react";
import { CHARACTERS_BY_ID, TRAITS, getCard, legalMoves } from "@dread-hollow/shared";
import type { Trait } from "@dread-hollow/shared";
import { useStore } from "../state/store";

const TRAIT_COLOR: Record<Trait, string> = {
  speed: "#d8b54a",
  might: "#c2412f",
  sanity: "#6fb6b5",
  knowledge: "#7a6db0",
};

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

  return (
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
            {me.inventory.map((id) => (
              <li key={id}>
                <span className="inv-icon">{tagIcon(id)}</span>
                {getCard(id)?.name ?? id}
                {myTurn && me.alive && getCard(id)?.effect.kind === "consumable" && (
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
              </li>
            ))}
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
  );
}
