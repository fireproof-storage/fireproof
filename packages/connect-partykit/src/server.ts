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
