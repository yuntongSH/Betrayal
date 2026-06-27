import type { Action, GameState } from "@dread-hollow/shared";

/** Mirror of the server's wire protocol (kept here so the client needn't
 *  depend on the Node server package). */
export type ClientMessage =
  | { t: "create-room"; name: string; resumePlayerId?: string; resumeToken?: string }
  | { t: "join-room"; code: string; name: string; resumePlayerId?: string; resumeToken?: string }
  | { t: "action"; action: Action }
  | { t: "leave-room" }
  | { t: "ping" };

export type ServerMessage =
  | { t: "joined"; code: string; playerId: string; resumeToken?: string; state: GameState }
  | { t: "state"; state: GameState }
  | { t: "error"; message: string }
  | { t: "pong" };

export interface ConnectionHandlers {
  onMessage: (msg: ServerMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
}

/** A thin, reconnect-friendly WebSocket wrapper that queues sends made before
 *  the socket has finished opening. */
export class Connection {
  private ws: WebSocket;
  private queue: ClientMessage[] = [];
  private open = false;

  constructor(url: string, private handlers: ConnectionHandlers) {
    this.ws = new WebSocket(url);
    this.ws.onopen = () => {
      this.open = true;
      for (const m of this.queue) this.raw(m);
      this.queue = [];
      this.handlers.onOpen?.();
    };
    this.ws.onmessage = (e) => {
      try {
        this.handlers.onMessage(JSON.parse(e.data as string) as ServerMessage);
      } catch {
        /* ignore malformed frames */
      }
    };
    this.ws.onclose = () => {
      this.open = false;
      this.handlers.onClose?.();
    };
  }

  send(msg: ClientMessage): void {
    if (this.open) this.raw(msg);
    else this.queue.push(msg);
  }

  private raw(msg: ClientMessage): void {
    this.ws.send(JSON.stringify(msg));
  }

  close(): void {
    this.ws.close();
  }
}
