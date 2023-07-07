// when you call database.connect(email)
// it will return a promise that resolves when the user is logged in
// and sends you an email

import { create } from '@web3-storage/w3up-client'
import * as w3clock from '@web3-storage/clock/client'
import { CID } from 'multiformats'

export class Remote {
  client = null
  name = 'unset'
  config = {}

  constructor (database, name, config) {
    this.name = name
    this.config = config
    this.database = database
  }

  async clock (cid) {
    // const did = this.client.currentSpace()
    const agent = this.client.agent()
    const head = await w3clock.head({ issuer: agent, with: agent.did(), proofs: [] })
    console.log('head', head, JSON.stringify(head.root.data.ocm.out))
    const headCids = head.root.data.ocm.out.ok.head
    const blocks = await Promise.all([this.database.blocks.get(CID.parse(cid)),
      ...headCids.map(c => this.database.blocks.get(c))])

    console.log('blocks', blocks)
    const adv = await w3clock.advance({ issuer: agent, with: agent.did(), proofs: [] }, CID.parse(cid)
      , { blocks }
    )
    console.log('adv', adv, JSON.stringify(adv.root.data.ocm.out))
    return { head, adv }
  }

  async connect (email) {
    try {
      const client = await create()
      await client.authorize(email)
      const claims = await client.capability.access.claim()
      console.log('claims', claims)
      const space = await client.createSpace('fp.' + this.name)
      console.log('space', space)
      await client.setCurrentSpace(space.did())
      await client.registerSpace(email)
      this.client = client
      console.log('client', client)
    } catch (err) {
      console.error('registration failed: ', err)
    }
  }
}
