import { useEffect, useState } from 'react'
// import { useProduceState } from '../hooks'

import { Fireproof, Index } from '../../../../'

const loadFixtures = async (database) => {
  console.log('loading fixtures', database.instanceId)
  const listTitles = ['My Todo List', 'Another Todo List']
  return Promise.all(listTitles.map(async (title) => {
    const ok = await database.put({ title, type: 'list' })
    console.log('list', ok.id, title, database.instanceId)
    return Promise.all([...Array(Math.ceil(Math.random() * 10))].map(async () =>
      await database.put({
        title: 'Todo ' + Math.random(),
        listId: ok.id,
        completed: Math.random() > 0.5,
        type: 'todo'
      })))
  }))
}

const defineDatabase = async () => {
  const database = await Fireproof.storage()
  database.allLists = new Index(database, function (doc, map) {
    if (doc.type === 'list') map(doc.type, doc)
  })
  database.todosbyList = new Index(database, function (doc, map) {
    if (doc.type === 'todo' && doc.listId) {
      map(doc.listId, doc)
    }
  })
  window.database = database
  return database
}

export default function useFireproof (options) {
  const [database, setDatabase] = useState(null)
  const [ready, setReady] = useState(false)
  const refresh = options.refresh || (() => {})

  useEffect(() => {
    const doSetup = async () => {
      const db = await defineDatabase()
      await loadFixtures(db)
      setDatabase(db)
      console.log('db docs', db.instanceId)
      // await sleep(1000)
      console.log('db docs', await db.changesSince())
      setReady(true)
    }
    doSetup()
  }, [])

  const withRefresh = (fn) => async (...args) => {
    const result = await fn(...args)
    refresh()
    return result
  }

  const fetchAllLists = async () => {
    console.log('fetchAllLists', database.instanceId)
    const lists = await database.allLists.query({ range: ['list', 'listx'] })
    console.log('lists', lists)
    return lists.rows.map((row) => row.value)
  }

  const fetchListWithTodos = async (_id) => {
    const list = await database.get(_id)
    const todos = await database.todosbyList.query({ range: [_id, _id + 'x'] })
    return { list, todos: todos.rows.map((row) => row.value) }
  }

  const addList = async (title) => {
    return await database.put({ title, type: 'list' })
  }

  const addTodo = withRefresh(async (listId, title) => {
    return await database.put({ completed: false, title, listId, type: 'todo' })
  })

  const toggle = withRefresh(async ({ completed, ...doc }) => {
    return await database.put({ completed: !completed, ...doc })
  })

  const destroy = withRefresh(async ({ _id }) => {
    return await database.del(_id)
  })

  const updateTitle = withRefresh(async (doc, title) => {
    console.log('updateTitle', doc, title)
    return await database.put({ title, ...doc })
  })

  const clearCompleted = async (listId) => {
    const todos = await database.todosbyList.get(listId)
    const todosToDelete = todos.filter((todo) => todo.completed)
    todosToDelete.forEach(async (todoToDelete) => {
      await database.del(todoToDelete._id)
    })
  }

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
    // client,
    ready
  }
}
