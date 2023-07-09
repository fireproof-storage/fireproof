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

  async sync (cid) {
    // fetch the remote clock headCids using w3clock.head
    const agent = this.client.agent()
    const head = await w3clock.head({ issuer: agent, with: agent.did(), proofs: [] })
    console.log('head', head, JSON.stringify(head.root.data.ocm.out))
    const headCids = head.root.data.ocm.out.ok.head

    // if it is the same as the local (current metadata carcid? `newValetCidCar` / sync clock), do nothing, we are in sync
    // if it is the same as our previously pushed clock event, but our local clock is ahead of it, we need to push our clock
    //               - we can store the previous clock event cid in the metadata
    // - sending our updates:
    //   - get the _last_sync and _last_compact values from our metadata
    //   - if last sync is after last compact
    //   - else
    //     - upload the car file for the last compact
    //     - make a merge car file for any uncompacted car files since the last compact, it should base its cidMap on the compact car file (as we go the sync stream will need to track it's own cidMap)
    //        - if there is only one car file, it is the merge car file (already based on last compact)
    //     - upload the merge car file
    //     -  create a new clock block with the current w3clock.head as parent and the merge car file cid as the data
    //     - update the remote clock with the new clock block (it doesn't need to fetch the car file, and we dont need to store the clock blocks locally, just the most recent one)
    //
    // else if the remote head is not contained by our clock, it is is ahead of the local sync clock.
    // -  get the car file it points to from its data field
    // - merge to the local clock (park that car so we have both carcid indexes)
    // - calculate a new root from the merged head, and update the local clock
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
