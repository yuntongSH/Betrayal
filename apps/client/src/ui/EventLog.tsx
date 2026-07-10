import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useStore } from "../state/store";
import { DiceRow } from "./Die";
import { LOG_ICON } from "./icons";

/**
 * The Chronicle, two ways: a compact icon-led toast feed by default (last five
 * entries, each fading to 40% after 8s), or — via the 📜 toggle — the full
 * scrolling panel. Entry age survives re-renders through a first-seen map fed
 * to a negative animation-delay, so animations resume mid-flight.
 */
/** Stable empty log so the selector returns the same reference pre-game —
 *  zustand v5 re-runs selectors on every snapshot read and a fresh `[]`
 *  would loop the render. */
const NO_LOG: never[] = [];

export function EventLog() {
  const log = useStore((s) => s.game?.log ?? NO_LOG);
  const [open, setOpen] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const logSeen = useRef(new Map<number, number>());

  useEffect(() => {
    if (open) bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [log.length, open]);

  const recent = open ? log.slice(-60) : log.slice(-5);
  const now = Date.now();
  for (const e of recent) if (!logSeen.current.has(e.id)) logSeen.current.set(e.id, now);

  return (
    <div className={`event-log${open ? " open" : ""}`}>
      <div className="log-head">
        {open && <span className="log-title">Chronicle</span>}
        <button className="log-toggle" title="Chronicle" onClick={() => setOpen((o) => !o)}>
          {open ? "✕" : "📜"}
        </button>
      </div>
      <div className="log-scroll">
        {recent.map((e) => (
          <div
            key={e.id}
            className={`log-entry k-${e.kind}`}
            style={{ "--age": `-${now - (logSeen.current.get(e.id) ?? now)}ms` } as CSSProperties}
          >
            <span className="li">{LOG_ICON[e.kind]}</span>
            <span className="log-text">{e.text}</span>
            <DiceRow dice={e.dice} />
          </div>
        ))}
        <div ref={bottom} />
      </div>
    </div>
  );
}
