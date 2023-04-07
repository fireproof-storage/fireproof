/**
 * A Fireproof database Listener allows you to react to events in the database.
 *
 * @class Listener
 * @classdesc An listener attaches to a Fireproof database and runs a routing function on each change, sending the results to subscribers.
 *
 * @param {Fireproof} database - The Fireproof database instance to index.
 * @param {Function} routingFn - The routing function to apply to each entry in the database.
 */
// import { ChangeEvent } from './db-index'

export default class Listener {
  #subcribers = new Map()
  #doStopListening = null

  constructor (database, routingFn) {
    /** routingFn
     * The database instance to index.
     * @type {Fireproof}
     */
    this.database = database
    this.#doStopListening = database.registerListener(changes => this.#onChanges(changes))
    /**
     * The map function to apply to each entry in the database.
     * @type {Function}
     */
    this.routingFn =
      routingFn ||
      function (_, emit) {
        emit('*')
      }
    this.dbHead = null
  }

  /**
   * Subscribe to a topic emitted by the event function.
   * @param {string} topic - The topic to subscribe to.
   * @param {Function} subscriber - The function to call when the topic is emitted.
   * @returns {Function} A function to unsubscribe from the topic.
   * @memberof Listener
   * @instance
   */
  on (topic, subscriber, since) {
    const listOfTopicSubscribers = getTopicList(this.#subcribers, topic)
    listOfTopicSubscribers.push(subscriber)
    if (typeof since !== 'undefined') {
      this.database.changesSince(since).then(({ rows: changes }) => {
        const keys = topicsForChanges(changes, this.routingFn).get(topic)
        if (keys) keys.forEach(key => subscriber(key))
      })
    }
    return () => {
      const index = listOfTopicSubscribers.indexOf(subscriber)
      if (index > -1) listOfTopicSubscribers.splice(index, 1)
    }
  }

  #onChanges (changes) {
    if (Array.isArray(changes)) {
      const seenTopics = topicsForChanges(changes, this.routingFn)
      for (const [topic, keys] of seenTopics) {
        const listOfTopicSubscribers = getTopicList(this.#subcribers, topic)
        listOfTopicSubscribers.forEach(subscriber => keys.forEach(key => subscriber(key)))
      }
    } else {
      // non-arrays go to all subscribers
      for (const [, listOfTopicSubscribers] of this.#subcribers) {
        listOfTopicSubscribers.forEach(subscriber => subscriber(changes))
      }
    }
  }
}

function getTopicList (subscribersMap, name) {
  let topicList = subscribersMap.get(name)
  if (!topicList) {
    topicList = []
    subscribersMap.set(name, topicList)
  }
  return topicList
}

// copied from src/db-index.js
const makeDoc = ({ key, value }) => ({ _id: key, ...value })

/**
 * Transforms a set of changes to events using an emitter function.
 *
 * @param {ChangeEvent[]} changes
 * @param {Function} routingFn
 * @returns {Array<string>} The topics emmitted by the event function.
 * @private
 */
const topicsForChanges = (changes, routingFn) => {
  const seenTopics = new Map()
  changes.forEach(({ key, value, del }) => {
    if (del || !value) value = { _deleted: true }
    routingFn(makeDoc({ key, value }), t => {
      const topicList = getTopicList(seenTopics, t)
      topicList.push(key)
    })
  })
  return seenTopics
}
