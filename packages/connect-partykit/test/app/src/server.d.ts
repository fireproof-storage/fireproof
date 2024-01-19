import type * as Party from "partykit/server";
export default class Server implements Party.Server {
    readonly room: Party.Room;
    constructor(room: Party.Room);
    onConnect(conn: Party.Connection, ctx: Party.ConnectionContext): void;
    onMessage(message: string, sender: Party.Connection): void;
}
