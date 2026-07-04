import { getCard } from "@dread-hollow/shared";
import type { LogKind, Trait } from "@dread-hollow/shared";

/** Shared HUD iconography — the artifact frontend carries byte-identical copies. */

export const TRAIT_COLOR: Record<Trait, string> = {
  speed: "#d8b54a",
  might: "#c2412f",
  sanity: "#6fb6b5",
  knowledge: "#7a6db0",
};

export const LOG_ICON = { info:"✧", move:"⇢", card:"❖", roll:"⚄", haunt:"⌂",
                   combat:"⚔", death:"☠", win:"❦", voice:"❝" } as Record<LogKind, string>;   // keys = LogKind

/** Inline SVG per trait: winged boot / clenched fist / candle-lit eye / open book. */
export const TRAIT_ICON: Record<Trait, string> = {
  speed:
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3h5v7.5l1.5 1.5h4a3 3 0 0 1 3 3v2H8z"/><path d="M8 5.5C5.8 5.5 4 4.7 2.5 3"/><path d="M8 8.5C6.2 8.5 4.8 7.9 3.5 6.5"/></svg>`,
  might:
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7.5 11V9.6a1.5 1.5 0 0 1 3 0V11"/><path d="M10.7 11V8.8a1.5 1.5 0 0 1 3 0V11"/><path d="M13.9 11V9.6a1.5 1.5 0 0 1 3 0V11"/><path d="M6.5 11h10.9a.6.6 0 0 1 .6.6V15c0 3.3-2.4 5.5-5.8 5.5h-1.4C7.6 20.5 6 18.6 6 15.7v-4.1a.6.6 0 0 1 .5-.6z"/><path d="M6 13.2c-1.5.3-2.3 1.2-2.3 2.4 0 1.3.8 2.2 2.3 2.6"/></svg>`,
  sanity:
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12.5C5.1 8.6 8.3 6.7 12 6.7s6.9 1.9 9.5 5.8c-2.6 3.9-5.8 5.8-9.5 5.8S5.1 16.4 2.5 12.5z"/><path d="M12 9.2c1.5 1.4 2.3 2.6 2.3 3.7a2.3 2.3 0 0 1-4.6 0c0-1.1.8-2.3 2.3-3.7z"/><path d="M12 8.8V7.2"/></svg>`,
  knowledge:
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6.2C10.2 4.9 8 4.2 5.5 4.2c-1 0-1.9.1-2.7.4v13.8c.8-.3 1.7-.4 2.7-.4 2.5 0 4.7.7 6.5 2 1.8-1.3 4-2 6.5-2 1 0 1.9.1 2.7.4V4.6c-.8-.3-1.7-.4-2.7-.4C16 4.2 13.8 4.9 12 6.2z"/><path d="M12 6.2v13.8"/></svg>`,
};

/** The death terminus on every trait track — bone-white fill, blood-red rim.
 *  Legible at 14px where the old ☠ text glyph read as an ambiguous blob. */
export const SKULL_ICON =
  `<svg viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd" stroke="#7a1622" stroke-width="0.9" stroke-linejoin="round"><path d="M12 2.2c-5 0-8.4 3.5-8.4 8 0 2.7 1.3 4.9 3.3 6.3v3c0 1 .8 1.9 1.9 1.9h6.4c1 0 1.9-.8 1.9-1.9v-3c2-1.4 3.3-3.6 3.3-6.3 0-4.5-3.4-8-8.4-8zM8.5 9.4a2.1 2.1 0 1 1 0 4.2 2.1 2.1 0 0 1 0-4.2zm7 0a2.1 2.1 0 1 1 0 4.2 2.1 2.1 0 0 1 0-4.2zM12 13.6l1.3 2.7h-2.6z"/><path d="M10 18.6v1.9M14 18.6v1.9" fill="none" stroke-width="1.4" stroke-linecap="round"/></svg>`;

/** Renders a trait's SVG glyph — markup stays identical to the artifact's strings. */
export function TraitIcon({ t }: { t: Trait }) {
  return (
    <span
      className="g-ico"
      title={t}
      style={{ color: TRAIT_COLOR[t] }}
      dangerouslySetInnerHTML={{ __html: TRAIT_ICON[t] }}
    />
  );
}

/** A small glyph for an inventory card (weapon/armor/key/…). */
export function tagIcon(cardId: string): string {
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
