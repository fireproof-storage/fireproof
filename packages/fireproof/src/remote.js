// when you call database.connect(email)
// it will return a promise that resolves when the user is logged in
// and sends you an email

import { create } from '@web3-storage/w3up-client'

export class Remote {
  client = null
  name = 'unset'
  config = {}

  constructor (name, config) {
    this.name = name
    this.config = config
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
