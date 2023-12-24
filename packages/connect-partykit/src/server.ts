import type * as Party from 'partykit/server'

type PartyMessage = {
  data: string
  cid: string
  parents: string[]
}

export default class Server implements Party.Server {
  clockHead: Map<string, string> = new Map()
  constructor(public party: Party.Party) {}

  async onStart() {
    return this.party.storage.get('main').then(head => {
      if (head) {
        this.clockHead = head as Map<string, string>
      }
    })
  }

  async onRequest(request: Party.Request) {
    const CORS = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT,  DELETE',
    }

    const json = <T>(data: T, status = 200) =>
      Response.json(data, { status, headers: CORS })

    const ok = () => json({ ok: true })

    // Check if it's a preflight request (OPTIONS) and handle it
    if (request.method === 'OPTIONS') {
      return ok()
    }

    const url = new URL(request.url);
    const carId = url.searchParams.get('car')

    if (carId) {
      if (request.method === 'PUT') {
        const carArrayBuffer = new Uint8Array(await request.arrayBuffer())
        if (carArrayBuffer) {
          //Maybe add catch later?
          await this.party.storage.put(`car-${carId}`, carArrayBuffer)
          return json(JSON.stringify({ ok: true }), 201)
        }
        return json(JSON.stringify({ ok: false }), 400)
      }
       else if (request.method === 'GET') {
        const carArrayBuffer = (await this.party.storage.get(
          `car-${carId}`
        )) as Uint8Array;
        if (carArrayBuffer) {
          return json(carArrayBuffer);
        }
        return json(JSON.stringify({ ok: false }),404);
      }
      else{
        return json('Method not allowed',405);
      }
    } 
    else {
      return json(JSON.stringify({ error: 'Invalid URL path' }), 400)
    }
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
