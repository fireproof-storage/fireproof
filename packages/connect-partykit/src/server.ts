import type * as Party from "partykit/server";

export default class Server implements Party.Server {
  lastMessage: string | null = null;
  constructor(public party: Party.Party) { }

  async onStart() {
    return this.party.storage.get("head").then(head => {
      if (head) {
        this.lastMessage = head as string;
      }
    });
  }

  onConnect(conn: Party.Connection) {
    if (this.lastMessage) {
      conn.send(this.lastMessage);
    }
  }

  onMessage(message: string, sender: Party.Connection) {
    this.lastMessage = message;
    this.party.broadcast(message, [sender.id]);
    this.party.storage.put("head", message);
  }
}

Server satisfies Party.Worker;
