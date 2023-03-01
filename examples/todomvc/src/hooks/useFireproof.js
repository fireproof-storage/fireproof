import { useEffect, useState } from 'react'
// import { useProduceState } from '../hooks'

import { Fireproof, Index } from '../../../../'

// const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function mulberry32 (a) {
  return function () {
    let t = a += 0x6D2B79F5
    t = Math.imul(t ^ t >>> 15, t | 1)
    t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

const rand = mulberry32(42) // determinstic fixtures

const loadFixtures = async (database) => {
  const nextId = () => rand().toString(35).slice(2)

  const listTitles = ['Building Apps', 'Having Fun', 'Making Breakfast']
  const todoTitles = [['In the browser', 'On the phone', 'With or without Redux', 'Login components', 'GraphQL queries', 'Automatic replication and versioning'],
    ['Rollerskating meetup', 'Motorcycle ride', 'Write a sci-fi story with ChatGPT'],
    ['Macadamia nut milk', 'Avocado toast', 'Coffee', 'Bacon', 'Sourdough bread', 'Fruit salad', 'Yogurt', 'Muesli', 'Smoothie', 'Oatmeal', 'Cereal',
      'Pancakes', 'Waffles', 'French toast', 'Baked beans', 'Hash browns', 'Poached eggs', 'Egg and tomato sandwich']]
  for (let j = 0; j < 3; j++) {
    const ok = await database.put({ title: listTitles[j], type: 'list', _id: nextId() })
    for (let i = 0; i < todoTitles[j].length; i++) {
      console.log('db', database.instanceId, ok.id, listTitles[j], todoTitles[j][i])
      await database.put({
        _id: nextId(),
        title: todoTitles[j][i],
        listId: ok.id,
        completed: rand() > 0.75,
        type: 'todo',
        createdAt: new Date().toISOString()
      })
    }
  }
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

export default function useFireproof (options) {
  const [ready, setReady] = useState(false)
  const refresh = options.refresh || (() => {})

  useEffect(() => {
    const doSetup = async () => {
      await loadFixtures(database)
      setReady(true)
    }
    doSetup()
  }, [])

  const withRefresh = (fn) => async (...args) => {
    const result = await fn(...args)
    // await sleep(1000)
    refresh()
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

  const addTodo = withRefresh(async (listId, title) => {
    return await database.put({ completed: false, title, listId, type: 'todo', createdAt: new Date().toISOString() })
  })

  const toggle = withRefresh(async ({ completed, ...doc }) => {
    return await database.put({ completed: !completed, ...doc })
  })

  const destroy = withRefresh(async ({ _id }) => {
    return await database.del(_id)
  })

  const updateTitle = withRefresh(async (doc, title) => {
    doc.title = title
    return await database.put(doc)
  })

  const clearCompleted = withRefresh(async (listId) => {
    const todos = (await database.todosbyList.query({ range: [[listId, '0'], [listId, '9']] })).rows.map((row) => row.value)
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
    database,
    ready
  }
}
