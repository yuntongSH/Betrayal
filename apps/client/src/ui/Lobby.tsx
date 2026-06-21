import { useState } from "react";
import { useStore } from "../state/store";

export function Lobby() {
  const name = useStore((s) => s.name);
  const setName = useStore((s) => s.setName);
  const createRoom = useStore((s) => s.createRoom);
  const joinRoom = useStore((s) => s.joinRoom);
  const status = useStore((s) => s.status);
  const [code, setCode] = useState("");

  const trimmed = name.trim();
  const canPlay = trimmed.length > 0;

  return (
    <div className="lobby">
      <div className="lobby-card">
        <h1 className="title">
          <span className="title-flame">🕯️</span> Dread Hollow
        </h1>
        <p className="tagline">
          A manor that builds itself, one dreadful room at a time — until one of
          you stops being a friend.
        </p>

        <label className="field">
          <span>Your name</span>
          <input
            value={name}
            maxLength={20}
            placeholder="e.g. Eleanor"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <button
          className="btn primary"
          disabled={!canPlay || status === "connecting"}
          onClick={() => createRoom(trimmed)}
        >
          Open a new manor
        </button>

        <div className="divider">or join one</div>

        <div className="join-row">
          <input
            className="code-input"
            value={code}
            maxLength={4}
            placeholder="CODE"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <button
            className="btn"
            disabled={!canPlay || code.length < 4 || status === "connecting"}
            onClick={() => joinRoom(code, trimmed)}
          >
            Enter
          </button>
        </div>

        <p className="fineprint">
          Open in multiple tabs or share the 4-letter code with friends. Best
          with 3–6 explorers.
        </p>
      </div>
    </div>
  );
}
