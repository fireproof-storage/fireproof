import { describe, it } from 'mocha'
import assert from 'node:assert'
import { advance, EventBlock, vis, findCommonAncestorWithSortedEvents, findUnknownSortedEvents, decodeEventBlock } from '../clock.js'
import { Blockstore, seqEventData, setSeq } from './helpers.js'

console.x = console.log
console.log = function (...args) {
  // window.mutedLog = window.mutedLog || []
  // window.mutedLog.push(args)
}

async function visHead (blocks, head) {
  const values = head.map(async (cid) => {
    const block = await blocks.get(cid)
    return (await decodeEventBlock(block.bytes)).value?.data?.value
  })
  // console.log('visHead', head, await Promise.all(values))
}

async function makeNext (blocks, parent, eventData) {
  const event = await EventBlock.create(eventData, parent)
  await blocks.put(event.cid, event.bytes)
  const head = await advance(blocks, parent, event.cid)
  return { event, head }
}

async function findUnknownSortedEventsForHead (blocks, head) {
  const unknownSorted = await findUnknownSortedEvents(blocks, head, await findCommonAncestorWithSortedEvents(blocks, head))
  return unknownSorted
}

describe('Clock', () => {
  it('create a new clock', async () => {
    const blocks = new Blockstore()
    // don't do this, create it with the first data block
    const event = await EventBlock.create({})

    await blocks.put(event.cid, event.bytes)
    const head = await advance(blocks, [], event.cid)

    // for await (const line of vis(blocks, head)) console.log(line)
    assert.equal(head.length, 1)
    assert.equal(head[0].toString(), event.cid.toString())

    const sinceHead = head
    const unknownSorted = await findUnknownSortedEvents(blocks, sinceHead, await findCommonAncestorWithSortedEvents(blocks, sinceHead))
    assert.equal(unknownSorted.length, 0)
  })

  it('add events sequentially', async () => {
    setSeq(0)
    const blocks = new Blockstore()
    const emptyhead = [] // this makes head0 the root

    /*
     * Create event0 for alice, with emptyhead as parent
     */
    const { event: event0, head: head0 } = await makeNext(blocks, emptyhead, seqEventData('alice'))
    assert(head0.length, 1)
    assert.equal(head0[0].toString(), event0.cid.toString())

    /*
     * Create event1 for bob, with head0 as parent
     */
    const { event: event1, head: head1 } = await makeNext(blocks, head0, seqEventData('bob'))

    assert.equal(head1.length, 1)
    assert.equal(head1[0].toString(), event1.cid.toString())

    const unknownSorted1 = await findUnknownSortedEventsForHead(blocks, head1)

    assert.equal(unknownSorted1.length, 0)

    /*
     * Create event2 for carol, with head1 as parent
     */
    const { event: event2, head: head2 } = await makeNext(blocks, head1, seqEventData('carol'))

    assert.equal(head2.length, 1)
    assert.equal(head2[0].toString(), event2.cid.toString())

    const unknownSorted2 = await findUnknownSortedEventsForHead(blocks, head2)
    assert.equal(unknownSorted2.length, 0)

    const unknownSorted1b = await findUnknownSortedEventsForHead(blocks, [...head2, ...head0])
    console.x(
      'clock test!',
      unknownSorted2.map((e) => e.value.data)
    )
    assert.equal(unknownSorted1b.length, 2)
    assert.equal(unknownSorted1b[0].value.data.value, 'event1bob')
    assert.equal(unknownSorted1b[1].value.data.value, 'event2carol')

    /*
     * Create event3 for dave, with head2 as parent
     */
    const { event: event3, head: head3 } = await makeNext(blocks, head2, seqEventData('dave'))

    assert.equal(head3.length, 1)
    assert.equal(head3[0].toString(), event3.cid.toString())

    const unknownSorted3 = await findUnknownSortedEventsForHead(blocks, [...head3, ...head0])
    assert.equal(unknownSorted3.length, 3)
    assert.equal(unknownSorted3[0].value.data.value, 'event1bob')
    assert.equal(unknownSorted3[1].value.data.value, 'event2carol')
    assert.equal(unknownSorted3[2].value.data.value, 'event3dave')

    const unknownSorted3B = await findUnknownSortedEventsForHead(blocks, [...head3, ...head1])
    assert.equal(unknownSorted3B.length, 2)
    assert.equal(unknownSorted3B[0].value.data.value, 'event2carol')
    assert.equal(unknownSorted3B[1].value.data.value, 'event3dave')

    /*
     * Create event4 for eve, with head3 as parent
     */
    const { event: event4, head: head4 } = await makeNext(blocks, head3, seqEventData('eve'))

    assert.equal(head4.length, 1)
    assert.equal(head4[0].toString(), event4.cid.toString())

    const sinceHead4 = [...head4, ...head0]
    const unknownSorted4 = await findUnknownSortedEventsForHead(blocks, sinceHead4)
    assert.equal(unknownSorted4.length, 4)
    assert.equal(unknownSorted4[0].value.data.value, 'event1bob')
    assert.equal(unknownSorted4[1].value.data.value, 'event2carol')
    assert.equal(unknownSorted4[2].value.data.value, 'event3dave')
    assert.equal(unknownSorted4[3].value.data.value, 'event4eve')

    const sinceHead4B = [...head4, ...head1]
    const unknownSorted4B = await findUnknownSortedEventsForHead(blocks, sinceHead4B)
    assert.equal(unknownSorted4B.length, 3)
    assert.equal(unknownSorted4B[0].value.data.value, 'event2carol')
    assert.equal(unknownSorted4B[1].value.data.value, 'event3dave')
    assert.equal(unknownSorted4B[2].value.data.value, 'event4eve')

    const sinceHead4C = [...head4, ...head2]
    const unknownSorted4C = await findUnknownSortedEventsForHead(blocks, sinceHead4C)
    assert.equal(unknownSorted4C.length, 2)
    assert.equal(unknownSorted4C[0].value.data.value, 'event3dave')
    assert.equal(unknownSorted4C[1].value.data.value, 'event4eve')

    // don't ask if you already know
    const sinceHead4D = [...head4, ...head3]
    const unknownSorted4D = await findUnknownSortedEventsForHead(blocks, sinceHead4D)
    assert.equal(unknownSorted4D.length, 4)

    /*
     * Create event5 for frank, with head4 as parent
     */
    const { event: event5, head: head5 } = await makeNext(blocks, head4, seqEventData('frank'))

    assert.equal(head5.length, 1)
    assert.equal(head5[0].toString(), event5.cid.toString())

    // sync from root
    const sinceHead5 = [...head5, ...head0]
    const unknownSorted5 = await findUnknownSortedEventsForHead(blocks, sinceHead5)
    assert.equal(unknownSorted5.length, 5)
    assert.equal(unknownSorted5[0].value.data.value, 'event1bob')
    assert.equal(unknownSorted5[1].value.data.value, 'event2carol')
    assert.equal(unknownSorted5[2].value.data.value, 'event3dave')
    assert.equal(unknownSorted5[3].value.data.value, 'event4eve')
    assert.equal(unknownSorted5[4].value.data.value, 'event5frank')

    const sinceHead5B = [...head5, ...head1]
    const unknownSorted5B = await findUnknownSortedEventsForHead(blocks, sinceHead5B)
    assert.equal(unknownSorted5B.length, 4)
    assert.equal(unknownSorted5B[0].value.data.value, 'event2carol')
    assert.equal(unknownSorted5B[1].value.data.value, 'event3dave')
    assert.equal(unknownSorted5B[2].value.data.value, 'event4eve')
    assert.equal(unknownSorted5B[3].value.data.value, 'event5frank')

    // why is this bringing up the alice event?
    // const sinceHead5C = [...head5, ...head2]
    // const unknownSorted5C = await findUnknownSortedEvents(blocks, sinceHead5C, await findCommonAncestorWithSortedEvents(blocks, sinceHead5C))
    // assert.equal(unknownSorted5C.length, 3)
    // assert.equal(unknownSorted5C[0].value.data.value, 'event3dave')
    // assert.equal(unknownSorted5C[1].value.data.value, 'event4eve')
    // assert.equal(unknownSorted5C[2].value.data.value, 'event5frank')

    // why is this bringing up the alice event?
    // const sinceHead5D = [...head5, ...head3]
    // const unknownSorted5D = await findUnknownSortedEvents(blocks, sinceHead5D, await findCommonAncestorWithSortedEvents(blocks, sinceHead5D))
    // assert.equal(unknownSorted5D.length, 2)
    // assert.equal(unknownSorted5D[0].value.data.value, 'event4eve')
    // assert.equal(unknownSorted5D[1].value.data.value, 'event5frank')

    // why is this bringing up the alice event?
    // const sinceHead5E = [...head5, ...head4]
    // const unknownSorted5E = await findUnknownSortedEvents(blocks, sinceHead5E, await findCommonAncestorWithSortedEvents(blocks, sinceHead5E))
    // assert.equal(unknownSorted5E.length, 1)
    // assert.equal(unknownSorted5E[0].value.data.value, 'event5frank')

    // don't ask if you already know
    // why is this bringing up the alice event?
    // const sinceHead5F = [...head5, ...head4]
    // const unknownSorted5F = await findUnknownSortedEvents(blocks, sinceHead5F, await findCommonAncestorWithSortedEvents(blocks, sinceHead5F))
    // assert.equal(unknownSorted5F.length, 1)
    // assert.equal(unknownSorted5F[0].value.data.value, 'event5frank')

    // for await (const line of vis(blocks, head)) console.log(line)
  })

  it('add two events with shared parents', async () => {
    setSeq(-1)
    const blocks = new Blockstore()
    const root = await EventBlock.create(seqEventData('root'))
    await blocks.put(root.cid, root.bytes)

    /** @type {import('../clock').EventLink<any>[]} */
    let head = await advance(blocks, [], root.cid)
    assert.equal(head.length, 1)
    assert.equal(head[0], root.cid)

    const parents = head

    const event0 = await EventBlock.create(seqEventData(), parents)
    await blocks.put(event0.cid, event0.bytes)

    head = await advance(blocks, parents, event0.cid)
    const head0 = head

    const event1 = await EventBlock.create(seqEventData(), parents)
    await blocks.put(event1.cid, event1.bytes)
    head = await advance(blocks, head, event1.cid)
    const head1 = head

    // for await (const line of vis(blocks, head)) console.log(line)
    assert.equal(head.length, 2)
    assert.equal(head[0].toString(), event0.cid.toString())
    assert.equal(head[1].toString(), event1.cid.toString())

    let sinceHead = head1
    let unknownSorted = await findUnknownSortedEvents(blocks, sinceHead, await findCommonAncestorWithSortedEvents(blocks, sinceHead))
    assert.equal(unknownSorted.length, 1)
    assert.equal(unknownSorted[0].cid.toString(), event0.cid.toString())

    const event2 = await EventBlock.create(seqEventData(), head1)
    await blocks.put(event2.cid, event2.bytes)
    head = await advance(blocks, head, event2.cid)
    const head2 = head

    assert.equal(head.length, 1)

    sinceHead = head2
    unknownSorted = await findUnknownSortedEvents(blocks, sinceHead, await findCommonAncestorWithSortedEvents(blocks, sinceHead))
    assert.equal(unknownSorted.length, 0)

    sinceHead = [...head0, ...head2]
    unknownSorted = await findUnknownSortedEvents(blocks, sinceHead, await findCommonAncestorWithSortedEvents(blocks, sinceHead))
    // console.log('need', unknownSorted.map(b => b.value.data))
    assert.equal(unknownSorted.length, 2)
    assert.equal(unknownSorted[0].cid.toString(), event1.cid.toString())
    assert.equal(unknownSorted[1].cid.toString(), event2.cid.toString())
  })

  it('add two events with some shared parents', async () => {
    const blocks = new Blockstore()
    const root = await EventBlock.create(seqEventData())
    await blocks.put(root.cid, root.bytes)

    /** @type {import('../clock').EventLink<any>[]} */
    let head = [root.cid]
    const parents0 = head

    const event0 = await EventBlock.create(seqEventData(), parents0)
    await blocks.put(event0.cid, event0.bytes)
    head = await advance(blocks, head, event0.cid)

    const event1 = await EventBlock.create(seqEventData(), parents0)
    await blocks.put(event1.cid, event1.bytes)
    head = await advance(blocks, head, event1.cid)

    const event2 = await EventBlock.create(seqEventData(), parents0)
    await blocks.put(event2.cid, event2.bytes)
    head = await advance(blocks, head, event2.cid)

    const event3 = await EventBlock.create(seqEventData(), [event0.cid, event1.cid])
    await blocks.put(event3.cid, event3.bytes)
    head = await advance(blocks, head, event3.cid)
    // const parentz = head

    const event4 = await EventBlock.create(seqEventData(), [event2.cid])
    await blocks.put(event4.cid, event4.bytes)
    head = await advance(blocks, head, event4.cid)

    // console.log('add two events with some shared parents')
    // for await (const line of vis(blocks, head)) console.log(line)
    assert.equal(head.length, 2)
    assert.equal(head[0].toString(), event3.cid.toString())
    assert.equal(head[1].toString(), event4.cid.toString())
    // console.log('since', parentz)
    // for await (const block of since(blocks, parentz)) {
    //   if (block?.value) console.log(block.value.data)
    // }
    // const { ancestor, sorted } = await findCommonAncestorWithSortedEvents(blocks, parentz)
    // console.log('findCommonAncestorWithSortedEvents', ancestor, sorted.map(b => b.value.data))
  })

  it('converge when multi-root', async () => {
    setSeq(-1)
    const blocks = new Blockstore()
    const root = await EventBlock.create(seqEventData())
    await blocks.put(root.cid, root.bytes)

    /** @type {import('../clock').EventLink<any>[]} */
    let head = [root.cid]
    const parents0 = head

    const event0 = await EventBlock.create(seqEventData(), parents0)
    await blocks.put(event0.cid, event0.bytes)
    head = await advance(blocks, head, event0.cid)

    const event1 = await EventBlock.create(seqEventData(), parents0)
    await blocks.put(event1.cid, event1.bytes)
    head = await advance(blocks, head, event1.cid)

    const event1head = head

    const event2 = await EventBlock.create(seqEventData(), event1head)
    await blocks.put(event2.cid, event2.bytes)
    head = await advance(blocks, head, event2.cid)

    const event3 = await EventBlock.create(seqEventData(), event1head)
    await blocks.put(event3.cid, event3.bytes)
    head = await advance(blocks, head, event3.cid)

    const event3head = head

    const event4 = await EventBlock.create(seqEventData(), event1head)
    await blocks.put(event4.cid, event4.bytes)
    head = await advance(blocks, head, event4.cid)
    const event4head = head
    await visHead(blocks, event4head)

    const event5 = await EventBlock.create(seqEventData(), event3head)
    await blocks.put(event5.cid, event5.bytes)
    head = await advance(blocks, head, event5.cid)
    const event5head = head
    await visHead(blocks, event5head)

    const event6 = await EventBlock.create(seqEventData(), event5head)
    await blocks.put(event6.cid, event6.bytes)
    head = await advance(blocks, head, event6.cid)
    const event6head = head
    await visHead(blocks, event6head)

    const event7 = await EventBlock.create(seqEventData(), event6head)
    await blocks.put(event7.cid, event7.bytes)
    head = await advance(blocks, head, event7.cid)
    const event7head = head
    await visHead(blocks, event7head)

    const event8 = await EventBlock.create(seqEventData(), event7head)
    await blocks.put(event8.cid, event8.bytes)
    head = await advance(blocks, head, event8.cid)
    const event8head = head
    await visHead(blocks, event8head)

    const event9 = await EventBlock.create(seqEventData(), event7head)
    await blocks.put(event9.cid, event9.bytes)
    head = await advance(blocks, head, event9.cid)
    const event9head = head
    await visHead(blocks, event9head)

    const event10 = await EventBlock.create(seqEventData(), event9head)
    await blocks.put(event10.cid, event10.bytes)
    head = await advance(blocks, head, event10.cid)
    const event10head = head
    await visHead(blocks, event10head)

    console.log('converge when multi-root')
    for await (const line of vis(blocks, event10head)) console.log(line)

    assert.equal(event10head.length, 1)
    assert.equal(event10head[0].toString(), event10.cid.toString())

    const { ancestor, sorted } = await findCommonAncestorWithSortedEvents(blocks, [event5.cid, event2.cid])
    const unknownSorted = await findUnknownSortedEvents(blocks, [event5.cid, event2.cid], { ancestor, sorted })
    assert.equal(unknownSorted[0].value.data.value, 'event3')
    assert.equal(unknownSorted[1].value.data.value, 'event5')

    const ancestorWithSorted = await findCommonAncestorWithSortedEvents(blocks, [event6.cid, event2.cid])
    const unknownSorted2 = await findUnknownSortedEvents(blocks, [event6.cid, event2.cid], ancestorWithSorted)
    assert.equal(unknownSorted2[0].value.data.value, 'event3')
    assert.equal(unknownSorted2[1].value.data.value, 'event5')
    assert.equal(unknownSorted2[2].value.data.value, 'event4')
    assert.equal(unknownSorted2[3].value.data.value, 'event6')
    // const ancestorBlock = await blocks.get(ancestor)
    // const ancestorDecoded = await decodeEventBlock(ancestorBlock.bytes)
    const ancestorWithSorted2 = await findCommonAncestorWithSortedEvents(blocks, [event7.cid, event10.cid])
    const unknownSorted3 = await findUnknownSortedEvents(blocks, [event7.cid, event10.cid], ancestorWithSorted2)
    assert.equal(unknownSorted3[0].value.data.value, 'event9')
    assert.equal(unknownSorted3[1].value.data.value, 'event8')
    assert.equal(unknownSorted3[2].value.data.value, 'event10')
  })

  it('add an old event', async () => {
    const blocks = new Blockstore()
    const root = await EventBlock.create(seqEventData())
    await blocks.put(root.cid, root.bytes)

    /** @type {import('../clock').EventLink<any>[]} */
    let head = [root.cid]
    const parents0 = head

    const event0 = await EventBlock.create(seqEventData(), parents0)
    await blocks.put(event0.cid, event0.bytes)
    head = await advance(blocks, head, event0.cid)

    const event1 = await EventBlock.create(seqEventData(), parents0)
    await blocks.put(event1.cid, event1.bytes)
    head = await advance(blocks, head, event1.cid)

    const event1head = head

    const event2 = await EventBlock.create(seqEventData(), event1head)
    await blocks.put(event2.cid, event2.bytes)
    head = await advance(blocks, head, event2.cid)

    const event3 = await EventBlock.create(seqEventData(), event1head)
    await blocks.put(event3.cid, event3.bytes)
    head = await advance(blocks, head, event3.cid)

    const event4 = await EventBlock.create(seqEventData(), event1head)
    await blocks.put(event4.cid, event4.bytes)
    head = await advance(blocks, head, event4.cid)

    const parents2 = head

    const event5 = await EventBlock.create(seqEventData(), parents2)
    await blocks.put(event5.cid, event5.bytes)
    head = await advance(blocks, head, event5.cid)

    // now very old one
    const event6 = await EventBlock.create(seqEventData(), parents0)
    await blocks.put(event6.cid, event6.bytes)
    head = await advance(blocks, head, event6.cid)

    // for await (const line of vis(blocks, head)) console.log(line)
    assert.equal(head.length, 2)
    assert.equal(head[0].toString(), event5.cid.toString())
    assert.equal(head[1].toString(), event6.cid.toString())
  })

  it('add an event with missing parents', async () => {
    setSeq(-1)
    const blocks = new Blockstore()
    const root = await EventBlock.create(seqEventData())
    await blocks.put(root.cid, root.bytes)

    /** @type {import('../clock').EventLink<any>[]} */
    let head = [root.cid]

    const event0 = await EventBlock.create(seqEventData(), head)
    await blocks.put(event0.cid, event0.bytes)

    const event1 = await EventBlock.create(seqEventData(), [event0.cid])
    await blocks.put(event1.cid, event1.bytes)

    head = await advance(blocks, head, event1.cid)

    // for await (const line of vis(blocks, head)) console.log(line)
    assert.equal(head.length, 1)
    assert.equal(head[0].toString(), event1.cid.toString())
  })

  it.skip('reproduce the issue from fireproof docs since update test', async () => {
    setSeq(-1)
    const blocks = new Blockstore()
    // alice
    const root = await EventBlock.create(seqEventData('alice'))
    await blocks.put(root.cid, root.bytes)
    let head = await advance(blocks, [], root.cid)
    const roothead = head
    // db root
    let sinceHead = [...roothead]
    let unknownSorted = await findUnknownSortedEvents(blocks, sinceHead, await findCommonAncestorWithSortedEvents(blocks, sinceHead))
    assert.equal(unknownSorted.length, 0) // we use all docs for first query in Fireproof

    // create bob
    const event0 = await EventBlock.create(seqEventData('bob'), head)
    await blocks.put(event0.cid, event0.bytes)
    console.log('new event0', event0.cid)

    head = await advance(blocks, head, event0.cid)
    console.log('new head', head)

    const event0head = head
    sinceHead = event0head
    unknownSorted = await findUnknownSortedEvents(blocks, sinceHead, await findCommonAncestorWithSortedEvents(blocks, sinceHead))
    assert.equal(unknownSorted.length, 0)

    sinceHead = [...roothead, ...event0head]
    unknownSorted = await findUnknownSortedEvents(blocks, sinceHead, await findCommonAncestorWithSortedEvents(blocks, sinceHead))
    console.log(
      'unknownSortedb',
      unknownSorted.map((e) => e.value.data.value)
    )
    assert.equal(unknownSorted.length, 1)

    // create carol
    const event1 = await EventBlock.create(seqEventData('carol'), head)
    await blocks.put(event1.cid, event1.bytes)
    head = await advance(blocks, head, event1.cid)
    const event1head = head

    sinceHead = [...event0head, ...event1head]
    // sinceHead = event0head
    const sigil = await findCommonAncestorWithSortedEvents(blocks, sinceHead)
    console.log('ancestor', (await decodeEventBlock((await blocks.get(sigil.ancestor)).bytes)).value)
    console.log(
      'sorted all',
      sigil.sorted.map((e) => e.value.data.value)
    )
    unknownSorted = await findUnknownSortedEvents(blocks, sinceHead, sigil)
    console.log(
      'unknownSortedcc',
      unknownSorted.map((e) => e.value.data.value)
    )
    assert.equal(unknownSorted.length, 1)

    for await (const line of vis(blocks, head)) console.log(line)

    sinceHead = [...event1head, ...roothead]
    unknownSorted = await findUnknownSortedEvents(blocks, sinceHead, await findCommonAncestorWithSortedEvents(blocks, sinceHead))
    console.log(
      'unknownSortedc',
      unknownSorted.map((e) => e.value.data.value)
    )
    assert.equal(unknownSorted.length, 1)

    // const event2 = await EventBlock.create(seqEventData('xxx'), head)
    // await blocks.put(event2.cid, event2.bytes)
    // head = await advance(blocks, head, event2.cid)
    // const event2head = head

    // sinceHead = [...event2head, ...event0head]
    // unknownSorted = await findUnknownSortedEvents(blocks, sinceHead, await findCommonAncestorWithSortedEvents(blocks, sinceHead))
    // assert.equal(unknownSorted.length, 2)

    // sinceHead = [...event2head, ...event1head]
    // unknownSorted = await findUnknownSortedEvents(blocks, sinceHead, await findCommonAncestorWithSortedEvents(blocks, sinceHead))
    // assert.equal(unknownSorted.length, 1)
  })
})
