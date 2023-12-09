import type * as Party from 'partykit/server'

type PartyMessage = {
  data: string
  cid: string
  parents: string[]
}

export default class Server implements Party.Server {
  clockHead: Map<string, string> = new Map()
  constructor(public party: Party.Party) { }

  async onStart() {
    return this.party.storage.get('main').then(head => {
      if (head) {
        this.clockHead = head as Map<string, string>
      }
    })
  }

  async onRequest(request: Party.Request) {
    // Data upload
    const url = new URL(request.url)
    const carId = url.searchParams.get('car')
    if (carId) {
      if (request.method === "PUT") {
        const carArrayBuffer = new Uint8Array(await request.arrayBuffer())
        if (carArrayBuffer) {
          //Maybe add catch later?
          await this.party.storage.put(`car-${carId}`, carArrayBuffer);
          return new Response(JSON.stringify({ ok: true }), {
            status: 201,
          });
        }
        return new Response(JSON.stringify({ ok: false }), { status: 400 });
      }
      else if (request.method === "GET") {
        const carArrayBuffer = await this.party.storage.get(`car-${carId}`)
        if (carArrayBuffer) {
          return new Response(JSON.stringify(carArrayBuffer), {
            status: 200,
            headers: new Headers({
              'Content-Type': 'application/json'
            })
          });
        }

        return new Response(JSON.stringify({ ok: false }), { status: 404 });
      }
    }
    else {
      return new Response(JSON.stringify({ error: 'Invalid path' }), { status: 400 })
    }

    return new Response("Method not allowed", { status: 405 });
  }

  async onConnect(conn: Party.Connection) {
    for (const value of this.clockHead.values()) {
      conn.send(value)
    }
  }

  onMessage(message: string, sender: Party.Connection) {
    const { data, cid, parents } = JSON.parse(message) as PartyMessage

    for (const p of parents) {
      this.clockHead.delete(p)
    }
    this.clockHead.set(cid, data)

    this.party.broadcast(data, [sender.id])
    void this.party.storage.put('main', this.clockHead)
  }
}

Server satisfies Party.Worker
