import { useEffect, useRef } from "react";
import { useStore } from "../state/store";
import { DiceRow } from "./Die";

export function EventLog() {
  const log = useStore((s) => s.game?.log ?? []);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [log.length]);

  const recent = log.slice(-60);

  return (
    <div className="event-log">
      <div className="log-title">Chronicle</div>
      <div className="log-scroll">
        {recent.map((e) => (
          <div key={e.id} className={`log-entry k-${e.kind}`}>
            <span className="log-text">{e.text}</span>
            <DiceRow dice={e.dice} />
          </div>
        ))}
        <div ref={bottom} />
      </div>
    </div>
  );
}
