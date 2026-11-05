import type { ChoiceEvent } from "./domain";
import type { SessionStore } from "./store";

export interface EventSocket {
  send(data: string): unknown;
  close(): unknown;
}

/**
 * The one place events leave the session: append to the ledger, then tell every
 * connected browser. Transport code calls in; it does not fan out itself.
 */
export class EventFeed {
  readonly #sockets = new Set<EventSocket>();

  constructor(private readonly store: SessionStore) {}

  get size(): number {
    return this.#sockets.size;
  }

  attach(socket: EventSocket): void {
    this.#sockets.add(socket);
  }

  detach(socket: EventSocket): void {
    this.#sockets.delete(socket);
  }

  async record(event: ChoiceEvent): Promise<void> {
    await this.store.appendEvent(event);
    this.broadcast({ type: "event", event });
  }

  broadcastReload(screenId: number | null): void {
    this.broadcast({ type: "reload", screenId });
  }

  broadcast(message: Record<string, unknown>): void {
    const payload = JSON.stringify(message);
    for (const socket of this.#sockets) {
      try {
        socket.send(payload);
      } catch {
        this.#sockets.delete(socket);
      }
    }
  }
}
