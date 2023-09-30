import type * as Party from "partykit/server";

export default class Server implements Party.Server {
  lastMessage: string | null = null;
  constructor(readonly party: Party.Party) { }

  onConnect(conn: Party.Connection) {
    if (this.lastMessage) {
      conn.send(this.lastMessage);
    }
  }

  onMessage(message: string, sender: Party.Connection) {
    this.lastMessage = message;
    this.party.broadcast(message, [sender.id]);
  }
}

Server satisfies Party.Worker;
