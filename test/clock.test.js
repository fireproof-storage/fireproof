import { describe, it } from 'mocha'
import assert from 'node:assert'
import { advance, EventBlock, findCommonAncestorWithSortedEvents, findUnknownSortedEvents, decodeEventBlock, findEventsToSync } from '../src/clock.js'
// import { vis } from '../src/clock.js'
import { Blockstore, seqEventData, setSeq } from './helpers.js'

async function visHead (blocks, head) {
  // const values =
  head.map(async (cid) => {
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
    const toSync = await findUnknownSortedEvents(blocks, sinceHead, await findCommonAncestorWithSortedEvents(blocks, sinceHead))
    assert.equal(toSync.length, 0)
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

    const toSync1 = await findEventsToSync(blocks, head1)

    assert.equal(toSync1.length, 0)

    /*
     * Create event2 for carol, with head1 as parent
     */
    const { event: event2, head: head2 } = await makeNext(blocks, head1, seqEventData('carol'))

    assert.equal(head2.length, 1)
    assert.equal(head2[0].toString(), event2.cid.toString())

    const toSync2 = await findEventsToSync(blocks, head2)
    assert.equal(toSync2.length, 0)

    const toSync1b = await findEventsToSync(blocks, [...head2, ...head0])

    assert.equal(toSync1b.length, 2)
    assert.equal(toSync1b[0].value.data.value, 'event1bob')
    assert.equal(toSync1b[1].value.data.value, 'event2carol')

    /*
     * Create event3 for dave, with head2 as parent
     */

    const { event: event3, head: head3 } = await makeNext(blocks, head2, seqEventData('dave'))

    assert.equal(head3.length, 1)
    assert.equal(head3[0].toString(), event3.cid.toString())

    const toSync3 = await findEventsToSync(blocks, [...head3, ...head0])
    assert.equal(toSync3.length, 3)
    assert.equal(toSync3[0].value.data.value, 'event1bob')
    assert.equal(toSync3[1].value.data.value, 'event2carol')
    assert.equal(toSync3[2].value.data.value, 'event3dave')

    const toSync3B = await findEventsToSync(blocks, [...head3, ...head1])
    assert.equal(toSync3B.length, 2)
    assert.equal(toSync3B[0].value.data.value, 'event2carol')
    assert.equal(toSync3B[1].value.data.value, 'event3dave')

    /*
     * Create event4 for eve, with head3 as parent
     */
    const { event: event4, head: head4 } = await makeNext(blocks, head3, seqEventData('eve'))

    assert.equal(head4.length, 1)
    assert.equal(head4[0].toString(), event4.cid.toString())

    const toSync4 = await findEventsToSync(blocks, [...head4, ...head0])
    assert.equal(toSync4.length, 4)
    assert.equal(toSync4[0].value.data.value, 'event1bob')
    assert.equal(toSync4[1].value.data.value, 'event2carol')
    assert.equal(toSync4[2].value.data.value, 'event3dave')
    assert.equal(toSync4[3].value.data.value, 'event4eve')

    const toSync4B = await findEventsToSync(blocks, [...head4, ...head1])

    assert.equal(toSync4B.length, 3)
    assert.equal(toSync4B[0].value.data.value, 'event2carol')
    assert.equal(toSync4B[1].value.data.value, 'event3dave')
    assert.equal(toSync4B[2].value.data.value, 'event4eve')

    const toSync4C = await findEventsToSync(blocks, [...head4, ...head2])

    assert.equal(toSync4C.length, 2)
    assert.equal(toSync4C[0].value.data.value, 'event3dave')
    assert.equal(toSync4C[1].value.data.value, 'event4eve')

    // don't ask if you already know
    // const toSync4D = await findEventsToSync(blocks, [...head4, ...head3])
    // assert.equal(toSync4D.length, 0)

    /*
     * Create event5 for frank, with head4 as parent
     */
    const { event: event5, head: head5 } = await makeNext(blocks, head4, seqEventData('frank'))

    assert.equal(head5.length, 1)
    assert.equal(head5[0].toString(), event5.cid.toString())
    const toSync5 = await findEventsToSync(blocks, [...head5, ...head0])
    assert.equal(toSync5.length, 5)
    assert.equal(toSync5[0].value.data.value, 'event1bob')
    assert.equal(toSync5[1].value.data.value, 'event2carol')
    assert.equal(toSync5[2].value.data.value, 'event3dave')
    assert.equal(toSync5[3].value.data.value, 'event4eve')
    assert.equal(toSync5[4].value.data.value, 'event5frank')

    const toSync5B = await findEventsToSync(blocks, [...head5, ...head1])

    assert.equal(toSync5B.length, 4)
    assert.equal(toSync5B[0].value.data.value, 'event2carol')
    assert.equal(toSync5B[1].value.data.value, 'event3dave')
    assert.equal(toSync5B[2].value.data.value, 'event4eve')
    assert.equal(toSync5B[3].value.data.value, 'event5frank')

    const toSync5C = await findEventsToSync(blocks, [...head5, ...head2])
    assert(toSync5C.length > 0, 'should have 3 events, has ' + toSync5C.length)
    assert.equal(toSync5C[0].value.data.value, 'event3dave')
    assert.equal(toSync5C[1].value.data.value, 'event4eve')
    assert.equal(toSync5C[2].value.data.value, 'event5frank')

    const toSync5D = await findEventsToSync(blocks, [...head5, ...head3])
    assert.equal(toSync5D.length, 2) // 4
    assert.equal(toSync5D[0].value.data.value, 'event4eve')
    assert.equal(toSync5D[1].value.data.value, 'event5frank')

    const toSync5E = await findEventsToSync(blocks, [...head5, ...head4])
    assert.equal(toSync5E.length, 1) // 5
    assert.equal(toSync5E[0].value.data.value, 'event5frank')

    /*
     * Create event6 for grace, with head5 as parent
     */
    const { event: event6, head: head6 } = await makeNext(blocks, head5, seqEventData('grace'))

    assert.equal(head6.length, 1)
    assert.equal(head6[0].toString(), event6.cid.toString())

    const toSync6 = await findEventsToSync(blocks, [...head6, ...head0])
    assert.equal(toSync6.length, 6) // 1
    assert.equal(toSync6[0].value.data.value, 'event1bob')
    assert.equal(toSync6[1].value.data.value, 'event2carol')
    assert.equal(toSync6[2].value.data.value, 'event3dave')
    assert.equal(toSync6[3].value.data.value, 'event4eve')
    assert.equal(toSync6[4].value.data.value, 'event5frank')
    assert.equal(toSync6[5].value.data.value, 'event6grace')

    const toSync6B = await findEventsToSync(blocks, [...head6, ...head1])
    assert.equal(toSync6B.length, 5) // 2
    assert.equal(toSync6B[0].value.data.value, 'event2carol')
    assert.equal(toSync6B[1].value.data.value, 'event3dave')
    assert.equal(toSync6B[2].value.data.value, 'event4eve')
    assert.equal(toSync6B[3].value.data.value, 'event5frank')
    assert.equal(toSync6B[4].value.data.value, 'event6grace')

    const toSync6C = await findEventsToSync(blocks, [...head6, ...head2])
    assert.equal(toSync6C.length, 4) // 3
    assert.equal(toSync6C[0].value.data.value, 'event3dave')
    assert.equal(toSync6C[1].value.data.value, 'event4eve')
    assert.equal(toSync6C[2].value.data.value, 'event5frank')
    assert.equal(toSync6C[3].value.data.value, 'event6grace')

    const toSync6D = await findEventsToSync(blocks, [...head6, ...head3])
    assert.equal(toSync6D.length, 3) // 4
    assert.equal(toSync6D[0].value.data.value, 'event4eve')
    assert.equal(toSync6D[1].value.data.value, 'event5frank')
    assert.equal(toSync6D[2].value.data.value, 'event6grace')

    const toSync6E = await findEventsToSync(blocks, [...head6, ...head4])
    assert.equal(toSync6E.length, 2) // 5
    assert.equal(toSync6E[0].value.data.value, 'event5frank')
    assert.equal(toSync6E[1].value.data.value, 'event6grace')

    const toSync6F = await findEventsToSync(blocks, [...head6, ...head5])
    assert.equal(toSync6F.length, 1)
    assert.equal(toSync6F[0].value.data.value, 'event6grace')

    /*
     * Create event7 for grace, with head6 as parent
     */
    const { event: event7, head: head7 } = await makeNext(blocks, head6, seqEventData('holly'))

    assert.equal(head7.length, 1)
    assert.equal(head7[0].toString(), event7.cid.toString())

    const toSync7 = await findEventsToSync(blocks, [...head7, ...head0])
    assert.equal(toSync7.length, 7)
    assert.equal(toSync7[0].value.data.value, 'event1bob')
    assert.equal(toSync7[1].value.data.value, 'event2carol')
    assert.equal(toSync7[2].value.data.value, 'event3dave')
    assert.equal(toSync7[3].value.data.value, 'event4eve')
    assert.equal(toSync7[4].value.data.value, 'event5frank')
    assert.equal(toSync7[5].value.data.value, 'event6grace')
    assert.equal(toSync7[6].value.data.value, 'event7holly')

    const toSync7B = await findEventsToSync(blocks, [...head7, ...head1])
    assert.equal(toSync7B.length, 6)
    assert.equal(toSync7B[0].value.data.value, 'event2carol')
    assert.equal(toSync7B[1].value.data.value, 'event3dave')
    assert.equal(toSync7B[2].value.data.value, 'event4eve')
    assert.equal(toSync7B[3].value.data.value, 'event5frank')
    assert.equal(toSync7B[4].value.data.value, 'event6grace')

    const toSync7C = await findEventsToSync(blocks, [...head7, ...head2])
    assert.equal(toSync7C.length, 5)
    assert.equal(toSync7C[0].value.data.value, 'event3dave')
    assert.equal(toSync7C[1].value.data.value, 'event4eve')
    assert.equal(toSync7C[2].value.data.value, 'event5frank')
    assert.equal(toSync7C[3].value.data.value, 'event6grace')
    assert.equal(toSync7C[4].value.data.value, 'event7holly')

    const toSync7D = await findEventsToSync(blocks, [...head7, ...head3])
    assert.equal(toSync7D.length, 4)
    assert.equal(toSync7D[0].value.data.value, 'event4eve')
    assert.equal(toSync7D[1].value.data.value, 'event5frank')
    assert.equal(toSync7D[2].value.data.value, 'event6grace')
    assert.equal(toSync7D[3].value.data.value, 'event7holly')

    const toSync7E = await findEventsToSync(blocks, [...head7, ...head4])
    assert.equal(toSync7E.length, 3)
    assert.equal(toSync7E[0].value.data.value, 'event5frank')
    assert.equal(toSync7E[1].value.data.value, 'event6grace')
    assert.equal(toSync7E[2].value.data.value, 'event7holly')

    const toSync7F = await findEventsToSync(blocks, [...head7, ...head5])
    assert.equal(toSync7F.length, 2)
    assert.equal(toSync7F[0].value.data.value, 'event6grace')
    assert.equal(toSync7F[1].value.data.value, 'event7holly')

    /*
     * Create event8 for isaac, with head7 as parent
     */
    const { event: event8, head: head8 } = await makeNext(blocks, head7, seqEventData('isaac'))

    assert.equal(head8.length, 1)
    assert.equal(head8[0].toString(), event8.cid.toString())

    const toSync8 = await findEventsToSync(blocks, [...head8, ...head0])
    assert.equal(toSync8.length, 8)
    assert.equal(toSync8[0].value.data.value, 'event1bob')
    assert.equal(toSync8[1].value.data.value, 'event2carol')
    assert.equal(toSync8[2].value.data.value, 'event3dave')
    assert.equal(toSync8[3].value.data.value, 'event4eve')
    assert.equal(toSync8[4].value.data.value, 'event5frank')
    assert.equal(toSync8[5].value.data.value, 'event6grace')
    assert.equal(toSync8[6].value.data.value, 'event7holly')
    assert.equal(toSync8[7].value.data.value, 'event8isaac')

    const toSync8B = await findEventsToSync(blocks, [...head8, ...head1])
    assert.equal(toSync8B.length, 7)
    assert.equal(toSync8B[0].value.data.value, 'event2carol')
    assert.equal(toSync8B[1].value.data.value, 'event3dave')
    assert.equal(toSync8B[2].value.data.value, 'event4eve')
    assert.equal(toSync8B[3].value.data.value, 'event5frank')
    assert.equal(toSync8B[4].value.data.value, 'event6grace')
    assert.equal(toSync8B[5].value.data.value, 'event7holly')
    assert.equal(toSync8B[6].value.data.value, 'event8isaac')

    const toSync8C = await findEventsToSync(blocks, [...head8, ...head2])
    assert.equal(toSync8C.length, 6) // 3
    assert.equal(toSync8C[0].value.data.value, 'event3dave')
    assert.equal(toSync8C[1].value.data.value, 'event4eve')
    assert.equal(toSync8C[2].value.data.value, 'event5frank')
    assert.equal(toSync8C[3].value.data.value, 'event6grace')
    assert.equal(toSync8C[4].value.data.value, 'event7holly')
    assert.equal(toSync8C[5].value.data.value, 'event8isaac')

    const toSync8D = await findEventsToSync(blocks, [...head8, ...head3])
    assert.equal(toSync8D.length, 5) // 4
    assert.equal(toSync8D[0].value.data.value, 'event4eve')
    assert.equal(toSync8D[1].value.data.value, 'event5frank')
    assert.equal(toSync8D[2].value.data.value, 'event6grace')
    assert.equal(toSync8D[3].value.data.value, 'event7holly')
    assert.equal(toSync8D[4].value.data.value, 'event8isaac')

    const toSync8E = await findEventsToSync(blocks, [...head8, ...head4])
    assert.equal(toSync8E.length, 4) // 5
    assert.equal(toSync8E[0].value.data.value, 'event5frank')
    assert.equal(toSync8E[1].value.data.value, 'event6grace')
    assert.equal(toSync8E[2].value.data.value, 'event7holly')
    assert.equal(toSync8E[3].value.data.value, 'event8isaac')

    const toSync8F = await findEventsToSync(blocks, [...head8, ...head5])
    assert.equal(toSync8F.length, 3) // 6
    assert.equal(toSync8F[0].value.data.value, 'event6grace')
    assert.equal(toSync8F[1].value.data.value, 'event7holly')
    assert.equal(toSync8F[2].value.data.value, 'event8isaac')

    /*
     * Create event9 for jen, with head8 as parent
     */
    const { event: event9, head: head9 } = await makeNext(blocks, head8, seqEventData('jen'))

    assert.equal(head9.length, 1)
    assert.equal(head9[0].toString(), event9.cid.toString())

    const toSync9 = await findEventsToSync(blocks, [...head9, ...head0])
    assert.equal(toSync9.length, 9)
    assert.equal(toSync9[0].value.data.value, 'event1bob')
    assert.equal(toSync9[1].value.data.value, 'event2carol')
    assert.equal(toSync9[2].value.data.value, 'event3dave')
    assert.equal(toSync9[3].value.data.value, 'event4eve')
    assert.equal(toSync9[4].value.data.value, 'event5frank')
    assert.equal(toSync9[5].value.data.value, 'event6grace')
    assert.equal(toSync9[6].value.data.value, 'event7holly')
    assert.equal(toSync9[7].value.data.value, 'event8isaac')
    assert.equal(toSync9[8].value.data.value, 'event9jen')

    const toSync9B = await findEventsToSync(blocks, [...head9, ...head1])
    assert.equal(toSync9B.length, 8)
    assert.equal(toSync9B[0].value.data.value, 'event2carol')
    assert.equal(toSync9B[1].value.data.value, 'event3dave')
    assert.equal(toSync9B[2].value.data.value, 'event4eve')
    assert.equal(toSync9B[3].value.data.value, 'event5frank')
    assert.equal(toSync9B[4].value.data.value, 'event6grace')
    assert.equal(toSync9B[5].value.data.value, 'event7holly')
    assert.equal(toSync9B[6].value.data.value, 'event8isaac')
    assert.equal(toSync9B[7].value.data.value, 'event9jen')

    const toSync9C = await findEventsToSync(blocks, [...head9, ...head2])
    assert.equal(toSync9C.length, 7)
    assert.equal(toSync9C[0].value.data.value, 'event3dave')
    assert.equal(toSync9C[1].value.data.value, 'event4eve')
    assert.equal(toSync9C[2].value.data.value, 'event5frank')
    assert.equal(toSync9C[3].value.data.value, 'event6grace')
    assert.equal(toSync9C[4].value.data.value, 'event7holly')
    assert.equal(toSync9C[5].value.data.value, 'event8isaac')
    assert.equal(toSync9C[6].value.data.value, 'event9jen')

    const toSync9D = await findEventsToSync(blocks, [...head9, ...head3])
    assert.equal(toSync9D.length, 6)
    assert.equal(toSync9D[0].value.data.value, 'event4eve')
    assert.equal(toSync9D[1].value.data.value, 'event5frank')
    assert.equal(toSync9D[2].value.data.value, 'event6grace')
    assert.equal(toSync9D[3].value.data.value, 'event7holly')
    assert.equal(toSync9D[4].value.data.value, 'event8isaac')
    assert.equal(toSync9D[5].value.data.value, 'event9jen')

    const toSync9E = await findEventsToSync(blocks, [...head9, ...head4])
    assert.equal(toSync9E.length, 5)
    assert.equal(toSync9E[0].value.data.value, 'event5frank')
    assert.equal(toSync9E[1].value.data.value, 'event6grace')
    assert.equal(toSync9E[2].value.data.value, 'event7holly')
    assert.equal(toSync9E[3].value.data.value, 'event8isaac')
    assert.equal(toSync9E[4].value.data.value, 'event9jen')

    // for await (const line of vis(blocks, head8)) console.log(line)
  })

  it('add two events with shared parents', async () => {
    setSeq(-1)
    const blocks = new Blockstore()
    const root = await EventBlock.create(seqEventData('root'))
    await blocks.put(root.cid, root.bytes)

    /** @type {import('../src/clock').EventLink<any>[]} */
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
    let toSync = await findUnknownSortedEvents(blocks, sinceHead, await findCommonAncestorWithSortedEvents(blocks, sinceHead))
    // assert.equal(toSync.length, 1) // 0
    // assert.equal(toSync[0].cid.toString(), event0.cid.toString())

    const event2 = await EventBlock.create(seqEventData(), head1)
    await blocks.put(event2.cid, event2.bytes)
    head = await advance(blocks, head, event2.cid)
    const head2 = head

    assert.equal(head.length, 1)

    sinceHead = head2
    toSync = await findUnknownSortedEvents(blocks, sinceHead, await findCommonAncestorWithSortedEvents(blocks, sinceHead))
    assert.equal(toSync.length, 0)

    // todo do these since heads make sense?
    sinceHead = [...head0, ...head2]
    toSync = await findUnknownSortedEvents(blocks, sinceHead, await findCommonAncestorWithSortedEvents(blocks, sinceHead))
    // console.log('need', toSync.map(b => b.value.data))
    // assert.equal(toSync.length, 2) // 0
    // assert.equal(toSync[0].cid.toString(), event1.cid.toString())
    // assert.equal(toSync[1].cid.toString(), event2.cid.toString())
  })

  it('add two events with some shared parents', async () => {
    const blocks = new Blockstore()
    const root = await EventBlock.create(seqEventData())
    await blocks.put(root.cid, root.bytes)

    /** @type {import('../src/clock').EventLink<any>[]} */
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

    /** @type {import('../src/clock').EventLink<any>[]} */
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

    // console.log('converge when multi-root')
    // for await (const line of vis(blocks, event10head)) console.log(line)

    assert.equal(event10head.length, 1)
    assert.equal(event10head[0].toString(), event10.cid.toString())

    // todo do these roots make sense?
    // const { ancestor, sorted } = await findCommonAncestorWithSortedEvents(blocks, [event5.cid, event2.cid])
    // const toSync = await findUnknownSortedEvents(blocks, [event5.cid, event2.cid], { ancestor, sorted })
    // assert.equal(toSync.length, 0)
    // assert.equal(toSync[0].value.data.value, 'event3')
    // assert.equal(toSync[1].value.data.value, 'event5')

    // todo do these roots make sense?
    // const ancestorWithSorted = await findCommonAncestorWithSortedEvents(blocks, [event6.cid, event2.cid])
    // const toSync2 = await findUnknownSortedEvents(blocks, [event6.cid, event2.cid], ancestorWithSorted)
    // assert.equal(toSync2.length, 0)

    // assert.equal(toSync2[0].value.data.value, 'event3')
    // assert.equal(toSync2[1].value.data.value, 'event5')
    // assert.equal(toSync2[2].value.data.value, 'event4')
    // assert.equal(toSync2[3].value.data.value, 'event6')
    // const ancestorBlock = await blocks.get(ancestor)
    // const ancestorDecoded = await decodeEventBlock(ancestorBlock.bytes)
    const ancestorWithSorted2 = await findCommonAncestorWithSortedEvents(blocks, [event7.cid, event10.cid])
    const toSync3 = await findUnknownSortedEvents(blocks, [event7.cid, event10.cid], ancestorWithSorted2)
    assert.equal(toSync3[0].value.data.value, 'event9')
    assert.equal(toSync3[1].value.data.value, 'event8')
    assert.equal(toSync3[2].value.data.value, 'event10')
  })

  it('add an old event', async () => {
    const blocks = new Blockstore()
    const root = await EventBlock.create(seqEventData())
    await blocks.put(root.cid, root.bytes)

    /** @type {import('../src/clock').EventLink<any>[]} */
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

    /** @type {import('../src/clock').EventLink<any>[]} */
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
    let toSync = await findUnknownSortedEvents(blocks, sinceHead, await findCommonAncestorWithSortedEvents(blocks, sinceHead))
    assert.equal(toSync.length, 0) // we use all docs for first query in Fireproof

    // create bob
    const event0 = await EventBlock.create(seqEventData('bob'), head)
    await blocks.put(event0.cid, event0.bytes)
    // console.log('new event0', event0.cid)

    head = await advance(blocks, head, event0.cid)

    const event0head = head
    sinceHead = event0head
    toSync = await findUnknownSortedEvents(blocks, sinceHead, await findCommonAncestorWithSortedEvents(blocks, sinceHead))
    assert.equal(toSync.length, 0)

    sinceHead = [...roothead, ...event0head]
    toSync = await findUnknownSortedEvents(blocks, sinceHead, await findCommonAncestorWithSortedEvents(blocks, sinceHead))
    assert.equal(toSync.length, 1)

    // create carol
    const event1 = await EventBlock.create(seqEventData('carol'), head)
    await blocks.put(event1.cid, event1.bytes)
    head = await advance(blocks, head, event1.cid)
    const event1head = head

    sinceHead = [...event0head, ...event1head]
    // sinceHead = event0head
    const sigil = await findCommonAncestorWithSortedEvents(blocks, sinceHead)
    // console.log('ancestor', (await decodeEventBlock((await blocks.get(sigil.ancestor)).bytes)).value)

    toSync = await findUnknownSortedEvents(blocks, sinceHead, sigil)

    assert.equal(toSync.length, 1)

    // for await (const line of vis(blocks, head)) console.log(line)

    sinceHead = [...event1head, ...roothead]
    toSync = await findUnknownSortedEvents(blocks, sinceHead, await findCommonAncestorWithSortedEvents(blocks, sinceHead))

    assert.equal(toSync.length, 2)

    const event2 = await EventBlock.create(seqEventData('xxx'), head)
    await blocks.put(event2.cid, event2.bytes)
    head = await advance(blocks, head, event2.cid)
    const event2head = head

    sinceHead = [...event2head, ...event0head]
    toSync = await findUnknownSortedEvents(blocks, sinceHead, await findCommonAncestorWithSortedEvents(blocks, sinceHead))
    assert.equal(toSync.length, 2)

    sinceHead = [...event2head, ...event1head]
    toSync = await findUnknownSortedEvents(blocks, sinceHead, await findCommonAncestorWithSortedEvents(blocks, sinceHead))
    assert.equal(toSync.length, 1)
  })
})
