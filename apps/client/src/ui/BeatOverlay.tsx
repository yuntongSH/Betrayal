import { useEffect } from "react";
import { CHARACTERS_BY_ID } from "@dread-hollow/shared";
import type { CSSProperties } from "react";
import { dismissActive, useBeats } from "../state/beats";

/** Card-type icons — exact inline SVGs shared verbatim with the artifact. */
const CARD_ICON: Record<string, string> = {
  item: `<svg viewBox="0 0 24 24"><path d="M15.5 2a6.5 6.5 0 0 0-6.2 8.5l-7 7V22h4.5v-2.5H9.3V17h2.5l1.4-1.4A6.5 6.5 0 1 0 15.5 2zm2 3.6a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8z"/></svg>`,
  event: `<svg viewBox="0 0 24 24"><path d="M12 5C6.5 5 2.3 9.4 1 12c1.3 2.6 5.5 7 11 7s9.7-4.4 11-7c-1.3-2.6-5.5-7-11-7zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>`,
  omen: `<svg viewBox="0 0 24 24"><path d="M12 2a8 8 0 0 0-8 8c0 3 1.6 5.5 4 6.8V20a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-3.2c2.4-1.3 4-3.8 4-6.8a8 8 0 0 0-8-8zM8.5 10a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6zm7 0a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6zM11 17.5h2V20h-2v-2.5z"/></svg>`,
};

const CARD_KICKER: Record<string, string> = {
  item: "An Item found",
  event: "An Event unfolds",
  omen: "An Omen uncovered",
};

/** Full-screen beat presentation: card-flip reveals, death banners, toasts,
 *  and the type-colored vignette flash. Timing/queueing lives in beats.ts. */
export function BeatOverlay() {
  const active = useBeats((s) => s.active);
  const interactive = useBeats((s) => s.activeInteractive);
  const toasts = useBeats((s) => s.toasts);
  const vignette = useBeats((s) => s.vignette);

  // Enter/Space dismiss while a modal is up (movement keys are swallowed
  // separately by the input layer while beats are busy).
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        dismissActive();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active]);

  // A click inside the card only skips auto-dismissed (bot/remote) beats.
  const onInner = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!interactive) dismissActive();
  };

  const char = active?.charId ? CHARACTERS_BY_ID[active.charId] : undefined;

  return (
    <>
      {active?.kind === "card" && active.cardType && (
        <div className="card-reveal" onClick={dismissActive}>
          <div className="card-flip">
            <div className={`draw-card t-${active.cardType}`} onClick={onInner}>
              <div
                className="dc-icon"
                dangerouslySetInnerHTML={{ __html: CARD_ICON[active.cardType] ?? "" }}
              />
              <div className="dc-kicker">{CARD_KICKER[active.cardType]}</div>
              <div className="dc-name">{active.card?.name ?? active.name}</div>
              <div className="dc-text">{active.card?.text ?? active.rawText}</div>
              <div className="dc-holder">{active.playerName ?? "The house"} draws</div>
              {interactive && (
                <button className="btn primary dc-continue" onClick={dismissActive}>
                  Continue
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {active?.kind === "death" && (
        <div className="card-reveal" onClick={dismissActive}>
          <div className="death-banner" onClick={onInner}>
            <div
              className="db-disc"
              style={{ "--pc": char?.color ?? "#888" } as CSSProperties}
            >
              {char?.name.charAt(0) ?? "☠"}
            </div>
            <div className="db-kicker">Lost to the house</div>
            <h2>{char?.name ?? active.playerName}</h2>
            {char && <div className="muted">{char.title}</div>}
            {char && <p className="db-last">“{char.lines.death}”</p>}
            {interactive && (
              <button className="btn primary dc-continue" onClick={dismissActive}>
                Continue
              </button>
            )}
          </div>
        </div>
      )}

      {/* Keyed by seq so a fresh node restarts the flash animation. */}
      <div
        key={vignette.seq}
        className={`beat-vignette${vignette.seq ? ` flash t-${vignette.type}` : ""}`}
      />

      <div className="beat-toasts">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`beat-toast${t.out ? " out" : ""}`}
            style={{ "--bc": t.color } as CSSProperties}
          >
            <span>{t.glyph}</span>
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </>
  );
}
