import { useEffect, useState } from 'react'
import throttle from 'lodash.throttle'

import {
  Fireproof, Index, Listener
} from '../../../../'

// const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function mulberry32 (a) {
  return function () {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = mulberry32(1) // determinstic fixtures

const loadFixtures = async (database) => {
  const nextId = () => rand().toString(35).slice(2)

  const listTitles = ['Building Apps', 'Having Fun', 'Making Breakfast', 'Pet Stuff', 'Other']
  const todoTitles = [
    ['In the browser', 'On the phone', 'With or without Redux', 'Login components', 'GraphQL queries', 'Automatic replication and versioning'],
    ['Rollerskating meetup', 'Motorcycle ride', 'Write a sci-fi story with ChatGPT'],
    ['Macadamia nut milk', 'Avocado toast', 'Coffee', 'Bacon', 'Sourdough bread', 'Fruit salad', 'Yogurt', 'Muesli', 'Smoothie', 'Oatmeal', 'Cereal', 'Pancakes', 'Waffles', 'French toast', 'Baked beans', 'Hash browns', 'Poached eggs', 'Egg and tomato sandwich'],
    ['Kibble', 'Squeakers', 'Treats', 'Leash', 'Collar', 'Poop bags', 'Dog bed']
  ]
  for (let j = 0; j < 4; j++) {
    const ok = await database.put({ title: listTitles[j], type: 'list', _id: nextId() })
    const lz = await database.get(ok.id)
    console.log('db', database.instanceId, 'got', lz)

    for (let i = 0; i < todoTitles[j].length; i++) {
      const to = await database.put({
        _id: nextId(),
        title: todoTitles[j][i],
        listId: ok.id,
        completed: rand() > 0.75,
        type: 'todo',
        createdAt: '2023-03-02T00:58:06.427Z'
      })
      console.log('db', database.instanceId, ok.id, to.id, listTitles[j], todoTitles[j][i])
      const got = await database.get(to.id)
      console.log('db', database.instanceId, 'got', got)
    }
  }
  const all = await database.todosbyList.query({ range: [['0'], ['x']] })
  console.log('db', database.instanceId, 'all', all.rows.map((row) => row.key))
}

const defineDatabase = () => {
  const database = Fireproof.storage()
  database.allLists = new Index(database, function (doc, map) {
    if (doc.type === 'list') map(doc.type, doc)
  })
  database.todosbyList = new Index(database, function (doc, map) {
    if (doc.type === 'todo' && doc.listId) {
      map([doc.listId, doc.createdAt], doc)
    }
  })
  window.fireproof = database
  return database
}
const database = defineDatabase()
const listener = new Listener(database)
const inboundSubscriberQueue = new Map()

export default function useFireproof () {
  const [ready, setReady] = useState(false)

  const addSubscriber = (label, fn) => {
    inboundSubscriberQueue.set('label', fn)
    console.log('addSubscriber', label, inboundSubscriberQueue.size)
  }

  const listenerCallback = () => {
    console.log('listener fired', inboundSubscriberQueue.size)
    for (const [, fn] of inboundSubscriberQueue) fn()
  }

  useEffect(() => {
    const doSetup = async () => {
      await loadFixtures(database)
      listener.on('*', throttle(listenerCallback, 250))
      setReady(true)
    }
    doSetup()
  }, [])

  const withLogging =
    (fn) =>
      async (...args) => {
        const result = await fn(...args)
        console.log('new root', database.clock.join())
        return result
      }

  const fetchAllLists = async () => {
    const lists = await database.allLists.query({ range: ['list', 'listx'] })
    return lists.rows.map((row) => row.value)
  }

  const fetchListWithTodos = async (_id) => {
    const list = await database.get(_id)
    const todos = await database.todosbyList.query({ range: [[_id, '0'], [_id, '9']] })
    return { list, todos: todos.rows.map((row) => row.value) }
  }

  const addList = async (title) => {
    return await database.put({ title, type: 'list' })
  }

  const addTodo = withLogging(async (listId, title) => {
    return await database.put({ completed: false, title, listId, type: 'todo', createdAt: new Date().toISOString() })
  })

  const toggle = withLogging(async ({ completed, ...doc }) => {
    return await database.put({ completed: !completed, ...doc })
  })

  const destroy = withLogging(async ({ _id }) => {
    return await database.del(_id)
  })

  const updateTitle = withLogging(async (doc, title) => {
    doc.title = title
    return await database.put(doc)
  })

  const clearCompleted = withLogging(async (listId) => {
    const todos = (await database.todosbyList.query({ range: [[listId, '1'], [listId, 'x']] })).rows.map((row) => row.value)
    const todosToDelete = todos.filter((todo) => todo.completed)
    for (const todoToDelete of todosToDelete) {
      await database.del(todoToDelete._id)
    }
  })

  return {
    fetchAllLists,
    fetchListWithTodos,

    addList,
    addTodo,
    // toggleAll,
    // load,
    toggle,
    destroy,
    updateTitle,
    clearCompleted,
    // onAuthChange
    // isLoading
    addSubscriber,
    database,
    ready
  }
}
