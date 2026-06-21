import { createGame, reduce, type Action, type GameState } from "@dread-hollow/shared";
import type { WebSocket } from "ws";

/** Codes avoid easily-confused characters (no 0/O, 1/I). */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomSeed(): number {
  return (Math.random() * 0x7fffffff) | 0;
}

/** A single live game: its authoritative state plus the connected sockets. */
export class GameRoom {
  readonly code: string;
  state: GameState;
  readonly sockets = new Map<string, WebSocket>();

  constructor(code: string, seed: number) {
    this.code = code;
    this.state = createGame(code, seed);
  }

  apply(action: Action): void {
    reduce(this.state, action);
  }

  get isEmpty(): boolean {
    return this.sockets.size === 0;
  }
}

export class RoomManager {
  private readonly rooms = new Map<string, GameRoom>();

  create(): GameRoom {
    const code = this.freshCode();
    const room = new GameRoom(code, randomSeed());
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): GameRoom | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  remove(code: string): void {
    this.rooms.delete(code.toUpperCase());
  }

  get count(): number {
    return this.rooms.size;
  }

  private freshCode(): string {
    let code = "";
    do {
      code = Array.from(
        { length: 4 },
        () => CODE_ALPHABET[(Math.random() * CODE_ALPHABET.length) | 0],
      ).join("");
    } while (this.rooms.has(code));
    return code;
  }
}
