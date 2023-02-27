import { useEffect, useState } from 'react'
// import { useProduceState } from '../hooks'

import { Fireproof, Index } from '../../../../'

const sleep = ms => new Promise(r => setTimeout(r, ms))

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
      map(doc.listId, null)
    }
  })
  return database
}

export default function useFireproof () {
  const [database, setDatabase] = useState(null)
  const [ready, setReady] = useState(false)
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

  const fetchAllLists = async () => {
    console.log('fetchAllLists', database.instanceId)
    const lists = await database.allLists.query({ range: ['list', 'listx'] })
    console.log('lists', lists)
    return lists.rows.map((row) => row.value)
  }

  const fetchList = async (_id) => {
    console.log('list', _id, database.instanceId)
    const list = await database.get(_id)
    console.log('list', list, database.instanceId)
    const todos = await database.todosbyList.query({ range: [_id, _id + 'x'] })
    return { list, todos }
  }

  const addList = async (title) => {
    return await database.put({ title, type: 'list' })
  }

  const addTodo = async (listId) => async (title) => {
    return await database.put({ completed: false, title, listId, type: 'todo' })
  }

  const toggle = async ({ completed, ...doc }) => {
    return await database.put({ completed: !completed, ...doc })
  }
  const destroy = async (todo, _id) => {
    return await database.del(todo._id)
  }

  const save = async (title) => async (todoToSave) => {
    return await database.put({ title, ...todoToSave })
  }

  const clearCompleted = async (listId) => {
    const todos = await database.todosbyList.get(listId)
    const todosToDelete = todos.filter((todo) => todo.completed)
    todosToDelete.forEach(async (todoToDelete) => {
      await database.del(todoToDelete._id)
    })
  }

  return {
    fetchAllLists,
    fetchList,

    addList,
    addTodo,
    // toggleAll,
    // load,
    toggle,
    destroy,
    save,
    clearCompleted,
    // onAuthChange
    // isLoading
    // client,
    ready
  }
}
