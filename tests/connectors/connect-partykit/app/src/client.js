import "./styles.css";
import PartySocket from "partysocket";
let pingInterval;
// Let's append all the messages we get into this DOM element
const output = document.getElementById("app");
// Helper function to add a new line to the DOM
function add(text) {
  output.appendChild(document.createTextNode(text));
  output.appendChild(document.createElement("br"));
}
// A PartySocket is like a WebSocket, except it's a bit more magical.
// It handles reconnection logic, buffering messages while it's offline, and more.
const conn = new PartySocket({
  host: PARTYKIT_HOST,
  room: "my-new-room",
});
// You can even start sending messages before the connection is open!
conn.addEventListener("message", (event) => {
  add(`Received -> ${event.data}`);
});
// Let's listen for when the connection opens
// And send a ping every 2 seconds right after
conn.addEventListener("open", () => {
  add("Connected!");
  add("Sending a ping every 2 seconds...");
  // TODO: make this more interesting / nice
  clearInterval(pingInterval);
  pingInterval = setInterval(() => {
    conn.send("ping");
  }, 1000);
});
