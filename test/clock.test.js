import { describe, it } from 'mocha'
import assert from 'node:assert'
import { advance, EventBlock, vis, findCommonAncestorWithSortedEvents, findUnknownSortedEvents, decodeEventBlock } from '../clock.js'
import { Blockstore, seqEventData, setSeq } from './helpers.js'

async function visHead (blocks, head) {
  const values = head.map(async (cid) => {
    const block = await blocks.get(cid)
    return (await decodeEventBlock(block.bytes)).value?.data?.value
  })
  // console.log('visHead', head, await Promise.all(values))
}

describe('Clock', () => {
  it('create a new clock', async () => {
    const blocks = new Blockstore()
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

  it('add an event', async () => {
    const blocks = new Blockstore()
    const root = await EventBlock.create(seqEventData())
    await blocks.put(root.cid, root.bytes)

    /** @type {import('../clock').EventLink<any>[]} */
    let head = [root.cid]

    const event = await EventBlock.create(seqEventData(), head)
    await blocks.put(event.cid, event.bytes)

    head = await advance(blocks, head, event.cid)

    // for await (const line of vis(blocks, head)) console.log(line)
    assert.equal(head.length, 1)
    assert.equal(head[0].toString(), event.cid.toString())

    const sinceHead = head
    const unknownSorted = await findUnknownSortedEvents(blocks, sinceHead, await findCommonAncestorWithSortedEvents(blocks, sinceHead))
    assert.equal(unknownSorted.length, 0)
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

  it('reproduce the issue from fireproof docs since update test', async () => {
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
    console.log('unknownSortedb', unknownSorted.map(e => e.value.data.value))
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
    console.log('sorted all', sigil.sorted.map(e => e.value.data.value))
    unknownSorted = await findUnknownSortedEvents(blocks, sinceHead, sigil)
    console.log('unknownSortedcc', unknownSorted.map(e => e.value.data.value))
    assert.equal(unknownSorted.length, 1)

    for await (const line of vis(blocks, head)) console.log(line)

    sinceHead = [...event1head, ...roothead]
    unknownSorted = await findUnknownSortedEvents(blocks, sinceHead, await findCommonAncestorWithSortedEvents(blocks, sinceHead))
    console.log('unknownSortedc', unknownSorted.map(e => e.value.data.value))
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
