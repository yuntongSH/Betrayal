import { useState } from "react";
import { ambient } from "../audio/ambient";

/** Speaker button: first click starts the ambience (satisfying the browser's
 *  autoplay gesture requirement), later clicks toggle mute. */
export function AudioToggle() {
  const [on, setOn] = useState(false);

  return (
    <button
      className="audio-toggle"
      title={on ? "Mute ambience" : "Play ambience"}
      onClick={() => {
        if (!ambient.isStarted) {
          ambient.start();
          setOn(true);
          return;
        }
        setOn(!ambient.toggleMute());
      }}
    >
      {on ? "🔊" : "🔈"}
    </button>
  );
}
