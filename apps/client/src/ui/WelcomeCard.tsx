/**
 * First-night welcome — shown once, ever (localStorage), the moment a player
 * first stands in the manor. Four sentences that make the whole game legible;
 * everything deeper lives behind the ? help this card points to. Reuses the
 * help-overlay class so the input layer swallows game keys while it's up.
 */
import { useState } from "react";

const FLAG = "dh:welcomed";

export function WelcomeCard() {
  const [open, setOpen] = useState(() => {
    try {
      return !localStorage.getItem(FLAG);
    } catch {
      return false;
    }
  });
  if (!open) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(FLAG, "1");
    } catch {
      /* private browsing */
    }
    setOpen(false);
  };
  return (
    <div className="help-overlay" onClick={dismiss}>
      <div className="help-card welcome-card" onClick={(e) => e.stopPropagation()}>
        <h2>Welcome to Dread Hollow</h2>
        <ol className="help-list">
          <li>
            <strong>Explore together.</strong> Each turn, walk up to your Speed —
            through flame-marked doorways to reveal new rooms. New rooms give
            cards: Items help, Events happen, Omens stay with you… and tempt the house.
          </li>
          <li>
            <strong>The house turns.</strong> Every omen drawn risks the haunt.
            When it comes, one explorer becomes the traitor — maybe you.
          </li>
          <li>
            <strong>Then, survive.</strong> Each side gets a secret goal (yours
            shows at the top). Heroes against the traitor and the house itself.
          </li>
          <li>
            <strong>Everything you need is on screen.</strong> The gold line
            under the banner always says what to do next; the map (bottom right)
            walks and explores by click; <kbd>E</kbd> ends your turn, <kbd>V</kbd>{" "}
            sees through your explorer's eyes, <kbd>?</kbd> opens the full guide.
          </li>
        </ol>
        <button className="btn primary" onClick={dismiss}>
          Enter the manor ▸
        </button>
      </div>
    </div>
  );
}
