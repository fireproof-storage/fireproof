export default class Server {
  room;
  constructor(room) {
    this.room = room;
  }
  onConnect(conn, ctx) {
    // A websocket just connected!
    console.log(`Connected:
  id: ${conn.id}
  room: ${this.room.id}
  url: ${new URL(ctx.request.url).pathname}`);
    // let's send a message to the connection
    conn.send("hello from server");
  }
  onMessage(message, sender) {
    // let's log the message
    console.log(`connection ${sender.id} sent message: ${message}`);
    // as well as broadcast it to all the other connections in the room...
    this.room.broadcast(
      `${sender.id}: ${message}`,
      // ...except for the connection it came from
      [sender.id],
    );
  }
}
Server;
